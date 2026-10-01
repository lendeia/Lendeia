// ==================================================================
// FILE TYPE : STATE — React Context store
// PURPOSE   :
//   Global auth state (`account`). Signs the browser in anonymously on
//   mount (so browsing works immediately), and exposes
//   `linkGoogleAccount()` to upgrade that session to a real, permanent
//   Google identity in place — see backend/supabase/anonymousAuth.js for
//   why this is done as an upgrade rather than a separate login (it
//   keeps the same auth.uid(), so nothing already created under the
//   anonymous session becomes orphaned).
//
//   `account.isAnonymous` is what listingsStore.jsx/rentalsStore.jsx
//   check before allowing someone to create a listing or request a
//   rental — pure browsing stays open to anonymous sessions, but any
//   action that leaves data an owner needs to be able to find again
//   later requires a real, recoverable account first.
// CONNECTS TO :
//   useAuth() is consumed by Navbar, Profile, Details, ListEquipment.
//   state/profile/profileStore.jsx depends on this store's `account`.
// ==================================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { updateMyProfile } from "../../backend/supabase/profile";
import { updateMyLastActive } from "../../backend/supabase/users";
import {
  ensureAnonymousSession,
  linkGoogleAccount as linkGoogleAccountBackend,
  upgradeWithEmailPassword as upgradeWithEmailPasswordBackend,
  verifyEmailUpgradeCode as verifyEmailUpgradeCodeBackend,
  signInWithEmailPassword as signInWithEmailPasswordBackend,
  endAnonymousSession,
  changePassword as changePasswordBackend,
  requestPasswordReset as requestPasswordResetBackend,
  verifyPasswordResetCode as verifyPasswordResetCodeBackend,
} from "../../backend/supabase/anonymousAuth";
import { getSupabaseClient } from "../../backend/supabase/client";
import { getDeviceId } from "../../shared/deviceId";
import {
  MAX_SAVED_ACCOUNTS,
  listSavedAccounts,
  subscribeSavedAccounts,
  saveCurrentAccount as saveCurrentAccountBackend,
  removeSavedAccount as removeSavedAccountBackend,
  switchToSavedAccount,
  syncSavedAccountSession,
  updateSavedAccountProfile,
} from "../../backend/supabase/savedAccounts";

const initialAuthState = {
  account: null,
  authLoading: true,
  authError: null,
  retryAuth: () => {},
  linkGoogleAccount: async () => {},
  upgradeWithEmailPassword: async () => {},
  verifyEmailUpgradeCode: async () => {},
  signInWithEmailPassword: async () => {},
  logout: async () => {},
  // "Switch account" — up to MAX_SAVED_ACCOUNTS accounts kept on this
  // device (see backend/supabase/savedAccounts.js).
  savedAccounts: [],
  maxSavedAccounts: 2,
  saveCurrentAccount: async () => {},
  switchAccount: async () => {},
  removeSavedAccount: () => {},
  updateAccount: async () => {},
  changePassword: async () => {},
  requestPasswordReset: async () => {},
  verifyPasswordResetCode: async () => {},
  // True right after the person clicks a "reset your password" email
  // link and lands back in the app — see requestPasswordReset()'s doc
  // comment. Profile.jsx watches this to auto-open the same
  // ChangePasswordModal used for a normal in-account password change.
  passwordRecovery: false,
  clearPasswordRecovery: () => {},
  // Set right after a sign-in gets rejected by the device/account-limit
  // check (database/schema/device_account_binding.sql) — App.jsx shows
  // a blocking overlay whenever this is non-null.
  deviceBlockedReason: null,
  clearDeviceBlockedReason: () => {},
  accountActionReason: null,
  clearAccountActionReason: () => {},
};

