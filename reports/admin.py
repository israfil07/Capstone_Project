from django.contrib import admin
from .models import (
    Report,
    Notification,
    Comment,
    ReportBookmark,
    ReportFollow,
    ReportReaction,
    CommentReaction,
    ReportAbuseReport,
    CommentAbuseReport,
    ReportStatusHistory,
    AuditLog,
    FundDonation,
    FundUsage,
)


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "category", "progress", "assigned_to", "is_hidden", "created_at")
    list_filter = ("progress", "category", "is_hidden")
    search_fields = ("title", "description", "user__username", "location")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "report", "is_read", "created_at")
    list_filter = ("is_read",)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("user", "report", "parent", "is_hidden", "created_at")
    list_filter = ("is_hidden",)
    search_fields = ("text", "user__username", "report__title")


admin.site.register(ReportBookmark)
admin.site.register(ReportFollow)
admin.site.register(ReportReaction)
admin.site.register(CommentReaction)
admin.site.register(ReportAbuseReport)
admin.site.register(CommentAbuseReport)
admin.site.register(ReportStatusHistory)
admin.site.register(AuditLog)
admin.site.register(FundDonation)
admin.site.register(FundUsage)
