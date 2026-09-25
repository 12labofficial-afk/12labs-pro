'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, query, orderByChild, equalTo, update, remove, type DataSnapshot } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { LiveChatSession, LiveChatMessage } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, Loader2, X, MoreHorizontal, Edit, Trash2, Check, CheckCheck } from 'lucide-react';
import { cn, generateAvatarColor } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { sendAdminChatReply, deleteSingleChatMessage } from '@/app/admin/chat/actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { reportClientError } from '@/lib/report-client-error';

/**
 * Floating live-chat reply bubbles in the hero — up to 3 unread
 * conversations on the left, 3 more on the right, so replying to a
 * pending user message never requires opening the full admin panel.
 * Each bubble bounces to actually catch the eye (a static badge was easy
 * to miss against everything else going on in the hero).
 *
 * Admin-only, and deliberately gated on `!loading` (not just a role
 * check) so it never flashes visible for a moment before the real
 * (non-admin) role is known.
 */
export function AdminChatDock() {
  const { user, loading } = useAuth();
  const { database } = initializeFirebase();
  const [sessions, setSessions] = useState<LiveChatSession[]>([]);
  const [openSession, setOpenSession] = useState<LiveChatSession | null>(null);

  const isAdmin = !loading && user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin || !database) return;
    const sessionsRef = ref(database, 'chats');
    const unreadQuery = query(sessionsRef, orderByChild('isReadByAdmin'), equalTo(false));
    const unsubscribe = onRtdbValue(unreadQuery, (snapshot) => {
      const list: LiveChatSession[] = [];
      snapshot.forEach((child: DataSnapshot) => {
        list.push({ id: child.key!, userId: child.key!, ...child.val() });
      });
      list.sort((a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime());
      setSessions(list);
    });
    return () => unsubscribe();
  }, [isAdmin, database]);

  if (!isAdmin) return null;

  // 3 on the left, 3 on the right — anything past that gets a small
  // overflow badge on the right stack instead of a 7th+ bubble.
  const leftSessions = sessions.slice(0, 3);
  const rightSessions = sessions.slice(3, 6);
  const overflowCount = sessions.length - 6;

  return (
    <>
      {/* Opening a chat marks it read, which drops it out of this
          `sessions` list on the next snapshot — that used to also unmount
          the dialog below (both were behind the same early-return), which
          is why tapping a chat looked like it just vanished instead of
          opening a reply box. The bubble clusters and the dialog are now
          independent: a cluster hides once its side is empty, but the
          dialog stays open under `openSession`'s own state regardless of
          what happens to the list that spawned it. */}
      {leftSessions.length > 0 && (
        <div className="absolute top-16 left-4 sm:top-20 sm:left-6 z-20 flex flex-col items-center gap-3">
          {leftSessions.map((session) => (
            <ChatBubble key={session.id} session={session} onClick={() => setOpenSession(session)} />
          ))}
        </div>
      )}
      {rightSessions.length > 0 && (
        <div className="absolute top-16 right-4 sm:top-20 sm:right-6 z-20 flex flex-col items-center gap-3">
          {rightSessions.map((session) => (
            <ChatBubble key={session.id} session={session} onClick={() => setOpenSession(session)} />
          ))}
          {overflowCount > 0 && (
            <div
              title={`${overflowCount} more pending chat${overflowCount > 1 ? 's' : ''}`}
              className="h-8 w-8 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-black text-muted-foreground shadow-sm"
            >
              +{overflowCount}
            </div>
          )}
        </div>
      )}

      <AdminChatReplyDialog session={openSession} onClose={() => setOpenSession(null)} />
    </>
  );
}

