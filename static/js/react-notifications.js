/* React Notifications Feed - loaded via Babel standalone */
(function () {
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useCallback = React.useCallback;

    function getCsrf() {
        var meta = document.querySelector("meta[name='csrf-token']");
        return meta ? meta.content : "";
    }

    function NotificationItem(_ref) {
        var notif = _ref.notif;
        var reportDetailTemplate = _ref.reportDetailTemplate;
        var href = notif.report_pk ? reportDetailTemplate.replace("/0/", "/" + notif.report_pk + "/") : "#";

        return (
            <a
                href={href}
                className={"rp-notification-item block rounded-[1.5rem] border p-4 transition hover:bg-slate-50 " + (notif.is_read ? "border-slate-200 bg-white" : "border-indigo-200 bg-indigo-50")}
                data-state={notif.is_read ? "read" : "unread"}
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="flex-1 text-sm font-medium text-slate-800">{notif.message}</p>
                    <span className={"rp-notification-badge " + (notif.is_read ? "opacity-80" : "")}>{notif.is_read ? "Read" : "Unread"}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{notif.created_at}</p>
            </a>
        );
    }

    function NotificationFeed(_ref2) {
        var apiUrl = _ref2.apiUrl;
        var reportDetailTemplate = _ref2.reportDetailTemplate;

        var _useState = useState([]);
        var notifications = _useState[0];
        var setNotifications = _useState[1];

        var _useState2 = useState(true);
        var loading = _useState2[0];
        var setLoading = _useState2[1];

        var _useState3 = useState(false);
        var marking = _useState3[0];
        var setMarking = _useState3[1];

        var fetchNotifications = useCallback(function () {
            return fetch(apiUrl)
                .then(function (res) { return res.ok ? res.json() : null; })
                .then(function (data) { if (data) setNotifications(data.notifications || []); })
                .catch(function () {})
                .finally(function () { setLoading(false); });
        }, [apiUrl]);

        useEffect(function () {
            fetchNotifications();
            var interval = setInterval(fetchNotifications, 30000);
            return function () { clearInterval(interval); };
        }, [fetchNotifications]);

        function markAllRead() {
            if (marking) return;
            setMarking(true);
            fetch(apiUrl, {
                method: "POST",
                headers: {
                    "X-CSRFToken": getCsrf(),
                    "Content-Type": "application/json"
                }
            })
                .then(function () {
                    setNotifications(function (prev) {
                        return prev.map(function (n) { return Object.assign({}, n, { is_read: true }); });
                    });
                })
                .catch(function () {})
                .finally(function () { setMarking(false); });
        }

        var unreadCount = notifications.filter(function (n) { return !n.is_read; }).length;

        return (
            <div className="space-y-6">
                <div className="rp-notifications-hero flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-800">Notifications</h2>
                        <p className="mt-2 text-sm text-slate-600">{loading ? "Loading your feed..." : unreadCount > 0 ? unreadCount + " unread notification" + (unreadCount !== 1 ? "s" : "") : "You are all caught up."}</p>
                    </div>
                    <button onClick={markAllRead} disabled={marking || unreadCount === 0} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                        {marking ? "Marking..." : "Mark all as read"}
                    </button>
                </div>

                <div className="rp-notification-feed space-y-3" aria-live="polite">
                    {loading ? (
                        <div className="rp-notification-empty rounded-[1.5rem] p-8 text-center"><p className="mt-3 text-sm text-slate-500">Loading notifications...</p></div>
                    ) : notifications.length === 0 ? (
                        <div className="rp-notification-empty rounded-[1.5rem] p-5 text-center text-slate-500">
                            <p className="text-base font-semibold text-slate-700">No notifications yet.</p>
                        </div>
                    ) : (
                        notifications.map(function (notif) {
                            return <NotificationItem key={notif.id} notif={notif} reportDetailTemplate={reportDetailTemplate} />;
                        })
                    )}
                </div>
            </div>
        );
    }

    var rootEl = document.getElementById("rp-notifications-root");
    if (rootEl) {
        ReactDOM.createRoot(rootEl).render(
            <NotificationFeed apiUrl={rootEl.dataset.apiUrl} reportDetailTemplate={rootEl.dataset.reportDetailTemplate || "/report/0/"} />
        );
    }
})();
