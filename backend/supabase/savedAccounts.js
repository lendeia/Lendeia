// ==================================================================
// FILE TYPE : SUPABASE BACKEND — SAVED ACCOUNTS ("Switch account") (new)
// PURPOSE   :
//   Lets a person keep up to 2 signed-in accounts on THIS device and
//   switch between them without typing the password again, and shows
//   which accounts are saved. The limit of 2 matches the 2-accounts-per-
//   device rule in database/schema/device_account_binding.sql.
//
//   HOW IT WORKS: for each saved account we keep its Supabase session
//   tokens in this browser's localStorage (the same place Supabase
//   already keeps the current session). Switching hands those tokens to
//   supabase.auth.setSession(). Nothing is stored on any server.
//
//   THINGS THAT MATTER:
//   - Saving is opt-in: nothing is saved unless the person taps "Save
//     this account". Anyone who can open this browser can open a saved
//     account, so this is not for shared computers (the UI says so).
//   - Supabase rotates refresh tokens. If the copy we saved went stale
//     while the account was in use, reusing it makes Supabase revoke
//     that account's sessions. So syncSavedAccountSession() is called
//     on every auth event (see state/auth/authStore.jsx) to keep the
//     saved copy current, and before every switch.
//   - Switching does NOT sign the old account out (a sign-out would
//     revoke its tokens and it could no longer be switched back to).
//     An explicit "Log out" does sign out, and also removes that
//     account from this list.
// CONNECTS TO :
//   state/auth/authStore.jsx (exposes it through useAuth),
//   frontend/components/SwitchAccountCard.jsx (the UI).
// ==================================================================
import { getSupabaseClient } from "./client";

export const MAX_SAVED_ACCOUNTS = 2;
const STORAGE_KEY = "lendeia.savedAccounts.v1";
const CHANGE_EVENT = "lendeia-saved-accounts-changed";

function readAll() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a.userId === "string" && a.accessToken && a.refreshToken)
      .slice(0, MAX_SAVED_ACCOUNTS);
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SAVED_ACCOUNTS)));
  } catch {
    throw new Error("Couldn't save on this device. Your browser may be blocking storage (private mode?).");
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Saved accounts for display — never includes the session tokens. */
export function listSavedAccounts() {
  return readAll().map(({ userId, email, name, avatarUrl, savedAt }) => ({ userId, email, name, avatarUrl, savedAt }));
}

/** Calls `callback` whenever the saved list changes (this tab or another). Returns an unsubscribe function. */
export function subscribeSavedAccounts(callback) {
  const onStorage = (e) => { if (!e || e.key === STORAGE_KEY) callback(); };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Keeps a saved account's stored tokens current. Safe to call with any
 * session (or null); does nothing if that user isn't saved. Never
 * creates an entry.
 * @param {import('@supabase/supabase-js').Session|null} session
 */
export function syncSavedAccountSession(session) {
  if (!session?.user?.id || !session.access_token || !session.refresh_token) return;
  const list = readAll();
  const index = list.findIndex((a) => a.userId === session.user.id);
  if (index === -1) return;
  const current = list[index];
  if (current.accessToken === session.access_token && current.refreshToken === session.refresh_token) return;
  list[index] = {
    ...current,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    email: session.user.email || current.email,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* a failed background sync must never break sign-in */
  }
}

/**
 * Saves the account that is signed in right now (a real account, not a
 * guest). Updates its entry if already saved; otherwise needs a free slot.
 * @param {{ id: string, email: string|null, name: string, avatarUrl: string|null, isAnonymous: boolean }} account
 */
export async function saveCurrentAccount(account) {
  if (!account?.id || account.isAnonymous) {
    throw new Error("Sign in with an email account first. Guest sessions can't be saved.");
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  const session = data?.session;
  if (error || !session || session.user.id !== account.id) {
    throw new Error("Couldn't read your current sign-in. Please try again.");
  }
  const list = readAll();
  const entry = {
    userId: account.id,
    email: account.email || session.user.email || null,
    name: account.name || "Account",
    avatarUrl: account.avatarUrl || null,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    savedAt: new Date().toISOString(),
  };
  const index = list.findIndex((a) => a.userId === account.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...entry, savedAt: list[index].savedAt };
  } else {
    if (list.length >= MAX_SAVED_ACCOUNTS) {
      throw new Error(`You can save up to ${MAX_SAVED_ACCOUNTS} accounts on this device. Remove one first.`);
    }
    list.push(entry);
  }
  writeAll(list);
}

/** Forgets a saved account on this device (does not delete or sign out the account itself). */
export function removeSavedAccount(userId) {
  const list = readAll();
  if (!list.some((a) => a.userId === userId)) return;
  writeAll(list.filter((a) => a.userId !== userId));
}

/** Refreshes name/photo shown in the list for the signed-in saved account. */
export function updateSavedAccountProfile(account) {
  if (!account?.id) return;
  const list = readAll();
  const index = list.findIndex((a) => a.userId === account.id);
  if (index === -1) return;
  const next = { ...list[index], name: account.name || list[index].name, avatarUrl: account.avatarUrl ?? null, email: account.email || list[index].email };
  if (next.name === list[index].name && next.avatarUrl === list[index].avatarUrl && next.email === list[index].email) return;
  list[index] = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* cosmetic only */
  }
}

/**
 * Leaves the current account on THIS browser only, without signing it out
 * on the server — so its saved sign-in keeps working and it can be
 * switched back to. This is what "Add another account" uses; the normal
 * Log out (signOut with the default global scope) revokes the account's
 * tokens everywhere, which is exactly why a saved account can't survive
 * it. Note the signed-in account is one per browser: other open tabs
 * follow whatever this does.
 */
export async function leaveCurrentAccountKeepSaved() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}

/**
 * Signs in as a saved account. The account being left stays signed in
 * on the server so it can be switched back to.
 * @param {string} userId
 */
export async function switchToSavedAccount(userId) {
  const target = readAll().find((a) => a.userId === userId);
  if (!target) throw new Error("That account isn't saved on this device anymore.");

  const supabase = getSupabaseClient();

  // Capture the latest tokens of whoever is signed in right now, in case
  // they were refreshed since we last saved them.
  const { data: current } = await supabase.auth.getSession();
  syncSavedAccountSession(current?.session);

  const { data, error } = await supabase.auth.setSession({
    access_token: target.accessToken,
    refresh_token: target.refreshToken,
  });
  if (error || !data?.session || data.session.user.id !== userId) {
    throw new Error(
      `${target.email || "This account"} needs to be signed in again — its saved sign-in has expired. ` +
        "Remove it from the list, then sign in to it normally."
    );
  }
  syncSavedAccountSession(data.session);
  return data.session.user;
}
