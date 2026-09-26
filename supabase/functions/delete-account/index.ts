// ==================================================================
// FILE TYPE : SUPABASE EDGE FUNCTION (new)
// PURPOSE   :
//   Real account deletion. The Supabase client SDK has no way for a
//   user to delete their own auth account — that requires the Admin
//   API (supabase.auth.admin.deleteUser), which needs the service role
//   key, which must never be shipped to the browser. This function is
//   the only place that key is used for this feature.
//   public.users.id has NO foreign key to auth.users (by design, as in
//   many Supabase projects) — so deleting the auth user alone would
//   NOT cascade to delete their public.users row or anything built on
//   it. Order matters here: delete public.users FIRST (which DOES
//   cascade — every table referencing it was built with `on delete
//   cascade`: listings, rentals, reviews, messages, saved_listings,
//   notifications, payments, support_requests, device_accounts, etc.),
//   THEN delete the auth.users entry so they can no longer sign in at
//   all.
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

    // Deletes the public.users row, cascading to every table built with
    // `references users(id) on delete cascade` — listings, rentals,
    // reviews, messages, saved listings, notifications, payments,
    // support requests, device bindings, etc.
    const { error: dbError } = await supabaseAdmin.from("users").delete().eq("id", userId);
    if (dbError) {
      console.error("Failed to delete public.users row:", dbError);
      return new Response(JSON.stringify({ error: "Couldn't delete your account data. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Now the actual auth identity — after this, they can no longer
    // sign back in at all.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("Failed to delete auth user (data was already deleted):", authError);
      return new Response(JSON.stringify({ error: "Your data was deleted, but there was an issue removing your login. Please contact support." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ deleted: true }), {
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
