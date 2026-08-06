import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  if (typeof req.headers.get('user-agent') !== 'undefined') {
    // clear the landing flag so the landing experience can appear again on the next visit
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.set('krato_seen_landing', '', { maxAge: 0, path: '/' });
    return response;
  }

  return NextResponse.redirect(new URL('/login', req.url));
}
