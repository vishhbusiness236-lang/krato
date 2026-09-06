import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const { title, description, scanUrl, repo } = body;

  if (!repo) {
    return NextResponse.json({ error: 'No repository selected', needsRepo: true }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${integration.access_token}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        title,
        body: `${description}${scanUrl ? `\n\nFound during Krato scan of: ${scanUrl}` : ''}`,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.html_url) {
      console.error('GitHub issue create failed', data);
      return NextResponse.json({ error: 'Failed to create GitHub issue' }, { status: 500 });
    }

    return NextResponse.json({ ticketUrl: data.html_url });
  } catch (err) {
    console.error('GitHub create-issue error', err);
    return NextResponse.json({ error: 'Failed to create GitHub issue' }, { status: 500 });
  }
}