'use client';

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { Loader2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import ToolLockGuard from "@/components/tool-lock-guard";

export default function SoundSearchLayout({
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

  return (
    <>
      <Header />
      <ToolLockGuard toolId="sound-effect-search" toolName="SFX Library">
        <main className="flex-1">{children}</main>
      </ToolLockGuard>
    </>
  );
}
