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
    .select(
      "id, user_id, category, message, listing_id, reported_user_id, status, created_at, " +
      "users:user_id(name, email), " +
      "reported_user:reported_user_id(name, email), " +
      "listings:listing_id(name, owner:owner_id(id, name, email))"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => {
    // Who was actually reported — either the person directly (a
    // report_user submission), or, for a report_listing submission
    // (which has no reported_user_id at all in the schema — only a
    // listing_id), the LISTING'S OWNER, since that's the real person
    // behind the reported product. Previously the admin queue only
    // ever showed the submitter's identity, never the reported
    // person's, making it impossible to know who was actually being
    // reported without a separate manual lookup.
    const reportedName = r.reported_user?.name || r.listings?.owner?.name || null;
    const reportedEmail = r.reported_user?.email || r.listings?.owner?.email || null;
    // One consistent id to actually take action against, regardless of
    // whether this was a direct "report a user" (reported_user_id) or
    // a "report a listing" (only listing_id, with the owner found via
    // the join above) — previously only the raw reported_user_id was
    // returned, which was null for every listing report, making it
    // impossible to act on the person actually being reported in that
    // case at all.
    const actionableUserId = r.reported_user_id || r.listings?.owner?.id || null;
    return {
      id: r.id,
      userId: r.user_id,
      userName: r.users?.name || "Unknown",
      userEmail: r.users?.email || "",
      category: r.category,
      message: r.message,
      listingId: r.listing_id,
      listingName: r.listings?.name || null,
      reportedUserId: r.reported_user_id,
      actionableUserId,
      reportedName,
      reportedEmail,
      status: r.status,
      createdAt: r.created_at,
    };
  });
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

const ACTION_NOTICE = {
  warn: (reason) => ({
    title: "Account warning",
    body: `Your account has received a warning: ${reason}. Please review Lendeia's Community Guidelines.`,
  }),
  restrict: (reason) => ({
    title: "Account restricted",
    body: `Some account actions have been temporarily limited: ${reason}. Contact support if you believe this is a mistake.`,
  }),
  unrestrict: () => ({
    title: "Restriction lifted",
    body: "The limits on your account have been removed. You have full access again.",
  }),
  suspend: (reason, until) => ({
    title: "Account suspended",
    body: `Your account has been suspended until ${new Date(until).toLocaleDateString()}: ${reason}.`,
  }),
  unsuspend: () => ({
    title: "Suspension lifted",
    body: "Your account is active again.",
  }),
  ban: (reason) => ({
    title: "Account banned",
    body: `Your account has been banned from Lendeia: ${reason}.`,
  }),
  unban: () => ({
    title: "Account reinstated",
    body: "Your account has been reinstated and is active again.",
  }),
};

/**
 * Applies a real moderation action to a user's account: updates their
 * status, writes an audit-log row (database/schema/
 * trust_safety_account_status.sql's admin_actions table), and sends
 * them a plain-language notification explaining what happened and why
 * — matching the Trust & Safety document's "don't silently punish
 * people" principle. Real access control is the is_admin_or_owner()
 * database check behind every write here, not this function itself.
 * @param {{
 *   targetUserId: string,
 *   action: 'warn'|'restrict'|'unrestrict'|'suspend'|'unsuspend'|'ban'|'unban',
 *   reason: string,
 *   suspendDays?: number,      // required for 'suspend'
 *   restrictedActions?: string[], // for 'restrict', defaults to ['create_listing']
 *   relatedReportId?: string,  // optional — links this action back to the report that prompted it
 * }} params
 */
