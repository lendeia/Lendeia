// ==================================================================
// FILE TYPE : PAGE — /admin equivalent for this app's hand-rolled
//             page-state router (App.jsx's `page` state, not a real URL
//             path — matches how every other page in this app works).
// PURPOSE   :
//   Two tabs: "Reports" (support/report queue, original version of
//   this page) and "Users" (new — search any account directly, not
//   just ones that happen to have a report against them, and manage
//   their listings). Both share the same moderation action buttons
//   (Warn/Restrict/Suspend/Ban and their reversals) and the same
//   backend calls (backend/supabase/admin.js) — real access control is
//   the database RLS policy in database/schema/
//   owner_role_and_admin_access.sql, not this page; someone without
//   the role just gets empty results back regardless of reaching it.
// CONNECTS TO :
//   Reached via Profile.jsx's "Admin Dashboard" menu item (only shown
//   there if the account's role is admin/owner) and App.jsx's
//   `page === "admin"` route.
// ==================================================================
import React, { useEffect, useState } from "react";
import { ChevronLeft, Info } from "lucide-react";
import {
  getAllSupportRequests,
  updateSupportRequestStatus,
  applyAccountAction,
  searchUsers,
  adminRemoveListing,
} from "../../../backend/supabase/admin";
import { getOwnerAllListings } from "../../../backend/supabase/listings";
import { SUPPORT_CATEGORIES } from "../../../backend/supabase/support";

const STATUS_FILTERS = [
  ["all", "All"],
  ["open", "Open"],
  ["in_progress", "In Progress"],
  ["resolved", "Resolved"],
];

function categoryLabel(key) {
  return SUPPORT_CATEGORIES.find(([k]) => k === key)?.[2] || key;
}
function categoryEmoji(key) {
  return SUPPORT_CATEGORIES.find(([k]) => k === key)?.[1] || "";
}

// What each action button actually does — shown on demand (the (i)
// button below each row) rather than always visible, so the row of
// buttons doesn't turn into a wall of text, while still making sure
// nobody clicks one not knowing what it does.
const ACTION_INFO = {
  warn: "Sends the account a written warning notice. Nothing is restricted or blocked — it's a formal notice added to their record.",
  restrict: "Temporarily limits specific actions (currently: creating new listings). The account stays active and can still sign in and browse normally.",
  suspend: "Blocks sign-in for a set number of days you choose. Lifts itself automatically once that time passes — no need to remember to undo it.",
  ban: "Blocks sign-in permanently, until an admin explicitly removes the ban. The most serious action here.",
  unrestrict: "Removes an existing restriction, restoring full access to create listings again.",
  unsuspend: "Ends an active suspension early, before its time would have naturally run out.",
  unban: "Reverses a ban, allowing the account to sign in again.",
};

