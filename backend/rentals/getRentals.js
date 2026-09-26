// ==================================================================
// FILE TYPE : MOCK BACKEND — RENTALS
// PURPOSE   :
//   Fake 'fetch my rental requests' endpoint. Always starts empty in-memory.
// CONNECTS TO :
//   Called on mount by state/rentals/rentalsStore.jsx (RentalsProvider), whose
//   `requests` array feeds Details.jsx, Dashboard.jsx and Profile.jsx.
// ==================================================================
/**
 * MOCK backend function — fetches rental requests for the current owner/renter.
 * Starts empty; requests only appear once created via requestRental (renter)
 * or seeded by a real backend (owner-side incoming requests).
 * @returns {Promise<import('../../shared/types').RentalRequest[]>}
 */
export async function getRentals() {
  await new Promise((r) => setTimeout(r, 150));
  return [];
}