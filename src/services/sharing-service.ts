

'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { collection, addDoc, getDoc, doc, serverTimestamp, getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig } from '@/firebase/config';
import type { MapState } from "@/lib/types";
import { errorEmitter } from '@/services/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/services/errors';


const SHARED_MAPS_COLLECTION = 'sharedMaps';

let firestoreInstance: Firestore | null = null;
let firebaseApp: FirebaseApp | null = null;

/**
 * Initializes Firebase if it hasn't been initialized yet and returns the Firestore instance.
 * This is a robust way to get the Firestore instance, safe for client-side execution.
 * @returns The initialized Firestore instance.
 */
function getDb(): Firestore {
    if (firestoreInstance) {
        return firestoreInstance;
    }

    if (getApps().length === 0) {
        // Ensure all config values are defined before initializing
        if (Object.values(firebaseConfig).some(value => value === undefined || value === null || value === '')) {
            console.error("Firebase config está incompleta. Verifique las variables de entorno.");
            throw new Error("Configuración de Firebase incompleta. Verifique las variables de entorno.");
        }
        console.log("Firebase no inicializado. Intentando inicializar con la configuración:", firebaseConfig);
        firebaseApp = initializeApp(firebaseConfig);
        console.log("Firebase inicializado correctamente.");
    } else {
        console.log("Firebase ya está inicializado, obteniendo la instancia existente.");
        firebaseApp = getApp();
    }
    
    firestoreInstance = getFirestore(firebaseApp);
    return firestoreInstance;
}

/**
 * Checks the connection to Firestore by performing a dummy read.
 * Throws an error if the connection fails for any reason other than permissions.
 */
export async function checkFirestoreConnection(): Promise<void> {
    console.log("checkFirestoreConnection: Iniciando verificación de conexión con Firestore.");
    try {
        const db = getDb(); // This function now handles initialization.
        // Attempt to read a document that is unlikely to exist.
        // This is a lightweight operation to check connectivity and auth setup.
        const docRef = doc(db, 'health-check-collection', 'health-check-doc');
        await getDoc(docRef);
        console.log("checkFirestoreConnection: La lectura de prueba a Firestore fue exitosa (o falló solo por permisos, lo cual es válido). Conexión verificada.");
    } catch (error: any) {
        console.error("checkFirestoreConnection: La conexión con Firestore falló de manera crítica:", error);
        // We only rethrow if it's NOT a permission error, as permission errors mean the connection itself worked.
        if (error.code !== 'permission-denied') {
            throw new Error(`No se pudo conectar a Firestore: ${error.message}`);
        }
        // If it's a permission error, we can consider the connection "verified"
        console.log("checkFirestoreConnection: Se recibió un error de 'permission-denied', lo cual confirma que la conexión al servicio está funcionando.");
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
    
    const collectionRef = collection(db, SHARED_MAPS_COLLECTION);
    
    return new Promise((resolve, reject) => {
        addDoc(collectionRef, dataToSend)
            .then(docRef => {
                resolve(docRef.id);
            })
            .catch(serverError => {
                console.error("Error writing document to Firestore:", serverError);
                
                const permissionError = new FirestorePermissionError({
                    path: `/${SHARED_MAPS_COLLECTION}/{new_doc_id}`,
                    operation: 'create',
                    requestResourceData: dataToSend,
                } satisfies SecurityRuleContext);

                errorEmitter.emit('permission-error', permissionError);

                reject(new Error("Could not save map state due to a database error."));
            });
    });
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
