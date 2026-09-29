// ==================================================================
// FILE TYPE : COMPONENT (contains 2 merged sub-components)
// PURPOSE   :
//   Top navigation bar (desktop) + bottom tab bar (mobile), both driven by the
//   same `page`/`setPage` router state from App.jsx. TopNav also shows the
//   account's current subscription plan as a small badge next to the
//   avatar (like a ChatGPT-Plus-style indicator) — clicking it opens
//   SubscriptionModal, same modal used from Profile/Home. Also renders a
//   real notification bell (NotificationsBell) with a live unread count
//   and a dropdown of actual notifications from
//   backend/supabase/notifications.js.
// CONNECTS TO :
//   Reads useAuth() to know whether to show 'Log in' vs the account avatar.
//   Reads the account's plan via backend/supabase/subscription.js, and
//   notifications via backend/supabase/notifications.js.
//   Rendered once by MainLayout.jsx.
// ==================================================================
import React, { useEffect, useState } from "react";
import { Home as HomeIcon, Map as MapIcon, ClipboardList, User, MessageCircle, Bell, X, Grid, Plus } from "lucide-react";
import Button from "./Button";
import SubscriptionModal from "./SubscriptionModal";
import { getPlanById } from "./PlanCard";
import { useAuth } from "../../state/auth/authStore";
import { getMySubscription } from "../../backend/supabase/subscription";
import { getMyConversations } from "../../backend/supabase/messages";
import { getMyNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, clearNotification, clearAllNotifications } from "../../backend/supabase/notifications";

const UNREAD_POLL_MS = 10000;

// Shared by TopNav and BottomNav so both show the same live unread count
// without each running their own separate polling loop.
function useUnreadMessageCount() {
  const { account } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!account?.id || account.isAnonymous) { setCount(0); return; }
    let cancelled = false;
    const check = () => {
      getMyConversations(account.id)
        .then((convos) => {
          if (cancelled) return;
          setCount(convos.reduce((sum, c) => sum + c.unreadCount, 0));
        })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, UNREAD_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [account?.id, account?.isAnonymous]);

  return count;
}

const BOTTOM_NAV_ITEMS = [
  ["home", "Home", HomeIcon],
  ["map", "Map", MapIcon],
  ["messages", "Messages", MessageCircle],
  ["dashboard", "Rentals", ClipboardList],
  ["profile", "Profile", User],
];

