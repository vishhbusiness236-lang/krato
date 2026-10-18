// app/api/keys/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateApiKey } from '@/lib/apiKey';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await req.json().catch(() => ({ name: undefined }));
  const { plaintext, hash, prefix } = generateApiKey();

  const { error: dbError } = await supabase.from('api_keys').insert({
    user_id: user.id,
    key_hash: hash,
    key_prefix: prefix,
    name: name || 'CI key',
  });

  if (dbError) {
    console.error('Failed to save API key:', dbError);
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });
  }

  // plaintext is returned ONLY here, never stored, never shown again —
  // the frontend must tell the user to copy it now
  return NextResponse.json({ apiKey: plaintext, prefix });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, created_at, last_used_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
  }

  return NextResponse.json({ keys: data });
}
