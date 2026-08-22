'use client';

import React, { useState, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase, type FirebaseServices } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const [services, setServices] = useState<FirebaseServices | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const initialized = initializeFirebase();
      setServices(initialized);
    } catch (error) {
      console.error("Failed to initialize Firebase on client:", error);
    }
  }, []);

  // Always render the Provider to avoid context errors, but pass nulls until hydrated
  return (
    <FirebaseProvider
      firebaseApp={services?.firebaseApp || null}
      auth={services?.auth || null}
      firestore={services?.firestore || null}
      database={services?.database || null}
    >
      {children}
    </FirebaseProvider>
  );
}