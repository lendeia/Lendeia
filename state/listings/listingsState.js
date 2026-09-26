// ==================================================================
// FILE TYPE : STATE — Context definition only
// PURPOSE   :
//   Just the React Context object + its default shape for listings state.
//   Split from listingsStore.jsx so the Context object has a stable identity.
// CONNECTS TO :
//   Imported by state/listings/listingsStore.jsx.
// ==================================================================
import { createContext } from "react";

/**
 * @typedef {import('../../shared/types').Listing} Listing
 */

/**
 * Shape of the listings context value.
 * @type {{
 *   listings: Listing[],
 *   loading: boolean,
 *   error: string|null,
 *   createListing: (input: object) => Promise<void>,
 *   updateListing: (id: number, patch: object) => Promise<void>,
 *   deleteListing: (id: number) => Promise<void>,
 * }}
 */
export const initialListingsState = {
  listings: [],
  loading: false,
  error: null,
  createListing: async () => {},
  updateListing: async () => {},
  deleteListing: async () => {},
};

export const ListingsContext = createContext(initialListingsState);
