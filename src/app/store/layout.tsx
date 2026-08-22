'use client';

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { Loader2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { initializeFirebase } from "@/firebase";
import { ref, onValue } from "firebase/database";
import LockedToolPage from "@/components/locked-tool-page";

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { database } = initializeFirebase();
  const [isStoreLocked, setIsStoreLocked] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${pathname}`);
    }
  }, [user, authLoading, router, pathname]);

  useEffect(() => {
    if (!database) {
      setIsLoadingSettings(false);
      return;
    }
    const storeLockRef = ref(database, 'toolSettings/store');
    const unsubscribe = onValue(storeLockRef, (snapshot) => {
        const setting = snapshot.val();
        setIsStoreLocked(setting?.locked === true);
        setIsLoadingSettings(false);
    });

    return () => unsubscribe();
  }, [database]);


  if (authLoading || isLoadingSettings) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 pb-16 md:pb-0">
            <div className="sticky top-16 bg-background z-40 border-b p-2">
                <div className="flex gap-3 px-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-24 rounded-full" />
                    ))}
                </div>
            </div>
            <div className="container mx-auto max-w-7xl py-6 px-4">
                <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-x-6">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="break-inside-avoid mb-6">
                        <Skeleton className="h-80 w-full rounded-xl" />
                        <div className="flex items-start gap-3 pt-3">
                            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                            </div>
                        </div>
                    </div>
                ))}
                </div>
            </div>
        </main>
      </div>
    );
  }

  if (isStoreLocked && user?.role !== 'admin') {
    return (
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-1">
            <LockedToolPage 
              toolName="Digital Store"
              message="The store is temporarily unavailable for maintenance. Please check back later."
            />
          </main>
        </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
    </div>
  );
}
