(function () {
    var themedMaps = [];
    var analyticsCharts = {};
    var reportMarkerIcon = null;

    function getTileLayerDefinition() {
        return {
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            options: {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap contributors"
            }
        };
    }

    function createBaseTileLayer() {
        var definition = getTileLayerDefinition();
        return L.tileLayer(definition.url, definition.options);
    }

    function getReportMarkerIcon() {
        if (!window.L) {
            return null;
        }

        if (!reportMarkerIcon) {
            reportMarkerIcon = L.divIcon({
                className: "rp-map-pin-icon-wrapper",
                html: '<span class="rp-map-pin-icon" aria-hidden="true"></span>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
            });
        }

        return reportMarkerIcon;
    }

    function registerThemedMap(map, layer) {
        themedMaps.push({ map: map, layer: layer });
    }

    function refreshThemedMaps() {
        if (!window.L || !themedMaps.length) {
            return;
        }

        themedMaps.forEach(function (entry) {
            if (entry.layer) {
                entry.map.removeLayer(entry.layer);
            }
            entry.layer = createBaseTileLayer();
            entry.layer.addTo(entry.map);
        });
    }

    function setStageStatus(node, text, tone, state) {
        if (!node) {
            return;
        }

        if (typeof text === "string") {
            node.hidden = text.length === 0;
        }

        if (typeof text === "string") {
            node.textContent = text;
        }

        if (tone) {
            node.dataset.tone = tone;
        } else {
            delete node.dataset.tone;
        }

        if (state) {
            node.dataset.state = state;
        } else {
            delete node.dataset.state;
        }
    }

    function markStageReady(stageNode, statusNode, emptyMessage) {
        if (!statusNode) {
            return;
        }

        if (emptyMessage) {
            setStageStatus(statusNode, emptyMessage, "warning");
            statusNode.hidden = false;
            return;
        }

        // Analytics charts pass "" to avoid showing a success label.
        if (emptyMessage === "") {
            setStageStatus(statusNode, "", null, null);
            statusNode.hidden = true;
            return;
        }

        setStageStatus(statusNode, "Ready", null, "ready");
        statusNode.hidden = false;
    }

    function readJson(id) {
        var node = document.getElementById(id);
        if (!node) {
            return [];
        }

        try {
            return JSON.parse(node.textContent);
        } catch (error) {
            return [];
        }
    }

    function animateCountUps(prefersReducedMotion) {
        var counters = document.querySelectorAll("[data-count-up]");
        counters.forEach(function (node, index) {
            var target = parseFloat(node.dataset.countUp || "");
            if (Number.isNaN(target)) {
                return;
            }

            var decimals = parseInt(node.dataset.decimals || (String(target).includes(".") ? "2" : "0"), 10);
            var suffix = node.dataset.suffix || "";
            if (prefersReducedMotion) {
                node.textContent = (decimals > 0 ? target.toFixed(decimals) : Math.round(target)) + suffix;
                return;
            }

            var duration = 900;
            var startAt = performance.now() + index * 70;

            function render(now) {
                var elapsed = Math.max(0, now - startAt);
                var progress = Math.min(1, elapsed / duration);
                var eased = 1 - Math.pow(1 - progress, 3);
                var value = target * eased;

                node.textContent = (decimals > 0 ? value.toFixed(decimals) : Math.round(value)) + suffix;
                if (progress < 1) {
                    requestAnimationFrame(render);
                }
            }

            requestAnimationFrame(render);
        });
    }

    function initAnalyticsDashboard() {
        var statusCanvas = document.getElementById("statusChart");
        var categoryCanvas = document.getElementById("categoryChart");
        var trendCanvas = document.getElementById("trendChart");

        if (!window.Chart || (!statusCanvas && !categoryCanvas && !trendCanvas)) {
            return;
        }

        Object.keys(analyticsCharts).forEach(function (key) {
            if (analyticsCharts[key]) {
                analyticsCharts[key].destroy();
            }
        });
        analyticsCharts = {};

        var statusLabels = readJson("status-labels-data");
        var statusValues = readJson("status-values-data");
        var categoryLabels = readJson("category-labels-data");
        var categoryValues = readJson("category-values-data");
        var trendLabels = readJson("trend-labels-data");
        var trendValues = readJson("trend-values-data");
        var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var chartAnimationDuration = prefersReducedMotion ? 0 : 1100;

        animateCountUps(prefersReducedMotion);

        var hasStatusData = statusValues.some(function (value) { return value > 0; });
        var hasCategoryData = categoryValues.some(function (value) { return value > 0; });
        var hasTrendData = trendValues.some(function (value) { return value > 0; });

        var fallbackStatusLabels = ["No Data"];
        var fallbackStatusValues = [1];
        var fallbackCategoryLabels = ["No Data"];
        var fallbackCategoryValues = [1];
        var fallbackTrendLabels = ["No Data"];
        var fallbackTrendValues = [0];
        var chartGridColor = "rgba(16, 42, 67, 0.16)";
        var chartLabelColor = "#18334d";
        var chartBorderColor = "#ffffff";
        var statusPalette = ["#155E75", "#0F766E", "#D48B39", "#102A43"];
        var categoryPalette = ["rgba(21,94,117,0.82)", "rgba(15,118,110,0.78)", "rgba(212,139,57,0.74)", "rgba(16,42,67,0.72)", "rgba(122,145,164,0.7)"];

        Array.prototype.forEach.call(document.querySelectorAll("[data-chart-state]"), function (node) {
            setStageStatus(node, "Rendering chart...");
        });

        var chartStateNodes = {
            status: document.querySelector("[data-chart-card='status'] [data-chart-state]"),
            category: document.querySelector("[data-chart-card='category'] [data-chart-state]"),
            trend: document.querySelector("[data-chart-card='trend'] [data-chart-state]")
        };
        var chartStageNodes = {
            status: null,
            category: null,
            trend: null
        };

        function chartDelay(context) {
            if (prefersReducedMotion) {
                return 0;
            }
            return (context.dataIndex || 0) * 80 + (context.datasetIndex || 0) * 70;
        }

        if (statusCanvas) {
            analyticsCharts.status = new Chart(statusCanvas, {
                type: "doughnut",
                data: {
                    labels: hasStatusData ? statusLabels : fallbackStatusLabels,
                    datasets: [{
                        data: hasStatusData ? statusValues : fallbackStatusValues,
                        backgroundColor: hasStatusData
                            ? statusPalette
                            : ["#cbd5e1"],
                        borderWidth: 2,
                        borderColor: chartBorderColor
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: chartAnimationDuration,
                        easing: "easeOutQuart",
                        delay: chartDelay
                    },
                    plugins: {
                        legend: {
                            position: "bottom",
                            labels: { usePointStyle: true, boxWidth: 10, color: chartLabelColor }
                        }
                    }
                }
            });
            markStageReady(chartStageNodes.status, chartStateNodes.status, hasStatusData ? "" : "No status data in this range.");
        }

        if (categoryCanvas) {
            analyticsCharts.category = new Chart(categoryCanvas, {
                type: "polarArea",
                data: {
                    labels: hasCategoryData ? categoryLabels : fallbackCategoryLabels,
                    datasets: [{
                        data: hasCategoryData ? categoryValues : fallbackCategoryValues,
                        backgroundColor: hasCategoryData
                            ? categoryPalette
                            : ["rgba(148,163,184,0.65)"],
                        borderColor: chartBorderColor,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: chartAnimationDuration,
                        easing: "easeOutQuart",
                        delay: chartDelay
                    },
                    plugins: {
                        legend: {
                            position: "bottom",
                            labels: { usePointStyle: true, boxWidth: 10, color: chartLabelColor }
                        }
                    },
                    scales: {
                        r: {
                            grid: { color: chartGridColor },
                            ticks: { backdropColor: "transparent", color: chartLabelColor },
                            angleLines: { color: chartGridColor },
                            pointLabels: { color: chartLabelColor }
                        }
                    }
                }
            });
            markStageReady(chartStageNodes.category, chartStateNodes.category, hasCategoryData ? "" : "No category data in this range.");
        }

        if (trendCanvas) {
            analyticsCharts.trend = new Chart(trendCanvas, {
                type: "line",
                data: {
                    labels: hasTrendData ? trendLabels : fallbackTrendLabels,
                    datasets: [{
                        label: "Reports",
                        data: hasTrendData ? trendValues : fallbackTrendValues,
                        borderColor: "#155E75",
                        backgroundColor: "rgba(21, 94, 117, 0.18)",
                        fill: true,
                        tension: 0.35,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: "#D48B39"
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: chartAnimationDuration,
                        easing: "easeOutQuart",
                        delay: chartDelay
                    },
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { color: "transparent" },
                            ticks: { color: chartLabelColor }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0, color: chartLabelColor },
                            grid: { color: chartGridColor }
                        }
                    }
                }
            });
            markStageReady(chartStageNodes.trend, chartStateNodes.trend, hasTrendData ? "" : "No trend data in this range.");
        }
    }

    function initReportMapPreviews() {
        if (!window.L) {
            return;
        }

        var mapNodes = document.querySelectorAll("[data-report-map-preview]");
        mapNodes.forEach(function (node) {
            var latitude = parseFloat(node.dataset.lat || "");
            var longitude = parseFloat(node.dataset.lng || "");
            if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
                return;
            }

            var map = L.map(node, {
                zoomControl: false,
                attributionControl: false,
                scrollWheelZoom: false,
                dragging: false,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
                touchZoom: false
            }).setView([latitude, longitude], 13);

            var baseLayer = createBaseTileLayer();
            baseLayer.addTo(map);
            registerThemedMap(map, baseLayer);

            L.marker([latitude, longitude], { icon: getReportMarkerIcon() }).addTo(map);

            setTimeout(function () {
                map.invalidateSize();
            }, 0);
        });
    }

    function initReportDetailMap() {
        if (!window.L) {
            return;
        }

        var mapElement = document.querySelector("[data-report-detail-map]");
        if (!mapElement) {
            return;
        }

        var mapStage = null;
        var mapStatus = mapElement ? mapElement.parentElement.querySelector("[data-map-status]") : null;

        var latitude = parseFloat(mapElement.dataset.lat || "");
        var longitude = parseFloat(mapElement.dataset.lng || "");
        var zoom = parseInt(mapElement.dataset.zoom || "14", 10);
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
            markStageReady(mapStage, mapStatus, "Map coordinates are unavailable.");
            return;
        }

        var map = L.map(mapElement).setView([latitude, longitude], zoom);
        var baseLayer = createBaseTileLayer();
        baseLayer.addTo(map);
        registerThemedMap(map, baseLayer);
        L.marker([latitude, longitude], { icon: getReportMarkerIcon() }).addTo(map);
        markStageReady(mapStage, mapStatus);
    }

    function initReportDetailInteractions() {
        var parentInput = document.getElementById("id_parent");
        var commentTextInput = document.getElementById("id_text");

        document.querySelectorAll(".reply-btn").forEach(function (button) {
            button.addEventListener("click", function () {
                if (!parentInput || !commentTextInput) {
                    return;
                }
                parentInput.value = button.dataset.replyId;
                commentTextInput.focus();
                commentTextInput.placeholder = "Write your reply...";
            });
        });

        document.querySelectorAll(".mention-text").forEach(function (node) {
            var content = node.textContent || "";
            node.innerHTML = content.replace(/(^|\s)@(\w+)/g, '$1<span class="font-semibold text-indigo-600">@$2</span>');
        });

        document.querySelectorAll(".edit-comment-btn").forEach(function (button) {
            button.addEventListener("click", function () {
                var updated = window.prompt("Edit comment", button.dataset.text || "");
                if (updated === null) {
                    return;
                }

                var form = document.createElement("form");
                form.method = "post";
                form.action = button.dataset.url;

                var csrf = document.querySelector("input[name='csrfmiddlewaretoken']");
                var tokenInput = document.createElement("input");
                tokenInput.type = "hidden";
                tokenInput.name = "csrfmiddlewaretoken";
                tokenInput.value = csrf ? csrf.value : "";

                var textInput = document.createElement("input");
                textInput.type = "hidden";
                textInput.name = "text";
                textInput.value = updated;

                form.appendChild(tokenInput);
                form.appendChild(textInput);
                document.body.appendChild(form);
                form.submit();
            });
        });
    }

    function initSubmitReportMap() {
        if (!window.L) {
            return;
        }

        var latitudeInput = document.getElementById("id_latitude");
        var longitudeInput = document.getElementById("id_longitude");
        var locationInput = document.getElementById("id_location");
        var mapHost = document.querySelector("[data-report-location-map]");
        var coordinatesLabel = document.getElementById("map-coordinates");
        var searchInput = document.getElementById("map-search-query");
        var searchButton = document.getElementById("map-search-button");
        var currentLocationButton = document.getElementById("map-current-location");
        var clearPinButton = document.getElementById("map-clear-pin");
        var pinIndicator = document.getElementById("map-pin-indicator");
        var feedbackNode = document.getElementById("map-feedback");
        var mapStage = null;
        var mapStatus = mapHost ? mapHost.parentElement.querySelector("[data-map-status]") : null;

        if (!mapHost || !latitudeInput || !longitudeInput) {
            return;
        }

        var defaultCenter = [
            parseFloat(mapHost.dataset.defaultLat || "23.685"),
            parseFloat(mapHost.dataset.defaultLng || "90.3563")
        ];
        var defaultZoom = parseInt(mapHost.dataset.defaultZoom || "7", 10);
        var selectedZoom = parseInt(mapHost.dataset.selectedZoom || "14", 10);
        var initialLat = parseFloat(latitudeInput.value);
        var initialLng = parseFloat(longitudeInput.value);
        var hasExistingPin = !Number.isNaN(initialLat) && !Number.isNaN(initialLng);
        var activeSearchController = null;

        if (locationInput && !locationInput.dataset.autofilled) {
            locationInput.dataset.autofilled = "false";
            locationInput.addEventListener("input", function () {
                locationInput.dataset.autofilled = "false";
            });
        }

        var map = L.map(mapHost, {
            minZoom: 2,
            worldCopyJump: true
        }).setView(hasExistingPin ? [initialLat, initialLng] : defaultCenter, hasExistingPin ? 13 : defaultZoom);
        var baseLayer = createBaseTileLayer();
        baseLayer.addTo(map);
        registerThemedMap(map, baseLayer);

        setTimeout(function () {
            map.invalidateSize();
        }, 0);

        var marker = null;

        function clampLatitude(value) {
            return Math.max(-90, Math.min(90, value));
        }

        function clampLongitude(value) {
            return Math.max(-180, Math.min(180, value));
        }

        function updatePinIndicator(isActive) {
            if (!pinIndicator) {
                return;
            }
            pinIndicator.classList.toggle("is-active", !!isActive);
        }

        function setCoordinatesText(lat, lng) {
            if (coordinatesLabel) {
                coordinatesLabel.textContent = "Lat " + lat.toFixed(6) + ", Lng " + lng.toFixed(6);
            }
        }

        function maybeAutofillLocationName(lat, lng) {
            if (!locationInput) {
                return;
            }

            var shouldOverwrite = !locationInput.value.trim() || locationInput.dataset.autofilled === "true";
            if (!shouldOverwrite) {
                return;
            }

            fetch(
                "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat="
                    + encodeURIComponent(lat.toFixed(6))
                    + "&lon="
                    + encodeURIComponent(lng.toFixed(6))
                    + "&addressdetails=1"
            )
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error("reverse geocode failed");
                    }
                    return response.json();
                })
                .then(function (result) {
                    var addressText = (result && result.display_name) ? String(result.display_name).trim() : "";
                    if (!addressText) {
                        return;
                    }

                    var canApply = !locationInput.value.trim() || locationInput.dataset.autofilled === "true";
                    if (canApply) {
                        locationInput.value = addressText;
                        locationInput.dataset.autofilled = "true";
                    }
                })
                .catch(function () {
                    // Manual pin placement still works when reverse lookup is unavailable.
                });
        }

        function setFeedback(text, tone) {
            if (!feedbackNode) {
                return;
            }

            feedbackNode.textContent = text;
            feedbackNode.classList.remove("text-rose-600", "text-amber-700", "text-emerald-700", "text-slate-500");

            if (tone === "danger") {
                feedbackNode.classList.add("text-rose-600");
            } else if (tone === "warning") {
                feedbackNode.classList.add("text-amber-700");
            } else if (tone === "success") {
                feedbackNode.classList.add("text-emerald-700");
            } else {
                feedbackNode.classList.add("text-slate-500");
            }
        }

        function setPin(lat, lng, shouldCenterMap, source) {
            if (Number.isNaN(lat) || Number.isNaN(lng)) {
                setFeedback("Could not place the pin because coordinates were invalid.", "danger");
                return;
            }

            var safeLat = clampLatitude(lat);
            var safeLng = clampLongitude(lng);

            if (marker) {
                marker.setLatLng([safeLat, safeLng]);
            } else {
                marker = L.marker([safeLat, safeLng], {
                    icon: getReportMarkerIcon(),
                    draggable: true,
                    autoPan: true,
                }).addTo(map);
                marker.on("dragend", function () {
                    var dropped = marker.getLatLng();
                    setPin(dropped.lat, dropped.lng, false, "drag");
                });
            }

            latitudeInput.value = safeLat.toFixed(6);
            longitudeInput.value = safeLng.toFixed(6);
            setCoordinatesText(safeLat, safeLng);
            updatePinIndicator(true);

            if (source === "drag") {
                setFeedback("Pin moved. Coordinates updated.", "success");
            } else if (source === "search") {
                setFeedback("Location found and pinned on the map.", "success");
            } else if (source === "current") {
                setFeedback("Your current location has been pinned.", "success");
            } else {
                setFeedback("Pin placed. You can drag it for finer accuracy.", "success");
            }

            maybeAutofillLocationName(safeLat, safeLng);

            if (shouldCenterMap) {
                map.setView([safeLat, safeLng], selectedZoom);
            }

            setStageStatus(mapStatus, "Pin updated", null, "ready");
        }

        function clearPin() {
            if (marker) {
                map.removeLayer(marker);
                marker = null;
            }
            latitudeInput.value = "";
            longitudeInput.value = "";
            updatePinIndicator(false);
            if (coordinatesLabel) {
                coordinatesLabel.textContent = "No pin selected yet";
            }
            setFeedback("Pin cleared. Search, click the map, or use device location to place a new one.", "warning");
            setStageStatus(mapStatus, "Awaiting pin", "warning");
        }

        map.on("click", function (event) {
            setPin(event.latlng.lat, event.latlng.lng, false, "click");
        });

        if (hasExistingPin) {
            setPin(initialLat, initialLng, false, "initial");
        } else {
            updatePinIndicator(false);
        }

        markStageReady(mapStage, mapStatus);

        function searchLocation() {
            var query = (searchInput && searchInput.value || "").trim();
            if (!query) {
                setFeedback("Enter an address or area name before searching.", "warning");
                return;
            }
            if (query.length < 3) {
                setFeedback("Type at least 3 characters for better search results.", "warning");
                return;
            }

            if (activeSearchController) {
                activeSearchController.abort();
            }
            activeSearchController = window.AbortController ? new AbortController() : null;

            setFeedback("Searching for that location...", null);
            setStageStatus(mapStatus, "Searching map...", null);

            fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query), {
                signal: activeSearchController ? activeSearchController.signal : undefined
            })
                .then(function (response) { return response.json(); })
                .then(function (items) {
                    if (!items || !items.length) {
                        setFeedback("No matching location found. Try a broader place name or nearby landmark.", "warning");
                        setStageStatus(mapStatus, "Search finished", null, "ready");
                        return;
                    }
                    var item = items[0];
                    var lat = parseFloat(item.lat);
                    var lng = parseFloat(item.lon);
                    if (Number.isNaN(lat) || Number.isNaN(lng)) {
                        setFeedback("That result could not be placed on the map.", "danger");
                        setStageStatus(mapStatus, "Search finished", null, "ready");
                        return;
                    }

                    setPin(lat, lng, true, "search");
                    setStageStatus(mapStatus, "Search finished", null, "ready");
                    if (locationInput && (!locationInput.value.trim() || locationInput.dataset.autofilled === "true")) {
                        locationInput.value = item.display_name || query;
                        locationInput.dataset.autofilled = "true";
                    }
                })
                .catch(function (error) {
                    if (error && error.name === "AbortError") {
                        return;
                    }
                    setFeedback("Search is unavailable right now. You can still click the map to place a pin manually.", "danger");
                    setStageStatus(mapStatus, "Search finished", null, "ready");
                })
                .finally(function () {
                    activeSearchController = null;
                });
        }

        if (searchButton) {
            searchButton.addEventListener("click", searchLocation);
        }

        if (searchInput) {
            searchInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    searchLocation();
                }
            });
        }

        if (currentLocationButton) {
            currentLocationButton.addEventListener("click", function () {
                if (!navigator.geolocation) {
                    setFeedback("This browser does not support device location. Search or click the map instead.", "warning");
                    return;
                }

                setFeedback("Trying to detect your current location...", null);
                setStageStatus(mapStatus, "Detecting location...", null);

                navigator.geolocation.getCurrentPosition(function (position) {
                    setPin(position.coords.latitude, position.coords.longitude, true, "current");
                    setStageStatus(mapStatus, "Location found", null, "ready");
                }, function () {
                    setFeedback("Location permission was denied or unavailable. Search or click the map instead.", "danger");
                    setStageStatus(mapStatus, "Location unavailable", "danger");
                }, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 30000
                });
            });
        }

        if (clearPinButton) {
            clearPinButton.addEventListener("click", clearPin);
        }
    }

    initAnalyticsDashboard();

    window.rpUpdateAnalyticsCharts = function (statusLabels, statusValues, trendLabels, trendValues, trendHeading) {
        if (analyticsCharts.status) {
            analyticsCharts.status.data.labels = statusLabels;
            analyticsCharts.status.data.datasets[0].data = statusValues;
            analyticsCharts.status.update();
        }
        if (analyticsCharts.trend) {
            analyticsCharts.trend.data.labels = trendLabels;
            analyticsCharts.trend.data.datasets[0].data = trendValues;
            analyticsCharts.trend.update();
        }
        var headingEl = document.getElementById("trend-chart-heading");
        if (headingEl) {
            headingEl.textContent = trendHeading;
        }
    };

    initReportMapPreviews();
    initReportDetailMap();
    initReportDetailInteractions();
    initSubmitReportMap();
})();