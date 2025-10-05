'use client';
import { initializeFirebase } from '.';
import FirebaseProvider, { FirebaseContext } from './provider';

interface FirebaseClientProviderProps {
  children: React.ReactNode;
}
export default function FirebaseClientProvider({
  children,
}: FirebaseClientProviderProps) {
  // initializeFirebase() is now called here, ensuring it runs once on the client.
  const firebaseContextValue = initializeFirebase();
  
  return (
    <FirebaseProvider {...firebaseContextValue}>{children}</FirebaseProvider>
  );
}
