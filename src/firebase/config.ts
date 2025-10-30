// This file MUST NOT have "use client" so it can be used in server components.
import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';

// Your web app's Firebase configuration
const staticFirebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};


/**
 * Generates the Firebase config. On the client-side, it dynamically
 * sets the authDomain to the current hostname to ensure authentication
 * works correctly in preview and development environments.
 * @returns The Firebase configuration object.
 */
export function getFirebaseConfig(): FirebaseOptions {
    if (typeof window !== 'undefined') {
        // Client-side execution
        return {
            ...staticFirebaseConfig,
            authDomain: window.location.hostname,
        };
    }
    // Server-side execution
    return staticFirebaseConfig;
}


/**
 * Initializes and returns the Firebase app instance.
 * Ensures that initialization only happens once.
 * @param {FirebaseOptions} config - The configuration for the Firebase app.
 * @returns The initialized Firebase app.
 */
export function initializeFirebase(config: FirebaseOptions): FirebaseApp {
  if (getApps().length) {
    return getApp();
  }
  return initializeApp(config);
}
