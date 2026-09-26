// ==================================================================
// FILE TYPE : MOCK BACKEND — PROFILE
// PURPOSE   :
//   Fake 'update profile/settings' endpoint — merges patch and echoes back.
// CONNECTS TO :
//   Called by state/profile/profileStore.jsx (ProfileProvider.updateProfile).
//   Not currently wired to any button in the UI (see getProfile.js note).
// ==================================================================
/**
 * MOCK backend function — updates the current user's profile/settings.
 * @param {string} userId
 * @param {object} patch
 * @returns {Promise<object>}
 */
export async function updateProfile(userId, patch) {
  await new Promise((r) => setTimeout(r, 120));
  return { userId, ...patch };
}
