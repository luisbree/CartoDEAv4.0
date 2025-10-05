
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
    console.log("Attempting to read debug document from Firestore...");
    try {
        const docId = "dtP6WVCYBmxUHPXbxcxZ"; // ID from the user's screenshot
        const docRef = doc(db, SHARED_MAPS_COLLECTION, docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            console.log("SUCCESS! Document data:", docSnap.data());
        } else {
            console.log("SUCCESS! Document not found, but connection was successful.");
        }
    } catch (error: any) {
        console.error("DEBUG READ FAILED:", error);
    }
}

export function saveMapState(db: Firestore, mapState: Omit<MapState, 'createdAt'>) {
    if (!db) {
        console.error("Firestore instance not available.");
        return;
    }
    
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
