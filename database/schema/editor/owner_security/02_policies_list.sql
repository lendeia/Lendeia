-- READ-ONLY. All policies, to review who can do what.
select tablename, policyname, cmd, roles, qual as using_clause, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;
