// ==================================================================
// FILE TYPE : PAGE
// PURPOSE   :
//   Single listing detail view + the 'Request Rental' / 'Cancel request' flow.
// CONNECTS TO :
//   Reads useRentals() (request/cancel + duplicate-request guard), useAuth()
//   (gate rental requests behind login), useListings() (recordView analytics
//   hook). `item`/`back`/`goToLogin`/`visitStore` come from App.jsx's
//   page-router state. Owner rating is fetched from
//   backend/supabase/reviews.js — real data, not the placeholder 0 stored
//   on the listing row itself (see listings.js's mapListingRow comments).
// ==================================================================
import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, Star, MapPin, ChevronRight as ArrowRight, Lock, Heart } from "lucide-react";
import Button from "../../components/Button";
import Pill from "../../components/Pill";
import ShareButton from "../../components/ShareButton";
import { getItemSharePreviewUrl } from "../../../backend/supabase/client";
import PresenceBadge from "../../components/PresenceBadge";
import { useRentals } from "../../../state/rentals/rentalsStore";
import { useAuth } from "../../../state/auth/authStore";
import { useListings } from "../../../state/listings/listingsStore";
import { useMyLocation } from "../../../state/location/locationStore";
import { distanceKm } from "../../../shared/geo";
import { getOwnerRatingSummary, getListingRatingSummary, getReviewsForListing } from "../../../backend/supabase/reviews";
import { getPublicProfile } from "../../../backend/supabase/users";
import ItemLocationMap from "../../components/ItemLocationMap";
import { useSavedListings } from "../../../state/saved/savedStore";

// ---- SECTION: sub-component — real, swipeable photo carousel ----
// Replaces the old static single-image + 3 decorative (non-functional)
// dots. Every listing can now genuinely have multiple real uploaded
// photos (see backend/supabase/storage.js), so this actually needs to
// let people move between them — via touch swipe, click-through
// left/right controls, or tapping a dot — not just look like it does.
function PhotoCarousel({ photos }) {
  const list = photos && photos.length ? photos : [];
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => { setIdx(0); }, [photos]);

  if (list.length === 0) {
    return <div className="rounded-[6px] overflow-hidden aspect-[4/3] bg-[#e9e5d8] ring-1 ring-[#17231D]/[0.06]" />;
  }

  const go = (delta) => setIdx((i) => (i + delta + list.length) % list.length);

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  return (
    <div>
      <div
        className="relative rounded-[6px] overflow-hidden aspect-[4/3] ring-1 ring-[#17231D]/[0.06] select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img src={list[idx]} className="w-full h-full object-cover" alt="" draggable={false} />
        {list.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/55 text-white flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/55 text-white flex items-center justify-center transition-colors"
            >
              <ArrowRight size={18} />
            </button>
          </>
        )}
      </div>
      {list.length > 1 && (
        <div className="flex gap-1.5 mt-2">
          {list.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Go to photo ${i + 1}`}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i === idx ? "bg-[#E2932E]" : "bg-[#17231D]/10"}`}
            />
          ))}
        </div>
      )}
      <p className="text-[12px] text-[#8A9089] mt-2">
        Photo {idx + 1} of {list.length}{list.length > 1 ? " · swipe or tap to browse" : ""} · provided by owner
      </p>
    </div>
  );
}

function StarRow({ rating, size = 13 }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(rating) ? "fill-[#E2932E] text-[#E2932E]" : "text-[#17231D]/15"} />
      ))}
    </span>
  );
}

