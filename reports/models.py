from django.conf import settings
from django.db import models


def upload_to(instance, filename):
    # store files under user-specific folder
    return f"reports/{instance.user.id}/{filename}"


class Report(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to=upload_to, blank=True, null=True)
    video = models.FileField(upload_to=upload_to, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

