// src/app/api/auth/signin/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_ID; 
    if (!clientId) {
      throw new Error("La variable de entorno NEXT_PUBLIC_FIREBASE_CLIENT_ID no está configurada.");
    }
    
    const redirectUri = new URL('/api/auth/callback', request.url).toString();
    const scope = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
    const responseType = 'code';
    
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
