// ==================================================================
// FILE TYPE : SUPABASE BACKEND — LISTINGS (real, replaces the mock)
// PURPOSE   :
//   Real CRUD against the `listings` table (database/schema/listings.sql
//   + stricter_listing_rules.sql), replacing backend/listings/*.js mocks.
//   Every function here maps Supabase's row shape to the exact object
//   shape shared/types/index.js's `Listing` typedef describes and that
//   every existing page component (Home, Browse, Map, Details, Dashboard)
//   already expects — so no page component needed to change to consume
//   real data. Only state/listings/listingsStore.jsx changes, to call
//   these functions instead of the mocks.
// CONNECTS TO :
//   Uses backend/supabase/client.js. RLS/CHECK rules that actually govern
//   what these calls are allowed to do live in database/policies/listings.sql
//   and database/schema/stricter_listing_rules.sql — this file relies on
//   those, it does not re-implement them.
// ==================================================================
import { getSupabaseClient } from "./client";

/**
 * @typedef {import('../../shared/types').Listing} Listing
 */

/**
 * Maps a raw `listings` row (+ optionally joined `users` row for the
 * owner's display name/photo) to the frontend's Listing shape.
 * @returns {Listing & { ownerId: string, isActive: boolean, photos: string[] }}
 */
function mapListingRow(row) {
  const photos =
    row.photo_urls && row.photo_urls.length
      ? row.photo_urls
      : row.primary_image_url
      ? [row.primary_image_url]
      : [];

  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    brand: row.brand || "",
    model: row.model || "",
    price: Number(row.price_per_day),
    // Real distance-from-viewer requires the viewer's own coordinates,
    // which nothing in the app currently captures (Map/ListEquipment only
    // capture the LISTING's coordinates). Kept at 0 rather than a
    // fabricated number — see MapPage.jsx / Browse.jsx distance filters,
    // which will simply not discriminate on distance until this is wired
    // to a real "distance from me" calculation.
    distance: 0,
    area: row.location,
    location: row.location,
    category: row.category,
    img: photos[0] || "",
    photos,
    // Real ratings require the reviews system (not built yet — see
    // CODEBASE_NOTES / the marketplace spec's Phase 5). 0 here is
    // honest-but-empty, not a fabricated number.
    rating: 0,
    reviews: 0,
    // Was previously defaulted to a fabricated "Available now" whenever
    // an owner left this blank — now genuinely empty/null when unset, so
    // display code can just not show the line rather than show fake text.
    available: row.availability_note || "",
    owner: row.users?.name || "Guest",
    ownerImg: row.users?.avatar_url || "",
    condition: row.condition,
    desc: row.description || "",
    lat: row.latitude,
    lng: row.longitude,
    isActive: row.is_active,
    plan: row.plan,
    planName: row.plan === "featured" ? "Pro" : row.plan === "standard" ? "Standard" : "Free",
    expirationDate: row.plan_expires_at,
    // Non-null exactly while this listing is delisted because it's out
    // on an Accepted rental (see database/schema/listing_lifecycle.sql)
    // — distinguishes "currently rented, don't touch" from "completed/
    // expired, ready to relist" for an inactive listing, both of which
    // just look like `isActive: false` otherwise.
    isPaused: row.paused_remaining != null,
    // View analytics (recordView in listingsStore.jsx) are still
    // client-side/in-memory only — persisting real view events to
    // Supabase is a follow-up piece, not done here.
    viewCount: 0,
    viewHistory: [],
  };
}

/**
 * All currently-active listings, newest first. Public — no auth required
 * beyond the RLS policy `listings_select_active` (see
 * database/policies/listings.sql), which already allows anyone to read
 * active listings.
 * @returns {Promise<Listing[]>}
 */
