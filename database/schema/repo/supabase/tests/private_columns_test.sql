-- ==================================================================
-- TEST : proposed/20261003000400_protect_private_user_columns.sql
-- RUN  : on a database where that file has been applied (staging/local only). Rolls back; prints ALL TESTS PASSED.
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/private_columns_test.sql
-- ==================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f9','spy@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000f8','victim@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000f7','guest@test.lendeia');
set local session_replication_role = replica;
insert into users (id, name, email, phone, age, gender, role, is_anonymous, bio) values
  ('00000000-0000-0000-0000-0000000000f9','Spy',   'spy@test.lendeia',    '0900-000-0001', 30,'male','user', false, 'hello'),
  ('00000000-0000-0000-0000-0000000000f8','Victim','victim@test.lendeia', '0917-555-1234', 41,'female','user', false, 'victim bio'),
  ('00000000-0000-0000-0000-0000000000f7','Guest', null,                  null,            null,null,'user', true,  null);
update users set status_reason = 'private note' where id = '00000000-0000-0000-0000-0000000000f8';
set local session_replication_role = origin;

-- In your live project RLS on listings is on (its policies file wasn't in the zip). A scratch database built from
-- the migrations alone has the policies but not the switch, so turn it on here (rolled back at the end).
alter table listings enable row level security;

create function t_as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text,''), true),
         set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u)::text end, true) $$;
create function t_fails(q text, expect text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if position(expect in sqlerrm) > 0 then return; end if;
    raise exception 'TEST FAIL: [%] wrong message: %', q, sqlerrm;
  end;
  raise exception 'TEST FAIL: [%] should have failed with "%"', q, expect;
end $$;

-- 1. column privileges, straight from the catalog
do $$
declare c text;
begin
  foreach c in array array['email','phone','age','gender','role','permissions','status_reason','suspended_until',
                           'restricted_actions','scheduled_deletion_at','auth_provider'] loop
    assert not has_column_privilege('authenticated','public.users',c,'select'), 'authenticated can read private column '||c;
    assert not has_column_privilege('anon','public.users',c,'select'),          'anon can read private column '||c;
  end loop;
  foreach c in array array['id','name','avatar_url','username','bio','city','last_active_at','shop_name','created_at','is_anonymous','account_status'] loop
    assert has_column_privilege('authenticated','public.users',c,'select'), 'authenticated lost public column '||c;
  end loop;
end $$;

-- 2. a signed-in stranger
select t_as('00000000-0000-0000-0000-0000000000f9');
set local role authenticated;
select t_fails($$select email  from users where id = '00000000-0000-0000-0000-0000000000f8'$$, 'permission denied');
select t_fails($$select phone  from users where id = '00000000-0000-0000-0000-0000000000f8'$$, 'permission denied');
select t_fails($$select role   from users$$,                                                     'permission denied');
select t_fails($$select status_reason from users$$,                                              'permission denied');
select t_fails($$select * from users$$,                                                          'permission denied');
do $$ begin
  assert (select name from users where id = '00000000-0000-0000-0000-0000000000f8') = 'Victim', 'cannot read public name';
  assert (select bio  from users where id = '00000000-0000-0000-0000-0000000000f8') = 'victim bio', 'cannot read public bio';
  assert (select count(*) from users) = 3, 'rows are no longer visible at all';
end $$;

-- 3. own full profile through the function — and ONLY own
do $$ declare me users; begin
  me := get_my_profile();
  assert me.email = 'spy@test.lendeia' and me.phone = '0900-000-0001', 'get_my_profile did not return own private data';
  assert (select count(*) from get_my_profile()) = 1, 'get_my_profile returned more than one row';
end $$;

-- 4. the things the app must still be able to do
do $$ begin
  update users set bio = 'updated bio', last_active_at = now() where id = auth.uid();
  assert (select bio from users where id = auth.uid()) = 'updated bio', 'own update failed';
  insert into users (id, name, email) values ('00000000-0000-0000-0000-0000000000f9','Spy','spy@test.lendeia')
    on conflict (id) do update set name = excluded.name;     -- upsert pattern
  -- RLS policies that read users.is_anonymous / account_status must still evaluate for a signed-in user
  insert into listings (owner_id, name, category, price_per_day, location, description, photo_urls, condition)
    values (auth.uid(), 'Spy drill', 'Tools', 100, 'Cebu City', 'A listing created to test the policies still work', array['a','b','c'], 'Good');
  assert (select count(*) from listings where name = 'Spy drill') = 1, 'listing select policy broke';
end $$;
-- someone else's row cannot be changed
do $$ declare n int; begin
  update users set bio = 'hacked' where id = '00000000-0000-0000-0000-0000000000f8';
  get diagnostics n = row_count;  assert n = 0, 'could update someone else';
end $$;
reset role;

-- 5. an anonymous guest session: public columns only, still blocked from private, and cannot post a listing
select t_as('00000000-0000-0000-0000-0000000000f7');
set local role authenticated;
select t_fails($$select email from users$$, 'permission denied');
select t_fails($$insert into listings (owner_id, name, category, price_per_day, location, description, photo_urls, condition)
  values (auth.uid(), 'Guest drill', 'Tools', 100, 'Cebu', 'A listing a guest should not be able to create', array['a','b','c'], 'Good')$$, 'row-level security');
reset role;

-- 6. logged-out visitor
select t_as(null);
set local role anon;
select t_fails($$select email from users$$, 'permission denied');
select t_fails($$select * from get_my_profile()$$, 'permission denied');
do $$ begin assert (select count(*) from users) = 3, 'guest lost public profile access'; end $$;
reset role;

-- 7. admin layer still works (SECURITY DEFINER, unaffected)
select t_as('00000000-0000-0000-0000-0000000000f8');
set local session_replication_role = replica;
update users set role = 'admin', permissions = '{moderation}' where id = '00000000-0000-0000-0000-0000000000f8';
set local session_replication_role = origin;
set local role authenticated;
do $$ begin
  assert (select count(*) from admin_find_user('spy@test')) = 1, 'admin_find_user broke';
  assert (select email from admin_find_user('spy@test')) = 'spy@test.lendeia', 'admin cannot see email via function';
end $$;
reset role;

select 'ALL TESTS PASSED' as result;
rollback;