export async function applyAccountAction({ targetUserId, action, reason, suspendDays, restrictedActions, relatedReportId }) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  if (!reason?.trim()) throw new Error("A reason is required for every account action.");

  let suspendedUntil = null;
  const patch = {};
  if (action === "warn") {
    // No status change — a warning is a notice on record, not a
    // restriction on the account itself.
  } else if (action === "restrict") {
    patch.account_status = "restricted";
    patch.status_reason = reason;
    patch.restricted_actions = restrictedActions?.length ? restrictedActions : ["create_listing"];
  } else if (action === "unrestrict") {
    patch.account_status = "active";
    patch.status_reason = null;
    patch.restricted_actions = [];
  } else if (action === "suspend") {
    if (!suspendDays || suspendDays <= 0) throw new Error("A suspension needs a duration.");
    suspendedUntil = new Date(Date.now() + suspendDays * 24 * 60 * 60 * 1000).toISOString();
    patch.account_status = "suspended";
    patch.status_reason = reason;
    patch.suspended_until = suspendedUntil;
  } else if (action === "unsuspend") {
    patch.account_status = "active";
    patch.status_reason = null;
    patch.suspended_until = null;
  } else if (action === "ban") {
    patch.account_status = "banned";
    patch.status_reason = reason;
    patch.suspended_until = null;
  } else if (action === "unban") {
    patch.account_status = "active";
    patch.status_reason = null;
  } else {
    throw new Error(`Unknown action: ${action}`);
  }

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await supabase.from("users").update(patch).eq("id", targetUserId);
    if (updateError) throw updateError;
  }

  const { error: logError } = await supabase.from("admin_actions").insert({
    admin_id: user.id,
    target_user_id: targetUserId,
    action,
    reason,
    suspended_until: suspendedUntil,
    related_report_id: relatedReportId || null,
  });
  if (logError) throw logError;

  const notice = ACTION_NOTICE[action]?.(reason, suspendedUntil);
  if (notice) {
    // Best-effort — a moderation action itself already succeeded above
    // (the important part), so a failure here shouldn't be treated as
    // the whole operation failing. It just means the person finds out
    // from their account status directly rather than a notification.
    await supabase.from("notifications").insert({
      user_id: targetUserId,
      type: "account_action",
      title: notice.title,
      body: notice.body,
    }).then(null, () => {});
  }
}

/**
 * A user's current status plus their full moderation history — for the
 * admin reviewing a report to see the real picture (previous warnings,
 * restrictions, etc.) before deciding on an action, matching the
 * document's "don't act on a single report in isolation" principle.
 * @param {string} userId
 */
export async function getUserModerationInfo(userId) {
  const supabase = getSupabaseClient();
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id, name, email, account_status, status_reason, suspended_until, restricted_actions")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw userError;

  const { data: actions, error: actionsError } = await supabase
    .from("admin_actions")
    .select("id, action, reason, suspended_until, created_at, admin:admin_id(name)")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false });
  if (actionsError) throw actionsError;

  return {
    user: userRow,
    actions: (actions || []).map((a) => ({
      id: a.id,
      action: a.action,
      reason: a.reason,
      suspendedUntil: a.suspended_until,
      createdAt: a.created_at,
      adminName: a.admin?.name || "Admin",
    })),
  };
}

/**
 * Search users by name OR username (case-insensitive, partial match on
 * either) — for the admin's "search all users" tool, extended to also
 * match a shop's actual handle, not just the display name shown on it
 * (there's no separate "shop name" field in this app — a shop is
 * always "{owner's name}'s Store" — so username, a real distinct
 * searchable field, is the closest genuine equivalent). Same-name
 * accounts are genuinely ambiguous by name alone, which is exactly why
 * each result also carries its real id — the UI shows it whenever more
 * than one result shares a name, so the admin can tell them apart with
 * certainty rather than guessing from name alone.
 * @param {string} query
 */
export async function searchUsers(query) {
  const supabase = getSupabaseClient();
  const trimmed = query?.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, username, account_status")
    .or(`name.ilike.%${trimmed}%,username.ilike.%${trimmed}%`)
    .order("name")
    .limit(30);
  if (error) throw error;
  return data || [];
}

/**
 * Removes a listing as a moderation action (not the owner deleting
 * their own) — relies on database/schema/admin_remove_listing.sql's
 * listings_admin_delete RLS policy for the actual permission; logs it
 * in the same admin_actions audit trail as every other action, with a
 * NAME SNAPSHOT since the listing row itself won't exist anymore once
 * this returns (a live foreign key would have nothing left to point
 * at). target_user_id is the listing's OWNER (who this action is
 * really "about"), not the admin doing the removing.
 * @param {{ listingId: string, listingName: string, ownerId: string, reason: string, relatedReportId?: string }} params
 */
export async function adminRemoveListing({ listingId, listingName, ownerId, reason, relatedReportId }) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  if (!reason?.trim()) throw new Error("A reason is required to remove a listing.");
  if (!ownerId) throw new Error("Missing the listing owner's id.");

  const { error: deleteError } = await supabase.from("listings").delete().eq("id", listingId);
  if (deleteError) throw deleteError;

  const { error: logError } = await supabase.from("admin_actions").insert({
    admin_id: user.id,
    target_user_id: ownerId,
    action: "remove_listing",
    reason,
    removed_listing_name: listingName || null,
    related_report_id: relatedReportId || null,
  });
  if (logError) throw logError;
}
