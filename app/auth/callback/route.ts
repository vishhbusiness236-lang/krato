import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const code = req.nextUrl.searchParams.get('code');
  const flowId = req.nextUrl.searchParams.get('sb_flow_id');

  if (!code) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);

  if (error) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.redirect(new URL('/', req.url));
}
