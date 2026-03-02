from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("submit/", views.submit_report, name="submit_report"),
]
