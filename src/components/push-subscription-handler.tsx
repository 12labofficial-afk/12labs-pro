'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, set } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getActiveVapidPublicKey, sendPushToUserById } from '@/app/admin/push-actions';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown';
  // Embedded/private browsers may deny storage. A storage error must not
  // prevent a valid PushSubscription from being registered.
  let deviceId: string | null = null;
  try {
    deviceId = localStorage.getItem('12labs_push_device_id');
  } catch {}
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    try {
      localStorage.setItem('12labs_push_device_id', deviceId);
    } catch {}
  }
  return deviceId;
}

function getVapidKey(): string {
  return (process.env.NEXT_PUBLIC_VAPID ||
    'BBtch_VrbD3lBahKFtM68sPvbjbGwysDiLrgls0F6IbeoxWAjYL9dhonyYo1Ib49M-yVVxm1F5Qoz40FIePpD70')
    .trim()
    .replace(/^["']|["']$/g, '');
}

async function registerSubscription(vapidPublicKey: string, forceRefresh = false): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  // Refresh an older cached worker after deployments. Some users otherwise
  // keep a stale/empty worker while newer devices get the current one.
  await registration.update().catch(() => undefined);
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();

  // Reuse an existing subscription. Some mobile browsers do not expose
  // applicationServerKey through options; unsubscribing in that case caused
  // the first click to replace a working subscription.
  if (existing && !forceRefresh) {
    return existing;
  }
  if (existing) {
    await existing.unsubscribe().catch(() => undefined);
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function subscribeToPushNotifications(user: any, database: any, toast?: any) {
  if (typeof window === 'undefined') return false;
  if (
    !window.isSecureContext ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    if (toast) toast({ variant: 'destructive', title: 'Not Supported', description: 'Not supported on this browser.' });
    return false;
  }

  let vapidPublicKey = getVapidKey();

  try {
    const serverKey = await getActiveVapidPublicKey();
    if (serverKey) {
      vapidPublicKey = serverKey;
    }
  } catch (e) {
    console.warn('[Push] Could not fetch active VAPID key from server, using fallback:', e);
  }

  // Check if browser permission is already denied
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    if (toast) {
      toast({
        variant: 'destructive',
        title: 'Permission Blocked in Browser 🚫',
        description: 'Browser ne permission block kar rakhi hai. Address bar me Lock 🔒 icon par click karke Notifications -> Allow karein.',
      });
    }
    return false;
  }

  try {
    // Permission must be requested directly from user gesture click
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (toast) {
        toast({
          variant: 'destructive',
          title: 'Permission Denied 🚫',
          description: 'Permission allow nahi ki gayi. Agar dobara allow karna hai toh browser lock icon 🔒 me jaakar Notifications allow karein.',
        });
      }
      return false;
    }

    try {
      const subscription = await registerSubscription(vapidPublicKey);

      if (subscription && database) {
        const deviceId = getDeviceId();
        const targetUid = user?.uid || 'guest';
        // Keep one subscription per browser/device. Saving directly at the
        // user node caused the last device to overwrite every other device.
        const subRef = ref(database, `pushSubscriptions/${targetUid}/${deviceId}`);
        await set(subRef, {
          // Keep the key that created this browser subscription beside it.
          // A PushSubscription cannot be sent with a different VAPID key.
          subscription: {
            ...subscription.toJSON(),
            vapidPublicKey,
          },
          updatedAt: Date.now(),
          userAgent: navigator.userAgent,
          deviceId
        });

        // Confirm the permission with a real push. This also proves that the
        // subscription, VAPID key, and service worker are all working.
        if (user?.uid) {
          try {
            const welcomeResult = await sendPushToUserById(
              user.uid,
              'Notifications are on 🎉',
              'You will now be notified when any project is completed, when live chat support replies, and about important 12Labs updates.',
              '/'
            );
            // If this device still had a subscription made with an older
            // VAPID key, replace it immediately instead of making the user
            // click Get Notified a second time.
            if (!welcomeResult.success && welcomeResult.error?.includes('STALE_SUBSCRIPTION')) {
              const freshSubscription = await registerSubscription(vapidPublicKey, true);
              const freshDeviceId = getDeviceId();
              await set(ref(database, `pushSubscriptions/${user.uid}/${freshDeviceId}`), {
                subscription: { ...freshSubscription.toJSON(), vapidPublicKey },
                updatedAt: Date.now(),
                userAgent: navigator.userAgent,
                deviceId: freshDeviceId,
              });
              await sendPushToUserById(
                user.uid,
                'Notifications are on 🎉',
                'You will now be notified when any project is completed, when live chat support replies, and about important 12Labs updates.',
                '/'
              );
            }
          } catch (welcomePushError) {
            // The subscription is still valid even if the confirmation
            // dispatch is temporarily unavailable on the server.
            console.warn('[Push] Welcome notification could not be sent:', welcomePushError);
          }
        }
      }

      if (toast) {
        toast({
          title: 'Notifications Enabled! 🎉',
          description: 'Ab project completion, live chat replies aur important updates ki notification milegi.',
        });
      }
      return true;
  } catch (swErr: any) {
      console.warn('[Push] Service worker registration or subscription failed:', swErr);
      if (toast) {
        const errorName = swErr?.name || '';
        const errorMessage = String(swErr?.message || '').toLowerCase();
        const isWorkerError = errorName === 'SecurityError' ||
          errorMessage.includes('service worker') ||
          errorMessage.includes('script') ||
          errorMessage.includes('sw.js');
        toast({
          variant: 'destructive',
          title: isWorkerError ? 'Notification setup unavailable' : 'Notification permission could not be saved',
          description: isWorkerError
            ? 'Not supported on this browser.'
            : 'Please refresh the page and try again.',
        });
      }
      return false;
    }
  } catch (err: any) {
    console.error('[Push] Manual subscription error:', err);
    if (toast) {
      toast({
        variant: 'destructive',
        title: 'Subscription Error',
        description: err.message || 'Failed to enable notifications. Make sure VAPID key is configured.',
      });
    }
    return false;
  }
}

export function GetNotifiedButton({ className, variant = 'default', size = 'sm' }: { className?: string; variant?: any; size?: any }) {
  const { user } = useAuth();
  const { database } = initializeFirebase();
  const { toast } = useToast();

  const handleClick = async () => {
    await subscribeToPushNotifications(user, database, toast);
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleClick}>
      <Bell className="mr-2 h-4 w-4" /> Get Notified
    </Button>
  );
}

