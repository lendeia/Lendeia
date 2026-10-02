-- READ-ONLY. Confirm the daily account-deletion job exists and is running.
select jobname, schedule, active from cron.job;
select jobid, status, start_time, return_message
from cron.job_run_details order by start_time desc limit 10;
