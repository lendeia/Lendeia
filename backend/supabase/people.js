// ==================================================================
// FILE TYPE : SUPABASE BACKEND — SHOP & PEOPLE SEARCH (new)
// PURPOSE   :
//   Search for shops and people by shop name, display name or @username.
//   Deliberately separate from item search (Browse's "Items" tab): this
//   returns people, not listings. A query that starts with "@" matches
//   usernames only. Results contain public fields only — the database
//   function (database/schema/people_search.sql) never returns email or
//   phone, and skips guests and banned/suspended accounts.
// CONNECTS TO :
//   Used by frontend/pages/Browse/Browse.jsx.
// ==================================================================
import { getSupabaseClient } from "./client";

export const MIN_PEOPLE_QUERY = 2;

/**
 * Rules for a new/changed @username — mirrors the database trigger in
 * people_search.sql so the person gets a friendly message before saving.
 * Returns the cleaned username (lowercase, no "@"), null for empty, or
 * throws an Error with a readable message.
 * @param {string|null|undefined} raw
 */
// Mirrors is_reserved_username() in people_search.sql (checked there too).
const RESERVED_USERNAMES = [
  "admin", "administrator", "support", "help", "helpdesk", "lendeia", "lendeiasupport",
  "lendeiastaff", "staff", "team", "moderator", "mod", "official", "security", "owner",
  "root", "system", "anonymous", "guest", "null", "undefined",
];
const squash = (u) => u.replace(/[._]/g, "");

export function cleanUsername(raw) {
  const value = String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!value) return null;
  if (!/^[a-z0-9_.]{3,20}$/.test(value)) {
    throw new Error('Username must be 3-20 characters: letters, numbers, "_" or ".".');
  }
  if (RESERVED_USERNAMES.includes(squash(value))) {
    throw new Error("That username is reserved. Please choose another.");
  }
  return value;
}

/**
 * Asks the database whether a username can be used, before the person
 * presses Save. Names count as the same when they differ only by capital
 * letters, "." or "_" (RenzTools = renz_tools = renz.tools).
 * @param {string} raw
 * @returns {Promise<"available"|"yours"|"taken"|"reserved"|"invalid">}
 */
export async function checkUsernameAvailability(raw) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("check_username_available", { p_username: raw });
  if (error) throw error;
  return data;
}

/**
 * @param {string} query - e.g. "Lendeia Tools" or "@renztools"
 * @returns {Promise<Array<{ id: string, name: string, shopName: string|null, username: string|null,
 *   avatarUrl: string|null, city: string|null, listingCount: number }>>}
 */
export async function searchPeople(query) {
  const q = String(query ?? "").trim();
  if (q.replace(/^@+/, "").trim().length < MIN_PEOPLE_QUERY) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("search_people", { p_query: q, p_limit: 20 });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    name: r.name || "Guest",
    shopName: r.shop_name || null,
    username: r.username || null,
    avatarUrl: r.avatar_url || null,
    city: r.city || null,
    listingCount: r.listing_count || 0,
  }));
}
