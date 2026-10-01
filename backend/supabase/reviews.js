// ==================================================================
// FILE TYPE : SUPABASE BACKEND — REVIEWS (bidirectional, category-based)
// PURPOSE   :
//   Real CRUD for the two-way, multi-category review system (see
//   database/schema/two_way_category_reviews.sql): a renter can rate an
//   owner (Overall, Item matched listing, Communication, Reliability,
//   Rental experience) AND an owner can rate a renter (Overall,
//   Communication, Reliability, Returned item properly, Followed rental
//   agreement) — both for the SAME completed rental. Every legitimacy
//   rule (completed rental, correct participant, no self-review, one
//   review per rental PER SIDE, which category columns are real for a
//   given reviewer_role) is enforced by the database trigger, not here
//   — this file just calls Supabase and surfaces whatever error that
//   trigger raises as a plain, readable message.
// CONNECTS TO :
//   Uses backend/supabase/client.js. Called from
//   frontend/pages/Dashboard/Dashboard.jsx (leaving a review, both
//   directions) and frontend/pages/Store/OwnerStore.jsx + Details.jsx
//   (displaying ratings/reviews). Enforcement lives in
//   database/schema/reviews_and_ratings.sql +
//   two_way_category_reviews.sql, not here.
// ==================================================================
import { getSupabaseClient } from "./client";

function mapReviewRow(row) {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment || "",
    reviewerId: row.reviewer_id,
    reviewerName: row.users?.name || "Guest",
    reviewerAvatarUrl: row.users?.avatar_url || null,
    reviewerRole: row.reviewer_role, // 'renter' | 'owner' — decides which category labels to show
    // Only present when the query selected them (see SHOP_REVIEW_SELECT);
    // undefined elsewhere, which every existing caller ignores.
    listingId: row.listing_id ?? null,
    reviewedUserId: row.reviewed_user_id ?? null,
    createdAt: row.created_at,
    categories: {
      communication: row.communication_rating,
      reliability: row.reliability_rating,
      itemAccuracy: row.item_accuracy_rating,
      rentalExperience: row.rental_experience_rating,
      returnCondition: row.return_condition_rating,
      agreementFollowed: row.agreement_followed_rating,
    },
  };
}

const REVIEW_SELECT =
  "id, rating, comment, created_at, reviewer_id, reviewer_role, communication_rating, reliability_rating, item_accuracy_rating, rental_experience_rating, return_condition_rating, agreement_followed_rating, users!reviews_reviewer_id_fkey(name, avatar_url)";

const SHOP_REVIEW_SELECT = REVIEW_SELECT + ", listing_id, reviewed_user_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function avgOf(values) {
  const nums = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/**
 * Overall + per-category averages for a list of already-fetched reviews.
 * Pure function — no network. Returns avgRating 0 / reviewCount 0 /
 * categories null for an empty list (callers render that as "New").
 * @param {ReturnType<typeof mapReviewRow>[]} reviews
 */
export function summarizeReviews(reviews) {
  if (!reviews.length) return { avgRating: 0, reviewCount: 0, categories: null };
  const keys = ["communication", "reliability", "itemAccuracy", "rentalExperience", "returnCondition", "agreementFollowed"];
  const categories = {};
  for (const k of keys) categories[k] = avgOf(reviews.map((r) => r.categories?.[k]));
  return { avgRating: avgOf(reviews.map((r) => r.rating)) ?? 0, reviewCount: reviews.length, categories };
}

/**
 * Per-item rating map ({ [listingId]: { avgRating, reviewCount } }) from
 * already-fetched shop reviews — lets the store show a star rating on
 * each of its item cards without one request per item.
 */
export function summarizeByListing(reviews) {
  const groups = {};
  for (const r of reviews) {
    if (!r.listingId) continue;
    (groups[r.listingId] ||= []).push(r);
  }
  const out = {};
  for (const [id, list] of Object.entries(groups)) {
    out[id] = { avgRating: avgOf(list.map((r) => r.rating)) ?? 0, reviewCount: list.length };
  }
  return out;
}

/**
 * Everything a SHOP page should show, in one query: every review left
 * about any of this owner's items (active, delisted, or since-deleted),
 * so the shop always agrees with the item pages.
 *
 * A review belongs to the shop if EITHER it is tied to one of the
 * owner's listings (reviews.listing_id — what each item's own page
 * reads) OR it was written for the owner by a renter (reviewed_user_id).
 * Matching on both means a review can't be visible on an item page yet
 * missing from the shop (or the reverse), whichever column is populated.
 *
 * Reviews the person RECEIVED as a renter (written by an owner) are
 * returned separately so they never get blended into the shop's rating.
 * Legacy rows with no reviewer_role predate two-way reviews, when every
 * review was renter -> owner, so they count as shop reviews.
 * @param {string} ownerId
 * @param {string[]} listingIds - ids of ALL the owner's listings
 * @returns {Promise<{ shopReviews: object[], renterReviews: object[] }>}
 */
