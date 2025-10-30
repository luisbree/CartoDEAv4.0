"use client";

import { useMemo } from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase, getFirebaseConfig } from './config';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

/**
 * A client-side component that initializes Firebase and provides it to the app.
 * This component should be used in a client-side context (i.e. in a 'use client' file).
 */
export function FirebaseClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use useMemo to initialize Firebase only once per session.
  // It now dynamically gets the config, which is crucial for client-side execution.
  const firebaseApp = useMemo(() => {
    const config = getFirebaseConfig();
    return initializeFirebase(config);
  }, []);

  return (
    <FirebaseProvider firebaseApp={firebaseApp}>
      {children}
      <FirebaseErrorListener />
    </FirebaseProvider>
  );
}
