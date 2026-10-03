// ==================================================================
// FILE TYPE : PAGE (contains several merged sub-components — see SECTION banners below)
// PURPOSE   :
//   The full 'list your equipment' flow: item details form -> upload ->
//   publish. Plan/subscription selection and payment used to happen HERE,
//   per listing — that has moved to an account-level subscription (see
//   frontend/components/SubscriptionModal.jsx, opened from the top nav
//   badge or Profile). This page now just READS the account's current
//   plan (backend/supabase/subscription.js) to know its photo/active-
//   listing limits, and publishes directly against them — no payment
//   step happens here anymore. Also bundles a self-contained Leaflet-
//   based location picker (search + draggable pin + fullscreen modal).
// CONNECTS TO :
//   Reads useListings().createListing() and useAuth(). Reads the
//   account's subscription via backend/supabase/subscription.js. PLANS/
//   PlanCard now live in frontend/components/PlanCard.jsx, shared with
//   SubscriptionModal — this file no longer defines its own copy.
// ==================================================================
import React, { useState, useMemo, useEffect, useRef } from "react";
import { Camera, X, Check, ShieldCheck, MapPin, Map as MapIcon } from "lucide-react";
import Button from "../../components/Button";
import { MAX_UPLOAD_CAP, getPlanById } from "../../components/PlanCard";
import LocationPicker from "../../components/LocationPicker";
import CountrySelect from "../../components/CountrySelect";
import { reverseGeocodeFull } from "../../../shared/geocode";
import { formatLocation } from "../../../shared/countries";
import { useViewerCountry } from "../../../state/location/locationStore";
import { CATEGORIES } from "../../../shared/constants";
import { useListings } from "../../../state/listings/listingsStore";
import { useAuth } from "../../../state/auth/authStore";
import { uploadListingPhotos } from "../../../backend/supabase/storage";
import { getMySubscription } from "../../../backend/supabase/subscription";

// Matches the database's own ceiling (stricter_listing_rules.sql's
// listings_price_ceiling) — kept in sync here so the frontend can warn
// live, before ever hitting the database.
const MAX_REALISTIC_PRICE = 100000;

// Same 5-option range as Dashboard.jsx's EditListingModal — kept as a
// separate copy here (not imported) since it's a small plain array,
// consistent with how other small constants are already duplicated
// per-file elsewhere in this codebase.
const CONDITIONS = ["New", "Like New", "Good", "Fair"];

// Small reusable inline help — a ⓘ button that toggles a short popover
// explaining what's expected for a field, and what's not allowed.
function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full bg-[#17231D]/10 text-[#4B5D46] text-[10px] font-bold flex items-center justify-center shrink-0"
        aria-label="More info"
      >
        i
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[950]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 w-64 bg-[#17231D] text-white text-[11.5px] leading-relaxed rounded-lg px-3 py-2.5 shadow-lg z-[951]">
            {text}
          </div>
        </>
      )}
    </span>
  );
}


