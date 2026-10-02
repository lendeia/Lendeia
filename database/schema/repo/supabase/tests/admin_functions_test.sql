-- ==================================================================
-- TEST : admin layer (20261003000000, 20261003000100, 20261003000200)
-- RUN  : on LOCAL or STAGING only, never on the live project:
--          psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_functions_test.sql
-- It seeds fake users, runs every rule, prints ALL TESTS PASSED, then ROLLS BACK
-- (nothing is kept). Any failure stops with "TEST FAIL: ...".
-- ==================================================================
begin;

-- users.id references auth.users(id), so create the auth rows first
insert into auth.users (id, email)
select id, email from (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid,'owner@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000a2','mod@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000a3','sup@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000a4','fin@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000b1','alice@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000b2','bob@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000b3','carol@test.lendeia')) v(id, email);

-- seed app rows without firing triggers
set local session_replication_role = replica;
insert into users (id, name, email, role, permissions) values
  ('00000000-0000-0000-0000-0000000000a1','Owner',   'owner@test.lendeia',   'owner','{}'),
  ('00000000-0000-0000-0000-0000000000a2','ModAdmin','mod@test.lendeia',     'admin','{moderation}'),
  ('00000000-0000-0000-0000-0000000000a3','SupAdmin','sup@test.lendeia',     'admin','{support}'),
  ('00000000-0000-0000-0000-0000000000a4','FinAdmin','fin@test.lendeia',     'admin','{finance}'),
  ('00000000-0000-0000-0000-0000000000b1','Alice',   'alice@test.lendeia',   'user', '{}'),
  ('00000000-0000-0000-0000-0000000000b2','Bob',     'bob@test.lendeia',     'user', '{}'),
  ('00000000-0000-0000-0000-0000000000b3','Carol',   'carol@test.lendeia',   'user', '{}');
update users set account_status = 'pending_deletion', scheduled_deletion_at = now() + interval '20 days'
  where id = '00000000-0000-0000-0000-0000000000b3';
insert into listings (id, owner_id, name, category, price_per_day, location, description, photo_urls, condition) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','Test drill','Tools',100,'Cebu City',
   'A perfectly good drill for testing the admin layer', array['a','b','c'], 'Good');
insert into support_requests (id, user_id, category, message) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b2','general_support','help me');
insert into reviews (id, rental_id, reviewer_id, reviewed_user_id, rating, reviewer_role) values
  ('00000000-0000-0000-0000-0000000000e1', gen_random_uuid(),
   '00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b1', 1, 'renter');
insert into review_reports (id, review_id, reporter_id, reason) values
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','unfair');
insert into payments (user_id, plan_id, amount, status, paid_at) values
  ('00000000-0000-0000-0000-0000000000b1','standard',199,'paid',now());
set local session_replication_role = origin;

-- helpers (live only inside this transaction)
create function t_as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text,''), true),
         set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u)::text end, true) $$;
