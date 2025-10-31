// src/app/api/auth/callback/route.ts
import { getAuth } from 'firebase-admin/auth';
import { initAdminApp } from '@/firebase/admin-config';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/?error=auth-failed', request.url));
  }

  try {
    initAdminApp();
    const adminAuth = getAuth();
    
    // Exchange authorization code for tokens
    const oauth2Client = new OAuth2Client(
      process.env.NEXT_PUBLIC_FIREBASE_CLIENT_ID,
      process.env.FIREBASE_CLIENT_SECRET, // You need to add this server-side secret
      new URL('/api/auth/callback', request.url).toString()
    );
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.id_token) {
        throw new Error('No ID token returned from Google.');
    }

    // Create a Firebase custom session cookie
    const firebaseToken = await adminAuth.createCustomToken(tokens.id_token);
    // The session cookie logic needs to be more robust for production,
    // but for this environment, we'll create a session that lasts 5 days.
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    const sessionCookie = await adminAuth.createSessionCookie(tokens.id_token, { expiresIn });
    
    // Set the cookie on the response
    cookies().set('session', sessionCookie, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });

    // Redirect back to the main page
    return NextResponse.redirect(new URL('/', request.url));

  } catch (error: any) {
    console.error('Error during auth callback:', error);
    return NextResponse.redirect(new URL(`/?error=auth-callback-failed&message=${error.message}`, request.url));
  }
}
