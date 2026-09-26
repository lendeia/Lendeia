// ==================================================================
// FILE TYPE : SHARED UTILITY (new)
// PURPOSE   :
//   A persistent, random ID stored in localStorage, surviving across
//   sign-outs and even across creating a brand-new account on the same
//   browser — used only to let the database's device-wide rental cap
//   (database/schema/device_wide_rental_cap.sql) recognize "this is
//   still the same device that already has active requests," even if
//   the account changes. NOT a real device fingerprint — see that
//   migration's file header for the honest limitation (cleared by
//   clearing browser data, doesn't survive a different browser/device).
// CONNECTS TO :
//   Used by backend/supabase/rentals.js's createRental().
// ==================================================================
const STORAGE_KEY = "renta_device_id";

export function getDeviceId() {
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private browsing in some browsers,
    // etc.) — the device-wide check just doesn't apply for this
    // session; the per-account cap still does.
    return null;
  }
}
