(function () {
    var body = document.body;
    if (!body) {
        return;
    }

    var shellConfig = {
        notificationsUrl: body.dataset.notificationsUrl || "/notifications/",
        unreadApiUrl: body.dataset.unreadApiUrl || "",
        reportDetailTemplate: body.dataset.reportDetailTemplate || "",
        serviceWorkerUrl: body.dataset.serviceWorkerUrl || "/static/sw.js"
    };

    function getReportUrl(reportId) {
        if (!reportId) {
            return shellConfig.notificationsUrl;
        }

        if (shellConfig.reportDetailTemplate) {
            return shellConfig.reportDetailTemplate.replace("/0/", "/" + reportId + "/");
        }

        return "/report/" + reportId + "/";
    }

    function initThemeDefaults() {
        var themeMeta = document.querySelector("meta[name='theme-color']");
        if (themeMeta) {
            var isDark = document.documentElement.classList.contains("dark");
            themeMeta.setAttribute("content", isDark ? "#0b1220" : "#155E75");
        }
    }

    function initToastAutoDismiss() {
        var toasts = document.querySelectorAll(".toast-item");
        if (!toasts.length) {
            return;
        }

        toasts.forEach(function (toast, index) {
            setTimeout(function () {
                toast.classList.add("opacity-0", "transition", "duration-500");
                setTimeout(function () {
                    toast.remove();
                }, 500);
            }, 2500 + index * 300);
        });
    }

    function initMenuBehavior() {
        var menu = document.querySelector("[data-js-menu]");
        var summary = menu ? menu.querySelector("summary") : null;
        var firstMenuItem = menu ? menu.querySelector("[data-menu-item]") : null;
        if (!menu) {
            return;
        }

        function syncMenuExpandedState() {
            if (summary) {
                summary.setAttribute("aria-expanded", String(menu.open));
            }
        }

        menu.addEventListener("toggle", function () {
            syncMenuExpandedState();
            if (menu.open && firstMenuItem) {
                window.requestAnimationFrame(function () {
                    firstMenuItem.focus();
                });
            }
        });

        syncMenuExpandedState();

        document.addEventListener("click", function (event) {
            if (menu.open && !menu.contains(event.target)) {
                menu.open = false;
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                menu.open = false;
                if (summary) {
                    summary.focus();
                }
            }
        });
    }

    function initAccessibleFormFeedback() {
        document.querySelectorAll("[data-field-error-for]").forEach(function (node, index) {
            var fieldId = node.dataset.fieldErrorFor;
            var input = document.getElementById(fieldId);
            if (!input) {
                return;
            }

            if (!node.id) {
                node.id = fieldId + "-error-" + index;
            }

            input.setAttribute("aria-invalid", "true");
            node.setAttribute("role", "alert");

            var describedBy = input.getAttribute("aria-describedby");
            var parts = describedBy ? describedBy.split(/\s+/).filter(Boolean) : [];
            if (parts.indexOf(node.id) === -1) {
                parts.push(node.id);
                input.setAttribute("aria-describedby", parts.join(" "));
            }
        });

        document.querySelectorAll("[data-field-help-for]").forEach(function (node, index) {
            var fieldId = node.dataset.fieldHelpFor;
            var input = document.getElementById(fieldId);
            if (!input) {
                return;
            }

            if (!node.id) {
                node.id = fieldId + "-help-" + index;
            }

            var describedBy = input.getAttribute("aria-describedby");
            var parts = describedBy ? describedBy.split(/\s+/).filter(Boolean) : [];
            if (parts.indexOf(node.id) === -1) {
                parts.push(node.id);
                input.setAttribute("aria-describedby", parts.join(" "));
            }
        });
    }

    function initSmartForms() {
        var forms = document.querySelectorAll("form:not([data-no-loading])");
        forms.forEach(function (form) {
            var method = (form.getAttribute("method") || "get").toLowerCase();
            if (method !== "post") {
                return;
            }

            form.addEventListener("submit", function () {
                var submitButtons = form.querySelectorAll('button[type="submit"]');
                submitButtons.forEach(function (button) {
                    if (button.disabled) {
                        return;
                    }
                    if (!button.dataset.originalText) {
                        button.dataset.originalText = button.textContent.trim();
                    }
                    button.disabled = true;
                    button.classList.add("opacity-70", "cursor-not-allowed");
                    button.textContent = button.dataset.loadingText || "Please wait...";
                });
            });
        });
    }

    function initLiveReportFilter() {
        var titleInput = document.getElementById("title");
        var filterInput = document.getElementById("filter");
        var cards = document.querySelectorAll("[data-report-card]");
        if (!cards.length || !titleInput || !filterInput) {
            return;
        }

        function applyFilter() {
            var query = (titleInput.value || "").trim().toLowerCase();
            var selected = filterInput.value;
            var selectedStatus = selected === "pending" ? "submitted" : selected;

            cards.forEach(function (card) {
                var title = (card.dataset.title || "").toLowerCase();
                var status = card.dataset.status || "";
                var ageDays = parseInt(card.dataset.ageDays || "0", 10);
                var titleMatch = !query || title.includes(query);
                var statusMatch = false;

                if (selectedStatus === "newest") {
                    statusMatch = true;
                } else if (selectedStatus === "attention") {
                    statusMatch = status !== "resolved" && ageDays >= 5;
                } else {
                    statusMatch = status === selectedStatus;
                }

                card.classList.toggle("hidden", !(titleMatch && statusMatch));
            });
        }

        titleInput.addEventListener("input", applyFilter);
        filterInput.addEventListener("change", applyFilter);
        applyFilter();
    }

    function initReactionPickers() {
        document.querySelectorAll("[data-reaction-form]").forEach(function (form) {
            var reactionInput = form.querySelector("[data-reaction-input]");
            if (!reactionInput) {
                return;
            }

            form.querySelectorAll("[data-reaction-option]").forEach(function (button) {
                button.addEventListener("click", function (event) {
                    event.preventDefault();
                    reactionInput.value = button.dataset.reactionOption || "like";
                    if (typeof form.requestSubmit === "function") {
                        form.requestSubmit();
                    } else {
                        form.submit();
                    }
                });
            });
        });
    }

    function previewMedia(input, previewElement, wrapperElement, type, emptyStateElement) {
        if (!input || !previewElement || !wrapperElement) {
            return;
        }

        input.addEventListener("change", function () {
            var file = input.files && input.files[0];
            if (!file) {
                previewElement.removeAttribute("src");
                wrapperElement.classList.add("hidden");
                if (emptyStateElement) {
                    emptyStateElement.classList.remove("hidden");
                }
                return;
            }

            if (type === "image" && !file.type.startsWith("image/")) {
                return;
            }

            if (type === "video" && !file.type.startsWith("video/")) {
                return;
            }

            var objectUrl = URL.createObjectURL(file);
            previewElement.src = objectUrl;
            wrapperElement.classList.remove("hidden");
            if (emptyStateElement) {
                emptyStateElement.classList.add("hidden");
            }
        });
    }

    function initFilePreviews() {
        var imageInput = document.getElementById("id_image");
        var imagePreview = document.getElementById("image-preview");
        var imagePreviewWrapper = document.getElementById("image-preview-wrapper");
        var imageEmptyState = document.getElementById("image-empty-state");
        previewMedia(imageInput, imagePreview, imagePreviewWrapper, "image", imageEmptyState);

        var videoInput = document.getElementById("id_video");
        var videoPreview = document.getElementById("video-preview");
        var videoPreviewWrapper = document.getElementById("video-preview-wrapper");
        var videoEmptyState = document.getElementById("video-empty-state");
        previewMedia(videoInput, videoPreview, videoPreviewWrapper, "video", videoEmptyState);

        var profileInput = document.getElementById("id_profile_image");
        var profilePreview = document.getElementById("profile-photo-preview");
        var profileFallback = document.getElementById("profile-photo-fallback");
        if (profileInput && profilePreview) {
            profileInput.addEventListener("change", function () {
                var file = profileInput.files && profileInput.files[0];
                if (!file || !file.type.startsWith("image/")) {
                    return;
                }
                profilePreview.src = URL.createObjectURL(file);
                profilePreview.classList.remove("hidden");
                if (profileFallback) {
                    profileFallback.classList.add("hidden");
                }
            });
        }
    }

    function updateNotificationBadge(count) {
        var anchors = document.querySelectorAll("[data-notification-link]");
        if (!anchors.length) {
            return;
        }

        anchors.forEach(function (anchor) {
            var badge = anchor.querySelector("[data-unread-badge]");
            var isSidebarLink = anchor.classList.contains("rp-sidebar-link") || anchor.dataset.sidebarLink === "true";

            if (count > 0) {
                if (!badge) {
                    badge = document.createElement("span");
                    badge.setAttribute("data-unread-badge", "true");
                    anchor.appendChild(badge);
                }

                if (isSidebarLink) {
                    badge.className = "ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white";
                } else {
                    badge.className = "absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white";
                }

                badge.textContent = count;
            } else if (badge) {
                badge.remove();
            }

            anchor.setAttribute("aria-label", count > 0 ? "Notifications, " + count + " unread" : "Notifications");
        });
    }

    function showRealtimeNotification(message, reportId) {
        var containerId = "realtime-toast-container";
        var container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement("div");
            container.id = containerId;
            container.className = "fixed right-4 top-4 z-50 space-y-2";
            container.setAttribute("aria-live", "polite");
            container.setAttribute("aria-atomic", "true");
            document.body.appendChild(container);
        }

        var toast = document.createElement("a");
        toast.href = getReportUrl(reportId);
        toast.className = "block max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow transition hover:bg-slate-50";
        toast.textContent = message;
        toast.setAttribute("role", "status");
        container.appendChild(toast);

        setTimeout(function () {
            toast.classList.add("opacity-0", "transition", "duration-500");
            setTimeout(function () {
                toast.remove();
            }, 500);
        }, 3500);
    }

    function initRealtimeNotifications() {
        var notificationAnchors = document.querySelectorAll("[data-notification-link]");
        if (!notificationAnchors.length || !shellConfig.unreadApiUrl) {
            return;
        }

        var pollTimer = null;

        function pollUnread() {
            fetch(shellConfig.unreadApiUrl, { headers: { "X-Requested-With": "XMLHttpRequest" } })
                .then(function (response) { return response.json(); })
                .then(function (data) {
                    updateNotificationBadge(data.unread_count || 0);
                })
                .catch(function () {});
        }

        function startPolling() {
            if (pollTimer) {
                return;
            }
            pollUnread();
            pollTimer = setInterval(pollUnread, 15000);
        }

        function stopPolling() {
            if (!pollTimer) {
                return;
            }
            clearInterval(pollTimer);
            pollTimer = null;
        }

        if (!("WebSocket" in window)) {
            startPolling();
            return;
        }

        var wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
        var wsUrl = wsProtocol + "://" + window.location.host + "/ws/notifications/";
        var socket;
        var hasOpenedSocket = false;
        var reconnectAttempts = 0;
        var maxReconnectAttempts = 1;

        function scheduleReconnect() {
            if (reconnectAttempts >= maxReconnectAttempts) {
                return;
            }
            reconnectAttempts += 1;
            setTimeout(connect, 3000);
        }

        function connect() {
            socket = new WebSocket(wsUrl);

            socket.onopen = function () {
                hasOpenedSocket = true;
                reconnectAttempts = 0;
                stopPolling();
            };

            socket.onmessage = function (event) {
                try {
                    var data = JSON.parse(event.data);
                    if (typeof data.unread_count === "number") {
                        updateNotificationBadge(data.unread_count);
                    }
                    if (data.type === "new" && data.message) {
                        showRealtimeNotification(data.message, data.report_id);
                    }
                } catch (error) {}
            };

            socket.onclose = function () {
                startPolling();
                if (hasOpenedSocket) {
                    scheduleReconnect();
                }
            };

            socket.onerror = function () {
                startPolling();

                if (socket && socket.readyState !== WebSocket.CLOSED) {
                    socket.close();
                }

                if (!hasOpenedSocket) {
                    reconnectAttempts = maxReconnectAttempts;
                }
            };
        }

        connect();
    }

    function initPwa() {
        if (!("serviceWorker" in navigator) || !shellConfig.serviceWorkerUrl) {
            return;
        }

        var hostname = window.location.hostname;
        var isHttps = window.location.protocol === "https:";
        var isLocalDevHost = hostname === "localhost" || hostname === "127.0.0.1";
        var isPrivateNetworkHost = /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

        // Avoid service workers on HTTP or private-network dev hosts where stale caches often cause blank pages.
        if (!isHttps || isLocalDevHost || isPrivateNetworkHost) {
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
                registrations.forEach(function (registration) {
                    registration.unregister();
                });
            }).catch(function () {});
            return;
        }

        if ("serviceWorker" in navigator && shellConfig.serviceWorkerUrl) {
            window.addEventListener("load", function () {
                var hasRefreshedForSw = false;

                navigator.serviceWorker.addEventListener("controllerchange", function () {
                    if (hasRefreshedForSw) {
                        return;
                    }
                    hasRefreshedForSw = true;
                    window.location.reload();
                });

                navigator.serviceWorker
                    .register(shellConfig.serviceWorkerUrl)
                    .then(function (registration) {
                        if (registration.waiting) {
                            registration.waiting.postMessage({ type: "SKIP_WAITING" });
                        }

                        registration.addEventListener("updatefound", function () {
                            var installingWorker = registration.installing;
                            if (!installingWorker) {
                                return;
                            }

                            installingWorker.addEventListener("statechange", function () {
                                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                                    installingWorker.postMessage({ type: "SKIP_WAITING" });
                                }
                            });
                        });

                        registration.update().catch(function () {});
                    })
                    .catch(function () {});
            });
        }
    }

    function initMicroInteractions() {
        var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var revealSelectors = [
            "[data-reveal]",
            "main section.rounded-2xl",
            "main article.rounded-2xl",
            "main div.rounded-2xl.bg-white",
            "[data-report-card]",
            "[data-chart-panel]",
            "#toast-container .toast-item"
        ];

        var revealTargets = [];
        var seen = new Set();

        revealSelectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (node) {
                if (seen.has(node)) {
                    return;
                }
                seen.add(node);
                node.setAttribute("data-reveal", "");
                revealTargets.push(node);
            });
        });

        document.querySelectorAll("[data-stagger-parent]").forEach(function (parent) {
            parent.querySelectorAll("[data-stagger-item]").forEach(function (item, index) {
                item.style.setProperty("--stagger-index", String(index));
            });
        });

        if (prefersReducedMotion || !("IntersectionObserver" in window)) {
            revealTargets.forEach(function (item) {
                item.classList.add("is-revealed");
            });
        } else {
            var revealObserver = new IntersectionObserver(function (entries, observer) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) {
                        return;
                    }
                    entry.target.classList.add("is-revealed");
                    observer.unobserve(entry.target);
                });
            }, {
                threshold: 0.12,
                rootMargin: "0px 0px -6% 0px"
            });

            revealTargets.forEach(function (item) {
                revealObserver.observe(item);
            });
        }

        document.querySelectorAll("button, a.rounded-lg, a.rounded-md").forEach(function (node) {
            node.addEventListener("pointerdown", function () {
                node.classList.add("pressing");
            });
            node.addEventListener("pointerup", function () {
                node.classList.remove("pressing");
            });
            node.addEventListener("pointerleave", function () {
                node.classList.remove("pressing");
            });
        });

        if (!prefersReducedMotion && window.matchMedia("(pointer: fine)").matches) {
            document.querySelectorAll("[data-report-card]").forEach(function (card) {
                card.addEventListener("mousemove", function (event) {
                    var bounds = card.getBoundingClientRect();
                    var x = ((event.clientX - bounds.left) / bounds.width) * 100;
                    var y = ((event.clientY - bounds.top) / bounds.height) * 100;
                    card.style.setProperty("--mx", x.toFixed(2) + "%");
                    card.style.setProperty("--my", y.toFixed(2) + "%");
                });
            });
        }
    }

    function initNavbarMicroInteractions() {
        var menu = document.querySelector("[data-js-menu]");
        if (!menu) {
            return;
        }

        var menuItems = menu.querySelectorAll("[data-menu-item]");
        menuItems.forEach(function (item, index) {
            item.style.setProperty("--menu-index", String(index));
        });

        menu.addEventListener("toggle", function () {
            if (!menu.open) {
                return;
            }
            menu.classList.add("is-opening");
            setTimeout(function () {
                menu.classList.remove("is-opening");
            }, 280);
        });
    }

    function initSidebarToggle() {
        var toggleButtons = document.querySelectorAll("[data-sidebar-toggle]");
        if (!toggleButtons.length) {
            return;
        }

        var sidebar = document.getElementById("app-sidebar");
        if (!sidebar) {
            return;
        }

        var storageKey = "rpSidebarHidden";
        var desktopMedia = window.matchMedia("(min-width: 768px)");

        function readSavedState() {
            try {
                return localStorage.getItem(storageKey) === "1";
            } catch (error) {
                return false;
            }
        }

        function writeSavedState(hidden) {
            try {
                localStorage.setItem(storageKey, hidden ? "1" : "0");
            } catch (error) {
                // Ignore storage access issues.
            }
        }

        function applyState(hidden, persist) {
            var shouldHide = desktopMedia.matches && hidden;
            body.classList.toggle("rp-sidebar-hidden", shouldHide);

            toggleButtons.forEach(function (button) {
                var label = button.querySelector("[data-sidebar-toggle-label]");
                var nextAction = shouldHide ? "Show menu" : "Hide menu";
                button.setAttribute("aria-expanded", String(!shouldHide));
                button.setAttribute("aria-label", nextAction);
                if (label) {
                    label.textContent = nextAction;
                }
            });

            if (persist) {
                writeSavedState(hidden);
            }
        }

        toggleButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                var hidden = !body.classList.contains("rp-sidebar-hidden");
                applyState(hidden, true);
            });
        });

        applyState(readSavedState(), false);

        desktopMedia.addEventListener("change", function (event) {
            if (!event.matches) {
                body.classList.remove("rp-sidebar-hidden");
                applyState(false, false);
                return;
            }

            applyState(readSavedState(), false);
        });
    }

    function initSidebarDebugMode() {
        var searchParams;
        try {
            searchParams = new URLSearchParams(window.location.search);
        } catch (error) {
            return;
        }

        if (searchParams.get("sidebarDebug") === "1") {
            body.classList.add("rp-sidebar-debug");
        }
    }

    function initCollapsedSidebarTooltips() {
        var sidebar = document.getElementById("app-sidebar");
        if (!sidebar) {
            return;
        }

        var targets = sidebar.querySelectorAll(".rp-desktop-sidebar nav a, .rp-desktop-sidebar form button");
        if (!targets.length) {
            return;
        }

        var desktopMedia = window.matchMedia("(min-width: 768px)");
        var tooltipNode = null;

        function ensureTooltipNode() {
            if (tooltipNode) {
                return tooltipNode;
            }

            tooltipNode = document.createElement("div");
            tooltipNode.className = "rp-collapsed-tooltip";
            tooltipNode.setAttribute("role", "status");
            tooltipNode.setAttribute("aria-live", "polite");
            document.body.appendChild(tooltipNode);
            return tooltipNode;
        }

        function isCollapsedDesktop() {
            return desktopMedia.matches && body.classList.contains("rp-sidebar-hidden");
        }

        function resolveLabel(node) {
            return (
                node.getAttribute("data-sidebar-label") ||
                node.getAttribute("title") ||
                (node.querySelector("span") ? node.querySelector("span").textContent : "") ||
                ""
            ).trim();
        }

        function hideTooltip() {
            if (!tooltipNode) {
                return;
            }
            tooltipNode.classList.remove("is-visible");
        }

        function showTooltip(node) {
            if (!isCollapsedDesktop()) {
                hideTooltip();
                return;
            }

            var label = resolveLabel(node);
            if (!label) {
                hideTooltip();
                return;
            }

            var tip = ensureTooltipNode();
            tip.textContent = label;

            var rect = node.getBoundingClientRect();
            var left = Math.round(rect.right + 10);
            var top = Math.round(rect.top + rect.height / 2);
            var maxLeft = window.innerWidth - tip.offsetWidth - 12;

            tip.style.left = Math.max(12, Math.min(left, maxLeft)) + "px";
            tip.style.top = top + "px";
            tip.classList.add("is-visible");
        }

        targets.forEach(function (node) {
            node.addEventListener("mouseenter", function () {
                showTooltip(node);
            });
            node.addEventListener("focus", function () {
                showTooltip(node);
            });
            node.addEventListener("mouseleave", hideTooltip);
            node.addEventListener("blur", hideTooltip);
        });

        window.addEventListener("resize", hideTooltip);
        window.addEventListener("scroll", hideTooltip, true);
        desktopMedia.addEventListener("change", hideTooltip);
    }

    initThemeDefaults();
    initSidebarToggle();
    initNavbarMicroInteractions();
    initMenuBehavior();
    initAccessibleFormFeedback();
    initSmartForms();
    initLiveReportFilter();
    initReactionPickers();
    initMicroInteractions();
    initFilePreviews();
    initToastAutoDismiss();
    initRealtimeNotifications();
    initSidebarDebugMode();
    initCollapsedSidebarTooltips();
    initPwa();
})();