function ChatBubble({ session, onClick }: { session: LiveChatSession; onClick: () => void }) {
  const avatarColor = generateAvatarColor(session.userEmail);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Reply to ${session.userName}`}
      className="relative h-10 w-10 sm:h-11 sm:w-11 rounded-full border-2 border-background shadow-lg animate-bounce anim-surface-press transition-transform hover:scale-110"
    >
      <Avatar className="h-full w-full">
        <AvatarFallback className={cn('font-black text-xs', avatarColor.bg, avatarColor.text)}>
          {session.userName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary border border-background" />
      </span>
    </button>
  );
}

function AdminChatReplyDialog({ session, onClose }: { session: LiveChatSession | null; onClose: () => void }) {
  const { database } = initializeFirebase();
  const { toast } = useToast();
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditingMessage(null);
    if (!session || !database) {
      setMessages([]);
      return;
    }
    setIsLoading(true);
    const messagesRef = ref(database, `chats/${session.userId}/messages`);
    const q = query(messagesRef, orderByChild('timestamp'));
    const unsubscribe = onRtdbValue(q, (snapshot) => {
      const data = snapshot.val();
      const list: LiveChatMessage[] = data ? Object.keys(data).map((key) => ({ id: key, ...data[key] })) : [];
      list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(list);
      setIsLoading(false);
    });

    // Mark read the moment the admin opens this conversation — matches
    // the existing full admin chat page's behavior.
    if (!session.isReadByAdmin) {
      update(ref(database, `chats/${session.userId}`), { isReadByAdmin: true }).catch((e: any) => { reportClientError('src/components/admin/admin-chat-dock.tsx:155', e); return null; });
    }

    return () => unsubscribe();
  }, [session, database]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!session || !reply.trim() || isSending) return;
    setIsSending(true);
    const text = reply.trim();
    try {
      const result = await sendAdminChatReply(session.userId, session.userEmail, { text });
      if (!result.success) throw new Error(result.message);
      setReply('');
    } catch (err: any) {
        reportClientError('src/components/admin/admin-chat-dock.tsx:178', err);
      toast({ variant: 'destructive', title: 'Message Not Sent', description: err.message });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !session || !database) return;
    setIsSending(true);
    try {
      const messageRef = ref(database, `chats/${session.userId}/messages/${editingMessage.id}`);
      await update(messageRef, { text: editingMessage.text, isEdited: true });
      setEditingMessage(null);
    } catch (err: any) {
      reportClientError('src/components/admin/admin-chat-dock.tsx:handleSaveEdit', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not save message changes.' });
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!session || !database) return;
    try {
      const messageRef = ref(database, `chats/${session.userId}/messages/${messageId}`);
      await remove(messageRef);
      toast({ title: 'Message Deleted' });
    } catch (err: any) {
      reportClientError('src/components/admin/admin-chat-dock.tsx:handleDeleteMessage', err);
      const result = await deleteSingleChatMessage(session.userId, messageId);
      if (result.success) {
        toast({ title: 'Message Deleted' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    }
  };

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[95vw] h-[70vh] flex flex-col p-0 rounded-[2rem] overflow-hidden">
        <DialogHeader className="p-4 border-b flex-row items-center gap-3 space-y-0">
          {session && (
            <>
              <Avatar className="h-9 w-9 border shrink-0">
                <AvatarFallback className={cn('font-bold text-xs', generateAvatarColor(session.userEmail).bg, generateAvatarColor(session.userEmail).text)}>
                  {session.userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 text-left">
                <DialogTitle className="text-sm font-bold truncate">{session.userName}</DialogTitle>
                <p className="text-[10px] text-muted-foreground truncate">{session.userEmail}</p>
              </div>
            </>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-10">No messages yet.</p>
            ) : (
              messages.map((message) => {
                const isEditingThis = editingMessage?.id === message.id;
                return (
                  <div key={message.id} className={cn('flex items-center gap-1 group/msg', message.sender === 'admin' ? 'justify-end' : 'justify-start')}>
                    {!isEditingThis && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          {/* 🔴 FIX: this was hover-gated (opacity-0, only
                              revealed on group-hover) — this dock is used on
                              phones (touch has no hover state), so the
                              trigger was invisible and effectively
                              undiscoverable there. Always visible now. */}
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        {/* 🔴 FIX: this dropdown opens INSIDE this component's
                            own Dialog, whose overlay/content sit at z-[200]
                            (src/components/ui/dialog.tsx) — the menu's
                            default z-50 rendered it behind the dialog, so it
                            technically opened but was invisible and
                            unclickable ("options don't open"). */}
                        <DropdownMenuContent align={message.sender === 'admin' ? 'end' : 'start'} className="rounded-xl shadow-xl p-1.5 border border-border bg-popover z-[210]">
                          {message.sender === 'admin' && message.text && (
                            <DropdownMenuItem className="h-8 rounded-lg cursor-pointer font-bold text-xs" onClick={() => setEditingMessage({ id: message.id, text: message.text || '' })}>
                              <Edit className="mr-2 h-3.5 w-3.5 text-primary" /> Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="h-8 rounded-lg cursor-pointer font-bold text-xs text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleDeleteMessage(message.id)}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2 max-w-[80%] text-xs font-medium leading-relaxed',
                        message.sender === 'admin' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'
                      )}
                    >
                      {isEditingThis ? (
                        <div className="space-y-2 w-56">
                          <Textarea
                            value={editingMessage.text}
                            onChange={(e) => setEditingMessage({ ...editingMessage, text: e.target.value })}
                            className="bg-background text-foreground text-xs rounded-lg min-h-[60px]"
                          />
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setEditingMessage(null)}>Cancel</Button>
                            <Button size="sm" className="h-7 text-[10px]" onClick={handleSaveEdit} disabled={isSending}>
                              {isSending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {message.text}
                          <div className={cn('flex items-center justify-end gap-1.5 mt-1 text-[8px] font-black uppercase tracking-widest', message.sender === 'admin' ? 'text-primary-foreground/70' : 'text-muted-foreground/60')}>
                            {message.isEdited && <span>(edited)</span>}
                            <span>{format(new Date(message.timestamp), 'p')}</span>
                            {message.sender === 'admin' && (
                              <span className="inline-flex align-middle">
                                {message.seen ? <CheckCheck className="h-3 w-3 text-white" /> : <Check className="h-3 w-3" />}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t flex items-end gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a reply..."
            disabled={isSending}
            rows={1}
            className="min-h-[40px] max-h-24 rounded-xl bg-muted/20 text-sm resize-none"
          />
          <Button onClick={handleSend} disabled={!reply.trim() || isSending} size="icon" className="h-10 w-10 rounded-xl shrink-0">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
