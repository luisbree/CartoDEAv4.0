
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
 * Checks the connection to Firestore by performing a dummy read.
 * Throws an error if the connection fails for any reason other than permissions.
 */
export async function checkFirestoreConnection(): Promise<void> {
    console.log("checkFirestoreConnection: Iniciando verificación de conexión con Firestore.");
    try {
        const db = getDb();
        const docRef = doc(db, 'health-check', 'status-check');
        console.log("checkFirestoreConnection: Realizando lectura de prueba en Firestore.");
        await getDoc(docRef);
        console.log("checkFirestoreConnection: La lectura de prueba fue exitosa (o falló por permisos, lo cual es aceptable). Conexión establecida.");
    } catch (error: any) {
        console.error("checkFirestoreConnection: Falló la conexión con Firestore:", error);
        // Rethrow the error so it can be caught by the UI layer
        throw new Error(`No se pudo conectar a Firestore: ${error.message}`);
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
            const data = docSnap.data();
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
