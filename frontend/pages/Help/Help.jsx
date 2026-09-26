// ==================================================================
// FILE TYPE : PAGE (new)
// PURPOSE   :
//   Real Help & Support hub — pick a category, write a message, it's
//   actually submitted and stored (backend/supabase/support.js), not
//   just a decorative list of buttons. Shows the person's own past
//   requests below, with status, so submitting doesn't feel like
//   shouting into a void.
// CONNECTS TO :
//   Reached via Profile.jsx. Category list is the single source of
//   truth in backend/supabase/support.js's SUPPORT_CATEGORIES.
// ==================================================================
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../../state/auth/authStore";
import { SUPPORT_CATEGORIES, submitSupportRequest, getMySupportRequests } from "../../../backend/supabase/support";

const STATUS_LABEL = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

// Real how-to guides — what a button like "How does this work?" should
// actually lead to, instead of a vague tooltip with nowhere to go.
// Each covers one real, current feature of the app (not aspirational
// copy for something unbuilt).
const GUIDES = [
  {
    id: "account",
    title: "Creating & verifying your account",
    steps: [
      "Every visitor starts with a guest session automatically — you can browse right away.",
      "To list an item, message someone, or request a rental, sign in with Google or email from Profile.",
      "Complete your Trust Profile (photo, bio, city, phone) to help others feel comfortable renting from you.",
      "Renting 5 items successfully unlocks Verified Renter status, raising your active-request limit from 2 to 5.",
    ],
  },
  {
    id: "listing",
    title: "Listing an item",
    steps: [
      "Go to List an Item, fill in the brand/model/category/condition and a real description.",
      "Upload at least 3 real photos of your actual item — stock photos aren't allowed.",
      "Pin the exact location on the map and set your daily rental price (₱0–₱100,000).",
      "Your listing stays active for your plan's length (Free: 7 days, Standard: 14, Pro: 30), then needs relisting.",
    ],
  },
  {
    id: "renting",
    title: "Requesting & paying for a rental",
    steps: [
      "On any item, choose your start and end dates — the total cost (days × daily rate) updates live.",
      "Submit the request; the owner can accept or decline it from their Dashboard.",
      "Once accepted, the item is reserved for you and the listing is taken off the marketplace for that period.",
      "Paid subscription plans are processed securely through PayMongo — free listings need no payment at all.",
    ],
  },
  {
    id: "returns",
    title: "Early returns & pricing",
    steps: [
      "If you return an item before its scheduled end date, the cost is recalculated for the days you actually used.",
      "The owner must confirm they've handed you the item first — that's what changes your button from \"Cancel\" to \"Return Item\".",
      "Cancelling (before pickup) and Returning (after pickup) are tracked separately in your Rental History.",
    ],
  },
  {
    id: "messaging",
    title: "Messaging & staying safe",
    steps: [
      "Message an owner directly from any item page — you can send photos, not just text.",
      "Keep payments and agreements within the app; never send money outside the platform.",
      "You can report a specific message or block someone entirely, right from the conversation.",
      "Phone numbers are only ever shared if both you and the other person choose to, after a rental is accepted.",
    ],
  },
  {
    id: "saving",
    title: "Saving items for later",
    steps: [
      "Tap the ♡ on any item card, or the Save button on its details page.",
      "Find everything you've saved under Rentals → Saved.",
      "Saving is private — nobody else can see what you've saved.",
    ],
  },
  {
    id: "trust",
    title: "Reviews & trust",
    steps: [
      "Once a rental is Completed or Returned, both sides can leave a review of each other.",
      "Reviews stay on a person's profile even if the related listing is later deleted.",
      "A delisted item still shows on an owner's store page, clearly labeled, so history isn't hidden.",
    ],
  },
];

