// ==================================================================
// FILE TYPE : PAGE (contains several merged sub-components — see SECTION banners below)
// PURPOSE   :
//   Owner/renter dashboard: overview stats, 'My Items' management grid
//   (edit/delete), 'Rental Requests' list (cancel), and a seller-analytics
//   chart (real view counts from listingsStore, bucketed by day/week/month).
// CONNECTS TO :
//   Reads useListings() and useRentals(). `openItem` prop comes from App.jsx.
// ==================================================================
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { TrendingUp, ClipboardList, Sparkles, X, MapPin, BarChart3, Star, ShieldAlert } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import Pill from "../../components/Pill";
import Saved from "../Saved/Saved";
import { getMySubscription } from "../../../backend/supabase/subscription";
import { useListings } from "../../../state/listings/listingsStore";
import { useRentals } from "../../../state/rentals/rentalsStore";
import { useAuth } from "../../../state/auth/authStore";
import { getMyReviewedRentalIds, createReview, getUserReputationSummary, getReviewsForOwner, reportReview } from "../../../backend/supabase/reviews";
import { getPublicProfile } from "../../../backend/supabase/users";
import PresenceBadge from "../../components/PresenceBadge";
import PhotoViewerModal from "../../components/PhotoViewerModal";
import { CATEGORIES } from "../../../shared/constants";
import { getPlanById } from "../../components/PlanCard";
import { getMyListings, relistListing, delistListingManually } from "../../../backend/supabase/listings";
import { uploadListingPhotos } from "../../../backend/supabase/storage";
import LocationPicker from "../../components/LocationPicker";
import CountrySelect from "../../components/CountrySelect";

const CONDITIONS = ["New", "Like New", "Good", "Fair"];

// Same category labels/keys as OwnerStore.jsx's public Store page — kept
// as a separate copy here (not imported) since these are just plain
// label strings, consistent with how small presentational constants are
// already duplicated per-file elsewhere in this codebase.
const CATEGORY_LABELS = {
  communication: "Communication",
  reliability: "Reliability",
  itemAccuracy: "Item matched listing",
  rentalExperience: "Rental experience",
  returnCondition: "Returned item properly",
  agreementFollowed: "Followed rental agreement",
};

const TABS = [
  ["myhistory", "My History"],
  ["requests", "Requests"],
  ["saved", "Saved"],
  ["equipment", "My Items"],
  ["overview", "Overview"],
];

// "In Progress" groups Pending + Accepted (still ongoing, not yet
// resolved either way). "Cancelled" groups Cancelled + Declined (both
// mean "didn't happen"). "Returned" is now its own distinct bucket —
// see database/schema/real_returned_status.sql for why it's not the
// same thing as Cancelled anymore.
const HISTORY_FILTERS = [
  ["all", "All", null],
  ["in_progress", "In Progress", ["Pending", "Accepted"]],
  ["completed", "Completed", ["Completed"]],
  ["returned", "Returned", ["Returned"]],
  ["cancelled", "Cancelled", ["Cancelled", "Declined"]],
];

// ---- SECTION: helper (utility function) ----
function statusTone(status) {
  if (status === "Pending") return "amber";
  if (status === "Accepted") return "moss";
  if (status === "Returned") return "moss";
  return "default";
}

