
'use client';

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';


/**
 * Initializes Firebase if it hasn't been initialized yet.
 * This is a robust way to get the Firebase app instance.
 * @returns The initialized FirebaseApp instance.
 */
function getFirebaseApp(): FirebaseApp {
    console.log("getFirebaseApp: Verificando si Firebase necesita inicialización.");
    if (getApps().length === 0) {
        // Ensure all config values are defined before initializing
        if (Object.values(firebaseConfig).some(value => value === undefined || value === null)) {
            console.error("Firebase config está incompleta. Verifique las variables de entorno.");
            // Log which keys are missing
            for (const key in firebaseConfig) {
                if (firebaseConfig[key as keyof typeof firebaseConfig] === undefined) {
                    console.error(`Clave faltante: ${key}`);
                }
            }
        }
        console.log("Intentando inicializar Firebase con la siguiente configuración:", firebaseConfig);
        const app = initializeApp(firebaseConfig);
        console.log("Firebase inicializado correctamente.");
        return app;
    }
    console.log("Firebase ya está inicializado, obteniendo la instancia existente.");
    return getApp();
}


/**
 * Gets the initialized Firestore instance.
 * Ensures that Firebase is initialized before returning the instance.
 * @returns The Firestore instance.
 */
export function getFirestoreInstance(): Firestore {
    const app = getFirebaseApp();
    return getFirestore(app);
}
