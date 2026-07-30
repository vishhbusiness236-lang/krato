import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('id', id)
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
  });
}