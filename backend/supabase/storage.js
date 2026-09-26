// ==================================================================
// FILE TYPE : SUPABASE BACKEND — STORAGE (real file uploads)
// PURPOSE   :
//   Uploads real photo files to Supabase Storage and returns permanent
//   public URLs — covers two buckets: `listing-photos` (uploadListingPhotos)
//   and `avatars` (uploadAvatar). Both replace earlier code that used
//   `URL.createObjectURL(file)`, which produces a `blob:` URL that only
//   exists in the current browser tab's memory and breaks on refresh or
//   for any other viewer. These URLs are real, persistent, and
//   world-readable (each bucket's RLS allows public select) once uploaded.
// CONNECTS TO :
//   Uses backend/supabase/client.js. uploadListingPhotos() is called from
//   frontend/pages/ListEquipment/ListEquipment.jsx at publish time, right
//   before backend/supabase/listings.js's createListing(). uploadAvatar()
//   is called from frontend/pages/Profile/Profile.jsx's PersonalInfoModal.
//   Enforcement lives in database/schema/listing_photos_storage.sql and
//   avatar_storage.sql, not here.
// ==================================================================
import { getSupabaseClient } from "./client";

const BUCKET = "listing-photos";

/**
 * Uploads each file under `<ownerId>/<random-name>.<ext>` (the RLS policy
 * on storage.objects requires the first path segment to equal the
 * uploader's own auth.uid(), matching `ownerId` here) and returns their
 * public URLs in the same order as the input files.
 * @param {File[]} files
 * @param {string} ownerId - must be the CURRENT authenticated user's id;
 *   passing anyone else's id will simply be rejected by storage RLS.
 * @returns {Promise<string[]>}
 */
export async function uploadListingPhotos(files, ownerId) {
  const supabase = getSupabaseClient();
  const urls = [];

  for (const file of files) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      throw new Error(
        `Couldn't upload "${file.name}": ${uploadError.message}. ` +
          `No listing was published — try again.`
      );
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

const AVATAR_BUCKET = "avatars";

/**
 * Uploads a real profile photo to the `avatars` Supabase Storage bucket
 * (see database/schema/avatar_storage.sql) and returns its permanent
 * public URL. Replaces Profile.jsx's previous use of
 * `URL.createObjectURL(file)`, which produced a `blob:` URL that only
 * ever worked in the same browser tab that created it — saved anywhere
 * (the database), it showed broken/empty for everyone else and even for
 * the same person after a refresh.
 *
 * Always uploads to the SAME fixed path per user (`<userId>/avatar.<ext>`)
 * with `upsert: true`, so re-uploading a new photo replaces the old one
 * in storage rather than accumulating old, orphaned files forever.
 * @param {File} file
 * @param {string} userId - must be the CURRENT authenticated user's id;
 *   storage RLS rejects any other value.
 * @returns {Promise<string>} the new public URL
 */
export async function uploadAvatar(file, userId) {
  const supabase = getSupabaseClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    throw new Error(`Couldn't upload your photo: ${uploadError.message}`);
  }

  // Cache-bust: getPublicUrl() returns the same URL every time for the
  // same path, but browsers/CDNs may still cache the OLD image bytes at
  // that URL from before this upload — appending a changing query param
  // forces a fresh fetch instead of showing the previous photo.
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

const MESSAGE_PHOTO_BUCKET = "message-photos";

/**
 * Uploads a photo attached to a chat message. Same public-bucket-with-
 * unguessable-path convention as avatars/listing-photos — see this
 * file's header. Unlike the avatar upload, this does NOT reuse a fixed
 * path (each message photo is its own file, not something meant to
 * replace a previous one).
 * @param {File} file
 * @param {string} userId - must be the CURRENT authenticated user's id.
 * @returns {Promise<string>} the public URL
 */
export async function uploadMessagePhoto(file, userId) {
  const supabase = getSupabaseClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(MESSAGE_PHOTO_BUCKET)
    .upload(path, file, { cacheControl: "3600", contentType: file.type || undefined });

  if (uploadError) {
    throw new Error(`Couldn't send that photo: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(MESSAGE_PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
