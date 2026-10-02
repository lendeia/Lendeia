-- READ-ONLY. Open support requests / reports, most urgent categories first.
select sr.id, sr.created_at, sr.category, sr.status,
       u.email  as from_email, u.username as from_username,
       sr.message,
       l.name   as listing,
       ru.email as reported_user_email,
       cardinality(sr.attachment_paths) as photos
from support_requests sr
join users u        on u.id  = sr.user_id
left join listings l on l.id = sr.listing_id
left join users ru   on ru.id = sr.reported_user_id
where sr.status <> 'resolved'
order by case sr.category
           when 'trust_safety'     then 0
           when 'report_user'      then 1
           when 'report_listing'   then 1
           when 'account_security' then 2
           else 3 end,
         sr.created_at;
