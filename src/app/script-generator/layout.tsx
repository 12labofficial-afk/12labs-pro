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
import type { ToolSetting } from "@/lib/types";

export default function ScriptGeneratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { database } = initializeFirebase();
  
  const [toolStatus, setToolStatus] = useState<ToolSetting | null>(null);
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
    // Listen to global tool lock from Admin Panel
    const toolLockRef = ref(database, 'toolSettings/ai-script-studio');
    const unsubscribe = onValue(toolLockRef, (snapshot) => {
        const settings = snapshot.val();
        setToolStatus(settings);
        setIsLoadingSettings(false);
    });

    return () => unsubscribe();
  }, [database]);

  if (authLoading || !user || isLoadingSettings) {
    return (
        <>
            <Header />
            <main className="container mx-auto max-w-4xl py-10">
                <div className="flex items-center gap-3 mb-8">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="space-y-2">
                        <Skeleton className="h-7 w-72" />
                        <Skeleton className="h-4 w-96" />
                    </div>
                </div>
                <Skeleton className="h-96 w-full rounded-xl" />
            </main>
        </>
    );
  }

  // Admin bypasses the lock
  if (user?.role !== 'admin') {
    const isLocked = toolStatus?.locked === true;
    if (isLocked) {
      return (
        <>
          <Header />
          <main className="flex-1">
            <LockedToolPage 
              toolName="AI Script Generator"
              message="The script engine is temporarily undergoing maintenance. We'll be back shortly!"
            />
          </main>
        </>
      );
    }
  }

  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
    </>
  );
}
