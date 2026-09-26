// ==================================================================
// FILE TYPE : MOCK BACKEND — LISTINGS
// PURPOSE   :
//   Fake 'delete listing' endpoint — just acknowledges the id, no persistence.
// CONNECTS TO :
//   Called by state/listings/listingsStore.jsx (ListingsProvider.deleteListing),
//   used from frontend/pages/Dashboard/Dashboard.jsx's 'Delete' button.
// ==================================================================
/**
 * MOCK backend function — deletes a listing.
 * @param {number} id
 * @returns {Promise<{ id: number, deleted: true }>}
 */
export async function deleteListing(id) {
  await new Promise((r) => setTimeout(r, 120));
  return { id, deleted: true };
}
