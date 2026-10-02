// ==================================================================
// FILE TYPE : PAGE (new)
// PURPOSE   :
//   A permanent "receipt" view for one specific rental — reachable by
//   clicking ANY row in Dashboard.jsx's Rental History, regardless of
//   whether the underlying listing is still active, delisted, or even
//   deleted entirely. Previously clicking a history row only worked if
//   the live listing could still be found (RequestRow's onClick did
//   nothing at all otherwise) — this replaces that with a real
//   destination that always works, since it's built entirely from the
//   rental's own permanent data (see database/schema/
//   rental_item_snapshot.sql's item_name/item_image_url snapshot) plus
//   a live check of the listing only to decide the "Visit item" button.
// CONNECTS TO :
//   Reached via App.jsx's `viewReceipt` navigation from
//   Dashboard.jsx's RequestRow. Uses backend/supabase/listings.js's
//   getListingIfVisible() and backend/supabase/reviews.js's
//   getReviewsForRental().
// ==================================================================
import React, { useEffect, useState } from "react";
import { ChevronLeft, Star, MapPin, Calendar, CheckCircle2, Phone } from "lucide-react";
import { useAuth } from "../../../state/auth/authStore";
import { getListingIfVisible, getOwnerAllListings } from "../../../backend/supabase/listings";
import ItemLocationMap from "../../components/ItemLocationMap";
import { getReviewsForRental } from "../../../backend/supabase/reviews";
import { getUserPhone } from "../../../backend/supabase/users";

