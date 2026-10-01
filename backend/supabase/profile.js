// ==================================================================
// FILE TYPE : SUPABASE BACKEND — ACCOUNT PROFILE (real, replaces mock)
// PURPOSE   :
//   Real update of the CURRENT user's own name/avatar/trust-profile
//   fields in the `users` table, replacing backend/auth/updateAccount.js's
//   mock (which just echoed the patch back without persisting it — an
//   edit made via Profile.jsx's "Personal information" would silently
//   be lost the next time the session refreshed and re-synced `account`
//   from the real database row). Extended to also cover username, bio,
//   city, age, gender, phone (see database/schema/profile_trust_fields.sql)
//   — all self-reported; phone is NOT a verified value (no SMS provider
//   wired into this project), which is why Profile.jsx's UI must never
//   show it with a "verified" checkmark.
// CONNECTS TO :
//   Used by state/auth/authStore.jsx's updateAccount() and directly by
//   Profile.jsx's trust-profile section for fields updateAccount()
//   doesn't already cover.
// ==================================================================
import { getSupabaseClient } from "./client";
import { cleanUsername } from "./people";

/**
 * @param {string} userId - must be the CURRENT authenticated user's id;
 *   RLS (`users` update policy) enforces this regardless.
 * @param {{ name?: string, avatarUrl?: string, username?: string, shopName?: string, bio?: string,
 *   city?: string, age?: number, gender?: string, phone?: string }} patch
 * @returns {Promise<object>}
 */
export async function updateMyProfile(userId, patch) {
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("Name cannot be empty.");
  }
  if (patch.age !== undefined && patch.age !== null && (patch.age < 18 || patch.age > 120)) {
    throw new Error("Age must be between 18 and 120.");
  }

  const supabase = getSupabaseClient();
  const update = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;
  if (patch.username !== undefined) update.username = cleanUsername(patch.username);
  if (patch.shopName !== undefined) {
    const shop = patch.shopName?.trim() || null;
    if (shop && (shop.length < 2 || shop.length > 50)) throw new Error("Shop name must be 2-50 characters.");
    update.shop_name = shop;
  }
  if (patch.bio !== undefined) update.bio = patch.bio?.trim() || null;
  if (patch.city !== undefined) update.city = patch.city?.trim() || null;
  if (patch.age !== undefined) update.age = patch.age;
  if (patch.gender !== undefined) update.gender = patch.gender || null;
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null;

  const { data, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", userId)
    .select("id, name, avatar_url, username, shop_name, bio, city, age, gender, phone")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That username is already taken. Usernames must be different from every other one, ignoring capital letters, \".\" and \"_\".");
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    avatarUrl: data.avatar_url || null,
    username: data.username || null,
    shopName: data.shop_name || null,
    bio: data.bio || null,
    city: data.city || null,
    age: data.age || null,
    gender: data.gender || null,
    phone: data.phone || null,
  };
}

/**
 * Fetches the current user's full trust-profile fields — separate from
 * the lighter `account` object (which only carries what's needed
 * app-wide) since this is only needed on the Profile page itself.
 * @param {string} userId
 */
export async function getMyProfileDetails(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("username, shop_name, bio, city, age, gender, phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    username: data?.username || null,
    shopName: data?.shop_name || null,
    bio: data?.bio || null,
    city: data?.city || null,
    age: data?.age || null,
    gender: data?.gender || null,
    phone: data?.phone || null,
  };
}
