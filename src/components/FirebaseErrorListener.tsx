'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

/**
 * An invisible component that listens for globally emitted 'permission-error' events
 * and displays them to the developer in a non-intrusive way.
 */
export function FirebaseErrorListener() {
    const { toast } = useToast();

    useEffect(() => {
        const handleError = (error: FirestorePermissionError) => {
            console.error("Firestore Permission Error:", error.message, error.request);
            toast({
                variant: "destructive",
                title: "Permission Denied",
                description: "A database request was blocked by your security rules. Check the console for details.",
                duration: 10000,
            });
        };

        errorEmitter.on('permission-error', handleError);

        return () => {
            errorEmitter.off('permission-error', handleError);
        };
    }, [toast]);

    // This component renders nothing.
    return null;
}
