// ==================================================================
// FILE TYPE : SUPABASE BACKEND — NOTIFICATIONS (real, new)
// PURPOSE   :
//   Real CRUD against the `notifications` table (see
//   database/schema/limits_delisting_notifications.sql). Most
//   notification types are created by database triggers (rental
//   request/accept/decline, new message, new review) — this file's
//   insertPaymentSuccessful() is the one exception, since a successful
//   mock payment isn't a database row changing, just an app-code event.
//   "Listing expiring" is NOT a notification type here — see the SQL
//   file's header for why (needs a scheduled job Supabase isn't
//   configured for in this project); Dashboard.jsx computes that live
//   instead.
// CONNECTS TO :
//   Uses backend/supabase/client.js. Read from a new bell icon in
//   frontend/components/Navbar.jsx. insertPaymentSuccessful() is called
//   from backend/supabase/subscription.js.
// ==================================================================
import { getSupabaseClient } from "./client";

/**
 * @param {string} userId
 * @returns {Promise<Array<{ id, type, title, body, relatedId, read, createdAt }>>}
 */
export async function getMyNotifications(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, related_id, read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body || "",
    relatedId: n.related_id,
    read: n.read,
    createdAt: n.created_at,
  }));
}

/**
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getUnreadNotificationCount(userId) {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
  return count || 0;
}

/**
 * @param {string} notificationId
 */
export async function markNotificationRead(notificationId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", notificationId);
  if (error) throw error;
}

/**
 * @param {string} userId
 */
export async function markAllNotificationsRead(userId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}

/**
 * Dismisses a single notification permanently — previously there was no
 * way to remove one at all, only mark it read (which just changes its
 * style, doesn't remove it from the list). Requires
 * database/schema/allow_clear_notifications.sql's DELETE policy, which
 * didn't exist before this.
 * @param {string} notificationId
 */
export async function clearNotification(notificationId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("notifications").delete().eq("id", notificationId);
  if (error) throw error;
}

/**
 * Clears every one of the current user's notifications at once — the
 * "Clear all" action in the bell dropdown.
 * @param {string} userId
 */
export async function clearAllNotifications(userId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("notifications").delete().eq("user_id", userId);
  if (error) throw error;
}

/**
 * Called directly from backend/supabase/subscription.js right after a
 * successful (mock) paid subscription — there is no database row change
 * to hang a trigger off for this one, so it's inserted explicitly. RLS
 * (`notifications_insert_own`) only allows inserting a notification for
 * yourself, which is exactly what this needs.
 * @param {string} userId
 * @param {string} planName
 */
export async function insertPaymentSuccessful(userId, planName) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: "payment_successful",
    title: "Payment successful",
    body: `You're now subscribed to the ${planName} plan.`,
  });
  if (error) throw error;
}
