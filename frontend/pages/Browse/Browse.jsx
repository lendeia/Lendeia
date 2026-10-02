// ==================================================================
// FILE TYPE : PAGE (contains 1 merged sub-component)
// PURPOSE   :
//   Full equipment browsing page: search box, category chips, price/distance
//   filter dropdowns, sort toggle, results grid. Distance filtering/sorting
//   is now REAL — it used to silently do nothing, since every listing's
//   `distance` field was a hardcoded 0 (see backend/supabase/listings.js's
//   old mapListingRow comment). Real distance needs the VIEWER's own
//   coordinates (state/location/locationStore.jsx), requested via an
//   explicit "Enable location" button rather than automatically.
// CONNECTS TO :
//   Reads useListings() and useMyLocation(). FilterDropdown below is a
//   small reusable dropdown local to this file only.
// ==================================================================
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, ChevronDown, LocateFixed, Store as StoreIcon, MapPin } from "lucide-react";
import { searchPeople, MIN_PEOPLE_QUERY } from "../../../backend/supabase/people";
import ListingCard from "../../components/ListingCard";
import { CATEGORIES } from "../../../shared/constants";
import { useLocalListings } from "../../../state/listings/useLocalListings";
import { useMyLocation } from "../../../state/location/locationStore";
import { useSavedListings } from "../../../state/saved/savedStore";
import { distanceKm } from "../../../shared/geo";
import { countryName, countryFlag, formatLocation, isInViewerCountry } from "../../../shared/countries";
import { getRatingsForListings } from "../../../backend/supabase/reviews";

// Category as a single dropdown option list, matching the same shape
// FilterDropdown already expects for price/distance — "All" first,
// matching what setCat's default state and the filtering logic below
// already treat as "no category filter."
const CATEGORY_OPTIONS = ["All", ...CATEGORIES.map((c) => c.name)];

const PRICE_RANGES = [
  { label: "Any price", min: 0, max: Infinity },
  { label: "Under ₱250", min: 0, max: 250 },
  { label: "₱250 – ₱500", min: 250, max: 500 },
  { label: "₱500 – ₱1000", min: 500, max: 1000 },
  { label: "Over ₱1000", min: 1000, max: Infinity },
];

// Capped at 5 km by default. (Home's "near you" section uses its own,
// tighter 1 km radius — these are two independent settings, not meant
// to match.)
const DISTANCE_RANGES = [
  { label: "Within 1 km", max: 1 },
  { label: "Within 2 km", max: 2 },
  { label: "Within 5 km", max: 5 },
  { label: "No limit", max: Infinity },
];
const DEFAULT_DISTANCE_IDX = 2; // "Within 5 km"

