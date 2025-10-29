"use client";

import { useMemo } from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase } from './config';
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
  const firebaseApp = useMemo(() => initializeFirebase(), []);

  return (
    <FirebaseProvider firebaseApp={firebaseApp}>
      {children}
      <FirebaseErrorListener />
    </FirebaseProvider>
  );
}
