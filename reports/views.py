from datetime import timedelta
import csv

from django.contrib import messages
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Count, Prefetch, Sum
from django.db.models.functions import TruncDate, TruncMonth
from django.core.paginator import Paginator
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils import timezone
from django.views.decorators.http import require_POST

from accounts.forms import ProfileImageForm, ProfileInfoForm
from .forms import (
    ReportForm,
    CommentForm,
    ReportAbuseForm,
    CommentAbuseForm,
    NotificationPreferencesForm,
    FundDonationForm,
    FundUsageForm,
)
from .models import (
    Report,
    Notification,
    Comment,
    ReportBookmark,
    ReportReaction,
    CommentReaction,
    ReportFollow,
    ReportAbuseReport,
    CommentAbuseReport,
    ReportStatusHistory,
    AuditLog,
    FundDonation,
    FundUsage,
)
from .realtime import broadcast_new_notification, broadcast_unread_count


ANON_DASHBOARD_CACHE_SECONDS = 30


def is_moderator(user):
    return user.is_authenticated and (getattr(user, "can_moderate", False) or user.is_superuser)


moderator_required = user_passes_test(is_moderator)


def log_action(actor, action, report=None, details=""):
    AuditLog.objects.create(actor=actor, action=action, report=report, details=details)


REACTION_META = {
    "like": {"emoji": "ðŸ‘", "label": "Like"},
    "love": {"emoji": "â¤ï¸", "label": "Love"},
    "angry": {"emoji": "ðŸ˜ ", "label": "Angry"},
    "dislike": {"emoji": "ðŸ‘Ž", "label": "Dislike"},
}
VALID_REACTION_TYPES = set(REACTION_META.keys())


def normalize_reaction_type(value):
    return value if value in VALID_REACTION_TYPES else "like"


