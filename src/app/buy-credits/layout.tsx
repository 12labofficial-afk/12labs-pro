'use client';

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function BuyCreditsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <>
        <Header />
        <main className="container mx-auto max-w-5xl py-12">
            <div className="text-center mb-12 space-y-4">
                <Skeleton className="h-10 w-1/2 mx-auto" />
                <Skeleton className="h-5 w-2/3 mx-auto" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Skeleton className="h-96 w-full rounded-lg" />
                <Skeleton className="h-96 w-full rounded-lg border-2 border-primary" />
                <Skeleton className="h-96 w-full rounded-lg" />
            </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
    </>
  );
}
