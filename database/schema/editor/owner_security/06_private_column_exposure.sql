-- OWNER ONLY. READ-ONLY. Can an ordinary signed-in user (or an anonymous guest session)
-- read private columns of OTHER people's rows in `users`?
-- The users_select_all policy lets any signed-in session read every row, so the only
-- thing protecting email / phone / role is column privileges.
-- Any private column showing signed_in_can_read = true is exposed. Expected: only the
-- public ones (id, name, avatar_url, username, bio, city, last_active_at, shop_name).
select c.column_name,
       has_column_privilege('anon',          'public.users', c.column_name, 'select') as anon_can_read,
       has_column_privilege('authenticated', 'public.users', c.column_name, 'select') as signed_in_can_read
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'users'
order by signed_in_can_read desc, anon_can_read desc, c.column_name;
