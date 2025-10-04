
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
 * Saves the given map state to Firestore and returns the generated document ID.
 * @param mapState - The state of the map to save.
 * @returns A promise that resolves to the unique ID of the saved map state.
 */
export async function saveMapState(mapState: Omit<MapState, 'createdAt'>): Promise<string> {
    try {
        const db = getDb();
        
        // **DEBUGGING STEP: Log the object before sending to Firestore**
        console.log("--- Objeto a enviar a Firestore ---");
        console.log(JSON.stringify(mapState, null, 2));
        
        const docRef = await addDoc(collection(db, SHARED_MAPS_COLLECTION), {
            ...mapState,
            createdAt: serverTimestamp(),
        });
        return docRef.id;
    } catch (error) {
        console.error("### ERROR DE FIREBASE AL GUARDAR ###", error);
        throw new Error("Could not save map state.");
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
