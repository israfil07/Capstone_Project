from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from .forms import MAX_VIDEO_FILE_MB, ReportForm
from .models import (
    Comment,
    CommentAbuseReport,
    Notification,
    Report,
    ReportAbuseReport,
    ReportBookmark,
    ReportFollow,
    ReportReaction,
    ReportStatusHistory,
)


class ViewMethodSecurityTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="alice", password="password123")
        self.client.force_login(self.user)

        self.report = Report.objects.create(user=self.user, title="Road issue")
        self.comment = Comment.objects.create(report=self.report, user=self.user, text="Needs fixing")

    def test_mutation_endpoints_reject_get_requests(self):
        urls = [
            reverse("mark_notifications_read"),
            reverse("toggle_bookmark", args=[self.report.pk]),
            reverse("toggle_follow", args=[self.report.pk]),
            reverse("toggle_report_reaction", args=[self.report.pk]),
            reverse("toggle_comment_reaction", args=[self.comment.pk]),
            reverse("comment_edit", args=[self.comment.pk]),
            reverse("comment_delete", args=[self.comment.pk]),
            reverse("report_abuse", args=[self.report.pk]),
            reverse("comment_abuse", args=[self.comment.pk]),
        ]

        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 405)

    def test_toggle_actions_fallback_to_valid_redirects(self):
        follow_response = self.client.post(reverse("toggle_follow", args=[self.report.pk]))
        self.assertEqual(follow_response.status_code, 302)
        self.assertEqual(follow_response.headers["Location"], reverse("report_detail", args=[self.report.pk]))

        reaction_response = self.client.post(reverse("toggle_comment_reaction", args=[self.comment.pk]))
        self.assertEqual(reaction_response.status_code, 302)
        self.assertEqual(reaction_response.headers["Location"], reverse("report_detail", args=[self.report.pk]))

    def test_get_requests_do_not_mutate_toggle_state(self):
        self.client.get(reverse("toggle_bookmark", args=[self.report.pk]))
        self.client.get(reverse("toggle_follow", args=[self.report.pk]))
        self.client.get(reverse("toggle_report_reaction", args=[self.report.pk]))

        self.assertEqual(ReportBookmark.objects.filter(user=self.user, report=self.report).count(), 0)
        self.assertEqual(ReportFollow.objects.filter(user=self.user, report=self.report).count(), 0)
        self.assertEqual(ReportReaction.objects.filter(user=self.user, report=self.report).count(), 0)


class ModerationMethodSecurityTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.moderator = user_model.objects.create_user(username="mod", password="password123", role="moderator")
        self.reporter = user_model.objects.create_user(username="reporter", password="password123")
        self.client.force_login(self.moderator)

        self.report = Report.objects.create(user=self.reporter, title="Street light")
        self.comment = Comment.objects.create(report=self.report, user=self.reporter, text="Dangerous at night")
        self.report_abuse = ReportAbuseReport.objects.create(
            report=self.report,
            reported_by=self.reporter,
            reason="Spam",
        )
        self.comment_abuse = CommentAbuseReport.objects.create(
            comment=self.comment,
            reported_by=self.reporter,
            reason="Abusive",
        )

    def test_moderation_endpoints_reject_get_requests(self):
        urls = [
            reverse("moderation_report_action", args=[self.report.pk]),
            reverse("moderation_comment_action", args=[self.comment.pk]),
            reverse("abuse_status_update", kwargs={"abuse_type": "report", "pk": self.report_abuse.pk}),
            reverse("abuse_status_update", kwargs={"abuse_type": "comment", "pk": self.comment_abuse.pk}),
        ]

        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 405)


class VisibilityAndUploadValidationTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(username="owner", password="password123")
        self.viewer = user_model.objects.create_user(username="viewer", password="password123")

    def test_hidden_comments_do_not_render_on_home_for_regular_users(self):
        report = Report.objects.create(user=self.owner, title="Garbage issue", description="Please clean")
        Comment.objects.create(report=report, user=self.owner, text="Visible comment", is_hidden=False)
        Comment.objects.create(report=report, user=self.owner, text="Hidden moderator note", is_hidden=True)

        self.client.force_login(self.viewer)
        response = self.client.get(reverse("home"))

        self.assertContains(response, "Visible comment")
        self.assertNotContains(response, "Hidden moderator note")

    def test_report_form_rejects_invalid_image_extension(self):
        invalid_image = SimpleUploadedFile(
            "payload.txt",
            b"not-an-image",
            content_type="text/plain",
        )

        form = ReportForm(
            data={
                "title": "Road crack",
                "description": "desc",
                "category": "infrastructure",
                "location": "",
                "progress": "submitted",
            },
            files={"image": invalid_image},
        )

        self.assertFalse(form.is_valid())
        self.assertIn("image", form.errors)

    def test_report_form_rejects_oversized_video(self):
        oversized_video = SimpleUploadedFile(
            "evidence.mp4",
            b"0" * ((MAX_VIDEO_FILE_MB * 1024 * 1024) + 1),
            content_type="video/mp4",
        )

        form = ReportForm(
            data={
                "title": "Power line down",
                "description": "desc",
                "category": "safety",
                "location": "",
                "progress": "submitted",
            },
            files={"video": oversized_video},
        )

        self.assertFalse(form.is_valid())
        self.assertIn("video", form.errors)


class PaginationAndIndexTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="pager", password="password123")
        self.client.force_login(self.user)

    def test_home_paginates_nine_reports_per_page(self):
        for i in range(12):
            Report.objects.create(user=self.user, title=f"Issue {i}")

        first_page = self.client.get(reverse("home"))
        first_payload = first_page.context["react_initial"]
        self.assertEqual(len(first_payload["reports"]), 9)
        self.assertTrue(first_payload["pagination"]["has_next"])

        second_page = self.client.get(reverse("home"), {"page": 2})
        second_payload = second_page.context["react_initial"]
        self.assertEqual(len(second_payload["reports"]), 3)
        self.assertFalse(second_payload["pagination"]["has_next"])

    def test_home_filters_by_location_query(self):
        Report.objects.create(user=self.user, title="Road crack", location="Dhanmondi, Dhaka")
        Report.objects.create(user=self.user, title="Power outage", location="Chattogram")

        response = self.client.get(reverse("home"), {"location": "dhaka"})
        payload = response.context["react_initial"]

        self.assertEqual(len(payload["reports"]), 1)
        self.assertEqual(payload["reports"][0]["title"], "Road crack")
        self.assertEqual(payload["filters"]["location_query"], "dhaka")

    def test_hot_query_indexes_are_declared(self):
        report_indexes = {tuple(index.fields) for index in Report._meta.indexes}
        self.assertIn(("user", "created_at"), report_indexes)
        self.assertIn(("is_hidden", "created_at"), report_indexes)
        self.assertIn(("progress", "created_at"), report_indexes)
        self.assertIn(("category", "created_at"), report_indexes)

        comment_indexes = {tuple(index.fields) for index in Comment._meta.indexes}
        self.assertIn(("report", "parent", "is_hidden", "created_at"), comment_indexes)

        notification_indexes = {tuple(index.fields) for index in Notification._meta.indexes}
        self.assertIn(("recipient", "is_read", "created_at"), notification_indexes)
        self.assertIn(("report", "created_at"), notification_indexes)

        history_indexes = {tuple(index.fields) for index in ReportStatusHistory._meta.indexes}
        self.assertIn(("report", "new_status", "created_at"), history_indexes)
