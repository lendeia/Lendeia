// ==================================================================
// FILE TYPE : PAGE
// PURPOSE   :
//   Public profile page — works for ANY user, not just listing owners.
//   Originally only reachable via "Visit Store" from a listing (hence
//   the file name), it's now also reachable by clicking a renter's name
//   in Dashboard.jsx's Rental Requests, or a reviewer's name in a
//   review list — so a pure renter with no listings needs a sensible
//   page too, not an "owner-only" one. Shows the person's public
//   profile (name/photo — never email or anything private), their REAL
//   aggregate rating + completed-rental count + per-category rating
//   breakdown (all computed from actual reviews/rentals, never
//   fabricated), their currently-active listings (if any), and the
//   text of reviews they've received (as owner and/or as renter).
// CONNECTS TO :
//   Reached via App.jsx's `visitStore`/`visitProfile` navigation from
//   Details.jsx, Dashboard.jsx (renter names), and this page's own
//   reviewer names (clicking a reviewer re-navigates here for them).
//   Fetches the profile via backend/supabase/users.js, reputation via
//   backend/supabase/reviews.js, and filters the global `listings` array
//   from state/listings/listingsStore.jsx down to this person's items.
// ==================================================================
import React, { useEffect, useState } from "react";
import { ChevronLeft, Star, MessageCircle, ShieldCheck } from "lucide-react";
import ListingCard from "../../components/ListingCard";
import ShareButton from "../../components/ShareButton";
import { getStoreSharePreviewUrl } from "../../../backend/supabase/client";
import PhotoViewerModal from "../../components/PhotoViewerModal";
import PresenceBadge from "../../components/PresenceBadge";
import { getOwnerAllListings } from "../../../backend/supabase/listings";
import { useAuth } from "../../../state/auth/authStore";
import { getPublicProfile } from "../../../backend/supabase/users";
import { getUserReputationSummary, getReviewsForOwner, reportReview } from "../../../backend/supabase/reviews";
import { getRenterVerification } from "../../../backend/supabase/rentals";

function StarRow({ rating, size = 14 }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(rating) ? "fill-[#E2932E] text-[#E2932E]" : "text-[#17231D]/15"}
        />
      ))}
    </span>
  );
}

