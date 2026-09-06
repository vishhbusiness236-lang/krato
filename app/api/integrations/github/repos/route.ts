import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('provider', 'github')
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: 'GitHub not connected', needsConnect: true }, { status: 401 });
  }

  try {
    const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    const data = await res.json();

    if (!res.ok || !Array.isArray(data)) {
      console.error('GitHub repos fetch failed', data);
      return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 });
    }

    const repos = data.map((r: any) => ({
      fullName: r.full_name,
      private: r.private,
    }));

    return NextResponse.json({ repos });
  } catch (err) {
    console.error('GitHub repos error', err);
    return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 });
  }
}