-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — messages: photos, blocking, reporting
-- PURPOSE   :
--   1) messages.image_url — lets a message carry a photo attachment
--      alongside/instead of text.
--   2) blocked_users — real blocking. Blocking someone prevents EITHER
--      side from starting a new conversation with the other AND from
--      sending further messages in any conversation they already share
--      — enforced by both get_or_create_conversation() and the
--      messages insert policy, not just hidden in the UI.
--   3) message_reports — same pattern as review_reports
--      (two_way_category_reviews.sql): records a report, doesn't yet
--      have an admin queue that acts on it (same known limitation
--      already flagged there — a real admin-role system is a separate
--      piece of work).
-- CONNECTS TO :
--   Extends database/schema/messaging.sql. Consumed by
--   backend/supabase/messages.js, backend/supabase/blocking.js (new).
-- ==================================================================

alter table messages add column if not exists image_url text;
-- A message must have text OR a photo (or both) — never neither.
alter table messages drop constraint if exists messages_content_or_image;
alter table messages add constraint messages_content_or_image
  check (char_length(btrim(coalesce(content, ''))) > 0 or image_url is not null);
-- content itself is still NOT NULL with its own length check from
-- messaging.sql — relax that so a photo-only message (empty content)
-- is allowed; the check above ensures at least one of the two is real.
alter table messages alter column content drop not null;
alter table messages drop constraint if exists messages_content_check;
alter table messages add constraint messages_content_check
  check (content is null or char_length(content) <= 2000);

create table if not exists blocked_users (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

alter table blocked_users enable row level security;

drop policy if exists blocked_users_select_own on blocked_users;
create policy blocked_users_select_own on blocked_users
  for select using (blocker_id = auth.uid());

drop policy if exists blocked_users_insert_own on blocked_users;
create policy blocked_users_insert_own on blocked_users
  for insert with check (blocker_id = auth.uid());

drop policy if exists blocked_users_delete_own on blocked_users;
create policy blocked_users_delete_own on blocked_users
  for delete using (blocker_id = auth.uid());

-- Starting a new conversation is blocked in EITHER direction.
create or replace function get_or_create_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_caller_anonymous boolean;
begin
  if other_user_id = auth.uid() then
    raise exception 'You cannot start a conversation with yourself.' using errcode = '23514';
  end if;

  select is_anonymous into v_caller_anonymous from users where id = auth.uid();
  if coalesce(v_caller_anonymous, true) then
    raise exception 'Please sign in with Google or email before messaging.' using errcode = '23514';
  end if;

  if not exists (select 1 from users where id = other_user_id) then
    raise exception 'That user does not exist.' using errcode = '23503';
  end if;

  if exists (
    select 1 from blocked_users
    where (blocker_id = auth.uid() and blocked_id = other_user_id)
       or (blocker_id = other_user_id and blocked_id = auth.uid())
  ) then
    raise exception 'You can no longer message this user.' using errcode = '23514';
  end if;

  select cp1.conversation_id into v_conversation_id
  from conversation_participants cp1
  join conversation_participants cp2 on cp1.conversation_id = cp2.conversation_id
  where cp1.user_id = auth.uid() and cp2.user_id = other_user_id
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into conversations default values returning id into v_conversation_id;
  insert into conversation_participants (conversation_id, user_id)
  values (v_conversation_id, auth.uid()), (v_conversation_id, other_user_id);

  return v_conversation_id;
end;
$$;

grant execute on function get_or_create_conversation(uuid) to authenticated;

-- Sending a NEW message into an EXISTING conversation is also blocked,
-- in case a block happens mid-conversation (not just at start-a-new-one
-- time). Uses the same is_conversation_participant() helper as
-- fix_conversation_participants_recursion.sql to avoid the same class
-- of RLS self-reference issue.
drop policy if exists messages_insert_own on messages;
create policy messages_insert_own on messages
  for insert with check (
    sender_id = auth.uid()
    and is_conversation_participant(conversation_id, auth.uid())
    and not exists (
      select 1 from conversation_participants cp2
      join blocked_users b on
        (b.blocker_id = cp2.user_id and b.blocked_id = auth.uid())
        or (b.blocker_id = auth.uid() and b.blocked_id = cp2.user_id)
      where cp2.conversation_id = messages.conversation_id and cp2.user_id <> auth.uid()
    )
  );

create table if not exists message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  reporter_id uuid not null references users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists message_reports_one_per_reporter
  on message_reports (message_id, reporter_id);

alter table message_reports enable row level security;

drop policy if exists message_reports_insert_own on message_reports;
create policy message_reports_insert_own on message_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists message_reports_select_own on message_reports;
create policy message_reports_select_own on message_reports
  for select using (reporter_id = auth.uid());

-- Storage bucket for message photos — same public-bucket-with-
-- unguessable-path convention already used by avatars/listing-photos
-- (see those migrations' file headers for the same honest tradeoff note).
insert into storage.buckets (id, name, public)
values ('message-photos', 'message-photos', true)
on conflict (id) do nothing;

drop policy if exists "message_photos_public_read" on storage.objects;
create policy "message_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'message-photos');

drop policy if exists "message_photos_insert_own" on storage.objects;
create policy "message_photos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'message-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
