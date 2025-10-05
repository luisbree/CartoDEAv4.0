
import { EventEmitter } from 'events';
import type { FirestorePermissionError } from './errors';

// Define the event map for our emitter
interface ErrorEvents {
    'permission-error': (error: FirestorePermissionError) => void;
}

// Extend EventEmitter with our typed event map
class TypedEventEmitter<T> {
    private emitter = new EventEmitter();

    emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean {
        return this.emitter.emit(event as string, ...args);
    }

    on<K extends keyof T>(event: K, listener: T[K]): this {
        this.emitter.on(event as string, listener as (...args: any[]) => void);
        return this;
    }

    off<K extends keyof T>(event: K, listener: T[K]): this {
        this.emitter.off(event as string, listener as (...args: any[]) => void);
        return this;
    }
}

// Create a singleton instance of the typed event emitter
export const errorEmitter = new TypedEventEmitter<ErrorEvents>();
