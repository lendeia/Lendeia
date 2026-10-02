-- WRITES DATA. Restore an account that is waiting to be deleted.
update users
set account_status = 'active', scheduled_deletion_at = null
where email = 'PUT-EMAIL-HERE'          -- <-- change me
  and account_status = 'pending_deletion'
returning id, email, account_status;
