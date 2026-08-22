'use client';

import { Header } from "@/components/header";
import ToolLockGuard from "@/components/tool-lock-guard";

export default function YouTubeTranscriptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <ToolLockGuard toolId="youtube-transcript" toolName="YouTube & Audio Transcript Studio">
        <main className="flex-1 min-h-screen bg-background">{children}</main>
      </ToolLockGuard>
    </>
  );
}
