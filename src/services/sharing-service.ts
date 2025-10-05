
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { collection, addDoc, getDoc, doc, serverTimestamp, getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig } from '@/firebase/config';
import type { MapState, SerializableMapLayer } from "@/lib/types";
import { errorEmitter } from '@/services/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/services/errors';


const SHARED_MAPS_COLLECTION = 'sharedMaps';

let firestoreInstance: Firestore | null = null;
let firebaseApp: FirebaseApp | null = null;

function getDb(): Firestore {
    if (firestoreInstance) {
        return firestoreInstance;
    }

    if (getApps().length === 0) {
        if (Object.values(firebaseConfig).some(value => value === undefined || value === null || value === '')) {
            const errorMessage = "Firebase config está incompleta. Verifique las variables de entorno.";
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
        // We only rethrow if it's NOT a permission error, as permission errors mean the connection itself worked.
        if (error.code !== 'permission-denied') {
            console.error("Critical Firestore connection error:", error);
            throw new Error(`No se pudo conectar a Firestore: ${error.message}`);
        }
        // If it is a permission error, the connection is considered successful.
    }
}


export async function saveMapState(mapState: Omit<MapState, 'createdAt'>): Promise<string> {
    const db = getDb();
    
    // Convert the entire map state object into a single JSON string.
    const mapStateJSON = JSON.stringify(mapState);
    
    const dataToSend = {
        mapStateJSON: mapStateJSON,
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


export async function getMapState(mapId: string): Promise<MapState | null> {
    try {
        const db = getDb();
        const docRef = doc(db, SHARED_MAPS_COLLECTION, mapId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            // Parse the JSON string back into a MapState object.
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
