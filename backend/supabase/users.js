// ==================================================================
// FILE TYPE : SUPABASE BACKEND — USERS (public profile lookup + presence)
// PURPOSE   :
//   Fetches the PUBLIC fields of a user — name, avatar, the
//   public-facing trust-profile fields (username, bio, city), and a
//   real last_active_at timestamp for presence display ("Active now" /
//   "Active recently", computed client-side — see
//   frontend/components/PresenceBadge.jsx) — never email, age, gender,
//   phone, or anything else. Phone numbers are handled by a completely
//   separate, much more restrictive path (backend/supabase/rentals.js's
//   getSharedPhone) requiring mutual, rental-scoped consent — never
//   exposed here. Deliberately still narrow: this must never become
//   a place that leaks private account data (see database/policies —
//   `users` RLS allows public select today, but this file still only
//   selects the columns actually meant to be shown to strangers — age,
//   gender, and phone are self-reported trust-profile fields but are
//   kept private to the account owner's own view, not exposed here).
// CONNECTS TO :
//   Used by frontend/pages/Store/OwnerStore.jsx.
// ==================================================================
import { getSupabaseClient } from "./client";

/**
 * @param {string} userId
 * @returns {Promise<{ id: string, name: string, avatarUrl: string|null, username: string|null, shopName: string|null, bio: string|null, city: string|null } | null>}
 */
export async function getPublicProfile(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, avatar_url, username, shop_name, bio, city, last_active_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name || "Guest",
    avatarUrl: data.avatar_url || null,
    username: data.username || null,
    shopName: data.shop_name || null,
    bio: data.bio || null,
    city: data.city || null,
    lastActiveAt: data.last_active_at || null,
  };
}

/**
 * Heartbeat — updates the CURRENT user's own last_active_at to now().
 * Called periodically (see state/auth/authStore.jsx) while a real
 * (non-anonymous) account has the app open, so "Active now"/"Active
 * recently" (computed client-side from this real timestamp — see
 * frontend/components/PresenceBadge.jsx) reflects genuine activity, not
 * a fabricated status. Routed through the touch_my_presence() RPC
 * (database/schema/phone_sharing_and_presence.sql) rather than a plain
 * update, matching the "only the account owner can write their own
 * presence" guarantee that function enforces.
 */
export async function updateMyLastActive() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("touch_my_presence");
  if (error) throw error;
}
