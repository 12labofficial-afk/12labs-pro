'use client';

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowUp, MessageCircle, Plus, X, Bell, Trash2 } from 'lucide-react';
import { cn, getDisplayUrl, compressImage } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { initializeFirebase } from '@/firebase';
import { ref, query, orderByChild, update } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { LiveChatMessage } from '@/lib/types';
import { sendUserChatMessage, uploadChatImageToGCS, deleteChatSession } from '@/app/admin/chat/actions';
import { format, isToday, isYesterday } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { GetNotifiedButton } from '@/components/push-subscription-handler';
import { reportClientError } from '@/lib/report-client-error';
import { getIdToken } from '@/lib/id-token';

type ChatMessage = LiveChatMessage & { status?: string };

const GROUP_GAP_MS = 5 * 60 * 1000;
const STAMP_GAP_MS = 30 * 60 * 1000;
const MAX_LEN = 1000;

const ts = (m: { timestamp: string }) => new Date(m.timestamp).getTime();

function stampLabel(date: Date) {
  if (isToday(date)) return `Today ${format(date, 'p')}`;
  if (isYesterday(date)) return `Yesterday ${format(date, 'p')}`;
  return format(date, 'd MMM, p');
}

/** One bubble. Corners tighten on the sender's side inside a run, like iMessage. */
const ChatMessageItem = memo(function ChatMessageItem({
  message,
  isUser,
  isFirst,
  isLast,
  onImageClick,
}: {
  message: ChatMessage;
  isUser: boolean;
  isFirst: boolean;
  isLast: boolean;
  onImageClick: (url: string) => void;
}) {
  const isSending = message.status === 'sending';
  // While sending, imageUrl is the local data URL preview.
  const displayUrl = isSending ? message.imageUrl : getDisplayUrl(message.imageUrl);

  const corners = isUser
    ? cn('rounded-[20px]', !isFirst && 'rounded-tr-[6px]', !isLast && 'rounded-br-[6px]')
    : cn('rounded-[20px]', !isFirst && 'rounded-tl-[6px]', !isLast && 'rounded-bl-[6px]');

  return (
    <div className={cn('flex flex-col gap-0.5', isUser ? 'items-end' : 'items-start', isFirst ? 'mt-2' : 'mt-0.5')}>
      {displayUrl && (
        <button
          type="button"
          className={cn('block max-w-[70%] overflow-hidden bg-black/5 dark:bg-white/5', corners, isSending && 'opacity-70')}
          onClick={() => !isSending && onImageClick(displayUrl)}
        >
          <img src={displayUrl} alt="Shared image" loading="lazy" decoding="async" className="block max-h-64 w-auto max-w-full object-cover" />
        </button>
      )}
      {message.text && (
        <div
          className={cn(
            'max-w-[78%] whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug',
            corners,
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-[#E9E9EB] text-black dark:bg-[#2C2C2E] dark:text-white',
          )}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}, (a, b) =>
  a.message.id === b.message.id &&
  a.message.text === b.message.text &&
  a.message.imageUrl === b.message.imageUrl &&
  a.message.status === b.message.status &&
  a.isUser === b.isUser &&
  a.isFirst === b.isFirst &&
  a.isLast === b.isLast &&
  a.onImageClick === b.onImageClick,
);

export function LiveChatWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { database } = initializeFirebase();

  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasUnread, setHasUnread] = useState(false);
  // Support has opened this conversation since the user's last message.
  const [seenBySupport, setSeenBySupport] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [imageToSend, setImageToSend] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag offset lives in a ref and is painted straight onto the element, so
  // moving the bubble never re-renders the chat.
  const fabRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveDetected = useRef(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // iOS-style sheet: drag the header down to dismiss (mobile).
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetDrag = useRef<{ y: number; t: number; dy: number } | null>(null);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  useEffect(() => {
    setShowNotificationPrompt('Notification' in window && Notification.permission !== 'granted');
    const mq = window.matchMedia('(max-width: 767px)');
    const syncMobile = () => setIsMobile(mq.matches);
    syncMobile();
    mq.addEventListener('change', syncMobile);
    const params = new URLSearchParams(window.location.search);
    if (params.get('open_chat') === 'true' || params.get('chat') === 'open') setIsOpen(true);
    const handleGlobalOpen = () => setIsOpen(true);
    window.addEventListener('open-live-chat', handleGlobalOpen);
    return () => {
      mq.removeEventListener('change', syncMobile);
      window.removeEventListener('open-live-chat', handleGlobalOpen);
    };
  }, []);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setHasUnread(false);
      nearBottom.current = true;
    }
    window.dispatchEvent(new CustomEvent(isOpen ? 'live-chat-open' : 'live-chat-close'));
  }, [isOpen]);

  // One listener per signed-in user — opening/closing the chat no longer
  // tears it down and re-downloads the whole thread.
  useEffect(() => {
    if (!user?.uid || !database) return;
    const q = query(ref(database, `chats/${user.uid}/messages`), orderByChild('timestamp'));
    return onRtdbValue(q, (snapshot) => {
      const data = snapshot.val();
      const dbMessages: ChatMessage[] = data ? Object.keys(data).map((key) => ({ id: key, ...data[key] })) : [];
      dbMessages.sort((a, b) => ts(a) - ts(b));

      setMessages((current) => {
        const fromDb = new Set(dbMessages.map((m) => m.clientMessageId));
        const stillSending = current.filter((m) => m.status === 'sending' && !fromDb.has(m.clientMessageId));
        return stillSending.length ? [...dbMessages, ...stillSending].sort((a, b) => ts(a) - ts(b)) : dbMessages;
      });

      const last = dbMessages[dbMessages.length - 1];
      if (last?.sender === 'admin' && !last.seen && !isOpenRef.current) setHasUnread(true);
    });
  }, [user?.uid, database]);

  useEffect(() => {
    if (!user?.uid || !database) return;
    return onRtdbValue(ref(database, `chats/${user.uid}/isReadByAdmin`), (snap) => setSeenBySupport(snap.val() === true));
  }, [user?.uid, database]);

  useEffect(() => {
    if (!isOpen || !user?.uid || !database) return;
    const updates: Record<string, boolean> = {};
    for (const m of messages) {
      if (m.sender === 'admin' && !m.seen && !m.status) updates[`chats/${user.uid}/messages/${m.id}/seen`] = true;
    }
    if (Object.keys(updates).length) {
      update(ref(database), updates).catch((e) => reportClientError('src/components/live-chat-widget.tsx:seen', e));
    }
  }, [isOpen, messages, user?.uid, database]);

  // Follow new messages only if the reader is already at the bottom — never
  // yank them away from older messages they scrolled up to read.
  useEffect(() => {
    if (!isOpen || !nearBottom.current) return;
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, isOpen]);

  const contentRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0;
  useEffect(() => {
    const el = contentRef.current;
    if (!isOpen || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const box = scrollRef.current;
      if (box && nearBottom.current) box.scrollTop = box.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, isEmpty]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Composer grows with the message, then scrolls internally.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 120;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [input, isOpen]);

  const paintOffset = (animate: boolean) => {
    const el = fabRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    el.style.transform = `translate3d(${-offset.current.x}px, ${-offset.current.y}px, 0)`;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isOpen) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moveDetected.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.current.x, oy: offset.current.y };
    holdTimer.current = setTimeout(() => {
      if (!moveDetected.current) setShowDismiss(true);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!moveDetected.current && Math.abs(dx) <= 5 && Math.abs(dy) <= 5) return;
    if (!moveDetected.current) {
      moveDetected.current = true;
      if (holdTimer.current) clearTimeout(holdTimer.current);
      fabRef.current?.classList.add('scale-110');
    }
    // Keep the bubble on screen.
    const maxX = window.innerWidth - 80;
    const maxY = window.innerHeight - 160;
    offset.current = {
      x: Math.min(Math.max(start.ox - dx, -16), maxX),
      y: Math.min(Math.max(start.oy - dy, -64), maxY),
    };
    paintOffset(false);
  };

  const handlePointerUp = () => {
    if (!dragStart.current) return;
    dragStart.current = null;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    fabRef.current?.classList.remove('scale-110');
    if (moveDetected.current) {
      paintOffset(true);
      return;
    }
    if (showDismiss) setShowDismiss(false);
    else setIsOpen(true);
  };

  const onSheetDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    sheetDrag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };

  const onSheetDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = sheetDrag.current;
    const el = sheetRef.current;
    if (!drag || !el) return;
    // Pulling up gives a little rubber-band resistance; down follows the finger.
    const raw = e.clientY - drag.y;
    drag.dy = raw > 0 ? raw : raw / 6;
    el.style.transform = `translate3d(0, ${drag.dy}px, 0)`;
  };

  const onSheetDragEnd = () => {
    const drag = sheetDrag.current;
    const el = sheetRef.current;
    sheetDrag.current = null;
    if (!drag || !el) return;
    const velocity = drag.dy / Math.max(1, performance.now() - drag.t); // px per ms
    if (drag.dy > 120 || (drag.dy > 30 && velocity > 0.5)) {
      el.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
      el.style.transform = 'translate3d(0, 100%, 0)';
      window.setTimeout(() => {
        // Already off screen — skip the built-in slide-out so it can't jump back.
        el.style.animation = 'none';
        setIsOpen(false);
      }, 200);
    } else {
      el.style.transition = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)';
      el.style.transform = '';
    }
  };

  const handleSendMessage = async () => {
    if ((!input.trim() && !imageToSend) || !user || !database || isSending) return;
    if (input.length > MAX_LEN) return;

    setIsSending(true);
    const messageText = input;
    const clientMessageId = crypto.randomUUID();
    const currentPreview = imagePreview;
    const hadImage = !!imageToSend;

    const tempMessage: ChatMessage = {
      id: clientMessageId,
      sender: 'user',
      text: messageText.trim() ? messageText : undefined,
      imageUrl: currentPreview || undefined,
      timestamp: new Date().toISOString(),
      clientMessageId,
      status: 'sending',
    };

    nearBottom.current = true;
    setMessages((prev) => [...prev, tempMessage]);
    setInput('');
    setImageToSend(null);
    setImagePreview(null);

    try {
      let finalImageUrl: string | undefined;
      if (hadImage && currentPreview) {
        const uploadRes = await uploadChatImageToGCS(await getIdToken(), user.uid, currentPreview);
        if (!uploadRes.success || !uploadRes.url) throw new Error(uploadRes.error);
        finalImageUrl = uploadRes.url;
      }
      const result = await sendUserChatMessage(
        await getIdToken(),
        user.uid, user.name || user.email || 'N/A', user.email || 'N/A',
        { text: messageText.trim() ? messageText : undefined, imageUrl: finalImageUrl },
        clientMessageId,
      );
      if (!result.success) throw new Error(result.message);
    } catch (error: any) {
      reportClientError('src/components/live-chat-widget.tsx:send', error);
      toast({ variant: 'destructive', title: 'Message not sent', description: 'Please check your connection and try again.' });
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
      setInput((cur) => cur || messageText);
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteChat = async () => {
    if (!user) return;
    setIsDeletingChat(true);
    try {
      const result = await deleteChatSession(await getIdToken(), user.uid, user.email || 'N/A');
      if (!result.success) throw new Error(result.message);
      setMessages([]);
      toast({ title: 'Conversation deleted' });
      setIsOpen(false);
    } catch (error: any) {
      reportClientError('src/components/live-chat-widget.tsx:deleteChat', error);
      toast({ variant: 'destructive', title: "Couldn't delete", description: 'Please try again in a moment.' });
    } finally {
      setIsDeletingChat(false);
    }
  };

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsProcessingImage(true);
    try {
      const compressed = await compressImage(file);
      setImageToSend(compressed);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(compressed);
    } catch (err) {
      reportClientError('src/components/live-chat-widget.tsx:image', err);
      toast({ variant: 'destructive', title: "Couldn't attach image", description: 'Try a different photo.' });
    } finally {
      setIsProcessingImage(false);
    }
  };

  if (!user || isHidden) return null;

  const tooLong = input.length > MAX_LEN;
  const canSend = (!!input.trim() || !!imageToSend) && !tooLong && !isSending && !isProcessingImage;
  const lastUserIdx = messages.reduce((acc, m, i) => (m.sender === 'user' ? i : acc), -1);

  return (
    <>
      <div
        className="live-chat-floating-root fixed bottom-20 right-6 z-50 touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div ref={fabRef} className="relative will-change-transform">
          {showDismiss && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setIsHidden(true); }}
              aria-label="Hide chat button"
              className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white shadow-lg animate-in zoom-in duration-200"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            aria-label="Open support chat"
            onClick={(e) => { if (e.detail === 0) setIsOpen(true); }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_30px_rgba(0,0,0,0.18)] ring-1 ring-white/20 transition-transform duration-200 active:scale-90"
          >
            <MessageCircle className="h-6 w-6" />
            {hasUnread && (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-background bg-red-500" />
              </span>
            )}
          </button>
        </div>
      </div>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          ref={sheetRef}
          side={isMobile ? 'bottom' : 'right'}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'flex w-full flex-col gap-0 overflow-hidden border-none p-0 sm:max-w-md',
            isMobile ? 'h-[88dvh] rounded-t-[28px]' : 'h-[100dvh]',
          )}
        >
          {/* Header — frosted, compact, Apple-style */}
          <div
            onPointerDown={onSheetDragStart}
            onPointerMove={onSheetDragMove}
            onPointerUp={onSheetDragEnd}
            onPointerCancel={onSheetDragEnd}
            className={cn(
              'relative z-10 shrink-0 border-b border-black/5 bg-background/80 px-4 pb-3 pt-2 backdrop-blur-xl dark:border-white/10',
              isMobile && 'touch-none select-none',
            )}
          >
            {isMobile && <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" />}
            <div className={cn('flex items-center gap-3', !isMobile && 'pt-2')}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-sm font-bold text-primary-foreground">
                12
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-[17px] font-semibold leading-tight tracking-tight">12Labs Support</SheetTitle>
                <SheetDescription className="truncate text-xs text-muted-foreground">We reply right here in this chat</SheetDescription>
              </div>
              {messages.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button" aria-label="Delete conversation" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-[18px] w-[18px]" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                      <AlertDialogDescription>This permanently deletes your entire chat history with support. This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteChat} disabled={isDeletingChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {isDeletingChat ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <SheetClose asChild>
                <button type="button" aria-label="Close chat" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-90">
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </SheetClose>
            </div>
          </div>

          {showNotificationPrompt && (
            <div className="mx-3 mt-3 flex shrink-0 items-center gap-3 rounded-2xl bg-muted/60 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bell className="h-4 w-4" />
              </div>
              <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">Get reply alerts</span> — know when support answers.
              </p>
              <GetNotifiedButton
                size="sm"
                variant="outline"
                label="Turn on"
                onEnabled={() => setShowNotificationPrompt(false)}
                className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold"
              />
            </div>
          )}

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-1 [-webkit-overflow-scrolling:touch]"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageCircle className="h-7 w-7" />
                </div>
                <p className="text-[15px] font-semibold">How can we help?</p>
                <p className="mt-1 text-sm text-muted-foreground">Send a message or a screenshot and our team will get back to you here.</p>
              </div>
            ) : (
              <div ref={contentRef}>
              {messages.map((message, i) => {
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const t = ts(message);
                const showStamp = !prev || t - ts(prev) > STAMP_GAP_MS;
                const isFirst = showStamp || prev.sender !== message.sender || t - ts(prev) > GROUP_GAP_MS;
                const isLast = !next || next.sender !== message.sender || ts(next) - t > GROUP_GAP_MS;
                const isUser = message.sender === 'user';
                return (
                  <React.Fragment key={message.id}>
                    {showStamp && (
                      <p className="pb-1 pt-4 text-center text-[11px] font-medium text-muted-foreground">
                        {stampLabel(new Date(t))}
                      </p>
                    )}
                    <ChatMessageItem
                      message={message}
                      isUser={isUser}
                      isFirst={isFirst}
                      isLast={isLast}
                      onImageClick={setPreviewImage}
                    />
                    {i === lastUserIdx && !message.status && (
                      <p className={cn('mt-0.5 pr-1 text-right text-[11px]', seenBySupport && i === messages.length - 1 ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                        {seenBySupport && i === messages.length - 1 ? 'Seen' : 'Delivered'}
                      </p>
                    )}
                  </React.Fragment>
                );
              })}
              </div>
            )}
          </div>

          {/* Composer — pill field with a round send button */}
          <div className="shrink-0 border-t border-black/5 bg-background/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl dark:border-white/10">
            {imagePreview && (
              <div className="relative mb-2 ml-11 h-20 w-20 overflow-hidden rounded-2xl animate-in zoom-in-95 duration-200">
                <img src={imagePreview} alt="Attachment preview" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => { setImageToSend(null); setImagePreview(null); }}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input type="file" ref={fileInputRef} onChange={handlePickImage} accept="image/*" className="hidden" />
              <button
                type="button"
                aria-label="Attach image"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingImage}
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-90 disabled:opacity-50"
              >
                {isProcessingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
              </button>
              <div
                className={cn(
                  'flex min-w-0 flex-1 items-end rounded-[20px] border bg-background pl-3.5 pr-1 transition-colors focus-within:border-primary/40',
                  tooLong ? 'border-destructive' : 'border-black/10 dark:border-white/15',
                )}
              >
                <textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder="Message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isMobile) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent py-[7px] text-[16px] leading-[22px] outline-none placeholder:text-muted-foreground/70"
                />
                <button
                  type="button"
                  aria-label="Send"
                  onClick={handleSendMessage}
                  disabled={!canSend}
                  className={cn(
                    'mb-[3px] ml-1 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-200 active:scale-90',
                    canSend ? 'scale-100 opacity-100' : 'scale-90 opacity-30',
                  )}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.75} />}
                </button>
              </div>
            </div>
            {tooLong && <p className="mt-1.5 pl-12 text-xs font-medium text-destructive">Messages can be up to {MAX_LEN} characters ({input.length}/{MAX_LEN}).</p>}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="h-[85vh] w-full max-w-4xl overflow-hidden border-none bg-black/95 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Image Preview</DialogTitle>
          </DialogHeader>
          <div className="relative flex h-full w-full items-center justify-center p-4">
            {previewImage && (
              <img src={previewImage} alt="Preview" className="max-h-full max-w-full rounded-lg object-contain animate-in zoom-in-95 duration-300" />
            )}
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="absolute right-4 top-4 h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/20">
                <X className="h-5 w-5" />
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
