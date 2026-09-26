-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — fix recursive conversation_participants policy
-- PURPOSE   :
--   conversation_participants_select_own_convos (messaging.sql) checked
--   "am I a participant of this conversation" by querying
--   conversation_participants FROM WITHIN conversation_participants' own
--   policy — a self-referential subquery. Evaluating that subquery
--   re-triggers the same policy, which queries the table again, forever:
--   "infinite recursion detected in policy for relation
--   conversation_participants." Same root cause as the earlier
--   listings/rentals recursion (fix_renter_listing_visibility.sql) — the
--   fix is the same pattern: route the check through a SECURITY DEFINER
--   function, which evaluates outside the normal RLS chain instead of
--   re-entering it.
-- CONNECTS TO :
--   Replaces the recursive policy from database/schema/messaging.sql.
-- ==================================================================

create or replace function is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = p_conversation_id and cp.user_id = p_user_id
  );
$$;

drop policy if exists conversation_participants_select_own_convos on conversation_participants;
create policy conversation_participants_select_own_convos on conversation_participants
  for select using (is_conversation_participant(conversation_id, auth.uid()));

notify pgrst, 'reload schema';
