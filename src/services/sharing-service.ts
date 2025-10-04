
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
    return new Promise(async (resolve, reject) => {
        try {
            const db = getDb();
            // A more reliable way to check connection is to try to get a document,
            // even a non-existent one. If it fails with a specific network error,
            // we know the connection is bad. Permission errors mean we connected.
            await getDoc(doc(db, 'health-check', 'status'));
            resolve(); // Resolve on success or permission denied (which means we connected)
        } catch (error: any) {
             // 'permission-denied' is still a successful connection test for our purposes.
            if (error.code === 'permission-denied') {
                resolve();
            } else {
                // For all other errors (network, config, etc.), we reject.
                reject(new Error(`No se pudo conectar a Firestore: ${error.message}`));
            }
        }
    });
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
