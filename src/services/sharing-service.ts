
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { collection, addDoc, getDoc, doc, serverTimestamp, getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig } from '@/firebase/config';
import type { MapState } from "@/lib/types";
import { errorEmitter } from './error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from './errors';

const SHARED_MAPS_COLLECTION = 'sharedMaps';

let firestoreInstance: Firestore | null = null;
let firebaseApp: FirebaseApp | null = null;

function getDb(): Firestore {
    if (firestoreInstance) {
        return firestoreInstance;
    }
    
    console.log("Attempting to initialize Firebase with config:", firebaseConfig);

    if (getApps().length === 0) {
        if (Object.values(firebaseConfig).some(value => !value)) {
            const errorMessage = "Firebase config is incomplete. Check environment variables.";
            console.error(errorMessage, firebaseConfig);
            throw new Error(errorMessage);
        }
        firebaseApp = initializeApp(firebaseConfig);
    } else {
        firebaseApp = getApp();
    }
    
    firestoreInstance = getFirestore(firebaseApp);
    return firestoreInstance;
}

export async function checkFirestoreConnection(): Promise<void> {
    try {
        const db = getDb();
        const docRef = doc(db, 'health-check-collection', 'health-check-doc');
        await getDoc(docRef);
    } catch (error: any) {
        if (error.code !== 'permission-denied') {
            console.error("Critical Firestore connection error:", error);
            throw new Error(`Could not connect to Firestore: ${error.message}`);
        }
    }
}

/**
 * Debug function to read a specific document and log its content or error.
 */
export async function debugReadDocument(): Promise<void> {
    console.log("Attempting to read debug document from Firestore...");
    try {
        const db = getDb();
        // ID from the user's screenshot
        const docId = "dtP6WVCYBmxUHPXbxcxZ"; 
        const docRef = doc(db, SHARED_MAPS_COLLECTION, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            console.log("SUCCESS! Document data:", docSnap.data());
        } else {
            console.log("Document not found, but connection was successful.");
        }
    } catch (error: any) {
        console.error("DEBUG READ FAILED:", error);
    }
}

export function saveMapState(mapState: Omit<MapState, 'createdAt'>) {
    const db = getDb();
    const mapStateJSON = JSON.stringify(mapState);
    const dataToSend = {
        mapStateJSON: mapStateJSON,
        createdAt: serverTimestamp(),
    };
    const collectionRef = collection(db, SHARED_MAPS_COLLECTION);
    
    addDoc(collectionRef, dataToSend)
        .catch(serverError => {
            console.error("Caught error during addDoc:", serverError);
            const permissionError = new FirestorePermissionError({
                path: `/${SHARED_MAPS_COLLECTION}/{new_doc_id}`,
                operation: 'create',
                requestResourceData: dataToSend,
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        });
}

export async function getMapState(mapId: string): Promise<MapState | null> {
    try {
        const db = getDb();
        const docRef = doc(db, SHARED_MAPS_COLLECTION, mapId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.mapStateJSON && typeof data.mapStateJSON === 'string') {
                return JSON.parse(data.mapStateJSON) as MapState;
            }
            return null;
        } else {
            console.log("No such map state document!");
            return null;
        }
    } catch (error) {
        console.error("Error getting map state from Firestore:", error);
        throw new Error("Could not retrieve map state.");
    }
}
