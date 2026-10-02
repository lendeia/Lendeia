// ==================================================================
// FILE TYPE : SUPABASE BACKEND — AUTH (anonymous browsing + required Google upgrade)
// PURPOSE   :
//   Anonymous auth gives every visitor a real auth.uid() immediately, so
//   browsing/RLS work with zero friction — but an anonymous identity
//   lives only in this one browser's local storage. If it's cleared, or
//   the person switches devices, that identity (and anything created
//   under it) becomes permanently unreachable — there is no password or
//   email to recover it with. That is unacceptable for anyone who
//   actually OWNS a listing or has a rental history, so:
//
//   linkGoogleAccount() below upgrades the CURRENT anonymous session in
//   place to a real Google identity — same auth.uid(), same listings,
//   same rentals, same reviews, nothing orphaned — it just stops being
//   anonymous and becomes permanently recoverable by signing in with
//   that Gmail account from any device from now on.
//
//   Callers (state/auth/authStore.jsx, and anywhere gating an action
//   that needs a permanent account — see listingsStore.jsx/rentalsStore.jsx)
//   are expected to require account.isAnonymous === false before letting
//   someone create a listing or request a rental. Pure browsing/viewing
//   stays open to anonymous sessions.
//
//   Duplicate-user prevention, two layers:
//     1. Supabase-side: because the client is created with
//        `persistSession: true` (see client.js), calling
//        supabase.auth.getSession() on a returning visitor returns the
//        SAME user that was created on their first visit. We only ever
//        call signInAnonymously() when there is truly no existing
//        session — never unconditionally on every load.
//     2. Table-side: ensureUserRow()/ensureProfileRow() upsert against
//        the `users`/`profiles` tables keyed by that same auth.uid() — the
//        primary key makes a duplicate row structurally impossible.
//        NOTE: this used to be a single upsert that unconditionally
//        overwrote name/email/avatar_url on every call — that was later
//        found to be a real bug: it silently wiped out any custom
//        photo/name a person set via Profile.jsx the next time their
//        session was merely re-checked (which happens constantly). It's
//        now select-then-update, and only pulls name/photo from the auth
//        provider on genuine first-creation or the anonymous->real
//        upgrade moment — see ensureUserRow's own comment for the full
//        reasoning. Duplicate prevention is unaffected either way: the
//        primary key on `id` is what actually prevents duplicates, not
//        which upsert/update strategy is used on top of it.
// CONNECTS TO :
//   Uses backend/supabase/client.js. Consumed by state/auth/authStore.jsx.
//   RLS policies live in database/policies/*.sql.
// ==================================================================
import { getSupabaseClient } from "./client";

/**
 * Ensures a `users` row exists for this auth user AND keeps it in sync
 * with the auth user's current real data (important after a Google
 * link — see file header). Safe to call on every session check.
 * @param {import('@supabase/supabase-js').User} authUser
 */
/**
 * Ensures a `users` row exists for this auth user, and keeps only the
 * fields that AREN'T the person's own choice in sync (email,
 * auth_provider). `name`/`avatar_url` are deliberately NOT re-synced
 * from the auth provider's metadata on every call — this function runs
 * constantly (every page load, every background token refresh, every
 * auth state change), and the previous version overwrote `avatar_url`
 * with the provider's metadata (Google's photo, or null for email
 * accounts) EVERY single time, which silently wiped out any custom
 * photo/name a person had set via Profile.jsx within moments of them
 * setting it. name/avatar_url are only ever pulled from provider
 * metadata in two cases: creating a brand-new row, or the exact moment
 * an anonymous session upgrades to a real one (their first real
 * name/photo has to come from somewhere) — never on an ordinary
 * already-real session simply being re-checked.
 * @param {import('@supabase/supabase-js').User} authUser
 */
