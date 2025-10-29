
/**
 * @fileoverview This file is the entry point for all Firebase-related modules.
 * It exports all the necessary components, hooks, and functions for other parts
 * of the application to use. This "barrel" file simplifies imports, allowing
 * other modules to import from '@firebase' instead of from multiple specific
 * file paths.
 *
 * This pattern is useful for organizing code and making it easier to manage
 * dependencies. It also allows for a clear separation of concerns, as all
 * Firebase-related code is organized under the 'firebase' directory.
 */

export * from './config';
export * from './provider';
export * from './auth/use-user';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './client-provider';
