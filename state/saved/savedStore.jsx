// ==================================================================
// FILE TYPE : STATE (React Context)
// PURPOSE   :
//   Keeps the current user's saved-listing IDs in sync across every
//   page that shows a ♡/♥ button (Home, Browse, Details, the Saved
//   page itself), so saving/unsaving from one page is reflected
//   immediately everywhere else without each page fetching separately.
// CONNECTS TO :
//   Wraps the app in App.jsx alongside ListingsProvider/RentalsProvider.
//   Used via useSavedListings(). Backed by backend/supabase/
//   savedListings.js.
// ==================================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/authStore";
import { getMySavedListingIds, saveListing, unsaveListing } from "../../backend/supabase/savedListings";

const SavedListingsContext = createContext(null);

export function SavedListingsProvider({ children }) {
  const { account } = useAuth();
  const [savedIds, setSavedIds] = useState(new Set());

  const refresh = useCallback(() => {
    if (!account?.id || account.isAnonymous) {
      setSavedIds(new Set());
      return;
    }
    getMySavedListingIds(account.id)
      .then(setSavedIds)
      .catch(() => {});
  }, [account?.id, account?.isAnonymous]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleSave = useCallback(async (listingId) => {
    if (!account?.id || account.isAnonymous) {
      window.alert("Please sign in with Google or email (in Profile) to save items.");
      return;
    }
    const currentlySaved = savedIds.has(listingId);
    // Optimistic update — feels instant, matching how the rest of this
    // app's toggles (block, etc.) behave.
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (currentlySaved) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
    try {
      if (currentlySaved) await unsaveListing(listingId);
      else await saveListing(listingId);
    } catch (err) {
      // Roll back on failure rather than leave the UI lying about what
      // actually got saved.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (currentlySaved) next.add(listingId);
        else next.delete(listingId);
        return next;
      });
      window.alert(err.message || "Couldn't update saved items. Please try again.");
    }
  }, [account?.id, account?.isAnonymous, savedIds]);

  return (
    <SavedListingsContext.Provider value={{ savedIds, toggleSave, refresh }}>
      {children}
    </SavedListingsContext.Provider>
  );
}

export function useSavedListings() {
  const ctx = useContext(SavedListingsContext);
  if (!ctx) throw new Error("useSavedListings must be used within SavedListingsProvider");
  return ctx;
}