export const AuthContext = createContext(initialAuthState);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState(() => listSavedAccounts());
  useEffect(() => subscribeSavedAccounts(() => setSavedAccounts(listSavedAccounts())), []);
  // Set when a sign-in was just rejected by the device/account-limit
  // check — App.jsx shows a blocking overlay whenever this is non-null.
  const [deviceBlockedReason, setDeviceBlockedReason] = useState(null);
  // Same pattern, for a banned/suspended account (backend/supabase/
  // anonymousAuth.js's ensureAnonymousSession()). This has to be a
  // SEPARATE, persistent piece of state, not just the message in
  // authError — signing the person out fires a SIGNED_OUT event, which
  // this same file already reacts to by silently establishing a fresh
  // anonymous session (the normal, correct behavior for a real
  // voluntary logout). Without a persistent flag surviving that, the
  // ban notice would flash briefly and then get quietly overwritten
  // the moment that new guest session succeeds — someone could end up
  // never actually seeing why they were signed out.
  const [accountActionReason, setAccountActionReason] = useState(null);

  const checkDeviceAccountLimit = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("check_device_account_limit", {
        p_device_id: getDeviceId(),
      });
      if (error) return; // fail open — a check failure shouldn't lock legitimate users out
      const result = Array.isArray(data) ? data[0] : data;
      if (result && result.allowed === false) {
        setDeviceBlockedReason(result.reason || "This device can't be used with this account.");
        await supabase.auth.signOut();
      }
    } catch {
      // fail open, same reasoning as above
    }
  }, []);

  const refreshSession = useCallback(() => {
    setAuthLoading(true);
    setAuthError(null);
    return ensureAnonymousSession()
      .then((user) => setAccount(user))
      .catch((err) => {
        console.error("Sign-in failed:", err);
        if (err.code === "ACCOUNT_BANNED" || err.code === "ACCOUNT_SUSPENDED" || err.code === "ACCOUNT_PENDING_DELETION") {
          setAccountActionReason(err.message);
          return;
        }
        setAuthError(err.message || "Could not connect. Please try again.");
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    refreshSession();

    // Catches two situations that don't resolve as a normal promise in
    // this tab: (1) the browser navigating back after a Google OAuth
    // redirect from linkGoogleAccount(), and (2) the access token being
    // auto-refreshed in the background. Either way, re-run
    // ensureAnonymousSession() so `account` picks up the now-real
    // name/email/avatar and isAnonymous flips to false.
    const supabase = getSupabaseClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase rotates refresh tokens; keep a saved account's stored
      // copy current so switching back to it later still works.
      syncSavedAccountSession(session);
      // SIGNED_OUT added: after a real logout() below, this is what
      // automatically gives the browser a fresh anonymous session again
      // so browsing keeps working smoothly — without it, `account` would
      // just sit at null until something else happened to trigger a
      // refresh.
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") {
        refreshSession();
      }
      // Real device/account-limit check — see database/schema/
      // device_account_binding.sql. Runs on every sign-in, for every
      // auth path (Google, email/password sign-in, email/password
      // upgrade), since they all fire this same event. Supabase's own
      // auth has ALREADY succeeded by this point — this can only react
      // immediately after, by signing back out and blocking, not
      // prevent the initial sign-in itself.
      if (event === "SIGNED_IN") {
        checkDeviceAccountLimit();
      }
      // Fires if Supabase ever establishes a recovery session through
      // its own redirect mechanism (the OLD link-based flow, kept as a
      // harmless fallback — verifyPasswordResetCode above is what
      // actually drives the real, current code-based flow and already
      // sets this same flag itself, so this case is mostly dormant now).
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        refreshSession();
      }
    });

    return () => sub?.subscription?.unsubscribe();
  }, [refreshSession]);

  const linkGoogleAccount = useCallback(async () => {
    // This triggers a full browser redirect to Google and back — it does
    // not resolve with the final account here; onAuthStateChange above
    // picks that up after the redirect completes.
    await linkGoogleAccountBackend();
  }, []);

  const upgradeWithEmailPassword = useCallback(async (email, password) => {
    await upgradeWithEmailPasswordBackend(email, password);
    // Confirmation is now a 6-digit code (verifyEmailUpgradeCode below),
    // not a clicked email link — nothing further to do here, the
    // caller shows the code-entry step next.
  }, []);

  const verifyEmailUpgradeCode = useCallback(async (email, code) => {
    await verifyEmailUpgradeCodeBackend(email, code);
    // Unlike the old link-click flow (which relied on
    // onAuthStateChange firing once Supabase redirected back),
    // verifyOtp() updates the session directly in this same call — so
    // `account` needs an explicit refresh right here to pick up
    // isAnonymous flipping to false and the new email/authProvider.
    await refreshSession();
  }, [refreshSession]);

  const signInWithEmailPassword = useCallback(async (email, password) => {
    const user = await signInWithEmailPasswordBackend(email, password);
    // onAuthStateChange's SIGNED_IN case handles refreshing `account`,
    // but resolving this promise with the user lets a caller show
    // immediate feedback without waiting on that listener.
    return user;
  }, []);

  const logout = useCallback(async () => {
    // Was previously calling a retired mock function that never actually
    // signed out of Supabase at all — it just faked a delay and cleared
    // local React state, while the real session token silently remained
    // valid. Real sign-out below, via Supabase itself, does NOT delete
    // any data (profile photo, listings, reviews, etc. all stay exactly
    // as they were, tied to the account's permanent id) — signing back
    // in with the same Google account or email/password recovers
    // everything. onAuthStateChange's SIGNED_OUT handler (above) picks
    // up right after this and gives the browser a fresh anonymous
    // session automatically, so browsing keeps working without a reload.
    // Logging out signs the account out everywhere (its tokens stop
    // working), so it can no longer be switched to — drop it from the
    // saved list too, rather than leave a dead entry behind.
    if (account?.id) removeSavedAccountBackend(account.id);
    await endAnonymousSession();
    setAccount(null);
  }, [account?.id]);

  const saveCurrentAccount = useCallback(async () => {
    await saveCurrentAccountBackend(account);
  }, [account]);

  const switchAccount = useCallback(async (userId) => {
    await switchToSavedAccount(userId);
    await refreshSession();
  }, [refreshSession]);

  const removeSavedAccount = useCallback((userId) => removeSavedAccountBackend(userId), []);

  // Keep the name/photo shown in the saved list in step with the real one.
  useEffect(() => {
    if (account && !account.isAnonymous) updateSavedAccountProfile(account);
  }, [account]);

  const updateAccount = useCallback(async (patch) => {
    if (!account?.id) throw new Error("Not signed in yet.");
    const updated = await updateMyProfile(account.id, patch);
    setAccount((prev) => (prev ? { ...prev, ...updated } : prev));
    return updated;
  }, [account]);

  // Presence heartbeat — real, periodic, only for actual (non-anonymous)
  // accounts, since a guest session isn't something other people message
  // or track presence for the way a real account is. Updates once
  // immediately on sign-in, then every few minutes while the app stays
  // open — see backend/supabase/users.js's updateMyLastActive() and
  // frontend/components/PresenceBadge.jsx, which computes "Active now"/
  // "Active recently" from this real timestamp.
  useEffect(() => {
    if (!account?.id || account.isAnonymous) return;
    const tick = () => updateMyLastActive().catch(() => {});
    tick();
    const id = setInterval(tick, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [account?.id, account?.isAnonymous]);

  const changePassword = useCallback(async (newPassword) => {
    await changePasswordBackend(newPassword);
    // A successful password change is what actually ends recovery mode
    // — clearing it right when the reset link is clicked (rather than
    // once they've set a new password) would let the prompt disappear
    // before they've actually done anything.
    setPasswordRecovery(false);
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    await requestPasswordResetBackend(email);
  }, []);

  // Confirming the code is what actually establishes the recovery
  // session now — previously that happened automatically when
  // Supabase redirected back after a clicked email link
  // (onAuthStateChange's PASSWORD_RECOVERY case below). Setting the
  // same passwordRecovery flag here reuses that exact existing "now
  // show the set-a-new-password screen" UI untouched; only how the
  // recovery session gets started has changed.
  const verifyPasswordResetCode = useCallback(async (email, code) => {
    await verifyPasswordResetCodeBackend(email, code);
    setPasswordRecovery(true);
  }, []);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const value = {
    account,
    authLoading,
    authError,
    retryAuth: refreshSession,
    linkGoogleAccount,
    upgradeWithEmailPassword,
    verifyEmailUpgradeCode,
    signInWithEmailPassword,
    logout,
    savedAccounts,
    maxSavedAccounts: MAX_SAVED_ACCOUNTS,
    saveCurrentAccount,
    switchAccount,
    removeSavedAccount,
    updateAccount,
    changePassword,
    requestPasswordReset,
    verifyPasswordResetCode,
    passwordRecovery,
    clearPasswordRecovery,
    deviceBlockedReason,
    clearDeviceBlockedReason: () => setDeviceBlockedReason(null),
    accountActionReason,
    clearAccountActionReason: () => setAccountActionReason(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
