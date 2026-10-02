-- STAFF (owner or admin). READ-ONLY. Quick health snapshot.
select 'real users' as metric, count(*)::text as value from users where not is_anonymous
union all select 'anonymous users',        count(*)::text from users where is_anonymous
union all select 'active listings',        count(*)::text from listings where is_active
union all select 'rentals ' || status,     count(*)::text from rentals group by status
union all select 'open support requests',  count(*)::text from support_requests where status <> 'resolved'
union all select 'pending review reports', count(*)::text from review_reports where status = 'pending'
union all select 'message reports',        count(*)::text from message_reports
union all select 'accounts ' || account_status, count(*)::text from users where account_status <> 'active' group by account_status
order by 1;
