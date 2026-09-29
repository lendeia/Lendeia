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

// The names of the Edge Functions as they are deployed in THIS
// Supabase project. Supabase gives functions random names when
// deployed through the dashboard editor (e.g. "quick-api"), and names
// can't be changed afterwards, so the app looks them up here instead
// of hardcoding them in several files. If a function is ever
// redeployed under a different name, this is the only place to edit.
export const EDGE_FUNCTION_NAMES = {
  // Share previews: the function that builds them is called by Vercel,
  // not by the browser - vercel.json hands link-preview crawlers that
  // ask for lendeia.com/?item=... to ".../functions/v1/quick-api".
  // If this function is ever redeployed under a different name, update
  // the name inside vercel.json too.
  share: "hyper-endpoint", // supabase/functions/share-item/index.ts
  checkout: "create-checkout", // supabase/functions/create-checkout/index.ts
  deleteAccount: "delete-account", // supabase/functions/delete-account/index.ts
};

let _client = null;

/**
 * The link to share for a specific item: just the plain app address
 * (lendeia.com/?item=...). The rich preview (name, square photo, site
 * name) is produced for link-preview crawlers only - vercel.json hands
 * their request to the share Edge Function (supabase/functions/
 * share-item), because this is a client-rendered SPA that crawlers
 * can't read tags out of. People clicking the link just get the app.
 * @param {string} itemId
 * @returns {string}
 */
export function getItemSharePreviewUrl(itemId) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // "/l" on purpose, NOT "/" - Vercel always serves the static
  // index.html directly for the exact root path and never even
  // consults vercel.json's rewrites for it, no matter what conditions
  // are on them (a documented Vercel limitation, confirmed by testing:
  // a rewrite targeting "/" silently never fired). "/l" has no matching
  // static file, so the crawler rewrite in vercel.json actually runs.
  // The app's own router reads ?item=/?store= from the query string
  // regardless of path, so real visitors land here exactly as before.
  return `${origin}/l?item=${encodeURIComponent(itemId)}`;
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
  return `${origin}/l?store=${encodeURIComponent(userId)}`;
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