def safe_redirect_back(request, fallback_name, **kwargs):
    fallback_url = reverse(fallback_name, kwargs=kwargs) if kwargs else reverse(fallback_name)
    referer = request.META.get("HTTP_REFERER", "")
    if referer and url_has_allowed_host_and_scheme(
        url=referer,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return redirect(referer)
    return redirect(fallback_url)


def apply_home_filters(queryset, params):
    title_query = params.get("title", "").strip()
    location_query = params.get("location", "").strip()
    selected_filter = params.get("filter", "newest")
    selected_category = params.get("category", "")
    selected_sort = params.get("sort", "newest")
    bookmarked_only = params.get("bookmarked") == "1"

    if title_query:
        queryset = queryset.filter(title__icontains=title_query)

    if location_query:
        queryset = queryset.filter(location__icontains=location_query)

    if selected_filter == "pending":
        queryset = queryset.filter(progress="submitted")
    elif selected_filter == "in_review":
        queryset = queryset.filter(progress="in_review")
    elif selected_filter == "in_progress":
        queryset = queryset.filter(progress="in_progress")
    elif selected_filter == "resolved":
        queryset = queryset.filter(progress="resolved")
    elif selected_filter == "attention":
        attention_cutoff = timezone.now() - timedelta(days=5)
        queryset = queryset.exclude(progress="resolved").filter(created_at__lte=attention_cutoff)

    if selected_category:
        queryset = queryset.filter(category=selected_category)

    if selected_sort == "oldest":
        queryset = queryset.order_by("created_at")
    else:
        queryset = queryset.order_by("-created_at")

    return queryset, {
        "title_query": title_query,
        "location_query": location_query,
        "selected_filter": selected_filter,
        "selected_category": selected_category,
        "selected_sort": selected_sort,
        "bookmarked_only": bookmarked_only,
    }


def build_home_dashboard_payload(request):
    user = request.user if request.user.is_authenticated else None
    comment_preview_queryset = Comment.objects.select_related("user").filter(parent__isnull=True)
    can_review_hidden = is_moderator(request.user)
    if not can_review_hidden:
        comment_preview_queryset = comment_preview_queryset.filter(is_hidden=False)

    base_queryset = (
        Report.objects.select_related("user", "assigned_to")
        .annotate(reaction_count=Count("reactions", distinct=True), comment_count=Count("comments", distinct=True))
        .prefetch_related(Prefetch("comments", queryset=comment_preview_queryset))
        .order_by("-created_at")
    )

    if not can_review_hidden:
        base_queryset = base_queryset.filter(is_hidden=False)

    reports_queryset, filter_state = apply_home_filters(base_queryset, request.GET)

    if filter_state["bookmarked_only"]:
        if user is None:
            reports_queryset = reports_queryset.none()
        else:
            bookmarked_report_ids = ReportBookmark.objects.filter(user=user).values_list("report_id", flat=True)
            reports_queryset = reports_queryset.filter(id__in=bookmarked_report_ids)

    paginator = Paginator(reports_queryset, 9)
    page_number = request.GET.get("page")
    reports = paginator.get_page(page_number)

    page_report_ids = [report.id for report in reports]
    if user is None:
        bookmarked_ids = set()
        reaction_by_report = {}
        followed_ids = set()
    else:
        bookmarked_ids = set(
            ReportBookmark.objects.filter(user=user, report_id__in=page_report_ids).values_list("report_id", flat=True)
        )
        reaction_by_report = dict(
            ReportReaction.objects.filter(user=user, report_id__in=page_report_ids).values_list("report_id", "reaction_type")
        )
        followed_ids = set(
            ReportFollow.objects.filter(user=user, report_id__in=page_report_ids).values_list("report_id", flat=True)
        )

    query_params = request.GET.copy()
    if "page" in query_params:
        query_params.pop("page")

    serialized_reports = []
    for report in reports:
        report_age_days = max((timezone.now() - report.created_at).days, 0)
        user_reaction_type = reaction_by_report.get(report.id, "")
        serialized_reports.append(
            {
                "id": report.id,
                "title": report.title,
                "description": report.description or "",
                "image_url": report.image.url if report.image else "",
                "progress": report.progress,
                "progress_label": report.get_progress_display(),
                "created_at": timezone.localtime(report.created_at).strftime("%b %d, %Y"),
                "age_days": report_age_days,
                "detail_url": reverse("report_detail", args=[report.pk]),
                "bookmark_url": reverse("toggle_bookmark", args=[report.pk]),
                "follow_url": reverse("toggle_follow", args=[report.pk]),
                "react_url": reverse("toggle_report_reaction", args=[report.pk]),
                "reaction_count": report.reaction_count,
                "user_reaction_type": user_reaction_type,
                "user_reaction_emoji": REACTION_META.get(user_reaction_type, {}).get("emoji", ""),
                "user_reaction_label": REACTION_META.get(user_reaction_type, {}).get("label", ""),
                "is_bookmarked": report.id in bookmarked_ids,
                "is_following": report.id in followed_ids,
                "user": {
                    "username": report.user.username,
                    "profile_image_url": report.user.profile_image.url if getattr(report.user, "profile_image", None) else "",
                    "initial": report.user.username[:1].upper() if report.user.username else "U",
                },
                "recent_comments": [
                    {
                        "username": comment.user.username,
                        "text": comment.text,
                    }
                    for comment in list(report.comments.all()[:2])
                ],
            }
        )

    return {
        "reports": serialized_reports,
        "viewer": {
            "is_authenticated": user is not None,
        },
        "filters": {
            "title_query": filter_state["title_query"],
            "location_query": filter_state["location_query"],
            "selected_filter": filter_state["selected_filter"],
            "selected_category": filter_state["selected_category"],
            "selected_sort": filter_state["selected_sort"],
            "bookmarked_only": filter_state["bookmarked_only"],
        },
        "pagination": {
            "page": reports.number,
            "num_pages": reports.paginator.num_pages,
            "has_previous": reports.has_previous(),
            "has_next": reports.has_next(),
            "previous_page": reports.previous_page_number() if reports.has_previous() else None,
            "next_page": reports.next_page_number() if reports.has_next() else None,
            "total_count": reports.paginator.count,
        },
        "filter_query": query_params.urlencode(),
        "summary": {
            "visible_reports": len(serialized_reports),
            "total_reports": reports.paginator.count,
            "bookmarked_only": filter_state["bookmarked_only"],
        },
    }


def build_resolved_reports_carousel(request, limit=5):
    can_review_hidden = is_moderator(request.user)
    category_display = dict(Report.CATEGORY_CHOICES)
    queryset = (
        Report.objects.select_related("user")
        .filter(progress="resolved", image__isnull=False)
        .exclude(image="")
        .order_by("-created_at")
    )
    if not can_review_hidden:
        queryset = queryset.filter(is_hidden=False)

    carousel_reports = []
    for report in queryset[:limit]:
        carousel_reports.append(
            {
                "id": report.pk,
                "title": report.title,
                "description": report.description or "No details were provided for this resolved report.",
                "category_label": category_display.get(report.category, str(report.category).title()),
                "location": report.location or "Location not specified",
                "created_at": timezone.localtime(report.created_at).strftime("%b %d, %Y"),
                "detail_url": reverse("report_detail", args=[report.pk]),
                "image_url": report.image.url if report.image else "",
                "submitted_by": report.user.username,
            }
        )

    return carousel_reports


def get_dashboard_payload(request):
    if request.user.is_authenticated:
        return build_home_dashboard_payload(request)

    cache_key = f"dashboard:payload:{request.get_full_path()}"
    payload = cache.get(cache_key)
    if payload is not None:
        return payload

    payload = build_home_dashboard_payload(request)
    cache.set(cache_key, payload, ANON_DASHBOARD_CACHE_SECONDS)
    return payload


def get_resolved_carousel_payload(request):
    if request.user.is_authenticated:
        return build_resolved_reports_carousel(request)

    cache_key = "dashboard:resolved-carousel"
    payload = cache.get(cache_key)
    if payload is not None:
        return payload

    payload = build_resolved_reports_carousel(request)
    cache.set(cache_key, payload, ANON_DASHBOARD_CACHE_SECONDS)
    return payload


def home(request):
    dashboard_payload = get_dashboard_payload(request)
    resolved_carousel_reports = get_resolved_carousel_payload(request)

    return render(
        request,
        "reports/home.html",
        {
            "react_initial": dashboard_payload,
            "resolved_carousel_reports": resolved_carousel_reports,
        },
    )


def dashboard_reports_api(request):
    return JsonResponse(get_dashboard_payload(request))


@login_required
def export_reports_csv(request):
    can_review_hidden = is_moderator(request.user)

    queryset = Report.objects.select_related("user", "assigned_to").annotate(
        reaction_count=Count("reactions", distinct=True),
        comment_count=Count("comments", distinct=True),
    )
    if not can_review_hidden:
        queryset = queryset.filter(is_hidden=False)

    queryset, filter_state = apply_home_filters(queryset, request.GET)
    if filter_state["bookmarked_only"]:
        bookmarked_report_ids = ReportBookmark.objects.filter(user=request.user).values_list("report_id", flat=True)
        queryset = queryset.filter(id__in=bookmarked_report_ids)

    response = HttpResponse(content_type="text/csv")
    timestamp = timezone.localtime().strftime("%Y%m%d-%H%M")
    response["Content-Disposition"] = f'attachment; filename="reports-export-{timestamp}.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "ID",
        "Title",
        "Category",
        "Progress",
        "Priority",
        "Submitted By",
        "Assigned To",
        "Created At",
        "Age (Days)",
        "Location",
        "Latitude",
        "Longitude",
        "Reactions",
        "Comments",
    ])

    for report in queryset:
        age_days = max((timezone.now() - report.created_at).days, 0)
        if report.progress == "resolved":
            priority = "Resolved"
        elif age_days >= 10:
            priority = "Critical"
        elif age_days >= 5:
            priority = "High"
        elif report.progress in {"submitted", "in_review"}:
            priority = "Medium"
        else:
            priority = "Normal"

        writer.writerow([
            report.id,
            report.title,
            report.get_category_display(),
            report.get_progress_display(),
            priority,
            report.user.username,
            report.assigned_to.username if report.assigned_to else "",
            timezone.localtime(report.created_at).strftime("%Y-%m-%d %H:%M"),
            age_days,
            report.location,
            report.latitude if report.latitude is not None else "",
            report.longitude if report.longitude is not None else "",
            report.reaction_count,
            report.comment_count,
        ])

    return response


