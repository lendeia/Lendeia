// ==================================================================
// FILE TYPE : COMPONENT (shared, new)
// PURPOSE   :
//   The full location picker — search + inline map + draggable pin +
//   fullscreen "Expand" modal — previously defined ONLY inside
//   ListEquipment.jsx and unreachable from anywhere else. Extracted here
//   unchanged so Dashboard.jsx's EditListingModal can offer the exact
//   same real location-picking experience as creating a listing,
//   instead of a plain, map-less text input.
// CONNECTS TO :
//   Used by ListEquipment.jsx and Dashboard.jsx (EditListingModal).
// ==================================================================
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Maximize2, Minimize2 } from "lucide-react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// Same CDN-based loader used on the Map page — no npm install required.
function useLeaflet() {
  const [ready, setReady] = useState(!!window.L);
  useEffect(() => {
    if (window.L) {
      setReady(true);
      return;
    }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const check = setInterval(() => {
        if (window.L) {
          setReady(true);
          clearInterval(check);
        }
      }, 100);
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

const MAP_PICKER_DEFAULT = [14.5995, 120.9842]; // Manila, PH fallback center

// Shared reverse-geocoding helper (coords -> readable address text), used
// both by "Use my current location" and by the map picker whenever a pin
// is placed/moved/searched, so the location text field always reflects
// wherever the pin actually is. Uses BigDataCloud's free client-side
// reverse-geocode endpoint (no API key, built for direct browser calls —
// Nominatim's reverse endpoint is more prone to CORS/rate-limit issues
// when hit straight from the browser, which was silently falling back to
// raw coordinates instead of a place name).
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (!res.ok) throw new Error("reverse geocode failed");
    const data = await res.json();
    const readable =
      data.locality ||
      data.city ||
      data.principalSubdivision ||
      [data.locality, data.principalSubdivision].filter(Boolean).join(", ");
    return readable || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// A single self-contained Leaflet map + draggable marker. Mounts fresh
// and destroys itself cleanly whenever it (re)mounts — this component is
// rendered in exactly one place at a time (either the inline preview box
// or the fullscreen modal), so toggling between them is a normal
// unmount/mount, never a fragile "move this DOM node" operation.
function LeafletMapBox({ coords, onPick, className, style }) {
  const leafletReady = useLeaflet();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!leafletReady || !containerRef.current) return;
    const L = window.L;
    const center = coords ? [coords.lat, coords.lng] : MAP_PICKER_DEFAULT;

    const map = L.map(containerRef.current).setView(center, coords ? 15 : 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(center, { draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      onPick({ lat, lng });
    });
    map.on("click", (e) => {
      marker.setLatLng(e.latlng);
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    requestAnimationFrame(() => map.invalidateSize());
    const t = setTimeout(() => map.invalidateSize(), 150);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [leafletReady]);

  // Reacts to the `coords` prop changing from OUTSIDE this component —
  // e.g. a location search result, or "Use my current location" —
  // by panning the map and moving the marker to match. Without this,
  // updating `coords` in state (as search does) never actually moves
  // the visible pin, since the marker was only ever positioned once
  // at creation time.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !coords) return;
    const current = markerRef.current.getLatLng();
    const moved = Math.abs(current.lat - coords.lat) > 1e-9 || Math.abs(current.lng - coords.lng) > 1e-9;
    if (!moved) return;
    markerRef.current.setLatLng([coords.lat, coords.lng]);
    mapRef.current.setView([coords.lat, coords.lng], Math.max(mapRef.current.getZoom(), 15));
  }, [coords]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className={className} style={style} />
      {!leafletReady && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[#8A9089]">
          Loading map…
        </div>
      )}
    </div>
  );
}

// Location picker shown under the location field. Offers a text search
// (geocoded via OpenStreetMap's free Nominatim API), a small inline map,
// and a fullscreen "Expand" view for finer placement. The component
// itself doesn't force a pick — that requirement is enforced by the
// caller's own validation.
export default function LocationPicker({ initialCoords, onPick, onLocationText }) {
  const [coords, setCoords] = useState(initialCoords || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const handlePick = async (c) => {
    setCoords(c);
    onPick(c);
    if (onLocationText) {
      setResolving(true);
      const address = await reverseGeocode(c.lat, c.lng);
      onLocationText(address);
      setResolving(false);
    }
  };

  const handleSearchLocation = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchQuery)}`
      );
      const results = await res.json();
      if (!results.length) {
        setSearchError("No location found for that search. Try being more specific.");
        return;
      }
      const { lat, lon } = results[0];
      handlePick({ lat: parseFloat(lat), lng: parseFloat(lon) });
    } catch {
      setSearchError("Couldn't search right now. Try clicking directly on the map instead.");
    } finally {
      setSearching(false);
    }
  };

  const searchForm = (
    <>
      <form onSubmit={handleSearchLocation} className="flex flex-wrap gap-2 mb-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search a location (e.g. a street, city, landmark)"
          className="flex-1 min-w-[140px] rounded-xl border border-[#17231D]/12 px-3 py-2 text-[13px] bg-white outline-none"
        />
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="px-3.5 py-2 rounded-xl bg-[#17231D] text-white text-[12.5px] font-medium disabled:opacity-50 shrink-0"
        >
          {searching ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="px-3 py-2 rounded-xl border border-[#17231D]/15 text-[#17231D] shrink-0 flex items-center gap-1.5 text-[12.5px] font-medium"
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {expanded ? "Close" : "Expand"}
        </button>
      </form>
      {searchError && <p className="text-[12px] text-red-600 mb-2">{searchError}</p>}
    </>
  );

  const hint = (
    <p className="text-[11.5px] text-[#8A9089] mt-1.5">
      {resolving
        ? "Updating location text…"
        : "Search above, click anywhere on the map, or drag the pin, to set your listing's location."}
    </p>
  );

  // Rendered via a portal straight into document.body — this guarantees
  // `position: fixed` actually covers the full viewport, regardless of
  // any transformed/overflow ancestor elsewhere on the page that could
  // otherwise silently trap it.
  const expandedModal = expanded
    ? createPortal(
        <div className="fixed inset-0 z-[3000]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setExpanded(false)} />
          <div className="absolute inset-3 sm:inset-6 md:inset-10 bg-white rounded-2xl p-3 sm:p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <p className="font-serif text-[16px] sm:text-[17px] text-[#17231D]">Set the listing's location</p>
              <button onClick={() => setExpanded(false)} className="text-[#6b6f66] p-1">
                <X size={20} />
              </button>
            </div>
            <div className="shrink-0">{searchForm}</div>
            <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-[#17231D]/12">
              <LeafletMapBox coords={coords} onPick={handlePick} className="w-full h-full" />
            </div>
            <div className="shrink-0">{hint}</div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div>
      {searchForm}
      <div className="w-full rounded-xl overflow-hidden border border-[#17231D]/12" style={{ height: 220 }}>
        <LeafletMapBox coords={coords} onPick={handlePick} className="w-full h-full" style={{ background: "#E4E0D0" }} />
      </div>
      {hint}
      {expandedModal}
    </div>
  );
}
