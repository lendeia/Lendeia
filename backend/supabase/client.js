// ==================================================================
// FILE TYPE : SUPABASE BACKEND — client setup
// PURPOSE   :
//   Creates (and memoizes) a single Supabase client for the whole app.
//   This is the ONLY file that should import '@supabase/supabase-js'.
//   Reads its URL/key from Vite env vars so no secret is hardcoded.
//
//   NOTE: this repo does not add '@supabase/supabase-js' to package.json
//   automatically — run `npm install @supabase/supabase-js` before using
//   this file. Until then, nothing in the mock backend/* or state/*
//   stores imports this module, so the app keeps working exactly as
//   before with zero behavior change.
// CONNECTS TO :
//   Used by backend/supabase/anonymousAuth.js (auth) and would be used by
//   a future real implementation of backend/listings/*.js /
//   backend/rentals/*.js once they're pointed at real tables instead of
//   in-memory mocks.
// ==================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;

let _client = null;

/**
 * Builds the real, working URL for a rich social share preview of a
 * specific item — a Supabase Edge Function (supabase/functions/
 * share-item) that returns server-rendered Open Graph tags (title,
 * description, photos), which the raw app URL alone can't provide
 * since this is a client-rendered SPA that link-preview crawlers can't
 * execute JavaScript in. See that function's own file header for the
 * full explanation.
 * @param {string} itemId
 * @returns {string}
 */
export function getItemSharePreviewUrl(itemId) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Deployed on Supabase under the name "dynamic-api" (not "share-item"
  // — a naming mismatch during deployment, same class of mix-up as
  // happened with an earlier function). Pointing at wherever it's
  // actually live rather than making the person redo the deploy.
  return `${SUPABASE_URL}/functions/v1/dynamic-api?id=${encodeURIComponent(itemId)}&origin=${encodeURIComponent(origin)}`;
}

/**
 * Same as getItemSharePreviewUrl, but for a STORE/owner profile — shows
 * that person's real profile photo and name as the share preview (the
 * "share the app" text Profile.jsx used to send instead didn't
 * reference the store at all), and takes whoever clicks it straight to
 * that owner's store page, not a generic app link.
 * @param {string} userId
 * @returns {string}
 */
export function getStoreSharePreviewUrl(userId) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${SUPABASE_URL}/functions/v1/dynamic-api?store=${encodeURIComponent(userId)}&origin=${encodeURIComponent(origin)}`;
}

/**
 * Lazily creates the Supabase client on first use so importing this file
 * doesn't throw in environments/tests where env vars aren't set.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient() {
  if (_client) return _client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
        "in your .env file before calling any backend/supabase/* function."
    );
  }

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Persists the session (including anonymous sessions) in localStorage
      // and auto-refreshes the token. This is what lets a returning visitor
      // keep the SAME anonymous user instead of minting a new one every
      // page load — see anonymousAuth.js for the dedup logic this enables.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return _client;
}
