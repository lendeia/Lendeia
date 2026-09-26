// ==================================================================
// FILE TYPE : SUPABASE BACKEND — MESSAGES (real, new)
// PURPOSE   :
//   Real CRUD for the messaging system (database/schema/messaging.sql).
//   getMyConversations() does a few plain queries and joins the results
//   client-side (participant info + last message + unread count) rather
//   than one complex SQL join, since Supabase-js doesn't have a clean
//   way to express "last row per group" — fine at this app's scale, but
//   would need a real SQL view if conversation volume ever got large.
//
//   POLLING, NOT REAL-TIME: frontend/pages/Messages/Messages.jsx calls
//   getMessages()/getMyConversations() on an interval rather than
//   subscribing to Supabase's realtime channels — see
//   database/schema/messaging.sql's file header for why this is an
//   honest, flagged simplification rather than hidden.
// CONNECTS TO :
//   Uses backend/supabase/client.js. Enforcement lives entirely in
//   database/schema/messaging.sql (RLS + the get_or_create_conversation
//   function) — this file relies on that, it does not re-implement it.
// ==================================================================
import { getSupabaseClient } from "./client";
import { uploadMessagePhoto } from "./storage";

/**
 * Gets (or atomically creates) the 1:1 conversation with `otherUserId`.
 * Throws the database's own message if this would be self-messaging, if
 * the caller is anonymous, or if the other user doesn't exist — see
 * get_or_create_conversation() in database/schema/messaging.sql for the
 * actual enforcement; this is just the call site.
 * @param {string} otherUserId
 * @returns {Promise<string>} conversationId
 */
export async function getOrCreateConversation(otherUserId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_or_create_conversation", {
    other_user_id: otherUserId,
  });
  if (error) throw error;
  return data;
}

/**
 * All conversations the given user is part of, newest activity first,
 * each with the OTHER participant's display info, the last message
 * preview, and an unread count (messages from the other person that
 * this user hasn't marked read yet).
 * @param {string} myUserId
 */
export async function getMyConversations(myUserId) {
  const supabase = getSupabaseClient();

  const { data: myParts, error: e1 } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", myUserId);
  if (e1) throw e1;

  const ids = (myParts || []).map((p) => p.conversation_id);
  if (!ids.length) return [];

  const { data: others, error: e2 } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id, users(name, avatar_url, last_active_at)")
    .in("conversation_id", ids)
    .neq("user_id", myUserId);
  if (e2) throw e2;

  const { data: msgs, error: e3 } = await supabase
    .from("messages")
    .select("conversation_id, content, created_at, sender_id, read_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });
  if (e3) throw e3;

  const lastByConvo = {};
  const unreadByConvo = {};
  for (const m of msgs || []) {
    if (!lastByConvo[m.conversation_id]) lastByConvo[m.conversation_id] = m;
    if (m.sender_id !== myUserId && !m.read_at) {
      unreadByConvo[m.conversation_id] = (unreadByConvo[m.conversation_id] || 0) + 1;
    }
  }

  return ids
    .map((id) => {
      const other = (others || []).find((o) => o.conversation_id === id);
      const last = lastByConvo[id];
      return {
        id,
        otherUserId: other?.user_id ?? null,
        otherName: other?.users?.name || "Guest",
        otherAvatar: other?.users?.avatar_url || null,
        otherLastActiveAt: other?.users?.last_active_at || null,
        lastMessage: last?.content || "",
        lastMessageAt: last?.created_at || null,
        unreadCount: unreadByConvo[id] || 0,
      };
    })
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
}

/**
 * All messages in a conversation, oldest first. RLS guarantees this
 * returns nothing (rather than an error) if the caller isn't a
 * participant — see messages_select_participant in
 * database/schema/messaging.sql.
 * @param {string} conversationId
 */
export async function getMessages(conversationId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, content, image_url, created_at, read_at, users!messages_sender_id_fkey(name)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    senderName: m.users?.name || "Guest",
    content: m.content,
    imageUrl: m.image_url || null,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));
}

/**
 * @param {string} conversationId
 * @param {string} senderId
 * @param {string} content
 */
export async function sendMessage(conversationId, senderId, content) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Message can't be empty.");
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, content: trimmed })
    .select("id, sender_id, content, image_url, created_at")
    .single();
  if (error) throw error;
  return { id: data.id, senderId: data.sender_id, content: data.content, imageUrl: data.image_url, createdAt: data.created_at };
}

/**
 * Sends a photo message — uploads the file to Storage first, then
 * inserts the message with that photo's URL. `content` is optional
 * (a photo can be sent with or without a caption).
 * @param {string} conversationId
 * @param {string} senderId
 * @param {File} file
 * @param {string} [caption]
 */
export async function sendMessagePhoto(conversationId, senderId, file, caption = "") {
  const imageUrl = await uploadMessagePhoto(file, senderId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content: caption.trim() || null,
      image_url: imageUrl,
    })
    .select("id, sender_id, content, image_url, created_at")
    .single();
  if (error) throw error;
  return { id: data.id, senderId: data.sender_id, content: data.content, imageUrl: data.image_url, createdAt: data.created_at };
}

/**
 * Reports a message as inappropriate — same "records the report, no
 * admin queue reads it yet" limitation as backend/supabase/reviews.js's
 * reportReview(). See database/schema/messaging_photos_block_report.sql.
 * @param {{ messageId: string, reporterId: string, reason: string }} params
 */
export async function reportMessage({ messageId, reporterId, reason }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("message_reports").insert({
    message_id: messageId,
    reporter_id: reporterId,
    reason,
  });
  if (error) {
    if (error.code === "23505") throw new Error("You've already reported this message.");
    throw error;
  }
}

/**
 * Marks the OTHER participant's messages in this conversation as read —
 * called when the current user opens/views the conversation.
 * @param {string} conversationId
 * @param {string} myUserId
 */
export async function markConversationRead(conversationId, myUserId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("read_at", null)
    .neq("sender_id", myUserId);
  if (error) throw error;
}
