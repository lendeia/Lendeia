// ==================================================================
// FILE TYPE : PAGE
// PURPOSE   :
//   Landing page: hero banner, search bar, category shortcuts, a preview grid
//   of listings, and static marketing sections (how it works / trust badges).
// CONNECTS TO :
//   Reads useListings() for the preview grid. Navigation via setPage()/openItem() props from App.jsx.
// ==================================================================
import React, { useState, useEffect, useMemo, useRef } from "react";
import { MapPin, Check, ChevronRight, LocateFixed, Search } from "lucide-react";
import Button from "../../components/Button";
import ListingCard from "../../components/ListingCard";
import SubscriptionModal from "../../components/SubscriptionModal";
import { SUBSCRIPTIONS_ENABLED } from "../../components/PlanCard";
import { CATEGORIES } from "../../../shared/constants";
import { useSavedListings } from "../../../state/saved/savedStore";
import cameraPhoto from "../../assets/items/camera.jpg";
import tentPhoto from "../../assets/items/tent.jpg";
import pressureWasherPhoto from "../../assets/items/pressure-washer.jpg";
import grassTrimmerPhoto from "../../assets/items/grass-trimmer.jpg";

// Same 4 real photos as Welcome.jsx's hero, same rotating-slideshow
// treatment — "the home should still applied" (i.e. get the same
// animated hero, not just a single static photo).
// Different order and a different transition style than Welcome.jsx's
// hero (which crossfades with a Ken Burns zoom) — this one slides
// horizontally instead, so the two pages don't feel like the same
// animation repeated.
const HERO_IMAGES = [tentPhoto, grassTrimmerPhoto, cameraPhoto, pressureWasherPhoto];
import { useListings } from "../../../state/listings/listingsStore";
import { useAuth } from "../../../state/auth/authStore";
import { useMyLocation } from "../../../state/location/locationStore";
import { distanceKm } from "../../../shared/geo";
import { getMySubscription } from "../../../backend/supabase/subscription";
import { getRatingsForListings } from "../../../backend/supabase/reviews";

// Matches the largest option in Browse.jsx's DISTANCE_RANGES / Map's
// RADIUS_OPTIONS (1/2/5 km) — was 10, left inconsistent with those when
// they were changed.
const NEAR_YOU_LIMIT_KM = 1;