// Small avatar for a reviewer — previously this review list only ever
// showed a name as plain text, no way to see who the person actually is.
function ReviewerAvatar({ url, name, size = 26 }) {
  return (
    <div
      className="rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} className="w-full h-full object-cover" alt="" />
      ) : (
        <span className="font-serif text-[#6b6f66]" style={{ fontSize: size * 0.45 }}>
          {(name || "?").charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export default function Details({ item, back, goToLogin, visitStore, goToDashboard, messageUser, goToLegal, goToHelp }) {
  const { requests, requestRental, cancelRental } = useRentals();
  const { savedIds, toggleSave } = useSavedListings();
  const { account, linkGoogleAccount } = useAuth();
  const { recordView } = useListings();
  const { coords: myCoords, loading: locating, requestLocation } = useMyLocation();
  const [requesting, setRequesting] = useState(false);
  // Real date-range picker state — previously there was none at all;
  // every rental silently used a hardcoded 1-day placeholder regardless
  // of what the renter actually wanted.
  const todayISO = new Date().toISOString().slice(0, 10);
  const [rentalStartDate, setRentalStartDate] = useState(todayISO);
  const [rentalEndDate, setRentalEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [cancelling, setCancelling] = useState(false);
  const [agreedToRentalTerms, setAgreedToRentalTerms] = useState(false);
  const [ownerRating, setOwnerRating] = useState({ avgRating: 0, reviewCount: 0 });
  const [ownerPresence, setOwnerPresence] = useState(null);
  // Real per-LISTING rating + reviews — distinct from ownerRating above,
  // which is the owner's rating across ALL of their items. This is what
  // a shopper actually wants when reading a specific product's page: did
  // PEOPLE WHO RENTED THIS EXACT ITEM like it, not "does this seller have
  // good reviews on other things."
  const [listingRating, setListingRating] = useState({ avgRating: 0, reviewCount: 0 });
  const [listingReviews, setListingReviews] = useState([]);
  const viewedIdRef = useRef(null);

  useEffect(() => {
    if (!item?.ownerId) return;
    let cancelled = false;
    getOwnerRatingSummary(item.ownerId)
      .then((r) => { if (!cancelled) setOwnerRating(r); })
      .catch((err) => { console.error("Couldn't load owner rating:", err); }); // non-critical, but logged rather than silently swallowed
    return () => { cancelled = true; };
  }, [item?.ownerId]);

  // Real presence — "when they see the profile in viewing items", i.e.
  // the owner's actual activity status should show right here on the
  // item page, not just on their full profile.
  useEffect(() => {
    if (!item?.ownerId) return;
    let cancelled = false;
    getPublicProfile(item.ownerId)
      .then((p) => { if (!cancelled) setOwnerPresence(p?.lastActiveAt || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item?.ownerId]);

  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    Promise.all([getListingRatingSummary(item.id), getReviewsForListing(item.id)])
      .then(([summary, reviews]) => {
        if (cancelled) return;
        setListingRating(summary);
        setListingReviews(reviews);
      })
      .catch((err) => { console.error("Couldn't load listing reviews:", err); });
    return () => { cancelled = true; };
  }, [item?.id]);

  useEffect(() => {
    if (item && viewedIdRef.current !== item.id) {
      viewedIdRef.current = item.id;
      recordView(item.id);
    }
  }, [item, recordView]);

  if (!item) return null;

  // Real self-rental check: compares the listing's actual owner_id
  // (item.ownerId, set in backend/supabase/listings.js) against the real
  // authenticated user id — NOT a fake "You" string. This is the
  // frontend half of self-rental prevention; the database independently
  // enforces the same rule regardless of what the UI does (see
  // database/schema/self_rental_and_fields.sql).
  const isOwnListing = account && item.ownerId === account.id;

  // Genuinely locked for anyone but the owner — matches OwnerStore.jsx's
  // locked card (no click-through there anymore either). This catches
  // the remaining edge case OwnerStore's lock can't: an old bookmarked
  // or shared link straight to this item from before it was delisted.
  if (!isOwnListing && !item.isActive) {
    return (
      <div className="px-6 md:px-12 py-16 max-w-sm mx-auto text-center">
        <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70 mb-8">
          <ChevronLeft size={17} /> Back
        </button>
        <Lock size={28} className="mx-auto text-[#8A9089]" />
        <p className="font-serif text-[19px] text-[#17231D] mt-4">This item is not currently listed</p>
        <p className="text-[13.5px] text-[#6b6f66] mt-2">
          It isn't available to view or rent right now.
        </p>
      </div>
    );
  }

  const displayOwnerName = isOwnListing ? account.name : item.owner;
  const displayOwnerImg = isOwnListing ? account.avatarUrl : item.ownerImg;

  // Real distance from the viewer to THIS item — replaces the old
  // hardcoded item.distance (always 0). Only computable once the viewer
  // has granted location (myCoords) and this listing has real
  // coordinates (now required at creation — see ListEquipment.jsx).
  const itemDistanceFromMe =
    myCoords && typeof item.lat === "number" && typeof item.lng === "number"
      ? distanceKm(myCoords.lat, myCoords.lng, item.lat, item.lng)
      : null;
  const hasRealDistance = typeof itemDistanceFromMe === "number";
  const ownerInitial = (displayOwnerName || "?").charAt(0).toUpperCase();

  const existingRequest = requests.find(
    (r) => r.itemId === item.id && r.renterId === account?.id && (r.status === "Pending" || r.status === "Accepted")
  );

  // How far into the future a renter can pick an end date is capped by
  // whichever is SOONER: a flat sanity cap (30 days), or this listing's
  // own remaining time under its owner's current subscription plan
  // (item.expirationDate — see frontend/components/PlanCard.jsx's plan
  // days / backend/supabase/subscription.js). A listing can't be
  // rented out past the point it's scheduled to expire anyway.
  const ABSOLUTE_MAX_RENTAL_DAYS = 30;
  const maxEndDateObj = (() => {
    const cap = new Date();
    cap.setDate(cap.getDate() + ABSOLUTE_MAX_RENTAL_DAYS);
    if (item.expirationDate) {
      const listingExpiry = new Date(item.expirationDate);
      if (listingExpiry < cap) return listingExpiry;
    }
    return cap;
  })();
  const maxEndDateISO = maxEndDateObj.toISOString().slice(0, 10);

  const rentalDays = Math.max(
    1,
    Math.round((new Date(rentalEndDate) - new Date(rentalStartDate)) / 86400000)
  );
  const rentalTotalCost = rentalDays * (Number(item.price) || 0);

  const handleRequest = async () => {
    if (!account) {
      goToLogin?.();
      return;
    }
    // Anonymous browsing is fine, but requesting a rental needs a real,
    // recoverable identity so the owner can actually reach the renter —
    // see state/rentals/rentalsStore.jsx's requestRental() for why. Send
    // them to Profile, where both the Google and email sign-in options
    // are shown, rather than forcing one specific method.
    if (account.isAnonymous) {
      goToLogin?.();
      return;
    }
    if (existingRequest || requesting) return;
    // Defense-in-depth — the button/date-picker are already hidden/
    // disabled for a delisted item, but this guards the actual request
    // path too, in case it's ever reached some other way (e.g. a stale
    // page left open across a tab that hasn't refreshed).
    if (!item.isActive) {
      window.alert("This item is not currently listed and can't be requested right now.");
      return;
    }
    if (new Date(rentalEndDate) <= new Date(rentalStartDate)) {
      window.alert("Please choose a return date after the start date.");
      return;
    }
    if (!agreedToRentalTerms) {
      window.alert("Please agree to the Rental Terms before requesting this item.");
      return;
    }
    setRequesting(true);
    try {
      await requestRental(item, { startDate: rentalStartDate, endDate: rentalEndDate });
    } catch (err) {
      window.alert(err.message || "Couldn't submit your request. Please try again.");
    } finally {
      setRequesting(false);
    }
  };

  const handleCancel = async () => {
    if (!existingRequest || cancelling) return;
    if (!window.confirm("Cancel this rental request?")) return;
    setCancelling(true);
    try {
      await cancelRental(existingRequest.id);
    } finally {
      setCancelling(false);
    }
  };

  const buttonLabel = !item.isActive
    ? "Not currently listed"
    : !account
    ? "Log in to request"
    : account.isAnonymous
    ? "Sign in to request"
    : existingRequest
    ? `Requested (${existingRequest.status})`
    : requesting
    ? "Requesting…"
    : `Request — ₱${rentalTotalCost.toLocaleString()}`;

  return (
    <div className="pb-28 md:pb-16">
      <div className="px-6 md:px-12 py-5 flex items-center justify-between">
        <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70">
          <ChevronLeft size={17} /> Back
        </button>
        {/* Real shareable deep link — see App.jsx's ?item= resolution,
            which is what makes this URL actually open to this exact
            item for whoever clicks it, not just the homepage. */}
        <div className="flex items-center gap-2">
          {!isOwnListing && (
            <button
              onClick={() => toggleSave(item.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13.5px] font-medium hover:bg-[#17231D]/5 transition-colors"
            >
              <Heart size={15} className={savedIds.has(item.id) ? "fill-red-500 text-red-500" : ""} />
              {savedIds.has(item.id) ? "Saved" : "Save"}
            </button>
          )}
          <ShareButton
            url={getItemSharePreviewUrl(item.id)}
            title={item.name}
            text={`Check out "${item.name}" for rent on Lendeia`}
            label="Share"
          />
        </div>
      </div>
      <div className="px-6 md:px-12 grid md:grid-cols-2 gap-8 md:gap-12">
        <div>
          <PhotoCarousel photos={item.photos} />
        </div>
        <div>
          <Pill tone="moss">{item.category}</Pill>
          <h1 className="font-serif text-[26px] md:text-[30px] text-[#17231D] mt-3 leading-tight">{item.name}</h1>
          <p className="text-[14px] text-[#6b6f66] mt-1">
            {item.brand} · {item.model} · {item.condition} condition
          </p>
          <div className="flex items-center gap-4 mt-3 text-[13.5px] text-[#6b6f66]">
            {listingRating.reviewCount > 0 ? (
              <span className="flex items-center gap-1">
                <Star size={14} className="fill-[#E2932E] text-[#E2932E]" />
                {listingRating.avgRating} ({listingRating.reviewCount} review{listingRating.reviewCount === 1 ? "" : "s"})
              </span>
            ) : (
              <span className="text-[#8A9089]">No reviews yet for this item</span>
            )}
            <span className="flex items-center gap-1">
              <MapPin size={14} /> {item.area}
              {hasRealDistance
                ? ` · ${itemDistanceFromMe.toFixed(1)} km away`
                : !myCoords && (
                    <button onClick={requestLocation} className="underline ml-1">
                      {locating ? "Locating…" : "See distance"}
                    </button>
                  )}
            </span>
          </div>

          <p className="text-[14.5px] text-[#3c3f38] mt-5 leading-relaxed">{item.desc}</p>

          {typeof item.lat === "number" && typeof item.lng === "number" && (
            <ItemLocationMap lat={item.lat} lng={item.lng} label={item.name} />
          )}

          {/* Real date-range picker with a live price calculation —
              previously there was none: every rental silently used a
              hardcoded 1-day placeholder regardless of what anyone
              picked, since nothing was ever asked. Only shown when it's
              actually relevant (not your own listing, no request
              already pending/accepted on it). */}
          {!isOwnListing && !existingRequest && item.isActive && (
            <div className="mt-6 p-4 rounded-xl bg-white border border-[#17231D]/8">
              <p className="text-[13px] font-medium text-[#17231D] mb-3">Choose your rental dates</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11.5px] text-[#8A9089]">Start date</span>
                  <input
                    type="date"
                    value={rentalStartDate}
                    min={todayISO}
                    max={maxEndDateISO}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRentalStartDate(v);
                      // Keep the end date at least one day after a newly
                      // picked start date, instead of leaving an
                      // invalid/inverted range sitting there silently.
                      if (new Date(rentalEndDate) <= new Date(v)) {
                        const next = new Date(v);
                        next.setDate(next.getDate() + 1);
                        setRentalEndDate(next.toISOString().slice(0, 10));
                      }
                    }}
                    className="w-full mt-1 rounded-lg border border-[#17231D]/15 px-3 py-2 text-[13.5px] outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11.5px] text-[#8A9089]">Return date</span>
                  <input
                    type="date"
                    value={rentalEndDate}
                    min={rentalStartDate}
                    max={maxEndDateISO}
                    onChange={(e) => setRentalEndDate(e.target.value)}
                    className="w-full mt-1 rounded-lg border border-[#17231D]/15 px-3 py-2 text-[13.5px] outline-none"
                  />
                </label>
              </div>

              {/* Live "the price stacks and calculates" breakdown — days
                  × daily rate, so the renter sees exactly how the total
                  is built before requesting, not just a final number. */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#17231D]/8">
                <p className="text-[12.5px] text-[#6b6f66]">
                  ₱{item.price}/day × {rentalDays} day{rentalDays === 1 ? "" : "s"}
                </p>
                <p className="text-[16px] font-serif text-[#17231D]">₱{rentalTotalCost.toLocaleString()}</p>
              </div>

              {item.expirationDate && (
                <p className="text-[11px] text-[#8A9089] mt-2">
                  This listing is only available to book through{" "}
                  {maxEndDateObj.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  , based on the owner's current subscription plan.
                </p>
              )}

              {/* Real reminder + agreement — cancelling early recalculates
                  the cost based on days actually used (see
                  frontend/pages/Legal/Legal.jsx's Cancellation & Refund
                  Policy); this isn't just decorative copy, it matches
                  actual database behavior (database/schema/
                  rental_date_pricing.sql). */}
              <div className="mt-3 pt-3 border-t border-[#17231D]/8">
                <p className="text-[11px] text-[#8A9089] leading-relaxed">
                  ℹ️ If you cancel after the rental has started, the cost is recalculated based on the days
                  you actually used — see the{" "}
                  <button type="button" onClick={() => goToLegal?.("cancellation")} className="underline text-[#4B5D46] font-medium">
                    Cancellation & Refund Policy
                  </button>
                  {" "}or{" "}
                  <button type="button" onClick={() => goToHelp?.("returns")} className="underline text-[#4B5D46] font-medium">
                    how early returns work
                  </button>.
                </p>
                <label className="flex items-start gap-2 text-[11.5px] text-[#3c3f38] mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToRentalTerms}
                    onChange={(e) => setAgreedToRentalTerms(e.target.checked)}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    I agree to the{" "}
                    <button type="button" onClick={() => goToLegal?.("rental-terms")} className="underline text-[#4B5D46] font-medium">
                      Rental Terms
                    </button>.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Explicit, honest message for a delisted item — previously
              nothing checked item.isActive at all here, so a delisted
              item (now visible on an owner's store page, see
              database/schema/public_store_shows_delisted.sql) could
              still silently be requested through Details.jsx even
              though it wasn't actually available. */}
          {!isOwnListing && !existingRequest && !item.isActive && (
            <div className="mt-6 p-4 rounded-xl bg-[#EFEBDD] border border-[#17231D]/8 text-center">
              <p className="text-[13.5px] text-[#17231D] font-medium">This item is not currently listed</p>
              <p className="text-[12.5px] text-[#6b6f66] mt-1">
                It isn't available to rent right now. Check back later, or explore similar items nearby.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-6 p-3.5 rounded-xl bg-white border border-[#17231D]/8">
            <div className="w-11 h-11 rounded-full overflow-hidden bg-[#17231D]/8 flex items-center justify-center shrink-0">
              {displayOwnerImg ? (
                <img src={displayOwnerImg} className="w-full h-full object-cover" />
              ) : (
                <span className="font-serif text-[16px] text-[#6b6f66]">{ownerInitial}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-[#17231D]">{displayOwnerName}</p>
              {ownerRating.reviewCount > 0 && (
                <p className="flex items-center gap-1 text-[12.5px] text-[#6b6f66]">
                  <Star size={12} className="fill-[#E2932E] text-[#E2932E]" />
                  {ownerRating.avgRating} · {ownerRating.reviewCount} review{ownerRating.reviewCount === 1 ? "" : "s"}
                </p>
              )}
              {!isOwnListing && <PresenceBadge lastActiveAt={ownerPresence} />}
            </div>
            {!isOwnListing && item.ownerId && (
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    // Anonymous users can browse and view owner cards fine,
                    // but messaging needs a real, recoverable identity —
                    // same reasoning as listing/renting (see
                    // database/schema/messaging.sql's get_or_create_conversation,
                    // which independently blocks this at the DB level too).
                    if (!account || account.isAnonymous) {
                      goToLogin?.();
                      return;
                    }
                    messageUser?.(item.ownerId);
                  }}
                  className="text-[12.5px] font-medium text-[#17231D] px-3 py-2 rounded-full border border-[#17231D]/20 hover:bg-[#17231D]/5 transition-colors"
                >
                  Message
                </button>
                <button
                  onClick={() => visitStore?.(item.ownerId)}
                  className="text-[12.5px] font-medium text-[#4B5D46] px-3 py-2 rounded-full border border-[#4B5D46]/25 hover:bg-[#4B5D46]/5 transition-colors"
                >
                  Visit Store
                </button>
              </div>
            )}
          </div>

          {/* Real reviews for THIS specific item — publicly visible to
              anyone (no login/rental required to view), the way a product
              page on any online shopping site shows its own reviews.
              Intentionally does NOT mix in reviews from the owner's other
              listings — see backend/supabase/reviews.js's
              getReviewsForListing vs getReviewsForOwner. */}
          <div className="mt-6">
            <h3 className="text-[14px] font-medium text-[#17231D] mb-2">
              Reviews for this item {listingRating.reviewCount > 0 && `(${listingRating.reviewCount})`}
            </h3>
            {listingReviews.length === 0 ? (
              <p className="text-[13.5px] text-[#6b6f66]">No reviews yet for this specific item.</p>
            ) : (
              <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
                {listingReviews.map((r) => (
                  <div key={r.id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => visitStore?.(r.reviewerId)}
                        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                      >
                        <ReviewerAvatar url={r.reviewerAvatarUrl} name={r.reviewerName} />
                        <span className="text-[13.5px] font-medium text-[#17231D] hover:underline">{r.reviewerName}</span>
                      </button>
                      <StarRow rating={r.rating} size={12} />
                    </div>
                    {r.comment && <p className="text-[13.5px] text-[#3c3f38] mt-1.5">{r.comment}</p>}
                    <p className="text-[11.5px] text-[#8A9089] mt-1.5">
                      {new Date(r.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isOwnListing ? (
            <div className="hidden md:flex items-center justify-between mt-8 p-5 rounded-2xl bg-[#EFEBDD]">
              <div>
                <p className="font-serif text-[24px] text-[#17231D]">
                  ₱{item.price}
                  <span className="text-[14px] font-sans text-[#6b6f66]">/day</span>
                </p>
                <p className="text-[13px] text-[#4B5D46] font-medium mt-0.5">This is your listing</p>
              </div>
              <button
                onClick={() => goToDashboard?.()}
                className="px-6 py-3 rounded-[4px] bg-[#17231D] text-[#F6F4EE] font-medium text-[14.5px]"
              >
                Manage in Dashboard
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center justify-between mt-8 p-5 rounded-2xl bg-[#EFEBDD]">
              <div>
                <p className="font-serif text-[24px] text-[#17231D]">
                  ₱{item.price}
                  <span className="text-[14px] font-sans text-[#6b6f66]">/day</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {account && existingRequest && (
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="px-5 py-2.5 rounded-full border-2 border-red-300 text-red-600 text-[14px] font-medium disabled:opacity-60 hover:bg-red-50 transition-colors"
                  >
                    {cancelling ? "Cancelling…" : "Cancel request"}
                  </button>
                )}
                <Button
                  variant="accent"
                  className="px-8"
                  disabled={!!(account && existingRequest) || requesting || !item.isActive}
                  onClick={handleRequest}
                >
                  {buttonLabel}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isOwnListing ? (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#F6F4EE] border-t border-[#17231D]/10 px-5 py-3.5 flex items-center justify-between z-[1100]">
          <div>
            <p className="font-serif text-[19px] text-[#17231D]">
              ₱{item.price}
              <span className="text-[12.5px] font-sans text-[#6b6f66]">/day</span>
            </p>
            <p className="text-[11.5px] text-[#4B5D46] font-medium">This is your listing</p>
          </div>
          <button
            onClick={() => goToDashboard?.()}
            className="px-5 py-2.5 rounded-[4px] bg-[#17231D] text-[#F6F4EE] font-medium text-[13.5px]"
          >
            Manage
          </button>
        </div>
      ) : (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#F6F4EE] border-t border-[#17231D]/10 px-5 py-3.5 flex items-center justify-between z-[1100]">
          <div>
            <p className="font-serif text-[19px] text-[#17231D]">
              ₱{item.price}
              <span className="text-[12.5px] font-sans text-[#6b6f66]">/day</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {account && existingRequest && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-4 py-2.5 rounded-full border-2 border-red-300 text-red-600 text-[13px] font-medium disabled:opacity-60"
              >
                {cancelling ? "…" : "Cancel"}
              </button>
            )}
            <Button
              variant="accent"
              disabled={!!(account && existingRequest) || requesting || !item.isActive}
              onClick={handleRequest}
            >
              {buttonLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}