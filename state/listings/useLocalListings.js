// ==================================================================
// FILE TYPE : STATE — hook (new)
// PURPOSE   :
//   The item lists people browse (Browse, Home "near you", Map) should only
//   show items in the viewer's OWN country. The viewer's country is the one
//   they set in Profile; if they haven't set one, the country their location
//   was detected in; if neither is known, nothing is hidden.
//   So someone in (or set to) the Philippines sees Philippine items only,
//   and sees USA items only after changing their country to the USA.
//   Their own listings are never hidden from them. Listings whose country is
//   unknown are not hidden either (see isInViewerCountry).
//   `useListings()` itself is unchanged and still returns EVERYTHING — the
//   dashboard, saved items, store pages, and opening a listing from a link or
//   chat keep working for items in any country.
// RETURNS :
//   { listings,        // only what this viewer should browse
//     allListings,     // everything (same as useListings().listings)
//     viewerCountry,   // "PH" | null
//     hiddenCount,     // how many items are hidden because they're elsewhere
//     scoped }         // true when a country rule is in effect
// ==================================================================
import { useMemo } from "react";
import { useListings } from "./listingsStore";
import { useViewerCountry } from "../location/locationStore";
import { useAuth } from "../auth/authStore";
import { isInViewerCountry } from "../../shared/countries";

export function useLocalListings() {
  const { listings } = useListings();
  const viewerCountry = useViewerCountry();
  const { account } = useAuth();
  const myId = account?.id || null;

  return useMemo(() => {
    if (!viewerCountry) {
      return { listings, allListings: listings, viewerCountry: null, hiddenCount: 0, scoped: false };
    }
    const visible = listings.filter(
      (l) => (myId && l.ownerId === myId) || isInViewerCountry(l.countryCode, viewerCountry)
    );
    return {
      listings: visible,
      allListings: listings,
      viewerCountry,
      hiddenCount: listings.length - visible.length,
      scoped: true,
    };
  }, [listings, viewerCountry, myId]);
}
