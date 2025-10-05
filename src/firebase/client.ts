
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';


/**
 * Initializes Firebase if it hasn't been initialized yet.
 * This is a robust way to get the Firebase app instance.
 * @returns The initialized FirebaseApp instance.
 */
function getFirebaseApp(): FirebaseApp {
    if (getApps().length === 0) {
        // Ensure all config values are defined before initializing
        if (Object.values(firebaseConfig).some(value => value === undefined || value === null)) {
            console.error("Firebase config is missing one or more required values from environment variables.");
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
