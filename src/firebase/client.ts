
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// Hardcoded fallback config to ensure connectivity.
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCj8v_s-k9-c7g8fD4E3b2a1Z0-YxWvCqA",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "geo-deas.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "geo-deas",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "geo-deas.appspot.com",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "81014389010",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:81014389010:web:1e3f4b5a6c7d8e9f0a1b2c"
};

/**
 * Initializes Firebase if it hasn't been initialized yet.
 * This is a robust way to get the Firebase app instance.
 * @returns The initialized FirebaseApp instance.
 */
function getFirebaseApp(): FirebaseApp {
    if (getApps().length === 0) {
        // Ensure all config values are defined before initializing
        if (Object.values(firebaseConfig).some(value => value === undefined || value === null)) {
            console.error("Firebase config is missing one or more required values. Check your .env file and next.config.js");
            // This will likely still fail, but provides a clear error.
        }
        return initializeApp(firebaseConfig);
    }
    return getApp();
}


/**
 * Gets the initialized Firestore instance.
 * Ensures that Firebase is initialized before returning the instance.
 * @returns The Firestore instance.
 */
export function getFirestoreInstance(): Firestore {
    const app = getFirebaseApp();
    return getFirestore(app);
}
