// ==================================================================
// FILE TYPE : PAGE
// PURPOSE   :
//   Interactive Leaflet map of listings that have lat/lng coordinates, plus
//   browser geolocation ('you are here' marker) and a text search over pins.
// CONNECTS TO :
//   Reads useListings(). Loads Leaflet from a CDN at runtime (useLeaflet hook)
//   instead of an npm dependency. Same CDN-loading pattern is duplicated in
//   ListEquipment.jsx's map picker.
// ==================================================================
import React, { useEffect, useRef, useState } from "react";
import { Search, MapPin, LocateFixed, AlertCircle, Star, ChevronDown } from "lucide-react";
import { useListings } from "../../../state/listings/listingsStore";
import { useAuth } from "../../../state/auth/authStore";
import { getListingRatingSummary, getRatingsForListings } from "../../../backend/supabase/reviews";
import { distanceKm } from "../../../shared/geo";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// ---- SECTION: helper hook — loads Leaflet JS/CSS from CDN (duplicated in ListEquipment.jsx) ----
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

const DEFAULT_CENTER = [14.5995, 120.9842];

// ---- SECTION: MAIN component — Map page ----
export default function MapPage({ openItem }) {
  const { listings } = useListings();
  const { account } = useAuth();
  const leafletReady = useLeaflet();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);

  const [active, setActive] = useState(null);
  const [activeRating, setActiveRating] = useState({ avgRating: 0, reviewCount: 0 });

  // Real per-listing rating for whichever pin is currently selected —
  // the marker/preview card previously showed only price, and had no
  // rating at all (not even the honest-but-fake 0 placeholder some
  // other pages used before their own real-rating fixes).
  useEffect(() => {
    if (!active?.id) return;
    let cancelled = false;
    getListingRatingSummary(active.id)
      .then((r) => { if (!cancelled) setActiveRating(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active?.id]);
  const [userPos, setUserPos] = useState(null);
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState(null);
  // Distinguishes "permanently denied at the browser level" (JS can't
  // re-prompt for this — the person has to change it in their browser's
  // own site settings) from any other failure (timeout, no GPS fix
  // yet, etc.), where simply trying again can genuinely work. Shown as
  // different guidance below rather than one generic message either
  // way, which is what made it unclear how to actually fix this.
  const [locationDenied, setLocationDenied] = useState(false);
  const [search, setSearch] = useState("");

  // Real location search — geocodes a place name via Nominatim (same
  // free service already used by ListEquipment.jsx's map picker) and
  // flies the map there, dropping a distinct search-origin marker. The
  // distance radius picker below measures from this point when set,
  // falling back to the browser's own geolocation (userPos) otherwise.
  const [locationQuery, setLocationQuery] = useState("");
  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState(null);
  const searchMarkerRef = useRef(null);

  // Distance radius picker — null means "No limit" (the default).
  const RADIUS_OPTIONS = [
    { label: "1 km", value: 1 },
    { label: "2 km", value: 2 },
    { label: "5 km", value: 5 },
    { label: "No limit", value: null },
  ];
  const [radiusKm, setRadiusKm] = useState(null);
  const [showRadiusMenu, setShowRadiusMenu] = useState(false);
  const radiusMenuRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (radiusMenuRef.current && !radiusMenuRef.current.contains(e.target)) {
        setShowRadiusMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const radiusOrigin = searchOrigin || userPos;

  const handleLocationSearch = async (e) => {
    e.preventDefault();
    if (!locationQuery.trim()) return;
    setSearchingLocation(true);
    setLocationSearchError(null);
    try {
      const res = await fetch(
        `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(locationQuery.trim())}&limit=1`
      );
      const results = await res.json();
      if (!results.length) {
        setLocationSearchError("Couldn't find that location. Try a different search.");
        return;
      }
      const point = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
      setSearchOrigin(point);
      if (mapRef.current) mapRef.current.setView([point.lat, point.lng], 13);
    } catch {
      setLocationSearchError("Couldn't search right now. Please try again.");
    } finally {
      setSearchingLocation(false);
    }
  };

  const listingsWithCoords = listings.filter(
    (l) => typeof l.lat === "number" && typeof l.lng === "number"
  );
  const listingsWithoutCoords = listings.length - listingsWithCoords.length;

  // Real ratings for every pinned listing, fetched in one batched query
  // rather than one request per marker — used so each card-style pin can
  // show a genuine rating instead of the old fake/absent one.
  const [ratingsById, setRatingsById] = useState({});
  useEffect(() => {
    const ids = listingsWithCoords.map((l) => l.id);
    if (!ids.length) return;
    let cancelled = false;
    getRatingsForListings(ids)
      .then((map) => { if (!cancelled) setRatingsById(map); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support location detection.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — showing a default area instead."
            : "Couldn't detect your location — showing a default area instead."
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (!leafletReady || locating || mapRef.current || !mapContainerRef.current) return;
    const L = window.L;
    const center = userPos ? [userPos.lat, userPos.lng] : DEFAULT_CENTER;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    }).setView(center, userPos ? 13 : 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [leafletReady, locating, userPos]);

  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    const L = window.L;
    if (userMarkerRef.current) userMarkerRef.current.remove();

    // Real "this is you" marker — shows the person's actual profile
    // photo in a circular frame, not a generic dot. Falls back to their
    // first initial on a colored circle if they have no avatar set (or
    // haven't signed in with a real account yet), rather than showing a
    // broken image.
    const initial = (account?.name || "?").trim().charAt(0).toUpperCase();
    const avatarUrl = account?.avatarUrl;
    const innerHtml = avatarUrl
      ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : `<div style="width:100%;height:100%;border-radius:50%;background:#4B5D46;color:white;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;font-family:inherit;">${initial}</div>`;

    const icon = L.divIcon({
      className: "",
      html: `
        <div style="width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35), 0 0 0 2px #4B5D46;overflow:hidden;background:#4B5D46;">
          ${innerHtml}
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    userMarkerRef.current = L.marker([userPos.lat, userPos.lng], { icon, zIndexOffset: 1000 })
      .addTo(mapRef.current)
      .bindPopup(account?.name ? `${account.name} (You)` : "You are here");
  }, [userPos, account?.avatarUrl, account?.name]);

  useEffect(() => {
    if (!mapRef.current) return;
    const L = window.L;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const filtered = listingsWithCoords.filter((l) => {
      const matchesName = !search.trim() || l.name?.toLowerCase().includes(search.trim().toLowerCase());
      const withinRadius =
        !radiusKm || !radiusOrigin
          ? true
          : distanceKm(radiusOrigin.lat, radiusOrigin.lng, l.lat, l.lng) <= radiusKm;
      return matchesName && withinRadius;
    });

    filtered.forEach((item) => {
      // Escaping matters here specifically because this becomes raw
      // innerHTML via Leaflet's divIcon — unlike showing text in normal
      // JSX (which React escapes automatically), a name/photo URL
      // containing characters like < or & could otherwise break the
      // card's markup or let one attacker-controlled string affect it.
      const esc = (s) =>
        (s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const rating = ratingsById[item.id];
      const ratingHtml = rating
        ? `⭐ ${rating.avgRating} <span style="color:#8A9089;">(${rating.reviewCount})</span>`
        : `<span style="color:#8A9089;">New</span>`;
      const isActive = active?.id === item.id;

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="width:132px;background:${isActive ? "#17231D" : "#ffffff"};border-radius:12px;box-shadow:0 4px 14px rgba(23,35,29,0.28);border:1px solid rgba(23,35,29,0.1);overflow:hidden;font-family:inherit;">
            <div style="width:100%;height:74px;background:#e9e5d8;overflow:hidden;">
              <img src="${esc(item.img)}" style="width:100%;height:100%;object-fit:cover;display:block;" />
            </div>
            <div style="padding:6px 8px 8px;">
              <div style="font-size:11.5px;font-weight:600;color:${isActive ? "#F6F4EE" : "#17231D"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.name)}</div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;">
                <span style="font-size:11px;font-weight:600;color:${isActive ? "#E2932E" : "#4B5D46"};">₱${item.price}/day</span>
                <span style="font-size:10.5px;color:${isActive ? "#F6F4EE" : "#17231D"};">${ratingHtml}</span>
              </div>
            </div>
          </div>
        `,
        iconSize: [132, 118],
        iconAnchor: [66, 118],
      });

      const marker = L.marker([item.lat, item.lng], { icon }).addTo(mapRef.current);
      marker.on("click", () => setActive(item));
      markersRef.current.push(marker);
    });
  }, [listingsWithCoords, active, search, ratingsById, radiusKm, radiusOrigin]);

  // Distinct marker for the searched location (separate from the "you
  // are here" browser-geolocation marker) — only shown once a location
  // search has actually been made.
  useEffect(() => {
    if (!mapRef.current) return;
    const L = window.L;
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
    if (!searchOrigin) return;
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#E2932E;border:2px solid white;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 18],
    });
    searchMarkerRef.current = L.marker([searchOrigin.lat, searchOrigin.lng], { icon, zIndexOffset: 900 })
      .addTo(mapRef.current)
      .bindPopup("Searched location");
  }, [searchOrigin]);

  const recenterOnMe = () => {
    if (mapRef.current && userPos) {
      mapRef.current.setView([userPos.lat, userPos.lng], 14);
    }
  };

  return (
    // Mobile height needs clearance for BOTH the fixed top nav (now
    // shown on mobile too, ~60px — see MainLayout.jsx's pt-[60px]) and
    // the fixed bottom nav bar (Navbar.jsx's BottomNav, ~64-70px tall
    // with safe-area included) — Leaflet's own internal panes
    // (markers/popups render at z-index 600-700 by default) sit well
    // above either nav bar's z-index, so the map would otherwise
    // visually paint right over them on phones/tablets. 132px leaves
    // room for both; desktop is unaffected (BottomNav is md:hidden
    // there, and the existing 84px already accounts for its own top nav).
    <div className="relative isolate h-[calc(100vh-132px)] md:h-[calc(100vh-84px)]">
      <div ref={mapContainerRef} className="absolute inset-0" style={{ background: "#E4E0D0" }} />

      {(!leafletReady || locating) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F6F4EE]">
          <p className="text-[14px] text-[#6b6f66]">Loading map…</p>
        </div>
      )}

      {/* Both bars now stacked vertically (previously side by side),
          centered, wider (max-w-2xl instead of max-w-xl), and the
          radius picker is merged into the location bar itself instead
          of being a separate row underneath. */}
      <div className="fixed top-[88px] left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md flex flex-col gap-2.5 z-[900]">
        <div className="bg-white/95 backdrop-blur rounded-xl px-4 py-3 flex items-center gap-2.5 shadow-md">
          <Search size={17} className="text-[#8A9089] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings..."
            className="bg-transparent !outline-none text-[13.5px] w-full min-w-0 placeholder:text-[#8A9089]"
          />
        </div>

        {/* Location search — geocodes a place name and centers the map
            there, dropping a distinct marker. Separate from the search
            above, which only filters by LISTING name. Radius picker
            (previously its own row below) now lives at the end of this
            same bar. */}
        <form
          onSubmit={handleLocationSearch}
          ref={radiusMenuRef}
          className="relative bg-white/95 backdrop-blur rounded-xl px-4 py-3 flex items-center gap-2.5 shadow-md"
        >
          <MapPin size={17} className="text-[#8A9089] shrink-0" />
          <input
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            placeholder="Search a location..."
            className="bg-transparent !outline-none text-[13.5px] w-full min-w-0 placeholder:text-[#8A9089]"
          />
          <button type="submit" disabled={searchingLocation} className="text-[12px] font-medium text-[#4B5D46] shrink-0 disabled:opacity-50">
            {searchingLocation ? "…" : "Go"}
          </button>
          <div className="w-px h-5 bg-[#17231D]/10 shrink-0" />
          <button
            type="button"
            onClick={() => setShowRadiusMenu((v) => !v)}
            disabled={!radiusOrigin}
            className="text-[12px] font-medium text-[#17231D] shrink-0 disabled:opacity-40 flex items-center gap-1 whitespace-nowrap"
          >
            {RADIUS_OPTIONS.find((o) => o.value === radiusKm)?.label || "Radius"}
            <ChevronDown size={13} />
          </button>

          {showRadiusMenu && (
            <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg overflow-hidden z-10 min-w-[150px]">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => { setRadiusKm(opt.value); setShowRadiusMenu(false); }}
                  className={`w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#F6F4EE] transition-colors ${
                    radiusKm === opt.value ? "font-semibold text-[#17231D]" : "text-[#6b6f66]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </form>

        {!radiusOrigin && (
          <p className="text-[11px] text-[#8A9089] text-center">Search or enable location first to filter by distance</p>
        )}
      </div>

      {locationSearchError && (
        <div className="fixed top-[218px] left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md bg-white/95 backdrop-blur rounded-xl px-4 py-2.5 flex items-start gap-2 shadow-md z-[900]">
          <AlertCircle size={14} className="text-[#a15c1f] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#6b6f66]">{locationSearchError}</p>
        </div>
      )}

      {locationError && (
        <div className="fixed top-[274px] left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md bg-white/95 backdrop-blur rounded-xl px-4 py-2.5 flex items-start gap-2 shadow-md z-[900]">
          <AlertCircle size={14} className="text-[#a15c1f] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#6b6f66]">{locationError}</p>
        </div>
      )}

      {userPos && (
        <button
          onClick={recenterOnMe}
          className="absolute bottom-6 left-6 md:left-6 w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center z-[500]"
          title="Center on my location"
        >
          <LocateFixed size={18} className="text-[#17231D]" />
        </button>
      )}

      {listingsWithoutCoords > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 bg-white/95 backdrop-blur rounded-xl px-3.5 py-2 shadow-md text-[12px] text-[#6b6f66] z-[500] max-w-[240px]">
          {listingsWithoutCoords} listing{listingsWithoutCoords === 1 ? "" : "s"} not shown — published
          without a pinned location.
        </div>
      )}

      {active && (
        <div className="absolute bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-72 z-[500]">
          <button onClick={() => openItem(active)} className="w-full text-left bg-white rounded-2xl p-3 shadow-lg flex gap-3 items-center">
            <img src={active.img} className="w-16 h-16 rounded-xl object-cover bg-[#e9e5d8]" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-[#17231D] leading-tight truncate">{active.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[13px] text-[#E2932E] font-medium">₱{active.price}/day</p>
                {activeRating.reviewCount > 0 ? (
                  <span className="flex items-center gap-0.5 text-[11.5px] text-[#6b6f66]">
                    <Star size={11} className="fill-[#E2932E] text-[#E2932E]" />
                    {activeRating.avgRating} ({activeRating.reviewCount})
                  </span>
                ) : (
                  <span className="text-[11px] text-[#8A9089]">New listing</span>
                )}
              </div>
              <p className="text-[12px] text-[#6b6f66] flex items-center gap-1 truncate mt-0.5">
                <MapPin size={11} /> {active.locationFull || active.location || active.area}
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}