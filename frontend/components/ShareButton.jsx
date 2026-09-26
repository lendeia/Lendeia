// ==================================================================
// FILE TYPE : COMPONENT (new)
// PURPOSE   :
//   A real share button, reused for sharing the whole app, a specific
//   item, or a shop/owner page. Uses the browser's native share sheet
//   (navigator.share) as the PRIMARY path when available — that's what
//   actually lets someone "choose what type and who": the OS-level
//   sheet already lists Facebook, Messenger, Instagram, TikTok,
//   WhatsApp, Mail, etc. (whichever apps are installed), each with its
//   own contact/friend picker. That's real platform integration; this
//   component doesn't reimplement it.
//
//   Falls back to a small custom menu on browsers without
//   navigator.share (most desktop browsers). Honest about a real
//   platform limitation there: Facebook has a real, working web share
//   URL that opens correctly without any app installed
//   (facebook.com/sharer/sharer.php) — Messenger, Instagram, and TikTok
//   do NOT have an equivalent public "share this link" web URL (they're
//   designed around in-app sharing/deep links, not link injection from
//   a browser). For those three, the fallback offers "Copy link" as a
//   real, working action, not a broken link dressed up as one.
// CONNECTS TO :
//   Used by frontend/pages/Profile/Profile.jsx (share the app),
//   Details.jsx (share an item), Store/OwnerStore.jsx (share a shop).
//   The URLs passed in are REAL deep links — see App.jsx's handling of
//   ?item=/?store= query params on load, which is what makes a shared
//   item/shop link actually open to the right place for whoever clicks
//   it, not just the homepage.
// ==================================================================
import React, { useState } from "react";
import { Share2, Link as LinkIcon, Check, X } from "lucide-react";

const PLATFORMS = [
  {
    name: "Facebook",
    emoji: "📘",
    // Real, working share URL — opens Facebook's own share dialog
    // pre-filled with the link, no app install or login state needed.
    getUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    opensDirectly: true,
  },
  {
    name: "Messenger",
    emoji: "💬",
    // Messenger has no public web "share a link" URL the way Facebook
    // does — this deep link only works if Messenger is installed
    // (mobile) and may silently fail on desktop, which is why "Copy
    // link" is offered as the real fallback below regardless.
    getUrl: (url) => `fb-messenger://share/?link=${encodeURIComponent(url)}`,
    opensDirectly: false,
  },
  {
    name: "Instagram",
    emoji: "📸",
    // No web share-URL exists for Instagram at all — copying the link
    // to paste into a bio/story/DM is the only real, working option.
    getUrl: null,
    opensDirectly: false,
  },
  {
    name: "TikTok",
    emoji: "🎵",
    // Same limitation as Instagram — no public web share-URL.
    getUrl: null,
    opensDirectly: false,
  },
];

export default function ShareButton({ url, title, text, label = "Share", className = "" }) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShareClick = async () => {
    // Native OS share sheet — the real "choose what type and who" flow.
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // User cancelled the native sheet — not an error, do nothing.
      }
      return;
    }
    setShowMenu(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={handleShareClick}
        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#17231D]/15 text-[#17231D] text-[13.5px] font-medium hover:bg-[#17231D]/5 transition-colors ${className}`}
      >
        <Share2 size={15} /> {label}
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-[1400]" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-11 w-64 bg-white rounded-2xl shadow-xl border border-[#17231D]/8 z-[1401] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#17231D]/8">
              <p className="text-[13px] font-medium text-[#17231D]">Share</p>
              <button onClick={() => setShowMenu(false)} className="text-[#6b6f66]">
                <X size={15} />
              </button>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-[13px] text-[#17231D] hover:bg-[#17231D]/[0.03] transition-colors"
            >
              {copied ? <Check size={16} className="text-[#4B5D46]" /> : <LinkIcon size={16} className="text-[#6b6f66]" />}
              {copied ? "Link copied!" : "Copy link"}
            </button>

            <div className="border-t border-[#17231D]/8">
              {PLATFORMS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    if (p.getUrl) {
                      window.open(p.getUrl(url), "_blank", "noopener,noreferrer");
                    } else {
                      handleCopyLink();
                    }
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-[13px] text-[#17231D] hover:bg-[#17231D]/[0.03] transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <span>{p.emoji}</span> {p.name}
                  </span>
                  {!p.opensDirectly && !p.getUrl && (
                    <span className="text-[10.5px] text-[#8A9089]">copies link</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
