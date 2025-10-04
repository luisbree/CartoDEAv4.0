
'use client';

import { collection, addDoc, getDoc, doc, serverTimestamp, Firestore } from "firebase/firestore";
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
 * Saves the given map state to Firestore with retry logic.
 * @param mapState - The state of the map to save.
 * @param maxRetries - The maximum number of times to retry on failure.
 * @returns A promise that resolves to the unique ID of the saved map state.
 */
export async function saveMapState(
    mapState: Omit<MapState, 'createdAt'>,
    maxRetries = 3,
    delay = 1000
): Promise<string> {
    const db = getDb();
    const dataToSend = {
        ...mapState,
        createdAt: serverTimestamp(),
    };

    console.log("--- Objeto a enviar a Firestore ---");
    console.log(JSON.stringify(dataToSend, null, 2));

    for (let i = 0; i < maxRetries; i++) {
        try {
            const docRef = await addDoc(collection(db, SHARED_MAPS_COLLECTION), dataToSend);
            return docRef.id;
        } catch (error) {
            console.warn(`Firestore write failed (attempt ${i + 1}/${maxRetries}):`, error);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // Incremental backoff
            } else {
                console.error("### ERROR DE FIREBASE AL GUARDAR (después de reintentos) ###", error);
                throw new Error("Could not save map state after multiple attempts.");
            }
        }
    }
    // This line should not be reachable, but is here for type safety.
    throw new Error("Failed to save map state.");
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
