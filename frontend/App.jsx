// ==================================================================
// FILE TYPE : APP ROOT / CLIENT-SIDE ROUTER
// PURPOSE   :
//   Composes all the Context Providers (Auth, Profile, Listings, Rentals) and
//   implements a tiny hand-rolled router: `page` state selects which page
//   component renders inside MainLayout — there is no react-router here.
//   The app opens directly to "home" (the Welcome landing page was
//   removed by explicit request — its Contact & Support section now
//   lives in Footer.jsx instead).
// CONNECTS TO :
//   Wraps every page in frontend/pages/*. Provider order matters: ProfileProvider
//   reads useAuth() so AuthProvider must be an ancestor of it.
// ==================================================================
import React, { useState, useEffect } from "react";
import MainLayout from "./layouts/MainLayout";
// import Welcome removed — see App() near the top of this file for why
import Home from "./pages/Home/Home";
import Browse from "./pages/Browse/Browse";
import Details from "./pages/Details/Details";
import MapPage from "./pages/Map/MapPage";
import ListEquipment from "./pages/ListEquipment/ListEquipment";
import Dashboard from "./pages/Dashboard/Dashboard";
import Profile from "./pages/Profile/Profile";
import OwnerStore from "./pages/Store/OwnerStore";
import Messages from "./pages/Messages/Messages";
import Receipt from "./pages/Receipt/Receipt";
import Legal from "./pages/Legal/Legal";
import Help from "./pages/Help/Help";
import PaymentConfirmationOverlay from "./components/PaymentConfirmationOverlay";
import DeviceBlockedOverlay from "./components/DeviceBlockedOverlay";
import { getListingIfVisible } from "../backend/supabase/listings";

import { ListingsProvider } from "../state/listings/listingsStore";
import { RentalsProvider } from "../state/rentals/rentalsStore";
import { AuthProvider, useAuth } from "../state/auth/authStore";
import { ProfileProvider } from "../state/profile/profileStore";
import { LocationProvider } from "../state/location/locationStore";
import { SavedListingsProvider } from "../state/saved/savedStore";

