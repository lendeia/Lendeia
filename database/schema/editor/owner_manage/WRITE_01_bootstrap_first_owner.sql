-- OWNER ONLY. WRITES DATA. Run ONCE, only if no owner exists yet.
-- Does nothing if an owner already exists.
update users
set role = 'owner'
where lower(email) = lower('PUT-YOUR-EMAIL-HERE')     -- <-- change me
  and not exists (select 1 from users where role = 'owner')
returning id, email, role;
