import os

from django import forms

from .models import (
    Report,
    Comment,
    ReportAbuseReport,
    CommentAbuseReport,
    FundDonation,
    FundUsage,
)

MAX_IMAGE_FILE_MB = 5
MAX_VIDEO_FILE_MB = 10
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm", ".mkv"}


class ReportForm(forms.ModelForm):
    class Meta:
        model = Report
        fields = ["title", "description", "category", "location", "latitude", "longitude", "image", "video"]

    def clean(self):
        cleaned_data = super().clean()
        latitude = cleaned_data.get("latitude")
        longitude = cleaned_data.get("longitude")

        if (latitude is None) ^ (longitude is None):
            raise forms.ValidationError("Please select a complete location pin on the map.")

        if latitude is not None and (latitude < -90 or latitude > 90):
            raise forms.ValidationError("Latitude must be between -90 and 90.")

        if longitude is not None and (longitude < -180 or longitude > 180):
            raise forms.ValidationError("Longitude must be between -180 and 180.")

        return cleaned_data

    def clean_image(self):
        image = self.cleaned_data.get("image")
        if self.data.get("image-clear") == "on" and not image:
            return False
        if not image:
            return image

        extension = os.path.splitext(image.name)[1].lower()
        if extension not in ALLOWED_IMAGE_EXTENSIONS:
            raise forms.ValidationError("Unsupported image format. Allowed: JPG, PNG, WEBP, GIF.")

        content_type = (getattr(image, "content_type", "") or "").lower()
        if content_type and not content_type.startswith("image/"):
            raise forms.ValidationError("Uploaded image has an invalid content type.")

        if image.size > MAX_IMAGE_FILE_MB * 1024 * 1024:
            raise forms.ValidationError(f"Image must be {MAX_IMAGE_FILE_MB}MB or smaller.")

        return image

    def clean_video(self):
        video = self.cleaned_data.get("video")
        if self.data.get("video-clear") == "on" and not video:
            return False
        if not video:
            return video

        extension = os.path.splitext(video.name)[1].lower()
        if extension not in ALLOWED_VIDEO_EXTENSIONS:
            raise forms.ValidationError("Unsupported video format. Allowed: MP4, MOV, AVI, WEBM, MKV.")

        content_type = (getattr(video, "content_type", "") or "").lower()
        if content_type and not content_type.startswith("video/"):
            raise forms.ValidationError("Uploaded video has an invalid content type.")

        if video.size > MAX_VIDEO_FILE_MB * 1024 * 1024:
            raise forms.ValidationError(f"Video must be {MAX_VIDEO_FILE_MB}MB or smaller.")

        return video


class CommentForm(forms.ModelForm):
    class Meta:
        model = Comment
        fields = ["text", "parent"]


class ReportAbuseForm(forms.ModelForm):
    class Meta:
        model = ReportAbuseReport
        fields = ["reason"]


class CommentAbuseForm(forms.ModelForm):
    class Meta:
        model = CommentAbuseReport
        fields = ["reason"]


class NotificationPreferencesForm(forms.Form):
    browser_notifications = forms.BooleanField(required=False)
    email_notifications = forms.BooleanField(required=False)
    weekly_digest = forms.BooleanField(required=False)
    unread_polling_seconds = forms.ChoiceField(
        choices=[
            ("15", "Every 15 seconds"),
            ("30", "Every 30 seconds"),
            ("60", "Every 60 seconds"),
        ],
        initial="15",
    )


class FundDonationForm(forms.ModelForm):
    class Meta:
        model = FundDonation
        fields = ["amount", "note"]
        widgets = {
            "amount": forms.NumberInput(
                attrs={
                    "class": "rp-submit-input w-full px-4 py-3 text-sm",
                    "step": "0.01",
                    "min": "1",
                    "placeholder": "e.g. 500",
                }
            ),
            "note": forms.TextInput(
                attrs={
                    "class": "rp-submit-input w-full px-4 py-3 text-sm",
                    "placeholder": "Optional message",
                }
            ),
        }

    def clean_amount(self):
        amount = self.cleaned_data.get("amount")
        if amount is None or amount <= 0:
            raise forms.ValidationError("Donation amount must be greater than zero.")
        return amount


class FundUsageForm(forms.ModelForm):
    class Meta:
        model = FundUsage
        fields = ["title", "description", "amount"]
        widgets = {
            "title": forms.TextInput(
                attrs={
                    "class": "rp-submit-input w-full px-4 py-3 text-sm",
                    "placeholder": "e.g. Repairing broken street lights",
                }
            ),
            "description": forms.Textarea(
                attrs={
                    "class": "rp-submit-input w-full px-4 py-3 text-sm",
                    "rows": 3,
                    "placeholder": "Describe how this fund was used.",
                }
            ),
            "amount": forms.NumberInput(
                attrs={
                    "class": "rp-submit-input w-full px-4 py-3 text-sm",
                    "step": "0.01",
                    "min": "1",
                    "placeholder": "e.g. 1200",
                }
            ),
        }

    def clean_amount(self):
        amount = self.cleaned_data.get("amount")
        if amount is None or amount <= 0:
            raise forms.ValidationError("Usage amount must be greater than zero.")
        return amount
