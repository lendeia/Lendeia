-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — read functions for the admin page (new)
-- RUN AFTER : 20261003000100_admin_functions.sql
-- PURPOSE   :
--   An admin page needs to SEE reports and look people up, but RLS only lets
--   people read their OWN reports (review_reports_select_own,
--   message_reports_select_own) — so as written no admin could ever read
--   the moderation queues from the app. These read-only functions fix that
--   without loosening any table policy. Scope 'moderation' = owner, or an
--   admin with the 'moderation' permission.
--   (Support requests need no function: support_requests_select_own already
--   lets admins read them.)
-- SAFE TO RE-RUN : yes.   ROLLBACK : supabase/rollback/admin_layer_rollback.sql
-- ==================================================================

create or replace function admin_list_review_reports(p_status text default 'pending')
returns table (
  report_id        uuid,
  created_at       timestamptz,
  status           text,
  reason           text,
  description      text,
  review_id        uuid,
  rating           smallint,
  comment          text,
  review_author_id uuid,
  reported_by      uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform admin_require('moderation');
  return query
    select rr.id, rr.created_at, rr.status, rr.reason, rr.description,
           r.id, r.rating::smallint, r.comment, r.reviewer_id, rr.reporter_id
    from review_reports rr
    join reviews r on r.id = rr.review_id
    where p_status is null or rr.status = p_status
    order by rr.created_at
    limit 200;
end;
$$;

create or replace function admin_list_message_reports(p_limit integer default 50)
returns table (
  report_id   uuid,
  created_at  timestamptz,
  reason      text,
  message_id  uuid,
  content     text,
  image_url   text,
  sent_at     timestamptz,
  sender_id   uuid,
  reported_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform admin_require('moderation');
  return query
    select mr.id, mr.created_at, mr.reason,
           m.id, m.content, m.image_url, m.created_at, m.sender_id, mr.reporter_id
    from message_reports mr
    join messages m on m.id = mr.message_id
    order by mr.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function admin_find_user(p_query text)
returns table (
  id              uuid,
  name            text,
  email           text,
  username        text,
  role            text,
  account_status  text,
  status_reason   text,
  suspended_until timestamptz,
  created_at      timestamptz,
  last_active_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_like text;
begin
  perform admin_require('moderation');
  if p_query is null or char_length(btrim(p_query)) < 3 then
    raise exception 'Type at least 3 characters' using errcode = '22023';
  end if;
  v_like := '%' || regexp_replace(btrim(p_query), '([\\%_])', '\\\1', 'g') || '%';
  return query
    select u.id, u.name, u.email, u.username, u.role, u.account_status,
           u.status_reason, u.suspended_until, u.created_at, u.last_active_at
    from users u
    where u.email    ilike v_like escape '\'
       or u.username ilike v_like escape '\'
       or u.name     ilike v_like escape '\'
    order by u.created_at desc
    limit 20;
end;
$$;

revoke all on function admin_list_review_reports(text)  from public, anon;
revoke all on function admin_list_message_reports(integer) from public, anon;
revoke all on function admin_find_user(text)            from public, anon;
grant execute on function admin_list_review_reports(text)  to authenticated;
grant execute on function admin_list_message_reports(integer) to authenticated;
grant execute on function admin_find_user(text)            to authenticated;

notify pgrst, 'reload schema';
