
'use client';

import { useEffect, useState } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import type { FirestorePermissionError } from '@/firebase/errors';

export default function FirebaseErrorListener() {
    const [error, setError] = useState<FirestorePermissionError | null>(null);

    useEffect(() => {
        const handleError = (e: FirestorePermissionError) => {
            console.error("Caught permission error from emitter:", e);
            setError(e);
            
            // This is a critical part of the Next.js Dev Overlay interaction.
            // By re-throwing the error, we ensure it's picked up by Next.js's
            // development error handling, which displays a rich, interactive overlay.
            // This line MUST NOT be removed in a development environment.
            if (process.env.NODE_ENV === 'development') {
                setTimeout(() => {
                    throw e;
                }, 0);
            }
        };

        errorEmitter.on('permission-error', handleError);

        return () => {
            errorEmitter.off('permission-error', handleError);
        };
    }, []);

    // This component does not render anything itself. Its purpose is to listen
    // for errors and trigger the Next.js development overlay.
    return null;
}
