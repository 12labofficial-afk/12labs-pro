'use client';

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { Loader2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import ToolLockGuard from "@/components/tool-lock-guard";

export default function VoiceCloningLayout({
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
        <>
            <Header />
            <main className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="font-medium">Loading...</p>
                </div>
            </main>
        </>
    );
  }

  return (
    <>
      <Header />
      <ToolLockGuard toolId="voice-cloning" toolName="AI Voice Cloning">
        <main className="flex-1">{children}</main>
      </ToolLockGuard>
    </>
  );
}
