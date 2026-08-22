'use client';

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { Loader2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Head from 'next/head';
import ToolLockGuard from "@/components/tool-lock-guard";

export default function MusicStudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=${pathname}`); 
    }
  }, [user, authLoading, router, pathname]);

  if (authLoading || !user) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <>
      <Head>
          <title>Music AI Studio | Create Original Songs & BGM</title>
          <meta name="description" content="Generate original background music, nursery rhymes, and vocal songs with 12Labs Music AI. Professional music production node for creators." />
      </Head>
      <Header />
      <ToolLockGuard toolId="music-studio" toolName="Music AI Studio">
        <main className="flex-1 min-h-screen bg-background">{children}</main>
      </ToolLockGuard>
    </>
  );
}