function AppShell() {
  const { deviceBlockedReason, clearDeviceBlockedReason } = useAuth();
  // Previously showed a full-bleed marketing "welcome" page first
  // (frontend/pages/Welcome/Welcome.jsx) before the real app — removed
  // per explicit request; the app now opens directly to Home. Its
  // valuable Contact & Support section was ported into Footer.jsx
  // rather than lost. The file itself is left in place, unused, same
  // as other retired files in this project (backend/auth/, backend/
  // listings/) — nothing imports or renders it anymore.
  const [page, setPage] = useState(() => {
    // A payment return should still land in the app on Profile, where
    // the plan status is visible, rather than defaulting to Home.
    const params = new URLSearchParams(window.location.search);
    return params.get("checkout") ? "profile" : "home";
  });
  const [item, setItem] = useState(null);
  // Which owner's store page to show when page === "store" — separate
  // from `item` since a store visit isn't tied to any single listing.
  const [storeOwnerId, setStoreOwnerId] = useState(null);
  // Set when arriving at Messages via a "Message" button (Details.jsx /
  // OwnerStore.jsx) so it can immediately start/open that conversation
  // instead of requiring the person to find it in their conversation list.
  const [messageTargetUserId, setMessageTargetUserId] = useState(null);
  // Which rental's permanent record to show when page === "receipt" —
  // set by clicking any row in Dashboard.jsx's Rental History, whether
  // or not the underlying listing still exists/is still active.
  const [receiptRequest, setReceiptRequest] = useState(null);

  // Payment return from PayMongo checkout — see
  // PaymentConfirmationOverlay.jsx for why this polls rather than
  // trusting the URL alone. Read once on mount; the URL is cleaned up
  // right away so refreshing the page doesn't re-trigger this.
  const [checkoutReturn, setCheckoutReturn] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (!status) return null;
    return { status, planId: params.get("plan") };
  });
  useEffect(() => {
    if (!checkoutReturn) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    url.searchParams.delete("plan");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only true when the URL actually has a deep-link param to resolve —
  // checked synchronously here (not in the effect below) so a normal
  // visit with no params never flashes a loading state at all.
  const [resolvingDeepLink, setResolvingDeepLink] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get("item") || params.get("store"));
  });

  // Shared by the initial deep-link resolution below AND the popstate
  // handler further down (browser back/forward) — previously only ran
  // once on mount, so navigating with the browser's own back/forward
  // buttons had no way to actually resolve a different item/store.
  const resolveFromUrl = async () => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    const storeId = params.get("store");
    if (storeId) {
      setStoreOwnerId(storeId);
      setPage("store");
      return;
    }
    if (itemId) {
      try {
        const listing = await getListingIfVisible(itemId);
        if (listing) {
          setItem(listing);
          setPage("details");
        } else {
          setPage("browse");
        }
      } catch {
        setPage("browse");
      }
      return;
    }
    // No item/store in the URL (e.g. back button past a shared link) —
    // land somewhere sensible rather than staying on whatever page
    // React state still happens to hold.
    setPage("home");
  };

  useEffect(() => {
    if (!resolvingDeepLink) return;
    resolveFromUrl().finally(() => setResolvingDeepLink(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward — previously the app's own navigation never
  // touched the address bar at all (only the very first page load ever
  // read it), so back/forward had nothing real to do, and copying the
  // address bar mid-session always gave just the bare domain regardless
  // of what was actually on screen.
  useEffect(() => {
    const handlePopState = () => { resolveFromUrl(); };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const openItem = (it) => {
    setItem(it);
    setPage("details");
    // Real URL update — previously the address bar never changed at
    // all during in-app navigation, so copying it mid-session always
    // gave just the bare domain no matter what was on screen.
    window.history.pushState({}, "", `${window.location.pathname}?item=${it.id}`);
  };
  const nav = (p) => {
    setPage(p);
    setItem(null);
    // Plain navigation (e.g. the top nav Messages button) should always
    // land on the conversation list, not silently reuse whichever
    // conversation was last opened via a "Message" button elsewhere.
    setMessageTargetUserId(null);
    // Clears any ?item=/?store= left over from a previous view — the
    // address bar should reflect "not viewing a specific item/store"
    // once you navigate elsewhere.
    if (window.location.search) {
      window.history.pushState({}, "", window.location.pathname);
    }
  };
  const visitStore = (ownerId) => {
    setStoreOwnerId(ownerId);
    setPage("store");
    window.history.pushState({}, "", `${window.location.pathname}?store=${ownerId}`);
  };
  const messageUser = (otherUserId) => {
    setMessageTargetUserId(otherUserId);
    setPage("messages");
  };
  const viewReceipt = (request) => {
    setReceiptRequest(request);
    setPage("receipt");
  };
  const [legalSection, setLegalSection] = useState(null);
  // Remembers which page to return to from Legal — Footer links can be
  // clicked from anywhere, and "Back" should return there, not always
  // to Home.
  const [legalReturnPage, setLegalReturnPage] = useState("home");
  const [browseSearchQuery, setBrowseSearchQuery] = useState("");
  const [browseCategory, setBrowseCategory] = useState(null);
  // Lets Home's search bar AND category buttons actually hand off to
  // Browse's real search/filter — previously Home's input did nothing,
  // and clicking a category on Home always landed on Browse with no
  // category applied at all, regardless of which one was clicked.
  const goToBrowse = ({ query, category } = {}) => {
    setBrowseSearchQuery(query || "");
    setBrowseCategory(category || null);
    setPage("browse");
  };

  const goToLegal = (sectionId) => {
    setLegalSection(sectionId || null);
    setLegalReturnPage(page);
    setPage("legal");
  };

  const [helpGuideId, setHelpGuideId] = useState(null);
  const [helpReturnPage, setHelpReturnPage] = useState("home");
  // Real navigation target for "How does this work?"-style buttons
  // anywhere in the app — jumps straight to the relevant guide, not
  // just the generic Help page.
  const goToHelp = (guideId) => {
    setHelpGuideId(guideId || null);
    setHelpReturnPage(page);
    setPage("help");
  };

  if (resolvingDeepLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F4EE]">
        <p className="text-[13px] text-[#8A9089]">Loading…</p>
      </div>
    );
  }

  return (
    <>
    <MainLayout page={page} setPage={nav} goToLegal={goToLegal} goToHelp={goToHelp}>
      {page === "home" && <Home setPage={nav} openItem={openItem} goToBrowse={goToBrowse} />}
      {page === "browse" && <Browse openItem={openItem} initialSearch={browseSearchQuery} initialCategory={browseCategory} />}
      {page === "details" && (
        <Details
          item={item}
          back={() => setPage("browse")}
          goToLogin={() => setPage("profile")}
          visitStore={visitStore}
          goToDashboard={() => setPage("dashboard")}
          messageUser={messageUser}
          goToLegal={goToLegal}
          goToHelp={goToHelp}
        />
      )}
      {page === "map" && <MapPage openItem={openItem} />}
      {page === "list" && <ListEquipment goToLogin={() => setPage("profile")} goToLegal={goToLegal} goToHelp={goToHelp} />}
      {page === "dashboard" && <Dashboard openItem={openItem} visitProfile={visitStore} viewReceipt={viewReceipt} />}
      {page === "profile" && <Profile goToLegal={goToLegal} goToHelp={goToHelp} />}
      {page === "store" && (
        <OwnerStore
          ownerId={storeOwnerId}
          back={() => setPage("browse")}
          openItem={openItem}
          messageUser={messageUser}
          visitProfile={visitStore}
        />
      )}
      {page === "messages" && (
        <Messages initialOtherUserId={messageTargetUserId} back={() => setPage("home")} visitProfile={visitStore} goToHelp={goToHelp} />
      )}
      {page === "receipt" && (
        <Receipt
          request={receiptRequest}
          back={() => setPage("dashboard")}
          openItem={openItem}
          visitProfile={visitStore}
        />
      )}
      {page === "legal" && (
        <Legal back={() => setPage(legalReturnPage)} initialSection={legalSection} />
      )}
      {page === "help" && <Help back={() => setPage(helpReturnPage)} initialGuideId={helpGuideId} />}
    </MainLayout>
    {checkoutReturn && (
      <PaymentConfirmationOverlay
        status={checkoutReturn.status}
        planId={checkoutReturn.planId}
        onClose={() => setCheckoutReturn(null)}
      />
    )}
    {deviceBlockedReason && (
      <DeviceBlockedOverlay reason={deviceBlockedReason} onClose={clearDeviceBlockedReason} />
    )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <ListingsProvider>
          <RentalsProvider>
            <LocationProvider>
              <SavedListingsProvider>
                <AppShell />
              </SavedListingsProvider>
            </LocationProvider>
          </RentalsProvider>
        </ListingsProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}