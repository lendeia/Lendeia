// ==================================================================
// FILE TYPE : MOCK BACKEND — AUTH (RETIRED / DO NOT USE)
// PURPOSE   :
//   Fake login endpoint. Given a name/email, returns a fabricated User
//   object with `id` set to whatever the caller typed as "email" — a
//   plain string, not a real UUID.
//   THIS IS NO LONGER CALLED FROM ANYWHERE. state/auth/authStore.jsx used
//   to wire this in as a manual login fallback; that caused a real
//   production bug (`invalid input syntax for type uuid`) once listings
//   started writing to real Supabase tables, because this fake id got
//   used as owner_id/renter_id. It has been removed from authStore.jsx
//   on purpose. Left in the repo only as a reference for what NOT to
//   reconnect — do not import this from anywhere new.
// CONNECTS TO :
//   Nothing, deliberately. See backend/supabase/anonymousAuth.js for the
//   real auth path that replaced this.
// ==================================================================
/**
 * MOCK backend function — exchanges credentials (OAuth result, email link, etc.)
 * for a session/user record. Currently just echoes back what the Login screen
 * already resolved (see frontend/pages/Login/Login.jsx).
 * @param {{ name: string, email: string }} creds
 * @returns {Promise<import('../../shared/types').User>}
 */
export async function login(creds) {
  await new Promise((r) => setTimeout(r, 100));
  return { id: creds.email, name: creds.name, email: creds.email };
}
