-- ==================================================================
-- TEST : migrations/20261003000500_country_and_public_phone.sql
-- RUN  : on LOCAL or STAGING only; rolls back, prints ALL TESTS PASSED.
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/country_phone_test.sql
-- ==================================================================
begin;

alter table listings enable row level security;   -- a scratch DB built from migrations alone lacks the policies' switch

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1','me@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000a2','shop@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000a3','nophone@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000a4','banned@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000a5','blocked@test.lendeia'),
  ('00000000-0000-0000-0000-0000000000a6','guest@test.lendeia');
set local session_replication_role = replica;
insert into users (id, name, email, phone, is_anonymous, account_status, country_code) values
  ('00000000-0000-0000-0000-0000000000a1','Me',     'me@test.lendeia',      '0900-111-0001', false,'active','PH'),
  ('00000000-0000-0000-0000-0000000000a2','Shop',   'shop@test.lendeia',    ' +1 310 555 0100 ', false,'active','US'),
  ('00000000-0000-0000-0000-0000000000a3','NoPhone','nophone@test.lendeia', null,            false,'active','JP'),
  ('00000000-0000-0000-0000-0000000000a4','Banned', 'banned@test.lendeia',  '0900-444-0004', false,'banned','PH'),
  ('00000000-0000-0000-0000-0000000000a5','Blocked','blocked@test.lendeia', '0900-555-0005', false,'active','PH'),
  ('00000000-0000-0000-0000-0000000000a6','Guest',  null,                   null,            true, 'active', null);
insert into blocked_users (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a5');
set local session_replication_role = origin;

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
create function t_id(n text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000000' || n)::uuid $$;

-- 1. country column + format
do $$ begin
  assert exists (select 1 from information_schema.columns where table_name='listings' and column_name='country_code'), 'listings.country_code missing';
  assert exists (select 1 from information_schema.columns where table_name='users'    and column_name='country_code'), 'users.country_code missing';
end $$;
select t_fails($$update users set country_code = 'Philippines' where id = t_id('a1')$$, 'users_country_code_format');
select t_fails($$update users set country_code = 'ph' where id = t_id('a1')$$,          'users_country_code_format');

-- 2. new listings need a country; old ones (null) stay editable
select t_fails($$insert into listings (owner_id, name, category, price_per_day, location, description, photo_urls, condition)
  values (t_id('a2'), 'No country drill', 'Tools', 100, 'Los Angeles, California', 'A drill listed without saying which country it is in', array['a','b','c'], 'Good')$$,
  'choose the country');
insert into listings (owner_id, name, category, price_per_day, location, country_code, description, photo_urls, condition)
  values (t_id('a2'), 'LA drill', 'Tools', 100, 'Los Angeles, California', 'US', 'A drill in Los Angeles, listed with its country', array['a','b','c'], 'Good');
select t_fails($$insert into listings (owner_id, name, category, price_per_day, location, country_code, description, photo_urls, condition)
  values (t_id('a2'), 'Bad code drill', 'Tools', 100, 'Somewhere', 'USA', 'A drill with an invalid country code format', array['a','b','c'], 'Good')$$,
  'listings_country_code_format');
set local session_replication_role = replica;      -- simulate a pre-existing listing with no country
insert into listings (owner_id, name, category, price_per_day, location, description, photo_urls, condition)
  values (t_id('a2'), 'Old drill', 'Tools', 100, 'Cebu City', 'An older listing created before countries existed', array['a','b','c'], 'Good');
set local session_replication_role = origin;
do $$ begin
  update listings set is_active = false where name = 'Old drill';       -- pausing/relisting must still work
  assert (select is_active from listings where name='Old drill') = false, 'old listing could not be updated';
  update listings set country_code = 'PH' where name = 'Old drill';
  assert (select country_code from listings where name='Old drill') = 'PH', 'could not add country to old listing';
end $$;

-- 3. get_owner_all_listings returns the country
select t_as(t_id('a1'));
do $$ begin
  assert (select country_code from get_owner_all_listings(t_id('a2')) where name='LA drill') = 'US', 'owner listings missing country';
end $$;

-- 4. phone matrix (get_user_phone)
select t_as(t_id('a1'));                                   -- real signed-in user
do $$ begin
  assert get_user_phone(t_id('a2')) = '+1 310 555 0100',  'real user cannot see a shop phone (or it was not trimmed)';
  assert get_user_phone(t_id('a3')) is null,              'user without a phone should give null';
  assert get_user_phone(t_id('a1')) = '0900-111-0001',    'cannot read own phone';
  assert get_user_phone(t_id('a4')) is null,              'banned user phone leaked';
  assert get_user_phone(t_id('a5')) is null,              'blocked user phone leaked';
  assert get_user_phone(gen_random_uuid()) is null,       'unknown id should give null';
  assert get_user_phone(null) is null,                    'null id should give null';
end $$;
select t_as(t_id('a5'));                                   -- the blocked person looking at the blocker
do $$ begin assert get_user_phone(t_id('a1')) is null, 'blocked user can see blocker phone'; end $$;
select t_as(t_id('a6'));                                   -- anonymous guest session
do $$ begin assert get_user_phone(t_id('a2')) is null, 'guest session can see a phone'; end $$;
select t_as(t_id('a4'));                                   -- banned caller
do $$ begin assert get_user_phone(t_id('a2')) is null, 'banned caller can see a phone'; end $$;
select t_as(null);                                         -- nobody signed in
do $$ begin assert get_user_phone(t_id('a2')) is null, 'signed-out caller can see a phone'; end $$;

-- 5. who may call it + phone column stays private
do $$ begin
  assert has_function_privilege('authenticated','get_user_phone(uuid)','execute'), 'authenticated cannot call get_user_phone';
  assert not has_function_privilege('anon','get_user_phone(uuid)','execute'),       'anon can call get_user_phone';
  assert has_column_privilege('authenticated','public.users','country_code','select'), 'country_code not readable';
end $$;

-- 6. as the real app role: phone still comes only through the function when the privacy fix is applied
select t_as(t_id('a1'));
set local role authenticated;
do $$ begin assert get_user_phone(t_id('a2')) = '+1 310 555 0100', 'function failed under the authenticated role'; end $$;
reset role;

select 'ALL TESTS PASSED' as result;
rollback;
