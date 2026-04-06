from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.forms import UserCreationForm, UserChangeForm

from .models import CustomUser


class CustomUserCreationForm(UserCreationForm):
    class Meta:
        model = CustomUser
        fields = (
            "username",
            "first_name",
            "last_name",
            "email",
            "national_id",
            "phone_number",
            "profile_image",
            "role",
        )


class RegisterUserForm(UserCreationForm):
    class Meta:
        model = CustomUser
        fields = (
            "username",
            "first_name",
            "last_name",
            "email",
            "national_id",
            "phone_number",
        )


class CustomUserChangeForm(UserChangeForm):
    class Meta:
        model = CustomUser
        fields = (
            "username",
            "first_name",
            "last_name",
            "email",
            "national_id",
            "phone_number",
            "profile_image",
            "role",
        )


class CustomAuthenticationForm(AuthenticationForm):
    pass


class ProfileImageForm(forms.ModelForm):
    class Meta:
        model = CustomUser
        fields = ("profile_image",)

    def clean_profile_image(self):
        profile_image = self.cleaned_data.get("profile_image")
        if self.data.get("profile_image-clear") == "on" and not profile_image:
            return False
        return profile_image


class ProfileInfoForm(forms.ModelForm):
    class Meta:
        model = CustomUser
        fields = ("first_name", "last_name", "email", "phone_number", "national_id")

    def clean_national_id(self):
        national_id = (self.cleaned_data.get("national_id") or "").strip()
        if not national_id:
            return ""

        existing_user = (
            CustomUser.objects.filter(national_id=national_id)
            .exclude(pk=self.instance.pk)
            .first()
        )
        if existing_user:
            raise forms.ValidationError("This national ID is already used by another account.")
        return national_id
