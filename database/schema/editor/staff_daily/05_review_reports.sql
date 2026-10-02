-- READ-ONLY. Reviews that people reported.
select rr.id as report_id, rr.created_at, rr.status, rr.reason, rr.description,
       r.id as review_id, r.rating, r.comment,
       author.email   as review_author,
       reporter.email as reported_by
from review_reports rr
join reviews r        on r.id = rr.review_id
join users author     on author.id = r.reviewer_id
join users reporter   on reporter.id = rr.reporter_id
where rr.status = 'pending'
order by rr.created_at;
