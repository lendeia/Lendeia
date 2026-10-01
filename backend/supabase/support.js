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
import { uploadReportPhotos } from "./storage";

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
 * Photos (optional, max 5) are uploaded first; if the request itself then
 * fails to save, the just-uploaded photos are deleted again.
 * @param {{ userId: string, category: string, message: string, listingId?: string, reportedUserId?: string, photos?: File[] }} params
 */
export async function submitSupportRequest({ userId, category, message, listingId, reportedUserId, photos = [] }) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Please describe what you need help with.");
  if (photos.length > 5) throw new Error("You can attach up to 5 photos.");
  const supabase = getSupabaseClient();
  const attachmentPaths = photos.length ? await uploadReportPhotos(photos, userId) : [];
  const { data, error } = await supabase
    .from("support_requests")
    .insert({
      user_id: userId,
      category,
      message: trimmed,
      listing_id: listingId || null,
      reported_user_id: reportedUserId || null,
      attachment_paths: attachmentPaths,
    })
    .select("id, category, message, status, created_at")
    .single();
  if (error) {
    if (attachmentPaths.length) await supabase.storage.from("report-attachments").remove(attachmentPaths).catch(() => {});
    throw error;
  }
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
    .select("id, category, message, status, created_at, attachment_paths")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
