"use client";

import { useMemo } from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase, getFirebaseConfig } from './config';
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
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
  // Use useMemo to initialize Firebase only once per session, with conditional logic.
  const firebaseApp = useMemo(() => {
    const config = getFirebaseConfig();
    const app = initializeFirebase(config);
    const auth = getAuth(app);
    const firestore = getFirestore(app);

    // Conditional connection to emulators based on hostname.
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      console.log("Connecting to local Firebase emulators...");
      // Ensure we don't connect more than once
      if (!(auth as any)._isEmulator) {
        connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      }
      if (!(firestore as any)._isEmulator) {
        connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
      }
    } else {
      console.log("Connecting to cloud Firebase services...");
    }

    return app;
  }, []);

  return (
    <FirebaseProvider firebaseApp={firebaseApp}>
      {children}
      <FirebaseErrorListener />
    </FirebaseProvider>
  );
}
