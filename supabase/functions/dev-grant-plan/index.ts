// ==================================================================
// FILE TYPE : SUPABASE EDGE FUNCTION — DEV/TESTING ONLY
// PURPOSE   :
//   *** DELETE THIS FUNCTION AND ITS FOLDER BEFORE GOING LIVE ***
//   Lets a developer grant themselves a paid plan directly, skipping
//   PayMongo entirely, purely for testing the rest of the app without
//   needing to run real payments repeatedly. This exists BECAUSE
//   database/schema/protect_subscription_plan.sql deliberately blocks
//   any client-side attempt to set a paid plan directly — that
//   protection is what stops real users from bypassing payment, so a
//   test button can't just update the database directly either. This
//   function uses the service role specifically to go around that,
//   for testing purposes only.
//   Since this function itself grants a paid plan for free with no
//   payment check at all, its mere existence on a live project is a
//   real financial exploit if anyone finds this URL — deploying it at
//   all is already a risk, independent of whether the frontend button
//   is visible. Remove it from Supabase (not just hide the button)
//   before real users are on this project.
// CONNECTS TO :
//   Called only by frontend/components/SubscriptionModal.jsx's dev
//   button, which itself only renders when import.meta.env.DEV is
//   true (never in a production build) — but that frontend safeguard
//   does NOT protect this function once deployed; deleting the
//   deployed function is the only real removal.
// ==================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_PLANS = ["free", "standard", "featured"];
const PLAN_DAYS = { free: null, standard: 14, featured: 30 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { planId } = await req.json();
    if (!VALID_PLANS.includes(planId)) {
      return new Response(JSON.stringify({ error: "Unknown plan." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const days = PLAN_DAYS[planId];
    const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ plan: planId, plan_expires_at: expiresAt })
      .eq("user_id", userData.user.id);
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ granted: true, planId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("dev-grant-plan error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
