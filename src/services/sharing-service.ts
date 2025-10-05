
'use client';

import { collection, addDoc, getDoc, doc, serverTimestamp, type Firestore } from "firebase/firestore";
import type { MapState } from "@/lib/types";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const SHARED_MAPS_COLLECTION = 'sharedMaps';

/**
 * Saves the current map state to Firestore and returns the new document's ID.
 * @param db The Firestore instance.
 * @param mapState The map state object to save.
 * @returns A promise that resolves to the new document ID, or rejects on error.
 */
export function saveMapState(db: Firestore, mapState: Omit<MapState, 'createdAt'>): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!db) {
            console.error("Firestore instance not provided to saveMapState.");
            const err = new FirestorePermissionError({
                path: `/${SHARED_MAPS_COLLECTION}/{new_doc_id}`,
                operation: 'create',
                requestResourceData: {},
            });
            errorEmitter.emit('permission-error', err);
            return reject(err);
        }

        const dataToSend = {
            ...mapState,
            createdAt: serverTimestamp(),
        };

        addDoc(collection(db, SHARED_MAPS_COLLECTION), dataToSend)
            .then(docRef => {
                resolve(docRef.id); // Resolve the promise with the new document ID
            })
            .catch(serverError => {
                console.error("Caught error during addDoc:", serverError);
                const permissionError = new FirestorePermissionError({
                    path: `/${SHARED_MAPS_COLLECTION}/{new_doc_id}`,
                    operation: 'create',
                    requestResourceData: dataToSend,
                });
                errorEmitter.emit('permission-error', permissionError);
                reject(permissionError);
            });
    });
}


/**
 * Retrieves a map state from Firestore by its ID.
 * @param db The Firestore instance.
 * @param mapId The ID of the document to retrieve.
 * @returns A promise that resolves to the MapState object or null if not found.
 */
export async function getMapState(db: Firestore, mapId: string): Promise<MapState | null> {
    if (!db) {
        console.error("Firestore instance not available for getMapState.");
        return null;
    }
    try {
        const docRef = doc(db, SHARED_MAPS_COLLECTION, mapId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // The data is already in the correct format, just cast it.
            return docSnap.data() as MapState;
        } else {
            console.log("No such map state document!");
            return null;
        }
    } catch (error) {
        console.error("Error getting map state from Firestore:", error);
        throw new Error("Could not retrieve map state.");
    }
}