// ---- SECTION: sub-component — notification bell + dropdown panel ----
function NotificationsBell({ setPage }) {
  const { account } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account?.id || account.isAnonymous) { setUnread(0); return; }
    let cancelled = false;
    const check = () => {
      getUnreadNotificationCount(account.id)
        .then((c) => { if (!cancelled) setUnread(c); })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, UNREAD_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [account?.id, account?.isAnonymous]);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && account?.id) {
      setLoading(true);
      getMyNotifications(account.id)
        .then(setItems)
        .finally(() => setLoading(false));
    }
  };

  const handleItemClick = async (n) => {
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    // Basic contextual navigation — not deep-linking to the exact
    // rental/conversation/review, just the right general page.
    if (n.type === "new_message") setPage("messages");
    else if (n.type === "rental_request_received" || n.type === "request_accepted" || n.type === "request_declined") setPage("dashboard");
    else if (n.type === "new_review" || n.type === "payment_successful") setPage("profile");
    setOpen(false);
  };

  const handleMarkAllRead = () => {
    if (!account?.id) return;
    markAllNotificationsRead(account.id).catch(() => {});
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  // Clear a single notification — previously there was no way to
  // remove one at all, only mark it read (which just changes its
  // style). stopPropagation so tapping the × doesn't also trigger the
  // item's own click-to-navigate handler.
  const handleClearOne = (e, n) => {
    e.stopPropagation();
    clearNotification(n.id).catch(() => {});
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
  };

  const handleClearAll = () => {
    if (!account?.id || items.length === 0) return;
    if (!window.confirm("Clear all notifications? This can't be undone.")) return;
    clearAllNotifications(account.id).catch(() => {});
    setItems([]);
    setUnread(0);
  };

  if (!account || account.isAnonymous) return null;

  return (
    <div className="relative">
      <button onClick={handleOpen} className="relative flex items-center gap-1.5 hover:text-[#17231D] transition-colors" title="Notifications">
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#E2932E] text-[#17231D] text-[9.5px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[2999]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 w-80 max-h-[26rem] overflow-y-auto bg-white rounded-2xl shadow-xl border border-[#17231D]/8 z-[3000]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#17231D]/8">
              <p className="text-[13.5px] font-medium text-[#17231D]">Notifications</p>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button onClick={handleMarkAllRead} className="text-[12px] text-[#4B5D46] font-medium">
                    Mark all read
                  </button>
                )}
                {items.length > 0 && (
                  <button onClick={handleClearAll} className="text-[12px] text-[#8A9089] font-medium">
                    Clear all
                  </button>
                )}
              </div>
            </div>
            {loading ? (
              <p className="px-4 py-6 text-[13px] text-[#6b6f66]">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-[#6b6f66]">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`group relative w-full text-left px-4 py-3 pr-9 border-b border-[#17231D]/6 hover:bg-[#17231D]/[0.02] transition-colors cursor-pointer ${
                    n.read ? "" : "bg-[#E2932E]/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#E2932E] shrink-0" />}
                    <p className="text-[13px] font-medium text-[#17231D]">{n.title}</p>
                  </div>
                  {n.body && <p className="text-[12px] text-[#6b6f66] mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[10.5px] text-[#8A9089] mt-1">
                    {new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                  {/* Clear this one — a real delete (database/schema/
                      allow_clear_notifications.sql), not just visual. */}
                  <button
                    onClick={(e) => handleClearOne(e, n)}
                    className="absolute top-3 right-3 text-[#8A9089] hover:text-[#17231D] opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Clear notification"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---- SECTION: sub-component — desktop top navigation bar ----
export function TopNav({ page, setPage }) {
  const { account } = useAuth();
  const [planId, setPlanId] = useState("free");
  const [showSubscribe, setShowSubscribe] = useState(false);
  const unreadCount = useUnreadMessageCount();

  useEffect(() => {
    if (!account?.id || account.isAnonymous) return;
    let cancelled = false;
    getMySubscription(account.id)
      .then((s) => { if (!cancelled) setPlanId(s.plan); })
      .catch(() => {}); // non-critical — badge just stays at "Free" default
    return () => { cancelled = true; };
  }, [account?.id, account?.isAnonymous]);

  const plan = getPlanById(planId);

  const NavLink = ({ id, label }) => (
    <button onClick={() => setPage(id)} className="relative py-1.5 hover:text-[#17231D] transition-colors">
      {label}
      <span
        className={`absolute -bottom-[1px] left-0 right-0 h-[1.5px] bg-[#E2932E] transition-transform origin-left ${
          page === id ? "scale-x-100" : "scale-x-0"
        }`}
      />
    </button>
  );

  return (
    <div className="bg-white/90 backdrop-blur-md border-b border-[#17231D]/[0.06] flex items-center justify-between px-4 md:px-10 py-3 md:py-4 fixed top-0 left-0 right-0 z-[2000]">
      <button onClick={() => setPage("home")} className="font-serif text-[18px] md:text-[21px] tracking-tight text-[#17231D] shrink-0">
        Lendeia<span className="text-[#E2932E]">.</span>
      </button>
      <div className="flex items-center gap-2.5 md:gap-7 text-[13px] md:text-[14px] text-[#17231D]/75 font-medium">
        {/* Home/Map/Rentals are already reachable from the bottom tab
            bar on mobile — showing them again here would just duplicate
            navigation, so they're desktop-only here. Browse isn't in
            the bottom nav anymore (moved up here specifically), so it
            stays visible on every screen size — as an icon on mobile
            (previously full text, which was part of what made this bar
            feel cramped) and text on desktop, same as before. */}
        <span className="hidden md:inline-flex"><NavLink id="home" label="Home" /></span>
        <button
          onClick={() => setPage("browse")}
          className={`md:hidden p-1.5 rounded-full transition-colors ${page === "browse" ? "text-[#E2932E]" : "hover:text-[#17231D]"}`}
          title="Browse"
        >
          <Grid size={20} />
        </button>
        <span className="hidden md:inline-flex"><NavLink id="browse" label="Browse" /></span>
        <span className="hidden md:inline-flex"><NavLink id="map" label="Map" /></span>
        <span className="hidden md:inline-flex"><NavLink id="dashboard" label="Rentals" /></span>

        {/* List an Item — icon-only on mobile (was a full-text pill
            button, one of the biggest single contributors to how
            cramped this bar felt on a narrow screen), full button with
            label on desktop as before. */}
        <button
          onClick={() => setPage("list")}
          className="md:hidden p-1.5 rounded-full border border-[#17231D]/15 text-[#17231D] hover:border-[#17231D]/30 transition-colors"
          title="List an Item"
        >
          <Plus size={18} />
        </button>
        <Button variant="outline" className="hidden md:inline-flex !px-4 !py-2 text-[13px]" onClick={() => setPage("list")}>
          List an Item
        </Button>

        {/* Messages is also already in the bottom tab bar on mobile —
            desktop-only here for the same reason as Home/Map/Rentals
            above. */}
        {account && !account.isAnonymous && (
          <button
            onClick={() => setPage("messages")}
            className="relative hidden md:flex items-center gap-1.5 hover:text-[#17231D] transition-colors"
            title="Messages"
          >
            <MessageCircle size={19} className={page === "messages" ? "text-[#17231D]" : ""} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#E2932E] text-[#17231D] text-[9.5px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Subscription badge — compact icon-only pill on mobile
            (previously always showed the full plan name text too,
            which is exactly the kind of thing that made this bar feel
            like it had no breathing room on a phone). Full label stays
            on desktop, unchanged. */}
        {account && !account.isAnonymous && (
          <button
            onClick={() => setShowSubscribe(true)}
            className={`flex items-center gap-1 px-2.5 md:px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${
              plan.id === "free"
                ? "border border-[#17231D]/15 text-[#6b6f66] hover:border-[#17231D]/30"
                : "bg-[#E2932E]/15 text-[#8a5a13] border border-[#E2932E]/40"
            }`}
            title={`${plan.name} plan — manage subscription`}
          >
            <span>{plan.emoji}</span>
            <span className="hidden md:inline">{plan.name}</span>
          </button>
        )}

        {/* Notifications now sits directly next to the avatar, per
            explicit request — previously separated from it by the
            subscription badge in between. */}
        <NotificationsBell setPage={setPage} />

        {account ? (
          <button
            onClick={() => setPage("profile")}
            className={`w-9 h-9 rounded-full overflow-hidden ring-2 flex items-center justify-center shrink-0 bg-[#17231D]/8 transition-all ${
              page === "profile" ? "ring-[#E2932E]" : "ring-transparent"
            }`}
            title={account.name}
          >
            {account.avatarUrl ? (
              <img src={account.avatarUrl} className="w-full h-full object-cover" />
            ) : (
              <span className="font-serif text-[14px] text-[#17231D]">
                {account.name.charAt(0).toUpperCase()}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={() => setPage("profile")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-[13px] font-medium transition-colors ${
              page === "profile"
                ? "border-[#E2932E] text-[#17231D]"
                : "border-[#17231D]/15 text-[#17231D]/75 hover:border-[#17231D]/30"
            }`}
          >
            <User size={15} />
            Log in
          </button>
        )}
      </div>

      {showSubscribe && (
        <SubscriptionModal
          currentPlanId={planId}
          onClose={() => setShowSubscribe(false)}
          onSubscribed={(result) => setPlanId(result.plan)}
        />
      )}
    </div>
  );
}

// ---- SECTION: sub-component — mobile bottom tab bar ----
export function BottomNav({ page, setPage }) {
  const { account } = useAuth();
  const unreadCount = useUnreadMessageCount();

  return (
    <div
      id="app-bottom-nav"
      className="bg-white/95 backdrop-blur-md border-t border-[#17231D]/[0.06] md:hidden fixed bottom-0 left-0 right-0 z-[1500] px-2 pt-2 pb-[env(safe-area-inset-bottom,10px)]"
    >
      <div className="flex justify-between">
        {/* Messages hidden for a guest account here too, matching the
            desktop top nav's existing behavior — previously this list
            had no such check at all, so a guest saw "Messages" on
            mobile but not on desktop, an inconsistency with no reason
            behind it (messaging needs a real, persistent account since
            a guest session can't be reliably reached again later). */}
        {BOTTOM_NAV_ITEMS.filter(([key]) => key !== "messages" || (account && !account.isAnonymous)).map(([key, label, Icon]) => {
          const isProfile = key === "profile";
          const displayLabel = isProfile && !account ? "Log in" : label;
          return (
            <button key={key} onClick={() => setPage(key)} className="relative flex flex-col items-center gap-1 px-3 py-1 flex-1">
              <span className="relative">
                <Icon size={20} strokeWidth={2} className={page === key ? "text-[#17231D]" : "text-[#8A9089]"} />
                {key === "messages" && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 rounded-full bg-[#E2932E] text-[#17231D] text-[8.5px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className={`text-[11px] ${page === key ? "text-[#17231D] font-medium" : "text-[#8A9089]"}`}>
                {displayLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- SECTION: MAIN export — renders both TopNav and BottomNav together ----
export default function Navbar({ page, setPage }) {
  return (
    <>
      <TopNav page={page} setPage={setPage} />
      <BottomNav page={page} setPage={setPage} />
    </>
  );
}