export function PushSubscriptionHandler() {
  const { user } = useAuth();
  const { database } = initializeFirebase();
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid || !database || typeof window === 'undefined') return;
    if (
      !window.isSecureContext ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) return;

    const registerAndSubscribe = async () => {
      try {
        let vapidPublicKey = getVapidKey();
        try {
          const serverKey = await getActiveVapidPublicKey();
          if (serverKey) vapidPublicKey = serverKey;
        } catch (e) {}

        try {
          if (Notification.permission !== 'granted') return;
          const subscription = await registerSubscription(vapidPublicKey);

          if (subscription) {
            const deviceId = getDeviceId();
            const subRef = ref(database, `pushSubscriptions/${user.uid}/${deviceId}`);
            await set(subRef, {
              subscription: {
                ...subscription.toJSON(),
                vapidPublicKey,
              },
              updatedAt: Date.now(),
              userAgent: navigator.userAgent,
              deviceId
            });
            subscribedRef.current = true;
            console.log('[Push] Push subscription synchronized with server.');
          }
        } catch (swErr) {
          console.warn('[Push] Background registration failed (sw.js might be missing):', swErr);
        }
      } catch (err) {
        console.error('[Push] Registration/Subscription error:', err);
      }
    };

    registerAndSubscribe();
  }, [user?.uid, database]);

  return null;
}
