-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — block rental requests on delisted items
-- PURPOSE   :
--   rentals_insert_own (require_real_account.sql) checked who's
--   requesting (a real, non-owner account) but never whether the
--   listing itself was actually active — meaning a delisted/expired
--   listing could still have a rental request created for it by
--   calling the Supabase client directly, completely bypassing
--   Details.jsx's UI-level checks (date picker hidden, button
--   disabled/relabeled, handleRequest's own guard — all real, but all
--   still just client-side). This closes that at the source: the
--   database itself now refuses the insert unless the listing is
--   currently active and not expired — the same condition
--   listings_select_active (listing_lifecycle.sql) uses to decide
--   whether a listing is publicly visible at all.
-- CONNECTS TO :
--   Completes the UI-level fix in Details.jsx (isActive checks around
--   the request button/date picker/handleRequest).
-- ==================================================================

drop policy if exists rentals_insert_own on rentals;
create policy rentals_insert_own on rentals
  for insert with check (
    renter_id = auth.uid()
    and not exists (
      select 1 from listings l
      where l.id = listing_id and l.owner_id = auth.uid()
    )
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.is_anonymous = false
    )
    and exists (
      select 1 from listings l
      where l.id = listing_id
        and l.is_active = true
        and (l.plan_expires_at is null or l.plan_expires_at > now())
    )
  );

notify pgrst, 'reload schema';
