// ==================================================================
// FILE TYPE : SUPABASE BACKEND — RENTALS (real, replaces the mock)
// PURPOSE   :
//   Real CRUD against the `rentals` table, replacing backend/rentals/*.js
//   mocks. Maps rows (with their joined `listings` row) to the shape
//   state/rentals/rentalsStore.jsx and every page consuming useRentals()
//   already expects.
//
//   SELF-RENTAL PREVENTION: createRental() below checks
//   `ownerId === renterId` and throws a friendly Error *before* ever
//   calling Supabase. This is a UX nicety, NOT the actual security
//   boundary — the real, unbypassable enforcement is in the database:
//   see database/schema/self_rental_and_fields.sql, which blocks it both
//   via the `rentals_insert_own` RLS policy AND an independent
//   `reject_self_rental` trigger. Even if this app-layer check were
//   deleted or buggy, the database still refuses the write.
//
//   REAL DATE-RANGE PRICING: createRental() now takes real
//   startDate/endDate from the caller (Details.jsx's date picker) —
//   previously this always inserted a placeholder 1-day window. The
//   database computes `total_price` (the full scheduled cost) from
//   whatever dates are actually sent, and — if the RENTER cancels an
//   already-Accepted, in-progress rental early — `adjusted_price` (a
//   real prorated cost based on days actually used). See
//   database/schema/rental_date_pricing.sql for the enforcement; this
//   file just sends the dates and reads back whatever the database
//   computed.
// CONNECTS TO :
//   Uses backend/supabase/client.js. Enforcement lives in
//   database/policies/rentals.sql, database/schema/self_rental_and_fields.sql,
//   and rental_date_pricing.sql — this file relies on those, it does not
//   re-implement them.
// ==================================================================
import { getSupabaseClient } from "./client";
import { getDeviceId } from "../../shared/deviceId";

/**
 * @typedef {import('../../shared/types').RentalRequest} RentalRequest
 */

const RENTAL_SELECT = "*, listings(name, owner_id, primary_image_url), users!rentals_renter_id_fkey(name)";

/**
 * @returns {RentalRequest & { itemId: string, renterId: string, ownerId: string|null }}
 */
function mapRentalRow(row) {
  const listing = row.listings || null;
  const days = row.start_date && row.end_date
    ? Math.max(1, Math.round((new Date(row.end_date) - new Date(row.start_date)) / 86400000))
    : 1;
  return {
    id: row.id,
    itemId: row.listing_id,
    ownerId: listing?.owner_id ?? null,
    // Prefer the permanent snapshot taken at the moment this rental was
    // created (item_name/item_image_url — see database/schema/
    // rental_item_snapshot.sql) over the live `listings` embed, which
    // can go stale or disappear entirely if the listing is later edited,
    // delisted, or deleted. Falls back to the live embed only for rows
    // created before this snapshot existed and that couldn't be
    // backfilled (the listing was already gone by then).
    item: row.item_name ?? listing?.name ?? "",
    itemImg: row.item_image_url ?? listing?.primary_image_url ?? null,
    renter: row.users?.name || "Guest",
    renterId: row.renter_id,
    startDate: row.start_date,
    endDate: row.end_date,
    days,
    dates:
      row.start_date && row.end_date
        ? `${row.start_date} → ${row.end_date}`
        : "Select dates",
    status: row.status,
    price: Number(row.price_per_day),
    // The full originally-scheduled cost (price_per_day × days),
    // computed by the database, never trusted from client input.
    totalPrice: row.total_price != null ? Number(row.total_price) : Number(row.price_per_day),
    // Only set when the renter cancelled an in-progress Accepted rental
    // early — a real prorated cost for days actually used. Null in
    // every other case (nothing to adjust).
    adjustedPrice: row.adjusted_price != null ? Number(row.adjusted_price) : null,
    // Whether EACH side has opted in to sharing their phone number for
    // this specific rental — see database/schema/
    // phone_sharing_and_presence.sql. The actual phone number itself is
    // never included here; it's only ever readable via the separate
    // getSharedPhone() RPC, which independently re-checks both flags
    // server-side regardless of what this object says.
    renterSharedPhone: !!row.renter_shared_phone,
    ownerSharedPhone: !!row.owner_shared_phone,
    // Real owner-confirmed handoff timestamp — see database/schema/
    // confirm_item_received.sql. Null until the owner actually confirms
    // the renter has the item; used by Dashboard.jsx to decide whether
    // the renter sees "Cancel" (not received yet) or "Return Item"
    // (confirmed in hand).
    receivedAt: row.received_at || null,
    // Was previously not exposed at all — Dashboard.jsx's Overview chart
    // needs a real timestamp to bucket rentals by day/week/month; the
    // formatted `dates` string above isn't usable for that.
    createdAt: row.created_at,
    // New — precisely when the owner marked this Completed, set only
    // once by the database trigger at the real moment it happened (see
    // database/schema/add_completed_at.sql). Null until then.
    completedAt: row.completed_at || null,
    // Real distinct "Returned" event, separate from Cancelled — see
    // database/schema/real_returned_status.sql.
    returnedAt: row.returned_at || null,
  };
}

