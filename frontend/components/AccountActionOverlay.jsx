// ==================================================================
// FILE TYPE : COMPONENT (new)
// PURPOSE   :
//   Shown when a sign-in gets rejected because the account is
//   banned or currently suspended (database/schema/
//   trust_safety_account_status.sql, enforced in backend/supabase/
//   anonymousAuth.js's ensureAnonymousSession()). Supabase's own
//   authentication had already succeeded by the time this fires -
//   the person is signed back out immediately, and this overlay is
//   what explains why, instead of leaving them looking signed-out
//   with no explanation, or (worse) having the reason silently get
//   overwritten the moment the app auto-establishes a fresh guest
//   session in the background, same class of issue
//   DeviceBlockedOverlay.jsx already exists to solve.
// CONNECTS TO :
//   Rendered by App.jsx whenever useAuth()'s accountActionReason is set.
// ==================================================================
import React from "react";
import { ShieldAlert } from "lucide-react";

export default function AccountActionOverlay({ reason, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[4000] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
        <ShieldAlert size={32} className="mx-auto text-[#a15c1f]" />
        <p className="font-serif text-[19px] text-[#17231D] mt-4">Account access restricted</p>
        <p className="text-[13.5px] text-[#6b6f66] mt-2">{reason}</p>
        <p className="text-[12px] text-[#8A9089] mt-3">
          If you believe this is a mistake, contact support.lendeia.business@gmail.com.
        </p>
        <button
          onClick={onClose}
          className="mt-5 px-6 py-3 rounded-full bg-[#17231D] text-white font-medium text-[14px]"
        >
          Okay
        </button>
      </div>
    </div>
  );
}
