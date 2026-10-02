-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — admin audit log + owner check (new)
-- RUN AFTER : the baseline from `supabase db pull` (see docs/BASELINE_STEPS.md)
-- PURPOSE   :
--   admin_actions only records actions against a USER (warn/ban/...) and
--   listing removals. Everything else staff do (change a support request,
--   resolve a report, change a role) left no trace. This adds one generic
--   append-only log. Rows are written ONLY by the admin_* functions in the
--   next migration (SECURITY DEFINER) — there is deliberately no insert,
--   update or delete policy, so nobody can write or edit it from the app.
--   Only an owner can read it.
-- SAFE TO RE-RUN : yes (idempotent).
-- ROLLBACK  : supabase/rollback/admin_layer_rollback.sql
-- ==================================================================

create table if not exists admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references users(id) on delete restrict,
  action       text not null,
  target_table text,
  target_id    uuid,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created on admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_actor   on admin_audit_log (actor_id);

create or replace function is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'owner' from users where id = auth.uid()), false);
$$;

alter table admin_audit_log enable row level security;

drop policy if exists admin_audit_log_select_owner on admin_audit_log;
create policy admin_audit_log_select_owner on admin_audit_log
  for select using (is_owner());

revoke all on admin_audit_log from anon;

notify pgrst, 'reload schema';
