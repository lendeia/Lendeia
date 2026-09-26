// ==================================================================
// FILE TYPE : COMPONENT (new)
// PURPOSE   :
//   Shown immediately after a sign-in gets rejected by the device/
//   account-limit check (database/schema/device_account_binding.sql).
//   Supabase's own authentication had already succeeded by the time
//   this fires — state/auth/authStore.jsx's checkDeviceAccountLimit()
//   reacts by signing the person back out right away, and this overlay
//   is what explains why, instead of leaving them looking signed-out
//   with no explanation.
// CONNECTS TO :
//   Rendered by App.jsx whenever useAuth()'s deviceBlockedReason is set.
// ==================================================================
import React from "react";
import { ShieldAlert } from "lucide-react";

export default function DeviceBlockedOverlay({ reason, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[4000] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
        <ShieldAlert size={32} className="mx-auto text-[#a15c1f]" />
        <p className="font-serif text-[19px] text-[#17231D] mt-4">Sign-in blocked</p>
        <p className="text-[13.5px] text-[#6b6f66] mt-2">{reason}</p>
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
