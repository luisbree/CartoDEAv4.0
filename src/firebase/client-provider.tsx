'use client';

import { useMemo, useEffect } from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase, getFirebaseConfig } from './config';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
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
  // This part is safe to run on both server and client.
  const { firebaseApp, auth, firestore } = useMemo(() => {
    const config = getFirebaseConfig();
    const app = initializeFirebase(config);
    const authInstance = getAuth(app);
    const firestoreInstance = getFirestore(app);
    return { firebaseApp: app, auth: authInstance, firestore: firestoreInstance };
  }, []);

  // Use useEffect to run client-side only logic, like connecting to emulators.
  useEffect(() => {
    // This code will only run in the browser.
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    ) {
      // Ensure we don't connect more than once
      if (!(auth as any)._isEmulator) {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
          disableWarnings: true,
        });
      }
      if (!(firestore as any)._isEmulator) {
        connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
      }
    }
  }, [auth, firestore]); // Depend on auth and firestore instances

  return (
    <FirebaseProvider firebaseApp={firebaseApp}>
      {children}
      <FirebaseErrorListener />
    </FirebaseProvider>
  );
}