@login_required
def submit_report(request):
    if request.method == "POST":
        form = ReportForm(request.POST, request.FILES)
        if form.is_valid():
            report = form.save(commit=False)
            report.user = request.user
            report.progress = "submitted"
            report.save()
            ReportStatusHistory.objects.create(
                report=report,
                changed_by=request.user,
                old_status="",
                new_status=report.progress,
                note="Initial submission",
            )
            log_action(request.user, "report_submitted", report, f"Report '{report.title}' submitted")

            user_model = get_user_model()
            recipients = user_model.objects.exclude(pk=request.user.pk)
            notifications = [
                Notification(
                    recipient=recipient,
                    report=report,
                    message=f'{request.user.username} submitted a new report: "{report.title}"',
                )
                for recipient in recipients
            ]
            if notifications:
                Notification.objects.bulk_create(notifications, batch_size=100)
                for notification in notifications:
                    broadcast_new_notification(notification)

            messages.success(request, "Report submitted successfully.")
            return redirect("home")
    else:
        form = ReportForm()
    return render(
        request,
        "reports/submit.html",
        {
            "form": form,
            "form_title": "Submit Report",
            "submit_label": "Submit Report",
        },
    )


@login_required
def report_detail(request, pk):
    can_moderate = is_moderator(request.user)
    report = get_object_or_404(Report.objects.select_related("user"), pk=pk)
    reporter_display_name = (report.user.get_full_name() or "").strip() or report.user.username or "Unknown user"

    if report.is_hidden and not can_moderate and report.user.pk != request.user.pk:
        messages.error(request, "This report is hidden by moderation.")
        return redirect("home")

    updated_notifications = Notification.objects.filter(recipient=request.user, report=report, is_read=False).update(is_read=True)
    if updated_notifications:
        broadcast_unread_count(request.user.id)

    if request.method == "POST":
        comment_form = CommentForm(request.POST)
        if comment_form.is_valid():
            comment = comment_form.save(commit=False)
            comment.report = report
            comment.user = request.user
            comment.save()
            log_action(request.user, "comment_added", report, f"Comment #{comment.id} added")
            return redirect("report_detail", pk=report.pk)
    else:
        comment_form = CommentForm()

    comments = Comment.objects.filter(report=report, parent__isnull=True).select_related("user")
    if not can_moderate:
        comments = comments.filter(is_hidden=False)

    replies_queryset = Comment.objects.select_related("user").order_by("created_at")
    if not can_moderate:
        replies_queryset = replies_queryset.filter(is_hidden=False)
    comments = comments.prefetch_related(Prefetch("replies", queryset=replies_queryset))

    history = ReportStatusHistory.objects.filter(report=report).select_related("changed_by")[:10]

    report_reaction_type = (
        ReportReaction.objects.filter(user=request.user, report=report).values_list("reaction_type", flat=True).first() or ""
    )
    report_followed = ReportFollow.objects.filter(user=request.user, report=report).exists()
    report_bookmarked = ReportBookmark.objects.filter(user=request.user, report=report).exists()

    comment_user_reactions = dict(
        CommentReaction.objects.filter(user=request.user, comment__report=report).values_list("comment_id", "reaction_type")
    )
    comment_reaction_counts = {
        item["comment_id"]: item["total"]
        for item in CommentReaction.objects.filter(comment__report=report)
        .values("comment_id")
        .annotate(total=Count("id"))
    }

    for comment in comments:
        comment_pk = comment.pk
        setattr(comment, "reaction_count", comment_reaction_counts.get(comment_pk, 0))
        setattr(comment, "user_reaction_type", comment_user_reactions.get(comment_pk, ""))
        current_comment_reaction_type = getattr(comment, "user_reaction_type", "")
        setattr(comment, "user_reaction_emoji", REACTION_META.get(current_comment_reaction_type, {}).get("emoji", ""))
        setattr(comment, "user_reaction_label", REACTION_META.get(current_comment_reaction_type, {}).get("label", ""))

        for reply in getattr(comment, "replies").all():
            reply_pk = reply.pk
            setattr(reply, "reaction_count", comment_reaction_counts.get(reply_pk, 0))
            setattr(reply, "user_reaction_type", comment_user_reactions.get(reply_pk, ""))
            current_reply_reaction_type = getattr(reply, "user_reaction_type", "")
            setattr(reply, "user_reaction_emoji", REACTION_META.get(current_reply_reaction_type, {}).get("emoji", ""))
            setattr(reply, "user_reaction_label", REACTION_META.get(current_reply_reaction_type, {}).get("label", ""))

    return render(
        request,
        "reports/detail.html",
        {
            "report": report,
            "reporter_display_name": reporter_display_name,
            "is_owner": request.user == report.user,
            "comments": comments,
            "comment_form": comment_form,
            "history": history,
            "report_reaction_type": report_reaction_type,
            "report_reaction_emoji": REACTION_META.get(report_reaction_type, {}).get("emoji", ""),
            "report_reaction_label": REACTION_META.get(report_reaction_type, {}).get("label", ""),
            "report_followed": report_followed,
            "report_bookmarked": report_bookmarked,
            "report_reaction_count": ReportReaction.objects.filter(report=report).count(),
            "comment_reaction_counts": comment_reaction_counts,
            "report_abuse_form": ReportAbuseForm(),
            "comment_abuse_form": CommentAbuseForm(),
            "can_moderate": can_moderate,
        },
    )


