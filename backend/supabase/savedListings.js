// ==================================================================
// FILE TYPE : SUPABASE BACKEND — SAVED LISTINGS (real, new)
// PURPOSE   :
//   Real CRUD against `saved_listings` (database/policies/profiles.sql
//   — the table and its RLS have existed since early in this project,
//   just never actually wired up to any backend function or UI until
//   now). A simple bookmark/wishlist: tap ♡ on a listing, it's saved to
//   your account, tap ♥ to unsave.
// CONNECTS TO :
//   Used by frontend/components/ListingCard.jsx and Details.jsx (the
//   save button on every listing) and the new Saved page
//   (frontend/pages/Saved/Saved.jsx).
// ==================================================================
import { getSupabaseClient } from "./client";

/**
 * @param {string} listingId
 */
export async function saveListing(listingId) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { error } = await supabase.from("saved_listings").insert({ user_id: user.id, listing_id: listingId });
  if (error) {
    if (error.code === "23505") return; // already saved — fine, not an error
    throw error;
  }
}

/**
 * @param {string} listingId
 */
export async function unsaveListing(listingId) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("saved_listings")
    .delete()
    .eq("user_id", user.id)
    .eq("listing_id", listingId);
  if (error) throw error;
}

/**
 * Just the set of saved listing IDs — cheap to fetch once and use
 * everywhere a card needs to know "is this one saved?" (Browse/Home
 * grids), without fetching full listing data twice.
 * @param {string} userId
 * @returns {Promise<Set<string>>}
 */
export async function getMySavedListingIds(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("saved_listings")
    .select("listing_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data || []).map((r) => r.listing_id));
}

/**
 * Full listing objects for everything the user has saved — for the
 * dedicated Saved page. Only returns listings still actually visible
 * (RLS on `listings` still applies through the join — a saved listing
 * that's since been deleted just won't come back here).
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getMySavedListings(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("saved_listings")
    .select("created_at, listings(*, users!listings_owner_id_fkey(name, avatar_url))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  // Reuses the exact same row-mapping shape as backend/supabase/
  // listings.js's mapListingRow, duplicated here rather than imported
  // to avoid a circular import (listings.js has no reason to depend on
  // this file). Keep in sync if that mapping ever changes.
  return (data || [])
    .filter((row) => row.listings) // drop any saved-but-since-deleted listing
    .map((row) => {
      const l = row.listings;
      return {
        id: l.id,
        name: l.name,
        brand: l.brand,
        model: l.model,
        category: l.category,
        price: Number(l.price_per_day),
        condition: l.condition,
        desc: l.description || "",
        location: l.location,
        area: l.location,
        lat: l.latitude,
        lng: l.longitude,
        img: l.primary_image_url || (l.photo_urls || [])[0] || "",
        photos: l.photo_urls || [],
        isActive: l.is_active,
        ownerId: l.owner_id,
        owner: l.users?.name || "Guest",
        ownerImg: l.users?.avatar_url || "",
        savedAt: row.created_at,
      };
    });
}
