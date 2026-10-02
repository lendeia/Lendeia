// ==================================================================
// FILE TYPE : STATE — React Context provider
// PURPOSE   :
//   Holds the VIEWER's own coordinates (not any listing's), requested
//   once via the browser's geolocation permission prompt and cached in
//   memory AND in localStorage so every page that needs "distance from
//   me" (Browse, Home, Details) can reuse the same coordinates without
//   re-prompting — including after a page reload, which previously
//   reset this to null every time and made distances look like they
//   "didn't sync": a fresh reload on one page would lose location that
//   another page still remembered only because it happened not to have
//   reloaded, when in fact NEITHER page was actually persisting it.
//   Deliberately does NOT request location automatically on load —
//   only when requestLocation() is explicitly called from a button
//   click, so the browser's permission prompt only ever appears as a
//   direct response to the person asking for distance-based features,
//   not as an unexpected popup on page load. Re-reading a cached value
//   from a PAST grant is not the same as issuing a new prompt, so that
//   part is safe to do automatically on mount.
// CONNECTS TO :
//   Used by frontend/pages/Browse/Browse.jsx, Home.jsx, Details.jsx —
//   combined with shared/geo.js's distanceKm() and each listing's own
//   lat/lng (backend/supabase/listings.js) to compute real distances.
// ==================================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { reverseGeocodeFull } from "../../shared/geocode";
import { useAuth } from "../auth/authStore";

export const LocationContext = createContext({
  coords: null,
  detectedCountryCode: null,
  loading: false,
  error: null,
  requestLocation: () => {},
});

const STORAGE_KEY = "renta_last_known_location";
// Country (ISO code) worked out from the last known coordinates, cached with them.
const COUNTRY_KEY = "renta_last_known_country";
// A cached fix older than this is more likely to be stale than useful
// (someone's actual location easily changes over a day) — past this age
// we ignore the cache and wait for a fresh requestLocation() instead of
// silently showing a possibly-wrong distance.
const MAX_CACHE_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

function readCachedCoords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.lat !== "number" || typeof parsed.lng !== "number") return null;
    if (Date.now() - (parsed.savedAt || 0) > MAX_CACHE_AGE_MS) return null;
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

function writeCachedCoords(coords) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...coords, savedAt: Date.now() }));
  } catch {
    // localStorage can throw in some private-browsing modes — location
    // still works for the current session via in-memory state either way.
  }
}

export function LocationProvider({ children }) {
  const [coords, setCoords] = useState(null);
  // Country the viewer is physically in, looked up from their coordinates
  // (never from an IP guess). Used only to tell whether a listing is local.
  const [detectedCountryCode, setDetectedCountryCode] = useState(() => {
    try { return localStorage.getItem(COUNTRY_KEY) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Re-hydrate from a PAST grant on mount — this is what actually fixes
  // "doesn't sync between pages/reloads": every page (and every reload)
  // used to start from a genuinely empty state.
  useEffect(() => {
    const cached = readCachedCoords();
    if (cached) setCoords(cached);
  }, []);

  // Whenever we have coordinates, work out which country they are in (one
  // small lookup per change; the answer is cached so reloads don't repeat it).
  useEffect(() => {
    if (!coords) return undefined;
    let cancelled = false;
    reverseGeocodeFull(coords.lat, coords.lng).then((place) => {
      if (cancelled || !place.countryCode) return;
      setDetectedCountryCode(place.countryCode);
      try { localStorage.setItem(COUNTRY_KEY, place.countryCode); } catch { /* private mode */ }
    });
    return () => { cancelled = true; };
  }, [coords]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location detection.");
      return;
    }
    setLoading(true);
    setError(null);

    // Defensive fallback timeout — enableHighAccuracy can leave a
    // device with weak/no GPS signal (common indoors) hanging well past
    // the browser's own 10s timeout without ever firing either
    // callback, which is exactly what left the button stuck on
    // "Locating…" forever with no way out. This guarantees the UI
    // always resolves one way or another within 12 seconds, regardless
    // of whether the underlying browser API behaves.
    let settled = false;
    const fallbackTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      setError("Couldn't get your location — check that location is allowed for this site in your browser/phone settings, then try again.");
      setLoading(false);
    }, 12000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(next);
        writeCachedCoords(next);
        setLoading(false);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : "Couldn't detect your location."
        );
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  return (
    <LocationContext.Provider value={{ coords, detectedCountryCode, loading, error, requestLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useMyLocation() {
  return useContext(LocationContext);
}

/**
 * The country to treat as "the viewer's own": the country saved on their
 * profile if they set one, otherwise the country their coordinates are in.
 * null when neither is known — callers must then show NO "not local" warning
 * rather than guess.
 */
export function useViewerCountry() {
  const { account } = useAuth();
  const { detectedCountryCode } = useContext(LocationContext);
  return account?.countryCode || detectedCountryCode || null;
}
