from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect

from .forms import ReportForm
from .models import Report


@login_required
def home(request):
    reports = Report.objects.filter(user=request.user).order_by("-created_at")
    return render(request, "reports/home.html", {"reports": reports})


@login_required
def submit_report(request):
    if request.method == "POST":
        form = ReportForm(request.POST, request.FILES)
        if form.is_valid():
            report = form.save(commit=False)
            report.user = request.user
            report.save()
            return redirect("home")
    else:
        form = ReportForm()
    return render(request, "reports/submit.html", {"form": form})