export async function getActiveListings() {
  const supabase = getSupabaseClient();
  // The `!listings_owner_id_fkey` hint explicitly tells PostgREST which
  // foreign key to embed `users` through. Without it, Supabase can throw
  // "Could not embed because more than one relationship was found" if its
  // schema-relationship cache is stale or ambiguous — being explicit here
  // avoids depending on auto-detection at all. (See
  // CODEBASE_NOTES.md/chat history for the NOTIFY pgrst, 'reload schema'
  // fix needed once, after constraints changed.)
  const { data, error } = await supabase
    .from("listings")
    .select("*, users!listings_owner_id_fkey(name, avatar_url)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapListingRow);
}

/**
 * Creates a new listing owned by `ownerId`. All the stricter-rule CHECK
 * constraints in database/schema/stricter_listing_rules.sql (min 3 photos,
 * description length, category whitelist, per-plan photo/listing caps,
 * duplicate-listing guard) apply here automatically — a violation throws
 * a Postgres error with a human-readable `message`, which the UI
 * (ListEquipment.jsx's submitError state) already displays as-is.
 * @param {string} ownerId - the authenticated user's id (auth.uid())
 * @param {object} input - same shape ListEquipment.jsx already builds
 * @returns {Promise<Listing>}
 */
export async function createListing(ownerId, input) {
  const supabase = getSupabaseClient();
  const photos = Array.isArray(input.photos) && input.photos.length ? input.photos : input.img ? [input.img] : [];

  const { data, error } = await supabase
    .from("listings")
    .insert({
      owner_id: ownerId,
      name: input.name,
      brand: input.brand || null,
      model: input.model || null,
      category: input.category,
      price_per_day: Number(input.price),
      condition: input.condition || "Good",
      description: input.desc ?? input.description ?? "",
      location: input.location,
      latitude: input.lat ?? null,
      longitude: input.lng ?? null,
      primary_image_url: photos[0] || null,
      photo_urls: photos,
      plan: input.plan || "free",
      plan_expires_at: input.expirationDate || null,
      availability_note: input.available || null,
    })
    .select("*, users!listings_owner_id_fkey(name, avatar_url)")
    .single();

  if (error) throw error;
  return mapListingRow(data);
}

/**
 * Updates a listing. RLS (`listings_update_own`) already guarantees this
 * silently affects 0 rows (and Supabase returns no row / a PGRST116
 * "no rows" error depending on client version) if the caller isn't the
 * owner — this function does not need its own ownership check on top of
 * that, but callers should still treat a thrown error as "not allowed."
 * @param {string} id
 * @param {object} patch - subset of { name, price, desc, available }
 * @returns {Promise<Listing>}
 */
export async function updateListing(id, patch) {
  const supabase = getSupabaseClient();
  const update = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.brand !== undefined) update.brand = patch.brand;
  if (patch.model !== undefined) update.model = patch.model;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.price !== undefined) update.price_per_day = Number(patch.price);
  if (patch.condition !== undefined) update.condition = patch.condition;
  if (patch.desc !== undefined) update.description = patch.desc;
  if (patch.location !== undefined) update.location = patch.location;
  if (patch.lat !== undefined) update.latitude = patch.lat;
  if (patch.lng !== undefined) update.longitude = patch.lng;
  if (patch.available !== undefined) update.availability_note = patch.available;
  // Now real — Dashboard.jsx's EditListingModal collects the final
  // ordered array of photo URLs (existing ones kept + any newly
  // uploaded ones), and this just writes it. The first photo in the
  // array is always treated as the primary/cover image.
  if (patch.photos !== undefined) {
    if (!Array.isArray(patch.photos) || patch.photos.length < 3) {
      throw new Error("A listing needs at least 3 photos.");
    }
    update.photo_urls = patch.photos;
    update.primary_image_url = patch.photos[0];
  }

  const { data, error } = await supabase
    .from("listings")
    .update(update)
    .eq("id", id)
    .select("*, users!listings_owner_id_fkey(name, avatar_url)")
    .single();

  if (error) throw error;
  return mapListingRow(data);
}

/**
 * Deletes a listing. RLS (`listings_delete_own`) is the actual
 * enforcement — this will simply affect 0 rows if the caller doesn't own
 * it, rather than throwing, so the store should re-fetch/verify rather
 * than blindly trusting a delete "succeeded."
 * @param {string} id
 * @returns {Promise<{ id: string, deleted: true }>}
 */
export async function deleteListing(id) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("listings").delete().eq("id", id);
  if (error) throw error;
  return { id, deleted: true };
}

/**
 * ALL of a user's own listings, active AND inactive — distinct from
 * getActiveListings() (public, active-only). Needed because Dashboard's
 * "My Equipment" must still show a listing after it's auto-delisted on
 * rental completion (see database/schema/limits_delisting_notifications.sql),
 * which getActiveListings() would now hide. Relies on the
 * `listings_select_own_all` RLS policy added in that same migration —
 * without it, this would silently return only the active ones too.
 * @param {string} ownerId
 * @returns {Promise<Listing[]>}
 */