@login_required
def profile(request):
    info_form = ProfileInfoForm(instance=request.user)

    if request.method == "POST":
        profile_action = request.POST.get("profile_action")
        if profile_action == "account_info":
            info_form = ProfileInfoForm(request.POST, instance=request.user)
            profile_form = ProfileImageForm(instance=request.user)
            if info_form.is_valid():
                info_form.save()
                messages.success(request, "Profile information updated.")
                return redirect("profile")
        else:
            profile_form = ProfileImageForm(request.POST, request.FILES, instance=request.user)
            if profile_form.is_valid():
                profile_form.save()
                messages.success(request, "Profile photo updated.")
                return redirect("profile")
    else:
        profile_form = ProfileImageForm(instance=request.user)

    reports = Report.objects.filter(user=request.user)

    recent_reports = reports.annotate(
        reaction_count=Count("reactions", distinct=True),
        comment_count=Count("comments", distinct=True),
    ).order_by("-created_at")[:5]

    react_initial = {
        "links": {
            "my_reports_url": reverse("my_reports"),
            "settings_url": reverse("settings"),
            "profile_url": reverse("profile"),
        },
        "account": {
            "full_name": request.user.get_full_name() or request.user.username,
            "username": request.user.username,
            "email": request.user.email or "Not provided",
            "role": request.user.get_role_display(),
            "phone_number": request.user.phone_number or "Not provided",
            "national_id": request.user.national_id or "Not provided",
            "date_joined": request.user.date_joined.strftime("%b %d, %Y"),
            "form": {
                "first_name": info_form["first_name"].value() or "",
                "last_name": info_form["last_name"].value() or "",
                "email": info_form["email"].value() or "",
                "phone_number": info_form["phone_number"].value() or "",
                "national_id": info_form["national_id"].value() or "",
                "errors": {
                    "first_name": [str(error) for error in info_form.errors.get("first_name", [])],
                    "last_name": [str(error) for error in info_form.errors.get("last_name", [])],
                    "email": [str(error) for error in info_form.errors.get("email", [])],
                    "phone_number": [str(error) for error in info_form.errors.get("phone_number", [])],
                    "national_id": [str(error) for error in info_form.errors.get("national_id", [])],
                },
            },
        },
        "photo": {
            "has_profile_image": bool(request.user.profile_image),
            "profile_image_url": request.user.profile_image.url if request.user.profile_image else "",
            "username": request.user.username,
            "initial": (request.user.username[:1] or "U").upper(),
            "errors": [str(error) for error in profile_form.errors.get("profile_image", [])],
        },
        "recent_reports": [
            {
                "id": report.pk,
                "title": report.title,
                "created_at": report.created_at.strftime("%b %d, %Y"),
                "progress": report.progress,
                "progress_label": getattr(report, "get_progress_display", lambda: report.progress)(),
                "comment_count": int(getattr(report, "comment_count", 0)),
                "reaction_count": int(getattr(report, "reaction_count", 0)),
                "detail_url": reverse("report_detail", args=[report.pk]),
            }
            for report in recent_reports
        ],
    }

    return render(
        request,
        "reports/profile.html",
        {
            "profile_form": profile_form,
            "recent_reports": recent_reports,
            "react_initial": react_initial,
        },
    )


@login_required
def my_reports(request):
    reports = Report.objects.filter(user=request.user).annotate(
        reaction_count=Count("reactions", distinct=True),
        comment_count=Count("comments", distinct=True),
    ).order_by("-created_at")
    my_total = reports.count()
    my_resolved = reports.filter(progress="resolved").count()
    my_open = my_total - my_resolved
    my_bookmarks = ReportBookmark.objects.filter(user=request.user).count()

    return render(
        request,
        "reports/my_reports.html",
        {
            "reports": reports,
            "my_total": my_total,
            "my_resolved": my_resolved,
            "my_open": my_open,
            "my_bookmarks": my_bookmarks,
        },
    )


@login_required
def report_update(request, pk):
    report = get_object_or_404(Report, pk=pk)

    if report.user.pk != request.user.pk and not is_moderator(request.user):
        messages.error(request, "You do not have permission to edit this report.")
        return redirect("report_detail", pk=report.pk)

    old_status = report.progress

    if request.method == "POST":
        form = ReportForm(request.POST, request.FILES, instance=report)
        if form.is_valid():
            form.save()
            if old_status != report.progress:
                ReportStatusHistory.objects.create(
                    report=report,
                    changed_by=request.user,
                    old_status=old_status,
                    new_status=report.progress,
                    note="Status updated",
                )
                follower_ids = ReportFollow.objects.filter(report=report).values_list("user_id", flat=True)
                notifications = [
                    Notification(
                        recipient_id=user_id,
                        report=report,
                        message=f'Status changed for "{report.title}": {old_status} -> {report.progress}',
                    )
                    for user_id in follower_ids
                    if user_id != request.user.id
                ]
                if notifications:
                    Notification.objects.bulk_create(notifications, batch_size=100)
                    for notification in notifications:
                        broadcast_new_notification(notification)

            log_action(request.user, "report_updated", report, f"Report #{report.pk} updated")
            messages.success(request, "Report updated successfully.")
            return redirect("my_reports")
    else:
        form = ReportForm(instance=report)

    return render(
        request,
        "reports/submit.html",
        {
            "form": form,
            "form_title": "Edit Report",
            "submit_label": "Save Changes",
        },
    )


@login_required
def report_delete(request, pk):
    report = get_object_or_404(Report, pk=pk)

    if report.user.pk != request.user.pk and not is_moderator(request.user):
        messages.error(request, "You do not have permission to delete this report.")
        return redirect("report_detail", pk=report.pk)

    if request.method == "POST":
        log_action(request.user, "report_deleted", report, f"Report #{report.pk} deleted")
        report.delete()
        messages.success(request, "Report deleted.")
        return redirect("my_reports")

    return render(request, "reports/delete_confirm.html", {"report": report})


@login_required
def notifications(request):
    user_notifications = Notification.objects.filter(recipient=request.user).select_related("report", "report__user")
    paginator = Paginator(user_notifications, 15)
    page_number = request.GET.get("page")
    notifications_page = paginator.get_page(page_number)
    return render(request, "reports/notifications.html", {"notifications": notifications_page})


