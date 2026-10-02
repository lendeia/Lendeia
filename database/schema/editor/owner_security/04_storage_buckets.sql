-- READ-ONLY. Photo buckets: size and file-type limits should NOT be null.
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
