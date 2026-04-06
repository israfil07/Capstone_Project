from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    """Extend the default user to include identifiers used during registration."""

    ROLE_CHOICES = [
        ("user", "User"),
        ("moderator", "Moderator"),
        ("admin", "Admin"),
    ]

    national_id = models.CharField(max_length=50, unique=True, blank=True, null=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    profile_image = models.ImageField(upload_to="profiles/", blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="user")

    @property
    def can_moderate(self):
        return self.role in {"moderator", "admin"} or self.is_superuser

    def __str__(self):
        return self.username