@login_required
def account_settings(request):
    session_key = "notification_preferences"
    saved_preferences = request.session.get(session_key, {})

    notification_initial = {
        "browser_notifications": saved_preferences.get("browser_notifications", True),
        "email_notifications": saved_preferences.get("email_notifications", False),
        "weekly_digest": saved_preferences.get("weekly_digest", False),
        "unread_polling_seconds": saved_preferences.get("unread_polling_seconds", "15"),
    }

    if request.method == "POST":
        notification_form = NotificationPreferencesForm(request.POST)
        if notification_form.is_valid():
            request.session[session_key] = {
                "browser_notifications": notification_form.cleaned_data["browser_notifications"],
                "email_notifications": notification_form.cleaned_data["email_notifications"],
                "weekly_digest": notification_form.cleaned_data["weekly_digest"],
                "unread_polling_seconds": notification_form.cleaned_data["unread_polling_seconds"],
            }
            request.session.modified = True
            messages.success(request, "Network preferences saved.")
            return redirect("settings")
    else:
        notification_form = NotificationPreferencesForm(initial=notification_initial)

    return render(
        request,
        "reports/settings.html",
        {
            "notification_form": notification_form,
        },
    )


@login_required
@require_POST
def mark_notifications_read(request):
    updated = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
    if updated:
        broadcast_unread_count(request.user.id)
    messages.success(request, "Notifications marked as read.")
    return safe_redirect_back(request, "notifications")


@login_required
@require_POST
def toggle_bookmark(request, pk):
    report = get_object_or_404(Report, pk=pk)
    bookmark, created = ReportBookmark.objects.get_or_create(user=request.user, report=report)
    if not created:
        bookmark.delete()
        messages.info(request, "Bookmark removed.")
    else:
        messages.success(request, "Report bookmarked.")
    return safe_redirect_back(request, "home")


@login_required
@require_POST
def toggle_follow(request, pk):
    report = get_object_or_404(Report, pk=pk)
    follow, created = ReportFollow.objects.get_or_create(user=request.user, report=report)
    if not created:
        follow.delete()
        messages.info(request, "Unfollowed report.")
    else:
        messages.success(request, "Now following report updates.")
    return safe_redirect_back(request, "report_detail", pk=report.pk)


@login_required
@require_POST
def toggle_report_reaction(request, pk):
    report = get_object_or_404(Report, pk=pk)
    selected_reaction = normalize_reaction_type(request.POST.get("reaction", "like"))
    reaction = ReportReaction.objects.filter(user=request.user, report=report).first()
    if reaction and reaction.reaction_type == selected_reaction:
        reaction.delete()
        new_reaction_type = ""
    elif reaction:
        reaction.reaction_type = selected_reaction
        reaction.save(update_fields=["reaction_type"])
        new_reaction_type = selected_reaction
    else:
        ReportReaction.objects.create(user=request.user, report=report, reaction_type=selected_reaction)
        new_reaction_type = selected_reaction
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        new_count = ReportReaction.objects.filter(report=report).count()
        return JsonResponse({"ok": True, "reaction_type": new_reaction_type, "reaction_count": new_count})
    return safe_redirect_back(request, "home")


@login_required
@require_POST
def toggle_comment_reaction(request, pk):
    comment = get_object_or_404(Comment, pk=pk)
    selected_reaction = normalize_reaction_type(request.POST.get("reaction", "like"))
    reaction = CommentReaction.objects.filter(user=request.user, comment=comment).first()
    if reaction and reaction.reaction_type == selected_reaction:
        reaction.delete()
    elif reaction:
        reaction.reaction_type = selected_reaction
        reaction.save(update_fields=["reaction_type"])
    else:
        CommentReaction.objects.create(user=request.user, comment=comment, reaction_type=selected_reaction)

    return safe_redirect_back(request, "report_detail", pk=comment.report.pk)


@login_required
@require_POST
def comment_edit(request, pk):
    comment = get_object_or_404(Comment, pk=pk)
    if comment.user.pk != request.user.pk and not is_moderator(request.user):
        messages.error(request, "You cannot edit this comment.")
        return redirect("report_detail", pk=comment.report.pk)

    if request.method == "POST":
        form = CommentForm(request.POST, instance=comment)
        if form.is_valid():
            updated = form.save(commit=False)
            updated.parent = comment.parent
            updated.report = comment.report
            updated.user = comment.user
            updated.save()
            log_action(request.user, "comment_edited", comment.report, f"Comment #{comment.pk} edited")
            messages.success(request, "Comment updated.")
    return redirect("report_detail", pk=comment.report.pk)


@login_required
@require_POST
def comment_delete(request, pk):
    comment = get_object_or_404(Comment, pk=pk)
    report_id = comment.report.pk
    if comment.user.pk != request.user.pk and not is_moderator(request.user):
        messages.error(request, "You cannot delete this comment.")
        return redirect("report_detail", pk=report_id)

    comment.delete()
    log_action(request.user, "comment_deleted", None, f"Comment #{pk} deleted")
    messages.success(request, "Comment deleted.")
    return redirect("report_detail", pk=report_id)


@login_required
@require_POST
def report_abuse(request, pk):
    report = get_object_or_404(Report, pk=pk)
    form = ReportAbuseForm(request.POST)
    if form.is_valid():
        abuse = form.save(commit=False)
        abuse.report = report
        abuse.reported_by = request.user
        abuse.save()
        messages.success(request, "Report submitted to moderation queue.")
    else:
        messages.error(request, f"Could not submit abuse report: {form.errors.as_text()}")
    return redirect("report_detail", pk=pk)


@login_required
@require_POST
def comment_abuse(request, pk):
    comment = get_object_or_404(Comment, pk=pk)
    form = CommentAbuseForm(request.POST)
    if form.is_valid():
        abuse = form.save(commit=False)
        abuse.comment = comment
        abuse.reported_by = request.user
        abuse.save()
        messages.success(request, "Comment submitted to moderation queue.")
    else:
        messages.error(request, f"Could not submit comment abuse report: {form.errors.as_text()}")
    return redirect("report_detail", pk=comment.report.pk)


