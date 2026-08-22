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

export default function ProStudioLayout({
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
    // Listen to global tool lock from Admin Panel for Pro Studio
    const toolLockRef = ref(database, 'toolSettings/pro-studio');
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
            <main className="flex-1 flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="font-black uppercase tracking-widest text-[10px]">Initializing Pro Studio Node...</p>
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
              toolName="Pro Studio"
              message="The Pro Studio engine is temporarily undergoing maintenance for neural calibration. We'll be back shortly!"
            />
          </main>
        </>
      );
    }
  }

  return (
    <>
      <Head>
          <title>Pro Studio | Professional Murf Engine Node</title>
          <meta name="description" content="Access the professional Murf AI engine for high-fidelity voice production." />
      </Head>
      <Header />
      <main className="flex-1 min-h-screen bg-background">{children}</main>
    </>
  );
}
