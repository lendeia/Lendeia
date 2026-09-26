// ==================================================================
// FILE TYPE : COMPONENT (shared)
// PURPOSE   :
//   Small embedded map showing exactly where an item is — used on both
//   Details.jsx and Receipt.jsx. Always shows the real pin now — this
//   previously had a "locked until the owner accepts your request"
//   safety state, removed by explicit request so the location is
//   always visible regardless of rental status.
// CONNECTS TO :
//   Used by Details.jsx and Receipt.jsx.
// ==================================================================
import React, { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = window.L;
    // dragging: false — a small reference map like this doesn't need
    // full pan/drag interaction (the main Map page is where someone
    // would actually explore), and on mobile, an embedded map with
    // dragging enabled captures touch gestures that start within its
    // bounds, fighting with the page's own scroll and causing exactly
    // the "gets stuck/jumps" feeling reported when scrolling past it.
    // Zoom buttons still work fine (they're small, precise taps, not a
    // drag gesture the page's scroll could conflict with).
    const map = L.map(containerRef.current, { zoomControl: true, dragging: false, scrollWheelZoom: false, tap: false }).setView([lat, lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    L.marker([lat, lng]).addTo(map).bindPopup(label || "This item");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [ready, lat, lng, label]);

  return (
    <div className="mt-5">
      <p className="text-[13px] font-medium text-[#17231D] mb-1.5">Item location</p>
      <div ref={containerRef} className="w-full h-44 rounded-xl overflow-hidden ring-1 ring-[#17231D]/[0.08] isolate" style={{ background: "#E4E0D0" }} />
      <p className="text-[11.5px] text-[#8A9089] mt-1.5">Location as pinned by the owner.</p>
    </div>
  );
}
