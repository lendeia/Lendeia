-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION - remove the device/account limit (new)
-- PURPOSE   :
--   Per explicit request - the device-based cap on how many real
--   accounts one device could create (device_account_binding.sql) was
--   blocking legitimate account creation, so it's disabled here.
--   Kept as a function that always allows, rather than dropping it
--   outright, so state/auth/authStore.jsx's checkDeviceAccountLimit()
--   (which calls it by name) doesn't need any matching code change or
--   redeploy - it keeps calling the same RPC, which now just always
--   says yes.
-- ==================================================================

create or replace function check_device_account_limit(p_device_id text)
returns table (allowed boolean, reason text)
language sql
security definer
set search_path = public
as $$
  select true, null::text;
$$;

notify pgrst, 'reload schema';
