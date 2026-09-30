// ==================================================================
// FILE TYPE : SUPABASE EDGE FUNCTION
// PURPOSE   :
//   Real account deletion, with a genuine 30-day grace period -
//   previously this destroyed everything immediately and permanently
//   in one click, no recovery at all. Now it only SCHEDULES the
//   deletion (sets account_status='pending_deletion' and
//   scheduled_deletion_at 30 days out) and returns - nothing is
//   actually destroyed here anymore. The real, permanent, irreversible
//   deletion now happens in the database itself, once the 30 days
//   genuinely pass (database/schema/scheduled_account_deletion.sql's
//   finalize_scheduled_deletions(), run daily by pg_cron).
//   This still needs the service role specifically because a normal
//   user updating their own account_status through the ordinary RLS
//   path is deliberately blocked (see trust_safety_account_status.sql
//   and admin_permissions_foundation.sql's block_self_role_escalation
//   trigger) - that block exists to stop self-un-banning, and
//   correctly has no special case for "unless it's this one specific
//   field for this one specific reason", so this still has to go
//   through the same trusted, service-role path as before.
//   If they sign back in before the 30 days are up,
//   backend/supabase/anonymousAuth.js's ensureAnonymousSession()
//   automatically reactivates the account - logging back in IS the
//   cancel button, nothing else needed.
// CONNECTS TO :
//   Called by backend/supabase/account.js's deleteMyAccount(), used by
//   Profile.jsx's Delete Account flow.
// ==================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    const userId = userData.user.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const scheduledDeletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: dbError } = await supabaseAdmin
      .from("users")
      .update({ account_status: "pending_deletion", scheduled_deletion_at: scheduledDeletionAt })
      .eq("id", userId);
    if (dbError) {
      console.error("Failed to schedule deletion:", dbError);
      return new Response(JSON.stringify({ error: "Couldn't schedule your account for deletion. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ scheduled: true, scheduledDeletionAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
