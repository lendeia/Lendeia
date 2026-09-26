// ==================================================================
// FILE TYPE : MOCK BACKEND — RENTALS
// PURPOSE   :
//   Fake 'cancel a rental request' endpoint (usable by either renter or owner).
// CONNECTS TO :
//   Called by state/rentals/rentalsStore.jsx (RentalsProvider.cancelRental),
//   used from Details.jsx (renter cancelling) and Dashboard.jsx (either side).
// ==================================================================
/**
 * MOCK backend function — cancels a rental request (by either party).
 * @param {number} id
 * @returns {Promise<import('../../shared/types').RentalRequest>}
 */
export async function cancelRental(id) {
  await new Promise((r) => setTimeout(r, 120));
  return { id, status: "Cancelled" };
}
