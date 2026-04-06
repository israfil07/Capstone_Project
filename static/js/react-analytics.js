/* React Analytics */
(function () {
    var rootEl = document.getElementById("rp-analytics-root");
    var dataEl = document.getElementById("analytics-react-initial");
    if (!rootEl || !dataEl || !window.React || !window.ReactDOM) return;

    function parseData() {
        try {
            return JSON.parse(dataEl.textContent || "{}");
        } catch (e) {
            return {};
        }
    }

    function rangeUrl(value) {
        var params = new URLSearchParams(window.location.search);
        params.set("range", value);
        return window.location.pathname + "?" + params.toString();
    }

    function SummaryCard(props) {
        return (
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">{props.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{props.value}</p>
            </article>
        );
    }

    function AnalyticsHeader() {
        var data = parseData();
        var categories = data.by_category_rows || [];
        var avg = data.average_resolution_hours == null ? "N/A" : data.average_resolution_hours + "h";

        return (
            <section className="space-y-6">
                <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-2xl font-bold text-slate-800">Analytics</h2>
                    <p className="mt-2 text-sm text-slate-600">Selected range: {data.selected_range_label || "All Time"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <a href={rangeUrl("all")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">All</a>
                        <a href={rangeUrl("7d")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">7 Days</a>
                        <a href={rangeUrl("30d")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">30 Days</a>
                        <a href={rangeUrl("year")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Year</a>
                    </div>
                </header>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <SummaryCard label="Total Reports" value={data.total_reports || 0} />
                    <SummaryCard label="Resolved" value={data.resolved_reports || 0} />
                    <SummaryCard label="Open Cases" value={data.open_cases || 0} />
                    <SummaryCard label="Resolved Rate" value={(data.resolved_rate || 0) + "%"} />
                    <SummaryCard label="Avg Resolution" value={avg} />
                </div>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-800">Category Breakdown</h3>
                    <div className="mt-3 space-y-2">
                        {categories.length ? categories.map(function (row) {
                            return (
                                <div key={row.label} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                    <span className="text-slate-700">{row.label}</span>
                                    <span className="font-semibold text-slate-900">{row.total}</span>
                                </div>
                            );
                        }) : <p className="text-sm text-slate-600">No category data for this range.</p>}
                    </div>
                </section>
            </section>
        );
    }

    ReactDOM.createRoot(rootEl).render(<AnalyticsHeader />);
})();
