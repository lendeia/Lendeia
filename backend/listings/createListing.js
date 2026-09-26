// ==================================================================
// FILE TYPE : MOCK BACKEND — LISTINGS
// PURPOSE   :
//   Fake 'create listing' endpoint. Validates input via shared/validation, then
//   returns a fully-shaped Listing object (see shared/types) with an id and
//   sensible defaults (rating 0, reviews 0, owner 'You', etc).
//   A real backend would INSERT into database/schema/listings.sql's `listings`
//   table via the CreateListing query in database/queries/listings.sql, which
//   would be subject to database/policies/listings.sql RLS rules.
// CONNECTS TO :
//   Called by state/listings/listingsStore.jsx (ListingsProvider.createListing),
//   which is called from frontend/pages/ListEquipment/ListEquipment.jsx after
//   the (mock) payment step in backend/payments/processPayment.js succeeds.
// ==================================================================
import { validateListingInput } from "../../shared/validation";

/**
 * MOCK backend function — creates a new equipment listing.
 * A real implementation would POST to the API, which would insert into
 * the `listings` table (see database/schema/listings.sql) and return the row.
 * @param {object} input
 * @returns {Promise<import('../../shared/types').Listing>}
 */
export async function createListing(input) {
  const { valid, errors } = validateListingInput(input);
  if (!valid) {
    throw new Error("Invalid listing: " + Object.values(errors).join(" "));
  }

  await new Promise((r) => setTimeout(r, 150));

  return {
    id: Date.now(),
    name: input.name,
    brand: input.brand ?? "",
    model: input.model ?? "",
    price: Number(input.price),
    distance: 0,
    area: input.location,
    category: input.category,
    img: input.img ?? "",
    rating: 0,
    reviews: 0,
    available: "Available today",
    owner: "You",
    ownerImg: "",
    condition: input.condition ?? "Good",
    desc: input.desc ?? "",
  };
}