export async function getShopReviews(ownerId, listingIds = []) {
  if (!UUID_RE.test(String(ownerId))) throw new Error("This store link isn't valid.");
  const supabase = getSupabaseClient();
  const ids = [...new Set((listingIds || []).filter((id) => UUID_RE.test(String(id))))];

  let query = supabase.from("reviews").select(SHOP_REVIEW_SELECT).order("created_at", { ascending: false });
  query = ids.length
    ? query.or(`reviewed_user_id.eq.${ownerId},listing_id.in.(${ids.join(",")})`)
    : query.eq("reviewed_user_id", ownerId);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map(mapReviewRow);
  const idSet = new Set(ids);
  return {
    shopReviews: rows.filter((r) => r.reviewerRole !== "owner" && (r.reviewedUserId === ownerId || idSet.has(r.listingId))),
    renterReviews: rows.filter((r) => r.reviewerRole === "owner" && r.reviewedUserId === ownerId),
  };
}

/**
 * Rating of a SHOP (all reviews of its items) — same numbers the store
 * page shows, for places that only need the headline (e.g. the owner
 * card on an item's page). Unlike getOwnerRatingSummary, this does not
 * blend in reviews the owner received while renting from others.
 * @param {string} ownerId
 * @returns {Promise<{ avgRating: number, reviewCount: number }>}
 */
export async function getShopRatingSummary(ownerId) {
  const supabase = getSupabaseClient();
  let ids = [];
  try {
    const { data } = await supabase.rpc("get_owner_all_listings", { p_owner_id: ownerId });
    ids = (data || []).map((row) => row.id);
  } catch {
    ids = []; // falls back to matching on reviewed_user_id alone
  }
  const { shopReviews } = await getShopReviews(ownerId, ids);
  const { avgRating, reviewCount } = summarizeReviews(shopReviews);
  return { avgRating, reviewCount };
}

/**
 * Real aggregate rating for a user (blended across however they were
 * reviewed — as an owner, as a renter, or both), computed from actual
 * reviews — not a fabricated number. Returns { avgRating: 0,
 * reviewCount: 0 } for a user with no reviews yet; callers should
 * render that as "New" rather than "0 stars."
 * @param {string} userId
 * @returns {Promise<{ avgRating: number, reviewCount: number }>}
 */
export async function getOwnerRatingSummary(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("owner_rating_summary")
    .select("avg_rating, review_count")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    avgRating: data ? Number(data.avg_rating) : 0,
    reviewCount: data ? Number(data.review_count) : 0,
  };
}

/**
 * How many completed rentals a user has been part of (as renter or as
 * owner, combined) — the "show completed rental count alongside the
 * rating" trust signal. Real count, not fabricated.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getCompletedRentalsCount(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_completed_rentals_summary")
    .select("completed_count")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.completed_count) : 0;
}

/**
 * Per-category rating averages for a user (only the categories that
 * actually apply to reviews they've received will be non-null/non-zero
 * in practice — e.g. a pure renter will never have return_condition
 * ratings because nobody reviews a renter on that category).
 * @param {string} userId
 */
export async function getCategoryRatingSummary(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_category_rating_summary")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    communication: data.avg_communication,
    reliability: data.avg_reliability,
    itemAccuracy: data.avg_item_accuracy,
    rentalExperience: data.avg_rental_experience,
    returnCondition: data.avg_return_condition,
    agreementFollowed: data.avg_agreement_followed,
  };
}

/**
 * Convenience bundle for a public profile page: overall rating, review
 * count, completed rental count, and category averages, in one call.
 * @param {string} userId
 */
export async function getUserReputationSummary(userId) {
  const [overall, completedRentals, categories] = await Promise.all([
    getOwnerRatingSummary(userId),
    getCompletedRentalsCount(userId),
    getCategoryRatingSummary(userId),
  ]);
  return { ...overall, completedRentals, categories };
}

/**
 * All reviews received BY a given user (as owner or as renter,
 * whichever applies), newest first, with the reviewer's id/name/role
 * and category breakdown.
 * @param {string} userId
 */
export async function getReviewsForOwner(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_SELECT)
    .eq("reviewed_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapReviewRow);
}

/**
 * Real aggregate rating for a SPECIFIC LISTING (not the owner as a
 * whole) — computed from reviews left for rentals of that exact
 * listing_id. Returns { avgRating: 0, reviewCount: 0 } if it has no
 * reviews yet.
 * @param {string} listingId
 */
export async function getListingRatingSummary(listingId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("listing_rating_summary")
    .select("avg_rating, review_count")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) throw error;
  return {
    avgRating: data ? Number(data.avg_rating) : 0,
    reviewCount: data ? Number(data.review_count) : 0,
  };
}

/**
 * All reviews left for rentals of a SPECIFIC LISTING (renter -> owner
 * reviews only, since that's what a product page is about), newest
 * first. Public — anyone can see a listing's reviews without being
 * signed in or having rented it themselves, same as any online shopping
 * product page.
 * @param {string} listingId
 */
