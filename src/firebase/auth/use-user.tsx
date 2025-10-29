"use client";
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '..';

/**
 * A hook to get the current user.
 * @returns The current user, or null if not logged in.
 */
export function useUser() {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(() => auth.currentUser);

  useEffect(() => {
    // onAuthStateChanged is the recommended way to get the current user.
    // It is called once with the initial state, and then whenever the state changes.
    const unsubscribe = auth.onAuthStateChanged(setUser);

    // Unsubscribe from the listener when the component is unmounted.
    return () => unsubscribe();
  }, [auth]);

  return user;
}