@login_required
@moderator_required
def moderation_queue(request):
    pending_report_abuse = ReportAbuseReport.objects.filter(status="pending").select_related("report", "reported_by")
    pending_comment_abuse = CommentAbuseReport.objects.filter(status="pending").select_related("comment", "reported_by")
    hidden_reports = Report.objects.filter(is_hidden=True).select_related("user")
    hidden_comments = Comment.objects.filter(is_hidden=True).select_related("user", "report")
    moderators = get_user_model().objects.filter(role__in=["moderator", "admin"])
    reports_for_review = Report.objects.select_related("user", "assigned_to").order_by("-created_at")[:20]

    progress_label_map = dict(Report.PROGRESS_CHOICES)
    react_initial = {
        "status_choices": [
            {
                "value": value,
                "label": label,
            }
            for value, label in Report.PROGRESS_CHOICES
        ],
        "moderators": [
            {
                "id": int(getattr(moderator, "pk", 0)),
                "username": getattr(moderator, "username", ""),
                "role": getattr(moderator, "get_role_display", lambda: "Moderator")(),
            }
            for moderator in moderators
        ],
        "pending_report_abuse": [
            {
                "id": int(getattr(item, "pk", 0)),
                "reason": item.reason,
                "reported_by": item.reported_by.username,
                "created_at": timezone.localtime(item.created_at).strftime("%b %d, %Y %I:%M %p"),
                "report": {
                    "id": item.report.pk if item.report else None,
                    "title": item.report.title if item.report else "Unknown report",
                    "progress": item.report.progress if item.report else "submitted",
                    "progress_label": progress_label_map.get(item.report.progress, "Submitted") if item.report else "Submitted",
                    "detail_url": reverse("report_detail", args=[item.report.pk]) if item.report else "",
                },
            }
            for item in pending_report_abuse
        ],
        "pending_comment_abuse": [
            {
                "id": int(getattr(item, "pk", 0)),
                "reason": item.reason,
                "reported_by": item.reported_by.username,
                "created_at": timezone.localtime(item.created_at).strftime("%b %d, %Y %I:%M %p"),
                "comment": {
                    "id": item.comment.pk if item.comment else None,
                    "text": item.comment.text if item.comment else "",
                    "author": item.comment.user.username if item.comment and item.comment.user else "Unknown",
                    "report_id": item.comment.report.pk if item.comment and item.comment.report else None,
                    "report_title": item.comment.report.title if item.comment and item.comment.report else "Unknown report",
                    "detail_url": reverse("report_detail", args=[item.comment.report.pk]) if item.comment and item.comment.report else "",
                },
            }
            for item in pending_comment_abuse
        ],
        "reports_for_review": [
            {
                "id": report.pk,
                "title": report.title,
                "created_at": timezone.localtime(report.created_at).strftime("%b %d, %Y %I:%M %p"),
                "is_hidden": report.is_hidden,
                "progress": report.progress,
                "progress_label": getattr(report, "get_progress_display", lambda: report.progress)(),
                "author": report.user.username,
                "assigned_to_id": report.assigned_to.pk if report.assigned_to else None,
                "assigned_to_username": report.assigned_to.username if report.assigned_to else "",
                "detail_url": reverse("report_detail", args=[report.pk]),
            }
            for report in reports_for_review
        ],
        "hidden_comments": [
            {
                "id": comment.pk,
                "text": comment.text,
                "created_at": timezone.localtime(comment.created_at).strftime("%b %d, %Y %I:%M %p"),
                "author": comment.user.username if comment.user else "Unknown",
                "report_id": comment.report.pk if comment.report else None,
                "report_title": comment.report.title if comment.report else "Unknown report",
                "detail_url": reverse("report_detail", args=[comment.report.pk]) if comment.report else "",
            }
            for comment in hidden_comments
        ],
    }

    return render(
        request,
        "reports/moderation_queue.html",
        {
            "pending_report_abuse": pending_report_abuse,
            "pending_comment_abuse": pending_comment_abuse,
            "hidden_reports": hidden_reports,
            "hidden_comments": hidden_comments,
            "moderators": moderators,
            "reports_for_review": reports_for_review,
            "react_initial": react_initial,
        },
    )


@login_required
@moderator_required
@require_POST
def moderation_report_action(request, pk):
    report = get_object_or_404(Report, pk=pk)
    action = request.POST.get("action", "")

    if action == "hide":
        report.is_hidden = True
        report.save(update_fields=["is_hidden"])
        log_action(request.user, "report_hidden", report, "Hidden by moderator")
    elif action == "unhide":
        report.is_hidden = False
        report.save(update_fields=["is_hidden"])
        log_action(request.user, "report_unhidden", report, "Unhidden by moderator")
    elif action == "assign":
        assigned_to_id = request.POST.get("assigned_to")
        assigned_user = None
        if assigned_to_id:
            assigned_user = get_user_model().objects.filter(pk=assigned_to_id).first()
        report.assigned_to = assigned_user
        report.save(update_fields=["assigned_to"])
        log_action(request.user, "report_assigned", report, f"Assigned to {assigned_to_id}")
    elif action == "status":
        new_status = request.POST.get("new_status")
        if new_status and new_status in dict(Report.PROGRESS_CHOICES):
            old_status = report.progress
            if old_status != new_status:
                report.progress = new_status
                report.save(update_fields=["progress"])
                ReportStatusHistory.objects.create(
                    report=report,
                    changed_by=request.user,
                    old_status=old_status,
                    new_status=new_status,
                    note="Updated from moderation queue",
                )
                log_action(request.user, "report_status_changed", report, f"{old_status} -> {new_status}")

    messages.success(request, "Moderation action applied.")
    return redirect("moderation_queue")


@login_required
@moderator_required
@require_POST
def moderation_comment_action(request, pk):
    comment = get_object_or_404(Comment, pk=pk)
    action = request.POST.get("action", "")

    if action == "hide":
        comment.is_hidden = True
        comment.save(update_fields=["is_hidden"])
        log_action(request.user, "comment_hidden", comment.report, f"Comment #{comment.pk}")
    elif action == "unhide":
        comment.is_hidden = False
        comment.save(update_fields=["is_hidden"])
        log_action(request.user, "comment_unhidden", comment.report, f"Comment #{comment.pk}")

    messages.success(request, "Comment moderation updated.")
    return redirect("moderation_queue")


