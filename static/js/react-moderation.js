/* React Moderation Console */
(function () {
    var rootEl = document.getElementById("rp-moderation-root");
    var dataEl = document.getElementById("moderation-react-initial");
    if (!rootEl || !dataEl || !window.React || !window.ReactDOM) return;

    function parseData() {
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

    function replaceId(urlTemplate, id) {
        return (urlTemplate || "").replace("/0/", "/" + id + "/");
    }

    function PostForm(props) {
        return (
            <form method="post" action={props.action} className={props.className || "m-0"}>
                <input type="hidden" name="csrfmiddlewaretoken" value={props.csrf} />
                {props.children}
            </form>
        );
    }

    function ModerationApp() {
        var data = parseData();
        var reportActionTpl = rootEl.dataset.reportActionUrlTemplate;
        var commentActionTpl = rootEl.dataset.commentActionUrlTemplate;
        var reportAbuseTpl = rootEl.dataset.reportAbuseUrlTemplate;
        var commentAbuseTpl = rootEl.dataset.commentAbuseUrlTemplate;

        var reportAbuse = data.pending_report_abuse || [];
        var commentAbuse = data.pending_comment_abuse || [];
        var reports = data.reports_for_review || [];
        var hiddenComments = data.hidden_comments || [];
        var moderators = data.moderators || [];
        var statusChoices = data.status_choices || [];

        var token = csrf();

        return (
            <div className="space-y-6">
                <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-2xl font-bold text-slate-800">Moderation Queue</h2>
                    <p className="mt-2 text-sm text-slate-600">Reports: {reports.length} | Report abuse: {reportAbuse.length} | Comment abuse: {commentAbuse.length}</p>
                </header>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-800">Reports For Review</h3>
                    <div className="mt-3 space-y-3">
                        {reports.length ? reports.map(function (r) {
                            return (
                                <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <a href={r.detail_url} className="font-semibold text-slate-800">{r.title}</a>
                                        <span className="text-xs text-slate-500">{r.progress_label} | {r.is_hidden ? "Hidden" : "Visible"}</span>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <PostForm action={replaceId(reportActionTpl, r.id)} csrf={token}>
                                            <input type="hidden" name="action" value={r.is_hidden ? "unhide" : "hide"} />
                                            <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">{r.is_hidden ? "Unhide" : "Hide"}</button>
                                        </PostForm>

                                        <PostForm action={replaceId(reportActionTpl, r.id)} csrf={token} className="m-0 flex items-center gap-2">
                                            <input type="hidden" name="action" value="status" />
                                            <select name="new_status" defaultValue={r.progress} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                                {statusChoices.map(function (choice) {
                                                    return <option key={choice.value} value={choice.value}>{choice.label}</option>;
                                                })}
                                            </select>
                                            <button type="submit" className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Update Status</button>
                                        </PostForm>

                                        <PostForm action={replaceId(reportActionTpl, r.id)} csrf={token} className="m-0 flex items-center gap-2">
                                            <input type="hidden" name="action" value="assign" />
                                            <select name="assigned_to" defaultValue={r.assigned_to_id || ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                                <option value="">Unassigned</option>
                                                {moderators.map(function (m) {
                                                    return <option key={m.id} value={m.id}>{m.username} ({m.role})</option>;
                                                })}
                                            </select>
                                            <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">Assign</button>
                                        </PostForm>
                                    </div>
                                </div>
                            );
                        }) : <p className="text-sm text-slate-600">No reports in queue.</p>}
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-800">Pending Report Abuse</h3>
                        <div className="mt-3 space-y-3">
                            {reportAbuse.length ? reportAbuse.map(function (item) {
                                return (
                                    <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                                        <p className="font-semibold text-slate-800">{item.report.title}</p>
                                        <p className="mt-1 text-slate-600">Reason: {item.reason}</p>
                                        <PostForm action={replaceId(reportAbuseTpl, item.id)} csrf={token} className="mt-2 flex gap-2">
                                            <select name="status" defaultValue="pending" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                                <option value="pending">Pending</option>
                                                <option value="reviewed">Reviewed</option>
                                                <option value="dismissed">Dismissed</option>
                                            </select>
                                            <button type="submit" className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Save</button>
                                        </PostForm>
                                    </div>
                                );
                            }) : <p className="text-sm text-slate-600">No pending report abuse entries.</p>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-800">Pending Comment Abuse</h3>
                        <div className="mt-3 space-y-3">
                            {commentAbuse.length ? commentAbuse.map(function (item) {
                                return (
                                    <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                                        <p className="font-semibold text-slate-800">{item.comment.report_title}</p>
                                        <p className="mt-1 text-slate-600">Comment: {(item.comment.text || "").slice(0, 120)}</p>
                                        <p className="mt-1 text-slate-600">Reason: {item.reason}</p>
                                        <PostForm action={replaceId(commentAbuseTpl, item.id)} csrf={token} className="mt-2 flex gap-2">
                                            <select name="status" defaultValue="pending" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                                <option value="pending">Pending</option>
                                                <option value="reviewed">Reviewed</option>
                                                <option value="dismissed">Dismissed</option>
                                            </select>
                                            <button type="submit" className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Save</button>
                                        </PostForm>
                                    </div>
                                );
                            }) : <p className="text-sm text-slate-600">No pending comment abuse entries.</p>}
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-800">Hidden Comments</h3>
                    <div className="mt-3 space-y-3">
                        {hiddenComments.length ? hiddenComments.map(function (c) {
                            return (
                                <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                                    <p className="text-slate-700">{(c.text || "").slice(0, 160)}</p>
                                    <PostForm action={replaceId(commentActionTpl, c.id)} csrf={token} className="mt-2 m-0">
                                        <input type="hidden" name="action" value="unhide" />
                                        <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">Unhide Comment</button>
                                    </PostForm>
                                </div>
                            );
                        }) : <p className="text-sm text-slate-600">No hidden comments.</p>}
                    </div>
                </section>
            </div>
        );
    }

    ReactDOM.createRoot(rootEl).render(<ModerationApp />);
})();
