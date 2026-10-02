-- READ-ONLY. Rentals that look stuck.
select id, status, start_date, end_date, received_at, returned_at, created_at,
  case
    when status = 'Pending'  and created_at < now() - interval '3 days'            then 'pending 3+ days, owner never answered'
    when status = 'Accepted' and end_date < current_date and returned_at is null   then 'past end date, not returned'
    when status = 'Accepted' and start_date < current_date - 2 and received_at is null then 'started 2+ days ago, handoff not confirmed'
  end as problem
from rentals
where (status = 'Pending'  and created_at < now() - interval '3 days')
   or (status = 'Accepted' and end_date < current_date and returned_at is null)
   or (status = 'Accepted' and start_date < current_date - 2 and received_at is null)
order by created_at;
