"use client";

import { useEffect, useState, useRef } from 'react';
import {
  getFirestore,
  onSnapshot,
  collection,
  query,
  type DocumentData,
  type Firestore,
  type Query,
} from 'firebase/firestore';

/**
 * A hook to get a collection from Firestore.
 * @param firestore The Firestore instance.
 * @param path The path to the collection.
 * @param pathSegments The path segments to the collection.
 * @returns An array of documents in the collection, or undefined if the collection is not yet loaded.
 */
export function useCollection<T>(
  firestore: Firestore,
  path: string,
  ...pathSegments: string[]
) {
  const [data, setData] = useState<T[] | undefined>();

  const collectionPath = [path, ...pathSegments].join('/');
  const collectionQuery = useRef<Query<DocumentData> | null>(null);

  useEffect(() => {
    // Create the query once.
    if (!collectionQuery.current) {
      collectionQuery.current = query(collection(firestore, collectionPath));
    }

    // Subscribe to the query.
    const unsubscribe = onSnapshot(
      collectionQuery.current,
      (querySnapshot) => {
        const data: T[] = [];

        // For each document in the collection, add it to the data array.
        // The id of the document is added to the data object.
        querySnapshot.forEach((doc) => {
          data.push({ ...doc.data(), id: doc.id } as T);
        });

        setData(data);
      }
    );

    // Unsubscribe from the query when the component is unmounted.
    return () => unsubscribe();
  }, [collectionPath, firestore]);

  return data;
}
