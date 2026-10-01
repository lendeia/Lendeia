// ==================================================================
// FILE TYPE : COMPONENT (shared)
// PURPOSE   :
//   Small embedded map showing exactly where an item is — used on both
//   Details.jsx and Receipt.jsx. Always shows the real pin (no
//   "locked until accepted" state, removed by earlier explicit
//   request). Interaction is now a deliberate "tap to move map"
//   overlay rather than always-on dragging: starting fully non-
//   interactive is what fixed a real mobile bug (dragging enabled by
//   default fought with the page's own scroll, causing a stuck/jumpy
//   feeling), but a small reference map with NO way to ever pan it at
//   all is also a real limitation — this keeps the fix for the first
//   problem while solving the second: nothing steals a scroll gesture
//   until someone deliberately taps to start interacting.
//   Also shows the VIEWER'S OWN location (a distinct blue dot, not the
//   item's own red pin) whenever location is available, so it's
//   possible to actually see how far away the item is, not just where
//   it is in isolation. Silently omitted if location isn't granted —
//   the site-wide banner (MainLayout.jsx's LocationBanner) is already
//   the one consistent place that asks for it, this doesn't duplicate
//   that prompt.
// CONNECTS TO :
//   Used by Details.jsx and Receipt.jsx. state/location/locationStore's
//   useMyLocation() for the viewer's own position.
// ==================================================================
import React, { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Hand } from "lucide-react";
import { useMyLocation } from "../../state/location/locationStore";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function useLeafletForMap() {
  const [ready, setReady] = useState(!!window.L);
  useEffect(() => {
    if (window.L) { setReady(true); return; }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const check = setInterval(() => { if (window.L) { setReady(true); clearInterval(check); } }, 100);
      return () => clearInterval(check);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => setReady(true);
    document.body.appendChild(script);
  }, []);
  return ready;
}

/**
 * @param {{ lat: number, lng: number, label?: string }} props
 */
export default function ItemLocationMap({ lat, lng, label }) {
  const ready = useLeafletForMap();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const myMarkerRef = useRef(null);
  const [activated, setActivated] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const { coords: myCoords } = useMyLocation();

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = window.L;
    // Starts fully non-interactive (see file header) — activated by
    // the explicit tap overlay below, not on mount.
    const map = L.map(containerRef.current, { zoomControl: true, dragging: false, scrollWheelZoom: false, tap: false }).setView([lat, lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    L.marker([lat, lng]).addTo(map).bindPopup(label || "This item");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [ready, lat, lng, label]);

  // The viewer's own position — added/updated separately from the
  // item's own marker above so it can appear or move independently
  // (location can be granted well after the map first renders).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const L = window.L;
    if (myMarkerRef.current) {
      map.removeLayer(myMarkerRef.current);
      myMarkerRef.current = null;
    }
    if (myCoords) {
      const youIcon = L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#4B8CE0;border:2px solid white;box-shadow:0 0 0 2px rgba(75,140,224,0.35)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      myMarkerRef.current = L.marker([myCoords.lat, myCoords.lng], { icon: youIcon, zIndexOffset: -100 })
        .addTo(map)
        .bindPopup("You are here");
      // Frames both pins together only once, right when the viewer's
      // own location first becomes available — not on every re-render,
      // so panning around manually afterward doesn't keep getting
      // reset back to this framing.
      map.fitBounds([[lat, lng], [myCoords.lat, myCoords.lng]], { padding: [30, 30], maxZoom: 15 });
    }
  }, [myCoords, lat, lng]);

  // Leaflet needs an explicit nudge after its container's size changes
  // programmatically (the Extend button below) — it has no way to
  // detect a CSS-driven resize on its own, and would otherwise keep
  // rendering tiles sized for the OLD box while visually sitting in
  // the new, bigger one (showing as a blank/empty area, which is what
  // "it won't show" turned out to be). A single fixed-delay timeout
  // guessing when the CSS transition finishes is fragile — a slower
  // device/browser could still be mid-transition when it fires,
  // leaving Leaflet measuring the wrong, in-between size. Listening for
  // the transition's own real end event is exact regardless of device
  // speed; the extra immediate + fallback calls are cheap insurance
  // for the (rare) cases a transitionend event doesn't fire at all.
  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    map.invalidateSize();
    const onTransitionEnd = (e) => {
      if (e.propertyName === "height") map.invalidateSize();
    };
    el.addEventListener("transitionend", onTransitionEnd);
    const fallback = setTimeout(() => map.invalidateSize(), 350);
    return () => {
      el.removeEventListener("transitionend", onTransitionEnd);
      clearTimeout(fallback);
    };
  }, [expanded]);

  const activate = () => {
    const map = mapRef.current;
    if (!map) return;
    map.dragging.enable();
    setActivated(true);
  };

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[13px] font-medium text-[#17231D]">Item location</p>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[11.5px] text-[#4B5D46] font-medium"
        >
          {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          {expanded ? "Shrink map" : "Extend map"}
        </button>
      </div>
      <div className="relative">
        <div
          ref={containerRef}
          className={`w-full rounded-xl overflow-hidden ring-1 ring-[#17231D]/[0.08] isolate transition-[height] duration-200 ${
            expanded ? "h-80" : "h-44"
          }`}
          style={{ background: "#E4E0D0" }}
        />
        {!activated && (
          <button
            onClick={activate}
            className="absolute inset-0 flex items-center justify-center bg-[#17231D]/5 backdrop-blur-[1px]"
          >
            <span className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white shadow text-[12.5px] font-medium text-[#17231D]">
              <Hand size={13} /> Tap to move map
            </span>
          </button>
        )}
      </div>
      <p className="text-[11.5px] text-[#8A9089] mt-1.5">
        Location as pinned by the owner.
        {myCoords && <span> The blue dot is your current location.</span>}
      </p>
    </div>
  );
}
