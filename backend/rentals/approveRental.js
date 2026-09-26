// ==================================================================
// FILE TYPE : MOCK BACKEND — RENTALS
// PURPOSE   :
//   Fake 'owner approves a pending request' endpoint.
// CONNECTS TO :
//   Called by state/rentals/rentalsStore.jsx (RentalsProvider.approveRental).
//   No page currently calls approveRental() from the UI yet — Dashboard.jsx
//   only wires up cancel, not accept/decline — kept as a seam for that feature.
// ==================================================================
/**
 * MOCK backend function — owner approves a pending rental request.
 * @param {number} id
 * @returns {Promise<import('../../shared/types').RentalRequest>}
 */
export async function approveRental(id) {
  await new Promise((r) => setTimeout(r, 120));
  return { id, status: "Accepted" };
}
