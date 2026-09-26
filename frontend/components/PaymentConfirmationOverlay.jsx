// ==================================================================
// FILE TYPE : COMPONENT (new)
// PURPOSE   :
//   Shown after PayMongo redirects back from checkout. Critically, this
//   does NOT treat `?checkout=success` in the URL as proof of payment —
//   that's just where PayMongo sends the browser, and a URL is trivial
//   to fake/bookmark/replay. The plan is only ever actually granted by
//   supabase/functions/paymongo-webhook after verifying the payment
//   server-side (see database/schema/protect_subscription_plan.sql).
//   So this component polls getMySubscription() for a few seconds
//   waiting for the webhook to have done its job, and only then shows a
//   real confirmation — if it times out, it says so honestly rather
//   than claiming success it can't actually confirm.
// CONNECTS TO :
//   Rendered by App.jsx when the URL has a `checkout` param.
// ==================================================================
import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "../../state/auth/authStore";
import { getMySubscription } from "../../backend/supabase/subscription";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 10; // ~20 seconds total

export default function PaymentConfirmationOverlay({ status, planId, onClose }) {
  const { account } = useAuth();
  const [state, setState] = useState(status === "cancelled" ? "cancelled" : "waiting");

  useEffect(() => {
    if (status !== "success" || !account?.id) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const sub = await getMySubscription(account.id);
        if (cancelled) return;
        if (sub.plan === planId) {
          setState("confirmed");
          return;
        }
      } catch {
        // keep polling — a transient fetch error shouldn't end the check early
      }
      if (attempts >= MAX_POLLS) {
        if (!cancelled) setState("timeout");
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();

    return () => { cancelled = true; };
  }, [status, planId, account?.id]);

  const planName = planId === "featured" ? "Pro" : planId === "standard" ? "Standard" : planId;

  return (
    <div className="fixed inset-0 bg-black/50 z-[4000] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
        {state === "waiting" && (
          <>
            <Loader2 size={32} className="mx-auto text-[#4B5D46] animate-spin" />
            <p className="font-serif text-[19px] text-[#17231D] mt-4">Confirming your payment…</p>
            <p className="text-[13px] text-[#6b6f66] mt-2">
              This usually only takes a few seconds. Please don't close this window.
            </p>
          </>
        )}
        {state === "confirmed" && (
          <>
            <CheckCircle2 size={36} className="mx-auto text-[#4B5D46]" />
            <p className="font-serif text-[19px] text-[#17231D] mt-4">You're on the {planName} plan</p>
            <p className="text-[13px] text-[#6b6f66] mt-2">Your payment was confirmed and your plan is now active.</p>
            <button onClick={onClose} className="mt-5 px-6 py-3 rounded-full bg-[#17231D] text-white font-medium text-[14px]">
              Continue
            </button>
          </>
        )}
        {state === "timeout" && (
          <>
            <Loader2 size={32} className="mx-auto text-[#8A9089]" />
            <p className="font-serif text-[19px] text-[#17231D] mt-4">Still confirming…</p>
            <p className="text-[13px] text-[#6b6f66] mt-2">
              Your payment may still be processing. If your plan doesn't show as active in a few
              minutes, please contact support — don't retry the payment.
            </p>
            <button onClick={onClose} className="mt-5 px-6 py-3 rounded-full bg-[#17231D] text-white font-medium text-[14px]">
              Close
            </button>
          </>
        )}
        {state === "cancelled" && (
          <>
            <XCircle size={32} className="mx-auto text-[#8A9089]" />
            <p className="font-serif text-[19px] text-[#17231D] mt-4">Checkout cancelled</p>
            <p className="text-[13px] text-[#6b6f66] mt-2">No payment was made. You can try again anytime.</p>
            <button onClick={onClose} className="mt-5 px-6 py-3 rounded-full bg-[#17231D] text-white font-medium text-[14px]">
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
