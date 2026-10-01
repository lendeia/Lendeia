// ==================================================================
// FILE TYPE : COMPONENT (shared, new)
// PURPOSE   :
//   "Switch account" — shows the (up to 2) accounts saved on this
//   device, which one is signed in now, and lets the person switch,
//   save the current account, or remove one. See
//   backend/supabase/savedAccounts.js for how saving works and its
//   limits. Shown on Profile, both for guests (to jump straight back
//   into a saved account) and for signed-in accounts.
// CONNECTS TO :
//   useAuth() in state/auth/authStore.jsx. Used by pages/Profile/Profile.jsx.
// ==================================================================
import React, { useState } from "react";
import { Users, Check } from "lucide-react";
import { useAuth } from "../../state/auth/authStore";

function AccountAvatar({ name, avatarUrl }) {
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-[#17231D]/8 flex items-center justify-center shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-serif text-[16px] text-[#17231D]">{(name || "?").charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

export default function SwitchAccountCard() {
  const { account, savedAccounts, maxSavedAccounts, saveCurrentAccount, switchAccount, removeSavedAccount } = useAuth();
  const [busyId, setBusyId] = useState(null); // user id being switched to, or "save"
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const isRealAccount = !!account && !account.isAnonymous;
  const currentIsSaved = isRealAccount && savedAccounts.some((a) => a.userId === account.id);
  const slotsFull = savedAccounts.length >= maxSavedAccounts;

  // Nothing to show a guest who has no saved accounts.
  if (!isRealAccount && savedAccounts.length === 0) return null;

  const run = async (id, action, successMessage) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successMessage) setNotice(successMessage);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = (a) => {
    const ok = window.confirm(
      `Remove ${a.email || a.name} from this device's saved accounts?\n\nIt won't be deleted or signed out of other devices — you'll just need to type its password next time.`
    );
    if (ok) {
      setError(null);
      setNotice(null);
      removeSavedAccount(a.userId);
    }
  };

  return (
    <div className="rounded-2xl border border-[#17231D]/8 bg-white p-5 mt-3 anim-fade-up">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-medium text-[#17231D] flex items-center gap-2">
          <Users size={16} className="text-[#4B5D46]" /> Switch account
        </p>
        <span className="text-[12px] text-[#8A9089]">
          {savedAccounts.length}/{maxSavedAccounts} saved on this device
        </span>
      </div>

      {savedAccounts.length > 0 && (
        <div className="mt-3 divide-y divide-[#17231D]/8 rounded-xl border border-[#17231D]/8">
          {savedAccounts.map((a) => {
            const isCurrent = isRealAccount && a.userId === account.id;
            return (
              <div key={a.userId} className="flex items-center gap-3 px-3.5 py-3">
                <AccountAvatar name={a.name} avatarUrl={a.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-[#17231D] truncate">{a.name}</p>
                  <p className="text-[12px] text-[#6b6f66] truncate">{a.email || "Email not shown"}</p>
                </div>
                {isCurrent ? (
                  <span className="flex items-center gap-1 text-[11.5px] font-medium text-[#4B5D46] bg-[#4B5D46]/12 rounded-full px-2.5 py-1 shrink-0">
                    <Check size={12} /> Current
                  </span>
                ) : (
                  <button
                    onClick={() => run(a.userId, () => switchAccount(a.userId))}
                    disabled={busyId !== null}
                    className="px-3.5 py-1.5 rounded-full bg-[#17231D] text-white text-[12.5px] font-medium disabled:opacity-60 shrink-0"
                  >
                    {busyId === a.userId ? "Switching…" : "Switch"}
                  </button>
                )}
                <button
                  onClick={() => handleRemove(a)}
                  disabled={busyId !== null}
                  className="text-[12px] text-[#8A9089] hover:text-red-600 underline shrink-0 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isRealAccount && !currentIsSaved && (
        slotsFull ? (
          <p className="text-[12.5px] text-[#6b6f66] mt-3">
            Both slots are used. Remove one above to save this account.
          </p>
        ) : (
          <button
            onClick={() => run("save", saveCurrentAccount, "Saved. You can now switch to it from here.")}
            disabled={busyId !== null}
            className="mt-3 px-4 py-2 rounded-full border border-[#17231D]/15 text-[#17231D] text-[12.5px] font-medium disabled:opacity-60"
          >
            {busyId === "save" ? "Saving…" : "Save this account on this device"}
          </button>
        )
      )}

      {error && <p className="text-[12.5px] text-red-600 mt-2.5">{error}</p>}
      {notice && <p className="text-[12.5px] text-[#4B5D46] font-medium mt-2.5">{notice}</p>}

      <p className="text-[11.5px] text-[#8A9089] mt-3 leading-relaxed">
        Up to {maxSavedAccounts} accounts. Saved accounts stay signed in on this browser only, so don't use this on a
        shared computer. Logging out of an account also removes it from this list.
      </p>
    </div>
  );
}