// ---- SECTION: MAIN component — the list-equipment flow (form -> publish, using the account's active subscription) ----
export default function ListEquipment({ goToLogin, goToLegal, goToHelp }) {
  const { listings, createListing } = useListings();
  const { account } = useAuth();
  const [price, setPrice] = useState(0);

  const [photos, setPhotos] = useState([]);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  // Country of the item (ISO code). Never assumed: it starts from the owner's
  // own country when known, is overwritten by whatever the pin / "Use my
  // current location" says, and the owner can always change it.
  const viewerCountry = useViewerCountry();
  const [countryCode, setCountryCode] = useState("");
  const [countryTouched, setCountryTouched] = useState(false);
  useEffect(() => {
    if (!countryTouched && !countryCode && viewerCountry) setCountryCode(viewerCountry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerCountry]);
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0].name);
  // Previously hardcoded to "Good" with no way to actually choose —
  // every new listing silently claimed to be in good condition
  // regardless of its real state. Same 5-option range Edit already had.
  const [condition, setCondition] = useState(CONDITIONS[0]);

  const [step, setStep] = useState("form"); // "form" | "publishing" | "done"
  const [submitError, setSubmitError] = useState(null);
  const [agreedToOwnerTerms, setAgreedToOwnerTerms] = useState(false);
  const [expirationDate, setExpirationDate] = useState(null);
  const [publishedPlanName, setPublishedPlanName] = useState("");

  // The account's CURRENTLY ACTIVE subscription plan (see
  // frontend/components/SubscriptionModal.jsx / backend/supabase/
  // subscription.js) — this used to be chosen and paid for right here,
  // per listing; now it's read from the account, since subscribing is a
  // separate, account-level action reachable from the top nav or Profile.
  const [currentPlanId, setCurrentPlanId] = useState("free");
  useEffect(() => {
    if (!account?.id || account.isAnonymous) return;
    let cancelled = false;
    getMySubscription(account.id)
      .then((s) => { if (!cancelled) setCurrentPlanId(s.plan); })
      .catch(() => {}); // non-critical — falls back to Free's limits
    return () => { cancelled = true; };
  }, [account?.id, account?.isAnonymous]);

  const selectedPlan = useMemo(() => getPlanById(currentPlanId), [currentPlanId]);

  // `photos` now holds { file, previewUrl } pairs, not just preview URL
  // strings. Previously the actual File object was thrown away right
  // after creating a preview URL — but a `blob:` preview URL can't be
  // uploaded anywhere later; only the original File can. Keeping both
  // means the thumbnail grid still shows instantly (previewUrl) while
  // the real bytes (file) are still available at publish time for
  // uploadListingPhotos() in handlePublish below.
  const handleUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const entries = files.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }));
    setPhotos((prev) => [...prev, ...entries].slice(0, MAX_UPLOAD_CAP));
    e.target.value = "";
  };

  const removePhoto = (idx) => {
    setPhotos((prev) => {
      const removed = prev[idx];
      // Free the browser-memory blob URL immediately rather than waiting
      // for garbage collection — these can add up if someone
      // adds/removes many photos while filling out the form.
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support location detection.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        const place = await reverseGeocodeFull(latitude, longitude);
        setLocation(place.text);
        if (place.countryCode) { setCountryCode(place.countryCode); setCountryTouched(true); }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. You can still type your location manually."
            : "Couldn't detect your location. You can still type it manually."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const resetForm = () => {
    // Release any still-live blob preview URLs before clearing the array,
    // same reasoning as removePhoto() above.
    photos.forEach((p) => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    setPhotos([]);
    setName("");
    setBrand("");
    setModel("");
    setDescription("");
    setLocation("");
    setCountryCode(viewerCountry || "");
    setCountryTouched(false);
    setCoords(null);
    setLocationError(null);
    setShowMapPicker(false);
    setCategory(CATEGORIES[0].name);
    setCondition(CONDITIONS[0]);
    setPrice(0);
    setStep("form");
    setExpirationDate(null);
    setPublishedPlanName("");
  };

  // Validates the form, checks the account's CURRENT subscription's
  // active-listing limit, uploads photos, and publishes — no payment
  // step happens here anymore (that already happened, if at all, when
  // the account subscribed via SubscriptionModal).
  const handlePublish = async () => {
    if (!account) {
      goToLogin?.();
      return;
    }
    // Anonymous browsing is fine, but publishing a listing needs a real,
    // recoverable identity — see state/listings/listingsStore.jsx's
    // createListing() for why. Send them to Profile, where both the
    // Google and email sign-in options are shown, rather than forcing
    // one specific method.
    if (account.isAnonymous) {
      setSubmitError("Please sign in (Google or email) to publish a listing you can manage later.");
      goToLogin?.();
      return;
    }

    const errors = [];
    // Matches database/schema/stricter_listing_rules.sql's
    // listings_name_length constraint (3–120 characters after
    // trimming) — previously only checked for empty, so a too-short
    // name (e.g. "TV") hit a raw, confusing Postgres constraint error
    // instead of a clear message here.
    if (!name.trim()) errors.push("product name");
    else if (name.trim().length < 3) errors.push("a product name of at least 3 characters");
    else if (name.trim().length > 120) errors.push("a product name of 120 characters or fewer");
    if (!brand.trim()) errors.push("brand");
    if (!model.trim()) errors.push("model / code");
    if (!location.trim()) errors.push("location");
    if (!countryCode) errors.push("the country the item is in");
    // Coordinates used to be optional (only the free-text location was
    // required) — but that meant most listings never got a real pinned
    // location, which is exactly why the Map page appeared empty and
    // per-item distance couldn't be shown to anyone. A typed address
    // alone isn't enough for either of those, so a real pin is now
    // required too, not just offered as an "(optional)" extra.
    if (!coords) errors.push("a pinned location on the map (use \"Use my location\" or \"Pick on a map\")");
    if (!description.trim() || description.trim().length < 20) {
      errors.push("a description of at least 20 characters");
    }
    if (photos.length < 1) {
      errors.push("at least 1 real photo of the item");
    }
    // Price is now allowed to be 0 (free listings) — was previously
    // rejected outright, and rejected by the database too (see
    // database/schema/allow_free_listings.sql, which relaxed the old
    // `price_per_day > 0` constraint to `>= 0`). Still capped at a
    // realistic ceiling matching the database's own limit
    // (stricter_listing_rules.sql's listings_price_ceiling), so nobody
    // can list something for an absurd, obviously-fake price.
    if (price === "" || Number(price) < 0 || Number.isNaN(Number(price))) {
      errors.push("a valid rental price (0 or higher)");
    } else if (Number(price) > MAX_REALISTIC_PRICE) {
      errors.push(`a realistic rental price (up to ₱${MAX_REALISTIC_PRICE.toLocaleString()}/day)`);
    }
    if (!agreedToOwnerTerms) {
      errors.push("confirmation that you have the right to rent this item and that your listing is accurate");
    }

    if (errors.length > 0) {
      setSubmitError(
        `To help keep listings trustworthy and prevent scams, please provide: ${errors.join(", ")}.`
      );
      return;
    }

    // Real ownership check (was comparing against a fake "You" string
    // when listings were mocked) — now compares against the actual
    // authenticated user id set as owner_id in backend/supabase/listings.js.
    const myActiveListings = listings.filter((l) => l.ownerId === account?.id).length;
    if (myActiveListings >= selectedPlan.maxActiveListings) {
      setSubmitError(
        `Your ${selectedPlan.name} plan allows up to ${selectedPlan.maxActiveListings} active listings. ` +
          `Remove an existing listing, or upgrade your plan from the top nav / Profile, to continue.`
      );
      return;
    }

    setStep("publishing");
    setSubmitError(null);
    try {
      const startDate = new Date();
      const expiry = new Date(startDate);
      expiry.setDate(expiry.getDate() + selectedPlan.days);

      const finalPhotoEntries = photos.slice(0, selectedPlan.maxPhotos);

      // Actually upload the real files to Supabase Storage now, and use
      // the permanent public URLs it returns — NOT the local `blob:`
      // preview URLs, which only exist in this browser tab and would be
      // broken for everyone else (and after a refresh) if stored as-is.
      // See backend/supabase/storage.js for the upload itself and
      // database/schema/listing_photos_storage.sql for the bucket/RLS
      // that makes it work.
      const uploadedPhotoUrls = await uploadListingPhotos(
        finalPhotoEntries.map((p) => p.file),
        account.id
      );

      await createListing({
        name,
        brand,
        model,
        desc: description,
        img: uploadedPhotoUrls[0] ?? "",
        photos: uploadedPhotoUrls,
        price: Number(price),
        category,
        location,
        countryCode,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        condition,
        // Snapshots the account's CURRENT plan onto this listing row —
        // see database/schema/account_subscription.sql for why this
        // snapshot still exists even though the plan itself now lives on
        // the account, not chosen per listing.
        plan: selectedPlan.id,
        planName: selectedPlan.name,
        featured: !!selectedPlan.featured,
        startDate: startDate.toISOString(),
        expirationDate: expiry.toISOString(),
      });

      setExpirationDate(expiry);
      setPublishedPlanName(selectedPlan.name);
      setStep("done");
    } catch (err) {
      setSubmitError(err.message || "Publishing failed. Please try again.");
      setStep("form");
    }
  };

  const UploadSlot = ({ className = "" }) => (
    <label
      className={`aspect-square rounded-xl border-2 border-dashed border-[#17231D]/20 flex flex-col items-center justify-center gap-1 text-[#8A9089] cursor-pointer hover:border-[#E2932E] hover:text-[#E2932E] transition-colors ${className}`}
    >
      <Camera size={20} />
      <span className="text-[11.5px]">Upload</span>
      <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
    </label>
  );

  const PhotoThumb = ({ src, idx }) => (
    <div key={src + idx} className="relative aspect-square rounded-xl overflow-hidden group">
      <img src={src} className="w-full h-full object-cover" alt="" />
      <button
        type="button"
        onClick={() => removePhoto(idx)}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#17231D]/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={13} />
      </button>
    </div>
  );

  if (step === "done") {
    return (
      <div className="px-6 md:px-12 py-16 max-w-md mx-auto text-center">
        <div className="w-14 h-14 rounded-full bg-[#4B5D46]/10 flex items-center justify-center mx-auto">
          <Check size={26} className="text-[#4B5D46]" />
        </div>
        <h1 className="font-serif text-[22px] text-[#17231D] mt-4">Listing published</h1>
        <p className="text-[13px] text-[#8A9089] mt-1">{publishedPlanName} plan</p>
        <p className="text-[14.5px] text-[#6b6f66] mt-3">
          Your listing is now active until{" "}
          <span className="font-medium text-[#17231D]">
            {expirationDate?.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </span>
          .
        </p>
        <p className="text-[13px] text-[#8A9089] mt-1">You can view and manage it anytime from your Dashboard.</p>
        <Button variant="accent" className="mt-6" onClick={resetForm}>
          List another item
        </Button>
      </div>
    );
  }

  return (
    <div className="px-6 md:px-12 py-8 pb-24 max-w-2xl mx-auto">
      <h1 className="font-serif text-[26px] md:text-[30px] text-[#17231D]">List your equipment</h1>
      <div className="h-1 rounded-full bg-[#E2932E] mt-4" />

      {/* Limits only, no plan name/branding shown — subscriptions are
          hidden across the app for now (SUBSCRIPTIONS_ENABLED in
          PlanCard.jsx), but the actual numeric limits still apply and
          are still worth telling someone before they start uploading
          photos, regardless of whether the concept of "plans" is
          currently visible anywhere else. */}
      <div className="mt-4 flex items-center justify-between p-3.5 rounded-xl bg-[#EFEBDD] text-[13px]">
        <span className="text-[#17231D]">
          You can add up to <span className="font-medium">{selectedPlan.maxPhotos} photos</span> and have up to{" "}
          <span className="font-medium">{selectedPlan.maxActiveListings} active listings</span>.
        </span>
      </div>

      <div className="mt-8 space-y-5">
        <h2 className="font-medium text-[16px] text-[#17231D]">What equipment is this?</h2>

        <div className="space-y-3">
          <input
            placeholder="Enter your product name * (min. 3 characters)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-white outline-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11.5px] text-[#6b6f66]">Brand</span>
                <InfoTip text="The actual manufacturer of the item, e.g. 'DeWalt', 'Canon', 'Honda'. Not allowed: made-up brands, generic terms like 'good brand', or leaving it blank." />
              </div>
              <input placeholder="Enter your item's brand *" value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-white outline-none" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11.5px] text-[#6b6f66]">Model</span>
                <InfoTip text="The specific model name or code, e.g. 'DCD771C2', 'EOS R50'. Helps renters know exactly what they're getting. Not allowed: vague labels like 'standard' or 'basic'." />
              </div>
              <input placeholder="Enter your item's model *" value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-white outline-none" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[13px] text-[#6b6f66]">Photos <span className="text-[#a15c1f]">* at least 1 required</span></label>
              <span className="text-[12px] text-[#8A9089]">{photos.length}/{MAX_UPLOAD_CAP}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-1.5">
              {photos.map((p, idx) => (
                <PhotoThumb key={p.previewUrl + idx} src={p.previewUrl} idx={idx} />
              ))}
              {photos.length < MAX_UPLOAD_CAP && <UploadSlot />}
            </div>
            <p className="text-[11.5px] text-[#8A9089] mt-1.5">
              Upload a real, current photo of the actual item — stock photos or images pulled from the
              internet aren't allowed. This protects renters from scams and keeps listings trustworthy.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[11.5px] text-[#6b6f66]">Description</span>
              <InfoTip text="Describe the item's real, current condition and what's included. Not allowed: misleading descriptions, fake or exaggerated claims, or copying another listing's text." />
            </div>
            <textarea placeholder="Describe the item's condition, what's included, and any details a renter should know (min. 20 characters) *" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-white outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-white outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-white outline-none"
            >
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <label className="text-[13px] text-[#6b6f66]">Rental price per day *</label>
              <InfoTip text={`Set a fair, realistic daily rate for this exact item — ₱0 is allowed for a free rental, up to ₱${MAX_REALISTIC_PRICE.toLocaleString()}/day. Not allowed: prices way above what similar items actually rent for, used to game search or scam renters.`} />
            </div>
            <div className={`flex items-center gap-2 mt-1.5 rounded-xl border px-4 py-3 bg-white ${price !== "" && Number(price) > MAX_REALISTIC_PRICE ? "border-red-300" : "border-[#17231D]/12"}`}>
              <span className="text-[14px] text-[#6b6f66]">₱</span>
              <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="outline-none text-[14px] w-full bg-transparent" />
              <span className="text-[13px] text-[#6b6f66]">/day</span>
            </div>
            {price !== "" && Number(price) > MAX_REALISTIC_PRICE && (
              <p className="text-[11.5px] text-red-600 mt-1">
                ⚠️ That's above the realistic limit of ₱{MAX_REALISTIC_PRICE.toLocaleString()}/day — please
                enter a fair price for this item.
              </p>
            )}
          </div>
          <div>
            <input
              placeholder="City / area, e.g. Lahug, Cebu City *"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-white outline-none"
            />
            <div className="mt-2">
              <CountrySelect
                value={countryCode}
                onChange={(c) => { setCountryCode(c); setCountryTouched(true); }}
                placeholder="Country the item is in *"
                className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-white outline-none"
              />
            </div>
            {location.trim() && countryCode && (
              <p className="text-[12.5px] text-[#17231D] mt-2 flex items-center gap-1.5">
                <MapPin size={13} className="text-[#E2932E] shrink-0" />
                Renters will see: <span className="font-medium">{formatLocation(location, countryCode)}</span>
              </p>
            )}
            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={locating}
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#4B5D46] disabled:opacity-60"
              >
                <MapPin size={13} />
                {locating ? "Locating…" : "Use my current location"}
              </button>
              <button
                type="button"
                onClick={() => setShowMapPicker((v) => !v)}
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#4B5D46]"
              >
                <MapIcon size={13} />
                {showMapPicker ? "Hide map" : coords ? "Adjust pin on map" : "Pin your location on a map *"}
              </button>
              {coords && (
                <span className="text-[11.5px] text-[#8A9089]">
                  📍 Pinned at {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                </span>
              )}
            </div>
            {locationError && <p className="text-[12px] text-red-600 mt-1">{locationError}</p>}

            {showMapPicker && (
              <div className="mt-3">
                <LocationPicker
                  initialCoords={coords}
                  onPick={setCoords}
                  onLocationText={(text, place) => {
                    setLocation(text);
                    // The pin decides the country (a pin in Japan means Japan).
                    if (place?.countryCode) { setCountryCode(place.countryCode); setCountryTouched(true); }
                  }}
                />
              </div>
            )}

            {!coords && !showMapPicker && (
              <p className="text-[11.5px] text-[#a15c1f] bg-[#E2932E]/10 rounded-lg px-3 py-2 mt-1.5">
                A pinned location is required — it's what lets renters find your item on the Map
                tab and see how far away it is. A typed address alone isn't enough.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#EFEBDD] text-[12.5px] text-[#3c3f38] leading-relaxed">
          <ShieldCheck size={16} className="text-[#4B5D46] shrink-0 mt-0.5" />
          <span>
            To help keep Lendeia safe from fraudulent or misleading listings, all fields marked * are required,
            including a real photo of the item you own.{" "}
            {goToHelp && (
              <button type="button" onClick={() => goToHelp("listing")} className="underline text-[#4B5D46] font-medium">
                Learn more
              </button>
            )}
          </span>
        </div>

        {/* Real agreement checkbox — required to publish, matches the
            Owner Agreement in frontend/pages/Legal/Legal.jsx. */}
        <label className="flex items-start gap-2.5 text-[12.5px] text-[#3c3f38] cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToOwnerTerms}
            onChange={(e) => setAgreedToOwnerTerms(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            I confirm that I have the right to rent this item, and that my listing information and
            photos are accurate, in accordance with the{" "}
            <button type="button" onClick={() => goToLegal?.("owner-agreement")} className="underline text-[#4B5D46] font-medium">
              Owner Agreement
            </button>
            .
          </span>
        </label>

        {submitError && <p className="text-[13px] text-red-600">{submitError}</p>}

        <Button className="w-full" variant="accent" disabled={step === "publishing"} onClick={handlePublish}>
          {step === "publishing" ? "Publishing…" : "Publish listing"}
        </Button>
      </div>
    </div>
  );
}