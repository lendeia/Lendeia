-- READ-ONLY. Accounts in their 30-day deletion grace period.
select id, email, username, scheduled_deletion_at,
       scheduled_deletion_at - now() as time_left
from users
where account_status = 'pending_deletion'
order by scheduled_deletion_at;
