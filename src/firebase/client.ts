
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Initializes Firebase if it hasn't been initialized yet.
 * This is a robust way to get the Firebase app instance.
 * @returns The initialized FirebaseApp instance.
 */
function getFirebaseApp(): FirebaseApp {
    if (getApps().length === 0) {
        // Ensure all config values are defined before initializing
        if (Object.values(firebaseConfig).some(value => value === undefined)) {
            console.error("Firebase config is missing one or more required values.");
            // In a real app, you might want to throw an error or handle this more gracefully
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
