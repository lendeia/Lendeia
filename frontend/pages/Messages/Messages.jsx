// ==================================================================
// FILE TYPE : PAGE
// PURPOSE   :
//   Real messaging UI: a conversation list on the left (stacked above
//   the thread on mobile) and the active conversation's messages +
//   composer on the right. Polls for new conversations/messages every
//   few seconds while mounted — see backend/supabase/messages.js's file
//   header for why this is polling rather than true real-time.
//   Now also supports sending a photo (with an optional caption),
//   reporting an individual message, and blocking the other person —
//   blocking is enforced at the database level (they can no longer
//   message you either), not just hidden in this UI.
// CONNECTS TO :
//   Uses backend/supabase/messages.js and blocking.js. `initialOtherUserId`
//   (optional) is passed by App.jsx when arriving here via a "Message"
//   button on Details.jsx/OwnerStore.jsx — it immediately starts/opens
//   that conversation instead of requiring the person to find it in the
//   list.
// ==================================================================
import React, { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, MessageCircle, Image as ImageIcon, MoreVertical, ShieldOff, X, Phone } from "lucide-react";
import { useAuth } from "../../../state/auth/authStore";
import PresenceBadge from "../../components/PresenceBadge";
import { getUserPhone } from "../../../backend/supabase/users";
import {
  getOrCreateConversation,
  getMyConversations,
  getMessages,
  sendMessage,
  sendMessagePhoto,
  markConversationRead,
  reportMessage,
} from "../../../backend/supabase/messages";
import { blockUser } from "../../../backend/supabase/blocking";
import { getPublicProfile } from "../../../backend/supabase/users";

const POLL_MS = 4000;

