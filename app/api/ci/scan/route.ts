// app/api/ci/scan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/service';
import { runScan, type Issue } from '@/lib/scan';
import { hashApiKey } from '@/lib/apiKey';

export const runtime = 'nodejs';
export const maxDuration = 60;

type FailOn = 'critical' | 'medium' | 'any';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!apiKey || !apiKey.startsWith('krato_')) {
      return NextResponse.json({ error: 'Missing or invalid API key' }, { status: 401 });
    }

    const supabase = createClient();
    const keyHash = hashApiKey(apiKey);

    const { data: keyRow, error: keyError } = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (keyError || !keyRow) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const userId = keyRow.user_id;

    // best-effort — don't block the scan waiting on this write
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key_hash', keyHash)
      .then(() => {});

    const { url, style, failOn } = await req.json();
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const threshold: FailOn = failOn === 'medium' || failOn === 'any' ? failOn : 'critical';

    const { scanData, analysis, journeys } = await runScan(url, style || 'happy_path');

    // same regression diffing as the dashboard scan route — compare against
    // the most recent prior scan of this URL for this user
    const { data: previousScan } = await supabase
      .from('scans')
      .select('analysis')
      .eq('url', scanData.url)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let regression: {
      newIssues: Issue[];
      resolvedIssues: Issue[];
      persistedCount: number;
    } | null = null;

    if (previousScan?.analysis) {
      try {
        const prevAnalysis = JSON.parse(previousScan.analysis);
        const prevIssues: Issue[] = Array.isArray(prevAnalysis.issues) ? prevAnalysis.issues : [];
        const currentIssues = analysis.issues || [];

        const prevFingerprints = new Set(prevIssues.map((i) => i.fingerprint).filter(Boolean));
        const currentFingerprints = new Set(currentIssues.map((i) => i.fingerprint).filter(Boolean));

        regression = {
          newIssues: currentIssues.filter((i) => !prevFingerprints.has(i.fingerprint)),
          resolvedIssues: prevIssues.filter((i) => i.fingerprint && !currentFingerprints.has(i.fingerprint)),
          persistedCount: currentIssues.filter((i) => prevFingerprints.has(i.fingerprint)).length,
        };
      } catch (err) {
        console.error('CI scan regression parse failed:', err);
      }
    }

    const { data: savedScan, error: dbError } = await supabase
      .from('scans')
      .insert({
        url: scanData.url,
        scan_data: scanData,
        analysis: JSON.stringify(analysis),
        journeys: journeys || [],
        user_id: userId,
        regression,
        source: 'ci',
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Failed to save CI scan:', dbError);
    }

    const issues = analysis.issues || [];
    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const mediumCount = issues.filter((i) => i.severity === 'medium').length;

    const failingCount =
      threshold === 'any' ? issues.length : threshold === 'medium' ? criticalCount + mediumCount : criticalCount;

    const passed = failingCount === 0;

    return NextResponse.json(
      {
        passed,
        scanId: savedScan?.id,
        url: scanData.url,
        summary: analysis.summary,
        totalIssues: issues.length,
        criticalCount,
        mediumCount,
        threshold,
        reportUrl: savedScan?.id ? `https://kratoai.vercel.app/report/${savedScan.id}` : undefined,
        regression,
      },
      { status: passed ? 200 : 422 }
    );
  } catch (error: any) {
    console.error('CI scan error:', error);
    return NextResponse.json({ error: error.message || 'Something went wrong' }, { status: 500 });
  }
}
