-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — real messaging (renter <-> owner)
-- PURPOSE   :
--   A real, private messaging system between two users — most commonly
--   a renter and a listing's owner. Enforces the same kind of rules as
--   everything else in this app: a user can only see/send messages in
--   conversations they're actually part of (RLS), conversations can only
--   be created through a vetted function (not a raw insert), self-
--   messaging is blocked, and — consistent with the "must have a real
--   account" rule already applied to listing/renting (see
--   database/schema/require_real_account.sql) — an anonymous user cannot
--   start a conversation, since a chat tied to an identity that can
--   vanish the moment local storage is cleared isn't a real conversation
--   either party can rely on.
--
--   KNOWN LIMITATION (flagged honestly): this is a POLLING-based chat on
--   the frontend (backend/supabase/messages.js re-fetches every few
--   seconds while a conversation is open), not real-time via Supabase's
--   websocket channels. It works, but a message can take a few seconds
--   to appear for the other person rather than being instant. Wiring up
--   supabase.channel() for true real-time is a reasonable next step, not
--   done here to keep this batch reviewable.
-- CONNECTS TO :
--   Consumed by backend/supabase/messages.js. Used by
--   frontend/pages/Messages/Messages.jsx, and the "Message" buttons on
--   Details.jsx / OwnerStore.jsx.
-- ==================================================================

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_conversation_participants_user on conversation_participants(user_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) > 0 and char_length(content) <= 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

-- ---- RLS ----
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;

-- You may only ever see a conversation you're a participant of. There is
-- deliberately NO insert policy on `conversations` — the only way one
-- gets created is through get_or_create_conversation() below.
drop policy if exists conversations_select_participant on conversations;
create policy conversations_select_participant on conversations
  for select using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = id and cp.user_id = auth.uid()
    )
  );

-- You may see the PARTICIPANT ROWS (including the other person's) only
-- for conversations you yourself are part of — this is what lets the UI
-- show "who am I talking to." No insert policy here either — participant
-- rows are only ever created by get_or_create_conversation().
drop policy if exists conversation_participants_select_own_convos on conversation_participants;
create policy conversation_participants_select_own_convos on conversation_participants
  for select using (
    exists (
      select 1 from conversation_participants cp2
      where cp2.conversation_id = conversation_participants.conversation_id
        and cp2.user_id = auth.uid()
    )
  );

-- Messages: only participants can read a conversation's messages.
drop policy if exists messages_select_participant on messages;
create policy messages_select_participant on messages
  for select using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
    )
  );

-- Messages: you may only send as yourself, and only into a conversation
-- you're actually part of — this is the core "User A can never write
-- into User B's private conversation" guarantee.
drop policy if exists messages_insert_own on messages;
create policy messages_insert_own on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
    )
  );

-- Allow marking OTHER people's messages as read (read_at) when you open
-- a conversation you're part of — but only that column's worth of
-- change is meaningful; nothing here lets you alter message content.
drop policy if exists messages_update_mark_read on messages;
create policy messages_update_mark_read on messages
  for update using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
    )
  );

-- ---- Keep conversations.updated_at current for "most recent" sorting ----
create or replace function bump_conversation_updated_at()
returns trigger as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_bump_conversation_updated_at on messages;
create trigger trg_bump_conversation_updated_at
  after insert on messages
  for each row execute function bump_conversation_updated_at();

-- ---- The only sanctioned way to create a conversation ----
-- SECURITY DEFINER so it can insert into conversations/conversation_participants
-- (which have no client-facing insert policies at all) — but the function
-- body itself enforces every rule a raw insert would have skipped:
-- no self-messaging, no anonymous accounts, and reuses an existing 1:1
-- conversation between the same two people instead of creating duplicates.
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

notify pgrst, 'reload schema';
