
'use server';

import { r2Client, R2_BUCKET } from '@/lib/r2';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml, getDisplayUrl } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import crypto from 'crypto';
import * as admin from 'firebase-admin';
import { initializeFirebase } from '@/firebase/server';
import { sendPushToUserById } from '@/app/admin/push-actions';

/**
 * 🔓 PUBLIC CHAT IMAGE UPLOADER (R2 NODE)
 * Stores in 'public/live-chat-assets' folder.
 */
export async function uploadChatImageToGCS(
  userId: string,
  base64Image: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!R2_BUCKET) throw new Error("R2 Node: Bucket not configured.");

    const parts = base64Image.split(';base64,');
    const mimeType = parts[0].split(':')[1];
    const buffer = Buffer.from(parts[1], 'base64');

    const nodeUuid = crypto.randomUUID().split('-')[0];
    const filename = `${Date.now()}_${nodeUuid}.webp`;
    
    // Prefix with public/ folder for R2 partitioning
    const objectKey = `public/live-chat-assets/${userId}/${filename}`;

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
    });

    await r2Client.send(command);

    // Protocol pub:// implies public/ folder
    const storedPath = objectKey.replace('public/', '');
    return { success: true, url: `pub://${storedPath}` };
  } catch (error: any) {
    console.error("[R2 Chat Upload Error]:", error.message);
    return { success: false, error: error.message };
  }
}

export async function sendUserChatMessage(
  userId: string,
  userName: string,
  userEmail: string,
  message: { text?: string; imageUrl?: string },
  clientMessageId: string
): Promise<{ success: boolean; message: string }> {
  const { database } = initializeFirebase();

  if (!message.text && !message.imageUrl) {
    return { success: false, message: 'Message cannot be empty.' };
  }

  const messageData: {
    sender: 'user';
    timestamp: string;
    clientMessageId: string;
    text?: string;
    imageUrl?: string;
  } = {
    sender: 'user' as const,
    timestamp: new Date().toISOString(),
    clientMessageId: clientMessageId,
  };

  if (message.text) messageData.text = message.text;
  if (message.imageUrl) messageData.imageUrl = message.imageUrl;

  let lastMessageSummary: string;
  if (message.imageUrl && message.text) {
    lastMessageSummary = `[Image] ${message.text}`;
  } else if (message.imageUrl) {
    lastMessageSummary = '[Image]';
  } else {
    lastMessageSummary = message.text!;
  }

  const sessionData = {
    userId,
    userName,
    userEmail,
    lastMessage: lastMessageSummary,
    lastMessageTimestamp: new Date().toISOString(),
    isReadByAdmin: false,
  };

  try {
    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = headersList.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    let telegramCaption = `💬 <b>New Private Chat Message</b>\n<b>From:</b> ${escapeHtml(sessionData.userName)} (${escapeHtml(sessionData.userEmail)})\n\n`;

    if (message.text) {
        telegramCaption += `<pre>${escapeHtml(message.text)}</pre>\n\n`;
    }
    
    telegramCaption += `<a href="${baseUrl}/admin/chat">Secure Admin Portal</a>`;
    
    // Construct absolute URL for Telegram photo log to ensure bot can fetch it
    const photoUrl = message.imageUrl ? getDisplayUrl(message.imageUrl) : undefined;
    const absolutePhotoUrl = photoUrl && photoUrl.startsWith('/') ? `${baseUrl}${photoUrl}` : photoUrl;

    await sendToTelegram(telegramCaption, absolutePhotoUrl, { disable_web_page_preview: true });

    const updates: { [key: string]: any } = {};
    updates[`chats/${userId}/messages/${clientMessageId}`] = messageData;
    updates[`chats/${userId}/userId`] = sessionData.userId;
    updates[`chats/${userId}/userName`] = sessionData.userName;
    updates[`chats/${userId}/userEmail`] = sessionData.userEmail;
    updates[`chats/${userId}/lastMessage`] = sessionData.lastMessage;
    updates[`chats/${userId}/lastMessageTimestamp`] = sessionData.lastMessageTimestamp;
    updates[`chats/${userId}/isReadByAdmin`] = sessionData.isReadByAdmin;

    await database.ref().update(updates);

    return { success: true, message: 'Message encrypted and sent.' };
  } catch (error: any) {
    console.error(`Failed to send user chat message for ${userId}:`, error);
    return {
      success: false,
      message: error.message || 'An unknown security error occurred.',
    };
  }
}

