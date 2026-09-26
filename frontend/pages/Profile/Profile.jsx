// ==================================================================
// FILE TYPE : PAGE (contains several merged sub-components)
// PURPOSE   :
//   Account page: avatar/photo viewer, personal-info edit modal, and account
//   settings list (log out, etc). Renders <LoginScreen> in place of itself
//   when there's no logged-in account yet. No longer reads listings/rentals
//   directly — the "My listings"/"Rental history" counts that used to live
//   here moved to Dashboard.jsx's "My Items"/"Rental History" tab headers.
// CONNECTS TO :
//   Reads useAuth() for account info, backend/supabase/subscription.js and
//   rentals.js (verification status) for the subscription/verification sections.
// ==================================================================
import React, { useState, useEffect } from "react";
import { ChevronRight, X, Camera, ShieldCheck, ShieldOff } from "lucide-react";
import { useAuth } from "../../../state/auth/authStore";
import SubscriptionModal from "../../components/SubscriptionModal";
import { getPlanById } from "../../components/PlanCard";
import { getMySubscription } from "../../../backend/supabase/subscription";
import { getRenterVerification } from "../../../backend/supabase/rentals";
import { uploadAvatar } from "../../../backend/supabase/storage";
import { getMyBlockedUsers, unblockUser } from "../../../backend/supabase/blocking";
import { deleteMyAccount } from "../../../backend/supabase/account";
import ShareButton from "../../components/ShareButton";
import { getStoreSharePreviewUrl } from "../../../backend/supabase/client";
import PhotoViewerModal from "../../components/PhotoViewerModal";
import { getMyProfileDetails } from "../../../backend/supabase/profile";
import { useMyLocation } from "../../../state/location/locationStore";
// NOTE: LoginScreen import removed — the manual login flow is retired,
// see state/auth/authStore.jsx and this file's account/authLoading branch
// below for why.

// ---- SECTION: sub-component (modal) — fullscreen avatar viewer ----
// ---- SECTION: sub-component (modal) — edit name/photo form ----
// Now keeps the real File object (`photoFile`) alongside the local
// preview URL — previously only the blob preview URL was kept, and THAT
// was what got saved as the account's avatarUrl directly. A blob: URL
// only exists in this browser tab, so the "photo" would show correctly
// for a moment here and then appear broken/empty everywhere else (other
// pages, other people, even this same page after a refresh) — see
// backend/supabase/storage.js's uploadAvatar() for the real fix, called
// from handleSaveInfo in the main Profile component below, not here.
// Used for two flows sharing one form: (1) a signed-in real
// email/password account changing their password from Profile settings
// (isRecovery=false, normal Cancel available), and (2) completing a
// "forgot password" reset after clicking the emailed link
// (isRecovery=true, forced — see state/auth/authStore.jsx's
// passwordRecovery flag and backend/supabase/anonymousAuth.js's
// requestPasswordReset()). Only ever offered for account.authProvider
// === 'email' — a Google account has no password here to change.
// ==================================================================
// "Trust Profile" — real completeness tracking + real verification
// signals. Honest about what's actually verified vs self-reported:
//   - Email verified: REAL, from Supabase's own auth session
//     (account.emailVerified — see backend/supabase/anonymousAuth.js).
//   - Location verified: interpreted as "has granted browser location
//     at least once" (state/location/locationStore.jsx's cached coords)
//     — real, just a lighter bar than phone/ID verification.
//   - Phone: SELF-REPORTED ONLY. No SMS/OTP provider is wired into this
//     project, so a phone number here is never shown with a "verified"
//     checkmark — that would be a fabricated trust signal. It still
//     counts toward the completeness bar as "added", clearly labeled
//     as unverified.
// The percentage and the "Trusted Profile" badge are both computed
// live from these real signals, not hardcoded.
// ==================================================================
const GENDERS = [
  ["", "Prefer not to say"],
  ["male", "Male"],
  ["female", "Female"],
  ["other", "Other"],
];

