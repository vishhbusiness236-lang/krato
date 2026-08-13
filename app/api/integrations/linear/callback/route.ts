import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const origin = req.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${origin}/?linear_error=1`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const tokenRes = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        redirect_uri: process.env.LINEAR_REDIRECT_URI!,
        client_id: process.env.LINEAR_CLIENT_ID!,
        client_secret: process.env.LINEAR_CLIENT_SECRET!,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Linear token exchange failed', tokenData);
      return NextResponse.redirect(`${origin}/?linear_error=1`);
    }

    // fetch user's teams so we know which team to create issues in
    const teamsRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        query: `query { teams(first: 1) { nodes { id name } } }`,
      }),
    });

    const teamsData = await teamsRes.json();
    const teamId = teamsData?.data?.teams?.nodes?.[0]?.id || null;

    await supabase.from('user_integrations').upsert(
      {
        user_id: user.id,
        provider: 'linear',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        team_id: teamId,
      },
      { onConflict: 'user_id,provider' }
    );

    return NextResponse.redirect(`${origin}/?linear_connected=1`);
  } catch (err) {
    console.error('Linear callback error', err);
    return NextResponse.redirect(`${origin}/?linear_error=1`);
  }
}