// Small avatar for a reviewer — previously review rows only ever showed
// a name as plain text, no way to see who the person actually is beyond
// that. Falls back to their initial letter, same convention used for
// the main profile header avatar on this page.
function Avatar({ url, name, size = 28 }) {
  return (
    <div
      className="rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} className="w-full h-full object-cover" alt="" />
      ) : (
        <span className="font-serif text-[#6b6f66]" style={{ fontSize: size * 0.45 }}>
          {(name || "?").charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

const CATEGORY_LABELS = {
  communication: "Communication",
  reliability: "Reliability",
  itemAccuracy: "Item matched listing",
  rentalExperience: "Rental experience",
  returnCondition: "Returned item properly",
  agreementFollowed: "Followed rental agreement",
};

export default function OwnerStore({ ownerId, back, openItem, messageUser, visitProfile, goToHelp }) {
  const { account } = useAuth();
  const [profile, setProfile] = useState(null);
  const [reputation, setReputation] = useState({ avgRating: 0, reviewCount: 0, completedRentals: 0, categories: null });
  const [isVerified, setIsVerified] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [ownerListings, setOwnerListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chatNotice, setChatNotice] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getPublicProfile(ownerId),
      getUserReputationSummary(ownerId),
      getReviewsForOwner(ownerId),
      getRenterVerification(ownerId),
      // Full listing set — active AND delisted — so a delisted item
      // still shows here (with a "Not currently listed" label) instead
      // of silently vanishing the moment it's taken off the
      // marketplace. Previously this page only ever read from the
      // shared active-only listings context, which made that
      // impossible.
      getOwnerAllListings(ownerId),
    ])
      .then(([p, rep, rv, verification, allListings]) => {
        if (cancelled) return;
        setProfile(p);
        setReputation(rep);
        setReviews(rv);
        setIsVerified(verification.isVerified);
        setOwnerListings(allListings);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ownerId]);

  const activeCategoryEntries = reputation.categories
    ? Object.entries(reputation.categories).filter(([, v]) => v !== null && v !== undefined)
    : [];

  // Minimal report action — records the report (see backend/supabase/
  // reviews.js's reportReview file comment: there is no admin queue that
  // reads/acts on this yet, that needs a real admin-role system first).
  // A plain prompt() is intentionally lightweight here rather than a
  // full modal, since this is a rare, low-frequency action.
  const handleReportReview = async (reviewId) => {
    if (!account || account.isAnonymous) {
      window.alert("Please sign in to report a review.");
      return;
    }
    const reason = window.prompt("Why are you reporting this review? (e.g. fake, abusive, off-topic)");
    if (!reason || !reason.trim()) return;
    try {
      await reportReview({ reviewId, reporterId: account.id, reason: reason.trim() });
      window.alert("Thanks — this review has been reported for review.");
    } catch (err) {
      window.alert(err.message || "Couldn't submit the report. Please try again.");
    }
  };

  if (!ownerId) return null;

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70">
          <ChevronLeft size={17} /> Back
        </button>
        {/* Real server-rendered preview (owner's photo/name) — see
            backend/supabase/client.js's getStoreSharePreviewUrl and
            supabase/functions/share-item's ?store= branch for why the
            raw app URL alone can't show a rich preview here. */}
        <ShareButton
          url={getStoreSharePreviewUrl(ownerId)}
          title={profile?.name ? `${profile.name}'s Store` : "Store"}
          text={`Check out ${profile?.name || "this"}'s store on Lendeia`}
          label="Share"
        />
      </div>

      <button
        onClick={() => goToHelp?.(null, { category: "report_user", reportedUserId: ownerId })}
        className="text-[11.5px] text-[#8A9089] hover:text-[#a15c1f] underline mb-4"
      >
        Report this user
      </button>

      {loading && <p className="text-[14px] text-[#6b6f66]">Loading profile…</p>}
      {error && <p className="text-[14px] text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Clickable avatar — opens the same full-screen photo
                viewer already used for your own photo in Profile.jsx,
                now reused so it works for viewing someone else's too. */}
            <button
              onClick={() => setViewingPhoto(true)}
              className="w-16 h-16 rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer"
              title="View profile photo"
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} className="w-full h-full object-cover" />
              ) : (
                <span className="font-serif text-[22px] text-[#6b6f66]">
                  {(profile?.name || "?").charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-[22px] text-[#17231D]">
                  {profile?.name || "Guest"}{ownerListings.length > 0 ? "'s Store" : "'s Profile"}
                </h1>
                {isVerified && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4B5D46]/12 text-[#4B5D46] text-[11px] font-semibold border border-[#4B5D46]/30">
                    <ShieldCheck size={11} /> Verified
                  </span>
                )}
              </div>
              {/* Real trust-profile fields — previously never shown
                  anywhere but the account owner's own Profile page, so
                  editing your username/bio/city never actually appeared
                  when someone else viewed your public profile. */}
              {profile?.username && (
                <p className="text-[12.5px] text-[#4B5D46] font-medium mt-0.5">@{profile.username}</p>
              )}
              <PresenceBadge lastActiveAt={profile?.lastActiveAt} />
              {reputation.reviewCount > 0 ? (
                <p className="flex items-center gap-1.5 text-[13.5px] text-[#6b6f66] mt-1">
                  <StarRow rating={reputation.avgRating} />
                  {reputation.avgRating} · {reputation.reviewCount} review{reputation.reviewCount === 1 ? "" : "s"}
                </p>
              ) : (
                <p className="text-[13.5px] text-[#8A9089] mt-1">New · no reviews yet</p>
              )}
              <p className="text-[13px] text-[#8A9089] mt-0.5">
                {reputation.completedRentals} completed rental{reputation.completedRentals === 1 ? "" : "s"}
                {ownerListings.length > 0 && ` · ${ownerListings.length} item${ownerListings.length === 1 ? "" : "s"} listed`}
                {profile?.city && ` · ${profile.city}`}
              </p>
            </div>

            <div className="ml-auto">
              {account?.id !== ownerId && (
                <button
                  onClick={() => {
                    if (!account || account.isAnonymous) {
                      setChatNotice("signin");
                      return;
                    }
                    messageUser?.(ownerId);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13.5px] font-medium hover:bg-[#17231D]/5 transition-colors"
                >
                  <MessageCircle size={15} /> Chat
                </button>
              )}
            </div>
          </div>

          {profile?.bio && (
            <p className="text-[13.5px] text-[#3c3f38] mt-4 leading-relaxed max-w-xl">{profile.bio}</p>
          )}

          {chatNotice === "signin" && (
            <p className="text-[12.5px] text-[#a15c1f] bg-[#E2932E]/10 rounded-lg px-3 py-2 mt-3">
              Please sign in with Google or email (in Profile) before messaging.
            </p>
          )}

          {/* Category rating breakdown — only shows categories this
              person has actually been rated on (a pure renter will
              never show "Returned item properly" scores as an owner
              would, since nobody rates a renter on that). */}
          {activeCategoryEntries.length > 0 && (
            <div className="mt-5 rounded-xl border border-[#17231D]/8 bg-white p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              {activeCategoryEntries.map(([key, value]) => (
                <div key={key}>
                  <p className="text-[11.5px] text-[#8A9089]">{CATEGORY_LABELS[key] || key}</p>
                  <p className="flex items-center gap-1 text-[13px] font-medium text-[#17231D] mt-0.5">
                    <Star size={12} className="fill-[#E2932E] text-[#E2932E]" /> {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {ownerListings.length > 0 && (
            <>
              <h2 className="font-medium text-[15px] text-[#17231D] mt-8 mb-3">Items</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
                {ownerListings.map((item) =>
                  item.isActive ? (
                    <ListingCard key={item.id} item={item} onOpen={openItem} />
                  ) : (
                    // Still genuinely locked — no click-through, no
                    // onClick at all — just a plainer visual treatment
                    // now: normal cursor (not a "blocked" cursor icon)
                    // and no lock-icon overlay, just the dimmed photo
                    // and the "Not currently listed" label.
                    <div key={item.id} className="relative rounded-2xl overflow-hidden bg-[#e9e5d8] select-none">
                      <div className="aspect-[4/3]">
                        <img src={item.img} className="w-full h-full object-cover grayscale opacity-50" alt="" />
                      </div>
                      <div className="p-3">
                        <p className="text-[13px] font-medium text-[#6b6f66] truncate">{item.name}</p>
                        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-[#17231D] text-white text-[10px] font-semibold">
                          Not currently listed
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}

          <h2 className="font-medium text-[15px] text-[#17231D] mt-10 mb-3">Reviews</h2>
          {reviews.length === 0 ? (
            <p className="text-[14px] text-[#6b6f66]">No reviews yet.</p>
          ) : (
            <div className="rounded-xl border border-[#17231D]/8 bg-white divide-y divide-[#17231D]/8">
              {reviews.map((r) => (
                <div key={r.id} className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    {/* Clicking a reviewer's name/avatar re-navigates
                        this same page for THEM — lets anyone browse from
                        review to review to see who's who, not just a
                        static name with no face attached to it. */}
                    <button
                      onClick={() => visitProfile?.(r.reviewerId)}
                      className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                    >
                      <Avatar url={r.reviewerAvatarUrl} name={r.reviewerName} />
                      <span className="text-[13.5px] font-medium text-[#17231D] hover:underline">{r.reviewerName}</span>
                    </button>
                    <StarRow rating={r.rating} size={12} />
                  </div>
                  {r.comment && <p className="text-[13.5px] text-[#3c3f38] mt-1.5">{r.comment}</p>}
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[11.5px] text-[#8A9089]">
                      {new Date(r.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                    <button
                      onClick={() => handleReportReview(r.id)}
                      className="text-[11px] text-[#8A9089] hover:text-red-600 underline"
                    >
                      Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewingPhoto && (
        <PhotoViewerModal
          photoUrl={profile?.avatarUrl}
          initial={(profile?.name || "?").charAt(0).toUpperCase()}
          onClose={() => setViewingPhoto(false)}
        />
      )}
    </div>
  );
}
