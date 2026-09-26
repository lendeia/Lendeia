// ==================================================================
// FILE TYPE : SUPABASE EDGE FUNCTION — shared helper
// PURPOSE   :
//   CORS headers reused by both edge functions in this project.
// CONNECTS TO :
//   Imported by ../create-checkout/index.ts and ../paymongo-webhook/index.ts.
// ==================================================================
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
