// ==================================================================
// FILE TYPE : RETIRED MOCK BACKEND — PAYMENTS
// PURPOSE   :
//   RETIRED — subscription payments now go through a real PayMongo
//   integration (supabase/functions/create-checkout + paymongo-webhook,
//   called via backend/supabase/subscription.js's startPlanCheckout()).
//   This file is kept only for history/reference, same as the other
//   RETIRED files under backend/auth/ and backend/listings/ — nothing
//   in the app calls this anymore.
// ==================================================================
/**
 * MOCK backend function — simulates charging a card and recording payment.
 * Replace with a real Stripe/PayPal/etc. integration before going live.
 * @param {{ planId: string, amount: number }} input
 * @returns {Promise<{ paymentId: string, status: "paid", amount: number, paidAt: string }>}
 */
export async function processPayment({ planId, amount }) {
  await new Promise((r) => setTimeout(r, 600));
  return {
    paymentId: `pay_${Date.now()}`,
    status: "paid",
    amount,
    paidAt: new Date().toISOString(),
  };
}