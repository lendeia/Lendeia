// ==================================================================
// FILE TYPE : SUPABASE BACKEND — SUBSCRIPTION (account-level plan)
// PURPOSE   :
//   Real CRUD against `profiles.plan`/`plan_expires_at` — the account's
//   current subscription tier. For a PAID plan, this now creates a real
//   PayMongo Checkout Session (via the create-checkout edge function)
//   and returns its URL for the caller to redirect to — it does NOT
//   grant the plan itself anymore. Only the payment webhook
//   (supabase/functions/paymongo-webhook) can actually do that now; see
//   database/schema/protect_subscription_plan.sql for why the database
//   itself enforces this regardless of what this file does. The FREE
//   plan is still switched instantly client-side, since there's no
//   payment to verify for it.
// CONNECTS TO :
//   Used by frontend/components/SubscriptionModal.jsx, Navbar.jsx's
//   badge, Profile.jsx's subscription section, and
//   frontend/pages/ListEquipment/ListEquipment.jsx.
// ==================================================================
import { getSupabaseClient, EDGE_FUNCTION_NAMES } from "./client";

/**
 * @typedef {"free"|"standard"|"featured"} PlanId
 */

/**
 * @param {string} userId
 * @returns {Promise<{ plan: PlanId, expiresAt: string|null, rawPlan: PlanId }>}
 */
export async function getMySubscription(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const rawPlan = data?.plan || "free";
  const expiresAt = data?.plan_expires_at || null;
  // Real "is this paid plan actually still active" check — previously
  // every consumer of this function (Dashboard's analytics gate,
  // ListEquipment's limits, etc.) trusted the raw `plan` column
  // forever, with nothing anywhere checking plan_expires_at. That meant
  // a paid plan's benefits never actually expired in practice — once
  // granted, they stayed granted permanently. `plan` returned here is
  // now the EFFECTIVE plan (falls back to "free" once expired);
  // `rawPlan` is the literal stored value, kept for UI that wants to
  // show "your Pro plan is active until X" or "expired on X" text.
  const isExpired = rawPlan !== "free" && expiresAt && new Date(expiresAt) <= new Date();
  return {
    plan: isExpired ? "free" : rawPlan,
    expiresAt,
    rawPlan,
  };
}

/**
 * Switches the account to the FREE plan — but NOT while a paid plan's
 * already-purchased time is still active. Previously this immediately
 * wiped plan_expires_at the moment someone clicked "Free," discarding
 * any remaining time they'd already paid for. Now it refuses to do
 * that while real paid time remains — the account stays on its paid
 * plan (with full access) until that time naturally runs out, and only
 * then does "free" actually take effect. There's nothing to switch
 * back to besides waiting, by design — matches how most subscription
 * services handle "cancel" (you keep access through the period you
 * already paid for, you just don't get billed again).
 * @param {string} userId
 */
export async function switchToFreePlan(userId) {
  const current = await getMySubscription(userId);
  if (current.rawPlan !== "free" && current.expiresAt && new Date(current.expiresAt) > new Date()) {
    throw new Error(
      `Your ${current.rawPlan === "featured" ? "Pro" : "Standard"} plan is still active until ${new Date(current.expiresAt).toLocaleDateString()} — it'll automatically move to Free after that. You don't lose the time you already paid for.`
    );
  }
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({ plan: "free", plan_expires_at: null })
    .eq("user_id", userId);
  if (error) throw error;
  return { plan: "free", expiresAt: null };
}

/**
 * Starts a REAL PayMongo checkout for a paid plan. Does NOT grant the
 * plan — it only creates a checkout session server-side (via the
 * create-checkout edge function, which is the only place the PayMongo
 * secret key is ever used) and returns the hosted checkout URL. The
 * caller is responsible for redirecting the browser there;
 * SubscriptionModal.jsx does `window.location.href = checkoutUrl`.
 * The plan is only actually granted once PayMongo calls the
 * paymongo-webhook edge function back with a verified successful
 * payment — this function's job ends at "here's where to pay."
 * @param {string} planId - "standard" | "featured"
 * @returns {Promise<{ checkoutUrl: string }>}
 */
export async function startPlanCheckout(planId) {
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Please sign in before subscribing.");

  const successUrl = `${window.location.origin}${window.location.pathname}?checkout=success&plan=${planId}`;
  const cancelUrl = `${window.location.origin}${window.location.pathname}?checkout=cancelled`;

  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_NAMES.checkout, {
    body: { planId, successUrl, cancelUrl },
  });
  if (error) throw new Error(error.message || "Could not start checkout. Please try again.");
  if (!data?.checkoutUrl) throw new Error("Could not start checkout. Please try again.");
  return { checkoutUrl: data.checkoutUrl };
}