async function ensureUserRow(authUser) {
  const supabase = getSupabaseClient();
  const provider = authUser.app_metadata?.provider || (authUser.is_anonymous ? "anonymous" : "email");

  const { data: existing, error: fetchError } = await supabase
    .from("users")
    .select("id, is_anonymous")
    .eq("id", authUser.id)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    const update = { email: authUser.email || null, auth_provider: provider };

    // The one legitimate moment to pull in a name/photo from the
    // provider: this row was anonymous a moment ago and just became
    // real (linking Google, or confirming an email/password upgrade).
    // Every other case — including this exact same real account being
    // checked again on the next page load — must leave name/avatar_url
    // exactly as the person set them.
    if (existing.is_anonymous && !authUser.is_anonymous) {
      const metaName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;
      const metaAvatar = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
      if (metaName) update.name = metaName;
      if (metaAvatar) update.avatar_url = metaAvatar;
    }

    const { error } = await supabase.from("users").update(update).eq("id", authUser.id);
    if (error) throw error;
    return;
  }

  // Brand-new row — seed sensible defaults from whatever the provider gave us.
  const metaName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;
  const avatarUrl = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
  const { error } = await supabase.from("users").insert({
    id: authUser.id,
    name: metaName || (authUser.email ? authUser.email.split("@")[0] : "Guest"),
    email: authUser.email || null,
    avatar_url: avatarUrl,
    auth_provider: provider,
  });
  if (error) throw error;
}

/**
 * Ensures a `profiles` row exists for this auth user (rating/review
 * counters etc). Left as ignoreDuplicates — profile stats are owned by
 * the app's own logic (reviews, etc.), not by auth data, so there's
 * nothing here that needs to be kept in sync from the auth user object.
 * @param {string} userId
 */
async function ensureProfileRow(userId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw error;
}

function toAppUser(authUser, userRow) {
  return {
    id: authUser.id,
    email: authUser.email || null,
    // Read name/avatarUrl from the `users` TABLE row, not from Supabase
    // auth's own metadata (authUser.user_metadata) — that was the real
    // bug behind "my photo doesn't save after reload/logout-login": the
    // database had the real uploaded avatar_url the whole time, but the
    // app was rebuilding `account` from auth metadata every time the
    // session got re-checked (which happens on every reload, every
    // background token refresh, every login), discarding the real value
    // from display even though it was never actually lost in the
    // database. Falls back to auth metadata only if the table row
    // somehow isn't available yet.
    name: userRow?.name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || (authUser.email ? authUser.email.split("@")[0] : "Guest"),
    avatarUrl: userRow?.avatar_url ?? authUser.user_metadata?.avatar_url ?? authUser.user_metadata?.picture ?? null,
    isAnonymous: !!authUser.is_anonymous,
    // The person's own country (ISO code) — lets every page tell whether a
    // listing is local to them (see shared/countries.js).
    countryCode: userRow?.country_code || null,
    // Used by Profile.jsx to only offer "Change password" for accounts
    // that actually have a password (an 'email' provider account) — a
    // Google account has nothing to change here.
    authProvider: userRow?.auth_provider || (authUser.is_anonymous ? "anonymous" : null),
    // Only ever "active" or "restricted" here — banned/suspended
    // accounts are signed back out and blocked before toAppUser() is
    // ever called (see ensureAnonymousSession above), so this never
    // needs to represent those states.
    accountStatus: userRow?.account_status || "active",
    statusReason: userRow?.status_reason || null,
    restrictedActions: userRow?.restricted_actions || [],
    // Real, not fabricated — Supabase's own auth session already tracks
    // whether the account's email was actually confirmed (via the
    // confirmation link for email/password signup, or always true for
    // Google since Google already verified it). No new DB column
    // needed; this is already on the client-side auth user object.
    emailVerified: !!authUser.email_confirmed_at,
  };
}

/**
 * Returns the current session's user if one already exists (returning
 * visitor), otherwise creates exactly one new anonymous Supabase user.
 * Always re-syncs the `users`/`profiles` rows, so a returning user whose
 * session was upgraded (e.g. linked to Google in a previous visit, or
 * completing an OAuth redirect) gets their real data written through.
 * @returns {Promise<{ id: string, email: string|null, name: string, avatarUrl: string|null, isAnonymous: boolean }>}
 */
