// ==================================================================
// FILE TYPE : COMPONENT
// PURPOSE   :
//   Equipment card used in every grid of listings (image, name, price, rating).
//   Restyled to match the modern design system (see
//   frontend/layouts/MainLayout.jsx's .card/.card-hover) — a real
//   elevated card with a soft shadow and confident lift on hover,
//   replacing the previous borderless "editorial" layout (image + text
//   below a thin divider, no card container at all).
//   Rating display uses REAL per-listing rating data (`item.realRating`/
//   `item.realReviewCount`, attached by whichever page fetched it via
//   backend/supabase/reviews.js's getRatingsForListings) instead of the
//   old `item.rating` field, which was always a hardcoded 0. Shows both
//   the average AND the review count (e.g. "4.5 (12)"), falling back to
//   "New" (not a fabricated 0) when no rating data was supplied.
//   Distance display uses the real computed `item.distanceFromMe` (see
//   shared/geo.js + state/location/locationStore.jsx) when available,
//   falling back to the listing's location text otherwise.
//   Save/favorite (♡/♥) button — real, backed by backend/supabase/
//   savedListings.js. `isSaved`/`onToggleSave` are optional so any
//   existing usage that doesn't pass them just doesn't show the button,
//   rather than breaking.
// CONNECTS TO :
//   Used by Home.jsx, Browse.jsx, and the new Saved page. Clicking it
//   calls the `onOpen` prop, which App.jsx wires to openItem() to
//   navigate to Details.jsx.
// ==================================================================
import React from "react";
import { MapPin, Star, Heart, Globe2 } from "lucide-react";
import { formatLocation, countryName } from "../../shared/countries";
import { useViewerCountry } from "../../state/location/locationStore";

// `tall` gives the card a taller photo and roomier text block (used by
// Home's "Items near you"). On a phone the photo is 3:4 portrait, since a
// 4:3 landscape tile in a 2-column grid is only ~100px high there; from
// md up it's square. Every other grid keeps the compact default.
export default function ListingCard({ item, onOpen, isSaved, onToggleSave, tall = false }) {
  const hasRealDistance = typeof item.distanceFromMe === "number";
  // The place is ALWAYS shown, with its country ("Los Angeles, California,
  // United States") — distance is extra detail, no longer a replacement for it.
  const placeText = item.locationFull || formatLocation(item.location || item.area, item.countryCode);
  const viewerCountry = useViewerCountry();
  const isAbroad = !!(item.countryCode && viewerCountry && item.countryCode !== viewerCountry);
  const hasRealRating = typeof item.realReviewCount === "number" && item.realReviewCount > 0;

  return (
    <button onClick={() => onOpen(item)} className="text-left group w-full">
      {/* Photo is its own fully-rounded tile now — previously only the
          top corners looked rounded, since the photo sat inside a
          card whose bottom half was a separate flat white content
          panel. That panel is gone; the text below just sits directly
          on the page, no boxed/bordered container around it. */}
      <div className={`relative ${tall ? "aspect-[3/4] md:aspect-square" : "aspect-[4/3]"} rounded-3xl overflow-hidden bg-[#F0EEE9]`}>
        <img src={item.img} alt={item.name} className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-500 ease-out" />
        <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {onToggleSave && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSave(item.id); }}
            className="absolute top-2.5 left-2.5 w-7 h-7 rounded-full bg-white/95 backdrop-blur-sm shadow-sm flex items-center justify-center"
            aria-label={isSaved ? "Remove from saved" : "Save this item"}
          >
            <Heart size={14} className={isSaved ? "fill-red-500 text-red-500" : "text-[#6b6f66]"} />
          </button>
        )}
        {hasRealRating && (
          <span className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-full px-2 py-1 text-[11.5px] font-medium text-[#17231D] shadow-sm">
            <Star size={11} className="fill-[#E2932E] text-[#E2932E]" />
            {item.realRating}
          </span>
        )}
      </div>
      <div className={tall ? "pt-5 pb-1" : "pt-4"}>
        <h3 className={`font-medium ${tall ? "text-[15px]" : "text-[13.5px]"} text-[#17231D] leading-snug truncate`}>{item.name}</h3>
        <p className={`${tall ? "text-[12.5px] mt-1.5" : "text-[11.5px] mt-1"} text-[#8A9089]`}>{item.brand} · {item.model}</p>

        <p className={`flex items-center gap-1 ${tall ? "text-[12.5px] mt-2.5" : "text-[11.5px] mt-2"} text-[#3c3f38] font-medium min-w-0`}>
          <MapPin size={12} className="shrink-0 text-[#E2932E]" />
          <span className="truncate">{placeText}</span>
        </p>

        <div className={`flex items-center justify-between ${tall ? "mt-2" : "mt-1.5"}`}>
          <span className="flex items-center gap-1.5 text-[11px] text-[#8A9089] truncate min-w-0">
            {isAbroad && (
              <span
                className="inline-flex items-center gap-1 shrink-0 rounded-full bg-[#E2932E]/12 text-[#9a5f12] px-2 py-0.5 text-[10.5px] font-medium"
                title={`This item is in ${countryName(item.countryCode)}, not in your country`}
              >
                <Globe2 size={10} /> Abroad
              </span>
            )}
            {hasRealDistance && <span className="truncate">{item.distanceFromMe.toFixed(1)} km away</span>}
          </span>
          <div className="text-right shrink-0 pl-2">
            <span className="font-serif text-[15px] text-[#17231D] leading-none">₱{item.price}</span>
            <span className="text-[10.5px] text-[#8A9089]"> /day</span>
          </div>
        </div>
      </div>
    </button>
  );
}
