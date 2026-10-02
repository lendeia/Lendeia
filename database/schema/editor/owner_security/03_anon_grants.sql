-- READ-ONLY. What can the logged-out (anon) role read? Should be public profile info only.
select table_name, column_name, privilege_type
from information_schema.column_privileges
where grantee = 'anon' and table_schema = 'public'
order by table_name, column_name;
