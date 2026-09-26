// ==================================================================
// FILE TYPE : SHARED TYPES (JSDoc only)
// PURPOSE   :
//   Documents the shape of Listing / RentalRequest / User objects that flow
//   between backend/* mocks, state/* stores and frontend/* pages. No runtime
//   code — purely editor/IDE intellisense via JSDoc typedefs.
// CONNECTS TO :
//   Referenced via @typedef import comments in nearly every backend/* and
//   state/* file.
// ==================================================================
/**
 * Shared type definitions (JSDoc — no TS build step required).
 * Import as: import '../../../shared/types/index.js' // for editor intellisense only
 */

/**
 * @typedef {Object} Listing
 * @property {number} id
 * @property {string} name
 * @property {string} brand
 * @property {string} model
 * @property {number} price          - price per day (PHP)
 * @property {number} distance       - km from viewer
 * @property {string} area
 * @property {string} category
 * @property {string} img
 * @property {number} rating
 * @property {number} reviews
 * @property {string} available      - human readable availability string
 * @property {string} owner
 * @property {string} ownerImg
 * @property {string} condition
 * @property {string} desc
 */

/**
 * @typedef {Object} RentalRequest
 * @property {number} id
 * @property {string} item
 * @property {string} renter
 * @property {string} dates
 * @property {"Pending"|"Accepted"|"Completed"|"Declined"|"Cancelled"} status
 * @property {number} price
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} [avatarUrl]
 */

export {};