export async function deleteSingleChatMessage(
  userId: string,
  messageId: string
): Promise<{ success: boolean; message: string }> {
  const { database } = initializeFirebase();

  try {
    const msgRef = database.ref(`chats/${userId}/messages/${messageId}`);
    await msgRef.remove();
    return { success: true, message: 'Message deleted successfully.' };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function deleteChatSession(
  userId: string,
  userEmail: string
): Promise<{ success: boolean; message: string }> {
  const { database } = initializeFirebase();

  try {
    const chatRef = database.ref(`chats/${userId}`);
    await chatRef.remove();
    await sendToTelegram(`🗑️ *Private Chat Purged*\n*User:* ${escapeHtml(userEmail)} (${escapeHtml(userId)})`);
    revalidatePath('/admin/chat');
    return { success: true, message: 'Chat purged from node.' };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function bulkDeleteChats(
  userIds: string[]
): Promise<{ success: boolean; message: string }> {
  const { database } = initializeFirebase();
  try {
    const updates: { [key: string]: any } = {};
    userIds.forEach((id) => { updates[`chats/${id}`] = null; });
    await database.ref().update(updates);
    revalidatePath('/admin/chat');
    return { success: true, message: `${userIds.length} sessions purged.` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * 🚀 ADMIN CHAT REPLY SENDER + INSTANT PUSH DISPATCH
 * Saves message to RTDB and fires real-time Web Push notification to user's device
 */
export async function sendAdminChatReply(
  userId: string,
  userEmail: string,
  message: { text?: string; imageUrl?: string }
): Promise<{ success: boolean; message: string; pushSent?: boolean }> {
  const { database, firestore } = initializeFirebase();

  if (!message.text && !message.imageUrl) {
    return { success: false, message: 'Message cannot be empty.' };
  }

  const messageData: {
    sender: 'admin';
    timestamp: string;
    text?: string;
    imageUrl?: string;
    seen: boolean;
  } = {
    sender: 'admin' as const,
    timestamp: new Date().toISOString(),
    seen: false,
  };

  if (message.text) messageData.text = message.text;
  if (message.imageUrl) messageData.imageUrl = message.imageUrl;

  let lastMessageSummary: string;
  if (message.imageUrl && message.text) {
    lastMessageSummary = `Admin: [Image] ${message.text}`;
  } else if (message.imageUrl) {
    lastMessageSummary = 'Admin: [Image]';
  } else {
    lastMessageSummary = `Admin: ${message.text}`;
  }

  const sessionUpdateData = {
    lastMessage: lastMessageSummary,
    lastMessageTimestamp: new Date().toISOString(),
    isReadByAdmin: true,
  };

  try {
    // 1. Push message into RTDB
    const messagesRef = database.ref(`chats/${userId}/messages`);
    const newMsgRef = messagesRef.push();
    await newMsgRef.set(messageData);

    const sessionRef = database.ref(`chats/${userId}`);
    await sessionRef.update(sessionUpdateData);

    // 2. Dispatch Web Push Notification
    const pushBody = message.text 
      ? (message.text.length > 100 ? `${message.text.substring(0, 97)}...` : message.text)
      : 'Replied with an image attachment';

    let pushSent = false;
    try {
      const pushRes = await sendPushToUserById(
        userId,
        '12Labs Support',
        pushBody,
        '/?open_chat=true'
      );
      pushSent = !!pushRes?.success;
    } catch (pushErr) {
      console.warn('[Admin Chat] Push notification dispatch warning (non-fatal):', pushErr);
    }

    // 3. Add In-App notification doc to Firestore
    try {
      if (firestore) {
        const notifDocRef = firestore.collection('users').doc(userId).collection('notifications').doc('user_notifications');
        const notifEntry = {
          id: `chat-reply-${Date.now()}`,
          message: `12Labs Support: ${pushBody}`,
          timestamp: new Date().toISOString(),
          read: false,
          type: 'message',
        };
        await notifDocRef.set({
          entries: admin.firestore.FieldValue.arrayUnion(notifEntry)
        }, { merge: true });
      }
    } catch (notifErr) {
      console.warn('[Admin Chat] In-app notification creation warning (non-fatal):', notifErr);
    }

    return { success: true, message: 'Reply sent successfully.', pushSent };
  } catch (error: any) {
    console.error(`Failed to send admin chat reply for ${userId}:`, error);
    return {
      success: false,
      message: error.message || 'An error occurred while sending the message.',
    };
  }
}