export async function ensureAnonymousSession() {
  const supabase = getSupabaseClient();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  let authUser = sessionData?.session?.user ?? null;

  if (!authUser) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    authUser = data.user;
  }

  if (!authUser) {
    throw new Error("Supabase did not return a user.");
  }

  await ensureUserRow(authUser);
  await ensureProfileRow(authUser.id);

  // Auto-lifts an expired suspension before checking status, so nobody
  // stays locked out past when they were actually meant to be — see
  // database/schema/trust_safety_account_status.sql's
  // expire_suspension_if_due().
  await supabase.rpc("expire_suspension_if_due", { target: authUser.id });
  // Logging back in within the 30-day window IS the "cancel deletion"
  // action — no separate button to find. See database/schema/
  // scheduled_account_deletion.sql's reactivate_if_pending_deletion().
  await supabase.rpc("reactivate_if_pending_deletion", { target: authUser.id });

  // Fetch the authoritative row back out, right after ensuring it
  // exists/is synced — this is what toAppUser() above actually needs to
  // build a correct `account.avatarUrl`/`account.name` from, instead of
  // Supabase's own auth metadata.
  const { data: userRow, error: userRowError } = await supabase
    .from("users")
    .select("name, avatar_url, country_code, auth_provider, account_status, status_reason, suspended_until, restricted_actions")
    .eq("id", authUser.id)
    .maybeSingle();
  if (userRowError) throw userRowError;

  // Real enforcement — a ban/suspension actually blocks sign-in here,
  // not just something the UI chooses to respect. Signs the session
  // back out immediately so a banned/suspended person can't keep using
  // an already-open tab either.
  if (userRow?.account_status === "banned") {
    await supabase.auth.signOut();
    const err = new Error(
      userRow.status_reason
        ? `Your account has been banned from Lendeia: ${userRow.status_reason}.`
        : "Your account has been banned from Lendeia."
    );
    err.code = "ACCOUNT_BANNED";
    throw err;
  }
  if (userRow?.account_status === "suspended" && userRow.suspended_until && new Date(userRow.suspended_until) > new Date()) {
    await supabase.auth.signOut();
    const until = new Date(userRow.suspended_until).toLocaleDateString();
    const err = new Error(
      userRow.status_reason
        ? `Your account is suspended until ${until}: ${userRow.status_reason}.`
        : `Your account is suspended until ${until}.`
    );
    err.code = "ACCOUNT_SUSPENDED";
    throw err;
  }
  // Rare edge case: the 30-day window has genuinely passed but the
  // once-daily cleanup (database/schema/scheduled_account_deletion.sql's
  // pg_cron job) hasn't actually run yet. reactivate_if_pending_deletion()
  // above only reactivates while still inside the window, so this
  // account is still legitimately pending its real, permanent deletion
  // and shouldn't be let back in for however many hours remain.
  if (userRow?.account_status === "pending_deletion") {
    await supabase.auth.signOut();
    const err = new Error("This account is scheduled for deletion and can no longer be signed into.");
    err.code = "ACCOUNT_PENDING_DELETION";
    throw err;
  }

  return toAppUser(authUser, userRow);
}

/**
 * Upgrades the CURRENT session (anonymous or not) to also have a Google
 * identity attached — same auth.uid() throughout, so every listing,
 * rental, and review already created under this session remains exactly
 * as it was, just now permanently tied to a real, recoverable Gmail
 * account instead of only this one browser's local storage.
 *
 * This redirects the browser to Google's consent screen and back — it
 * does not resolve with the final user in this call. After the redirect
 * back, call ensureAnonymousSession() again (state/auth/authStore.jsx's
 * onAuthStateChange listener does this automatically) to pick up the
 * now-linked, now-permanent account.
 *
 * REQUIRES: Google enabled as a provider in the Supabase dashboard
 * (Authentication → Providers → Google) with a real Google Cloud OAuth
 * Client ID/Secret, and the correct Site URL / Redirect URLs configured
 * in Authentication → URL Configuration.
 */
export async function linkGoogleAccount() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

