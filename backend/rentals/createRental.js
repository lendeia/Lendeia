// ==================================================================
// FILE TYPE : MOCK BACKEND — RENTALS
// PURPOSE   :
//   Fake 'request a rental' endpoint. Currently accepts a placeholder
//   'Select dates' string instead of a real date range.
// CONNECTS TO :
//   Called by state/rentals/rentalsStore.jsx (RentalsProvider.requestRental),
//   used from Details.jsx's 'Request Rental' button. See shared/validation's
//   validateDateRange() for the helper meant to be wired in once a real date
//   picker exists.
// ==================================================================
import { validateDateRange } from "../../shared/validation";

/**
 * MOCK backend function — creates a rental request against a listing.
 * @param {object} input - { item, renter, dates, status, price }
 * @returns {Promise<import('../../shared/types').RentalRequest>}
 */
export async function createRental(input) {
  // `dates` in the UI is currently a free-text placeholder ("Select dates").
  // Once a real date picker exists, validate with validateDateRange(start, end) here.
  await new Promise((r) => setTimeout(r, 150));
  return { id: Date.now(), ...input };
}
