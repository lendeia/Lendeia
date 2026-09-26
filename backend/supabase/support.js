// ==================================================================
// FILE TYPE : SUPABASE BACKEND — HELP & SUPPORT (real, new)
// PURPOSE   :
//   Real CRUD against `support_requests` — a signed-in user submits a
//   category + message, it's actually stored and tied to their
//   account. No admin queue exists yet to act on these (same known
//   limitation as backend/supabase/reviews.js's reportReview) — this is
//   the submission half, not a full ticketing system.
// CONNECTS TO :
//   Used by frontend/pages/Help/Help.jsx.
// ==================================================================
import { getSupabaseClient } from "./client";

export const SUPPORT_CATEGORIES = [
  ["rental_support", "🔧", "Rental Support"],
  ["payments_billing", "💳", "Payments & Billing"],
  ["trust_safety", "🛡️", "Trust & Safety"],
  ["report_listing", "🚩", "Report a Listing"],
  ["report_user", "👤", "Report a User"],
  ["account_security", "🔐", "Account & Security"],
  ["general_support", "💬", "General Support"],
  ["feedback", "💡", "Feedback & Suggestions"],
];

/**
 * @param {{ userId: string, category: string, message: string, listingId?: string, reportedUserId?: string }} params
 */
export async function submitSupportRequest({ userId, category, message, listingId, reportedUserId }) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Please describe what you need help with.");
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("support_requests")
    .insert({
      user_id: userId,
      category,
      message: trimmed,
      listing_id: listingId || null,
      reported_user_id: reportedUserId || null,
    })
    .select("id, category, message, status, created_at")
    .single();
  if (error) throw error;
  return data;
}

/**
 * The current user's own support request history.
 * @param {string} userId
 */
export async function getMySupportRequests(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("support_requests")
    .select("id, category, message, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
