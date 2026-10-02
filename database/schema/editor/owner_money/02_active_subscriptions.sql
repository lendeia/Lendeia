-- READ-ONLY. Accounts currently on a paid plan.
select u.email, pr.plan, pr.plan_expires_at, pr.plan_expires_at - now() as time_left
from profiles pr
join users u on u.id = pr.user_id
where pr.plan <> 'free'
  and (pr.plan_expires_at is null or pr.plan_expires_at > now())
order by pr.plan_expires_at;
