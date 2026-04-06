/* React Dashboard — restored */
(function () {
    var rootEl = document.getElementById("rp-dashboard-root");
    var dataEl = document.getElementById("dashboard-react-initial");
    if (!rootEl || !dataEl || !window.React || !window.ReactDOM) {
        return;
    }

    var useState = React.useState;
    var useRef = React.useRef;

    var FILTER_OPTIONS = [
        { value: "newest", label: "Newest" },
        { value: "pending", label: "Pending" },
        { value: "in_review", label: "In Review" },
        { value: "in_progress", label: "In Progress" },
        { value: "resolved", label: "Resolved" },
        { value: "attention", label: "Needs Attention" }
    ];
    var CATEGORY_OPTIONS = [
        { value: "", label: "All categories" },
        { value: "infrastructure", label: "Infrastructure" },
        { value: "safety", label: "Safety" },
        { value: "environment", label: "Environment" },
        { value: "health", label: "Health" },
        { value: "other", label: "Other" }
    ];
    var SORT_OPTIONS = [
        { value: "newest", label: "Newest first" },
        { value: "oldest", label: "Oldest first" }
    ];
    var REACTIONS = [
        { value: "like", emoji: "👍", label: "Like" },
        { value: "love", emoji: "❤️", label: "Love" },
        { value: "angry", emoji: "😠", label: "Angry" },
        { value: "dislike", emoji: "👎", label: "Dislike" }
    ];

    function getInitialData() {
        try {
            return JSON.parse(dataEl.textContent || "{}");
        } catch (e) {
            return {};
        }
    }

    function csrf() {
        var meta = document.querySelector("meta[name='csrf-token']");
        return meta ? meta.content : "";
    }

    function buildQuery(filters, page) {
        var params = new URLSearchParams();
        if (filters.title_query) params.set("title", filters.title_query);
        if (filters.location_query) params.set("location", filters.location_query);
        if (filters.selected_filter) params.set("filter", filters.selected_filter);
        if (filters.selected_category) params.set("category", filters.selected_category);
        if (filters.selected_sort) params.set("sort", filters.selected_sort);
        if (filters.bookmarked_only) params.set("bookmarked", "1");
        if (page && page > 1) params.set("page", String(page));
        return params.toString();
    }

    function buildLoginHref(baseLoginUrl, nextPath) {
        var target = nextPath || window.location.pathname;
        return baseLoginUrl + "?next=" + encodeURIComponent(target);
    }

    function ActionForm(props) {
        return (
            <form method="post" action={props.action} className={props.className || "m-0 inline-flex"}>
                <input type="hidden" name="csrfmiddlewaretoken" value={props.csrfToken} />
                {props.children}
            </form>
        );
    }

    function ReactionBar(props) {
        var report = props.report;
        var csrfToken = props.csrfToken;

        var _useState = useState(false);
        var open = _useState[0];
        var setOpen = _useState[1];

        var _useState2 = useState(report.user_reaction_type || "");
        var localType = _useState2[0];
        var setLocalType = _useState2[1];

        var _useState3 = useState(report.reaction_count || 0);
        var localCount = _useState3[0];
        var setLocalCount = _useState3[1];

        var _useState4 = useState(null);
        var bouncing = _useState4[0];
        var setBouncing = _useState4[1];

        var closeTimer = useRef(null);

        function openPopup() {
            clearTimeout(closeTimer.current);
            setOpen(true);
        }

        function scheduleClose() {
            closeTimer.current = setTimeout(function () {
                setOpen(false);
            }, 120);
        }

        function onChoose(reactionValue) {
            setBouncing(reactionValue);
            setTimeout(function () { setBouncing(null); }, 450);

            var wasActive = localType === reactionValue;
            var newType = wasActive ? "" : reactionValue;
            var delta = wasActive ? -1 : (localType ? 0 : 1);
            setLocalType(newType);
            setLocalCount(function (c) { return c + delta; });

            var formData = new FormData();
            formData.append("csrfmiddlewaretoken", csrfToken);
            formData.append("reaction", reactionValue);

            fetch(report.react_url, {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                body: formData
            })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data && data.ok) {
                        setLocalType(data.reaction_type || "");
                        setLocalCount(data.reaction_count || 0);
                    }
                })
                .catch(function () {});
            setOpen(false);
        }

        var current = REACTIONS.find(function (r) { return r.value === localType; });

        return (
            <div className="rp-reaction-wrap" onMouseEnter={openPopup} onMouseLeave={scheduleClose}>
                {open ? (
                    <div className="rp-reaction-popup" onMouseEnter={openPopup} onMouseLeave={scheduleClose}>
                        {REACTIONS.map(function (reaction) {
                            var isActive = reaction.value === localType;
                            var isBouncing = bouncing === reaction.value;
                            return (
                                <button
                                    key={reaction.value}
                                    type="button"
                                    className={"rp-reaction-emoji-btn" + (isActive ? " is-active" : "") + (isBouncing ? " is-bouncing" : "")}
                                    title={reaction.label}
                                    aria-label={reaction.label}
                                    onClick={function () { onChoose(reaction.value); }}
                                >
                                    {reaction.emoji}
                                </button>
                            );
                        })}
                    </div>
                ) : null}
                <button
                    type="button"
                    className="rp-home-ghost-btn flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                    onMouseEnter={openPopup}
                >
                    {current ? (
                        <>
                            <span className="text-base leading-none">{current.emoji}</span>
                            <span>{current.label}</span>
                        </>
                    ) : (
                        <span>React</span>
                    )}
                </button>
                {localCount > 0 ? <span className="inline-flex items-center px-1 text-[11px] font-semibold text-slate-700">{localCount}</span> : null}
            </div>
        );
    }

    function getStatusMeta(progress) {
        if (progress === "submitted") return { className: "rp-home-status-pill--submitted", icon: "submitted" };
        if (progress === "in_review") return { className: "rp-home-status-pill--in-review", icon: "in_review" };
        if (progress === "in_progress") return { className: "rp-home-status-pill--in-progress", icon: "in_progress" };
        if (progress === "resolved") return { className: "rp-home-status-pill--resolved", icon: "resolved" };
        return { className: "rp-home-status-pill--default", icon: "default" };
    }

    function StatusIcon(props) {
        if (props.type === "submitted") {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 7v5l3 2"></path>
                </svg>
            );
        }
        if (props.type === "in_review") {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                    <circle cx="11" cy="11" r="7"></circle>
                    <path d="M16.5 16.5 21 21"></path>
                </svg>
            );
        }
        if (props.type === "in_progress") {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 2v3"></path>
                    <path d="M12 19v3"></path>
                    <path d="M4.93 4.93l2.12 2.12"></path>
                    <path d="M16.95 16.95l2.12 2.12"></path>
                    <path d="M2 12h3"></path>
                    <path d="M19 12h3"></path>
                    <path d="M4.93 19.07l2.12-2.12"></path>
                    <path d="M16.95 7.05l2.12-2.12"></path>
                </svg>
            );
        }
        if (props.type === "resolved") {
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                    <path d="M20 6 9 17l-5-5"></path>
                </svg>
            );
        }
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                <circle cx="12" cy="12" r="8"></circle>
            </svg>
        );
    }

    function Card(props) {
        var r = props.report;
        var isAuthenticated = !!props.isAuthenticated;
        var loginHref = buildLoginHref(props.loginUrl, r.detail_url);
        var recentComments = Array.isArray(r.recent_comments) ? r.recent_comments : [];
        var statusMeta = getStatusMeta(r.progress);
        return (
            <article className="rp-report-card rp-home-report-card flex h-full flex-col overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm" data-report-card>
                <a href={r.detail_url} className="block flex flex-1 flex-col">
                    {r.image_url ? <img className="h-36 w-full rounded-t-xl object-cover" src={r.image_url} alt={r.title} /> : <div className="flex h-36 items-center justify-center rounded-t-xl bg-slate-100 text-sm text-slate-700">No image</div>}
                    <div className="flex flex-1 flex-col p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={"rp-home-status-pill " + statusMeta.className + " inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.78rem] font-semibold"}>
                                <span className="rp-home-status-icon" aria-hidden="true"><StatusIcon type={statusMeta.icon} /></span>
                                <span>{r.progress_label}</span>
                            </span>
                            <span className="text-xs text-slate-700">{r.created_at}</span>
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-slate-800">{r.title}</h3>
                        <p className="rp-dashboard-desc mt-2 text-sm text-slate-700">{r.description || "No description provided."}</p>
                        {!isAuthenticated ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">Login is required to open this report and interact.</p> : null}
                        <div className="mt-3 flex items-center gap-2">
                            {r.user && r.user.profile_image_url ? (
                                <img src={r.user.profile_image_url} alt={r.user.username} className="h-7 w-7 rounded-full border border-slate-300 object-cover" />
                            ) : (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{r.user && r.user.initial ? r.user.initial : "U"}</div>
                            )}
                            <p className="text-xs text-slate-700">By {r.user && r.user.username ? r.user.username : "Unknown"}</p>
                        </div>
                        <div className="mt-3 border-t border-slate-200 pt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Recent comments</p>
                            <div className="mt-2 space-y-1">
                                {recentComments.length ? recentComments.map(function (comment, idx) {
                                    return (
                                        <p key={idx} className="text-xs text-slate-700">
                                            <span className="font-semibold text-slate-700">{comment.username}:</span> {(comment.text || "").slice(0, 62)}
                                        </p>
                                    );
                                }) : <p className="text-xs text-slate-600">No comments yet.</p>}
                            </div>
                        </div>
                    </div>
                </a>
                <div className="rp-report-card-actions flex flex-wrap items-center gap-1.5 border-t border-slate-200 px-3 py-2.5">
                    {isAuthenticated ? (
                        <>
                            <ActionForm action={r.bookmark_url} csrfToken={props.csrf} className="m-0 inline-flex flex-1 min-w-0">
                                <button type="submit" className="rp-home-ghost-btn w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">{r.is_bookmarked ? "Bookmarked" : "Bookmark"}</button>
                            </ActionForm>
                            <ActionForm action={r.follow_url} csrfToken={props.csrf} className="m-0 inline-flex flex-1 min-w-0">
                                <button type="submit" className="rp-home-ghost-btn w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">{r.is_following ? "Following" : "Follow"}</button>
                            </ActionForm>
                            <ReactionBar report={r} csrfToken={props.csrf} />
                        </>
                    ) : (
                        <a href={loginHref} className="rp-home-ghost-btn inline-flex items-center rounded-lg border border-amber-300 bg-amber-100 px-2 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200">Login to interact</a>
                    )}
                </div>
            </article>
        );
    }

    function DashboardApp(props) {
        var apiUrl = rootEl.dataset.apiUrl;
        var loginUrl = rootEl.dataset.loginUrl || "/accounts/login/";
        var initial = props.initialData || {};

        var _useState4 = useState(initial);
        var data = _useState4[0];
        var setData = _useState4[1];

        var _useState5 = useState(initial.filters || {
            title_query: "",
            location_query: "",
            selected_filter: "newest",
            selected_category: "",
            selected_sort: "newest",
            bookmarked_only: false
        });
        var filters = _useState5[0];
        var setFilters = _useState5[1];

        var _useState6 = useState(false);
        var loading = _useState6[0];
        var setLoading = _useState6[1];

        function loadWith(query) {
            setLoading(true);
            fetch(apiUrl + (query ? "?" + query : ""))
                .then(function (res) { return res.ok ? res.json() : null; })
                .then(function (payload) {
                    if (payload) {
                        setData(payload);
                        setFilters(payload.filters || filters);
                    }
                })
                .catch(function () {})
                .finally(function () { setLoading(false); });
        }

        function onFilterSubmit(e) {
            e.preventDefault();
            loadWith(buildQuery(filters, 1));
        }

        function applyFilters() {
            loadWith(buildQuery(filters, 1));
        }

        function onPageChange(page) {
            loadWith(buildQuery(filters, page));
        }

        var reports = (data && data.reports) || [];
        var viewer = (data && data.viewer) || {};
        var isAuthenticated = !!viewer.is_authenticated;
        var pagination = (data && data.pagination) || {};
        var hasActiveLocationFilter = !!(filters.location_query && String(filters.location_query).trim());
        var locationLabel = hasActiveLocationFilter ? String(filters.location_query).trim() : "";
        var emptyMessage = hasActiveLocationFilter
            ? "No reports found for location \"" + locationLabel + "\"."
            : "No reports found.";
        var emptyHint = hasActiveLocationFilter
            ? "Try another nearby area or clear the location filter."
            : "Try adjusting filters to see more results.";

        return (
            <section className="space-y-6">
                {!isAuthenticated ? (
                    <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900" role="status">
                        You are browsing as a guest. You can view dashboard reports, but opening report details or taking actions requires login.
                        <a href={buildLoginHref(loginUrl, window.location.pathname + window.location.search)} className="ml-2 font-semibold underline">Login now</a>
                    </div>
                ) : null}
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]" data-reveal>
                    <form onSubmit={onFilterSubmit} className="rp-filter-panel rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <label className="text-sm text-slate-700">Title<input type="text" value={filters.title_query || ""} onChange={function (e) { setFilters(Object.assign({}, filters, { title_query: e.target.value })); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                            <label className="text-sm text-slate-700">Status<select value={filters.selected_filter || "newest"} onChange={function (e) { setFilters(Object.assign({}, filters, { selected_filter: e.target.value })); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{FILTER_OPTIONS.map(function (o) { return <option key={o.value} value={o.value}>{o.label}</option>; })}</select></label>
                            <label className="text-sm text-slate-700">Category<select value={filters.selected_category || ""} onChange={function (e) { setFilters(Object.assign({}, filters, { selected_category: e.target.value })); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{CATEGORY_OPTIONS.map(function (o) { return <option key={o.value} value={o.value}>{o.label}</option>; })}</select></label>
                            <label className="text-sm text-slate-700">Sort<select value={filters.selected_sort || "newest"} onChange={function (e) { setFilters(Object.assign({}, filters, { selected_sort: e.target.value })); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{SORT_OPTIONS.map(function (o) { return <option key={o.value} value={o.value}>{o.label}</option>; })}</select></label>
                            <div className="self-end">
                                <p className="mb-1 text-sm text-slate-700">Actions</p>
                                <div className="flex items-end gap-2">
                                    <button type="submit" className="rounded-lg border border-sky-300 bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-200">Apply</button>
                                    <button type="button" onClick={function () { setFilters({ title_query: "", location_query: "", selected_filter: "newest", selected_category: "", selected_sort: "newest", bookmarked_only: false }); loadWith(""); }} className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Reset</button>
                                </div>
                            </div>
                            <label className="sm:col-span-2 lg:col-span-5 inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!filters.bookmarked_only} onChange={function (e) { setFilters(Object.assign({}, filters, { bookmarked_only: e.target.checked })); }} className="h-4 w-4" disabled={!isAuthenticated} />Show bookmarked only{!isAuthenticated ? " (login required)" : ""}</label>
                        </div>
                    </form>

                    <form onSubmit={function (e) { e.preventDefault(); applyFilters(); }} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Location Filter</p>
                        <label className="mt-2 block text-sm text-slate-700">Area or address
                            <input type="text" value={filters.location_query || ""} onChange={function (e) { setFilters(Object.assign({}, filters, { location_query: e.target.value })); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="e.g. Dhanmondi" />
                        </label>
                        <button type="submit" className="mt-3 w-full rounded-lg border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-200">Apply Location Filter</button>
                        <p className="mt-2 text-xs text-emerald-900">Use location with other filters, then click Apply.</p>
                    </form>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-stagger-parent>
                    {reports.length ? reports.map(function (report, idx) {
                        return <div key={report.id} className="h-full" data-reveal style={{ "--stagger-index": idx }}><Card report={report} csrf={csrf()} isAuthenticated={isAuthenticated} loginUrl={loginUrl} /></div>;
                    }) : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-700 md:col-span-2 xl:col-span-3"><p className="font-semibold text-slate-800">{emptyMessage}</p><p className="mt-1 text-slate-700">{emptyHint}</p></div>}
                </div>

                {pagination.num_pages > 1 ? (
                    <nav className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm" aria-label="Pagination">
                        {pagination.has_previous ? <button type="button" onClick={function () { onPageChange(pagination.previous_page); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700">Previous</button> : null}
                        <span className="text-slate-800">Page {pagination.page} of {pagination.num_pages}</span>
                        {pagination.has_next ? <button type="button" onClick={function () { onPageChange(pagination.next_page); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700">Next</button> : null}
                    </nav>
                ) : null}

            </section>
        );
    }

    ReactDOM.createRoot(rootEl).render(<DashboardApp initialData={getInitialData()} />);
})();