/**
 * All reviews left for rentals of a SPECIFIC LISTING (renter -> owner
 * reviews only, since that's what a product page is about), newest
 * first. Public — anyone can see a listing's reviews without being
 * signed in or having rented it themselves, same as any online shopping
 * product page.
 *
 * Filters directly on reviews.listing_id (set automatically by the
 * eligibility trigger) rather than joining through `rentals` — a join
 * through `rentals` silently drops rows for anyone who isn't that
 * specific rental's renter/owner, since `rentals` has participant-only
 * RLS even though `reviews` itself is public. That was the actual bug
 * behind a review showing on the reviewer's own profile (which queries
 * `reviews` directly, no join) but disappearing from the product's own
 * page for everyone else — see database/schema/
 * fix_listing_reviews_visibility.sql.
 * @param {string} listingId
 */
export async function getReviewsForListing(listingId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_SELECT)
    .eq("listing_id", listingId)
    .eq("reviewer_role", "renter")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapReviewRow);
}

/**
 * Real ratings for MULTIPLE listings in one query — used by the Map page
 * to show a rating on every visible pin without firing one request per
 * marker. Returns a map keyed by listing_id; a listing with no reviews
 * simply won't have an entry (callers should treat that as "no reviews
 * yet", not 0 stars).
 * @param {string[]} listingIds
 */
export async function getRatingsForListings(listingIds) {
  if (!listingIds.length) return {};
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("listing_rating_summary")
    .select("listing_id, avg_rating, review_count")
    .in("listing_id", listingIds);
  if (error) throw error;
  const map = {};
  for (const row of data || []) {
    map[row.listing_id] = { avgRating: Number(row.avg_rating), reviewCount: Number(row.review_count) };
  }
  return map;
}

/**
 * All reviews tied to one SPECIFIC rental (could be up to 2 — one from
 * each side, since both renter and owner can review the same
 * completed rental). Used by the Receipt page to show exactly what was
 * said about this one transaction, not a person's reviews in general.
 * @param {string} rentalId
 */
export async function getReviewsForRental(rentalId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_SELECT)
    .eq("rental_id", rentalId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapReviewRow);
}

/**
 * The set of rental ids the given user has already left a review for —
 * used to hide "Leave a review" once they've already done so for that
 * rental (the database's UNIQUE constraint on (rental_id, reviewer_id)
 * is the real enforcement; this is just so the UI doesn't invite a
 * doomed second attempt). Works the same regardless of whether the user
 * was the renter or the owner for that particular rental.
 * @param {string} reviewerId
 * @returns {Promise<Set<string>>}
 */
export async function getMyReviewedRentalIds(reviewerId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("rental_id")
    .eq("reviewer_id", reviewerId);
  if (error) throw error;
  return new Set((data || []).map((r) => r.rental_id));
}

/**
 * Submits a review — either direction. Which category fields are kept
 * is decided by the database trigger based on whether the reviewer
 * actually was the rental's renter or owner (client-provided category
 * values for the "wrong" side are silently nulled server-side, not
 * trusted). Throws with the trigger's own human-readable message if the
 * rental isn't eligible, the caller isn't a real participant, or this
 * side has already reviewed it.
 * @param {{
 *   rentalId: string, reviewerId: string, reviewedUserId: string,
 *   rating: number, comment?: string,
 *   communication?: number, reliability?: number,
 *   itemAccuracy?: number, rentalExperience?: number,
 *   returnCondition?: number, agreementFollowed?: number
 * }} params
 */
export async function createReview({
  rentalId,
  reviewerId,
  reviewedUserId,
  rating,
  comment,
  communication,
  reliability,
  itemAccuracy,
  rentalExperience,
  returnCondition,
  agreementFollowed,
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("reviews").insert({
    rental_id: rentalId,
    reviewer_id: reviewerId,
    reviewed_user_id: reviewedUserId,
    rating: Number(rating),
    comment: comment || null,
    communication_rating: communication ?? null,
    reliability_rating: reliability ?? null,
    item_accuracy_rating: itemAccuracy ?? null,
    rental_experience_rating: rentalExperience ?? null,
    return_condition_rating: returnCondition ?? null,
    agreement_followed_rating: agreementFollowed ?? null,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("You've already reviewed this rental.");
    }
    throw error;
  }
}

/**
 * Reports a review as inappropriate/fraudulent. This only RECORDS the
 * report — there is currently no admin/moderation view that reads or
 * acts on it (that needs a real admin-role system, not built yet; see
 * database/schema/two_way_category_reviews.sql's file header). Submitting
 * a report is still worth doing now: the data will be there once a
 * moderation view exists, and it costs the reporter nothing to flag
 * something today.
 * @param {{ reviewId: string, reporterId: string, reason: string, description?: string }} params
 */
export async function reportReview({ reviewId, reporterId, reason, description }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("review_reports").insert({
    review_id: reviewId,
    reporter_id: reporterId,
    reason,
    description: description || null,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("You've already reported this review.");
    }
    throw error;
  }
}
