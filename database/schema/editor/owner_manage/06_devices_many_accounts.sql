-- READ-ONLY. Devices that created more than one account (abuse check).
select da.device_id, count(*) as accounts,
       array_agg(u.email order by da.first_seen_at) as emails,
       min(da.first_seen_at) as first_seen
from device_accounts da
join users u on u.id = da.user_id
group by da.device_id
having count(*) > 1
order by accounts desc, first_seen desc;