/**
 * All rentals visible to the current user — RLS (`rentals_select_participant`)
 * already restricts this to rows where the caller is either the renter or
 * the listing's owner, so no extra `.eq(...)` filter is needed here: it
 * would be redundant with, not an addition to, what RLS already enforces.
 * @returns {Promise<RentalRequest[]>}
 */
export async function getMyRentals() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rentals")
    .select(RENTAL_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapRentalRow);
}

/**
 * Creates a rental request for a real date range. Throws a friendly
 * Error client-side if the renter is the listing's own owner, or if the
 * date range is obviously invalid — see the file header for why these
 * are UX niceties layered on top of (not a substitute for) real DB-level
 * enforcement (the `end_date > start_date` CHECK constraint, and the
 * self-rental trigger, both still apply regardless).
 * @param {{ listingId: string, ownerId: string, renterId: string, price: number, startDate: string, endDate: string }} params
 * @returns {Promise<RentalRequest>}
 */
export async function createRental({ listingId, ownerId, renterId, price, startDate, endDate }) {
  if (ownerId && renterId && ownerId === renterId) {
    throw new Error("You can't rent your own listing.");
  }
  if (!startDate || !endDate || new Date(endDate) <= new Date(startDate)) {
    throw new Error("Please choose a valid date range — the return date must be after the start date.");
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rentals")
    .insert({
      listing_id: listingId,
      renter_id: renterId,
      start_date: startDate,
      end_date: endDate,
      price_per_day: Number(price),
      status: "Pending",
      // See shared/deviceId.js + database/schema/device_wide_rental_cap.sql
      // — closes the "make another account" bypass of the active-
      // rental-request cap. null here just means the device-wide check
      // doesn't apply this time; the per-account cap still does.
      device_id: getDeviceId(),
    })
    .select(RENTAL_SELECT)
    .single();

  if (error) {
    // The database's own self-rental trigger/RLS (see
    // database/schema/self_rental_and_fields.sql) surfaces as a generic
    // Postgres error here if the app-layer check above were ever bypassed
    // — re-throw a clearer message for that specific case.
    if (error.message?.includes("cannot rent your own listing")) {
      throw new Error("You can't rent your own listing.");
    }
    // A blocked insert from rentals_insert_own (see database/schema/
    // block_rental_requests_on_delisted.sql) also surfaces as a generic
    // RLS-violation error — Details.jsx's own isActive checks should
    // normally prevent ever reaching this, but if they're ever bypassed
    // (e.g. a stale page), give a clear reason instead of a raw
    // Postgres error string.
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("This item is no longer available to request — it may have been delisted.");
    }
    throw error;
  }
  return mapRentalRow(data);
}

