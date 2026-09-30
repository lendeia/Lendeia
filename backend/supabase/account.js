// ==================================================================
// FILE TYPE : SUPABASE BACKEND — ACCOUNT DELETION (real 30-day grace period)
// PURPOSE   :
//   Calls the delete-account edge function, which now only SCHEDULES
//   deletion 30 days out (account_status='pending_deletion') rather
//   than destroying everything immediately — see that function's file
//   header for the full explanation, and database/schema/
//   scheduled_account_deletion.sql for what actually happens once the
//   30 days pass. Since the account technically still exists during
//   that window, this signs the browser's own session out right after
//   scheduling succeeds — the edge function itself can't do that part,
//   since it can only act on the server side, not the calling
//   browser's own client-side session.
// CONNECTS TO :
//   Used by frontend/pages/Profile/Profile.jsx's "Delete Account" flow.
// ==================================================================
import { getSupabaseClient, EDGE_FUNCTION_NAMES } from "./client";

/**
 * @returns {Promise<{ scheduledDeletionAt: string }>}
 */
export async function deleteMyAccount() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAMES.deleteAccount);
  if (error) throw new Error(error.message || "Couldn't schedule your account for deletion. Please try again.");
  if (data?.error) throw new Error(data.error);
  await supabase.auth.signOut();
  return { scheduledDeletionAt: data?.scheduledDeletionAt };
}