/**
 * Alternative upgrade path to linkGoogleAccount() — sets a real
 * email+password directly on the CURRENT session (same auth.uid(),
 * same reasoning as the Google link: nothing already created gets
 * orphaned). Unlike Google linking, this does NOT require Google Cloud
 * OAuth setup or the Supabase "Manual Linking" toggle — it's a plain
 * Supabase Auth feature (updateUser) that works out of the box as long
 * as email sign-in is enabled (on by default).
 *
 * Supabase sends a confirmation email; the account is not fully upgraded
 * (isAnonymous stays true) until that link is clicked — the
 * onAuthStateChange listener in state/auth/authStore.jsx picks up the
 * change automatically once it happens, no polling needed.
 * @param {string} email
 * @param {string} password
 */
export async function upgradeWithEmailPassword(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.updateUser({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Confirms the email a guest session just upgraded with, using the
 * 6-digit code from the "Confirm signup" email instead of making them
 * click a link — the actual code behind the code-not-link request.
 * type: 'email_change' matches the "Change email address" template that
 * Supabase sends when a guest session adds an email via updateUser (as
 * opposed to 'signup', which is for a brand-new, never-anonymous account).
 * That template — not "Confirm sign up" — must contain {{ .Token }}. Note: Supabase
 * has an open, documented bug (github.com/supabase/supabase#25787)
 * where OTP verification can behave unreliably specifically for an
 * ANONYMOUS session being upgraded (as opposed to a normal new
 * signup) — if codes seem to fail here even when correctly typed, that
 * upstream issue is the likely cause, not something wrong in this call
 * itself.
 * @param {string} email
 * @param {string} code
 */
export async function verifyEmailUpgradeCode(email, code) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email_change" });
  if (error) throw error;
  return data;
}

/**
 * For a RETURNING user who already upgraded to email+password on a
 * previous visit (possibly a different device/browser than the one
 * that's currently just anonymous) — signs into that existing permanent
 * account instead of continuing as the current anonymous session. This
 * replaces the current session entirely (different auth.uid()) rather
 * than upgrading it, which is correct here: they're switching TO an
 * account that already exists, not creating a new one.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('@supabase/supabase-js').User>}
 */
export async function signInWithEmailPassword(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/**
 * Signs out entirely. For an anonymous-only session, this DISCARDS that
 * identity for good (see file header) — the next ensureAnonymousSession()
 * call mints a brand-new one. For a session that has been linked to
 * Google, signing out is safe and recoverable: signing back in with that
 * same Google account (linkGoogleAccount / a future direct Google login)
 * returns to the same permanent identity.
 */
export async function endAnonymousSession() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Changes the CURRENT signed-in user's password — for a real
 * (non-anonymous) email/password account only. Uses the same
 * `supabase.auth.updateUser()` call as upgradeWithEmailPassword() above,
 * just without also changing the email. Requires the person to already
 * be authenticated (this is a "change my password" action from inside
 * Profile settings, not a "forgot password" email-reset flow — Supabase
 * has a separate resetPasswordForEmail() for that unauthenticated case,
 * not used here since this app has no email-sending configured for it).
 * @param {string} newPassword - must be at least 6 characters (Supabase's own minimum).
 */
export async function changePassword(newPassword) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * "Forgot password" for someone who is NOT currently signed in (unlike
 * changePassword() above, which requires an active session). Sends a
 * real reset-link email via Supabase, redirecting back to this app's
 * own origin — Supabase appends a recovery token to that URL, which
 * state/auth/authStore.jsx's onAuthStateChange listener picks up as a
 * "PASSWORD_RECOVERY" event and surfaces via useAuth()'s
 * `passwordRecovery` flag, prompting them to set a new password (see
 * Profile.jsx's ChangePasswordModal, reused for both flows).
 * @param {string} email
 */
export async function requestPasswordReset(email) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

/**
 * Confirms a password-reset request with the 6-digit code from the
 * "Reset Password" email, establishing the same temporary recovery
 * session a clicked link used to — type: 'recovery' is Supabase's
 * dedicated OTP type for this specific flow (distinct from 'email',
 * used for confirming a new/changed email address in
 * verifyEmailUpgradeCode above). Once this succeeds, the person is in
 * the same recovery session state as before; they still need to
 * actually call changePassword() with their new password next.
 * @param {string} email
 * @param {string} code
 */
export async function verifyPasswordResetCode(email, code) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error) throw error;
  return data;
}
