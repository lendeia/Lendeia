-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — lock down subscription plan columns
-- PURPOSE   :
--   Before this, `profiles_update_own` (database/policies/profiles.sql)
--   let any authenticated user update ANY column on their own profile
--   row, including `plan` and `plan_expires_at` — meaning anyone could
--   open dev tools and call supabase.from('profiles').update({plan:
--   'featured', plan_expires_at: '2099-01-01'}) to grant themselves a
--   free subscription, completely bypassing payment. This was already
--   true even before PayMongo — the previous mock payment flow wrote
--   the plan client-side too, so this same bypass has existed all
--   along. It matters now specifically because a real payment gateway
--   is pointless if the thing it's supposed to gate can still be
--   self-granted. This trigger silently keeps the OLD plan/
--   plan_expires_at value on any update NOT made with the service role
--   key — normal client updates to other profile columns still work
--   normally, only these two columns are protected. Only
--   supabase/functions/paymongo-webhook (which uses the service role
--   key, never exposed to the client) can actually change them now.
-- CONNECTS TO :
--   Makes supabase/functions/paymongo-webhook the only real path to a
--   paid plan. backend/supabase/subscription.js no longer writes these
--   columns directly for paid plans (still does for the free plan,
--   which has no payment to protect).
-- ==================================================================

create or replace function protect_profile_plan_columns()
returns trigger as $$
begin
  if auth.role() is distinct from 'service_role' then
    -- Downgrading to the free plan is still allowed directly from the
    -- client — it's not a bypass of anything, since free has nothing to
    -- pay for. Only setting a PAID plan value is blocked here; that's
    -- the part that must come from a verified payment.
    if new.plan is distinct from 'free' then
      new.plan := old.plan;
      new.plan_expires_at := old.plan_expires_at;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_protect_profile_plan on profiles;
create trigger trg_protect_profile_plan
  before update on profiles
  for each row execute function protect_profile_plan_columns();

-- ---- Payment audit trail + webhook idempotency ----
-- PayMongo (like most payment providers) can and does redeliver the
-- same webhook event more than once — without a way to recognize "I
-- already processed this one," a redelivered webhook would grant/extend
-- the plan twice for a single payment. paymongo_checkout_session_id is
-- UNIQUE and checked by the webhook handler before crediting anything.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_id text not null check (plan_id in ('standard', 'featured')),
  amount numeric(10,2) not null,
  currency text not null default 'PHP',
  paymongo_checkout_session_id text unique,
  paymongo_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table payments enable row level security;

drop policy if exists payments_select_own on payments;
create policy payments_select_own on payments
  for select using (user_id = auth.uid());

-- Only the create-checkout edge function (service role) inserts rows,
-- and only the webhook (service role) updates their status — no client-
-- side insert/update policy exists at all, intentionally: a payment
-- record's existence and status must never be something a client can
-- fabricate or alter.

notify pgrst, 'reload schema';