@login_required
@moderator_required
@require_POST
def abuse_status_update(request, abuse_type, pk):
    status = request.POST.get("status", "reviewed")
    if status not in {"pending", "reviewed", "dismissed"}:
        status = "reviewed"

    if abuse_type == "report":
        abuse = get_object_or_404(ReportAbuseReport, pk=pk)
        abuse.status = status
        abuse.save(update_fields=["status"])
    else:
        abuse = get_object_or_404(CommentAbuseReport, pk=pk)
        abuse.status = status
        abuse.save(update_fields=["status"])

    messages.success(request, "Abuse report status updated.")
    return redirect("moderation_queue")


@login_required
def analytics_dashboard(request):
    base_queryset = Report.objects.all()
    if not is_moderator(request.user):
        base_queryset = base_queryset.filter(user=request.user)

    selected_range = request.GET.get("range", "all")
    if selected_range not in {"all", "7d", "30d", "year"}:
        selected_range = "all"

    now = timezone.now()
    if selected_range == "7d":
        queryset = base_queryset.filter(created_at__gte=now - timedelta(days=7))
    elif selected_range == "30d":
        queryset = base_queryset.filter(created_at__gte=now - timedelta(days=30))
    elif selected_range == "year":
        queryset = base_queryset.filter(created_at__gte=now - timedelta(days=365))
    else:
        queryset = base_queryset

    range_label_map = {
        "all": "All Time",
        "7d": "Last 7 Days",
        "30d": "Last 30 Days",
        "year": "Last 12 Months",
    }

    total_reports = queryset.count()
    resolved_reports = queryset.filter(progress="resolved").count()
    in_progress_reports = queryset.filter(progress="in_progress").count()
    pending_reports = queryset.filter(progress__in=["submitted", "in_review"]).count()

    by_category = list(queryset.values("category").annotate(total=Count("id")).order_by("-total"))
    category_display = dict(Report.CATEGORY_CHOICES)
    category_labels = [category_display.get(item["category"], item["category"].title()) for item in by_category]
    category_values = [item["total"] for item in by_category]
    by_category_rows = [
        {
            "label": category_display.get(item["category"], item["category"].title()),
            "total": item["total"],
        }
        for item in by_category
    ]

    status_display = dict(Report.PROGRESS_CHOICES)
    status_labels = [status_display[key] for key, _ in Report.PROGRESS_CHOICES]
    status_values_map = {
        item["progress"]: item["total"]
        for item in queryset.values("progress").annotate(total=Count("id"))
    }
    status_values = [status_values_map.get(key, 0) for key, _ in Report.PROGRESS_CHOICES]

    if selected_range in {"7d", "30d"}:
        trend_reports = (
            queryset.annotate(period=TruncDate("created_at"))
            .values("period")
            .annotate(total=Count("id"))
            .order_by("period")
        )
        trend_labels = [item["period"].strftime("%d %b") for item in trend_reports if item["period"]]
        trend_values = [item["total"] for item in trend_reports if item["period"]]
        trend_heading = "Daily Submission Trend"
    else:
        trend_reports = (
            queryset.annotate(period=TruncMonth("created_at"))
            .values("period")
            .annotate(total=Count("id"))
            .order_by("period")
        )
        trend_labels = [item["period"].strftime("%b %Y") for item in trend_reports if item["period"]]
        trend_values = [item["total"] for item in trend_reports if item["period"]]
        trend_heading = "Monthly Submission Trend"

    resolved_timeline = ReportStatusHistory.objects.filter(
        report__in=queryset,
        new_status="resolved",
    ).select_related("report")
    average_resolution_hours = None
    if resolved_timeline.exists():
        deltas = []
        for item in resolved_timeline:
            if item.report and item.report.created_at:
                deltas.append((item.created_at - item.report.created_at).total_seconds() / 3600)
        if deltas:
            average_resolution_hours = round(sum(deltas) / len(deltas), 2)

    resolved_rate = round((resolved_reports / total_reports) * 100, 1) if total_reports else 0

    return render(
        request,
        "reports/analytics.html",
        {
            "total_reports": total_reports,
            "resolved_reports": resolved_reports,
            "in_progress_reports": in_progress_reports,
            "pending_reports": pending_reports,
            "by_category": by_category,
            "average_resolution_hours": average_resolution_hours,
            "resolved_rate": resolved_rate,
            "by_category_rows": by_category_rows,
            "category_labels": category_labels,
            "category_values": category_values,
            "status_labels": status_labels,
            "status_values": status_values,
            "trend_labels": trend_labels,
            "trend_values": trend_values,
            "trend_heading": trend_heading,
            "selected_range": selected_range,
            "selected_range_label": range_label_map[selected_range],
            "react_initial": {
                "total_reports": total_reports,
                "open_cases": pending_reports + in_progress_reports,
                "resolved_reports": resolved_reports,
                "resolved_rate": resolved_rate,
                "average_resolution_hours": average_resolution_hours,
                "by_category_rows": by_category_rows,
                "status_labels": status_labels,
                "status_values": status_values,
                "trend_labels": trend_labels,
                "trend_values": trend_values,
                "trend_heading": trend_heading,
                "selected_range": selected_range,
                "selected_range_label": range_label_map[selected_range],
            },
        },
    )


@login_required
def unread_notifications_api(request):
    count = Notification.objects.filter(recipient=request.user, is_read=False).count()
    return JsonResponse({"unread_count": count})


@login_required
def notifications_list_api(request):
    if request.method == "POST":
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        broadcast_unread_count(request.user.id)
        return JsonResponse({"ok": True})
    notifs = (
        Notification.objects
        .filter(recipient=request.user)
        .select_related("report")
        .order_by("-created_at")[:50]
    )
    data = [
        {
            "id": n.pk,
            "message": n.message,
            "is_read": n.is_read,
            "created_at": n.created_at.strftime("%b %d, %Y %I:%M %p"),
            "report_pk": n.report.pk if n.report else None,
        }
        for n in notifs
    ]
    return JsonResponse({"notifications": data})


