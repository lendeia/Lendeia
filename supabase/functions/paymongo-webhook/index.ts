// ==================================================================
// FILE TYPE : SUPABASE EDGE FUNCTION
// PURPOSE   :
//   Receives PayMongo's webhook events. This is the ONLY place that
//   ever actually grants a paid plan (profiles.plan/plan_expires_at are
//   locked down to the service role — see database/schema/
//   protect_subscription_plan.sql), and it only does so after verifying
//   the request genuinely came from PayMongo.
//
//   SIGNATURE VERIFICATION: PayMongo signs each webhook with a secret
//   only you and PayMongo know (from your webhook's settings in the
//   PayMongo dashboard, NOT the same as the API secret key), sent in a
//   `Paymongo-Signature` header shaped like `t=<timestamp>,te=<test_sig>`
//   or `t=<timestamp>,li=<live_sig>` — the signature itself is an
//   HMAC-SHA256 of `<timestamp>.<raw request body>` using that webhook
//   secret. Without this check, ANYONE could POST a fake "payment
//   succeeded" event straight to this URL and grant themselves a free
//   subscription — this is not optional. I'm implementing this from
//   PayMongo's documented webhook signing scheme as I know it; verify
//   the exact header format against PayMongo's current docs before
//   relying on this in production, since I can't browse to confirm it
//   hasn't changed.
//
//   IDEMPOTENCY: PayMongo (like most providers) can redeliver the same
//   event more than once. Before granting anything, this checks whether
//   the matching `payments` row is already `paid` — if so, it just
//   returns success without granting the plan again.
// CONNECTS TO :
//   Configure this function's URL as a webhook endpoint in your
//   PayMongo dashboard, subscribed to the `checkout_session.payment.paid`
//   event. Requires these Supabase secrets:
//     PAYMONGO_WEBHOOK_SECRET — from the webhook's settings in PayMongo
//     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-provided already.
// ==================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLAN_DAYS: Record<string, number> = { standard: 14, featured: 30 };

async function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );
  const timestamp = parts["t"];
  const providedSignature = parts["li"] || parts["te"];
  if (!timestamp || !providedSignature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const computedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time-ish comparison — length-checked first, then compared
  // byte by byte rather than with a plain === on the strings, so the
  // check doesn't leak timing information about how much of the
  // signature matched.
  if (computedSignature.length !== providedSignature.length) return false;
  let diff = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    diff |= computedSignature.charCodeAt(i) ^ providedSignature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const webhookSecret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("PAYMONGO_WEBHOOK_SECRET is not set.");
      return new Response("Webhook not configured", { status: 500 });
    }

    const signatureHeader = req.headers.get("Paymongo-Signature");
    const isValid = await verifySignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid PayMongo webhook signature — rejecting.");
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.data?.attributes?.type;

    if (eventType !== "checkout_session.payment.paid") {
      // Acknowledge anything else so PayMongo doesn't keep retrying an
      // event this function deliberately ignores.
      return new Response("ok", { status: 200 });
    }

    const checkoutSession = event.data.attributes.data;
    const checkoutSessionId: string = checkoutSession.id;
    const metadata = checkoutSession.attributes?.metadata ?? {};
    const paymentId: string | null =
      checkoutSession.attributes?.payments?.[0]?.id ?? null;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: paymentRow, error: findError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, plan_id, status")
      .eq("paymongo_checkout_session_id", checkoutSessionId)
      .maybeSingle();

    if (findError) {
      console.error("Error looking up payment row:", findError);
      return new Response("error", { status: 500 });
    }

    // Fall back to metadata if, for some reason, the payments row is
    // missing (e.g. the insert in create-checkout failed) — degraded
    // but still correct, since metadata came from the same trusted
    // server-side create-checkout call, not from the client.
    const userId = paymentRow?.user_id ?? metadata.user_id;
    const planId = paymentRow?.plan_id ?? metadata.plan_id;

    if (!userId || !planId || !PLAN_DAYS[planId]) {
      console.error("Webhook missing user/plan info — cannot grant plan.", { userId, planId });
      return new Response("ok", { status: 200 });
    }

    // Idempotency — a redelivered webhook for an already-processed
    // payment must not extend/re-grant the plan a second time.
    if (paymentRow?.status === "paid") {
      return new Response("already processed", { status: 200 });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PLAN_DAYS[planId]);

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ plan: planId, plan_expires_at: expiresAt.toISOString() })
      .eq("user_id", userId);
    if (profileError) {
      console.error("Failed to grant plan after verified payment:", profileError);
      return new Response("error", { status: 500 });
    }

    if (paymentRow) {
      await supabaseAdmin
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString(), paymongo_payment_id: paymentId })
        .eq("id", paymentRow.id);
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "payment_successful",
      title: "Payment successful",
      body: `Your ${planId === "featured" ? "Pro" : "Standard"} plan is now active.`,
      read: false,
    }).then(undefined, () => {}); // best-effort, matches insertPaymentSuccessful's existing pattern

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("paymongo-webhook error:", err);
    return new Response("error", { status: 500 });
  }
});
