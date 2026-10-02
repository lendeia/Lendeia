-- READ-ONLY. Every public table: is RLS on, and how many policies does it have?
-- Anything with rls_enabled = false, or rls_enabled = true and policies = 0, needs a look.
select t.tablename,
       t.rowsecurity       as rls_enabled,
       count(p.policyname) as policies
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
group by t.tablename, t.rowsecurity
order by t.rowsecurity, policies, t.tablename;