export default function Help({ back, initialGuideId }) {
  const { account } = useAuth();
  const [view, setView] = useState(initialGuideId ? "guides" : "categories"); // "categories" | "form" | "guides"
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [justSubmitted, setJustSubmitted] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedGuideId, setExpandedGuideId] = useState(initialGuideId || null);
  const guideRefs = useRef({});

  useEffect(() => {
    if (initialGuideId && guideRefs.current[initialGuideId]) {
      guideRefs.current[initialGuideId].scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialGuideId]);

  const loadHistory = () => {
    if (!account?.id || account.isAnonymous) { setHistoryLoading(false); return; }
    getMySupportRequests(account.id)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  };
  useEffect(loadHistory, [account?.id, account?.isAnonymous]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!account || account.isAnonymous) {
      setError("Please sign in with Google or email (in Profile) to contact support.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitSupportRequest({ userId: account.id, category: selectedCategory, message });
      setJustSubmitted(selectedCategory);
      setSelectedCategory(null);
      setMessage("");
      setView("categories");
      loadHistory();
    } catch (err) {
      setError(err.message || "Couldn't submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const categoryLabel = (key) => SUPPORT_CATEGORIES.find(([k]) => k === key)?.[2] || key;
  const categoryEmoji = (key) => SUPPORT_CATEGORIES.find(([k]) => k === key)?.[1] || "";

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12 max-w-2xl mx-auto">
      <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70 mb-6">
        <ChevronLeft size={17} /> Back
      </button>

      <h1 className="font-serif text-[28px] text-[#17231D]">Help & Support</h1>
      <p className="text-[14px] text-[#6b6f66] mt-1.5 mb-5">How can we help?</p>

      {/* Real tab switch — guides (self-serve how-tos) vs contacting
          support directly. Previously there was only the contact-
          support half; a "How does this work?" button anywhere else in
          the app had nowhere real to send someone. */}
      <div className="flex gap-2 mb-7">
        <button
          onClick={() => { setView("guides"); setSelectedCategory(null); }}
          className={`px-4 py-2 rounded-full text-[13px] font-medium transition-colors ${
            view === "guides" ? "bg-[#17231D] text-white" : "bg-[#17231D]/[0.06] text-[#17231D]"
          }`}
        >
          Guides
        </button>
        <button
          onClick={() => setView("categories")}
          className={`px-4 py-2 rounded-full text-[13px] font-medium transition-colors ${
            view !== "guides" ? "bg-[#17231D] text-white" : "bg-[#17231D]/[0.06] text-[#17231D]"
          }`}
        >
          Contact Support
        </button>
      </div>

      {view === "guides" && (
        <div className="space-y-2.5">
          {GUIDES.map((g) => {
            const expanded = expandedGuideId === g.id;
            return (
              <div key={g.id} ref={(el) => (guideRefs.current[g.id] = el)} className="card overflow-hidden scroll-mt-24">
                <button
                  onClick={() => setExpandedGuideId(expanded ? null : g.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-[14px] font-medium text-[#17231D]">{g.title}</span>
                  <span className="text-[#8A9089] text-[18px] leading-none">{expanded ? "−" : "+"}</span>
                </button>
                {expanded && (
                  <div className="px-5 pb-5">
                    <ol className="space-y-2">
                      {g.steps.map((step, i) => (
                        <li key={i} className="flex gap-2.5 text-[13.5px] text-[#3c3f38] leading-relaxed">
                          <span className="text-[#4B5D46] font-medium shrink-0">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === "categories" && (
        <>
          {justSubmitted && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[#4B5D46]/10 px-4 py-3.5 mb-6">
              <CheckCircle2 size={17} className="text-[#4B5D46] shrink-0 mt-0.5" />
              <p className="text-[13.5px] text-[#4B5D46]">
                Your {categoryLabel(justSubmitted).toLowerCase()} request has been submitted. We'll get back to you.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {SUPPORT_CATEGORIES.map(([key, emoji, label]) => (
              <button
                key={key}
                onClick={() => { setSelectedCategory(key); setView("form"); setJustSubmitted(null); setError(null); }}
                className="card card-hover flex flex-col items-start gap-2 p-4 text-left"
              >
                <span className="text-[22px]">{emoji}</span>
                <span className="text-[13.5px] font-medium text-[#17231D]">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {view === "form" && selectedCategory && (
        <form onSubmit={handleSubmit} className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[20px]">{categoryEmoji(selectedCategory)}</span>
            <p className="font-medium text-[15px] text-[#17231D]">{categoryLabel(selectedCategory)}</p>
            <button type="button" onClick={() => setView("categories")} className="ml-auto text-[12.5px] text-[#4B5D46] font-medium">
              Change category
            </button>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Describe what you need help with…"
            className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] outline-none"
          />
          {error && <p className="text-[12.5px] text-red-600 mt-2">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !message.trim()}
            className="btn-modern mt-4 px-5 py-2.5 rounded-full bg-[#17231D] text-white text-[13.5px] font-medium disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Submit request"}
          </button>
        </form>
      )}

      {view === "categories" && !account?.isAnonymous && history.length > 0 && (
        <div className="mt-10">
          <h2 className="font-medium text-[15px] text-[#17231D] mb-3">Your requests</h2>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[13.5px] font-medium text-[#17231D]">
                    {categoryEmoji(h.category)} {categoryLabel(h.category)}
                  </p>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#17231D]/[0.06] text-[#6b6f66]">
                    {STATUS_LABEL[h.status] || h.status}
                  </span>
                </div>
                <p className="text-[12.5px] text-[#6b6f66] mt-1.5 line-clamp-2">{h.message}</p>
                <p className="text-[11px] text-[#8A9089] mt-1.5">
                  {new Date(h.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