// ---- SECTION: sub-component (modal) — edit an existing listing ----
// Was previously missing most of the fields collected at creation time
// (ListEquipment.jsx) — only name/price/description/availability were
// editable. Now matches creation's field set: name, brand, model,
// category, condition, price, location, description, availability.
// Photos are shown read-only with an explicit note (see
// backend/supabase/listings.js's updateListing — editing photos needs a
// real re-upload flow, not silently accepted and ignored).
function EditListingModal({ item, account, onClose, onSave, saving, error }) {
  const [name, setName] = useState(item.name || "");
  const [brand, setBrand] = useState(item.brand || "");
  const [model, setModel] = useState(item.model || "");
  const [category, setCategory] = useState(item.category || CATEGORIES[0].name);
  const [condition, setCondition] = useState(item.condition || "Good");
  const [price, setPrice] = useState(item.price);
  const [location, setLocation] = useState(item.location || item.area || "");
  // Older listings may have no country yet — it starts empty (never guessed)
  // and the owner is asked to pick it when they edit.
  const [countryCode, setCountryCode] = useState(item.countryCode || "");
  const [coords, setCoords] = useState(
    typeof item.lat === "number" && typeof item.lng === "number" ? { lat: item.lat, lng: item.lng } : null
  );
  const [desc, setDesc] = useState(item.desc || "");
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Real photo editing — add, delete, or replace. `existingPhotos` are
  // URLs already saved; `newPhotoFiles` are File objects not yet
  // uploaded (only actually uploaded on Save, to avoid wasting an
  // upload if the person cancels). Previously photos were read-only
  // here with a note saying to delete and recreate the whole listing
  // just to change them.
  const [existingPhotos, setExistingPhotos] = useState(item.photos || []);
  const [newPhotoFiles, setNewPhotoFiles] = useState([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState([]);
  const [photoError, setPhotoError] = useState(null);
  const fileInputRef = useRef(null);

  const plan = getPlanById(item.plan);
  const totalPhotoCount = existingPhotos.length + newPhotoFiles.length;

  const handleRemoveExistingPhoto = (index) => {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setPhotoError(null);
    // Previously rejected the WHOLE batch if it would exceed the plan's
    // photo limit — selecting several photos at once when you were
    // close to the cap silently added none of them at all, which felt
    // exactly like "it just won't add them." Now adds as many as
    // actually fit, and only shows the limit message if some had to be
    // left out — matching how the listing CREATION form already
    // behaves (fits what it can, doesn't reject the whole selection).
    const remainingSlots = plan.maxPhotos - totalPhotoCount;
    if (remainingSlots <= 0) {
      setPhotoError(`Your ${plan.name} plan allows up to ${plan.maxPhotos} photos per listing.`);
      return;
    }
    const filesToAdd = files.slice(0, remainingSlots);
    if (filesToAdd.length < files.length) {
      setPhotoError(`Your ${plan.name} plan allows up to ${plan.maxPhotos} photos per listing — added ${filesToAdd.length} of the ${files.length} you selected.`);
    }
    setNewPhotoFiles((prev) => [...prev, ...filesToAdd]);
    setNewPhotoPreviews((prev) => [...prev, ...filesToAdd.map((f) => URL.createObjectURL(f))]);
  };

  const handleRemoveNewPhoto = (index) => {
    setNewPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const handleSaveClick = async () => {
    setPhotoError(null);
    // Matches database/schema/stricter_listing_rules.sql's
    // listings_name_length constraint (3–120 characters after
    // trimming) — previously unvalidated here at all, so a too-short
    // name hit a raw, confusing Postgres constraint error instead of a
    // clear message.
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 120) {
      setPhotoError("Product name must be between 3 and 120 characters.");
      return;
    }
    if (totalPhotoCount < 3) {
      setPhotoError("A listing needs at least 3 photos.");
      return;
    }
    let finalPhotos = existingPhotos;
    try {
      if (newPhotoFiles.length > 0) {
        setUploadingPhotos(true);
        const uploadedUrls = await uploadListingPhotos(newPhotoFiles, account.id);
        finalPhotos = [...existingPhotos, ...uploadedUrls];
      }
    } catch (err) {
      setPhotoError(err.message || "Couldn't upload the new photos. Please try again.");
      setUploadingPhotos(false);
      return;
    }
    setUploadingPhotos(false);

    onSave({
      name,
      brand,
      model,
      category,
      condition,
      price: Number(price),
      location,
      countryCode: countryCode || null,
      lat: coords?.lat,
      lng: coords?.lng,
      desc,
      photos: finalPhotos,
    });
  };

  const inputClass = "w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] outline-none";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 my-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-[19px] text-[#17231D]">Edit listing</h3>
          <button onClick={onClose}><X size={18} className="text-[#6b6f66]" /></button>
        </div>

        {/* Real photo editing — add, delete, or replace, respecting the
            owner's current plan's photo limit (same cap used at
            creation). */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[13px] font-medium text-[#17231D]">Photos ({totalPhotoCount}/{plan.maxPhotos})</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={totalPhotoCount >= plan.maxPhotos}
              className="text-[12px] font-medium text-[#4B5D46] disabled:opacity-40"
            >
              + Add photos
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {existingPhotos.map((src, i) => (
              <div key={src} className="relative aspect-square">
                <img src={src} className="w-full h-full object-cover rounded-lg" alt="" />
                <button
                  type="button"
                  onClick={() => handleRemoveExistingPhoto(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {newPhotoPreviews.map((src, i) => (
              <div key={src} className="relative aspect-square">
                <img src={src} className="w-full h-full object-cover rounded-lg ring-2 ring-[#4B5D46]" alt="" />
                <button
                  type="button"
                  onClick={() => handleRemoveNewPhoto(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
          {photoError && <p className="text-[11.5px] text-red-600 mt-1.5">{photoError}</p>}
          <p className="text-[11px] text-[#8A9089] mt-1.5">
            At least 3 photos required. New photos (outlined) upload when you save.
          </p>
        </div>

        <div className="space-y-3 mt-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={120} className={inputClass} />

          <div className="grid grid-cols-2 gap-3">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" className={inputClass} />
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model / code" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
              ))}
            </select>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputClass}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[#17231D]/12 px-4 py-3">
            <span className="text-[14px] text-[#6b6f66]">₱</span>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="outline-none text-[14px] w-full"
            />
            <span className="text-[13px] text-[#6b6f66]">/day</span>
          </div>

          {/* Real location picker — same search + map + draggable pin
              used when creating a listing, previously only a plain text
              field here with no way to actually move the pin. */}
          <div>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City / area" className={inputClass} />
            <CountrySelect
              value={countryCode}
              onChange={setCountryCode}
              placeholder={item.countryCode ? "Country" : "Country (please set — this listing has none yet)"}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowLocationPicker((v) => !v)}
              className="text-[12px] font-medium text-[#4B5D46] mt-1.5"
            >
              {showLocationPicker ? "Hide map" : coords ? "Adjust pin on map" : "Pin location on a map"}
            </button>
            {showLocationPicker && (
              <div className="mt-2">
                <LocationPicker
                initialCoords={coords}
                onPick={setCoords}
                onLocationText={(text, place) => {
                  setLocation(text);
                  if (place?.countryCode) setCountryCode(place.countryCode);
                }}
              />
              </div>
            )}
          </div>

          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="Description"
            className={inputClass}
          />
        </div>

        {error && <p className="text-[13px] text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13.5px] font-medium"
          >
            Cancel
          </button>
          <button
            disabled={saving || uploadingPhotos}
            onClick={handleSaveClick}
            className="flex-1 px-4 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium disabled:opacity-60"
          >
            {uploadingPhotos ? "Uploading photos…" : saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- SECTION: sub-component (modal) — leave a review for a completed rental ----
// Now role-aware: a renter reviewing the owner sees different category
// questions ("Item matched listing", "Rental experience") than an owner
// reviewing the renter ("Returned item properly", "Followed rental
// agreement") — see database/schema/two_way_category_reviews.sql. Which
// set is shown here is a UX nicety, matching the labels the user
// actually sees; the real enforcement of which categories are allowed
// through is the database trigger, not this component.
const RENTER_TO_OWNER_CATEGORIES = [
  ["itemAccuracy", "Item matched listing"],
  ["communication", "Communication"],
  ["reliability", "Reliability"],
  ["rentalExperience", "Rental experience"],
];
const OWNER_TO_RENTER_CATEGORIES = [
  ["communication", "Communication"],
  ["reliability", "Reliability"],
  ["returnCondition", "Returned item properly"],
  ["agreementFollowed", "Followed rental agreement"],
];

function StarPicker({ value, onChange, size = 22 }) {
  // value can be null/undefined (unrated/skipped) — shown as all-empty
  // stars, not defaulted to any number. Previously every category
  // silently started at 5 stars even if the person never touched it,
  // which submitted a fake positive rating for anything they meant to
  // skip rather than genuinely rate.
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star size={size} className={value && n <= value ? "fill-[#E2932E] text-[#E2932E]" : "text-[#17231D]/15"} />
        </button>
      ))}
    </div>
  );
}

function ReviewModal({ request, reviewerRole, onClose, onSubmit, saving, error }) {
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState("");
  const categoryDefs = reviewerRole === "owner" ? OWNER_TO_RENTER_CATEGORIES : RENTER_TO_OWNER_CATEGORIES;
  // Every category starts unrated (null) — the person picks only the
  // ones they actually want to rate; anything left null is genuinely
  // skipped, not submitted as a default 5.
  const [categories, setCategories] = useState(
    Object.fromEntries(categoryDefs.map(([key]) => [key, null]))
  );

  const revieweeLabel = reviewerRole === "owner" ? request.renter : "the owner";
  const canSubmit = !!rating;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 my-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-[19px] text-[#17231D]">
            {reviewerRole === "owner" ? `Rate ${revieweeLabel}` : "Rate the owner"}
          </h3>
          <button onClick={onClose}><X size={18} className="text-[#6b6f66]" /></button>
        </div>
        <p className="text-[13.5px] text-[#6b6f66] mb-3">{request.item}</p>

        <p className="text-[12.5px] font-medium text-[#17231D] mb-1.5">Overall rating</p>
        <StarPicker value={rating} onChange={setRating} />

        <div className="mt-4 space-y-3">
          <p className="text-[11.5px] text-[#8A9089]">Optional — rate any that apply, or leave blank to skip.</p>
          {categoryDefs.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <p className="text-[13px] text-[#3c3f38]">{label}</p>
              <StarPicker value={categories[key]} onChange={(v) => setCategories((c) => ({ ...c, [key]: v }))} size={16} />
            </div>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Optional: describe your experience"
          className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] outline-none mt-4"
        />

        {error && <p className="text-[13px] text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13.5px] font-medium"
          >
            Skip
          </button>
          <button
            disabled={saving || !canSubmit}
            onClick={() => onSubmit({ rating, comment: comment.trim(), ...categories })}
            className="flex-1 px-4 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium disabled:opacity-60"
          >
            {saving ? "Submitting…" : "Submit review"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- SECTION: sub-component — one rental-request row, reused by Overview & Requests tabs ----
function RequestRow({ request, listing, isOwner, onApprove, onDecline, onCancel, onMarkCompleted, onConfirmReceived, onReturnItem, onLeaveReview, onVisitProfile, onViewReceipt, alreadyReviewed, actingId }) {
  // Once a request is real (multi-user) rather than always-mocked-as-you,
  // "what buttons show" depends on WHICH side of the rental the current
  // user is on, not just the status. An owner facing a Pending request
  // needs to Accept/Decline it (see database/schema/rental_status_transitions.sql
  // for why only the owner is allowed to do that); the renter (or the
  // owner, for an already-accepted rental) can still Cancel.
  const isPending = request.status === "Pending";
  const isAccepted = request.status === "Accepted";
  const isCompleted = request.status === "Completed";
  // Reviewable once the rental actually happened, whether it ran its
  // full term (Completed) or ended early (Returned) — both are
  // legitimate finished rental experiences, unlike Cancelled/Declined
  // (never happened) or still-ongoing Pending/Accepted. See
  // database/schema/allow_review_on_returned.sql.
  const isReviewable = isCompleted || request.status === "Returned";
  const cancellable = isPending || isAccepted;
  const acting = actingId === request.id;
  // Real owner-confirmed handoff (database/schema/confirm_item_received.sql)
  // — NOT inferred from the scheduled start date, since a start date
  // passing is a plan, not proof anything physically happened.
  const itemReceived = isAccepted && !!request.receivedAt;

  return (
    <div
      onClick={() => onViewReceipt?.(request)}
      className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 py-5 cursor-pointer hover:bg-[#17231D]/[0.02] transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#e9e5d8] shrink-0">
          {/* Prefers the live `listing` object's photo (from findListing())
              when available, but falls back to the rental's own permanent
              snapshot (request.itemImg — see database/schema/
              rental_item_snapshot.sql) when it isn't — e.g. the owner
              delisted or deleted the item since. Previously there was no
              fallback at all, so this photo went blank in exactly that
              case even though the item's name kept displaying fine. */}
          {listing?.img || request.itemImg ? (
            <img src={listing?.img || request.itemImg} className="w-full h-full object-cover" />
          ) : null}
        </div>

        {/* On mobile, the status pill and action buttons now sit below
            the details instead of being squeezed into the same row —
            previously this whole card was a single rigid row with no
            responsive stacking at all, so on a narrow screen the
            buttons (which never shrink) visually overlapped the
            location/details text instead of wrapping onto their own
            line. Shown here, next to the photo, ONLY on mobile — moved
            back out to the far right on sm+ screens (its second,
            desktop-only copy further below). */}
        <div className="sm:hidden">
          <Pill tone={statusTone(request.status)}>{request.status}</Pill>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[16px] text-[#17231D] font-medium truncate">{request.item}</p>
        <p className="text-[13.5px] text-[#6b6f66] mt-0.5">
          {/* The renter's name is now a real link to their public
              profile (see backend/supabase/reviews.js's
              getUserReputationSummary + frontend/pages/Store/OwnerStore.jsx,
              which now works for any user, not just listing owners) —
              previously this was plain, unclickable text, so there was
              no way to see who you were dealing with beyond a name. */}
          {isOwner ? (
            <button
              onClick={(e) => { e.stopPropagation(); onVisitProfile?.(request.renterId); }}
              className="font-medium text-[#17231D] hover:underline"
            >
              {request.renter}
            </button>
          ) : (
            request.renter
          )}
          {" "}· {request.dates}
        </p>
        {listing && (
          <div className="flex items-center gap-3 mt-1.5 text-[12.5px] text-[#8A9089]">
            {listing.brand && <span>{listing.brand} · {listing.model}</span>}
            {listing.area && (
              <span className="flex items-center gap-1">
                <MapPin size={12} /> {listing.locationFull || listing.area}{!listing.countryCode && " · country not set"}
              </span>
            )}
          </div>
        )}
        {/* Shows the full originally-scheduled cost (days × daily rate),
            and — if the renter cancelled this early while it was
            in-progress — the real recalculated adjusted cost right
            alongside it, not just one final number with no context for
            why it changed. See database/schema/rental_date_pricing.sql. */}
        <div className="mt-2">
          {request.adjustedPrice != null ? (
            <>
              <p className="text-[13px] text-[#8A9089] line-through">
                Original: ₱{(request.totalPrice ?? request.price * (request.days || 1)).toLocaleString()} ({request.days} day{request.days === 1 ? "" : "s"})
              </p>
              <p className="text-[15px] text-[#a15c1f] font-medium">
                Returned early — adjusted: ₱{request.adjustedPrice.toLocaleString()}
              </p>
            </>
          ) : (
            <p className="text-[15px] text-[#17231D] font-medium">
              {/* Safe fallback (price × days) if totalPrice is ever
                  missing, instead of crashing on .toLocaleString() of
                  undefined or silently showing the wrong number. */}
              ₱{(request.totalPrice ?? request.price * (request.days || 1)).toLocaleString()} ({request.days} day{request.days === 1 ? "" : "s"} × ₱{request.price}/day)
            </p>
          )}
        </div>
        {/* Real timestamps — previously only the rental date RANGE
            showed, with no record of when the request itself was made
            or when it was actually completed/returned. */}
        <p className="text-[11.5px] text-[#8A9089] mt-1">
          Requested {new Date(request.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          {request.completedAt && (
            <>
              {" "}· Completed{" "}
              {new Date(request.completedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              {" "}
              {new Date(request.completedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </>
          )}
          {request.returnedAt && (
            <>
              {" "}· Item Returned{" "}
              {new Date(request.returnedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              {" "}
              {new Date(request.returnedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2.5 sm:shrink-0">
        {/* Desktop-only copy of the status pill — mobile shows its own
            copy up next to the photo instead (see above), so this one
            is hidden there to avoid showing the same pill twice. */}
        <span className="hidden sm:inline-flex">
          <Pill tone={statusTone(request.status)}>{request.status}</Pill>
        </span>

        {isOwner && isPending && (
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onDecline(request.id); }}
              disabled={acting}
              className="text-[13px] px-4 py-2 rounded-full border-2 border-red-300 text-red-600 font-medium disabled:opacity-60 hover:bg-red-50 transition-colors"
            >
              {acting ? "…" : "Decline"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(request.id); }}
              disabled={acting}
              className="text-[13px] px-4 py-2 rounded-full bg-[#4B5D46] text-white font-medium disabled:opacity-60 hover:bg-[#3e4d3a] transition-colors"
            >
              {acting ? "…" : "Accept"}
            </button>
          </div>
        )}

        {isOwner && isAccepted && (
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(request.id); }}
              disabled={acting}
              className="text-[13px] px-4 py-2 rounded-full border-2 border-red-300 text-red-600 font-medium disabled:opacity-60 hover:bg-red-50 transition-colors"
            >
              {acting ? "…" : "Cancel"}
            </button>
            {/* Confirm handoff happens before Mark Completed becomes
                available — completing a rental that was never actually
                handed over wouldn't make sense. */}
            {itemReceived ? (
              <button
                onClick={(e) => { e.stopPropagation(); onMarkCompleted(request.id); }}
                disabled={acting}
                className="text-[13px] px-4 py-2 rounded-full bg-[#17231D] text-white font-medium disabled:opacity-60 hover:bg-[#233428] transition-colors"
              >
                {acting ? "…" : "Mark Completed"}
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onConfirmReceived(request.id); }}
                disabled={acting}
                className="text-[13px] px-4 py-2 rounded-full bg-[#4B5D46] text-white font-medium disabled:opacity-60 hover:bg-[#3e4d3a] transition-colors"
              >
                {acting ? "…" : "Confirm Handoff"}
              </button>
            )}
          </div>
        )}

        {!isOwner && isAccepted && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (itemReceived) {
                if (window.confirm("Return this item now? The cost will be recalculated based on the days you actually used.")) {
                  onReturnItem(request.id);
                }
              } else {
                onCancel(request.id, "Cancel this rental request?");
              }
            }}
            disabled={acting}
            className={
              itemReceived
                ? "text-[14px] px-5 py-2.5 rounded-full bg-[#17231D] text-white font-medium disabled:opacity-60 hover:bg-[#233428] transition-colors"
                : "text-[14px] px-5 py-2.5 rounded-full border-2 border-red-300 text-red-600 font-medium disabled:opacity-60 hover:bg-red-50 transition-colors"
            }
          >
            {acting ? (itemReceived ? "Returning…" : "Cancelling…") : itemReceived ? "Return Item" : "Cancel"}
          </button>
        )}

        {!isOwner && isPending && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(request.id); }}
            disabled={acting}
            className="text-[14px] px-5 py-2.5 rounded-full border-2 border-red-300 text-red-600 font-medium disabled:opacity-60 hover:bg-red-50 transition-colors"
          >
            {acting ? "Cancelling…" : "Cancel"}
          </button>
        )}

        {isReviewable && !alreadyReviewed && (
          <button
            onClick={(e) => { e.stopPropagation(); onLeaveReview({ ...request, reviewerRole: isOwner ? "owner" : "renter" }); }}
            className="text-[13px] px-4 py-2 rounded-full border border-[#E2932E] text-[#8a5a13] font-medium hover:bg-[#E2932E]/8 transition-colors"
          >
            {isOwner ? "Rate this renter" : "Leave a review"}
          </button>
        )}

        {isReviewable && alreadyReviewed && (
          <p className="text-[12px] text-[#4B5D46] font-medium">Reviewed ✓</p>
        )}
      </div>
    </div>
  );
}

// ---- SECTION: MAIN component — Dashboard page (Overview / My Items / Rental History tabs) ----
export default function Dashboard({ openItem, visitProfile, viewReceipt }) {
  const [tab, setTab] = useState("requests");
  const { account } = useAuth();
  // `useListings()`'s `listings` array is the public active-only feed
  // (real Supabase data — see state/listings/listingsStore.jsx) — that's
  // fine for `allListings` uses elsewhere (e.g. finding a rental's item
  // photo), but "My Items" now needs the OWNER's own listings
  // REGARDLESS of active status, since a listing gets auto-delisted the
  // moment a rental on it is marked Completed (see database/schema/
  // limits_delisting_notifications.sql) — filtering the active-only feed
  // would make a delisted item vanish from Dashboard entirely, with no
  // way to relist or delete it.
  const { listings: allListings, updateListing, deleteListing: deleteListingFromContext, refresh: refreshSharedListings } = useListings();
  const [myListings, setMyListings] = useState([]);
  const [myListingsLoading, setMyListingsLoading] = useState(true);

  const refreshMyListings = useCallback((opts = {}) => {
    const { background = false } = opts;
    if (!account?.id) return;
    // Same reasoning as the shared listings/rentals stores' background
    // flag — a periodic poll shouldn't flicker a loading state over
    // already-good data.
    if (!background) setMyListingsLoading(true);
    getMyListings(account.id)
      .then(setMyListings)
      .catch(() => {})
      .finally(() => { if (!background) setMyListingsLoading(false); });
  }, [account?.id]);

  useEffect(() => {
    refreshMyListings();
    // Background poll so this view stays current even without an
    // explicit action on THIS page triggering a refresh — e.g. a
    // listing changing state from another device/session.
    const id = setInterval(() => refreshMyListings({ background: true }), 15000);
    return () => clearInterval(id);
  }, [refreshMyListings]);

  const listings = myListings;
  const { requests, approveRental, declineRental, cancelRental, markCompleted, confirmReceived, returnRental } = useRentals();

  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // The item currently showing the "List this again?" prompt after being
  // auto-delisted from a completed rental — separate from `editingItem`
  // since this is a yes/no decision, not a form.
  const [relistPromptItem, setRelistPromptItem] = useState(null);
  const [relistBusy, setRelistBusy] = useState(false);

  // "Reviews" section on the My Items tab (moved here from Profile.jsx,
  // renamed from "My Reviews" to "Reviews") — same data/design as the
  // public Store page (OwnerStore.jsx): a real per-category star
  // breakdown plus the full review list, just shown for your own
  // account instead of someone else's.
  // Real account-level subscription tier — determines how much detail
  // Overview shows. Free stays simple (just the stat cards + one sales
  // chart, as before); Standard/Pro unlock additional real charts below.
  const [subscriptionPlanId, setSubscriptionPlanId] = useState("free");
  useEffect(() => {
    if (!account?.id) return;
    let cancelled = false;
    getMySubscription(account.id)
      .then((s) => { if (!cancelled) setSubscriptionPlanId(s.plan); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [account?.id]);
  const hasAnalyticsAccess = subscriptionPlanId !== "free";

  const [myReputation, setMyReputation] = useState({ avgRating: 0, reviewCount: 0, completedRentals: 0, categories: null });
  const [myReviews, setMyReviews] = useState([]);
  const [myReviewsLoading, setMyReviewsLoading] = useState(true);
  // Just city + presence — name/avatar already come from `account`
  // (useAuth()), no need to re-fetch those.
  const [myPublicInfo, setMyPublicInfo] = useState({ city: null, lastActiveAt: null });
  const [viewingMyPhoto, setViewingMyPhoto] = useState(false);

  useEffect(() => {
    if (!account?.id) return;
    let cancelled = false;
    setMyReviewsLoading(true);
    Promise.all([getUserReputationSummary(account.id), getReviewsForOwner(account.id), getPublicProfile(account.id)])
      .then(([rep, rv, pub]) => {
        if (cancelled) return;
        setMyReputation(rep);
        setMyReviews(rv);
        setMyPublicInfo({ city: pub?.city || null, lastActiveAt: pub?.lastActiveAt || null });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMyReviewsLoading(false); });
    return () => { cancelled = true; };
  }, [account?.id]);

  const handleReportReview = async (reviewId) => {
    if (!account) return;
    const reason = window.prompt("Why are you reporting this review? (e.g. fake, abusive, off-topic)");
    if (!reason || !reason.trim()) return;
    try {
      await reportReview({ reviewId, reporterId: account.id, reason: reason.trim() });
      window.alert("Thanks — this review has been reported for review.");
    } catch (err) {
      window.alert(err.message || "Couldn't submit the report. Please try again.");
    }
  };

  // A single "which request is currently being acted on" id covers
  // accept/decline/cancel — only one action can be in flight per row at
  // a time anyway, and this keeps RequestRow's disabled-state logic simple.
  const [actingRequestId, setActingRequestId] = useState(null);

  // Which rental ids the current user (as a renter) has already reviewed
  // — fetched once so RequestRow can hide "Leave a review" for those,
  // rather than inviting a second attempt the database would reject
  // anyway (see reviews_and_ratings.sql's UNIQUE constraint on rental_id).
  const [reviewedRentalIds, setReviewedRentalIds] = useState(new Set());
  const [reviewingRequest, setReviewingRequest] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  useEffect(() => {
    if (!account?.id) return;
    let cancelled = false;
    getMyReviewedRentalIds(account.id)
      .then((ids) => { if (!cancelled) setReviewedRentalIds(ids); })
      .catch(() => {}); // non-critical — worst case a doomed duplicate attempt gets a clear server error
    return () => { cancelled = true; };
  }, [account?.id]);

  const handleSubmitReview = async ({ rating, comment, itemAccuracy, communication, reliability, rentalExperience, returnCondition, agreementFollowed }) => {
    if (!reviewingRequest) return;
    setReviewSaving(true);
    setReviewError(null);
    try {
      // Who's being reviewed depends on which side the CURRENT user is
      // on for this rental — previously this was hardcoded to always
      // target the owner, which would have been wrong (and rejected by
      // the database's own participant check) for an owner reviewing a
      // renter.
      const reviewedUserId =
        reviewingRequest.reviewerRole === "owner" ? reviewingRequest.renterId : reviewingRequest.ownerId;

      // Defensive check: this used to be silently null for a renter
      // reviewing a completed rental on a now-delisted listing (an RLS
      // gap — see database/schema/fix_renter_listing_visibility.sql for
      // the real fix). Failing clearly here instead of letting a null
      // value hit the database means a future regression of this kind
      // shows a readable message instead of a raw constraint error.
      if (!reviewedUserId) {
        throw new Error(
          "Couldn't determine who to review — please refresh the page and try again."
        );
      }

      await createReview({
        rentalId: reviewingRequest.id,
        reviewerId: account.id,
        reviewedUserId,
        rating,
        comment,
        itemAccuracy,
        communication,
        reliability,
        rentalExperience,
        returnCondition,
        agreementFollowed,
      });
      setReviewedRentalIds((prev) => new Set(prev).add(reviewingRequest.id));
      setReviewingRequest(null);
    } catch (err) {
      setReviewError(err.message || "Couldn't submit your review. Please try again.");
    } finally {
      setReviewSaving(false);
    }
  };

  // `listings` (myListings) now includes delisted items too — this stat
  // should only count the ones actually live on the marketplace.
  const activeListings = listings.filter((l) => l.isActive).length;
  // These three stats are all framed from the OWNER's point of view
  // ("requests I've received", "rentals coming up on MY items", "money
  // I'm earning") — so each must filter `requests` down to rentals on
  // listings this user owns (r.ownerId === account.id), not just any
  // rental status regardless of which side of it the user is on. Without
  // this filter, a user's own spending as a renter would incorrectly
  // inflate their "earnings," which is a real financial-reporting bug
  // once `requests` contains genuine multi-user data instead of a single
  // mock user's data.
  const myOwnerRequests = requests.filter((r) => r.ownerId === account?.id);
  // New — "My History" is the mirror of myOwnerRequests: rentals where
  // the current account is the RENTER (requesting someone else's item),
  // previously mixed together with owner-side requests in one combined
  // list. Split into its own tab per explicit request.
  const myRenterRequests = requests.filter((r) => r.renterId === account?.id);
  const pendingRequests = myOwnerRequests.filter((r) => r.status === "Pending").length;
  // Real bugs found on review, all fixed here:
  //  1. Was summing r.price (the per-day RATE) instead of the actual
  //     amount earned — a 4-day ₱450/day rental counted as ₱450, not
  //     the real ₱1800 (or less, if it was an early return).
  //  2. Labeled "Earnings this month" but had no date filtering at
  //     all — it was actually all-time earnings.
  //  3. Didn't count Returned rentals as earning anything, even though
  //     an early return still pays out (just a recalculated amount).
  const now = new Date();
  const earningsThisMonth = myOwnerRequests
    .filter((r) => {
      if (!["Accepted", "Completed", "Returned"].includes(r.status)) return false;
      const created = new Date(r.createdAt);
      return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
    })
    .reduce((sum, r) => sum + (Number(r.adjustedPrice ?? r.totalPrice ?? r.price) || 0), 0);

  // `requests` is already newest-first (getMyRentals orders by
  // created_at desc) — "Recent" is just the first handful of that same
  // list, "All requests" below is the complete list.
  // "Recent" now means genuinely recent — within the last 24 hours by
  // real timestamp — rather than just "the newest 5 regardless of age."
  // Once a request passes the 24-hour mark it naturally drops out of
  // this list on its own (no action needed) and remains visible in "All
  // requests" below, which always shows everything.
  const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
  const isRecent = (r) => r.createdAt && Date.now() - new Date(r.createdAt).getTime() <= RECENT_WINDOW_MS;
  // Split by role now that My History and Requests are separate tabs —
  // each tab's own "Recent" section should only ever show that tab's
  // own rentals, not the other role's mixed in.
  const recentMyHistory = myRenterRequests.filter(isRecent);
  const recentOwnerRequests = myOwnerRequests.filter(isRecent);

  const [historyFilter, setHistoryFilter] = useState("all");
  const filterByStatus = (list) => {
    const match = HISTORY_FILTERS.find(([key]) => key === historyFilter);
    const statuses = match ? match[2] : null;
    return statuses ? list.filter((r) => statuses.includes(r.status)) : list;
  };
  const filteredMyHistory = useMemo(() => filterByStatus(myRenterRequests), [myRenterRequests, historyFilter]);
  const filteredOwnerRequests = useMemo(() => filterByStatus(myOwnerRequests), [myOwnerRequests, historyFilter]);

  // Real category breakdown of the owner's own listings — available on
  // every plan (Free included), computed straight from data already on
  // hand, nothing paid-only about it.
  const categoryBreakdown = useMemo(() => {
    const counts = {};
    myListings.forEach((l) => {
      const cat = l.category || "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [myListings]);

  // Real per-listing revenue — Pro-only, groups actual earned amounts
  // (adjustedPrice for early returns, else totalPrice) by listing, so
  // an owner can see which of their items actually earns the most.
  const topListingsByRevenue = useMemo(() => {
    const totals = {};
    myOwnerRequests.forEach((r) => {
      if (!["Completed", "Returned"].includes(r.status)) return;
      const amount = Number(r.adjustedPrice ?? r.totalPrice ?? 0);
      totals[r.itemId] = (totals[r.itemId] || 0) + amount;
    });
    return Object.entries(totals)
      .map(([itemId, revenue]) => {
        const listing = myListings.find((l) => l.id === itemId);
        return { itemId, revenue, name: listing?.name || "Deleted listing" };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [myOwnerRequests, myListings]);

  const STATS = [
    ["Active listings", String(activeListings), TrendingUp],
    ["Rental requests", String(pendingRequests), ClipboardList],
    ["Earnings this month", `₱${earningsThisMonth.toLocaleString()}`, Sparkles],
  ];

  // Deliberately searches allListings (every active public listing), not
  // the owner-filtered `listings` above — `requests` legitimately mixes
  // rentals the current user made AS A RENTER on someone else's item with
  // requests received AS AN OWNER on their own item, and this needs to
  // resolve both cases to show the item's photo/name in either tab.
  // Falls back to `listings` (this user's OWN listings, all statuses —
  // see the myListings/getMyListings note above) when not found in the
  // public active-only feed — otherwise a completed rental's own listing
  // photo/details would vanish the moment it got auto-delisted, since it
  // drops out of `allListings` at that exact point. This only covers the
  // case where the CURRENT user is that listing's owner; a renter
  // looking at a rental on someone ELSE's now-delisted item still won't
  // find it here, since there's no "all of someone else's listings"
  // fetch available — a known, smaller gap versus the common case this
  // fixes (owners reviewing their own now-completed rentals).
  const findListing = (request) => allListings.find((l) => l.id === request.itemId) || listings.find((l) => l.id === request.itemId);

  const [analyticsRange, setAnalyticsRange] = useState("week");
  const [salesRange, setSalesRange] = useState("week");

  // Real earnings over time for the OWNER, bucketed by day/week/month —
  // previously Overview had no chart at all, just a duplicate copy of
  // the full Rental Requests list under a "Recent requests" heading.
  // Only counts Accepted/Completed requests on listings this user owns
  // (myOwnerRequests, already computed above) — same eligibility as the
  // "Earnings this month" stat card, just broken out over time instead
  // of collapsed into one number.
  const salesData = useMemo(() => {
    const now = new Date();
    const eligible = myOwnerRequests.filter((r) => ["Accepted", "Completed", "Returned"].includes(r.status));

    if (salesRange === "day") {
      // Fixed calendar day, midnight to midnight — previously a rolling
      // "last 24 hours from right now" window, which produced odd
      // non-round-hour bucket labels (e.g. 3:47 AM, 6:47 AM...) instead
      // of a clean, readable axis.
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const points = [];
      for (let i = 0; i <= 8; i++) {
        points.push(new Date(startOfDay.getTime() + i * 3 * 60 * 60 * 1000));
      }
      return points.slice(0, 8).map((start, idx) => {
        const end = points[idx + 1];
        const sales = eligible
          .filter((r) => {
            const d = new Date(r.createdAt);
            return d >= start && d < end;
          })
          .reduce((sum, r) => sum + (Number(r.adjustedPrice ?? r.totalPrice ?? r.price) || 0), 0);
        return { label: start.toLocaleTimeString(undefined, { hour: "numeric" }), sales };
      });
    }

    if (salesRange === "week") {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push(d);
      }
      return days.map((d) => {
        const label = d.toLocaleDateString(undefined, { weekday: "short" });
        const sales = eligible
          .filter((r) => new Date(r.createdAt).toDateString() === d.toDateString())
          .reduce((sum, r) => sum + (Number(r.adjustedPrice ?? r.totalPrice ?? r.price) || 0), 0);
        return { label, sales };
      });
    }

    // month -> last 4 weeks
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      weeks.push({ start, end });
    }
    return weeks.map(({ start, end }, idx) => {
      const sales = eligible
        .filter((r) => {
          const d = new Date(r.createdAt);
          return d >= start && d <= end;
        })
        .reduce((sum, r) => sum + (Number(r.adjustedPrice ?? r.totalPrice ?? r.price) || 0), 0);
      return { label: `Week ${idx + 1}`, sales };
    });
  }, [myOwnerRequests, salesRange]);

  const totalSalesInRange = salesData.reduce((sum, d) => sum + d.sales, 0);

  // ---- Additional analytics, only actually shown for paid plans (see
  // hasAnalyticsAccess above) — all computed from the same real
  // myOwnerRequests data the simple stat cards already use, nothing
  // fabricated for the "richer" view. ----
  const STATUS_COLORS = {
    Pending: "#E2932E",
    Accepted: "#4B5D46",
    Completed: "#17231D",
    Cancelled: "#c0785a",
    Declined: "#a15c1f",
  };
  const CATEGORY_COLORS = ["#4B5D46", "#E2932E", "#17231D", "#8A9089", "#a15c1f"];
  const requestStatusBreakdown = useMemo(() => {
    const counts = {};
    for (const r of myOwnerRequests) counts[r.status] = (counts[r.status] || 0) + 1;
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [myOwnerRequests]);

  // A Returned rental is just as much a successfully-resolved rental as
  // a Completed one (the item genuinely was rented and used, just ended
  // early) — previously excluded here, understating both the numerator
  // and denominator of this rate.
  const completedCount = myOwnerRequests.filter((r) => ["Completed", "Returned"].includes(r.status)).length;
  const resolvedCount = myOwnerRequests.filter((r) =>
    ["Completed", "Returned", "Cancelled", "Declined"].includes(r.status)
  ).length;
  const completionRate = resolvedCount > 0 ? Math.round((completedCount / resolvedCount) * 100) : null;

  // Cumulative earnings across the same buckets as the Sales chart —
  // shows growth over the period rather than just per-bucket amounts.
  const cumulativeSalesData = useMemo(() => {
    let running = 0;
    return salesData.map((d) => {
      running += d.sales;
      return { label: d.label, cumulative: running };
    });
  }, [salesData]);


  // Aggregates real recorded view timestamps (from listing.viewHistory)
  // across all of the user's listings into day/week/month buckets for the
  // selected range. No fabricated numbers — buckets with zero real views
  // show as 0, not a plausible-looking placeholder.
  const analyticsData = useMemo(() => {
    const now = new Date();
    const allViews = listings.flatMap((l) => l.viewHistory || []);

    if (analyticsRange === "week") {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push(d);
      }
      return days.map((d) => {
        const label = d.toLocaleDateString(undefined, { weekday: "short" });
        const count = allViews.filter((v) => {
          const vd = new Date(v);
          return vd.toDateString() === d.toDateString();
        }).length;
        return { label, views: count };
      });
    }

    if (analyticsRange === "month") {
      const weeks = [];
      for (let i = 3; i >= 0; i--) {
        const end = new Date(now);
        end.setDate(end.getDate() - i * 7);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        weeks.push({ start, end });
      }
      return weeks.map(({ start, end }, idx) => {
        const count = allViews.filter((v) => {
          const vd = new Date(v);
          return vd >= start && vd <= end;
        }).length;
        return { label: `Week ${idx + 1}`, views: count };
      });
    }

    // year
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d);
    }
    return months.map((d) => {
      const label = d.toLocaleDateString(undefined, { month: "short" });
      const count = allViews.filter((v) => {
        const vd = new Date(v);
        return vd.getFullYear() === d.getFullYear() && vd.getMonth() === d.getMonth();
      }).length;
      return { label, views: count };
    });
  }, [listings, analyticsRange]);

  const totalViewsInRange = analyticsData.reduce((sum, d) => sum + d.views, 0);
  const hasAnyPaidListing = listings.some((l) => l.plan && l.plan !== "free");

  const handleSaveEdit = async (patch) => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateListing(editingItem.id, patch);
      setEditingItem(null);
      refreshMyListings();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this listing? This can't be undone.")) return;
    setDeletingId(id);
    try {
      await deleteListingFromContext(id);
      refreshMyListings();
    } catch (err) {
      window.alert(err.message || "Couldn't delete this listing.");
    } finally {
      setDeletingId(null);
    }
  };

  // Manual "Delist" — voluntarily taking an active item off the
  // marketplace, distinct from the automatic delist that happens when a
  // rental is accepted. Relisting later gives a fresh period (same as
  // relisting a completed/expired one), since there's no rental to
  // resume time from.
  const [delistingId, setDelistingId] = useState(null);
  const handleDelist = async (id) => {
    if (!window.confirm("Take this listing off the marketplace? You can list it again anytime.")) return;
    setDelistingId(id);
    try {
      await delistListingManually(id);
      refreshMyListings();
      refreshSharedListings();
    } catch (err) {
      window.alert(err.message || "Couldn't delist this item.");
    } finally {
      setDelistingId(null);
    }
  };

  // "Do you want to list the item again?" — shown when an owner clicks
  // an auto-delisted item (see database/schema/
  // limits_delisting_notifications.sql's Completed-status trigger).
  // Yes re-activates the SAME listing (subject to the same per-plan
  // active-listing-count check a brand new listing would face); No
  // deletes it permanently so the owner can start fresh with a new one.
  const handleRelistYes = async (id) => {
    setRelistBusy(true);
    try {
      // Always a FRESH full period, from the listing's own plan — the
      // "reward" for completing a rental or for renewing an expired
      // one. Previously this call had no days argument at all, so it
      // couldn't give a real reset (and the backend now guards against
      // relisting something currently mid-rental too).
      const days = getPlanById(relistPromptItem?.plan).days;
      await relistListing(id, days);
      setRelistPromptItem(null);
      refreshMyListings();
      // Relisting makes the item active again — the public feed (Browse/
      // Home/Map, all backed by the SEPARATE shared listings context)
      // needs to know too, or it would stay invisible there until
      // someone happened to reload the page.
      refreshSharedListings();
    } catch (err) {
      window.alert(err.message || "Couldn't relist this item.");
    } finally {
      setRelistBusy(false);
    }
  };

  const handleRelistNo = async (id) => {
    setRelistBusy(true);
    try {
      await deleteListingFromContext(id);
      setRelistPromptItem(null);
      refreshMyListings();
    } catch (err) {
      window.alert(err.message || "Couldn't delete this listing.");
    } finally {
      setRelistBusy(false);
    }
  };

  const handleCancelRequest = async (id, confirmMessage = "Cancel this rental request?") => {
    if (!window.confirm(confirmMessage)) return;
    setActingRequestId(id);
    try {
      await cancelRental(id);
    } catch (err) {
      window.alert(err.message || "Couldn't cancel this request. Please try again.");
    } finally {
      setActingRequestId(null);
    }
  };

  // Owner confirms they've actually handed the item to the renter —
  // this is what flips the renter's button from "Cancel" to
  // "Return Item" (see database/schema/confirm_item_received.sql).
  const handleConfirmReceived = async (id) => {
    if (!window.confirm("Confirm you've handed this item to the renter?")) return;
    setActingRequestId(id);
    try {
      await confirmReceived(id);
    } catch (err) {
      window.alert(err.message || "Couldn't confirm handoff. Please try again.");
    } finally {
      setActingRequestId(null);
    }
  };

  // Real distinct "Returned" transition — only reachable once handoff
  // was confirmed (see database/schema/real_returned_status.sql, which
  // rejects this otherwise). Confirmation dialog is shown at the call
  // site (RequestRow) since its wording depends on context.
  const handleReturnItem = async (id) => {
    setActingRequestId(id);
    try {
      await returnRental(id);
    } catch (err) {
      window.alert(err.message || "Couldn't return this item. Please try again.");
    } finally {
      setActingRequestId(null);
    }
  };

  const handleApproveRequest = async (id) => {
    setActingRequestId(id);
    try {
      await approveRental(id);
    } catch (err) {
      window.alert(err.message || "Couldn't accept this request. Please try again.");
    } finally {
      setActingRequestId(null);
    }
  };

  const handleDeclineRequest = async (id) => {
    if (!window.confirm("Decline this rental request?")) return;
    setActingRequestId(id);
    try {
      await declineRental(id);
    } catch (err) {
      window.alert(err.message || "Couldn't decline this request. Please try again.");
    } finally {
      setActingRequestId(null);
    }
  };

  const handleMarkCompleted = async (id) => {
    if (!window.confirm("Mark this rental as completed? The renter will then be able to leave a review.")) return;
    setActingRequestId(id);
    try {
      await markCompleted(id);
      // Marking Completed auto-delists the listing server-side (see
      // database/schema/limits_delisting_notifications.sql) — both this
      // page's own "My Items" fetch AND the shared public feed
      // (Browse/Home/Map) need to reflect that immediately, not wait for
      // a manual reload or the next background poll.
      refreshMyListings();
      refreshSharedListings();
    } catch (err) {
      window.alert(err.message || "Couldn't mark this rental completed. Please try again.");
    } finally {
      setActingRequestId(null);
    }
  };

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12">
      <h1 className="font-serif text-[26px] md:text-[30px] text-[#17231D]">Dashboard</h1>
      {/* flex-1 on each button makes all 5 tabs share the row equally
          instead of each being only as wide as its own label — "My
          History" (the longest label) was noticeably wider than the
          others before, since width just followed text length. */}
      <div className="flex gap-2 mt-5">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 px-2 md:px-4 py-2 rounded-full text-[12.5px] md:text-[13.5px] font-medium border text-center whitespace-nowrap ${
              tab === k ? "bg-[#17231D] text-[#F6F4EE] border-[#17231D]" : "border-[#17231D]/15 text-[#17231D]"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="mt-7 space-y-6 fade-in-up">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 border-t border-b border-[#17231D]/10 py-5 stagger-children">
            {STATS.map(([l, v, Icon], i) => (
              <div key={l} className={`pl-4 transition-transform duration-300 hover:-translate-y-0.5 ${i > 0 ? "md:border-l md:border-[#17231D]/10" : ""}`}>
                <p className="text-[12px] text-[#8A9089] flex items-center gap-1.5 mb-2">
                  <span className="w-6 h-6 rounded-full bg-[#4B5D46]/10 flex items-center justify-center">
                    <Icon size={12} className="text-[#4B5D46]" />
                  </span>
                  {l}
                </p>
                <p className="font-serif text-[26px] text-[#17231D] leading-none">{v}</p>
              </div>
            ))}
          </div>

          {/* Real category breakdown — available on every plan (not a
              paid-only feature), computed from the owner's own actual
              listings, not fabricated. Previously Free had nothing
              besides the stat row + one Sales chart. Redesigned as a
              donut chart (matching "Request outcomes" below) after the
              original long horizontal-bar-list version looked
              disjointed, especially with few categories. */}
          {categoryBreakdown.length > 0 && (
            <div className="rounded-xl border border-[#17231D]/8 bg-white p-5 fade-in-up">
              <p className="text-[14px] font-medium text-[#17231D] mb-3">Your listings by category</p>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="count"
                      nameKey="category"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {categoryBreakdown.map((entry, i) => (
                        <Cell key={entry.category} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11.5 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #17231D14" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Real earnings-over-time chart — replaces the old "Recent
              requests" list, which was just an exact duplicate of the
              full Rental Requests tab and didn't belong on a page meant
              to be a statistical/visual overview. See requests/all
              lists in the "Rental Requests" tab instead. */}
          <div className="rounded-xl border border-[#17231D]/8 bg-white p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-[#4B5D46]" />
                <p className="text-[14px] font-medium text-[#17231D]">Sales</p>
              </div>
              <div className="flex gap-1.5">
                {[
                  ["day", "Day"],
                  ["week", "Week"],
                  ["month", "Month"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSalesRange(key)}
                    className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
                      salesRange === key
                        ? "bg-[#17231D] text-[#F6F4EE]"
                        : "text-[#6b6f66] hover:bg-[#17231D]/[0.05]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[12.5px] text-[#8A9089] mt-2">
              ₱{totalSalesInRange.toLocaleString()} in accepted/completed rentals this {salesRange}.
            </p>

            <div className="mt-4" style={{ width: "100%", height: 220 }}>
              {totalSalesInRange === 0 ? (
                <div className="h-full flex items-center justify-center text-[13px] text-[#8A9089] text-center px-6">
                  No completed sales recorded yet for this {salesRange}.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#17231D0F" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8A9089" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8A9089" }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      cursor={{ fill: "#17231D08" }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #17231D14" }}
                      formatter={(value) => [`₱${value.toLocaleString()}`, "Sales"]}
                    />
                    <Bar dataKey="sales" fill="#4B5D46" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Detailed analytics — only for paid plans (Standard/Pro).
              Free stays intentionally simple: just the stat cards and
              the one Sales chart above. Everything below is computed
              from the same real data already used above — nothing
              fabricated for the "richer" tier. */}
          {hasAnalyticsAccess ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#17231D]/8 bg-white p-4">
                  <p className="text-[12px] text-[#8A9089]">Completion rate</p>
                  <p className="font-serif text-[22px] text-[#17231D] mt-1">
                    {completionRate === null ? "—" : `${completionRate}%`}
                  </p>
                  <p className="text-[11px] text-[#8A9089] mt-0.5">
                    {completedCount} completed of {resolvedCount} resolved request{resolvedCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#17231D]/8 bg-white p-4">
                  <p className="text-[12px] text-[#8A9089]">Average rating</p>
                  <p className="font-serif text-[22px] text-[#17231D] mt-1 flex items-center gap-1.5">
                    {myReputation.reviewCount > 0 ? (
                      <>
                        <Star size={16} className="fill-[#E2932E] text-[#E2932E]" /> {myReputation.avgRating}
                      </>
                    ) : (
                      "New"
                    )}
                  </p>
                  <p className="text-[11px] text-[#8A9089] mt-0.5">
                    From {myReputation.reviewCount} review{myReputation.reviewCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#17231D]/8 bg-white p-5">
                  <p className="text-[14px] font-medium text-[#17231D] mb-3">Request outcomes</p>
                  {requestStatusBreakdown.length === 0 ? (
                    <p className="text-[13px] text-[#8A9089]">No requests yet.</p>
                  ) : (
                    <div style={{ width: "100%", height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={requestStatusBreakdown}
                            dataKey="count"
                            nameKey="status"
                            innerRadius={40}
                            outerRadius={70}
                            paddingAngle={2}
                          >
                            {requestStatusBreakdown.map((entry) => (
                              <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#8A9089"} />
                            ))}
                          </Pie>
                          <Legend wrapperStyle={{ fontSize: 11.5 }} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #17231D14" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[#17231D]/8 bg-white p-5">
                  <p className="text-[14px] font-medium text-[#17231D] mb-3">Cumulative earnings ({salesRange})</p>
                  {totalSalesInRange === 0 ? (
                    <p className="text-[13px] text-[#8A9089]">No completed sales recorded yet for this {salesRange}.</p>
                  ) : (
                    <div style={{ width: "100%", height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={cumulativeSalesData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#17231D0F" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8A9089" }} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8A9089" }} axisLine={false} tickLine={false} width={36} />
                          <Tooltip
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #17231D14" }}
                            formatter={(value) => [`₱${value.toLocaleString()}`, "Cumulative"]}
                          />
                          <Line type="monotone" dataKey="cumulative" stroke="#4B5D46" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* New — top listings by actual revenue earned. Real
                  data, grouped from the same Completed/Returned rentals
                  used everywhere else, not a separate fabricated stat. */}
              {topListingsByRevenue.length > 0 && (
                <div className="rounded-xl border border-[#17231D]/8 bg-white p-5 fade-in-up">
                  <p className="text-[14px] font-medium text-[#17231D] mb-4">Top listings by revenue</p>
                  <div className="space-y-3">
                    {topListingsByRevenue.map((l, i) => (
                      <div key={l.itemId} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-[#E2932E]/15 text-[#a15c1f] text-[11px] font-semibold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-[13px] text-[#17231D] flex-1 truncate">{l.name}</span>
                        <span className="text-[13px] font-medium text-[#17231D] shrink-0">₱{l.revenue.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-[#17231D]/15 bg-white p-5 text-center">
              <p className="text-[13.5px] text-[#17231D] font-medium">More detailed analytics on Standard & Pro</p>
              <p className="text-[12.5px] text-[#8A9089] mt-1">
                Request outcome breakdown, cumulative earnings, average rating, and more —
                upgrade from the Free plan to unlock them.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "equipment" && (
        <div className="mt-7">
          {/* Your own profile summary — same layout as what other people
              see on your public profile (OwnerStore.jsx), just shown
              here too so you don't have to leave Dashboard to see how
              you currently look to renters. Reuses the same
              myReputation/myPublicInfo data the Reviews section below
              already fetches — no duplicate request. */}
          <div className="flex items-center gap-4 mb-7 pb-6 border-b border-[#17231D]/8">
            <button
              onClick={() => setViewingMyPhoto(true)}
              className="w-24 h-24 rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer"
              title="View profile photo"
            >
              {account?.avatarUrl ? (
                <img src={account.avatarUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="font-serif text-[32px] text-[#6b6f66]">
                  {(account?.name || "?").charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <div>
              <p className="font-serif text-[24px] text-[#17231D]">{account?.name}'s Profile</p>
              <PresenceBadge lastActiveAt={myPublicInfo.lastActiveAt} size="md" />
              {myReputation.reviewCount > 0 ? (
                <p className="flex items-center gap-1.5 text-[15px] text-[#6b6f66] mt-1.5">
                  <Star size={15} className="fill-[#E2932E] text-[#E2932E]" />
                  {myReputation.avgRating} · {myReputation.reviewCount} review{myReputation.reviewCount === 1 ? "" : "s"}
                </p>
              ) : (
                <p className="text-[15px] text-[#8A9089] mt-1.5">New · no reviews yet</p>
              )}
              <p className="text-[13.5px] text-[#8A9089] mt-1">
                {myReputation.completedRentals} completed rental{myReputation.completedRentals === 1 ? "" : "s"}
                {myPublicInfo.city && ` · ${myPublicInfo.city}`}
              </p>
            </div>
          </div>

          {viewingMyPhoto && (
            <PhotoViewerModal
              photoUrl={account?.avatarUrl}
              initial={(account?.name || "?").charAt(0).toUpperCase()}
              onClose={() => setViewingMyPhoto(false)}
            />
          )}

          {/* Title + counter — this is the "My listings" count that
              previously lived as a stat card on Profile.jsx, moved here
              to sit right next to the actual list it's counting. */}
          <div className="flex items-center gap-2 mb-5">
            <h2 className="font-serif text-[19px] text-[#17231D]">My Items</h2>
            <span className="text-[13px] text-[#8A9089]">({listings.length})</span>
          </div>

          {/* "Listing expiring" — computed LIVE here rather than a stored/
              pushed notification, since that needs a scheduled job this
              project isn't configured for (see database/schema/
              limits_delisting_notifications.sql's file header). Still
              real data, just checked on page load instead of pushed. */}
          {(() => {
            const soon = listings.filter((l) => {
              if (!l.isActive || !l.expirationDate) return false;
              const daysLeft = (new Date(l.expirationDate) - Date.now()) / (1000 * 60 * 60 * 24);
              return daysLeft > 0 && daysLeft <= 3;
            });
            if (soon.length === 0) return null;
            return (
              <div className="flex items-start gap-2.5 rounded-xl bg-[#E2932E]/10 border border-[#E2932E]/30 px-4 py-3 mb-5">
                <ShieldAlert size={16} className="text-[#a15c1f] shrink-0 mt-0.5" />
                <p className="text-[13px] text-[#8a5a13]">
                  {soon.length === 1
                    ? `"${soon[0].name}" expires within 3 days.`
                    : `${soon.length} listings expire within 3 days.`}{" "}
                  Renew from your subscription plan to keep them live.
                </p>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-7">
            {!myListingsLoading && listings.length === 0 && (
              <p className="col-span-full text-[14px] text-[#6b6f66]">
                You haven't listed any items yet.
              </p>
            )}
            {listings.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => openItem(item)}
                  className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-[#e9e5d8] w-full text-left"
                >
                  <img src={item.img} className={`w-full h-full object-cover ${!item.isActive ? "grayscale opacity-60" : ""}`} />
                  {!item.isActive && (
                    <span className="absolute top-2 left-2 px-2 py-1 rounded-full bg-[#17231D] text-white text-[10.5px] font-semibold">
                      {item.isPaused ? "Currently rented" : "Delisted"}
                    </span>
                  )}
                </button>
                <button onClick={() => openItem(item)} className="text-left w-full">
                  <p className="text-[14px] font-medium text-[#17231D] mt-2.5 hover:underline">{item.name}</p>
                </button>
                <p className="text-[13px] text-[#6b6f66]">
                  ₱{item.price}/day
                  {item.isPaused ? " · Out with a renter right now" : !item.isActive ? " · No longer listed" : ""}
                </p>
                {item.planName && item.isActive && (
                  <p className="text-[11.5px] text-[#8A9089] mt-0.5">
                    {item.planName}
                    {item.expirationDate &&
                      ` · until ${new Date(item.expirationDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </p>
                )}
                {item.plan && item.plan !== "free" && item.isActive && (
                  <p className="text-[12px] text-[#4B5D46] font-medium mt-1">
                    {item.viewCount || 0} view{item.viewCount === 1 ? "" : "s"}
                  </p>
                )}

                {item.isActive ? (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button
                      onClick={() => setEditingItem(item)}
                      className="text-[12.5px] px-3 py-1.5 rounded-full border border-[#17231D]/15 text-[#17231D]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelist(item.id)}
                      disabled={delistingId === item.id}
                      className="text-[12.5px] px-3 py-1.5 rounded-full border border-[#17231D]/15 text-[#17231D] disabled:opacity-60"
                    >
                      {delistingId === item.id ? "Delisting…" : "Delist"}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="text-[12.5px] px-3 py-1.5 rounded-full border border-red-300 text-red-600 disabled:opacity-60"
                    >
                      {deletingId === item.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                ) : item.isPaused ? (
                  // Currently out on an Accepted rental — the backend's
                  // relist_listing() RPC would refuse this anyway, but
                  // not even offering Edit/Delete/Relist here avoids
                  // confusing an owner with buttons that can't work
                  // while the item is legitimately in someone else's
                  // hands right now.
                  <p className="text-[12px] text-[#8A9089] mt-2">
                    Available again automatically once this rental ends or is cancelled.
                  </p>
                ) : (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button
                      onClick={() => setRelistPromptItem(item)}
                      className="text-[12.5px] px-3 py-1.5 rounded-full bg-[#17231D] text-white font-medium"
                    >
                      List again?
                    </button>
                    {/* Edit/Delete are also available directly on a
                        delisted item — previously the only option here
                        was the relist prompt, with no way to fix a
                        detail (price, description) before republishing,
                        or to just delete it without going through that
                        prompt first. */}
                    <button
                      onClick={() => setEditingItem(item)}
                      className="text-[12.5px] px-3 py-1.5 rounded-full border border-[#17231D]/15 text-[#17231D]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="text-[12.5px] px-3 py-1.5 rounded-full border border-red-300 text-red-600 disabled:opacity-60"
                    >
                      {deletingId === item.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* "Reviews" — moved here from Profile.jsx (previously "My
              Reviews"), rebuilt to match the exact design of the public
              Store page (OwnerStore.jsx): a real per-category star
              breakdown card, then the full review list with avatar,
              name, star rating, comment, date, and a Report link. */}
          <div className="mt-10">
            <h2 className="font-serif text-[19px] text-[#17231D] mb-4">
              Reviews {myReviews.length > 0 && `(${myReviews.length})`}
            </h2>

            {myReputation.categories &&
              Object.entries(myReputation.categories).some(([, v]) => v !== null && v !== undefined) && (
                <div className="rounded-xl border border-[#17231D]/8 bg-white p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-5">
                  {Object.entries(myReputation.categories)
                    .filter(([, v]) => v !== null && v !== undefined)
                    .map(([key, value]) => (
                      <div key={key}>
                        <p className="text-[11.5px] text-[#8A9089]">{CATEGORY_LABELS[key] || key}</p>
                        <p className="flex items-center gap-1 text-[13px] font-medium text-[#17231D] mt-0.5">
                          <Star size={12} className="fill-[#E2932E] text-[#E2932E]" /> {value}
                        </p>
                      </div>
                    ))}
                </div>
              )}

            {myReviewsLoading ? (
              <p className="text-[13.5px] text-[#6b6f66]">Loading…</p>
            ) : myReviews.length === 0 ? (
              <p className="text-[13.5px] text-[#6b6f66] rounded-xl border border-[#17231D]/8 bg-white px-4 py-4">
                No reviews yet — reviews left by owners you've rented from, or renters who've
                rented from you, will show up here.
              </p>
            ) : (
              <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
                {myReviews.map((r) => (
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
                        <p className="text-[13.5px] font-medium text-[#17231D]">{r.reviewerName}</p>
                      </div>
                      <span className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            size={14}
                            className={n <= Math.round(r.rating) ? "fill-[#E2932E] text-[#E2932E]" : "text-[#17231D]/15"}
                          />
                        ))}
                      </span>
                    </div>
                    {r.comment && <p className="text-[13.5px] text-[#3c3f38] mt-1.5">{r.comment}</p>}
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[11.5px] text-[#8A9089]">
                        {new Date(r.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                      <button
                        onClick={() => handleReportReview(r.id)}
                        className="text-[11px] text-[#8A9089] hover:text-red-600 underline"
                      >
                        Report
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {relistPromptItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h3 className="font-serif text-[19px] text-[#17231D] mb-2">List "{relistPromptItem.name}" again?</h3>
            <p className="text-[13.5px] text-[#6b6f66] mb-4">
              This gives it a fresh {getPlanById(relistPromptItem.plan).days}-day listing period on your{" "}
              {getPlanById(relistPromptItem.plan).name} plan, starting now — the reward for a completed
              rental (or for renewing an expired listing). Or delete it permanently if you're done
              renting it out.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleRelistNo(relistPromptItem.id)}
                disabled={relistBusy}
                className="flex-1 px-4 py-2.5 rounded-full border border-red-300 text-red-600 text-[13.5px] font-medium disabled:opacity-60"
              >
                {relistBusy ? "…" : "No, delete it"}
              </button>
              <button
                onClick={() => handleRelistYes(relistPromptItem.id)}
                disabled={relistBusy}
                className="flex-1 px-4 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium disabled:opacity-60"
              >
                {relistBusy ? "…" : "Yes, list again"}
              </button>
            </div>
            <button
              onClick={() => setRelistPromptItem(null)}
              className="w-full text-center text-[12.5px] text-[#8A9089] mt-3"
            >
              Decide later
            </button>
          </div>
        </div>
      )}

      {tab === "equipment" && hasAnyPaidListing && (
        <div className="mt-8 rounded-xl border border-[#17231D]/8 bg-white p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-[#4B5D46]" />
              <p className="text-[14px] font-medium text-[#17231D]">Seller analytics</p>
            </div>
            <div className="flex gap-1.5">
              {[
                ["week", "Week"],
                ["month", "Month"],
                ["year", "Year"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAnalyticsRange(key)}
                  className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
                    analyticsRange === key
                      ? "bg-[#17231D] text-[#F6F4EE]"
                      : "text-[#6b6f66] hover:bg-[#17231D]/[0.05]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[12.5px] text-[#8A9089] mt-2">
            {totalViewsInRange} view{totalViewsInRange === 1 ? "" : "s"} across all your listings this {analyticsRange}.
          </p>

          <div className="mt-4" style={{ width: "100%", height: 220 }}>
            {totalViewsInRange === 0 ? (
              <div className="h-full flex items-center justify-center text-[13px] text-[#8A9089]">
                No views recorded yet for this {analyticsRange}. Views update in real time as people open your listings.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#17231D0F" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8A9089" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8A9089" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    cursor={{ fill: "#17231D08" }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #17231D14" }}
                  />
                  <Bar dataKey="views" fill="#E2932E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {tab === "saved" && (
        <div className="mt-7">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="font-serif text-[19px] text-[#17231D]">Saved</h2>
          </div>
          <Saved openItem={openItem} />
        </div>
      )}

      {tab === "myhistory" && (
        <div className="mt-7 space-y-6">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-[19px] text-[#17231D]">My History</h2>
            <span className="text-[13px] text-[#8A9089]">({myRenterRequests.length})</span>
          </div>

          {myRenterRequests.length === 0 ? (
            <p className="px-4 py-6 text-[13.5px] text-[#6b6f66] rounded-xl border border-[#17231D]/8 bg-white">
              No rentals yet — items you request from other owners will show up here.
            </p>
          ) : (
            <>
              <div>
                <h3 className="font-medium text-[15px] text-[#17231D] mb-3">Recent</h3>
                <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
                  {recentMyHistory.length === 0 && (
                    <p className="px-4 py-6 text-[13.5px] text-[#6b6f66]">
                      No activity in the last 24 hours — check "All" below.
                    </p>
                  )}
                  {recentMyHistory.map((r) => (
                    <RequestRow
                      key={r.id}
                      request={r}
                      listing={findListing(r)}
                      isOwner={false}
                      onOpen={openItem}
                      onApprove={handleApproveRequest}
                      onDecline={handleDeclineRequest}
                      onCancel={handleCancelRequest}
                      onMarkCompleted={handleMarkCompleted}
                      onConfirmReceived={handleConfirmReceived}
                      onReturnItem={handleReturnItem}
                      onLeaveReview={setReviewingRequest}
                      onVisitProfile={visitProfile}
                      onViewReceipt={viewReceipt}
                      alreadyReviewed={reviewedRentalIds.has(r.id)}
                      actingId={actingRequestId}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="font-medium text-[15px] text-[#17231D]">All</h3>
                  <div className="flex gap-1.5 flex-wrap">
                    {HISTORY_FILTERS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setHistoryFilter(key)}
                        className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
                          historyFilter === key
                            ? "bg-[#17231D] text-[#F6F4EE]"
                            : "bg-white border border-[#17231D]/12 text-[#6b6f66] hover:border-[#17231D]/25"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
                  {filteredMyHistory.length === 0 && (
                    <p className="px-4 py-6 text-[13.5px] text-[#6b6f66]">No rentals match this filter.</p>
                  )}
                  {filteredMyHistory.map((r) => (
                    <RequestRow
                      key={r.id}
                      request={r}
                      listing={findListing(r)}
                      isOwner={false}
                      onOpen={openItem}
                      onApprove={handleApproveRequest}
                      onDecline={handleDeclineRequest}
                      onCancel={handleCancelRequest}
                      onMarkCompleted={handleMarkCompleted}
                      onConfirmReceived={handleConfirmReceived}
                      onReturnItem={handleReturnItem}
                      onLeaveReview={setReviewingRequest}
                      onVisitProfile={visitProfile}
                      onViewReceipt={viewReceipt}
                      alreadyReviewed={reviewedRentalIds.has(r.id)}
                      actingId={actingRequestId}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "requests" && (
        <div className="mt-7 space-y-6">
          {/* "Requests" — the mirror of "My History": rentals where the
              current account is the OWNER, receiving requests from
              other people for items they listed. Previously mixed
              together with renter-side history in one combined tab. */}
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-[19px] text-[#17231D]">Requests</h2>
            <span className="text-[13px] text-[#8A9089]">({myOwnerRequests.length})</span>
          </div>

          {myOwnerRequests.length === 0 ? (
            <p className="px-4 py-6 text-[13.5px] text-[#6b6f66] rounded-xl border border-[#17231D]/8 bg-white">
              No requests yet — when someone requests one of your items, it'll show up here.
            </p>
          ) : (
            <>
              <div>
                <h3 className="font-medium text-[15px] text-[#17231D] mb-3">Recent</h3>
                <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
                  {recentOwnerRequests.length === 0 && (
                    <p className="px-4 py-6 text-[13.5px] text-[#6b6f66]">
                      No activity in the last 24 hours — check "All requests" below.
                    </p>
                  )}
                  {recentOwnerRequests.map((r) => (
                    <RequestRow
                      key={r.id}
                      request={r}
                      listing={findListing(r)}
                      isOwner={true}
                      onOpen={openItem}
                      onApprove={handleApproveRequest}
                      onDecline={handleDeclineRequest}
                      onCancel={handleCancelRequest}
                      onMarkCompleted={handleMarkCompleted}
                      onConfirmReceived={handleConfirmReceived}
                      onReturnItem={handleReturnItem}
                      onLeaveReview={setReviewingRequest}
                      onVisitProfile={visitProfile}
                      onViewReceipt={viewReceipt}
                      alreadyReviewed={reviewedRentalIds.has(r.id)}
                      actingId={actingRequestId}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="font-medium text-[15px] text-[#17231D]">All requests</h3>
                  {/* Status picker — Completed / Cancelled (also covers
                      Declined, same "didn't happen" outcome) / In
                      Progress (Pending or Accepted — not yet resolved
                      either way). Only filters this list, not "Recent"
                      above, which always shows the most recent regardless
                      of status. */}
                  <div className="flex gap-1.5 flex-wrap">
                    {HISTORY_FILTERS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setHistoryFilter(key)}
                        className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
                          historyFilter === key
                            ? "bg-[#17231D] text-[#F6F4EE]"
                            : "bg-white border border-[#17231D]/12 text-[#6b6f66] hover:border-[#17231D]/25"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
                  {filteredOwnerRequests.length === 0 && (
                    <p className="px-4 py-6 text-[13.5px] text-[#6b6f66]">No requests match this filter.</p>
                  )}
                  {filteredOwnerRequests.map((r) => (
                    <RequestRow
                      key={r.id}
                      request={r}
                      listing={findListing(r)}
                      isOwner={true}
                      onOpen={openItem}
                      onApprove={handleApproveRequest}
                      onDecline={handleDeclineRequest}
                      onCancel={handleCancelRequest}
                      onMarkCompleted={handleMarkCompleted}
                      onConfirmReceived={handleConfirmReceived}
                      onReturnItem={handleReturnItem}
                      onLeaveReview={setReviewingRequest}
                      onVisitProfile={visitProfile}
                      onViewReceipt={viewReceipt}
                      alreadyReviewed={reviewedRentalIds.has(r.id)}
                      actingId={actingRequestId}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {editingItem && (
        <EditListingModal
          item={editingItem}
          account={account}
          saving={saving}
          error={saveError}
          onClose={() => {
            setEditingItem(null);
            setSaveError(null);
          }}
          onSave={handleSaveEdit}
        />
      )}

      {reviewingRequest && (
        <ReviewModal
          request={reviewingRequest}
          reviewerRole={reviewingRequest.reviewerRole}
          saving={reviewSaving}
          error={reviewError}
          onClose={() => {
            setReviewingRequest(null);
            setReviewError(null);
          }}
          onSubmit={handleSubmitReview}
        />
      )}
    </div>
  );
}