// ---- SECTION: sub-component — generic reusable dropdown (used for price + distance filters) ----
function FilterDropdown({ label, options, selected, onSelect, renderLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isActive = selected !== 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] border transition-colors ${
          isActive
            ? "border-[#E2932E] bg-[#E2932E]/8 text-[#17231D] font-medium"
            : "border-[#17231D]/12 text-[#6b6f66]"
        }`}
      >
        {renderLabel ? renderLabel(options[selected]) : options[selected].label ?? options[selected]}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-30 min-w-[170px] rounded-xl border border-[#17231D]/10 bg-white shadow-lg py-1.5">
          {options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => {
                onSelect(idx);
                setOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2 text-[13.5px] hover:bg-[#17231D]/[0.04] transition-colors ${
                idx === selected ? "text-[#17231D] font-medium" : "text-[#6b6f66]"
              }`}
            >
              {opt.label ?? opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- SECTION: MAIN component — Browse page (search/filter/sort listings) ----
export default function Browse({ openItem, visitStore, initialSearch, initialCategory }) {
  // Items are limited to the viewer's own country (profile country, else the
  // country their location is in). With neither known, all countries show.
  const { listings, viewerCountry } = useLocalListings();
  const { savedIds, toggleSave } = useSavedListings();
  const { coords: myCoords, loading: locating, error: locationError, requestLocation } = useMyLocation();

  // Fade/slide-in transition on mount — makes navigating here (e.g.
  // from Home's search) feel like a real transition instead of an
  // instant, jarring page swap. A short timeout (not 0ms) so the
  // browser actually paints the "before" state first and the
  // transition has something to animate from.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Auto-request location on load, by request — see Home.jsx's matching
  // comment for the same change.
  useEffect(() => {
    if (!myCoords) requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [cat, setCat] = useState(initialCategory || "All");
  // Sort toggle (Distance/Price) removed by request — see the always-
  // sort-by-distance-when-known comment in `filtered` below.
  // Two separate searches that never mix: "items" filters listings (name,
  // brand, category...), "people" looks up shops and @usernames. Each
  // keeps its own text, so switching tabs doesn't carry one search over
  // to the other.
  const startsWithAt = !!initialSearch && initialSearch.trim().startsWith("@");
  const [mode, setMode] = useState(startsWithAt ? "people" : "items"); // "items" | "people"
  const [peopleQuery, setPeopleQuery] = useState(startsWithAt ? initialSearch.trim() : "");
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState(null);
  const peopleSearchable = peopleQuery.trim().replace(/^@+/, "").trim().length >= MIN_PEOPLE_QUERY;

  // Debounced lookup; the `cancelled` flag drops a slow, outdated
  // response so results can never belong to an older query.
  useEffect(() => {
    if (mode !== "people") return undefined;
    setPeopleError(null);
    if (!peopleSearchable) {
      setPeople([]);
      setPeopleLoading(false);
      return undefined;
    }
    let cancelled = false;
    setPeopleLoading(true);
    const timer = setTimeout(() => {
      searchPeople(peopleQuery)
        .then((rows) => { if (!cancelled) setPeople(rows.filter((r) => isInViewerCountry(r.countryCode, viewerCountry))); })
        .catch((err) => { if (!cancelled) { setPeople([]); setPeopleError(err.message || "Search failed. Please try again."); } })
        .finally(() => { if (!cancelled) setPeopleLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, peopleQuery, peopleSearchable, viewerCountry]);

  const [search, setSearch] = useState(startsWithAt ? "" : (initialSearch || ""));
  // Re-sync if navigated here again from Home with a new search term —
  // a plain useState initializer only runs once on mount, so without
  // this, searching a second time from Home while already on Browse
  // wouldn't update anything.
  useEffect(() => {
    // A search that starts with "@" is a username lookup (e.g. typed on
    // Home's search bar), so it opens the Shops & people tab instead.
    if (initialSearch && initialSearch.trim().startsWith("@")) {
      setMode("people");
      setPeopleQuery(initialSearch.trim());
      return;
    }
    if (initialSearch) setSearch(initialSearch);
  }, [initialSearch]);
  // Same re-sync reasoning for category — clicking a different category
  // on Home while already on Browse should actually update the filter.
  useEffect(() => {
    if (initialCategory) setCat(initialCategory);
  }, [initialCategory]);
  const [priceIdx, setPriceIdx] = useState(0);
  const [distanceIdx, setDistanceIdx] = useState(DEFAULT_DISTANCE_IDX);
  // Country filter — "All countries" by default, so nothing is hidden, but a
  // renter can narrow to one country. Only countries that actually have an
  // active listing are offered. Index 0 = all (FilterDropdown's convention).
  const [countryIdx, setCountryIdx] = useState(0);

  // Real ratings for every visible listing, fetched in one batched query
  // (same pattern already used by MapPage.jsx's pins) rather than trusting
  // the always-0 `rating` field that used to ship on every listing object.
  const [ratingsById, setRatingsById] = useState({});
  useEffect(() => {
    const ids = listings.map((l) => l.id);
    if (!ids.length) return;
    let cancelled = false;
    getRatingsForListings(ids)
      .then((map) => { if (!cancelled) setRatingsById(map); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [listings]);

  // Real per-listing distance from the viewer — null when either side's
  // coordinates aren't available (no location permission yet, or the
  // listing itself has none), rather than a fabricated 0.
  const listingsWithDistance = useMemo(() => {
    return listings.map((l) => {
      const rating = ratingsById[l.id];
      return {
        ...l,
        distanceFromMe:
          myCoords && typeof l.lat === "number" && typeof l.lng === "number"
            ? distanceKm(myCoords.lat, myCoords.lng, l.lat, l.lng)
            : null,
        realRating: rating?.avgRating ?? null,
        realReviewCount: rating?.reviewCount ?? 0,
      };
    });
  }, [listings, myCoords, ratingsById]);

  const countryOptions = useMemo(() => {
    const codes = [...new Set(listings.map((l) => l.countryCode).filter(Boolean))];
    codes.sort((a, b) => countryName(a).localeCompare(countryName(b), "en"));
    return [{ label: "All countries", code: "" }, ...codes.map((code) => ({ label: `${countryFlag(code)} ${countryName(code)}`, code }))];
  }, [listings]);
  // If the chosen country disappears (its last listing was removed), fall back to "all".
  const safeCountryIdx = countryIdx < countryOptions.length ? countryIdx : 0;
  const countryFilter = countryOptions[safeCountryIdx]?.code || "";

  const filtered = useMemo(() => {
    const priceRange = PRICE_RANGES[priceIdx];
    const distanceRange = DISTANCE_RANGES[distanceIdx];
    let list = cat === "All" ? listingsWithDistance : listingsWithDistance.filter((e) => e.category === cat);
    if (countryFilter) list = list.filter((e) => e.countryCode === countryFilter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.name?.toLowerCase().includes(q) ||
          e.brand?.toLowerCase().includes(q) ||
          e.model?.toLowerCase().includes(q)
      );
    }

    list = list.filter((e) => {
      const price = Number(e.price) || 0;
      return price >= priceRange.min && price < priceRange.max;
    });

    // Distance filtering only applies once we actually know where the
    // viewer is — without that, a listing's distance is unknown, not
    // zero, so it stays included rather than being wrongly excluded or
    // wrongly always-included.
    if (myCoords) {
      list = list.filter((e) => e.distanceFromMe === null || e.distanceFromMe <= distanceRange.max);
    }

    // Sort control (Distance/Price toggle) was removed by request —
    // always sorts by distance when it's known (the most generally
    // useful default for a "what's near me" browse page), otherwise
    // leaves the feed's own order untouched rather than picking an
    // arbitrary substitute ordering.
    if (myCoords) {
      list = [...list].sort((a, b) => {
        if (a.distanceFromMe === null && b.distanceFromMe === null) return 0;
        if (a.distanceFromMe === null) return 1;
        if (b.distanceFromMe === null) return -1;
        return a.distanceFromMe - b.distanceFromMe;
      });
    }
    return list;
  }, [listingsWithDistance, cat, search, priceIdx, distanceIdx, myCoords, countryFilter]);

  return (
    <div className={`px-6 md:px-12 py-8 pb-24 md:pb-12 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
      <h1 className="font-serif text-[26px] md:text-[30px] text-[#17231D]">{mode === "people" ? "Find shops & people" : "Browse items"}</h1>
      {viewerCountry ? (
        <p className="text-[13px] leading-snug text-[#6b6f66] mt-2.5 mb-7">
          Showing {mode === "people" ? "shops & people" : "items"} in {countryFlag(viewerCountry)} {countryName(viewerCountry)}
        </p>
      ) : (
        <p className="text-[13px] leading-snug text-[#6b6f66] mt-2.5 mb-7">
          Showing items from every country. Set your country in Profile (or enable location) to see only items near you.
        </p>
      )}

      {/* Sticky filter panel — search, categories, and price/distance
          all stay fixed in place and usable while scrolling through
          results, instead of scrolling away with the rest of the page.
          top-[60px]/[72px] matches the fixed nav's own height (see
          MainLayout.jsx's pt-[60px]/md:pt-[72px]) so this sits directly
          below it with no gap or overlap. */}
      <div className="sticky top-[58px] md:top-[70px] -mt-2 pt-2 z-30 bg-[#FAFAF8] -mx-6 md:-mx-12 px-6 md:px-12 pb-4 border-b border-[#17231D]/8">
        {/* Search bar and the three filter dropdowns now share one row
            on desktop (stacked on mobile, where they'd otherwise be too
            cramped to tap comfortably) — previously the filters sat in
            their own separate row below the search bar. Search bar is
            now a fixed width instead of flex-1/stretching — letting it
            stretch made the group look lopsided (a wide bar next to
            three small buttons) even though the container itself was
            centered; a fixed-width group centers as one balanced unit. */}
        <div className="flex gap-2 mb-3 justify-center md:justify-start">
          {[["items", "Items"], ["people", "Shops & people"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                mode === key ? "bg-[#17231D] text-white" : "bg-[#17231D]/[0.06] text-[#17231D]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-center gap-3">
          <div className="flex items-center gap-2.5 bg-white rounded-xl px-4 py-3 border border-[#17231D]/10 w-full md:w-80 shrink-0">
            <Search size={17} className="text-[#8A9089]" />
            {mode === "items" ? (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items, e.g. Makita drill..."
                className="bg-transparent !outline-none text-[14px] w-full"
              />
            ) : (
              <input
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                placeholder="Shop name or @username"
                autoCapitalize="none"
                autoCorrect="off"
                className="bg-transparent !outline-none text-[14px] w-full"
              />
            )}
          </div>

          <div className={`flex flex-wrap items-center gap-2 md:shrink-0 ${mode === "people" ? "hidden" : ""}`}>
            <FilterDropdown
              options={CATEGORY_OPTIONS}
              selected={CATEGORY_OPTIONS.indexOf(cat)}
              onSelect={(idx) => setCat(CATEGORY_OPTIONS[idx])}
            />
            {!viewerCountry && countryOptions.length > 2 && (
              <FilterDropdown
                options={countryOptions}
                selected={safeCountryIdx}
                onSelect={setCountryIdx}
              />
            )}
            <FilterDropdown
              options={PRICE_RANGES}
              selected={priceIdx}
              onSelect={setPriceIdx}
            />
            {myCoords && (
              <FilterDropdown
                options={DISTANCE_RANGES}
                selected={distanceIdx}
                onSelect={setDistanceIdx}
              />
            )}
          </div>
        </div>

        {mode === "items" && !myCoords && (
          <button
            onClick={requestLocation}
            disabled={locating}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] border border-[#4B5D46]/30 text-[#4B5D46] font-medium disabled:opacity-60 mt-3 mx-auto md:mx-0"
          >
            <LocateFixed size={14} />
            {locating ? "Locating…" : "Enable location to filter/sort by distance"}
          </button>
        )}
        {mode === "items" && locationError && <p className="text-[12px] text-red-600 mt-2">{locationError}</p>}
      </div>

      {mode === "items" ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10 mt-8">
          {filtered.length === 0 && (
            <p className="col-span-full text-[14px] text-[#6b6f66]">No items match your filters.</p>
          )}
          {filtered.map((item) => (
            <ListingCard key={item.id} item={item} onOpen={openItem} isSaved={savedIds.has(item.id)} onToggleSave={toggleSave} />
          ))}
        </div>
      ) : (
        <div className="mt-8 max-w-2xl mx-auto md:mx-0">
          {!peopleSearchable && (
            <div className="text-center md:text-left">
              <p className="text-[14px] text-[#6b6f66]">
                Search a shop name or a username.
              </p>
              <p className="text-[12.5px] text-[#8A9089] mt-1.5">Looking for equipment instead? Use the Items tab.</p>
            </div>
          )}
          {peopleSearchable && peopleLoading && <p className="text-[14px] text-[#6b6f66]">Searching…</p>}
          {peopleError && <p className="text-[14px] text-red-600">{peopleError}</p>}
          {peopleSearchable && !peopleLoading && !peopleError && people.length === 0 && (
            <p className="text-[14px] text-[#6b6f66]">No shops or people found for "{peopleQuery.trim()}".</p>
          )}
          {people.length > 0 && (
            <div className="rounded-2xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8 overflow-hidden">
              {people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => visitStore?.(p.id)}
                  className="w-full flex items-center gap-3.5 px-4 py-4 text-left hover:bg-[#17231D]/[0.03] transition-colors"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[#17231D]/8 flex items-center justify-center shrink-0">
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-serif text-[18px] text-[#17231D]">{(p.shopName || p.name || "?").charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium text-[#17231D] truncate">{p.shopName || p.name}</p>
                    <p className="text-[12.5px] text-[#6b6f66] truncate">
                      {p.shopName && <span>by {p.name}</span>}
                      {p.shopName && p.username && " · "}
                      {p.username && <span className="text-[#4B5D46] font-medium">@{p.username}</span>}
                    </p>
                    {(p.city || p.countryCode) && (
                      <p className="flex items-center gap-1 text-[12px] text-[#3c3f38] truncate mt-0.5">
                        <MapPin size={11} className="shrink-0 text-[#E2932E]" />
                        <span className="truncate">{formatLocation(p.city, p.countryCode)}</span>
                      </p>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-[12px] text-[#8A9089] shrink-0">
                    <StoreIcon size={13} />
                    {p.listingCount} item{p.listingCount === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}