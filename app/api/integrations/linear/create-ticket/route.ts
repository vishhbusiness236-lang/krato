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
    .select('access_token, team_id')
    .eq('user_id', user.id)
    .eq('provider', 'linear')
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: 'Linear not connected', needsConnect: true }, { status: 401 });
  }

  if (!integration.team_id) {
    return NextResponse.json({ error: 'No Linear team found for this account' }, { status: 400 });
  }

  const body = await req.json();
  const { title, description, scanUrl } = body;

  try {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${integration.access_token}`,
      },
      body: JSON.stringify({
        query: `
          mutation IssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                url
              }
            }
          }
        `,
        variables: {
          input: {
            teamId: integration.team_id,
            title,
            description: `${description}${scanUrl ? `\n\nFound during Krato scan of: ${scanUrl}` : ''}`,
          },
        },
      }),
    });

    const data = await res.json();

    if (data.errors || !data?.data?.issueCreate?.success) {
      console.error('Linear issue create failed', data.errors || data);
      return NextResponse.json({ error: 'Failed to create Linear ticket' }, { status: 500 });
    }

    return NextResponse.json({ ticketUrl: data.data.issueCreate.issue.url });
  } catch (err) {
    console.error('Linear create-ticket error', err);
    return NextResponse.json({ error: 'Failed to create Linear ticket' }, { status: 500 });
  }
}