
'use client';
import { initializeFirebase } from '.';
import FirebaseProvider, { FirebaseContext } from './provider';

interface FirebaseClientProviderProps {
  children: React.ReactNode;
}
export default function FirebaseClientProvider({
  children,
}: FirebaseClientProviderProps) {
  return (
    <FirebaseProvider {...initializeFirebase()}>{children}</FirebaseProvider>
  );
}
