// ==================================================================
// FILE TYPE : PAGE (new)
// PURPOSE   :
//   Full detail view for a single notification — built specifically
//   for the "account_action" type (a moderation notice: warn/
//   restrict/suspend/ban), whose whole content needs real room to
//   read properly rather than the two-line preview the notification
//   panel itself shows. Shown when App.jsx's viewNotification() is
//   called from the bell's click handler (Navbar.jsx).
// CONNECTS TO :
//   App.jsx's `page === "notification-detail"` route and
//   notificationDetail state.
// ==================================================================
import React from "react";
import { ChevronLeft, ShieldAlert } from "lucide-react";

export default function NotificationDetail({ notification, back }) {
  if (!notification) {
    return (
      <div className="px-6 md:px-12 py-8 max-w-xl mx-auto">
        <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70">
          <ChevronLeft size={17} /> Back
        </button>
        <p className="text-[14px] text-[#6b6f66] mt-6">This notification isn't available anymore.</p>
      </div>
    );
  }

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12 max-w-xl mx-auto">
      <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70 mb-6">
        <ChevronLeft size={17} /> Back
      </button>

      <div className="rounded-2xl border border-[#17231D]/10 bg-white p-6">
        <div className="w-11 h-11 rounded-full bg-[#a15c1f]/10 flex items-center justify-center">
          <ShieldAlert size={20} className="text-[#a15c1f]" />
        </div>
        <p className="font-serif text-[22px] text-[#17231D] mt-4">{notification.title}</p>
        <p className="text-[12px] text-[#8A9089] mt-1.5">
          {new Date(notification.createdAt).toLocaleString(undefined, {
            month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
          })}
        </p>
        {/* No specific admin's personal name/photo here on purpose —
            moderation notices come from Lendeia as a platform, not from
            an individual staff member's own identity. */}
        <p className="text-[11px] text-[#8A9089] mt-0.5">From Lendeia</p>

        <div className="mt-5 pt-5 border-t border-[#17231D]/8">
          <p className="text-[14.5px] text-[#17231D] leading-relaxed whitespace-pre-wrap">{notification.body}</p>
        </div>

        <p className="text-[12px] text-[#8A9089] mt-5">
          If you believe this is a mistake, contact support@lendeia.app.
        </p>
      </div>
    </div>
  );
}
