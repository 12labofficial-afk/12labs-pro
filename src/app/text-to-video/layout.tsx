'use client';

import { Header } from "@/components/header";
import ToolLockGuard from "@/components/tool-lock-guard";

export default function TextToVideoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <ToolLockGuard toolId="text-to-video" toolName="Text To Video AI">
        <main className="flex-1">{children}</main>
      </ToolLockGuard>
    </>
  );
}
