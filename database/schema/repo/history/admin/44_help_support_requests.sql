-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — Help & Support requests (new)
-- PURPOSE   :
--   A real support-request system, not just decorative category
--   buttons. A signed-in user picks a category and writes a message;
--   it's actually stored, tied to their account, with a status you can
--   track (there's no admin dashboard built to WORK these yet — same
--   known limitation as review_reports/message_reports elsewhere in
--   this app: submissions are real and durable, just not yet paired
--   with an admin queue to act on them).
--   Categories match exactly what was asked for: Rental Support,
--   Payments & Billing, Trust & Safety, Report a Listing, Report a
--   User, Account & Security, General Support, Feedback & Suggestions.
--   "Report a Listing"/"Report a User" optionally reference a specific
--   listing_id/reported_user_id when the person got here from that
--   listing/profile's own "Report" action, but also work as plain
--   category picks from the main Help page with no specific target.
-- CONNECTS TO :
--   Used by backend/supabase/support.js, frontend/pages/Help/Help.jsx.
-- ==================================================================

create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category text not null check (category in (
    'rental_support', 'payments_billing', 'trust_safety', 'report_listing',
    'report_user', 'account_security', 'general_support', 'feedback'
  )),
  message text not null check (char_length(btrim(message)) > 0),
  listing_id uuid references listings(id) on delete set null,
  reported_user_id uuid references users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists idx_support_requests_user on support_requests(user_id);

alter table support_requests enable row level security;

drop policy if exists support_requests_insert_own on support_requests;
create policy support_requests_insert_own on support_requests
  for insert with check (user_id = auth.uid());

drop policy if exists support_requests_select_own on support_requests;
create policy support_requests_select_own on support_requests
  for select using (user_id = auth.uid());

notify pgrst, 'reload schema';
