// ==================================================================
// FILE TYPE : SUPABASE BACKEND — ACCOUNT DELETION (real, new)
// PURPOSE   :
//   Calls the delete-account edge function — the only place a real
//   account can actually be deleted, since that requires the service
//   role key (never usable from the browser). See that function's file
//   header for the deletion order (public.users first, then the actual
//   auth account) and what's preserved (reviews the person left about
//   others).
// CONNECTS TO :
//   Used by frontend/pages/Profile/Profile.jsx's "Delete Account" flow.
// ==================================================================
import { getSupabaseClient } from "./client";

export async function deleteMyAccount() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("delete-account");
  if (error) throw new Error(error.message || "Couldn't delete your account. Please try again.");
  if (data?.error) throw new Error(data.error);
  return true;
}
