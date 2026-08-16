import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  let analysis;
  try {
    analysis = JSON.parse(data.analysis);
  } catch {
    analysis = { summary: data.analysis, priorityFix: '', issues: [] };
  }

  return NextResponse.json({
    scanId: data.id,
    scanData: data.scan_data,
    analysis,
    screenshot: data.screenshot,
    isPublic: data.is_public || false,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { isPublic } = body;

  if (typeof isPublic !== 'boolean') {
    return NextResponse.json({ error: 'isPublic must be a boolean' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('scans')
    .update({ is_public: isPublic })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, is_public')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to update scan' }, { status: 500 });
  }

  return NextResponse.json({ scanId: data.id, isPublic: data.is_public });
}