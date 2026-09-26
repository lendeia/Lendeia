// ==================================================================
// FILE TYPE : MOCK BACKEND — AUTH (RETIRED / DO NOT USE)
// PURPOSE   :
//   Fake logout endpoint — just waited, never actually called Supabase's
//   real sign-out at all. state/auth/authStore.jsx used to call this,
//   which meant clicking "Log out" cleared the local `account` state in
//   React but left the real session token still valid underneath. Now
//   replaced by backend/supabase/anonymousAuth.js's endAnonymousSession(),
//   which performs a real supabase.auth.signOut(). Left here only as a
//   reference for what NOT to reconnect — do not import this from
//   anywhere new.
// CONNECTS TO :
//   Nothing, deliberately.
// ==================================================================
/**
 * MOCK backend function — invalidates the current session.
 * @returns {Promise<void>}
 */
export async function logout() {
  await new Promise((r) => setTimeout(r, 80));
}
