// ==================================================================
// FILE TYPE : SUPABASE BACKEND — BLOCKING (real, new)
// PURPOSE   :
//   Real CRUD against `blocked_users` (see database/schema/
//   messaging_photos_block_report.sql). Blocking someone is enforced at
//   the database level for both starting new conversations
//   (get_or_create_conversation) and sending further messages in an
//   existing one (messages_insert_own RLS) — this file is just the
//   client-facing calls, not the actual enforcement.
// CONNECTS TO :
//   Used by frontend/pages/Messages/Messages.jsx (Block button) and
//   frontend/pages/Profile/Profile.jsx (Blocked users list).
// ==================================================================
import { getSupabaseClient } from "./client";

/**
 * @param {string} blockedUserId
 */
export async function blockUser(blockedUserId) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("blocked_users")
    .insert({ blocker_id: user.id, blocked_id: blockedUserId });
  if (error) {
    if (error.code === "23505") return; // already blocked — fine, not an error
    throw error;
  }
}

/**
 * @param {string} blockedUserId
 */
export async function unblockUser(blockedUserId) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedUserId);
  if (error) throw error;
}

/**
 * Everyone the CURRENT user has blocked, with basic public info for
 * display (name/avatar) — used by Profile.jsx's "Blocked users" list.
 * @param {string} userId
 */
export async function getMyBlockedUsers(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocked_id, created_at, users!blocked_users_blocked_id_fkey(name, avatar_url)")
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    userId: row.blocked_id,
    name: row.users?.name || "Guest",
    avatarUrl: row.users?.avatar_url || null,
    blockedAt: row.created_at,
  }));
}

/**
 * Whether the current user has blocked, or been blocked by, the given
 * user — used to hide the Message/Chat button rather than let someone
 * try and fail. Checks both directions in one query.
 * @param {string} otherUserId
 * @returns {Promise<boolean>}
 */
export async function isBlockedEitherWay(otherUserId) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocker_id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${user.id})`
    )
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}
