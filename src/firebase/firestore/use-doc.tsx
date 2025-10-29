"use client";

import { useEffect, useState, useRef } from 'react';
import {
  getFirestore,
  onSnapshot,
  doc,
  type DocumentData,
  type Firestore,
  type DocumentReference,
} from 'firebase/firestore';

/**
 * A hook to get a document from Firestore.
 * @param firestore The Firestore instance.
 * @param path The path to the document.
 * @param pathSegments The path segments to the document.
 * @returns The document, or undefined if it is not yet loaded.
 */
export function useDoc<T>(
  firestore: Firestore,
  path: string,
  ...pathSegments: string[]
) {
  const [data, setData] = useState<T | undefined>();

  const docPath = [path, ...pathSegments].join('/');
  const docRef = useRef<DocumentReference<DocumentData> | null>(null);

  useEffect(() => {
    // Create the document reference once.
    if (!docRef.current) {
      docRef.current = doc(firestore, docPath);
    }

    // Subscribe to the document.
    const unsubscribe = onSnapshot(docRef.current, (doc) => {
      setData(doc.data() as T);
    });

    // Unsubscribe from the document when the component is unmounted.
    return () => unsubscribe();
  }, [docPath, firestore]);

  return data;
}
