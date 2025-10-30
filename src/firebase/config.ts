// This file MUST NOT have "use client" so it can be used in server components.
import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';

// Your web app's Firebase configuration for PRODUCTION
const staticFirebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};


/**
 * Returns the Firebase config. In a production/preview environment, this will be
 * the static config. This function ensures that the static configuration
 * is used, which is the standard and most reliable way when domains are properly
 * authorized in the Firebase console.
 * @returns The Firebase configuration object.
 */
export function getFirebaseConfig(): FirebaseOptions {
    // We always use the static config loaded from environment variables.
    // The distinction between emulator and production is now handled in the client-provider.
    return staticFirebaseConfig;
}


/**
 * Initializes and returns the Firebase app instance.
 * Ensures that initialization only happens once.
 * @param {FirebaseOptions} config - The configuration for the Firebase app.
 * @returns The initialized Firebase app.
 */
export function initializeFirebase(config: FirebaseOptions): FirebaseApp {
  // If apps are already initialized, return the default app.
  if (getApps().length) {
    return getApp();
  }
  // Otherwise, initialize a new app.
  return initializeApp(config);
}
