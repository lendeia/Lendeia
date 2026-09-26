// ==================================================================
// FILE TYPE : STATE — React Context provider
// PURPOSE   :
//   Owns the `requests` array (now REAL data from Supabase, via
//   backend/supabase/rentals.js — the old backend/rentals/*.js mocks are
//   no longer used here). requestRental() guards against duplicate active
//   requests by the same renter on the same item, using the real
//   authenticated renterId instead of the old hardcoded "You" string.
//
//   Polls in the background (see POLL_MS) so a change made by the OTHER
//   party in a rental (they accept/decline/complete while you're not on
//   the exact page showing it) eventually shows up without needing a
//   manual reload. Actions performed by THIS user still update local
//   state immediately, so they never wait for the next poll.
// CONNECTS TO :
//   useRentals() is consumed by Details and Dashboard. Uses the Context
//   object from state/rentals/rentalsState.js and the real user id from
//   state/auth/authStore.jsx (useAuth). The actual self-rental block is
//   enforced in backend/supabase/rentals.js + the database (see
//   database/schema/self_rental_and_fields.sql) — this store just
//   surfaces whatever error that layer throws.
// ==================================================================
import React, { useCallback, useContext, useEffect, useState } from "react";
import { RentalsContext } from "./rentalsState";
import { useAuth } from "../auth/authStore";
import {
  getMyRentals,
  createRental as createRentalBackend,
  setRentalStatus,
  confirmItemReceived,
} from "../../backend/supabase/rentals";

const POLL_MS = 15000;

export function RentalsProvider({ children }) {
  const { account } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback((opts = {}) => {
    const { background = false } = opts;
    if (!account?.id) return () => {};
    let cancelled = false;
    // Same reasoning as listingsStore.jsx's background flag — a
    // background poll shouldn't flip on a loading state that would
    // flicker over already-good data every 15s.
    if (!background) setLoading(true);
    getMyRentals()
      .then((data) => { if (!cancelled) setRequests(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled && !background) setLoading(false); });
    return () => { cancelled = true; };
  }, [account?.id]);

  useEffect(() => {
    const cancel = refresh();
    const id = setInterval(() => refresh({ background: true }), POLL_MS);
    return () => { cancel(); clearInterval(id); };
  }, [refresh]);

  const requestRental = useCallback(async (item, { startDate, endDate } = {}) => {
    if (!account?.id) {
      throw new Error("You need to be signed in to request a rental.");
    }
    // Same reasoning as listingsStore.jsx's createListing gate — a
    // rental tied only to an unrecoverable anonymous session means the
    // owner has no way to know who actually has their item if that
    // session is ever lost.
    if (account.isAnonymous) {
      throw new Error(
        "Please sign in with Google before requesting a rental, so the owner can always reach you."
      );
    }

    // Prevent spamming: if this renter already has an active (Pending/Accepted)
    // request on this exact item, don't create a duplicate — just return the
    // existing one untouched.
    const existing = requests.find(
      (r) => r.itemId === item.id && r.renterId === account.id && (r.status === "Pending" || r.status === "Accepted")
    );
    if (existing) {
      return existing;
    }

    // ownerId comes from the listing itself (state/listings/listingsStore.jsx
    // maps it as item.ownerId) — createRentalBackend throws a friendly
    // error immediately if it matches the current user, and the database
    // independently refuses the write either way (see
    // backend/supabase/rentals.js's file header for both layers).
    // startDate/endDate come from Details.jsx's real date-range picker —
    // previously these didn't exist at all here (a hardcoded 1-day
    // placeholder was inserted server-side instead).
    const created = await createRentalBackend({
      listingId: item.id,
      ownerId: item.ownerId,
      renterId: account.id,
      price: item.price,
      startDate,
      endDate,
    });
    setRequests((prev) => [created, ...prev]);
    return created;
  }, [requests, account]);

  const approveRental = useCallback(async (id) => {
    const updated = await setRentalStatus(id, "Accepted");
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    return updated;
  }, []);

  const declineRental = useCallback(async (id) => {
    const updated = await setRentalStatus(id, "Declined");
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    return updated;
  }, []);

  const cancelRental = useCallback(async (id) => {
    const updated = await setRentalStatus(id, "Cancelled");
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    return updated;
  }, []);

  // Only the listing owner may call this, and only on an Accepted rental
  // — enforced by the database trigger (see
  // database/schema/reviews_and_ratings.sql's extended
  // enforce_rental_status_transition). This is what makes "Completed"
  // reachable at all, which in turn is what makes a review possible —
  // without this, reviews would have been permanently dead code.
  const markCompleted = useCallback(async (id) => {
    const updated = await setRentalStatus(id, "Completed");
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    return updated;
  }, []);

  // Real distinct "Returned" status — only valid once the owner has
  // confirmed handoff (see database/schema/real_returned_status.sql,
  // confirmReceived below). Cancel (cancelRental above) is no longer
  // valid at that point — the database itself now rejects it.
  const returnRental = useCallback(async (id) => {
    const updated = await setRentalStatus(id, "Returned");
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    return updated;
  }, []);

  // Owner confirms the renter now has the item in hand — see
  // database/schema/confirm_item_received.sql for why this is the
  // owner's action, not the renter's.
  const confirmReceived = useCallback(async (id) => {
    const updated = await confirmItemReceived(id);
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    return updated;
  }, []);

  const value = { requests, loading, error, requestRental, approveRental, declineRental, cancelRental, markCompleted, confirmReceived, returnRental, refresh };

  return <RentalsContext.Provider value={value}>{children}</RentalsContext.Provider>;
}

export function useRentals() {
  return useContext(RentalsContext);
}