// Date separators between messages from different days — "Today" /
// "Yesterday" for recent ones, a full date otherwise.
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatDateLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function Messages({ initialOtherUserId, back, visitProfile, goToHelp }) {
  const { account } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSafetyTip, setShowSafetyTip] = useState(true);

  // The other person's phone number — shown at the top of the chat whenever
  // they added one (no hide/show switch any more). null = none added.
  const [theirPhone, setTheirPhone] = useState(null);
  const bottomRef = useRef(null);
  const startedInitialRef = useRef(false);
  const fileInputRef = useRef(null);

  const refreshList = useCallback(() => {
    if (!account?.id) return;
    getMyConversations(account.id)
      .then(setConversations)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingList(false));
  }, [account?.id]);

  useEffect(() => {
    refreshList();
    const id = setInterval(refreshList, POLL_MS);
    return () => clearInterval(id);
  }, [refreshList]);

  useEffect(() => {
    if (!initialOtherUserId || !account?.id || startedInitialRef.current) return;
    startedInitialRef.current = true;
  }, [initialOtherUserId, account?.id]);

  // Previously this eagerly called getOrCreateConversation() the moment
  // Messages opened with a target user (e.g. from a "Message" button on
  // Details.jsx/OwnerStore.jsx) — creating a REAL, permanent conversation
  // row even if the person never actually typed or sent anything at
  // all. Now it only opens an EXISTING conversation if one's already
  // there; otherwise it holds the intended recipient's basic public
  // info in pendingRecipient so the thread UI can render normally
  // (their name/photo, an empty message list, the composer) without
  // anything being written to the database yet. Nothing real gets
  // created until handleSend/handleSendPhoto actually fires.
  const [pendingRecipient, setPendingRecipient] = useState(null);
  useEffect(() => {
    if (!initialOtherUserId || !account?.id || loadingList) return;
    const existing = conversations.find((c) => c.otherUserId === initialOtherUserId);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    if (pendingRecipient?.id === initialOtherUserId || activeId) return;
    getPublicProfile(initialOtherUserId)
      .then((profile) => { if (profile) { setPendingRecipient(profile); setThread([]); } })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOtherUserId, account?.id, loadingList, conversations]);

  const refreshThread = useCallback(() => {
    if (!activeId) return;
    getMessages(activeId)
      .then(setThread)
      .catch((err) => setError(err.message));
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    refreshThread();
    if (account?.id) markConversationRead(activeId, account.id).catch(() => {});
    const id = setInterval(() => {
      refreshThread();
      if (account?.id) markConversationRead(activeId, account.id).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [activeId, account?.id, refreshThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const activeConvo = conversations.find((c) => c.id === activeId);
  // Used by the header/thread UI in place of activeConvo whenever
  // there's no real conversation yet — same shape, so nothing else
  // needs to know the difference between "a real conversation" and
  // "about to message someone for the first time."
  const displayConvo = activeConvo || (pendingRecipient
    ? {
        otherUserId: pendingRecipient.id,
        otherName: pendingRecipient.name,
        otherAvatar: pendingRecipient.avatarUrl,
        otherLastActiveAt: pendingRecipient.lastActiveAt,
      }
    : null);

  // Loads the other person's phone number whenever the open conversation
  // (specifically, who the other person is) changes.
  useEffect(() => {
    setTheirPhone(null);
    if (!displayConvo?.otherUserId || !account?.id || account.isAnonymous) return undefined;
    let cancelled = false;
    getUserPhone(displayConvo.otherUserId)
      .then((phone) => { if (!cancelled) setTheirPhone(phone); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [displayConvo?.otherUserId, account?.id, account?.isAnonymous]);

  // Only point where a conversation actually gets created now — right
  // when a message is genuinely about to be sent, not just from
  // opening the thread. Returns the real conversation id either way
  // (existing or freshly created) so callers don't need to know which.
  const ensureConversationId = async () => {
    if (activeId) return activeId;
    if (!pendingRecipient) return null;
    const id = await getOrCreateConversation(pendingRecipient.id);
    setActiveId(id);
    setPendingRecipient(null);
    return id;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !account?.id || (!activeId && !pendingRecipient)) return;
    setSending(true);
    try {
      const convoId = await ensureConversationId();
      const sent = await sendMessage(convoId, account.id, draft);
      setThread((prev) => [
        ...prev,
        { id: sent.id, senderId: sent.senderId, senderName: account.name, content: sent.content, imageUrl: sent.imageUrl, createdAt: sent.createdAt, readAt: null },
      ]);
      setDraft("");
      refreshList();
    } catch (err) {
      setError(err.message || "Couldn't send that message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handlePhotoChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !account?.id || (!activeId && !pendingRecipient)) return;
    setSending(true);
    setError(null);
    try {
      const convoId = await ensureConversationId();
      const sent = await sendMessagePhoto(convoId, account.id, file, draft);
      setThread((prev) => [
        ...prev,
        { id: sent.id, senderId: sent.senderId, senderName: account.name, content: sent.content, imageUrl: sent.imageUrl, createdAt: sent.createdAt, readAt: null },
      ]);
      setDraft("");
      refreshList();
    } catch (err) {
      setError(err.message || "Couldn't send that photo. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleReportMessage = async (messageId) => {
    if (!account) return;
    const reason = window.prompt("Why are you reporting this message? (e.g. abusive, spam, scam)");
    if (!reason || !reason.trim()) return;
    try {
      await reportMessage({ messageId, reporterId: account.id, reason: reason.trim() });
      window.alert("Thanks — this message has been reported for review.");
    } catch (err) {
      window.alert(err.message || "Couldn't submit the report. Please try again.");
    }
  };

  const handleBlock = async () => {
    if (!displayConvo || !account) return;
    if (!window.confirm(`Block ${displayConvo.otherName}? They won't be able to message you, and you won't be able to message them.`)) return;
    try {
      await blockUser(displayConvo.otherUserId);
      setShowMenu(false);
      setActiveId(null);
      setPendingRecipient(null);
      refreshList();
      window.alert(`${displayConvo.otherName} has been blocked.`);
    } catch (err) {
      window.alert(err.message || "Couldn't block this user. Please try again.");
    }
  };

  if (account?.isAnonymous) {
    return (
      <div className="px-6 md:px-12 py-16 max-w-sm mx-auto text-center">
        <p className="text-[14px] text-[#6b6f66]">
          Please sign in with Google or email (in Profile) to use messages.
        </p>
      </div>
    );
  }

  return (
    <div className="md:px-12 md:py-8 max-w-5xl mx-auto">
      {/* Fixed, not just height-constrained, on mobile — pins the whole
          panel to the viewport between the two nav bars regardless of
          any page-level scroll, rather than relying on a height
          calculation to happen to prevent the page itself from ever
          scrolling. Desktop keeps the original constrained-height
          (not fixed) layout, since it sits inline on the page there. */}
      <div className="fixed top-[60px] bottom-[64px] left-0 right-0 md:static md:top-auto md:bottom-auto md:grid md:grid-cols-[280px_1fr] md:gap-6 md:border md:border-[#17231D]/8 md:rounded-2xl md:overflow-hidden md:bg-white md:h-[78vh]">
        <div className={`${activeId || pendingRecipient ? "hidden md:block" : "block"} h-full border-r border-[#17231D]/8 overflow-y-auto min-h-0`}>
          <div className="px-4 py-4 border-b border-[#17231D]/8 flex items-center gap-2">
            {back && (
              <button onClick={back} className="md:hidden text-[#17231D]/70">
                <ChevronLeft size={18} />
              </button>
            )}
            <h1 className="font-serif text-[18px] text-[#17231D]">Messages</h1>
          </div>

          {loadingList ? (
            <p className="px-4 py-6 text-[13.5px] text-[#6b6f66]">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-6 text-[13.5px] text-[#6b6f66]">No conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveId(c.id); setPendingRecipient(null); }}
                className={`w-full text-left px-4 py-3.5 border-b border-[#17231D]/6 hover:bg-[#17231D]/[0.02] transition-colors flex items-center gap-3 ${
                  activeId === c.id ? "bg-[#17231D]/[0.03]" : ""
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0">
                  {c.otherAvatar ? (
                    <img src={c.otherAvatar} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-serif text-[14px] text-[#6b6f66]">{c.otherName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[14px] font-medium text-[#17231D] truncate">{c.otherName}</p>
                    {c.unreadCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-[#E2932E] text-[#17231D] text-[10.5px] font-semibold flex items-center justify-center shrink-0">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-[#8A9089] truncate mt-0.5">{c.lastMessage || "No messages yet"}</p>
                  <PresenceBadge lastActiveAt={c.otherLastActiveAt} />
                </div>
              </button>
            ))
          )}
        </div>

        <div className={`${activeId || pendingRecipient ? "flex" : "hidden md:flex"} flex-col h-full min-h-0`}>
          {!activeId && !pendingRecipient ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <MessageCircle size={28} className="text-[#8A9089] mb-2" />
              <p className="text-[13.5px] text-[#8A9089]">Select a conversation to view messages.</p>
            </div>
          ) : (
            <>
              {/* shrink-0 added — without it, this header could get
                  squeezed by flexbox's default behavior whenever the
                  scrollable content below (e.g. the safety banner) grew
                  taller than the available space, instead of only the
                  scrollable area shrinking. That's what was actually
                  causing the header/composer to visually disappear. */}
              {/* sticky + z-10 + bg-white added — shrink-0 alone keeps
                  this from being squeezed by flex layout, but doesn't
                  guarantee it stays visually pinned if anything ever
                  causes the page/container itself to scroll rather than
                  just the message list inside it. Sticky positioning
                  pins it regardless of which element ends up scrolling. */}
              <div className="shrink-0 sticky top-0 z-10 bg-white px-4 py-3.5 border-b border-[#17231D]/8 flex items-center gap-2.5">
                <button onClick={() => { setActiveId(null); setPendingRecipient(null); }} className="md:hidden text-[#17231D]/70">
                  <ChevronLeft size={18} />
                </button>
                {/* Clicking the avatar or name now navigates to that
                    person's real profile — previously this was static,
                    unclickable display text. */}
                <button
                  onClick={() => displayConvo?.otherUserId && visitProfile?.(displayConvo.otherUserId)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <div className="w-8 h-8 rounded-full bg-[#17231D]/8 overflow-hidden flex items-center justify-center shrink-0">
                    {displayConvo?.otherAvatar ? (
                      <img src={displayConvo.otherAvatar} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <span className="font-serif text-[12px] text-[#6b6f66]">
                        {(displayConvo?.otherName || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-medium text-[#17231D] truncate">{displayConvo?.otherName || "Conversation"}</p>
                    <PresenceBadge lastActiveAt={displayConvo?.otherLastActiveAt} />
                  </div>
                </button>

                {/* Block — enforced server-side (database/schema/
                    messaging_photos_block_report.sql), not just a UI
                    hide. Blocking prevents EITHER side from messaging
                    the other from that point on. */}
                <div className="relative">
                  <button onClick={() => setShowMenu((v) => !v)} className="text-[#17231D]/60 p-1">
                    <MoreVertical size={18} />
                  </button>
                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-[900]" onClick={() => setShowMenu(false)} />
                      <div className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-[#17231D]/8 z-[901] overflow-hidden w-40">
                        <button
                          onClick={handleBlock}
                          className="w-full text-left px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <ShieldOff size={14} /> Block user
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Contact number — always shown when the other person added one
                  (the old "share my number" opt-in was removed). */}
              {theirPhone && (
                <div className="shrink-0 px-4 py-2.5 border-b border-[#17231D]/8 bg-[#4B5D46]/5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Phone size={14} className="text-[#4B5D46] shrink-0" />
                    <a
                      href={`tel:${theirPhone.replace(/[^\d+]/g, "")}`}
                      className="text-[13px] text-[#17231D] font-medium truncate hover:underline"
                    >
                      {theirPhone}
                    </a>
                  </div>
                </div>
              )}

              {/* min-h-0 is required here — without it, a flex child
                  with overflow-y-auto can still grow past its allotted
                  space instead of actually scrolling, which was part of
                  what let this area's content push against/displace the
                  header and composer instead of just scrolling on its
                  own. */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                {/* Real safety reminder, tied to actual policy — see
                    frontend/pages/Legal/Legal.jsx's "Messages and
                    communications" section (Terms & Conditions I).
                    Dismissible so it doesn't nag on every message. */}
                {showSafetyTip && (
                  <div className="flex items-start gap-2 bg-[#E2932E]/10 rounded-xl px-3.5 py-2.5 text-[11.5px] text-[#8a5a13] leading-relaxed">
                    <span className="shrink-0">ℹ️</span>
                    <span className="flex-1">
                      Only rent with people you can verify — check their profile, reviews, and past
                      rentals before agreeing to anything. Report anything that looks
                      like a scam.{" "}
                      {goToHelp && (
                        <button onClick={() => goToHelp("messaging")} className="underline font-medium">
                          Learn more
                        </button>
                      )}
                    </span>
                    <button onClick={() => setShowSafetyTip(false)} className="shrink-0 text-[#8a5a13]/60">
                      <X size={13} />
                    </button>
                  </div>
                )}

                {thread.map((m, i) => {
                  const mine = m.senderId === account.id;
                  // Date separator — shown once per calendar day, right
                  // before that day's first message. Previously only a
                  // time-of-day showed on each bubble, with no way to
                  // tell which day a message was actually sent on once
                  // a conversation spanned more than one.
                  const prev = thread[i - 1];
                  const showDateSeparator = !prev || !isSameDay(new Date(m.createdAt), new Date(prev.createdAt));
                  return (
                    <React.Fragment key={m.id}>
                      {showDateSeparator && (
                        <div className="flex items-center justify-center my-2">
                          <span className="px-3 py-1 rounded-full bg-[#17231D]/6 text-[10.5px] font-medium text-[#6b6f66]">
                            {formatDateLabel(new Date(m.createdAt))}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${mine ? "justify-end" : "justify-start"} group`}>
                      <div className="max-w-[75%]">
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-[13.5px] ${
                            mine ? "bg-[#17231D] text-white rounded-br-sm" : "bg-[#17231D]/6 text-[#17231D] rounded-bl-sm"
                          }`}
                        >
                          {m.imageUrl && (
                            <img
                              src={m.imageUrl}
                              className="rounded-lg max-w-full max-h-64 object-cover mb-1.5"
                              alt="Sent photo"
                            />
                          )}
                          {m.content && <span>{m.content}</span>}
                          <p className={`text-[10.5px] mt-1 ${mine ? "text-white/50" : "text-[#8A9089]"}`}>
                            {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                        {!mine && (
                          <button
                            onClick={() => handleReportMessage(m.id)}
                            className="text-[10.5px] text-[#8A9089] hover:text-red-600 underline mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Report
                          </button>
                        )}
                      </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {error && <p className="shrink-0 px-4 text-[12.5px] text-red-600">{error}</p>}

              <form onSubmit={handleSend} className="shrink-0 px-4 py-3 border-t border-[#17231D]/8 flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
                <button
                  type="button"
                  onClick={handlePickPhoto}
                  disabled={sending}
                  className="text-[#17231D]/60 p-2 shrink-0 disabled:opacity-50"
                  title="Send a photo"
                >
                  <ImageIcon size={19} />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message…"
                  className="flex-1 rounded-full border border-[#17231D]/15 px-4 py-2.5 text-[13.5px] outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="px-4 py-2.5 rounded-full bg-[#17231D] text-white text-[13px] font-medium disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
