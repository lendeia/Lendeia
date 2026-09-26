// ==================================================================
// FILE TYPE : MOCK BACKEND — AUTH (RETIRED / DO NOT USE)
// PURPOSE   :
//   Fake 'update my account' endpoint. Just echoed the patch back
//   without ever writing to Supabase — an edit made through this looked
//   successful but was silently lost the next time the session
//   refreshed and re-synced `account` from the real `users` row.
//   REPLACED by backend/supabase/profile.js's updateMyProfile(), which
//   actually persists. Left here only as a reference for what NOT to
//   reconnect — do not import this from anywhere new.
// CONNECTS TO :
//   Nothing, deliberately.
// ==================================================================
import { isNonEmptyString } from "../../shared/validation";

/**
 * MOCK backend function — updates fields on the current user's account
 * (name, profile photo, etc.).
 * @param {string} userId
 * @param {object} patch
 * @returns {Promise<import('../../shared/types').User>}
 */
export async function updateAccount(userId, patch) {
  if (patch.name !== undefined && !isNonEmptyString(patch.name)) {
    throw new Error("Name cannot be empty.");
  }
  await new Promise((r) => setTimeout(r, 120));
  return { id: userId, ...patch };
}