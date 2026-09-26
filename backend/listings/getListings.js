// ==================================================================
// FILE TYPE : MOCK BACKEND — LISTINGS
// PURPOSE   :
//   Fake 'fetch my listings' endpoint. Always starts empty — listings only
//   populate in-memory once createListing() is called this session.
// CONNECTS TO :
//   Called on mount by state/listings/listingsStore.jsx (ListingsProvider), whose
//   `listings` array feeds Home, Browse, Map, Dashboard and Details pages.
// ==================================================================
/**
 * MOCK backend function — fetches equipment listings for the current user.
 * Starts empty; listings only appear once created via createListing (the
 * "List your equipment" form), or seeded by a real backend.
 * @returns {Promise<import('../../shared/types').Listing[]>}
 */
export async function getListings() {
  await new Promise((r) => setTimeout(r, 150));
  return [];
}