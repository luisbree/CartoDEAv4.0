"use client";
import { createContext, useContext, useMemo } from 'react';
import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

type FirebaseContextValue = {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
};

// Create the context with an undefined initial value.
// We will check for this in the hooks to ensure they are used
// within a provider.
const FirebaseContext = createContext<FirebaseContextValue | undefined>(
  undefined
);

// This is the provider component that will wrap the app.
// It takes the initialized Firebase app as a prop.
export const FirebaseProvider: React.FC<{
  firebaseApp: FirebaseApp;
  children: React.ReactNode;
}> = ({ firebaseApp, children }) => {
  // Use useMemo to create the context value.
  // This will prevent the context value from being recreated on every render.
  const value: FirebaseContextValue = useMemo(() => {
    const auth = getAuth(firebaseApp);
    const firestore = getFirestore(firebaseApp);

    return {
      firebaseApp,
      auth,
      firestore,
    };
  }, [firebaseApp]);

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
};

// Hook to get the Firebase app instance.
export function useFirebase() {
  const context = useContext(FirebaseContext);

  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }

  return context.firebaseApp;
}

// Hook to get the Firebase Auth instance.
export function useAuth() {
  const context = useContext(FirebaseContext);

  if (!context) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }

  return context.auth;
}

// Hook to get the Firestore instance.
export function useFirestore() {
  const context = useContext(FirebaseContext);

  if (!context) {
    throw new Error('useFirestore must be used within a FirebaseProvider');
  }

  return context.firestore;
}
