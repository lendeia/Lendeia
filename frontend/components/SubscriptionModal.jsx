// ==================================================================
// FILE TYPE : COMPONENT (new)
// PURPOSE   :
//   The account-level "choose your subscription" modal — this is what
//   used to be a step buried inside ListEquipment.jsx's publish flow,
//   now openable from anywhere (top nav badge, Profile, Home) since
//   subscribing is an account-wide action, not a per-listing purchase.
//   Reuses PLANS/PlanCard from frontend/components/PlanCard.jsx so the
//   plan data/UI stays identical to what ListEquipment.jsx still shows
//   while filling out a listing.
// CONNECTS TO :
//   Calls backend/supabase/subscription.js's switchToFreePlan() (instant)
//   or startPlanCheckout() (redirects to a real PayMongo checkout) —
//   see that file's header for why paid plans are no longer granted
//   directly from here. Rendered
//   by frontend/components/Navbar.jsx (badge/button), Profile.jsx
//   (subscription section), and Home.jsx (upgrade banner).
//   Renders via createPortal straight into document.body — it USED TO
//   render inline wherever it was called from, which meant when opened
//   from Navbar.jsx's TopNav (a `fixed` + `z-[2000]` container), the
//   modal was trapped inside that container's own stacking context. That
//   let unrelated page content elsewhere (e.g. Dashboard.jsx) end up
//   visually on top of it despite the modal's own z-[3000] — z-index
//   only competes against siblings WITHIN the same stacking context, not
//   globally. Escaping to document.body (the same fix already used by
//   ListEquipment.jsx's fullscreen map picker) avoids that entirely.
// ==================================================================
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, ShieldCheck } from "lucide-react";
import { PLANS, PURCHASABLE_PLANS, PlanCard } from "./PlanCard";
import { useAuth } from "../../state/auth/authStore";
import { switchToFreePlan, startPlanCheckout } from "../../backend/supabase/subscription";

export default function SubscriptionModal({ currentPlanId, onClose, onSubscribed }) {
  const { account } = useAuth();
  const [planId, setPlanId] = useState(currentPlanId || "free");
  const [step, setStep] = useState("choose"); // "choose" | "paying" | "done"
  const [error, setError] = useState(null);

  const selectedPlan = PLANS.find((p) => p.id === planId) || PLANS[0];

  const handleSubscribe = async () => {
    if (!account?.id) {
      setError("You need to be signed in to subscribe.");
      return;
    }
    if (account.isAnonymous) {
      setError("Please create a permanent account (Google or email, in Profile) before subscribing.");
      return;
    }
    setStep("paying");
    setError(null);
    try {
      if (selectedPlan.price === 0) {
        const result = await switchToFreePlan(account.id);
        setStep("done");
        onSubscribed?.(result);
      } else {
        // Real PayMongo checkout — the plan is only actually granted
        // once PayMongo confirms the payment back to our webhook, not
        // by anything that happens in this browser tab. Leaving the app
        // now is expected; App.jsx picks up the ?checkout=success/
        // cancelled redirect PayMongo sends the person back to.
        const { checkoutUrl } = await startPlanCheckout(selectedPlan.id);
        window.location.href = checkoutUrl;
      }
    } catch (err) {
      setError(err.message || "Payment or subscription failed. Please try again.");
      setStep("choose");
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[3000] flex items-start justify-center px-4 py-6 md:py-10 overflow-y-auto">
      {/* max-h + its own overflow-y-auto — mobile browsers (iOS Safari
          especially) can behave inconsistently relying solely on the
          backdrop container above to scroll a tall modal into view;
          giving the panel itself a capped height and its own scroll
          makes it reliably fit and scroll on short mobile viewports. */}
      <div className="bg-[#F6F4EE] rounded-2xl w-full max-w-3xl p-4 sm:p-6 relative my-auto max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-3 right-3 sm:top-4 sm:right-4 text-[#6b6f66] p-1">
          <X size={20} />
        </button>

        {step === "done" ? (
          <div className="py-10 text-center">
            <p className="font-serif text-[20px] sm:text-[22px] text-[#17231D]">
              {selectedPlan.emoji} You're on the {selectedPlan.name} plan
            </p>
            <p className="text-[13.5px] text-[#6b6f66] mt-2">
              This applies to your account — no need to choose a plan again next time you list something.
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-3 rounded-[4px] bg-[#17231D] text-white font-medium text-[14.5px]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-serif text-[21px] sm:text-[24px] text-[#17231D] pr-8">Choose your plan</h2>
            <p className="text-[13px] sm:text-[13.5px] text-[#6b6f66] mt-1 max-w-lg">
              Your plan applies to your whole account — it decides how many listings you can have
              active at once and how many photos each can have. Upgrade or downgrade anytime here.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 mt-6">
              {PURCHASABLE_PLANS.map((p) => (
                <PlanCard key={p.id} plan={p} selected={planId === p.id} onSelect={setPlanId} />
              ))}
            </div>

            <div className="mt-6 flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl bg-white border border-[#17231D]/8">
              <ShieldCheck size={18} className="text-[#4B5D46] shrink-0 mt-0.5" />
              <p className="text-[12.5px] text-[#6b6f66] leading-relaxed">
                Your payment covers the plan's features for its active period. Listings you've
                already published keep the plan they were created under even if you later change
                plans.
              </p>
            </div>

            {error && <p className="text-[13px] text-red-600 mt-3">{error}</p>}

            {/* Stacks vertically on narrow screens instead of forcing
                the price text and a long button onto one cramped row —
                the button is also full-width on mobile for an easier,
                bigger tap target. */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 p-4 rounded-2xl bg-[#EFEBDD]">
              <div>
                <p className="text-[13px] text-[#6b6f66]">Selected plan</p>
                <p className="font-serif text-[18px] sm:text-[19px] text-[#17231D]">
                  {selectedPlan.emoji} {selectedPlan.name} — {selectedPlan.price === 0 ? "Free" : `₱${selectedPlan.price}`}
                </p>
              </div>
              <button
                onClick={handleSubscribe}
                disabled={step === "paying" || planId === currentPlanId}
                className="w-full sm:w-auto px-6 py-3 rounded-[4px] bg-[#E2932E] text-[#17231D] font-medium text-[14.5px] disabled:opacity-60"
              >
                {step === "paying"
                  ? "Processing…"
                  : planId === currentPlanId
                  ? "Current plan"
                  : selectedPlan.price === 0
                  ? "Switch to Free"
                  : `Pay ₱${selectedPlan.price} & subscribe`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