/**
 * Updates a rental's status (accept/decline/cancel/complete). WHICH
 * transitions are actually allowed (only the owner can accept/decline,
 * either party can cancel, only the owner can complete an Accepted
 * rental) is enforced by enforce_rental_status_transition — including
 * the early-cancellation price adjustment (see
 * database/schema/rental_date_pricing.sql) — not by this function.
 * @param {string} id
 * @param {"Accepted"|"Declined"|"Cancelled"|"Completed"} status
 * @returns {Promise<RentalRequest>}
 */
export async function setRentalStatus(id, status) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rentals")
    .update({ status })
    .eq("id", id)
    .select(RENTAL_SELECT)
    .single();
  if (error) throw error;
  return mapRentalRow(data);
}

/**
 * Real "trusted renter" verification status — a renter becomes verified
 * after 5 successfully COMPLETED rentals (as a renter, not as an owner).
 * This is also what backend/supabase/rentals.js's createRental() request
 * limit is really governed by server-side (see
 * database/schema/limits_delisting_notifications.sql's
 * enforce_renter_active_limit trigger) — this function just lets the UI
 * show the same real number and threshold, not a separate guess at it.
 * @param {string} userId
 * @returns {Promise<{ completedAsRenter: number, isVerified: boolean, cap: number, threshold: number }>}
 */
/**
 * Owner confirms the renter now physically has the item — the safest
 * available signal for "handoff actually happened," since it requires
 * action from the party giving up the item (see database/schema/
 * confirm_item_received.sql for why this isn't renter-controlled).
 * @param {string} rentalId
 */
export async function confirmItemReceived(rentalId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("confirm_item_received", { p_rental_id: rentalId });
  if (error) throw error;
  return { receivedAt: new Date().toISOString() };
}

export async function getRenterVerification(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("renter_completed_rentals_summary")
    .select("completed_as_renter")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const completedAsRenter = data ? Number(data.completed_as_renter) : 0;
  const threshold = 5;
  const isVerified = completedAsRenter >= threshold;
  return { completedAsRenter, isVerified, cap: isVerified ? 5 : 2, threshold };
}

/**
 * Toggles the CURRENT user's own consent to share their phone number
 * for one specific rental. Only takes effect once that rental is
 * Accepted/Completed — see database/schema/phone_sharing_and_presence.sql's
 * set_phone_shared(), which enforces that server-side regardless of
 * what this function is called with.
 * @param {string} rentalId
 * @param {boolean} share
 */
export async function sharePhoneForRental(rentalId, share) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("set_phone_shared", { p_rental_id: rentalId, p_share: share });
  if (error) throw error;
}

/**
 * The OTHER party's phone number for this rental — null unless BOTH
 * sides have opted in AND the rental is Accepted/Completed. Never
 * throws for "not shared yet"; that's just a null result, not an error.
 * @param {string} rentalId
 * @returns {Promise<string|null>}
 */
export async function getSharedPhone(rentalId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_shared_phone", { p_rental_id: rentalId });
  if (error) throw error;
  return data || null;
}

/**
 * Finds the most recent Accepted/Completed rental between the current
 * user and `otherUserId`, regardless of who was renter/owner in it —
 * used to decide whether Messages.jsx's phone-sharing UI should even
 * show for a given conversation (a conversation isn't tied to one
 * specific rental_id, so this picks the most relevant one). Returns
 * null if there's no such rental yet, which just means the phone-share
 * feature isn't available in that conversation.
 * @param {string} otherUserId
 */
export async function getRelevantRentalForContact(otherUserId) {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("rentals")
    .select(RENTAL_SELECT)
    .in("status", ["Accepted", "Completed", "Returned"])
    .order("created_at", { ascending: false });
  if (error) throw error;

  const match = (data || []).find((row) => {
    const renterId = row.renter_id;
    const ownerId = row.listings?.owner_id;
    return (
      (renterId === user.id && ownerId === otherUserId) ||
      (ownerId === user.id && renterId === otherUserId)
    );
  });
  return match ? mapRentalRow(match) : null;
}
