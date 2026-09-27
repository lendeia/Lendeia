// ==================================================================
// FILE TYPE : PAGE (new) — /admin equivalent for this app's hand-rolled
//             page-state router (App.jsx's `page` state, not a real URL
//             path — matches how every other page in this app works).
// PURPOSE   :
//   The missing "someone actually reviews these" half of the support/
//   report system — support_requests already existed and already
//   included "report_listing"/"report_user" categories, but nothing
//   let anyone but the submitter see their own row. This lists every
//   submission (real access control is the database RLS policy in
//   database/schema/owner_role_and_admin_access.sql — reaching this
//   PAGE doesn't bypass that; someone without the role just sees an
//   empty list, since the query legitimately returns nothing for
//   them), and lets the reviewer mark each one open/in_progress/
//   resolved.
//   This is intentionally the first, minimal slice of the full admin
//   dashboard concept — a reports/support queue, not the larger
//   Users/Bans/Audit-log system that would come later.
// CONNECTS TO :
//   Reached via Profile.jsx's "Admin Dashboard" menu item (only shown
//   there if the account's role is admin/owner) and App.jsx's
//   `page === "admin"` route.
// ==================================================================
import React, { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { getAllSupportRequests, updateSupportRequestStatus } from "../../../backend/supabase/admin";
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

export default function Admin({ back, visitStore }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [updatingId, setUpdatingId] = useState(null);

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

  const filtered = statusFilter === "all" ? requests : requests.filter((r) => r.status === statusFilter);

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12 max-w-3xl mx-auto">
      <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70 mb-6">
        <ChevronLeft size={17} /> Back
      </button>

      <h1 className="font-serif text-[26px] md:text-[30px] text-[#17231D]">Admin — Support & Reports</h1>
      <p className="text-[13.5px] text-[#6b6f66] mt-1">
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

            {(r.listingId || r.reportedUserId) && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#17231D]/8">
                {/* Plain IDs rather than a "View" button — openItem()
                    expects a fully-loaded listing object (name, photos,
                    price, etc.), same as everywhere else it's called
                    from, not just a bare id, so wiring a working direct
                    link here would need its own listing-by-id fetch.
                    Kept simple for this first pass: copy the id, look
                    it up directly in Supabase if you need the details. */}
                {r.listingId && (
                  <p className="text-[12px] text-[#8A9089]">Listing ID: <span className="font-mono">{r.listingId}</span></p>
                )}
                {r.reportedUserId && (
                  <button
                    onClick={() => visitStore?.(r.reportedUserId)}
                    className="text-[12px] text-[#4B5D46] underline font-medium"
                  >
                    View reported user's store
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
