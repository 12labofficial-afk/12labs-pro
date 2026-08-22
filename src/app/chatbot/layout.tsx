'use client';

import { notFound } from 'next/navigation';

/**
 * @fileOverview Layout for the AI Chatbot.
 * This route has been disabled.
 */
export default function ChatbotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Trigger 404 for the entire chatbot route group
  notFound();
  return null;
}
