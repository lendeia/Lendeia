// ==================================================================
// FILE TYPE : COMPONENT (shared, new)
// PURPOSE   :
//   "Active now" / "Active recently" — computed entirely from a real
//   `lastActiveAt` timestamp (see backend/supabase/users.js's
//   updateMyLastActive heartbeat), never a fabricated status. Shows
//   nothing at all once someone's been away long enough that a vague
//   "last seen" label would be more misleading than useful — matches
//   the privacy-conscious convention most chat apps use (exact last-seen
//   times aren't shown, only a coarse recency bucket).
// CONNECTS TO :
//   Used by Details.jsx, Store/OwnerStore.jsx, Messages.jsx.
// ==================================================================
import React from "react";

const ACTIVE_NOW_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVE_RECENTLY_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function PresenceBadge({ lastActiveAt, size = "sm" }) {
  if (!lastActiveAt) return null;
  const elapsed = Date.now() - new Date(lastActiveAt).getTime();
  if (elapsed < 0) return null;

  const textSize = size === "sm" ? "text-[11px]" : "text-[12.5px]";
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";

  if (elapsed <= ACTIVE_NOW_MS) {
    return (
      <span className={`inline-flex items-center gap-1 ${textSize} text-[#4B5D46] font-medium`}>
        <span className={`${dotSize} rounded-full bg-[#4B5D46]`} />
        Active now
      </span>
    );
  }
  if (elapsed <= ACTIVE_RECENTLY_MS) {
    return (
      <span className={`inline-flex items-center gap-1 ${textSize} text-[#8A9089]`}>
        <span className={`${dotSize} rounded-full bg-[#8A9089]/50`} />
        Active recently
      </span>
    );
  }
  return null;
}
