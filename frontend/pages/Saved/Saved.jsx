// ==================================================================
// FILE TYPE : COMPONENT (moved from a standalone page into a Dashboard
// tab — see Dashboard.jsx's TABS array and tab === "saved" render block)
// PURPOSE   :
//   The renter's wishlist — every listing they've tapped ♡ on, most
//   recently saved first. Plain empty state when nothing's saved yet.
//   Just the CONTENT now (no outer page padding/title) — Dashboard's
//   own tab header and page container already provide that, so this
//   used to duplicate it when it was its own top-level page.
// CONNECTS TO :
//   Uses backend/supabase/savedListings.js's getMySavedListings()
//   directly (not the shared savedIds Set from state/saved/savedStore —
//   that one's just IDs, this page needs the full listing objects).
//   Reuses ListingCard.jsx with the same save-toggle wiring as
//   Home/Browse, via useSavedListings(). Rendered by
//   frontend/pages/Dashboard/Dashboard.jsx.
// ==================================================================
import React, { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useAuth } from "../../../state/auth/authStore";
import { useSavedListings } from "../../../state/saved/savedStore";
import { getMySavedListings } from "../../../backend/supabase/savedListings";
import ListingCard from "../../components/ListingCard";

export default function Saved({ openItem }) {
  const { account } = useAuth();
  const { savedIds, toggleSave } = useSavedListings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!account?.id || account.isAnonymous) { setLoading(false); return; }
    setLoading(true);
    getMySavedListings(account.id)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [account?.id, account?.isAnonymous]);

  // Re-fetch the full list whenever the saved-IDs set changes (e.g.
  // unsaving something here should make it disappear from this page
  // immediately, not just flip its heart icon).
  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedIds.size]);

  if (account?.isAnonymous) {
    return (
      <div className="py-16 max-w-sm mx-auto text-center">
        <Heart size={28} className="mx-auto text-[#8A9089]" />
        <p className="text-[14px] text-[#6b6f66] mt-4">
          Please sign in with Google or email (in Profile) to save items.
        </p>
      </div>
    );
  }

  return (
    <div>
      {loading ? (
        <p className="text-[13.5px] text-[#6b6f66]">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Heart size={28} className="mx-auto text-[#8A9089]" />
          <p className="text-[14px] text-[#6b6f66] mt-4">Nothing saved yet.</p>
          <p className="text-[12.5px] text-[#8A9089] mt-1">
            Tap the ♡ on any item to save it here for later.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10 stagger-children">
          {items.map((item) => (
            <ListingCard
              key={item.id}
              item={item}
              onOpen={openItem}
              isSaved={savedIds.has(item.id)}
              onToggleSave={toggleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
