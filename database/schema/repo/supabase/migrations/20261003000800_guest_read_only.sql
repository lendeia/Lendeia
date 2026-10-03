-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION - guests are READ-ONLY
-- PURPOSE   :
--   A guest (anonymous session) can already READ listings, ratings,
--   reviews and public profiles. This makes sure a guest cannot WRITE
--   anything else, even by calling the Supabase API directly.
--   Uses RESTRICTIVE policies: they are ANDed with the existing
--   policies, so nothing existing is loosened or replaced.
--   NOT touched on purpose (guest sign-in itself needs them):
--   users, profiles, device_accounts.
-- SAFE TO RE-RUN.
-- ==================================================================

create or replace function is_guest_session()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

do $$
declare
  t text;
  tables text[] := array[
    'listings', 'rentals', 'reviews', 'review_reports', 'saved_listings',
    'support_requests', 'conversations', 'conversation_participants',
    'messages', 'message_reports', 'blocked_users', 'notifications'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping % (table not found)', t;
      continue;
    end if;

    execute format('drop policy if exists guest_no_insert on public.%I', t);
    execute format('create policy guest_no_insert on public.%I as restrictive for insert with check (not is_guest_session())', t);

    execute format('drop policy if exists guest_no_update on public.%I', t);
    execute format('create policy guest_no_update on public.%I as restrictive for update using (not is_guest_session())', t);

    execute format('drop policy if exists guest_no_delete on public.%I', t);
    execute format('create policy guest_no_delete on public.%I as restrictive for delete using (not is_guest_session())', t);
  end loop;
end $$;

-- Guests can't upload or delete files (listing photos, avatars, message
-- photos, support attachments). Reading public photos is unaffected.
drop policy if exists guest_no_storage_write_ins on storage.objects;
create policy guest_no_storage_write_ins on storage.objects
  as restrictive for insert with check (not public.is_guest_session());
drop policy if exists guest_no_storage_write_upd on storage.objects;
create policy guest_no_storage_write_upd on storage.objects
  as restrictive for update using (not public.is_guest_session());
drop policy if exists guest_no_storage_write_del on storage.objects;
create policy guest_no_storage_write_del on storage.objects
  as restrictive for delete using (not public.is_guest_session());

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- CHECK (read-only). Should list guest_no_* on every table above.
-- ------------------------------------------------------------------
-- select tablename, policyname, cmd from pg_policies
-- where policyname like 'guest_no_%' order by tablename, policyname;