export default function Home({ setPage, openItem, goToBrowse }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchBoxRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_IMAGES.length), 5000);
    return () => clearInterval(id);
  }, []);
  const { listings } = useListings();

  // Live name-matching suggestions as you type — previously this input
  // did nothing at all, not even hold a value.
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return listings.filter((l) => l.name?.toLowerCase().includes(q)).slice(0, 6);
  }, [searchQuery, listings]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = (query) => {
    setShowSuggestions(false);
    goToBrowse?.({ query });
  };
  const { savedIds, toggleSave } = useSavedListings();
  const { account } = useAuth();
  const { coords: myCoords, loading: locating, requestLocation } = useMyLocation();

  // Auto-request location on load, by request — previously required an
  // explicit "Enable location" click. Only fires once, and only if
  // there's no cached location already (state/location/locationStore.jsx's
  // own localStorage cache still avoids re-prompting on every visit).
  useEffect(() => {
    if (!myCoords) requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState("free");

  // Real ratings for every listing, fetched in one batched query (same
  // pattern used by Browse.jsx and MapPage.jsx's pins) rather than
  // trusting the always-0 `rating` field that used to ship on every
  // listing object — previously this section showed "0" for every card
  // while Details.jsx (fixed earlier) showed the real number for the
  // exact same item, making them look permanently out of sync.
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

  // "Equipment near you" used to just show the first 4 listings,
  // regardless of actual distance — not real "near you" at all. Now it
  // computes real distance (once location is granted) and ALWAYS caps
  // at NEAR_YOU_LIMIT_KM — the "No limit" override was removed by
  // request, so this section is always genuinely "near you."
  const nearYouListings = useMemo(() => {
    const withRating = (l) => {
      const rating = ratingsById[l.id];
      return { ...l, realRating: rating?.avgRating ?? null, realReviewCount: rating?.reviewCount ?? 0 };
    };

    if (!myCoords) return listings.slice(0, 24).map(withRating);

    const withDistance = listings
      .map((l) => ({
        ...withRating(l),
        distanceFromMe:
          typeof l.lat === "number" && typeof l.lng === "number"
            ? distanceKm(myCoords.lat, myCoords.lng, l.lat, l.lng)
            : null,
      }))
      .filter((l) => l.distanceFromMe === null || l.distanceFromMe <= NEAR_YOU_LIMIT_KM)
      .sort((a, b) => {
        if (a.distanceFromMe === null) return 1;
        if (b.distanceFromMe === null) return -1;
        return a.distanceFromMe - b.distanceFromMe;
      });
    return withDistance.slice(0, 24);
  }, [listings, myCoords, ratingsById]);

  // Category buttons now filter this same section in place, instead of
  // navigating away to Browse — "auto search by category," not a page
  // change.
  const [selectedCategory, setSelectedCategory] = useState(null);
  const visibleListings = selectedCategory
    ? nearYouListings.filter((l) => l.category === selectedCategory)
    : nearYouListings;

  useEffect(() => {
    if (!account?.id || account.isAnonymous) return;
    let cancelled = false;
    getMySubscription(account.id)
      .then((s) => { if (!cancelled) setCurrentPlanId(s.plan); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [account?.id, account?.isAnonymous]);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className={`relative h-[78vh] md:h-[86vh] overflow-hidden transition-opacity duration-1000 ${loaded ? "opacity-100" : "opacity-0"}`}>
          {/* Horizontal slide — a real carousel-style track that moves
              sideways between photos, instead of Welcome.jsx's
              crossfade+zoom. A deliberately different feel, not the
              same animation reused on a second page. */}
          <div
            className="absolute inset-0 flex transition-transform duration-[1100ms] ease-in-out"
            style={{ transform: `translateX(-${heroIdx * 100}%)` }}
          >
            {HERO_IMAGES.map((src) => (
              <img key={src} src={src} className="w-full h-full object-cover shrink-0" />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e1510]/85 via-[#0e1510]/25 to-[#0e1510]/10" />

          {/* Top center, deliberately separate from the headline block
              below — not grouped next to "Rent the items you need...". */}
          <div className={`absolute inset-x-0 top-0 pt-16 md:pt-24 px-6 flex justify-center transition-all duration-700 delay-[250ms] ${loaded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
            <div ref={searchBoxRef} className="w-full max-w-lg text-center relative">
              <h2 className="font-serif text-[#17231D] text-[17px] md:text-[19px] mb-2.5">What do you need to rent?</h2>
              <div className="flex items-center gap-1 bg-white rounded-full pl-4 pr-1.5 py-1.5">
                <input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(searchQuery); }}
                  placeholder="Search items..."
                  className="flex-1 min-w-0 bg-transparent !outline-none text-[13.5px] text-[#17231D] placeholder:text-[#8A9089]"
                />
                <button onClick={() => setPage("map")} className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-[13px] text-[#17231D] shrink-0 border-l border-[#17231D]/10">
                  <MapPin size={14} className="text-[#E2932E]" /> Near me
                </button>
                <Button variant="primary" onClick={() => runSearch(searchQuery)} className="!px-5 !py-2 shrink-0">Search</Button>
              </div>

              {/* Live "pick from existing items" suggestions — real
                  listing names that actually match what's typed, not
                  a static/decorative input. Clicking one jumps straight
                  to Browse pre-searched for it. */}
              {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute inset-x-0 top-full mt-2 bg-white rounded-xl shadow-lg overflow-hidden text-left z-10">
                  {searchSuggestions.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => runSearch(item.name)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#F6F4EE] transition-colors text-left"
                    >
                      <Search size={13} className="text-[#8A9089] shrink-0" />
                      <span className="text-[13.5px] text-[#17231D] truncate">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 px-6 md:px-12 pb-12 md:pb-16">
            <h1 className={`font-serif text-[#F6F4EE] text-[36px] leading-[1.05] tracking-[-0.01em] md:text-[64px] md:leading-[0.98] max-w-3xl transition-all duration-700 delay-200 ${loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              Rent the items you need.<br />Earn from the items you own.
            </h1>
            <p className={`text-[#F6F4EE]/80 text-[15px] md:text-[17px] mt-5 max-w-md transition-all duration-700 delay-[350ms] ${loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              Find items near you, or turn your unused items into extra income.
            </p>

            <div className={`flex flex-wrap gap-3 mt-6 transition-all duration-700 delay-500 ${loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <Button variant="accent" onClick={() => goToBrowse?.({})}>Find Items</Button>
              <Button variant="ghost" className="text-[#F6F4EE] hover:bg-[#F6F4EE]/10 border border-[#F6F4EE]/35" onClick={() => setPage("list")}>
                List Your Item
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Category buttons — moved out of the hero, now sitting close to
          "Items near you" right below, instead of grouped with the
          search bar (which moved into the hero above). */}
      <section className="px-6 md:px-12 pt-8">
        <div className="flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => {
            const active = selectedCategory === c.name;
            return (
              <button
                key={c.name}
                onClick={() => setSelectedCategory(active ? null : c.name)}
                className={`flex items-center gap-1.5 rounded-full border pl-3 pr-3.5 py-2 transition-colors ${
                  active
                    ? "bg-[#17231D] border-[#17231D] text-white"
                    : "border-[#17231D]/12 bg-white hover:border-[#E2932E] hover:bg-[#E2932E]/[0.06]"
                }`}
              >
                <span className="text-[14px]">{c.icon}</span>
                <span className={`text-[12.5px] font-medium ${active ? "text-white" : "text-[#17231D]"}`}>{c.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="px-6 md:px-12 py-10">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-serif text-[24px] md:text-[28px] text-[#17231D]">
            {selectedCategory ? `${selectedCategory} near you` : "Items near you"}
          </h2>
          <button onClick={() => goToBrowse?.({})} className="text-[13.5px] text-[#4B5D46] font-medium flex items-center gap-1">
            See all <ChevronRight size={15} />
          </button>
        </div>

        {!myCoords ? (
          <button
            onClick={requestLocation}
            disabled={locating}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[#4B5D46]/30 text-[#4B5D46] text-[13.5px] font-medium mb-6 disabled:opacity-60"
          >
            <LocateFixed size={16} />
            {locating ? "Locating…" : "Enable location to see items actually near you"}
          </button>
        ) : (
          <p className="text-[12.5px] text-[#8A9089] mb-6">
            Showing items nearby.
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10 min-h-[220px]">
          {visibleListings.length === 0 && (
            // min-h above (on the grid itself) gives this section real
            // visual presence even with nothing to show, instead of
            // collapsing down to just a couple thin lines of text —
            // centered within that space rather than sitting pinned to
            // the top-left of it.
            <div className="col-span-full flex items-center justify-center min-h-[220px]">
              <p className="text-[14px] text-[#6b6f66] text-center">
                {selectedCategory
                  ? `No ${selectedCategory.toLowerCase()} items nearby right now.`
                  : myCoords
                  ? `No items listed within ${NEAR_YOU_LIMIT_KM} km yet.`
                  : "No items listed yet — be the first to list something!"}
              </p>
            </div>
          )}
          {visibleListings.map((item) => (
            <ListingCard key={item.id} item={item} onOpen={openItem} isSaved={savedIds.has(item.id)} onToggleSave={toggleSave} />
          ))}
        </div>
      </section>

      <section className="px-6 md:px-12 py-16 bg-[#EFEBDD] mt-6">
        <h2 className="font-serif text-[26px] md:text-[30px] text-[#17231D] text-center mb-10">How it works</h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            ["Find", "Find items near you."],
            ["Rent", "Choose your dates and request the item."],
            ["Use", "Arrange pickup or delivery and use it."],
          ].map(([t, d], i) => (
            <div key={t} className="flex gap-4">
              <span className="font-serif text-[#E2932E] text-[34px] leading-none">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-medium text-[#17231D] text-[16px]">{t}</h3>
                <p className="text-[14px] text-[#6b6f66] mt-1">{d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-[14.5px] text-[#4B5D46] font-medium mt-10">For owners — List → Set your price → Earn</p>

        {/* Account-level subscription upgrade prompt — subscribing is no
            longer something you do mid-listing (see
            frontend/pages/ListEquipment/ListEquipment.jsx), so it needs a
            visible entry point on Home too, same modal as the top nav
            badge / Profile page use. */}
        {SUBSCRIPTIONS_ENABLED && account && !account.isAnonymous && (
          <div className="max-w-lg mx-auto mt-10 flex items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-[#E2932E]/30">
            <div>
              <p className="text-[14px] font-medium text-[#17231D]">List more, get seen more</p>
              <p className="text-[12.5px] text-[#6b6f66] mt-0.5">
                Upgrade your plan for more active listings, more photos, and featured placement.
              </p>
            </div>
            <button
              onClick={() => setShowSubscribe(true)}
              className="shrink-0 px-4 py-2.5 rounded-full bg-[#E2932E] text-[#17231D] text-[13px] font-medium"
            >
              View plans
            </button>
          </div>
        )}
      </section>

      <section className="px-6 md:px-12 py-16 max-w-4xl mx-auto">
        <h2 className="font-serif text-[24px] md:text-[28px] text-[#17231D] mb-8">Built on trust</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-6">
          {["Verified profiles", "Item photos", "Reviews", "Rental history", "Secure payments", "Clear rental terms"].map((t) => (
            <div key={t} className="flex items-center gap-2.5 text-[14px] text-[#17231D]">
              <span className="w-7 h-7 rounded-full bg-[#4B5D46]/10 flex items-center justify-center shrink-0">
                <Check size={14} className="text-[#4B5D46]" />
              </span>
              {t}
            </div>
          ))}
        </div>
      </section>

      {showSubscribe && (
        <SubscriptionModal
          currentPlanId={currentPlanId}
          onClose={() => setShowSubscribe(false)}
          onSubscribed={(result) => setCurrentPlanId(result.plan)}
        />
      )}
    </div>
  );
}