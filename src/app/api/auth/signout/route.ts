// src/app/api/auth/signout/route.ts
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Clear the session cookie
  cookies().delete('session');

  // Redirect to the home page
  return NextResponse.redirect(new URL('/', request.url));
}
