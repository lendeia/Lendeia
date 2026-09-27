// ==================================================================
// FILE TYPE : SUPABASE BACKEND — ADMIN (new)
// PURPOSE   :
//   The owner/admin-only half of the support/report system —
//   submitting a request (backend/supabase/support.js) already
//   existed; this is the missing "someone actually reviews and works
//   these" side. Real access control lives in the database (see
//   database/schema/owner_role_and_admin_access.sql's RLS policies and
//   is_admin_or_owner()) — getMyRole() here is just for the frontend
//   to decide whether to SHOW the admin page/nav link at all; it is
//   not itself a security boundary. Someone without the admin/owner
//   role gets zero rows back from getAllSupportRequests() regardless
//   of whether they somehow reached the page.
// CONNECTS TO :
//   Used by frontend/pages/Admin/Admin.jsx, App.jsx (for the nav link
//   and route gate).
// ==================================================================
import { getSupabaseClient } from "./client";

/**
 * @param {string} userId
 * @returns {Promise<'user'|'admin'|'owner'>}
 */
export async function getMyRole(userId) {
  if (!userId) return "user";
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role || "user";
}

/**
 * Foundation for future staff accounts with limited access (support,
 * moderation, finance, etc.) — see database/schema/
 * admin_permissions_foundation.sql. Not used by any admin surface yet
 * (there's only the one reports queue today, gated on role alone), but
 * ready for when a more limited admin type is actually introduced.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function getMyPermissions(userId) {
  if (!userId) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("permissions")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.permissions || [];
}

/**
 * Every support/report submission, newest first — RLS only actually
 * returns rows here for an admin/owner account; anyone else gets back
 * just their own (same as getMySupportRequests), so this is safe to
 * call speculatively without checking role first, though the UI
 * should still gate whether to show the page at all.
 */
export async function getAllSupportRequests() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("support_requests")
    .select("id, user_id, category, message, listing_id, reported_user_id, status, created_at, users:user_id(name, email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.users?.name || "Unknown",
    userEmail: r.users?.email || "",
    category: r.category,
    message: r.message,
    listingId: r.listing_id,
    reportedUserId: r.reported_user_id,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/**
 * @param {string} requestId
 * @param {'open'|'in_progress'|'resolved'} status
 */
export async function updateSupportRequestStatus(requestId, status) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("support_requests")
    .update({ status })
    .eq("id", requestId);
  if (error) throw error;
}
