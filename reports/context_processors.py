from .models import Notification, ReportAbuseReport, CommentAbuseReport


def global_notifications(request):
    if not request.user.is_authenticated:
        return {
            "recent_notifications": [],
            "unread_notifications_count": 0,
            "moderation_pending_count": 0,
        }

    notifications = Notification.objects.filter(recipient=request.user).select_related("report", "report__user")
    moderation_pending_count = 0
    if getattr(request.user, "can_moderate", False) or getattr(request.user, "is_superuser", False):
        moderation_pending_count = (
            ReportAbuseReport.objects.filter(status="pending").count()
            + CommentAbuseReport.objects.filter(status="pending").count()
        )

    return {
        "recent_notifications": notifications[:5],
        "unread_notifications_count": notifications.filter(is_read=False).count(),
        "moderation_pending_count": moderation_pending_count,
    }
