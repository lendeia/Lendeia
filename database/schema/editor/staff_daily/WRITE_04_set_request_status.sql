-- WRITES DATA. Change status: 'open' | 'in_progress' | 'resolved'.
update support_requests
set status = 'in_progress'            -- <-- change me
where id = 'PUT-REQUEST-UUID-HERE'    -- <-- change me
returning id, category, status;
