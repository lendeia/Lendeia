// ==================================================================
// FILE TYPE : SHARED VALIDATION
// PURPOSE   :
//   Dependency-free validation helpers usable from both the mock backend/*
//   functions and (eventually) real server-side code, so the rules stay
//   identical on both sides instead of drifting.
// CONNECTS TO :
//   Used by backend/auth/register.js, backend/auth/updateAccount.js,
//   backend/listings/createListing.js and backend/rentals/createRental.js.
// ==================================================================
// Lightweight, dependency-free validation helpers shared by frontend and backend stubs.

export function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function isPositiveNumber(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export function isValidEmail(v) {
  return isNonEmptyString(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Validates the fields required to create/update an equipment listing.
 * Returns { valid: boolean, errors: Record<string,string> }
 */
export function validateListingInput(input = {}) {
  const errors = {};
  if (!isNonEmptyString(input.name)) errors.name = "Name is required.";
  if (!isNonEmptyString(input.category)) errors.category = "Category is required.";
  if (!isPositiveNumber(Number(input.price))) errors.price = "Price must be a positive number.";
  if (!isNonEmptyString(input.location)) errors.location = "Location is required.";
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates a rental request date range (very light — just start < end).
 */
export function validateDateRange(start, end) {
  if (!start || !end) return { valid: false, error: "Both start and end dates are required." };
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return { valid: false, error: "Invalid date." };
  }
  if (s >= e) return { valid: false, error: "Start date must be before end date." };
  return { valid: true, error: null };
}
