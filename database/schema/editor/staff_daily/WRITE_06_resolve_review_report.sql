-- WRITES DATA. status: 'resolved' (action taken) or 'dismissed' (no problem).
update review_reports
set status = 'dismissed'               -- <-- change me
where id = 'PUT-REPORT-UUID-HERE'      -- <-- change me
returning id, status;
