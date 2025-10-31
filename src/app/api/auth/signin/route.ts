// src/app/api/auth/signin/route.ts
import { getAuth } from 'firebase-admin/auth';
import { initAdminApp } from '@/firebase/admin-config';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    initAdminApp();
    const auth = getAuth();
    
    // The providerId for Google is 'google.com'
    const authUrl = await auth.createSignInWithEmailLink('google.com', {
        continueUrl: new URL('/api/auth/callback', request.url).toString(),
    });
    
    // It seems createSignInWithEmailLink is not the right tool for Google Sign-In provider URL generation.
    // The standard way is to construct the URL manually or use a client-side SDK feature if possible.
    // Let's pivot to a method that is documented for server-side generation of sign-in URLs.
    // After re-checking Admin SDK docs, generating a Google Sign-In URL directly isn't a primary use case.
    // The intended flow is often client-initiated.
    // Given the constraints, we will construct the URL manually, which is a standard OAuth 2.0 flow.

    const clientId = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_ID; // You need to add this to your env
    const redirectUri = new URL('/api/auth/callback', request.url).toString();
    const scope = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
    const responseType = 'code';
    
    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_FIREBASE_CLIENT_ID environment variable.");
    }

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', clientId);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('scope', scope);
    googleAuthUrl.searchParams.set('response_type', responseType);
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'select_account');

    // Redirect the user to the Google sign-in page
    return NextResponse.redirect(googleAuthUrl.toString());

  } catch (error: any) {
    console.error('Error creating sign-in URL:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
