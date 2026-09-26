// ==================================================================
// FILE TYPE : MOCK BACKEND — LISTINGS
// PURPOSE   :
//   Fake 'update listing' endpoint — merges patch fields and echoes them back.
// CONNECTS TO :
//   Called by state/listings/listingsStore.jsx (ListingsProvider.updateListing),
//   used from Dashboard.jsx's EditListingModal.
// ==================================================================
/**
 * MOCK backend function — updates fields on an existing listing.
 * @param {number} id
 * @param {object} patch
 * @returns {Promise<import('../../shared/types').Listing>}
 */
export async function updateListing(id, patch) {
  await new Promise((r) => setTimeout(r, 120));
  return { id, ...patch };
}
