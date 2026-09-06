import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const origin = req.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${origin}/?github_error=1`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        code,
        redirect_uri: process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI!,
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('GitHub token exchange failed', tokenData);
      return NextResponse.redirect(`${origin}/?github_error=1`);
    }

    // fetch the GitHub username so we have something to display/reference later
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    const githubUser = await userRes.json();
    const username = githubUser?.login || null;

    await supabase.from('user_integrations').upsert(
      {
        user_id: user.id,
        provider: 'github',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        team_id: username,
      },
      { onConflict: 'user_id,provider' }
    );

    return NextResponse.redirect(`${origin}/?github_connected=1`);
  } catch (err) {
    console.error('GitHub callback error', err);
    return NextResponse.redirect(`${origin}/?github_error=1`);
  }
}