create function t_fails(q text, expect text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if position(expect in sqlerrm) > 0 then return; end if;
    raise exception 'TEST FAIL: [%] failed with the wrong message: %', q, sqlerrm;
  end;
  raise exception 'TEST FAIL: [%] should have failed with "%" but succeeded', q, expect;
end $$;

-- ids
create function t_id(n text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || n)::uuid $$;

-- 1. who may execute what
do $$ begin
  assert not has_function_privilege('anon',          'admin_account_action(uuid,text,text,integer,uuid)','execute'), 'anon can run account_action';
  assert not has_function_privilege('anon',          'admin_set_role(uuid,text,text[])','execute'),                 'anon can run set_role';
  assert not has_function_privilege('anon',          'admin_recent_payments(integer)','execute'),                   'anon can read payments';
  assert     has_function_privilege('authenticated', 'admin_account_action(uuid,text,text,integer,uuid)','execute'), 'authenticated cannot call account_action';
  assert not has_function_privilege('authenticated', 'admin_require(text)','execute'),                              'authenticated can call the internal gate';
  assert not has_function_privilege('anon',          'admin_require(text)','execute'),                              'anon can call the internal gate';
  assert not has_function_privilege('anon', 'admin_find_user(text)','execute'), 'anon can search users';
  assert not has_function_privilege('anon', 'admin_list_review_reports(text)','execute'), 'anon can list reports';
end $$;

-- 2. not signed in / ordinary user
select t_as(null);
select t_fails($$select admin_account_action(t_id('b2'),'ban','x')$$, 'Not signed in');
select t_as(t_id('b1'));
select t_fails($$select admin_account_action(t_id('b2'),'ban','x')$$, 'Permission denied');
select t_fails($$select admin_dashboard_counts()$$,                  'Permission denied');
select t_fails($$select admin_set_role(t_id('b2'),'admin')$$,         'Owner only');

-- 3. support-only admin
select t_as(t_id('a3'));
select t_fails($$select admin_account_action(t_id('b2'),'ban','x')$$, 'Permission denied');
select t_fails($$select * from admin_recent_payments()$$,            'Permission denied');
do $$ declare r support_requests; begin
  r := admin_set_support_status(t_id('d1'), 'in_progress');
  assert r.status = 'in_progress', 'support status not changed';
  assert (select count(*) from admin_audit_log where actor_id = t_id('a3') and action = 'support_status') = 1, 'support change not logged';
  assert (admin_dashboard_counts() ->> 'open_support_requests')::int = 1, 'dashboard count wrong';
end $$;
select t_fails($$select admin_set_support_status(t_id('d1'),'bogus')$$, 'Unknown status');
select t_fails($$select admin_resolve_review_report(t_id('f1'),'resolved')$$, 'Permission denied');

-- 4. moderation admin
select t_as(t_id('a2'));
do $$ declare r admin_actions; begin
  r := admin_account_action(t_id('b2'), 'ban', 'spam listings');
  assert r.admin_id = t_id('a2'), 'log has wrong actor';
  assert (select account_status from users where id = t_id('b2')) = 'banned', 'bob not banned';
  assert (select status_reason from users where id = t_id('b2')) = 'spam listings', 'reason not stored';
  r := admin_account_action(t_id('b2'), 'unban', 'appeal accepted');
  assert (select account_status from users where id = t_id('b2')) = 'active', 'bob not unbanned';
  assert (select status_reason from users where id = t_id('b2')) is null, 'reason not cleared';
  r := admin_account_action(t_id('b1'), 'suspend', 'cooling off', 7);
  assert r.suspended_until > now() + interval '6 days 23 hours', 'suspension length wrong';
  r := admin_account_action(t_id('b1'), 'unsuspend', 'done');
  r := admin_account_action(t_id('b2'), 'warn', 'be nice');
  assert (select account_status from users where id = t_id('b2')) = 'active', 'warn changed status';
  assert (select count(*) from admin_actions where admin_id = t_id('a2')) = 5, 'log count wrong';
end $$;
select t_fails($$select admin_account_action(t_id('b2'),'ban','')$$,              'reason is required');
select t_fails($$select admin_account_action(t_id('b2'),'explode','x')$$,         'Unknown action');
select t_fails($$select admin_account_action(t_id('b2'),'suspend','x')$$,         '1 to 365 days');
select t_fails($$select admin_account_action(t_id('b2'),'suspend','x',0)$$,       '1 to 365 days');
select t_fails($$select admin_account_action(t_id('b2'),'suspend','x',999)$$,     '1 to 365 days');
select t_fails($$select admin_account_action(t_id('a2'),'ban','x')$$,             'yourself');
select t_fails($$select admin_account_action(t_id('a1'),'ban','x')$$,             'owner cannot be actioned');
select t_fails($$select admin_account_action(t_id('a3'),'ban','x')$$,             'Only an owner can act on an admin');
select t_fails($$select admin_account_action(gen_random_uuid(),'ban','x')$$,      'User not found');
select t_fails($$select admin_account_action(t_id('b3'),'ban','x')$$,             'pending deletion');
select admin_account_action(t_id('b3'), 'warn', 'ok to warn pending deletion');
do $$ declare r review_reports; begin
  r := admin_resolve_review_report(t_id('f1'), 'dismissed');
  assert r.status = 'dismissed', 'report not dismissed';
end $$;
select t_fails($$select admin_resolve_review_report(t_id('f1'),'resolved')$$,     'already handled');
select t_fails($$select admin_set_role(t_id('b2'),'admin')$$,                     'Owner only');
select t_fails($$select admin_remove_listing(t_id('c1'),'bad')$$,                 'Owner only');
select t_fails($$select * from admin_recent_payments()$$,                          'Permission denied');

-- 5. owner can act on an admin; a suspended admin is locked out until restored
select t_as(t_id('a1'));
select admin_account_action(t_id('a2'), 'suspend', 'testing lockout', 3);
select t_as(t_id('a2'));
select t_fails($$select admin_account_action(t_id('b2'),'warn','x')$$, 'Account not allowed');
select t_as(t_id('a1'));
select admin_account_action(t_id('a2'), 'unsuspend', 'back to work');
select t_as(t_id('a2'));
select admin_account_action(t_id('b2'), 'warn', 'works again');

-- 6. owner-only functions
select t_as(t_id('a1'));
select t_fails($$select admin_set_role(t_id('a1'),'user')$$,                       'your own role');
select t_fails($$select admin_set_role(t_id('b2'),'superuser')$$,                  'Unknown role');
select t_fails($$select admin_set_role(t_id('b2'),'admin','{finance,hacking}')$$,  'Unknown permission');
do $$ declare j jsonb; begin
  j := admin_set_role(t_id('b2'), 'admin', '{finance}');
  assert (select role from users where id = t_id('b2')) = 'admin', 'bob not admin';
  assert (select permissions from users where id = t_id('b2')) = '{finance}', 'permissions not set';
  assert (select count(*) from admin_audit_log where action = 'set_role') = 1, 'set_role not logged';
  -- demoting clears permissions
  j := admin_set_role(t_id('b2'), 'user', '{finance}');
  assert (select permissions from users where id = t_id('b2')) = '{}', 'permissions not cleared on demote';
  j := admin_set_role(t_id('b2'), 'admin', '{finance}');
end $$;

-- 7. finance
select t_as(t_id('b2'));
do $$ begin assert (select count(*) from admin_recent_payments(10)) = 1, 'finance admin cannot see payments'; end $$;
select t_fails($$select admin_account_action(t_id('b1'),'ban','x')$$, 'Permission denied');
select t_as(t_id('a1'));
do $$ begin assert (select count(*) from admin_recent_payments(10)) = 1, 'owner cannot see payments'; end $$;

-- 8. listing removal
do $$ declare j jsonb; begin
  j := admin_remove_listing(t_id('c1'), 'fake item');
  assert not exists (select 1 from listings where id = t_id('c1')), 'listing still exists';
  assert (select removed_listing_name from admin_actions where action = 'remove_listing') = 'Test drill', 'removal not logged';
end $$;
select t_fails($$select admin_remove_listing(t_id('c1'),'again')$$, 'Listing not found');

-- 8b. read functions for the admin page
select t_as(t_id('b1'));
select t_fails($$select * from admin_find_user('alice')$$,           'Permission denied');
select t_fails($$select * from admin_list_review_reports()$$,        'Permission denied');
select t_as(t_id('a3'));   -- support-only admin: no moderation scope
select t_fails($$select * from admin_find_user('alice')$$,           'Permission denied');
select t_as(t_id('a2'));   -- moderation admin
do $$ begin
  assert (select count(*) from admin_find_user('ALICE@test')) = 1,          'find_user by email failed';
  assert (select count(*) from admin_find_user('test.lendeia')) >= 6,       'find_user by domain failed';
  assert (select count(*) from admin_find_user('100%')) = 0,                'wildcard was not escaped';
  assert (select count(*) from admin_list_review_reports('dismissed')) = 1, 'review report list wrong';
  assert (select count(*) from admin_list_review_reports(null)) = 1,        'review report list (all) wrong';
  assert (select count(*) from admin_list_message_reports()) = 0,           'message report list wrong';
end $$;
select t_fails($$select * from admin_find_user('al')$$,              'at least 3 characters');

-- 9. audit log visibility and tamper-proofing (as the real app role)
select t_as(t_id('a1'));
set local role authenticated;
do $$ begin assert (select count(*) from admin_audit_log) >= 3, 'owner cannot read the audit log'; end $$;
reset role;
select t_as(t_id('a2'));
set local role authenticated;
do $$ begin assert (select count(*) from admin_audit_log) = 0, 'an admin can read the audit log'; end $$;
select t_fails($$insert into admin_audit_log (actor_id, action) values (t_id('a2'),'forged')$$, 'row-level security');
reset role;
-- even the OWNER (who can read the log) cannot edit or delete it from the app
select t_as(t_id('a1'));
set local role authenticated;
do $$ declare n int; begin
  update admin_audit_log set action = 'tampered';
  get diagnostics n = row_count;
  assert n = 0, 'owner could edit the audit log';
  delete from admin_audit_log;
  get diagnostics n = row_count;
  assert n = 0, 'owner could delete from the audit log';
end $$;
reset role;
select t_as(null);
set local role anon;
select t_fails($$select * from admin_audit_log$$, 'permission denied');
select t_fails($$select admin_dashboard_counts()$$, 'permission denied');
reset role;

select 'ALL TESTS PASSED' as result;
rollback;
