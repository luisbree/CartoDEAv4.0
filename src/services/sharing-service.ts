
'use client';

import { collection, addDoc, getDoc, doc, serverTimestamp, type Firestore } from "firebase/firestore";
import type { MapState } from "@/lib/types";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const SHARED_MAPS_COLLECTION = 'sharedMaps';

/**
 * Debug function to read a specific document and log its content or error.
 */
export async function debugReadDocument(db: Firestore): Promise<void> {
    if (!db) {
        console.log("DEBUG: Firestore instance not available for debug read.");
        return;
    }
    console.log("DEBUG: Attempting to read debug document from Firestore...");
    try {
        const docId = "dtP6WVCYBmxUHPXbxcxZ"; // ID from the user's screenshot
        const docRef = doc(db, SHARED_MAPS_COLLECTION, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            console.log("DEBUG SUCCESS! Document data:", docSnap.data());
        } else {
            console.log("DEBUG SUCCESS! Document not found, but connection was successful.");
        }
    } catch (error: any) {
        console.error("DEBUG READ FAILED:", error);
    }
}

export function saveMapState(db: Firestore, mapState: Omit<MapState, 'createdAt'>) {
    if (!db) {
        // This case should be prevented by the UI logic, but it's a good safeguard.
        console.error("Firestore instance not provided to saveMapState.");
        const err = new Error("Firestore not initialized. Cannot save map state.");
        const permissionError = new FirestorePermissionError({
            path: `/${SHARED_MAPS_COLLECTION}/{new_doc_id}`,
            operation: 'create',
            requestResourceData: {}, // No data to send
        });
        // We can still emit the error to show something is wrong with the connection setup
        errorEmitter.emit('permission-error', permissionError);
        return;
    }
    
    const mapStateJSON = JSON.stringify(mapState);
    const dataToSend = {
        mapStateJSON: mapStateJSON,
        createdAt: serverTimestamp(),
    };
    const collectionRef = collection(db, SHARED_MAPS_COLLECTION);
    console.log(collectionRef)
    addDoc(collectionRef, dataToSend)
        .catch(serverError => {
            console.error("Caught error during addDoc:", serverError);
            const permissionError = new FirestorePermissionError({
                path: `/${'\'\'\''}${SHARED_MAPS_COLLECTION}${'\'\'\''}}/{new_doc_id}`,
                operation: 'create',
                requestResourceData: dataToSend,
            });
            errorEmitter.emit('permission-error', permissionError);
        });
}

export async function getMapState(db: Firestore, mapId: string): Promise<MapState | null> {
    if (!db) {
        console.error("Firestore instance not available for getMapState.");
        return null;
    }
    try {
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
