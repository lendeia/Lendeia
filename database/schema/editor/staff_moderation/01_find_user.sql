-- READ-ONLY. Look up a user by email, @username or name.
select id, name, email, username, shop_name, role, account_status, status_reason,
       suspended_until, restricted_actions, is_anonymous, created_at, last_active_at
from users
where email ilike '%PUT-SEARCH-HERE%'      -- <-- change me
   or username ilike '%PUT-SEARCH-HERE%'
   or name ilike '%PUT-SEARCH-HERE%'
order by created_at desc
limit 20;
