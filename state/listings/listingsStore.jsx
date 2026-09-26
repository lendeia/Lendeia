// ==================================================================
// FILE TYPE : STATE — React Context provider
// PURPOSE   :
//   Owns the `listings` array (now REAL data from Supabase, via
//   backend/supabase/listings.js — the old backend/listings/*.js mocks
//   are no longer used here) and CRUD actions. Also owns recordView(),
//   which still only tracks views in-memory/client-side (not persisted
//   to Supabase yet — a real "views" table/column is a follow-up piece).
//
//   Polls the active-listings feed in the background (see POLL_MS)
//   so changes that don't originate from THIS browser tab's own actions
//   — another tab, another user creating/renting something, a listing
//   auto-delisting after a completed rental — eventually show up without
//   the person needing to know to hit reload. Actions performed in this
//   tab (create/update/delete) still update local state immediately, so
//   the person doing the action never waits for the next poll.
// CONNECTS TO :
//   useListings() is consumed by Home, Browse, Map, Details, ListEquipment,
//   Dashboard. Uses the Context object from state/listings/listingsState.js.
//   Reads the logged-in user's id from state/auth/authStore.jsx (useAuth)
//   so createListing() can set the real owner_id — this is what makes
//   "is this my listing?" checks elsewhere (Details.jsx, Dashboard.jsx,
//   ListEquipment.jsx) meaningful instead of comparing against a fake
//   "You" string like the old mock did.
// ==================================================================
import React, { useCallback, useContext, useEffect, useState } from "react";
import { ListingsContext } from "./listingsState";
import { useAuth } from "../auth/authStore";
import {
  getActiveListings,
  createListing as createListingBackend,
  updateListing as updateListingBackend,
  deleteListing as deleteListingBackend,
} from "../../backend/supabase/listings";

const POLL_MS = 15000;

export function ListingsProvider({ children }) {
  const { account } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback((opts = {}) => {
    const { background = false } = opts;
    let cancelled = false;
    // Background polls shouldn't toggle `loading` — that would flicker
    // any "Loading…" UI every 15s even though there's already good data
    // on screen; only the very first fetch (or an explicit manual
    // refresh() call) should show a loading state.
    if (!background) setLoading(true);
    getActiveListings()
      .then((data) => { if (!cancelled) setListings(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled && !background) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cancel = refresh();
    const id = setInterval(() => refresh({ background: true }), POLL_MS);
    return () => { cancel(); clearInterval(id); };
  }, [refresh]);

  const createListing = useCallback(async (input) => {
    if (!account?.id) {
      throw new Error("You need to be signed in to list equipment.");
    }
    // Listing ownership needs to be recoverable by a real person, not
    // just whichever browser happened to create it — an anonymous
    // session with no linked Google account is permanently unreachable
    // the moment its local storage is cleared or a different device is
    // used, which would leave the listing stranded with no way for its
    // real owner to ever manage or remove it again. See
    // backend/supabase/anonymousAuth.js's linkGoogleAccount().
    if (account.isAnonymous) {
      throw new Error(
        "Please sign in with Google before listing equipment, so you can always find and manage your listing later."
      );
    }
    const created = await createListingBackend(account.id, input);
    setListings((prev) => [created, ...prev]);
    return created;
  }, [account]);

  const updateListing = useCallback(async (id, patch) => {
    const updated = await updateListingBackend(id, patch);
    setListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updated } : l))
    );
    return updated;
  }, []);

  const deleteListing = useCallback(async (id) => {
    await deleteListingBackend(id);
    setListings((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // Client-side-only view counter — NOT persisted to Supabase. Resets on
  // refresh. A real implementation would insert into a `listing_views`
  // table (or increment a counter column) so Dashboard's analytics chart
  // reflects genuine cross-session/cross-visitor data instead of just
  // this browser tab's session.
  const recordView = useCallback((id) => {
    setListings((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              viewCount: (l.viewCount || 0) + 1,
              viewHistory: [...(l.viewHistory || []), new Date().toISOString()],
            }
          : l
      )
    );
  }, []);

  const value = { listings, loading, error, createListing, updateListing, deleteListing, recordView, refresh };

  return <ListingsContext.Provider value={value}>{children}</ListingsContext.Provider>;
}

export function useListings() {
  return useContext(ListingsContext);
}
