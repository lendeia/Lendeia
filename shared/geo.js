// ==================================================================
// FILE TYPE : SHARED UTILITY
// PURPOSE   :
//   Real straight-line distance (km) between two lat/lng points
//   (haversine formula). Replaces the previous hardcoded `distance: 0`
//   placeholder in backend/supabase/listings.js's mapListingRow, which
//   was honest-but-empty because computing a real distance needs the
//   VIEWER's own coordinates, not just the listing's — this function is
//   what state/location/locationStore.jsx's coordinates get combined
//   with, per-listing, in the pages that display distance.
// CONNECTS TO :
//   Used by frontend/pages/Browse/Browse.jsx, Home.jsx, Details.jsx.
// ==================================================================

/**
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number|null} distance in kilometers, or null if any input isn't a real number
 */
export function distanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== "number" || Number.isNaN(v))) {
    return null;
  }
  const R = 6371; // Earth's mean radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