@login_required
def analytics_api(request):
    base_queryset = Report.objects.all()
    if not is_moderator(request.user):
        base_queryset = base_queryset.filter(user=request.user)

    selected_range = request.GET.get("range", "all")
    if selected_range not in {"all", "7d", "30d", "year"}:
        selected_range = "all"

    now = timezone.now()
    if selected_range == "7d":
        queryset = base_queryset.filter(created_at__gte=now - timedelta(days=7))
    elif selected_range == "30d":
        queryset = base_queryset.filter(created_at__gte=now - timedelta(days=30))
    elif selected_range == "year":
        queryset = base_queryset.filter(created_at__gte=now - timedelta(days=365))
    else:
        queryset = base_queryset

    total_reports = queryset.count()
    resolved_reports = queryset.filter(progress="resolved").count()
    in_progress_reports = queryset.filter(progress="in_progress").count()
    pending_reports = queryset.filter(progress__in=["submitted", "in_review"]).count()
    resolved_rate = round((resolved_reports / total_reports) * 100, 1) if total_reports else 0

    by_category = list(queryset.values("category").annotate(total=Count("id")).order_by("-total"))
    category_display = dict(Report.CATEGORY_CHOICES)
    by_category_rows = [
        {"label": category_display.get(item["category"], item["category"].title()), "total": item["total"]}
        for item in by_category
    ]

    status_display = dict(Report.PROGRESS_CHOICES)
    status_labels = [status_display[key] for key, _ in Report.PROGRESS_CHOICES]
    status_values_map = {
        item["progress"]: item["total"]
        for item in queryset.values("progress").annotate(total=Count("id"))
    }
    status_values = [status_values_map.get(key, 0) for key, _ in Report.PROGRESS_CHOICES]

    if selected_range in {"7d", "30d"}:
        trend_reports = (
            queryset.annotate(period=TruncDate("created_at"))
            .values("period").annotate(total=Count("id")).order_by("period")
        )
        trend_labels = [item["period"].strftime("%d %b") for item in trend_reports if item["period"]]
        trend_values = [item["total"] for item in trend_reports if item["period"]]
        trend_heading = "Daily Submission Trend"
    else:
        trend_reports = (
            queryset.annotate(period=TruncMonth("created_at"))
            .values("period").annotate(total=Count("id")).order_by("period")
        )
        trend_labels = [item["period"].strftime("%b %Y") for item in trend_reports if item["period"]]
        trend_values = [item["total"] for item in trend_reports if item["period"]]
        trend_heading = "Monthly Submission Trend"

    resolved_timeline = ReportStatusHistory.objects.filter(
        report__in=queryset, new_status="resolved"
    ).select_related("report")
    average_resolution_hours = None
    if resolved_timeline.exists():
        deltas = []
        for item in resolved_timeline:
            if item.report and item.report.created_at:
                deltas.append((item.created_at - item.report.created_at).total_seconds() / 3600)
        if deltas:
            average_resolution_hours = round(sum(deltas) / len(deltas), 2)

    range_label_map = {"all": "All Time", "7d": "Last 7 Days", "30d": "Last 30 Days", "year": "Last 12 Months"}
    return JsonResponse({
        "total_reports": total_reports,
        "resolved_reports": resolved_reports,
        "open_cases": pending_reports + in_progress_reports,
        "resolved_rate": resolved_rate,
        "average_resolution_hours": average_resolution_hours,
        "by_category_rows": by_category_rows,
        "status_labels": status_labels,
        "status_values": status_values,
        "trend_labels": trend_labels,
        "trend_values": trend_values,
        "trend_heading": trend_heading,
        "selected_range": selected_range,
        "selected_range_label": range_label_map[selected_range],
    })


@login_required
def community_fund(request):
    donation_form = FundDonationForm(prefix="donate")
    usage_form = FundUsageForm(prefix="usage")

    if request.method == "POST":
        action = request.POST.get("action")

        if action == "donate":
            donation_form = FundDonationForm(request.POST, prefix="donate")
            if donation_form.is_valid():
                donation = donation_form.save(commit=False)
                donation.user = request.user
                donation.save()
                messages.success(request, "Thank you for donating to the community fund.")
                return redirect("community_fund")

        elif action == "usage":
            if not is_moderator(request.user):
                messages.error(request, "Only moderators can record fund usage.")
                return redirect("community_fund")

            usage_form = FundUsageForm(request.POST, prefix="usage")
            if usage_form.is_valid():
                total_raised = FundDonation.objects.aggregate(total=Sum("amount")).get("total") or 0
                total_used = FundUsage.objects.aggregate(total=Sum("amount")).get("total") or 0
                new_usage = usage_form.cleaned_data["amount"]

                if new_usage > (total_raised - total_used):
                    usage_form.add_error("amount", "Usage amount cannot exceed available fund balance.")
                else:
                    usage = usage_form.save(commit=False)
                    usage.used_by = request.user
                    usage.save()
                    messages.success(request, "Fund usage entry added.")
                    return redirect("community_fund")

    total_raised = FundDonation.objects.aggregate(total=Sum("amount")).get("total") or 0
    total_used = FundUsage.objects.aggregate(total=Sum("amount")).get("total") or 0
    available_balance = total_raised - total_used

    top_donors = list(
        FundDonation.objects.values("user_id", "user__username")
        .annotate(donation_times=Count("id"), total_amount=Sum("amount"))
        .order_by("-donation_times", "-total_amount", "user__username")[:3]
    )
    top_donor_badges = {
        item["user_id"]: f"Top Donor #{index}"
        for index, item in enumerate(top_donors, start=1)
    }

    donations = list(FundDonation.objects.select_related("user")[:20])
    for donation in donations:
        donation.top_donor_badge = top_donor_badges.get(donation.user_id, "")

    usage_entries = FundUsage.objects.select_related("used_by")[:20]

    return render(
        request,
        "reports/community_fund.html",
        {
            "donation_form": donation_form,
            "usage_form": usage_form,
            "total_raised": total_raised,
            "total_used": total_used,
            "available_balance": available_balance,
            "donations": donations,
            "top_donors": top_donors,
            "usage_entries": usage_entries,
            "can_manage_usage": is_moderator(request.user),
        },
    )
