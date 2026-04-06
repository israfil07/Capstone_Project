/* React Profile Panels - loaded via Babel standalone */
(function () {
    function getCsrfToken() {
        var meta = document.querySelector("meta[name='csrf-token']");
        return meta ? meta.content : "";
    }

    function getStatusClass(progress) {
        if (progress === "resolved") {
            return "border-slate-300 bg-slate-100 text-slate-700";
        }
        if (progress === "in_progress") {
            return "border-slate-300 bg-slate-100 text-slate-700";
        }
        return "border-slate-300 bg-slate-100 text-slate-700";
    }

    function ProfilePhotoPanel(props) {
        var photo = props.photo || {};
        var links = props.links || {};
        var csrfToken = props.csrfToken || "";
        var hasProfileImage = !!photo.has_profile_image;
        var imageUrl = photo.profile_image_url || "";
        var username = photo.username || "user";
        var initial = photo.initial || "U";
        var errors = Array.isArray(photo.errors) ? photo.errors : [];

        return (
            <section className="rp-profile-photo rounded-2xl border border-slate-200 p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Profile Photo</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Identity</h3>
                        <p className="mt-1 text-sm text-slate-600">Upload a clear image to personalize your account.</p>
                    </div>
                </div>

                <div className="mt-6 flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <img
                        id="profile-photo-preview"
                        src={imageUrl}
                        alt={username}
                        className={(hasProfileImage ? "" : "hidden ") + "h-16 w-16 rounded-full border border-slate-300 object-cover"}
                    />
                    <div
                        id="profile-photo-fallback"
                        className={(hasProfileImage ? "hidden " : "") + "flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-white text-xl font-bold text-slate-700"}
                    >
                        {initial}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900">@{username}</p>
                        <p className="text-xs text-slate-500">Update and save to apply instantly.</p>
                    </div>
                </div>

                <form method="post" action={links.profile_url || ""} encType="multipart/form-data" className="mt-4 space-y-3">
                    <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                    <input type="hidden" name="profile_action" value="photo" />
                    <div>
                        <label htmlFor="id_profile_image" className="block text-sm font-medium text-slate-700">Choose photo</label>
                        <input
                            type="file"
                            name="profile_image"
                            id="id_profile_image"
                            accept="image/*"
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
                        />
                        {hasProfileImage ? (
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
                                <input type="checkbox" name="profile_image-clear" className="h-4 w-4" />
                                Remove current photo
                            </label>
                        ) : null}
                        {errors.map(function (error, index) {
                            return (
                                <p key={index} className="mt-1 text-xs text-rose-600">{error}</p>
                            );
                        })}
                    </div>
                    <button type="submit" className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                        Save Photo
                    </button>
                </form>
            </section>
        );
    }

    function RecentReportsPanel(props) {
        var reports = props.reports || [];
        var links = props.links || {};

        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Activity</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Recent Reports</h3>
                    </div>
                    <a href={links.my_reports_url || "#"} className="text-sm font-semibold text-slate-700 transition hover:text-slate-900">
                        View all
                    </a>
                </div>

                <div className="mt-4 space-y-3">
                    {reports.length ? reports.map(function (report) {
                        return (
                            <a
                                key={report.id}
                                href={report.detail_url}
                                className="rp-profile-report-card block rounded-2xl border border-slate-200 bg-white px-4 py-4 transition hover:border-slate-300 hover:bg-slate-50/70"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-slate-900">{report.title}</p>
                                    <span className="text-xs text-slate-500">{report.created_at}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                    <span className={"rounded-full border px-2.5 py-1 font-semibold " + getStatusClass(report.progress)}>
                                        {report.progress_label}
                                    </span>
                                    <span>Comments: {report.comment_count}</span>
                                    <span>Reactions: {report.reaction_count}</span>
                                </div>
                            </a>
                        );
                    }) : (
                        <div className="rp-profile-empty rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                            No reports yet. Start by submitting your first report.
                        </div>
                    )}
                </div>
            </section>
        );
    }

    function AccountInfoPanel(props) {
        var account = props.account || {};
        var links = props.links || {};
        var csrfToken = props.csrfToken || "";
        var accountForm = account.form || {};
        var errors = accountForm.errors || {};

        function fieldError(name) {
            var fieldErrors = errors[name];
            if (!Array.isArray(fieldErrors) || !fieldErrors.length) {
                return null;
            }
            return <p className="mt-1 text-xs text-rose-600">{fieldErrors[0]}</p>;
        }

        return (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Account</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Information</h3>
                    </div>
                    <a href={links.settings_url || "#"} className="text-sm font-semibold text-slate-700 transition hover:text-slate-900">
                        Manage
                    </a>
                </div>

                <form method="post" action={links.profile_url || ""} className="mt-4">
                    <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                    <input type="hidden" name="profile_action" value="account_info" />
                    <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/65 px-4 py-3">
                            <label htmlFor="id_first_name" className="text-xs font-semibold uppercase tracking-wide text-slate-500">First Name</label>
                            <input id="id_first_name" name="first_name" defaultValue={accountForm.first_name || ""} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900" />
                            {fieldError("first_name")}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/65 px-4 py-3">
                            <label htmlFor="id_last_name" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Name</label>
                            <input id="id_last_name" name="last_name" defaultValue={accountForm.last_name || ""} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900" />
                            {fieldError("last_name")}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/65 px-4 py-3">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Username</dt>
                            <dd className="mt-1 font-semibold text-slate-900">@{account.username || "-"}</dd>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/65 px-4 py-3">
                            <label htmlFor="id_email" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                            <input id="id_email" type="email" name="email" defaultValue={accountForm.email || ""} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900" />
                            {fieldError("email")}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/65 px-4 py-3">
                            <label htmlFor="id_phone_number" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone Number</label>
                            <input id="id_phone_number" name="phone_number" defaultValue={accountForm.phone_number || ""} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900" />
                            {fieldError("phone_number")}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/65 px-4 py-3">
                            <label htmlFor="id_national_id" className="text-xs font-semibold uppercase tracking-wide text-slate-500">National ID</label>
                            <input id="id_national_id" name="national_id" defaultValue={accountForm.national_id || ""} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900" />
                            {fieldError("national_id")}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/65 px-4 py-3">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</dt>
                            <dd className="mt-1 font-semibold text-slate-900">{account.role || "User"}</dd>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/65 px-4 py-3">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Joined</dt>
                            <dd className="mt-1 font-semibold text-slate-900">{account.date_joined || "-"}</dd>
                        </div>
                    </div>

                    <div className="mt-4">
                        <button type="submit" className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                            Save Information
                        </button>
                    </div>
                </form>
            </section>
        );
    }

    var initialDataElement = document.getElementById("profile-react-initial");
    if (!initialDataElement) return;

    var initialData;
    try {
        initialData = JSON.parse(initialDataElement.textContent || "{}");
    } catch (error) {
        initialData = {};
    }

    var csrfToken = getCsrfToken();

    var photoRoot = document.getElementById("rp-profile-photo-root");
    if (photoRoot) {
        ReactDOM.createRoot(photoRoot).render(
            <ProfilePhotoPanel photo={initialData.photo} links={initialData.links} csrfToken={csrfToken} />
        );
    }

    var recentRoot = document.getElementById("rp-profile-recent-root");
    if (recentRoot) {
        ReactDOM.createRoot(recentRoot).render(
            <RecentReportsPanel reports={initialData.recent_reports} links={initialData.links} />
        );
    }

    var accountRoot = document.getElementById("rp-profile-account-root");
    if (accountRoot) {
        ReactDOM.createRoot(accountRoot).render(
            <AccountInfoPanel account={initialData.account} links={initialData.links} csrfToken={csrfToken} />
        );
    }
})();
