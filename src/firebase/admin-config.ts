// src/firebase/admin-config.ts
import * as admin from 'firebase-admin';

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKey) {
  throw new Error('The FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. This is required for server-side authentication.');
}

// Parse the service account key from the environment variable
let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountKey);
} catch (e) {
  throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. Make sure it is a valid JSON string.');
}


export const initAdminApp = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  try {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  } catch (error: any) {
    console.error("Firebase admin initialization error", error.stack);
    throw error;
  }
};