function TrustProfileCard({ account, details, locationGranted, requestLocation, locating, onSave }) {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(details.username || "");
  const [bio, setBio] = useState(details.bio || "");
  const [city, setCity] = useState(details.city || "");
  const [age, setAge] = useState(details.age || "");
  const [gender, setGender] = useState(details.gender || "");
  const [phone, setPhone] = useState(details.phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Keep local edit fields in sync if `details` loads/changes after
  // this component already mounted (e.g. the initial fetch resolves
  // after first render).
  useEffect(() => {
    setUsername(details.username || "");
    setBio(details.bio || "");
    setCity(details.city || "");
    setAge(details.age || "");
    setGender(details.gender || "");
    setPhone(details.phone || "");
  }, [details]);

  // Real completeness checklist — every item here is something the
  // person actually did, not a fabricated default.
  const checklist = [
    ["Profile photo", !!account.avatarUrl],
    ["Username", !!details.username],
    ["Short bio", !!details.bio],
    ["City/area", !!details.city],
    ["Age", !!details.age],
    ["Phone added", !!details.phone],
    ["Email verified", !!account.emailVerified],
    ["Location verified", !!locationGranted],
  ];
  const doneCount = checklist.filter(([, done]) => done).length;
  const percent = Math.round((doneCount / checklist.length) * 100);
  const isTrusted = percent === 100;
  const tone = percent >= 80 ? "🟢 Good" : percent >= 40 ? "🟡 Getting there" : "🔴 Just started";

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        username: username.trim() || null,
        bio: bio.trim() || null,
        city: city.trim() || null,
        age: age ? Number(age) : null,
        gender: gender || null,
        phone: phone.trim() || null,
      });
      setEditing(false);
    } catch (err) {
      setError(err.message || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-[#17231D]/12 px-4 py-2.5 text-[13.5px] outline-none bg-white";

  return (
    <div className="rounded-2xl border border-[#17231D]/8 bg-white p-5 mb-6 anim-fade-up">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[14px] font-medium text-[#17231D]">
          {isTrusted ? "🛡️ Trusted Profile" : "Complete your profile"}
        </p>
        <span className="text-[12px] text-[#8A9089]">{tone}</span>
      </div>

      <div className="w-full h-2 rounded-full bg-[#17231D]/8 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#E2932E] to-[#4B5D46] transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[12px] text-[#8A9089] mt-1.5">
        {percent}% complete — a complete profile helps other users feel more comfortable renting from you.
      </p>

      {isTrusted && (
        <p className="text-[13px] text-[#4B5D46] font-medium mt-3">You're ready to rent! 🎉</p>
      )}

      {/* Step 2 — real verification status */}
      <div className="flex flex-wrap gap-2 mt-4">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium ${account.emailVerified ? "bg-[#4B5D46]/12 text-[#4B5D46]" : "bg-[#17231D]/[0.06] text-[#8A9089]"}`}>
          {account.emailVerified ? "✓" : "○"} Email verified
        </span>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium ${locationGranted ? "bg-[#4B5D46]/12 text-[#4B5D46]" : "bg-[#17231D]/[0.06] text-[#8A9089]"}`}>
          {locationGranted ? "✓" : "○"} Location verified
        </span>
        {!locationGranted && (
          <button
            onClick={requestLocation}
            disabled={locating}
            className="text-[11.5px] font-medium text-[#4B5D46] underline disabled:opacity-60"
          >
            {locating ? "Locating…" : "Verify now"}
          </button>
        )}
      </div>

      {!editing ? (
        <button
          onClick={() => setEditing(true)}
          className="mt-4 px-4 py-2 rounded-full border border-[#17231D]/15 text-[#17231D] text-[12.5px] font-medium"
        >
          {percent === 100 ? "Edit profile details" : "Complete your profile"}
        </button>
      ) : (
        <div className="mt-4 space-y-2.5">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={inputClass} />
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio (max 300 characters)" rows={3} maxLength={300} className={inputClass} />
          <div className="grid grid-cols-2 gap-2.5">
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City/area" className={inputClass} />
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Age (18+)"
              min={18}
              max={120}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass}>
              {GENDERS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className={inputClass} />
          </div>
          <p className="text-[11px] text-[#8A9089]">
            Phone is not verified (no SMS confirmation yet) — it's shown as "added", not "verified".
          </p>

          {error && <p className="text-[12.5px] text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13px] font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-full bg-[#17231D] text-white text-[13px] font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Real, permanent account deletion — requires typing DELETE to confirm,
// since a plain confirm() dialog isn't enough friction for something
// this irreversible. Calls backend/supabase/account.js's
// deleteMyAccount(), which actually removes the account and everything
// tied to it (listings, rentals, messages, etc.) via the delete-account
// edge function — not just a local sign-out.
function DeleteAccountModal({ onClose, onConfirm, deleting, error }) {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6">
        <h3 className="font-serif text-[19px] text-[#17231D]">Delete your account?</h3>
        <p className="text-[13.5px] text-[#6b6f66] mt-2 leading-relaxed">
          This permanently deletes your account, listings, rental history, messages, and saved
          items. This can't be undone.
        </p>
        <label className="block mt-4">
          <span className="text-[12.5px] text-[#6b6f66]">Type DELETE to confirm</span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full mt-1 rounded-xl border border-red-300 px-4 py-2.5 text-[14px] outline-none"
          />
        </label>
        {error && <p className="text-[12.5px] text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13.5px] font-medium"
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm || deleting}
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-full bg-red-600 text-white text-[13.5px] font-medium disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete forever"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose, onSave, saving, error, isRecovery }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 6;
  const canSubmit = password.length >= 6 && password === confirm;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-[19px] text-[#17231D]">
            {isRecovery ? "Set a new password" : "Change password"}
          </h3>
          {!isRecovery && (
            <button onClick={onClose}><X size={18} className="text-[#6b6f66]" /></button>
          )}
        </div>
        {isRecovery && (
          <p className="text-[13px] text-[#6b6f66] mb-3">
            You're resetting your password — choose a new one below to finish.
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[13px] text-[#6b6f66]">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="w-full mt-1 rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] outline-none"
            />
            {tooShort && <p className="text-[12px] text-red-600 mt-1">Password must be at least 6 characters.</p>}
          </div>
          <div>
            <label className="text-[13px] text-[#6b6f66]">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full mt-1 rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] outline-none"
            />
            {mismatch && <p className="text-[12px] text-red-600 mt-1">Passwords don't match.</p>}
          </div>
        </div>

        {error && <p className="text-[13px] text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 mt-5">
          {!isRecovery && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13.5px] font-medium"
            >
              Cancel
            </button>
          )}
          <button
            disabled={saving || !canSubmit}
            onClick={() => onSave(password)}
            className="flex-1 px-4 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save password"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonalInfoModal({ account, onClose, onSave, saving, error }) {
  const [name, setName] = useState(account.name);
  const [photoPreview, setPhotoPreview] = useState(account.avatarUrl || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoRemoved(false);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview("");
    setPhotoRemoved(true);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-[19px] text-[#17231D]">Personal information</h3>
          <button onClick={onClose}><X size={18} className="text-[#6b6f66]" /></button>
        </div>

        <div className="flex flex-col items-center gap-3 mb-5">
          <div className="w-20 h-20 rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center relative ring-4 ring-[#E2932E]/20 ring-offset-2">
            {photoPreview ? (
              <img src={photoPreview} className="w-full h-full object-cover" />
            ) : (
              <span className="font-serif text-[24px] text-[#6b6f66]">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-[13px] text-[#17231D] font-medium cursor-pointer">
            <Camera size={15} />
            Change photo
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </label>
          {photoPreview && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="text-[12.5px] text-red-600 font-medium"
            >
              Remove photo
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[13px] text-[#6b6f66]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] outline-none"
            />
          </div>
          <div>
            <label className="text-[13px] text-[#6b6f66]">Email</label>
            <input
              value={account.email}
              disabled
              className="w-full mt-1 rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] bg-[#17231D]/[0.03] text-[#8A9089] outline-none"
            />
          </div>
        </div>

        {error && <p className="text-[13px] text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13.5px] font-medium"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={() => onSave({ name: name.trim(), photoFile, photoRemoved })}
            className="flex-1 px-4 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- SECTION: sub-component — email/password sign-in-or-upgrade form ----
// Second option alongside the Google button above, for when Google OAuth
// isn't configured yet (no Google Cloud project / Manual Linking toggle
// needed for this path — see backend/supabase/anonymousAuth.js's
// upgradeWithEmailPassword/signInWithEmailPassword). Two modes:
//   "upgrade" — turn THIS anonymous session into a permanent account
//               (same auth.uid(), nothing already created is orphaned).
//   "existing" — sign into an account that was already upgraded on a
//                different browser/device (replaces this session).
function EmailAuthForm({ onUpgrade, onSignIn, onForgotPassword, goToLegal }) {
  const [mode, setMode] = useState("upgrade");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email.trim() || password.length < 6) {
      setError("Enter an email and a password of at least 6 characters.");
      return;
    }
    if (mode === "upgrade" && !agreedToTerms) {
      setError("Please agree to the Terms & Conditions to create an account.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "upgrade") {
        await onUpgrade(email.trim(), password);
        setSuccess("Check your email for a confirmation link to finish setting up your account.");
      } else {
        await onSignIn(email.trim(), password);
        setSuccess("Signed in.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // "Forgot password" — only relevant once someone's actually trying to
  // sign IN to an existing account (not creating a new one), and only
  // needs their email, not the password field they may not remember.
  const handleForgotPassword = async () => {
    setError(null);
    setSuccess(null);
    if (!email.trim()) {
      setError("Enter your email above first, then tap \"Forgot password?\" again.");
      return;
    }
    setSubmitting(true);
    try {
      await onForgotPassword(email.trim());
      setSuccess("Check your email for a link to reset your password.");
    } catch (err) {
      setError(err.message || "Couldn't send the reset email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
      <div className="flex gap-4 text-[12.5px]">
        <button
          type="button"
          onClick={() => setMode("upgrade")}
          className={mode === "upgrade" ? "font-medium text-[#17231D]" : "text-[#8A9089]"}
        >
          Create account with this email
        </button>
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={mode === "existing" ? "font-medium text-[#17231D]" : "text-[#8A9089]"}
        >
          I already have an account
        </button>
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="rounded-xl border border-[#17231D]/12 px-4 py-2.5 text-[13.5px] outline-none bg-white"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (min. 6 characters)"
        className="rounded-xl border border-[#17231D]/12 px-4 py-2.5 text-[13.5px] outline-none bg-white"
      />
      {mode === "existing" && (
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={submitting}
          className="text-[12px] text-[#4B5D46] font-medium text-left disabled:opacity-60"
        >
          Forgot password?
        </button>
      )}
      {/* Real agreement checkbox, required before creating an account —
          see frontend/pages/Legal/Legal.jsx for the actual policy text. */}
      {mode === "upgrade" && (
        <label className="flex items-start gap-2 text-[12px] text-[#6b6f66] cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            I agree to the{" "}
            <button type="button" onClick={() => goToLegal?.("terms")} className="underline text-[#4B5D46] font-medium">
              Terms & Conditions
            </button>{" "}
            and acknowledge the{" "}
            <button type="button" onClick={() => goToLegal?.("privacy")} className="underline text-[#4B5D46] font-medium">
              Privacy Policy
            </button>
            .
          </span>
        </label>
      )}
      {error && <p className="text-[12.5px] text-red-600">{error}</p>}
      {success && <p className="text-[12.5px] text-[#4B5D46] font-medium">{success}</p>}
      <button
        type="submit"
        disabled={submitting || (mode === "upgrade" && !agreedToTerms)}
        className="px-4 py-2.5 rounded-full border border-[#17231D]/20 text-[#17231D] text-[13px] font-medium disabled:opacity-60"
      >
        {submitting ? "Please wait…" : mode === "upgrade" ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}

// ---- SECTION: MAIN component — Profile/account page ----
export default function Profile({ goToLegal, goToHelp }) {
  // NOTE: no longer destructures `login` — the manual email/name login
  // form (LoginScreen) has been retired. See state/auth/authStore.jsx's
  // file header for why: it used to produce a non-UUID `account.id` that
  // broke real Supabase inserts. `account` is now populated automatically
  // by anonymous auth shortly after the app loads.
  const { account, authLoading, authError, retryAuth, linkGoogleAccount, upgradeWithEmailPassword, signInWithEmailPassword, logout, updateAccount, changePassword, requestPasswordReset, passwordRecovery, clearPasswordRecovery } = useAuth();
  const { coords: myCoords, loading: locatingForTrust, requestLocation: requestLocationForTrust } = useMyLocation();

  const [profileDetails, setProfileDetails] = useState({ username: null, bio: null, city: null, age: null, gender: null, phone: null });
  useEffect(() => {
    if (!account?.id || account?.isAnonymous) return;
    let cancelled = false;
    getMyProfileDetails(account.id)
      .then((d) => { if (!cancelled) setProfileDetails(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [account?.id, account?.isAnonymous]);

  const handleSaveTrustDetails = async (patch) => {
    const updated = await updateAccount(patch);
    setProfileDetails((prev) => ({ ...prev, ...updated }));
  };

  const [editingInfo, setEditingInfo] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteMyAccount();
      // The account and everything in it are gone server-side at this
      // point — reload to a completely fresh state rather than trying
      // to patch React state for an identity that no longer exists.
      window.location.href = window.location.origin;
    } catch (err) {
      setDeleteError(err.message || "Couldn't delete your account. Please try again.");
      setDeletingAccount(false);
    }
  };
  const [blockedLoading, setBlockedLoading] = useState(true);

  useEffect(() => {
    if (!account?.id || account?.isAnonymous) return;
    let cancelled = false;
    getMyBlockedUsers(account.id)
      .then((list) => { if (!cancelled) setBlockedUsers(list); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setBlockedLoading(false); });
    return () => { cancelled = true; };
  }, [account?.id, account?.isAnonymous]);

  const handleUnblock = async (userId) => {
    try {
      await unblockUser(userId);
      setBlockedUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch (err) {
      window.alert(err.message || "Couldn't unblock this user.");
    }
  };
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const [subscriptionPlanId, setSubscriptionPlanId] = useState("free");
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [verification, setVerification] = useState({ completedAsRenter: 0, isVerified: false, cap: 2, threshold: 5 });

  useEffect(() => {
    if (!account?.id || account?.isAnonymous) return;
    let cancelled = false;
    getMySubscription(account.id)
      .then((s) => { if (!cancelled) setSubscriptionPlanId(s.plan); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [account?.id, account?.isAnonymous]);

  // Real "trusted renter" status — see database/schema/
  // limits_delisting_notifications.sql's enforce_renter_active_limit
  // trigger, which is what actually enforces the 2-vs-5 active-rental
  // cap server-side. This just shows the same real numbers.
  useEffect(() => {
    if (!account?.id || account?.isAnonymous) return;
    let cancelled = false;
    getRenterVerification(account.id)
      .then((v) => { if (!cancelled) setVerification(v); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [account?.id, account?.isAnonymous]);

  if (!account) {
    // authLoading: anonymous sign-in is still in flight (normal, brief).
    // authError + !authLoading: it genuinely failed (e.g. Supabase env
    // vars missing, network down, anonymous sign-ins disabled in the
    // dashboard) — offer a retry instead of ever falling back to the old
    // broken manual login form.
    if (authError) {
      return (
        <div className="px-6 md:px-12 py-16 max-w-sm mx-auto text-center">
          <p className="text-[14px] text-red-600">{authError}</p>
          <button
            onClick={retryAuth}
            className="mt-4 px-5 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium"
          >
            Try again
          </button>
        </div>
      );
    }
    return (
      <div className="px-6 md:px-12 py-16 max-w-sm mx-auto text-center">
        <p className="text-[14px] text-[#6b6f66]">Connecting…</p>
      </div>
    );
  }

  // "Log out" only makes sense for a real, recoverable account. For an
  // anonymous/guest session, logging out doesn't sign you out of
  // anything you can sign back into — it PERMANENTLY discards that
  // identity (see backend/supabase/anonymousAuth.js's endAnonymousSession
  // comments), taking any listings/rentals with it. Showing it as a
  // plain, unlabeled menu item for guests invites exactly that mistake,
  // so it's hidden entirely for anonymous accounts, and confirmed with
  // an explicit warning for real ones.
  const handleLogout = () => {
    if (!window.confirm("Log out of your account?")) return;
    logout();
  };

  const SETTINGS = [
    { label: "Personal information", enabled: true, onClick: () => setEditingInfo(true) },
    // Only offered for a real email/password account — nothing to
    // change here for a Google account or a guest.
    ...(account.authProvider === "email"
      ? [{ label: "Change password", enabled: true, onClick: () => setChangingPassword(true) }]
      : []),
    { label: "Help & Support", enabled: true, onClick: () => goToHelp() },
    ...(account.isAnonymous ? [] : [{ label: "Log out", enabled: true, onClick: handleLogout }]),
    // Only for a real account — a guest session doesn't have persistent
    // data in the same sense there's something durable to delete.
    ...(account.isAnonymous ? [] : [{ label: "Delete Account", enabled: true, danger: true, onClick: () => setShowDeleteModal(true) }]),
  ];
  const handleSaveInfo = async ({ name, photoFile, photoRemoved }) => {
    setSaving(true);
    setSaveError(null);
    try {
      // Actually upload the real file to Supabase Storage now, and use
      // the permanent public URL it returns — NOT a local `blob:`
      // preview URL, which would only ever work in this one browser tab
      // (see backend/supabase/storage.js's uploadAvatar file comment and
      // PersonalInfoModal's comment above for why that was broken).
      let avatarUrl = account.avatarUrl;
      if (photoFile) {
        avatarUrl = await uploadAvatar(photoFile, account.id);
      } else if (photoRemoved) {
        avatarUrl = null;
      }
      await updateAccount({ name, avatarUrl });
      setEditingInfo(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async (newPassword) => {
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await changePassword(newPassword);
      setChangingPassword(false);
      window.alert("Your password has been updated.");
    } catch (err) {
      setPasswordError(err.message || "Couldn't update your password. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12 max-w-xl">
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ringPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(226,147,46,0.25); }
          50% { box-shadow: 0 0 0 8px rgba(226,147,46,0); }
        }
        .anim-fade-up { animation: fadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .btn-press { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .btn-press:active { transform: scale(0.97); }
        .avatar-ring { animation: ringPulse 2.6s ease-in-out infinite; }
      `}</style>

      {/* Avatar/name now always renders FIRST regardless of login state —
          previously the guest banner came before it, which meant the
          page's layout genuinely differed between logged-in and guest
          views (avatar first vs. banner first). Consistent position now;
          the banner (below) is the thing that varies. */}
      <div className="flex items-center justify-between gap-4 anim-fade-up" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-center gap-4">
        <button
          onClick={() => setViewingPhoto(true)}
          className="w-20 h-20 rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0 avatar-ring cursor-pointer"
          title="View profile photo"
        >
          {account.avatarUrl ? (
            <img src={account.avatarUrl} className="w-full h-full object-cover" />
          ) : (
            <span className="font-serif text-[24px] text-[#6b6f66]">
              {account.name.charAt(0).toUpperCase()}
            </span>
          )}
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-[24px] text-[#17231D]">{account.name}</h1>
            {!account.isAnonymous && verification.isVerified && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4B5D46]/12 text-[#4B5D46] text-[11px] font-semibold border border-[#4B5D46]/30">
                <ShieldCheck size={11} /> Verified
              </span>
            )}
            {!account.isAnonymous && subscriptionPlanId !== "free" && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E2932E]/15 text-[#8a5a13] text-[11px] font-semibold border border-[#E2932E]/40">
                {getPlanById(subscriptionPlanId).emoji} {getPlanById(subscriptionPlanId).name}
              </span>
            )}
          </div>
          <p className="text-[13.5px] text-[#6b6f66] mt-0.5">{account.email}</p>
        </div>
        </div>

        {/* Shares the account's OWN store — real profile photo and
            name, linking straight to their store page. Previously this
            shared generic "check out Lendeia" app-referral text with no
            reference to the store at all. */}
        {!account.isAnonymous && (
          <ShareButton
            url={getStoreSharePreviewUrl(account.id)}
            title={`${account.name}'s Store`}
            text={`Check out ${account.name}'s store on Lendeia`}
            label="Share"
          />
        )}
      </div>

      {!account.isAnonymous && (
        <div className="mt-6">
          <TrustProfileCard
            account={account}
            details={profileDetails}
            locationGranted={!!myCoords}
            requestLocation={requestLocationForTrust}
            locating={locatingForTrust}
            onSave={handleSaveTrustDetails}
          />
        </div>
      )}

      {account.isAnonymous && (
        <div className="rounded-xl border border-[#E2932E]/40 bg-[#E2932E]/8 p-4 mt-6 anim-fade-up">
          <p className="text-[14px] font-medium text-[#17231D]">You're browsing as a guest</p>
          <p className="text-[13px] text-[#6b6f66] mt-1 leading-relaxed">
            Your account only exists in this browser right now — if you clear your browsing data or
            switch devices, you'll lose access to it permanently. Sign in with Google or email to make
            it a real, recoverable account so you can list items, request rentals, and message
            owners.
          </p>
          <button
            onClick={() => linkGoogleAccount().catch((err) => window.alert(err.message || "Couldn't start Google sign-in."))}
            className="mt-3 px-4 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium"
          >
            Sign in with Google
          </button>
          <p className="text-[11px] text-[#8A9089] mt-1.5">
            By continuing, you agree to our{" "}
            <button onClick={() => goToLegal?.("terms")} className="underline">Terms & Conditions</button> and{" "}
            <button onClick={() => goToLegal?.("privacy")} className="underline">Privacy Policy</button>.
          </p>

          <div className="mt-4 pt-4 border-t border-[#17231D]/8">
            <p className="text-[12.5px] text-[#8A9089] mb-1">Or use email instead:</p>
            <EmailAuthForm onUpgrade={upgradeWithEmailPassword} onSignIn={signInWithEmailPassword} onForgotPassword={requestPasswordReset} goToLegal={goToLegal} />
          </div>
        </div>
      )}

      {/* "Rental history" and "My listings" stat cards moved out of
          Profile entirely — they now live as title+counter headers on
          Dashboard.jsx's "Rental History" and "My Items" tabs instead,
          right next to the actual lists they're counting. */}


      {/* Real, DB-enforced rental capacity — see database/schema/
          limits_delisting_notifications.sql's enforce_renter_active_limit
          trigger. New renters can have 2 active requests at once;
          completing 5 real rentals raises that to 5 and adds the
          Verified badge shown next to their name above. */}
      {!account.isAnonymous && (
        <div className="rounded-xl border border-[#17231D]/8 bg-white p-4 mt-3 anim-fade-up" style={{ animationDelay: "0.16s" }}>
          {verification.isVerified ? (
            <p className="text-[13px] text-[#4B5D46] font-medium flex items-center gap-1.5">
              <ShieldCheck size={14} /> Verified customer — up to 5 active rentals at once.
            </p>
          ) : (
            <>
              <p className="text-[13px] text-[#17231D]">
                New customer — up to 2 active rentals at once.
              </p>
              <p className="text-[12px] text-[#8A9089] mt-1">
                Complete {verification.threshold - verification.completedAsRenter} more successful rental
                {verification.threshold - verification.completedAsRenter === 1 ? "" : "s"} to become Verified
                and unlock 5 active rentals ({verification.completedAsRenter}/{verification.threshold} so far).
              </p>
            </>
          )}
        </div>
      )}

      {!account.isAnonymous && (
        <>
          <h3 className="font-medium text-[15px] text-[#17231D] mt-8 mb-3 anim-fade-up" style={{ animationDelay: "0.28s" }}>
            Subscription
          </h3>
          <div className="rounded-xl border border-[#17231D]/8 bg-white p-4 flex items-center justify-between anim-fade-up" style={{ animationDelay: "0.3s" }}>
            <div>
              <p className="text-[14px] font-medium text-[#17231D]">
                {getPlanById(subscriptionPlanId).emoji} {getPlanById(subscriptionPlanId).name} plan
              </p>
              <p className="text-[12.5px] text-[#8A9089] mt-0.5">
                Applies to every listing you create while subscribed.
              </p>
            </div>
            <button
              onClick={() => setShowSubscribe(true)}
              className="px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13px] font-medium"
            >
              {subscriptionPlanId === "free" ? "Upgrade" : "Manage"}
            </button>
          </div>
        </>
      )}

      {/* Account settings, similarly: for a guest the only thing that
          would be enabled here is "Personal information," and given
          nothing else in the list applies to a guest either, the whole
          section is hidden rather than shown nearly empty. Guests can
          still set/change their display name via the "Sign in with
          email" upgrade flow above, which carries the name through. */}
      {!account.isAnonymous && (
        <>
          <h3 className="font-medium text-[15px] text-[#17231D] mt-8 mb-3 anim-fade-up" style={{ animationDelay: "0.3s" }}>
            Account settings
          </h3>
          <div
            className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8 anim-fade-up"
            style={{ animationDelay: "0.34s" }}
          >
            {SETTINGS.map(({ label, enabled, onClick, danger }) => (
              <button
                key={label}
                onClick={onClick}
                disabled={!enabled}
                className={`btn-press w-full flex items-center justify-between px-4 py-3.5 text-left text-[14px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  danger ? "text-red-600 hover:bg-red-50" : "text-[#17231D] hover:bg-[#17231D]/[0.02]"
                }`}
              >
                <span>
                  {label}
                  {!enabled && <span className="text-[11px] text-[#8A9089] ml-2">(coming soon)</span>}
                </span>
                <ChevronRight size={16} className={danger ? "text-red-300" : "text-[#8A9089]"} />
              </button>
            ))}
          </div>

          {/* Blocked users — real block list, matches what Messages.jsx's
              Block action actually creates in the database. */}
          {blockedUsers.length > 0 && (
            <>
              <h3 className="font-medium text-[15px] text-[#17231D] mt-6 mb-3">Blocked users</h3>
              <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
                {blockedUsers.map((u) => (
                  <div key={u.userId} className="flex items-center justify-between px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <span className="font-serif text-[12px] text-[#6b6f66]">{u.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <p className="text-[13.5px] text-[#17231D]">{u.name}</p>
                    </div>
                    <button
                      onClick={() => handleUnblock(u.userId)}
                      className="text-[12.5px] font-medium text-[#4B5D46] flex items-center gap-1"
                    >
                      <ShieldOff size={13} /> Unblock
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {showSubscribe && (
        <SubscriptionModal
          currentPlanId={subscriptionPlanId}
          onClose={() => setShowSubscribe(false)}
          onSubscribed={(result) => setSubscriptionPlanId(result.plan)}
        />
      )}

      {editingInfo && (
        <PersonalInfoModal
          account={account}
          saving={saving}
          error={saveError}
          onClose={() => {
            setEditingInfo(false);
            setSaveError(null);
          }}
          onSave={handleSaveInfo}
        />
      )}

      {(changingPassword || passwordRecovery) && (
        <ChangePasswordModal
          saving={passwordSaving}
          error={passwordError}
          // A recovery-mode open (from clicking the emailed reset link)
          // shows a different heading and can't just be dismissed with
          // a plain Cancel the way a normal "change my password" open
          // can — closing it without saving would leave them stuck in a
          // half-finished reset with no password set.
          isRecovery={passwordRecovery}
          onClose={() => {
            setChangingPassword(false);
            setPasswordError(null);
            if (passwordRecovery) clearPasswordRecovery();
          }}
          onSave={handleSavePassword}
        />
      )}

      {showDeleteModal && (
        <DeleteAccountModal
          deleting={deletingAccount}
          error={deleteError}
          onClose={() => { setShowDeleteModal(false); setDeleteError(null); }}
          onConfirm={handleDeleteAccount}
        />
      )}

      {viewingPhoto && (
        <PhotoViewerModal
          photoUrl={account.avatarUrl}
          initial={account.name.charAt(0).toUpperCase()}
          onClose={() => setViewingPhoto(false)}
        />
      )}
    </div>
  );
}