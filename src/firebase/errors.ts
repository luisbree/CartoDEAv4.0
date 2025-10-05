
// Defines the context for a Firestore security rule violation
export type SecurityRuleContext = {
    path: string;
    operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
    requestResourceData?: any; // The data being sent in a create/update operation
};

/**
 * A custom error class for Firestore permission errors.
 * This class is designed to be thrown on the client-side when a Firestore
 * operation fails due to security rules. It formats the error message
 * in a way that can be caught and displayed by a custom error overlay,
 * providing rich, actionable context for developers to debug their rules.
 */
export class FirestorePermissionError extends Error {
    constructor(context: SecurityRuleContext) {
        // Construct the detailed error message as a JSON string
        const message = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:
${JSON.stringify({ securityRuleContext: context }, null, 2)}`;
        
        super(message);
        this.name = 'FirestorePermissionError';

        // This is important for ensuring the correct prototype chain
        Object.setPrototypeOf(this, FirestorePermissionError.prototype);
    }
}
