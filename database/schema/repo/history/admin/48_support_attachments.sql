-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — photo attachments on reports/support
-- PURPOSE   :
--   Lets a person attach up to 5 photos (screenshots, pictures of a
--   damaged item, etc.) to any Help & Support request or report.
--   - New column support_requests.attachment_paths: storage PATHS, not
--     public URLs.
--   - New PRIVATE bucket `report-attachments`. Unlike listing/avatar
--     photos, report evidence can include private screenshots, so it is
--     NOT world-readable: only the person who submitted it and
--     admins/owners can open a file (via short-lived signed links).
--   - Images only, 8MB each, enforced by Storage itself.
--   Run once in the Supabase SQL editor, after help_support_requests.sql
--   and owner_role_and_admin_access.sql. Safe to run twice.
-- CONNECTS TO :
--   backend/supabase/support.js, backend/supabase/admin.js,
--   frontend/pages/Help/Help.jsx, frontend/pages/Admin/Admin.jsx.
-- ==================================================================

alter table support_requests
  add column if not exists attachment_paths text[] not null default '{}';

alter table support_requests drop constraint if exists support_requests_max_attachments;
alter table support_requests
  add constraint support_requests_max_attachments
  check (coalesce(array_length(attachment_paths, 1), 0) <= 5);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-attachments', 'report-attachments', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Upload only into your own folder (<your user id>/...).
drop policy if exists "report_attachments_insert_own" on storage.objects;
create policy "report_attachments_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'report-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read: your own files, or any file if you are an admin/owner.
drop policy if exists "report_attachments_select" on storage.objects;
create policy "report_attachments_select"
  on storage.objects for select
  using (
    bucket_id = 'report-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_admin_or_owner())
  );

notify pgrst, 'reload schema';