function ActionButtons({ actionableUserId, reportedName, onAction, actingId, rowId }) {
  const [infoFor, setInfoFor] = useState(null);
  if (!actionableUserId) return null;

  const renderRow = (list, extraClass) => (
    <div className="flex flex-wrap items-center gap-2">
      {list.map(([action, label]) => (
        <div key={action} className="relative flex items-center gap-1">
          <button
            onClick={() => onAction(action)}
            disabled={actingId === rowId}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium border disabled:opacity-60 ${extraClass(action)}`}
          >
            {actingId === rowId ? "…" : label}
          </button>
          <button
            onClick={() => setInfoFor(infoFor === action ? null : action)}
            className="text-[#8A9089] hover:text-[#17231D]"
            title="What does this do?"
          >
            <Info size={13} />
          </button>
          {infoFor === action && (
            <div className="absolute z-10 top-full left-0 mt-1.5 w-56 p-2.5 rounded-lg bg-[#17231D] text-white text-[11.5px] leading-snug shadow-lg">
              {ACTION_INFO[action]}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-[#17231D]/8">
      {renderRow(
        [["warn", "Warn"], ["restrict", "Restrict"], ["suspend", "Suspend"], ["ban", "Ban"]],
        (action) => (action === "ban" ? "border-red-300 text-red-700 hover:bg-red-50" : "border-[#17231D]/15 text-[#17231D] hover:bg-[#17231D]/5")
      )}
      {renderRow(
        [["unrestrict", "Remove restriction"], ["unsuspend", "Remove suspension"], ["unban", "Remove ban"]],
        () => "border-[#4B5D46]/30 text-[#4B5D46] hover:bg-[#4B5D46]/5"
      )}
    </div>
  );
}

export default function Admin({ back, visitStore }) {
  const [tab, setTab] = useState("reports"); // "reports" | "users"

  // ---- Reports tab state ----
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [updatingId, setUpdatingId] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = () => {
    setLoading(true);
    getAllSupportRequests()
      .then(setRequests)
      .catch((err) => setError(err.message || "Couldn't load the queue."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleStatusChange = async (id, status) => {
    setUpdatingId(id);
    try {
      await updateSupportRequestStatus(id, status);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (err) {
      window.alert(err.message || "Couldn't update that request.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Every action needs a real, non-empty reason (also enforced server-
  // side in applyAccountAction itself) — a simple prompt() rather than
  // a full custom modal, matching how the rest of this admin queue
  // already handles lightweight actions (window.confirm/alert
  // elsewhere in this app). Shared by both tabs.
  const runAction = async (rowId, targetUserId, targetLabel, action, relatedReportId) => {
    const reason = window.prompt(`Reason for this ${action} (shown to the user, and kept on their record)?`);
    if (!reason?.trim()) return;

    let suspendDays;
    if (action === "suspend") {
      const raw = window.prompt("Suspend for how many days?", "7");
      suspendDays = Number(raw);
      if (!raw || !Number.isFinite(suspendDays) || suspendDays <= 0) {
        window.alert("Enter a valid number of days.");
        return;
      }
    }

    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${targetLabel || "this account"}? This is logged and the person is notified.`)) {
      return;
    }

    setActingId(rowId);
    try {
      await applyAccountAction({ targetUserId, action, reason: reason.trim(), suspendDays, relatedReportId });
      window.alert("Done.");
    } catch (err) {
      window.alert(err.message || "Couldn't apply that action.");
    } finally {
      setActingId(null);
    }
  };

  const filtered = statusFilter === "all" ? requests : requests.filter((r) => r.status === statusFilter);

  // ---- Users tab state ----
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userListings, setUserListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [removingListingId, setRemovingListingId] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    try {
      setResults(await searchUsers(query));
    } catch (err) {
      window.alert(err.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const toggleExpand = async (user) => {
    if (expandedUserId === user.id) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(user.id);
    setListingsLoading(true);
    try {
      setUserListings(await getOwnerAllListings(user.id));
    } catch {
      setUserListings([]);
    } finally {
      setListingsLoading(false);
    }
  };

  // Same-name accounts are genuinely ambiguous by name alone — this is
  // computed once per render rather than guessed at, so the id only
  // shows up exactly when it's actually needed to tell two people
  // apart, not on every single result all the time.
  const nameCounts = results.reduce((acc, r) => {
    acc[r.name] = (acc[r.name] || 0) + 1;
    return acc;
  }, {});

  const handleRemoveListing = async (listing, ownerId, ownerName) => {
    const reason = window.prompt(`Why remove "${listing.name}" (shown in the audit log, not sent to the owner as-is)?`);
    if (!reason?.trim()) return;
    if (!window.confirm(`Remove "${listing.name}"? This can't be undone.`)) return;
    setRemovingListingId(listing.id);
    try {
      await adminRemoveListing({ listingId: listing.id, listingName: listing.name, ownerId, reason: reason.trim() });
      setUserListings((prev) => prev.filter((l) => l.id !== listing.id));
    } catch (err) {
      window.alert(err.message || "Couldn't remove that listing.");
    } finally {
      setRemovingListingId(null);
    }
  };

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12 max-w-3xl mx-auto">
      <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70 mb-6">
        <ChevronLeft size={17} /> Back
      </button>

      <h1 className="font-serif text-[26px] md:text-[30px] text-[#17231D]">Admin</h1>

      <div className="flex gap-2 mt-5">
        <button
          onClick={() => setTab("reports")}
          className={`flex-1 px-4 py-2 rounded-full text-[13.5px] font-medium border ${tab === "reports" ? "bg-[#17231D] text-white border-[#17231D]" : "border-[#17231D]/15 text-[#17231D]"}`}
        >
          Support & Reports
        </button>
        <button
          onClick={() => setTab("users")}
          className={`flex-1 px-4 py-2 rounded-full text-[13.5px] font-medium border ${tab === "users" ? "bg-[#17231D] text-white border-[#17231D]" : "border-[#17231D]/15 text-[#17231D]"}`}
        >
          Users
        </button>
      </div>

      {tab === "reports" && (
        <div className="mt-6">
          <p className="text-[13.5px] text-[#6b6f66]">
            Every support request and report submitted through the app, newest first.
          </p>

          <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
            {STATUS_FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium border ${
                  statusFilter === key ? "bg-[#17231D] text-white border-[#17231D]" : "border-[#17231D]/15 text-[#17231D]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading && <p className="text-[14px] text-[#6b6f66] mt-6">Loading…</p>}
          {error && <p className="text-[14px] text-red-600 mt-6">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-[14px] text-[#6b6f66] mt-6">Nothing here.</p>
          )}

          <div className="mt-5 space-y-3">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#17231D]/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13.5px] font-medium text-[#17231D]">
                      {categoryEmoji(r.category)} {categoryLabel(r.category)}
                    </p>
                    <p className="text-[12px] text-[#8A9089] mt-0.5">
                      {r.userName} ({r.userEmail}) — {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <select
                    value={r.status}
                    disabled={updatingId === r.id}
                    onChange={(e) => handleStatusChange(r.id, e.target.value)}
                    className="text-[12.5px] rounded-full border border-[#17231D]/15 px-2.5 py-1 disabled:opacity-60"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>

                <p className="text-[13.5px] text-[#17231D] mt-3 whitespace-pre-wrap">{r.message}</p>

                {(r.reportedName || r.listingName) && (
                  <div className="mt-3 pt-3 border-t border-[#17231D]/8 bg-[#E2932E]/8 -mx-4 px-4 py-2.5">
                    <p className="text-[11px] text-[#8A9089] uppercase tracking-wide font-medium">Reported</p>
                    {r.listingName && <p className="text-[13px] text-[#17231D]">Listing: {r.listingName}</p>}
                    {r.reportedName && (
                      <p className="text-[13px] text-[#17231D]">
                        {r.category === "report_listing" ? "Owner" : "User"}: {r.reportedName}
                        {r.reportedEmail && <span className="text-[#8A9089]"> — {r.reportedEmail}</span>}
                      </p>
                    )}
                  </div>
                )}

                {(r.listingId || r.reportedUserId) && (
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#17231D]/8">
                    {r.listingId && (
                      <p className="text-[12px] text-[#8A9089]">Listing ID: <span className="font-mono">{r.listingId}</span></p>
                    )}
                    {r.reportedUserId && (
                      <button onClick={() => visitStore?.(r.reportedUserId)} className="text-[12px] text-[#4B5D46] underline font-medium">
                        View reported user's store
                      </button>
                    )}
                  </div>
                )}

                <ActionButtons
                  actionableUserId={r.actionableUserId}
                  reportedName={r.reportedName}
                  actingId={actingId}
                  rowId={r.id}
                  onAction={(action) => runAction(r.id, r.actionableUserId, r.reportedName, action, r.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="mt-6">
          <p className="text-[13.5px] text-[#6b6f66]">
            Search any account directly by name — useful for a listing or user you want to check on even without a report against them yet.
          </p>

          <form onSubmit={handleSearch} className="flex gap-2 mt-5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or username..."
              className="flex-1 rounded-full border border-[#17231D]/15 px-4 py-2 text-[13.5px] outline-none focus:border-[#17231D]/30"
            />
            <button type="submit" disabled={searching} className="px-5 py-2 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium disabled:opacity-60">
              {searching ? "…" : "Search"}
            </button>
          </form>

          <div className="mt-5 space-y-3">
            {results.map((u) => (
              <div key={u.id} className="rounded-xl border border-[#17231D]/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13.5px] font-medium text-[#17231D]">{u.name}</p>
                    <p className="text-[12px] text-[#8A9089] mt-0.5">{u.email}</p>
                    {u.username && <p className="text-[12px] text-[#8A9089]">@{u.username}</p>}
                    {/* Shown ONLY when the name is ambiguous (more than
                        one result shares it) — otherwise this would just
                        be visual noise on every single row. */}
                    {nameCounts[u.name] > 1 && (
                      <p className="text-[11px] text-[#8A9089] font-mono mt-0.5">ID: {u.id}</p>
                    )}
                    <span className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      u.account_status === "active" ? "bg-[#4B5D46]/10 text-[#4B5D46]" :
                      u.account_status === "banned" ? "bg-red-100 text-red-700" : "bg-[#E2932E]/15 text-[#a15c1f]"
                    }`}>
                      {u.account_status}
                    </span>
                  </div>
                  <button onClick={() => visitStore?.(u.id)} className="text-[12px] text-[#4B5D46] underline font-medium shrink-0">
                    Visit shop
                  </button>
                </div>

                <button
                  onClick={() => toggleExpand(u)}
                  className="text-[12px] text-[#17231D]/70 underline mt-3"
                >
                  {expandedUserId === u.id ? "Hide listings" : "View listings"}
                </button>

                {expandedUserId === u.id && (
                  <div className="mt-3 pt-3 border-t border-[#17231D]/8 space-y-2">
                    {listingsLoading ? (
                      <p className="text-[12.5px] text-[#8A9089]">Loading…</p>
                    ) : userListings.length === 0 ? (
                      <p className="text-[12.5px] text-[#8A9089]">No listings.</p>
                    ) : (
                      userListings.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                          <span className="text-[#17231D]">{l.name} {!l.isActive && <span className="text-[#8A9089]">(inactive)</span>}</span>
                          <button
                            onClick={() => handleRemoveListing(l, u.id, u.name)}
                            disabled={removingListingId === l.id}
                            className="text-red-700 underline shrink-0 disabled:opacity-60"
                          >
                            {removingListingId === l.id ? "…" : "Remove"}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <ActionButtons
                  actionableUserId={u.id}
                  reportedName={u.name}
                  actingId={actingId}
                  rowId={u.id}
                  onAction={(action) => runAction(u.id, u.id, u.name, action, null)}
                />
              </div>
            ))}
            {!searching && query && results.length === 0 && (
              <p className="text-[13.5px] text-[#6b6f66]">No accounts match "{query}".</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
