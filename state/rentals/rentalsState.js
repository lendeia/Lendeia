// ==================================================================
// FILE TYPE : STATE — Context definition only
// PURPOSE   :
//   Just the React Context object + its default shape for rentals state.
// CONNECTS TO :
//   Imported by state/rentals/rentalsStore.jsx.
// ==================================================================
import { createContext } from "react";

/**
 * @typedef {import('../../shared/types').RentalRequest} RentalRequest
 */

/**
 * @type {{
 *   requests: RentalRequest[],
 *   loading: boolean,
 *   error: string|null,
 *   requestRental: (item: object) => Promise<void>,
 *   approveRental: (id: number) => Promise<void>,
 *   cancelRental: (id: number) => Promise<void>,
 * }}
 */
export const initialRentalsState = {
  requests: [],
  loading: false,
  error: null,
  requestRental: async () => {},
  approveRental: async () => {},
  cancelRental: async () => {},
};

export const RentalsContext = createContext(initialRentalsState);
