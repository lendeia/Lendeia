-- ==================================================================
-- FILE TYPE : SUPABASE MIGRATION — real storage file type/size limits
-- PURPOSE   :
--   All three photo buckets (avatars, listing-photos, message-photos)
--   were created with no file_size_limit and no allowed_mime_types —
--   meaning Supabase Storage would accept ANY file type or size up to
--   the project's own default. The `accept="image/*"` attribute on
--   file inputs throughout this app's UI is a convenience hint for
--   the OS file picker, not a security control — anyone can bypass it
--   entirely with a direct API call. This sets real limits enforced by
--   Storage itself: images only, capped at 8MB per file.
-- CONNECTS TO :
--   Applies to the buckets created in avatar_storage.sql,
--   listing_photos_storage.sql, and messaging_photos_block_report.sql.
-- ==================================================================

update storage.buckets
set file_size_limit = 8388608, -- 8MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id in ('avatars', 'listing-photos', 'message-photos');

notify pgrst, 'reload schema';
