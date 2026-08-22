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

// Note: Metadata is handled in a separate server-side metadata export if possible, 
// but since this is a client layout, we define it here for the crawler.
// For Next.js 13+ App Router, metadata should ideally be in a server component.
// We'll keep this as a Client Component for auth logic but ensure page.tsx or a parent 
// handles the static metadata. However, adding it to layouts is the standard way.

export default function StudioLayout({
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
    const toolLockRef = ref(database, 'toolSettings/ai-voice-studio');
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
            <main className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="font-medium">Loading Studio...</p>
                </div>
            </main>
        </>
    );
  }
  
  if (user?.role !== 'admin') {
    const isLocked = toolStatus?.locked === true;

    if (isLocked) {
      return (
        <>
          <Header />
          <main className="flex-1">
            <LockedToolPage 
              toolName="AI Voice Studio"
              message="This tool is temporarily unavailable for maintenance. Please check back later."
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