export async function getMyListings(ownerId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*, users!listings_owner_id_fkey(name, avatar_url)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapListingRow);
}

/**
 * "List Again" / "Renew" — always gives a FRESH full listing period
 * (the reward for completing a rental, or for renewing an expired
 * listing), never just resumes whatever time was left. Routed through
 * the relist_listing() RPC (see database/schema/listing_lifecycle.sql)
 * rather than a plain update, since that function atomically refuses to
 * relist an item that's currently mid-rental (paused, not actually
 * available) — a state this button should never be offered for, but
 * shouldn't succeed even if it somehow were.
 * @param {string} id
 * @param {number} days - the FRESH period length, from the listing's
 *   own plan (see frontend/components/PlanCard.jsx's PLANS.days) —
 *   trusted the same way plan.days already is at creation time
 *   elsewhere in this app, not a new trust boundary.
 * @returns {Promise<Listing>}
 */
export async function relistListing(id, days) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("relist_listing", { p_listing_id: id, p_days: Number(days) });
  if (error) throw error;
  // The RPC returns the raw table row without the owner name/avatar
  // join mapListingRow expects — re-fetch the fully-mapped object
  // rather than trying to patch that join in from the RPC result.
  const refreshed = await getListingIfVisible(id);
  if (!refreshed) throw new Error("Relisted, but couldn't reload the listing — please refresh.");
  return refreshed;
}

/**
 * Looks up a single listing by id, for the Receipt page's "Visit item"
 * button — returns null (not an error) if the listing doesn't exist
 * anymore (deleted) OR if RLS doesn't currently allow this viewer to see
 * it, rather than throwing. Note this can legitimately return a listing
 * with isActive: false (e.g. the owner viewing their own delisted item,
 * or a renter viewing a listing they have a rental on — both covered by
 * database/schema/limits_delisting_notifications.sql and
 * fix_renter_listing_visibility.sql's RLS policies) — the caller decides
 * what "Visit item" should mean for an inactive listing.
 * @param {string} listingId
 * @returns {Promise<(Listing & { ownerId: string, isActive: boolean }) | null>}
 */
/**
 * A specific owner's FULL listing set — active AND inactive/delisted —
 * for anyone to view on that owner's public store page (see
 * database/schema/public_store_shows_delisted.sql for why this is a
 * deliberate exception to the usual "only the owner sees their own
 * inactive listings" rule). Distinct from getMyListings(), which relies
 * on RLS restricting results to the CALLER's own listings — this one
 * works for viewing anyone's store.
 * @param {string} ownerId
 * @returns {Promise<Listing[]>}
 */
export async function getOwnerAllListings(ownerId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_owner_all_listings", { p_owner_id: ownerId });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    model: row.model,
    category: row.category,
    price: Number(row.price_per_day),
    condition: row.condition,
    desc: row.description || "",
    location: row.location,
    area: row.location,
    lat: row.latitude,
    lng: row.longitude,
    img: row.primary_image_url || (row.photo_urls || [])[0] || "",
    photos: row.photo_urls || [],
    isActive: row.is_active,
    plan: row.plan,
    planName: row.plan === "featured" ? "Pro" : row.plan === "standard" ? "Standard" : "Free",
    expirationDate: row.plan_expires_at,
    createdAt: row.created_at,
  }));
}

export async function getListingIfVisible(listingId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*, users!listings_owner_id_fkey(name, avatar_url)")
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapListingRow(data) : null;
}

/**
 * Manually takes an ACTIVE listing off the marketplace — distinct from
 * the automatic delisting that happens when a rental is accepted (that
 * one pauses the remaining time; this one doesn't, since it's the
 * owner's own choice, not something to "restore" later). Relisting a
 * manually-delisted item later goes through the same relistListing()
 * flow as a completed/expired one, giving it a fresh listing period —
 * consistent, and simple, since there's no rental to resume.
 * @param {string} id
 * @returns {Promise<Listing>}
 */
export async function delistListingManually(id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("listings")
    .update({ is_active: false })
    .eq("id", id)
    .select("*, users!listings_owner_id_fkey(name, avatar_url)")
    .single();
  if (error) throw error;
  return mapListingRow(data);
}
