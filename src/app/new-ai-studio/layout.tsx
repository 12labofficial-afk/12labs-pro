'use client';

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { Loader2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { initializeFirebase } from "@/firebase";
import { ref, onValue } from "firebase/database";
import LockedToolPage from "@/components/locked-tool-page";
import type { ToolSetting } from "@/lib/types";
import Head from 'next/head';

export default function NewAiStudioLayout({
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
    const toolLockRef = ref(database, 'toolSettings/chatterbox-studio');
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
                    <p className="font-medium">Initializing New AI Studio...</p>
                </div>
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
              toolName="New AI Studio"
              message="The New AI Studio engine is temporarily undergoing maintenance. We'll be back shortly!"
            />
          </main>
        </>
      );
    }
  }

  return (
    <>
      <Head>
          <title>New AI Studio | Advanced Neural Voice Generation</title>
          <meta name="description" content="Experience the next generation of AI voice synthesis. 12Labs New AI Studio provides broadcast-grade voiceovers with unprecedented emotional depth." />
      </Head>
      <Header />
      <main className="flex-1">{children}</main>
    </>
  );
}
