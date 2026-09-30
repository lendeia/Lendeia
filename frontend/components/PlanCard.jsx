// ==================================================================
// FILE TYPE : SHARED COMPONENT + DATA
// PURPOSE   :
//   The subscription plan tiers (free/standard/featured) and the
//   selectable plan card UI. Originally lived only inside
//   frontend/pages/ListEquipment/ListEquipment.jsx as part of its
//   per-listing purchase step; extracted here so the same data/UI can
//   be reused now that subscribing is an account-level action (see
//   database/schema/account_subscription.sql) triggered from the top
//   nav / Profile page, not just from the listing flow.
// CONNECTS TO :
//   Used by frontend/components/SubscriptionModal.jsx (the new
//   account-level subscribe UI) and still by
//   ListEquipment.jsx (to know the CURRENT plan's photo/listing limits
//   while filling out the form — it no longer lets the user pick or pay
//   for a plan there).
// ==================================================================
import React from "react";
import { Check } from "lucide-react";

// Temporary master switch — turns every subscription button/badge/title
// off across the whole app at once, per explicit request ("I'll enable
// it later"). Nothing about the underlying subscription system itself
// is removed — plans, limits, and the checkout flow all still exist
// and still work exactly as before; this only controls whether the UI
// that LEADS to them is shown. Flip back to true to bring it all back,
// nothing else needs to change.
export const SUBSCRIPTIONS_ENABLED = false;

export const PLANS = [
  {
    id: "free",
    name: "Free",
    emoji: "🆓",
    price: 0,
    days: 7,
    maxPhotos: 5,
    maxActiveListings: 7,
    analytics: false,
    features: [
      "Up to 7 active listings",
      "Up to 5 photos per listing",
      "Published for 7 days",
      "Appears in search & browse",
      "Automatic expiration",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    emoji: "💰",
    price: 79,
    days: 14,
    maxPhotos: 10,
    maxActiveListings: 10,
    analytics: true,
    features: [
      "Up to 10 active listings",
      "Up to 10 photos per listing",
      "Published for 14 days",
      "Everything in Free",
      "📊 Seller analytics (views over time)",
    ],
  },
  {
    id: "featured",
    name: "Pro",
    emoji: "⭐",
    price: 149,
    days: 30,
    maxPhotos: 10,
    maxActiveListings: 30,
    analytics: true,
    featured: true,
    features: [
      "Up to 30 active listings",
      "Up to 10 photos per listing",
      "Published for 30 days",
      "Everything in Free",
      "⭐ Featured label",
      "📈 Increased visibility in relevant listings",
      "📌 Featured section exposure",
      "📊 Seller analytics (views over time)",
    ],
  },
];

export const MAX_UPLOAD_CAP = Math.max(...PLANS.map((p) => p.maxPhotos));

export function getPlanById(planId) {
  return PLANS.find((p) => p.id === planId) || PLANS[0];
}

// What's actually offered for purchase/upgrade — Standard removed by
// explicit request. PLANS itself still includes it (unchanged) purely
// so getPlanById() keeps resolving correctly for anyone who's already
// on it — their real limits and remaining paid time stay exactly as
// they were; they just can't be newly purchased anymore. When their
// plan naturally expires, the existing expiration logic (backend/
// supabase/subscription.js) already correctly falls them back to Free.
export const PURCHASABLE_PLANS = PLANS.filter((p) => p.id !== "standard");

export function PlanCard({ plan, selected, onSelect, photoCount }) {
  const exceedsPhotos = typeof photoCount === "number" && photoCount > plan.maxPhotos;

  return (
    <button
      onClick={() => onSelect(plan.id)}
      className={`text-left w-full rounded-2xl border-2 p-5 transition-all relative ${
        selected
          ? "border-[#E2932E] bg-white shadow-[0_8px_24px_rgba(226,147,46,0.14)]"
          : "border-[#17231D]/10 bg-white hover:border-[#17231D]/20"
      }`}
    >
      {plan.featured && (
        <span className="absolute -top-2.5 right-5 bg-[#E2932E] text-white text-[10.5px] font-semibold px-2.5 py-1 rounded-full tracking-wide">
          MOST VISIBILITY
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[22px] leading-none">{plan.emoji}</span>
          <div>
            <p className="font-serif text-[18px] text-[#17231D] leading-tight">{plan.name}</p>
            <p className="text-[12.5px] text-[#8A9089] mt-0.5">
              {plan.price === 0 ? "₱0" : `₱${plan.price}`} · {plan.days} Days
            </p>
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] text-[#3c3f38]">
            <Check size={14} className="text-[#4B5D46] mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {exceedsPhotos && (
        <p className="mt-3 text-[12px] text-[#a15c1f] bg-[#E2932E]/10 rounded-lg px-3 py-2">
          You've uploaded {photoCount} photos — only the first {plan.maxPhotos} will be published on this plan.
        </p>
      )}
    </button>
  );
}
