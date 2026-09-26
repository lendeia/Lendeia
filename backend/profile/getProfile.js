// ==================================================================
// FILE TYPE : MOCK BACKEND — PROFILE
// PURPOSE   :
//   Fake 'extended profile' endpoint (rating, review count, saved listings)
//   layered on top of the basic auth User record.
// CONNECTS TO :
//   Called by state/profile/profileStore.jsx (ProfileProvider) whenever
//   state/auth/authStore.jsx's `account` changes. profileStore's data isn't
//   currently read by any page yet (Profile.jsx computes its own stats from
//   listings/rentals state instead) — kept as a seam for future use.
// ==================================================================
/**
 * MOCK backend function — fetches the extended profile (rental history,
 * saved equipment, settings) for a user beyond the basic auth record.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getProfile(userId) {
  await new Promise((r) => setTimeout(r, 150));
  return {
    userId,
    rating: 4.9,
    reviewCount: 32,
    rentalHistoryCount: 18,
    savedListingIds: [5, 6],
  };
}
