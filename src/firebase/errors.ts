// This file MUST NOT have "use client" so it can be used in server components.

// Define the context for a Firestore security rule violation.
export interface SecurityRuleContext {
  path: string;
  operation: 'create' | 'read' | 'update' | 'delete' | 'list';
  requestResourceData: unknown; // The data being sent in the request.
}

/**
 * A custom error class to represent Firestore security rule violations.
 * This extends the base Error class and adds the security rule context.
 */
export class FirestorePermissionError extends Error {
  context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    // Construct a detailed error message.
    const message = `Firestore permission denied on path '${context.path}' for operation '${context.operation}'.`;
    super(message);

    this.name = 'FirestorePermissionError';
    this.context = context;

    // This is for V8's stack trace API.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FirestorePermissionError);
    }

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
