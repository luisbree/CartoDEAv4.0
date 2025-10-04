
'use client';

import { collection, addDoc, getDoc, doc, serverTimestamp, Firestore, enableNetwork, disableNetwork } from "firebase/firestore";
import { getFirestoreInstance } from '@/firebase/client';
import type { MapState } from "@/lib/types";

const SHARED_MAPS_COLLECTION = 'sharedMaps';

// A memoized instance of Firestore.
let firestore: Firestore | null = null;

function getDb() {
    if (!firestore) {
        firestore = getFirestoreInstance();
    }
    return firestore;
}

/**
 * Checks the connection to Firestore by performing a dummy read.
 * Throws an error if the connection fails.
 */
export async function checkFirestoreConnection(): Promise<void> {
    try {
        const db = getDb();
        await getDoc(doc(db, 'health-check', 'status'));
    } catch (error: any) {
        if (error.code === 'unavailable' || error.code === 'unimplemented' || error.code === 'permission-denied') {
            // A permission-denied error on a non-existent doc means we reached the service, which is a success for this check.
            // So we only throw for actual network/connectivity issues.
            if (error.code === 'unavailable') {
                throw new Error("No se pudo conectar con Firestore. Verifique su conexión a internet y la configuración.");
            }
        }
        // For other errors (like invalid config which might throw differently), or for permission-denied (which is OK here),
        // we either let it pass or catch specific cases if needed.
    }
}


/**
 * Saves the given map state to Firestore.
 * @param mapState - The state of the map to save.
 * @returns A promise that resolves to the unique ID of the saved map state.
 */
export async function saveMapState(mapState: Omit<MapState, 'createdAt'>): Promise<string> {
    const db = getDb();
    const dataToSend = {
        ...mapState,
        createdAt: serverTimestamp(),
    };
    
    try {
        const docRef = await addDoc(collection(db, SHARED_MAPS_COLLECTION), dataToSend);
        return docRef.id;
    } catch (error) {
        console.error("Error writing document to Firestore:", error);
        throw new Error("Could not save map state due to a database error.");
    }
}


/**
 * Retrieves a map state from Firestore using its unique ID.
 * @param mapId - The unique ID of the map state document.
 * @returns A promise that resolves to the MapState object, or null if not found.
 */
export async function getMapState(mapId: string): Promise<MapState | null> {
    try {
        const db = getDb();
        const docRef = doc(db, SHARED_MAPS_COLLECTION, mapId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // Firestore timestamps need to be handled if you need to display them
            const data = docSnap.data();
            // You might need to convert serverTimestamp to a serializable format here
            // if you pass it directly to client components.
            return data as MapState;
        } else {
            console.log("No such map state document!");
            return null;
        }
    } catch (error) {
        console.error("Error getting map state from Firestore:", error);
        throw new Error("Could not retrieve map state.");
    }
}