function StatusPill({ status }) {
  const tones = {
    Pending: "bg-[#E2932E]/15 text-[#8a5a13]",
    Accepted: "bg-[#4B5D46]/12 text-[#4B5D46]",
    Completed: "bg-[#4B5D46]/15 text-[#1f5c46]",
    Cancelled: "bg-red-100 text-red-700",
    Declined: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12.5px] font-medium ${tones[status] || "bg-[#17231D]/[0.06] text-[#17231D]"}`}>
      {status}
    </span>
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

export default function Receipt({ request, back, openItem, visitProfile }) {
  const { account } = useAuth();
  const [listing, setListing] = useState(null);
  const [listingChecked, setListingChecked] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const isOwner = account && request?.ownerId === account.id;

  // The other party's phone number — shown whenever they added one (the old
  // "both sides must opt in" switch was removed). Kept to Accepted / Completed /
  // Returned rentals, where the two people actually need to reach each other;
  // the database only returns it to a signed-in, real account.
  const canShareContact = ["Accepted", "Completed", "Returned"].includes(request?.status);
  const otherPartyId = isOwner ? request?.renterId : request?.ownerId;
  const [theirPhone, setTheirPhone] = useState(null);

  useEffect(() => {
    if (!otherPartyId || !canShareContact || !account || account.isAnonymous) return undefined;
    let cancelled = false;
    getUserPhone(otherPartyId)
      .then((phone) => { if (!cancelled) setTheirPhone(phone); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [otherPartyId, canShareContact, account?.id, account?.isAnonymous]);

  useEffect(() => {
    if (!request?.itemId) { setListingChecked(true); return; }
    let cancelled = false;
    getListingIfVisible(request.itemId)
      .then(async (l) => {
        if (cancelled) return;
        if (l) {
          setListing(l);
          return;
        }
        // getListingIfVisible respects the same "must be active" rule
        // as public browsing — it returns null once an item is
        // delisted, which is a common state for a Completed/Returned
        // rental by the time someone looks at its receipt. Fall back to
        // the owner's full listing set (active + inactive — see
        // database/schema/public_store_shows_delisted.sql) so the
        // location map still has coordinates to show even then.
        if (request.ownerId) {
          try {
            const all = await getOwnerAllListings(request.ownerId);
            const match = all.find((x) => x.id === request.itemId);
            if (!cancelled && match) setListing(match);
          } catch {
            // non-critical — the map/location section just won't show
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setListingChecked(true); });
    return () => { cancelled = true; };
  }, [request?.itemId, request?.ownerId]);

  useEffect(() => {
    if (!request?.id) return;
    let cancelled = false;
    setLoading(true);
    getReviewsForRental(request.id)
      .then((rv) => { if (!cancelled) setReviews(rv); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [request?.id]);

  if (!request) return null;

  const canVisitItem = listing && listing.isActive;

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12 max-w-2xl mx-auto">
      <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70 mb-5">
        <ChevronLeft size={17} /> Back
      </button>

      <div className="rounded-2xl border border-[#17231D]/8 bg-white overflow-hidden">
        <div className="flex gap-4 p-5 border-b border-[#17231D]/8">
          <div className="w-24 h-24 rounded-xl overflow-hidden bg-[#e9e5d8] shrink-0">
            {request.itemImg ? (
              <img src={request.itemImg} className="w-full h-full object-cover" alt="" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-[19px] text-[#17231D] leading-tight">{request.item}</h1>
            {/* Same original-vs-adjusted breakdown as Dashboard.jsx's
                Rental History row — a permanent record of both the
                originally scheduled cost and, if this was returned
                early, the real recalculated cost, not just a final
                number with the "why" lost. */}
            {request.adjustedPrice != null ? (
              <>
                <p className="text-[13px] text-[#8A9089] line-through mt-1">
                  Original: ₱{request.totalPrice?.toLocaleString()} ({request.days} day{request.days === 1 ? "" : "s"})
                </p>
                <p className="text-[15px] text-[#a15c1f] font-medium">
                  Returned early — adjusted: ₱{request.adjustedPrice.toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-[14px] text-[#4B5D46] font-medium mt-1">
                {/* Was previously "request.totalPrice ?? request.price" —
                    if totalPrice was ever missing, that silently showed
                    the PER-DAY rate as if it were the total (exactly the
                    ₱450-total-next-to-"4 days×₱450/day" mismatch this was
                    reported as). Now computes a correct fallback total
                    (price × days) instead of masking a missing value with
                    a misleading number. */}
                ₱{(request.totalPrice ?? request.price * (request.days || 1)).toLocaleString()} ({request.days || 1} day{(request.days || 1) === 1 ? "" : "s"} × ₱{request.price}/day)
              </p>
            )}
            <div className="mt-2"><StatusPill status={request.status} /></div>
          </div>
        </div>

        <div className="p-5 space-y-3 border-b border-[#17231D]/8">
          <div className="flex items-center gap-2 text-[13.5px] text-[#3c3f38]">
            <Calendar size={14} className="text-[#8A9089]" />
            Rental dates: <span className="font-medium">{request.dates}</span>
          </div>
          <div className="flex items-center gap-2 text-[13.5px] text-[#3c3f38]">
            <Calendar size={14} className="text-[#8A9089]" />
            Requested:{" "}
            <span className="font-medium">
              {new Date(request.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </span>
          </div>
          {request.completedAt && (
            <div className="flex items-center gap-2 text-[13.5px] text-[#3c3f38]">
              <CheckCircle2 size={14} className="text-[#4B5D46]" />
              Completed:{" "}
              <span className="font-medium">
                {new Date(request.completedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}{" "}
                {new Date(request.completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          )}
          <div className="text-[13.5px] text-[#3c3f38]">
            {isOwner ? "Renter" : "Owner"}:{" "}
            <button
              onClick={() => visitProfile?.(isOwner ? request.renterId : request.ownerId)}
              className="font-medium text-[#17231D] hover:underline"
            >
              {isOwner ? request.renter : "View profile"}
            </button>
          </div>

          {/* Location — always shown regardless of rental status, per
              explicit request (previously locked until Accepted). */}
          {typeof listing?.lat === "number" && typeof listing?.lng === "number" && (
            <ItemLocationMap lat={listing.lat} lng={listing.lng} label={request.item} />
          )}
        </div>

        {/* Contact number — always shown when the other person added one. */}
        {canShareContact && theirPhone && (
          <div className="p-5 border-b border-[#17231D]/8 bg-[#4B5D46]/5">
            <div className="flex items-center gap-2 min-w-0">
              <Phone size={14} className="text-[#4B5D46] shrink-0" />
              <a
                href={`tel:${theirPhone.replace(/[^\d+]/g, "")}`}
                className="text-[13.5px] text-[#17231D] font-medium hover:underline"
              >
                {theirPhone}
              </a>
            </div>
          </div>
        )}

        <div className="p-5">
          {!listingChecked ? (
            <p className="text-[13px] text-[#8A9089]">Checking item status…</p>
          ) : canVisitItem ? (
            <button
              onClick={() => openItem?.(listing)}
              className="px-5 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium"
            >
              Visit item again
            </button>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-[#8A9089]">
              <MapPin size={14} />
              This item is no longer listed — it may have been delisted or removed by the owner.
            </p>
          )}
        </div>
      </div>

      <h2 className="font-medium text-[15px] text-[#17231D] mt-8 mb-3">
        Reviews for this rental {reviews.length > 0 && `(${reviews.length})`}
      </h2>
      {loading ? (
        <p className="text-[13.5px] text-[#6b6f66]">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-[13.5px] text-[#6b6f66] rounded-xl border border-[#17231D]/8 bg-white px-4 py-4">
          No reviews left for this rental yet.
        </p>
      ) : (
        <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
          {reviews.map((r) => (
            <div key={r.id} className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0">
                    {r.reviewerAvatarUrl ? (
                      <img src={r.reviewerAvatarUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <span className="font-serif text-[11px] text-[#6b6f66]">
                        {r.reviewerName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-[13.5px] font-medium text-[#17231D]">{r.reviewerName}</p>
                    <p className="text-[11px] text-[#8A9089]">
                      {r.reviewerRole === "owner" ? "Rated as owner" : "Rated as renter"}
                    </p>
                  </div>
                </div>
                <StarRow rating={r.rating} />
              </div>
              {r.comment && <p className="text-[13.5px] text-[#3c3f38] mt-2">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
