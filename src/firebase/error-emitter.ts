// This file MUST NOT have "use client" so it can be used in server components.

import { EventEmitter } from 'events';
import type { FirestorePermissionError } from './errors';

// Define the shape of the events and their payloads.
interface TypedEvents {
  'permission-error': (error: FirestorePermissionError) => void;
}

class TypedEventEmitter<T extends Record<string, any>> {
  private emitter = new EventEmitter();

  on<K extends keyof T>(event: K, listener: T[K]): this {
    this.emitter.on(event as string, listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: T[K]): this {
    this.emitter.off(event as string, listener);
    return this;
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
    return this.emitter.emit(event as string, ...args);
  }
}

// Create a globally-shared, typed event emitter instance.
// This allows any part of the app (client or server components) to emit
// a 'permission-error' event, which will be caught by the FirebaseErrorListener
// in the root layout.
export const errorEmitter = new TypedEventEmitter<TypedEvents>();
