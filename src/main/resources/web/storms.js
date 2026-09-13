/* Wither Storm BlueMap: a separate live layer using BlueMap's native PlayerMarker. */
(() => {
    "use strict";
    if (window.__witherStormBlueMap) return;
    window.__witherStormBlueMap = true;
    const SET_ID = "kncraft-wither-storms";
    const scriptUrl = document.currentScript?.src || new URL("witherstorm-bluemap/storms.js", document.baseURI);
    const feedUrl = new URL("live.json", scriptUrl);
    const assetUrl = name => {
        const url = new URL(name, scriptUrl);
        url.search = new URL(scriptUrl).search;
        return url.href;
    };
    const iconUrl = assetUrl("storm.png");
    const witherUrl = assetUrl("wither.png");
    const failedCustomIcons = new Set();
    let sourceSignature;
    let lastStamp = null;
    let lastChange = performance.now();
    let failed = false;
    let StormSet;

    function iconSettings(value = {}) {
        const number = (value, fallback, min, max) => Number.isFinite(value) && value >= min && value <= max ? value : fallback;
        return {
            sizePixels: number(value?.sizePixels, 40, 8, 256),
            scaleWithZoom: value?.scaleWithZoom !== false,
            zoomScaleFactor: number(value?.zoomScaleFactor, 0.5, 0.05, 4),
            showPhaseNumber: value?.showPhaseNumber !== false,
            showHoverLabel: value?.showHoverLabel !== false,
            showPhaseInLabel: value?.showPhaseInLabel !== false,
            showSideHeads: value?.showSideHeads !== false,
            customIcon: value?.customIcon,
            phaseIcons: value?.phaseIcons || {}
        };
    }

    function customIconUrl(value) {
        if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
        try {
            const url = new URL(value.trim(), document.baseURI);
            if (!["https:", "http:"].includes(url.protocol) || failedCustomIcons.has(url.href)) return null;
            // Preserve custom query strings, including signed image URLs.
            return url.href;
        } catch { return null; }
    }

    function updateSize(marker) {
        const settings = marker.stormSettings;
        const distance = marker.element.getAttribute("distance-data");
        const zoomedOut = settings.scaleWithZoom && (distance === "med" || distance === "far");
        const size = settings.sizePixels * (zoomedOut ? settings.zoomScaleFactor : 1);
        const pixels = `${size}px`;
        if (marker.stormIcon.style.width !== pixels) {
            marker.stormIcon.style.width = pixels;
            marker.stormIcon.style.height = pixels;
            marker.stormPhase.style.fontSize = `${Math.max(10, Math.min(24, size * 0.3))}px`;
        }
    }

    function updateAppearance(marker, storm, settings) {
        marker.stormData = storm;
        marker.stormSettings = settings;
        const phase = Number.isInteger(storm.phase) && storm.phase >= 0 && storm.phase <= 7 ? storm.phase : -1;
        const early = phase === 0 || phase === 1;
        const hybrid = phase === 2 || phase === 3;
        const custom = customIconUrl(settings.phaseIcons[`phase${phase}`]) || customIconUrl(settings.customIcon);
        const single = !!custom || !settings.showSideHeads || phase < 0 || storm.otherHeadsDisabled === true;
        const mainUrl = custom || (early ? witherUrl : iconUrl);
        const sideUrl = early || hybrid ? witherUrl : iconUrl;
        marker.stormCustomIcon = custom;
        if (marker.playerHeadElement.src !== mainUrl) marker.playerHeadElement.src = mainUrl;
        marker.data.playerHead = mainUrl;
        marker.element.setAttribute("data-storm-phase", String(phase));
        marker.stormIcon.classList.toggle("single-head", single);
        for (const side of marker.stormSideHeads) {
            if (side.src !== sideUrl) side.src = sideUrl;
            side.hidden = single;
        }
        marker.stormPhase.textContent = phase < 0 ? "" : String(phase);
        marker.stormPhase.hidden = !settings.showPhaseNumber;
        updateSize(marker);
        return phase < 0 ? "" : `Phase ${phase}`;
    }

    function apply(app, data) {
        const BlueMap = window.BlueMap;
        const settings = iconSettings(data.icons);
        const signature = JSON.stringify([settings.customIcon, settings.phaseIcons]);
        if (sourceSignature !== signature) { failedCustomIcons.clear(); sourceSignature = signature; }
        if (!StormSet) {
            StormSet = class extends BlueMap.MarkerSet {
                // Ordinary marker polls must not overwrite the faster live positions.
                updateFromData(value) {
                    this.data.label = "Wither Storms";
                    this.data.toggleable = true;
                    this.data.defaultHide = !!value.defaultHidden;
                }
            };
        }
        const root = app.mapViewer.markers;
        let set = root.markerSets.get(SET_ID);
        if (!(set instanceof StormSet)) {
            const visible = set ? set.visible : !data.defaultHidden;
            if (set) root.remove(set);
            set = new StormSet(SET_ID);
            set.visible = visible;
            set.updateFromData(data);
            root.add(set);
        }
        const mapId = app.mapViewer.map?.data.id;
        const present = new Set();
        for (const storm of data.maps[mapId] || []) {
            if (typeof storm.uuid !== "string" || !/^[0-9a-f-]{36}$/i.test(storm.uuid)) continue;
            if (![storm.position?.x, storm.position?.y, storm.position?.z].every(Number.isFinite)) continue;
            const id = "storm-" + storm.uuid;
            present.add(id);
            let marker = set.markers.get(id);
            if (!marker) {
                marker = new BlueMap.PlayerMarker(id, storm.uuid, iconUrl);
                // Keep native animation without presenting storms as real players in the menu.
                marker.data.type = "witherstorm";
                marker.element.classList.add("witherstorm-marker");
                const owner = marker.element.ownerDocument;
                // Own image failures so a custom URL can never fall back to a Steve head.
                const mainHead = marker.playerHeadElement.cloneNode(false);
                marker.playerHeadElement.replaceWith(mainHead);
                marker.playerHeadElement = mainHead;
                mainHead.addEventListener("error", () => {
                    if (!marker.stormCustomIcon) return;
                    failedCustomIcons.add(marker.stormCustomIcon);
                    updateAppearance(marker, marker.stormData, marker.stormSettings);
                });
                marker.stormIcon = owner.createElement("span");
                marker.stormIcon.className = "witherstorm-icon";
                marker.playerHeadElement.before(marker.stormIcon);
                marker.playerHeadElement.classList.add("witherstorm-main-head");
                marker.stormIcon.append(marker.playerHeadElement);
                marker.stormSideHeads = ["left", "right"].map(side => {
                    const head = owner.createElement("img");
                    head.className = `witherstorm-side-head ${side}`;
                    head.alt = "";
                    head.draggable = false;
                    marker.stormIcon.prepend(head);
                    return head;
                });
                marker.stormPhase = owner.createElement("span");
                marker.stormPhase.className = "witherstorm-phase";
                marker.stormPhase.setAttribute("aria-hidden", "true");
                marker.stormIcon.append(marker.stormPhase);
                const nativeBeforeRender = marker.onBeforeRender.bind(marker);
                marker.onBeforeRender = (renderer, scene, camera) => {
                    nativeBeforeRender(renderer, scene, camera);
                    updateSize(marker);
                };
                set.add(marker);
            }
            const phaseLabel = updateAppearance(marker, storm, settings);
            // BlueMap accepts HTML in names; never pass entity names to that sink.
            marker.updateFromData({
                uuid: storm.uuid, name: "Wither Storm", foreign: false,
                position: {x: storm.position.x, y: storm.position.y - 1.8, z: storm.position.z},
                rotation: {yaw: 0, pitch: 0, roll: 0}
            });
            const label = settings.showPhaseInLabel && phaseLabel ? `${storm.name} [${phaseLabel}]` : storm.name;
            marker.playerNameElement.textContent = label;
            marker.playerNameElement.hidden = !settings.showHoverLabel;
            marker.playerHeadElement.alt = label;
            marker.data.name = label;
            marker.data.label = label;
            marker.element.title = settings.showHoverLabel ? label : "";
        }
        for (const [id, marker] of set.markers) {
            if (!present.has(id)) set.remove(marker);
        }
    }

    async function poll() {
        const app = window.bluemap;
        if (app?.mapViewer?.map && window.BlueMap?.PlayerMarker && window.BlueMap?.MarkerSet) {
            try {
                const url = new URL(feedUrl);
                url.searchParams.set("t", Date.now());
                const response = await fetch(url, {cache: "no-store", signal: AbortSignal.timeout(5000)});
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (data.schema !== 1 || !data.maps || !Number.isFinite(data.generatedAt)) throw new Error("Invalid live feed");
                if (lastStamp !== data.generatedAt) { lastStamp = data.generatedAt; lastChange = performance.now(); }
                // Expire a frozen feed after a crash without depending on client/server clock agreement.
                if (performance.now() - lastChange > 15000) data.maps = {};
                apply(app, data);
                failed = false;
            } catch (error) {
                apply(app, {maps: {}});
                if (!failed) console.warn("Wither Storm BlueMap live feed unavailable", error);
                failed = true;
            }
        }
        setTimeout(poll, 1000); // Same polling cadence as native BlueMap player markers.
    }
    poll();
})();
