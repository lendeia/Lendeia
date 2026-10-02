-- OWNER ONLY. READ-ONLY. Who has admin/owner access, and with which permissions.
select id, email, name, role, permissions, account_status, last_active_at
from users
where role in ('admin', 'owner')
order by role, email;
