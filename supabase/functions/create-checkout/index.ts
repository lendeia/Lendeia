// ==================================================================
// FILE TYPE : SUPABASE EDGE FUNCTION
// PURPOSE   :
//   Creates a real PayMongo Checkout Session and returns its hosted
//   checkout URL for the client to redirect to. This is the ONLY place
//   the PayMongo SECRET key is ever used — it lives as a Supabase
//   secret (set via `supabase secrets set PAYMONGO_SECRET_KEY=...`),
//   never shipped to the browser. The client only ever gets back a
//   checkout URL, nothing sensitive.
//
//   Price is looked up from PLAN_PRICES_CENTAVOS here, server-side —
//   the client sends a planId, NEVER an amount. Trusting a client-sent
//   amount would let anyone pay ₱1 for the Pro plan by editing the
//   request in dev tools.
//
//   Inserts a `pending` row into `payments` up front so there's a
//   record even if the person never completes checkout, and so the
//   webhook (paymongo-webhook/index.ts) has a row to find and update
//   when payment actually completes.
// CONNECTS TO :
//   Called by backend/supabase/subscription.js's subscribeToPlan() for
//   paid plans. Requires these Supabase secrets to be set (see this
//   project's README/setup notes — I can't set real API keys myself):
//     PAYMONGO_SECRET_KEY   — from your PayMongo dashboard
//     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — already auto-provided
//     to every edge function by Supabase, no action needed for those two.
// ==================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inlined directly here (rather than imported from a shared file) so
// this single file can be pasted straight into the Supabase Dashboard's
// web-based Edge Function editor, which deploys one file at a time —
// no CLI or multi-file project needed.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Server-side source of truth for pricing — matches
// frontend/components/PlanCard.jsx's PURCHASABLE_PLANS. PayMongo
// amounts are in centavos (smallest currency unit), so ₱149.00 =
// 14900. Standard removed by explicit request — not purchasable
// through this endpoint anymore, even via a direct API call bypassing
// the frontend UI (which also no longer offers it).
const PLAN_PRICES_CENTAVOS: Record<string, { amount: number; name: string; days: number }> = {
  featured: { amount: 14900, name: "Pro Plan", days: 30 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { planId, successUrl, cancelUrl } = await req.json();
    const plan = PLAN_PRICES_CENTAVOS[planId];
    if (!plan) {
      return new Response(JSON.stringify({ error: "Unknown plan." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identify the calling user from their own JWT (the anon key here
    // is only used to verify the token, not to bypass RLS).
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not signed in." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const paymongoSecretKey = Deno.env.get("PAYMONGO_SECRET_KEY");
    if (!paymongoSecretKey) {
      return new Response(JSON.stringify({ error: "Payments are not configured yet." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authBasic = btoa(`${paymongoSecretKey}:`);

    const checkoutRes = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authBasic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            line_items: [
              {
                currency: "PHP",
                amount: plan.amount,
                name: `Renta ${plan.name} — ${plan.days} days`,
                quantity: 1,
              },
            ],
            payment_method_types: ["gcash", "card", "paymaya", "grab_pay"],
            success_url: successUrl,
            cancel_url: cancelUrl,
            description: `Renta ${plan.name} subscription`,
            // Kept as a second reference alongside the `payments` table
            // row below — the webhook prefers looking up by checkout
            // session id, but metadata is a useful fallback/audit trail.
            metadata: { user_id: user.id, plan_id: planId },
          },
        },
      }),
    });

    const checkoutData = await checkoutRes.json();
    if (!checkoutRes.ok) {
      console.error("PayMongo checkout session creation failed:", checkoutData);
      return new Response(JSON.stringify({ error: "Could not start checkout. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const checkoutSessionId = checkoutData.data.id;
    const checkoutUrl = checkoutData.data.attributes.checkout_url;

    // Service-role client — needed to insert into `payments`, which has
    // no client-facing insert policy at all (see
    // database/schema/protect_subscription_plan.sql).
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { error: insertError } = await supabaseAdmin.from("payments").insert({
      user_id: user.id,
      plan_id: planId,
      amount: plan.amount / 100,
      currency: "PHP",
      paymongo_checkout_session_id: checkoutSessionId,
      status: "pending",
    });
    if (insertError) {
      console.error("Failed to record pending payment:", insertError);
      // Not fatal to the checkout flow itself — the webhook can still
      // fall back to metadata if this row is missing, though that's a
      // degraded path worth alerting on in real monitoring.
    }

    return new Response(JSON.stringify({ checkoutUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
