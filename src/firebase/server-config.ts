
// This file is for server-side Firebase logic (e.g., in Server Actions or Route Handlers)
// It ensures Firebase is initialized only once per server instance.

import { initializeApp, getApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. This is required for server-side Firebase admin operations.');
}

const serviceAccount = JSON.parse(serviceAccountKey);

// Initialize Firebase Admin SDK if not already initialized
const app = !getApps().length ? initializeApp({
  credential: cert(serviceAccount)
}) : getApp();

const firestore = getFirestore(app);

export { app, firestore };
