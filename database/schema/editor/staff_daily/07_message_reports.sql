-- READ-ONLY. Reported chat messages with sender and reporter.
select mr.id as report_id, mr.created_at, mr.reason,
       m.content, m.image_url, m.created_at as message_sent_at,
       s.email as sender_email, rp.email as reported_by
from message_reports mr
join messages m on m.id = mr.message_id
join users s    on s.id = m.sender_id
join users rp   on rp.id = mr.reporter_id
order by mr.created_at desc;
