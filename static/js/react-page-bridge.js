(function () {
    var mainNode = document.querySelector("main[data-react-global-root='true']");
    if (!mainNode || !window.React || !window.ReactDOM || typeof window.ReactDOM.createRoot !== "function") {
        return;
    }

    if (mainNode.dataset.reactBridgeMounted === "true") {
        return;
    }

    // Dashboard page mounts its own React tree. Wrapping main in another root can blank content on script failures.
    if (document.getElementById("rp-dashboard-root")) {
        return;
    }

    var existingHtml = mainNode.innerHTML;
    try {
        mainNode.dataset.reactBridgeMounted = "true";

        var root = window.ReactDOM.createRoot(mainNode);
        root.render(
            window.React.createElement("div", {
                className: "rp-react-page-host",
                dangerouslySetInnerHTML: { __html: existingHtml }
            })
        );
    } catch (error) {
        // Fail open to server-rendered HTML instead of leaving users with an empty page.
        mainNode.innerHTML = existingHtml;
        delete mainNode.dataset.reactBridgeMounted;
    }
})();
