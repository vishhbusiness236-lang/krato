import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runScan, type Issue } from '@/lib/scan';
import { notifyWebhook } from '@/lib/webhook/notify';

export const runtime = 'nodejs';
export const maxDuration = 60;

// a scheduled scan is "due" again after ~23 hours
const DAY_MS = 23 * 60 * 60 * 1000;

// AI-written issues change their wording on every scan, so their fingerprints
// never match between runs. Only rule-based issues (accessibility, network,
// console, exploration, unsanitized input) can be diffed reliably.
function isAiIssue(issue: Issue): boolean {
  return (issue as { source?: string }).source === 'ai';
}

function diffIssues(prevIssues: Issue[], currentIssues: Issue[]) {
  const prevStable = prevIssues.filter((i) => !isAiIssue(i));
  const currStable = currentIssues.filter((i) => !isAiIssue(i));

  const prev = new Set(prevStable.map((i) => i.fingerprint).filter(Boolean));
  const curr = new Set(currStable.map((i) => i.fingerprint).filter(Boolean));

  return {
    newIssues: currStable.filter((i) => !prev.has(i.fingerprint)),
    resolvedIssues: prevStable.filter((i) => i.fingerprint && !curr.has(i.fingerprint)),
    persistedCount: currStable.filter((i) => prev.has(i.fingerprint)).length,
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // one scan per call: the oldest one that has not run in the last ~23 hours
  const cutoff = new Date(Date.now() - DAY_MS).toISOString();
  const { data: due, error: fetchError } = await supabase
    .from('scheduled_scans')
    .select('*')
    .or(`last_run.is.null,last_run.lt.${cutoff}`)
    .order('last_run', { ascending: true, nullsFirst: true })
    .limit(1);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const scheduled = due?.[0];
  if (!scheduled) {
    return NextResponse.json({ ranScans: 0, results: [] });
  }

  // claim it first so overlapping calls do not pick the same scan
  await supabase
    .from('scheduled_scans')
    .update({ last_run: new Date().toISOString() })
    .eq('id', scheduled.id);

  try {
    const { scanData, analysis, screenshotBase64, journeys } = await runScan(scheduled.url);
    const currentIssues: Issue[] = analysis.issues || [];

    // compare with the previous scan of the same url for the same user
    let regression: ReturnType<typeof diffIssues> | null = null;
    if (scheduled.user_id) {
      const { data: previousScan } = await supabase
        .from('scans')
        .select('analysis')
        .eq('url', scanData.url)
        .eq('user_id', scheduled.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousScan?.analysis) {
        try {
          const prevAnalysis = JSON.parse(previousScan.analysis);
          const prevIssues: Issue[] = Array.isArray(prevAnalysis.issues) ? prevAnalysis.issues : [];
          regression = diffIssues(prevIssues, currentIssues);
        } catch (err) {
          console.error('Cron regression parse failed:', err);
        }
      }
    }

    const { error: insertError } = await supabase.from('scans').insert({
      url: scanData.url,
      scan_data: scanData,
      analysis: JSON.stringify(analysis),
      screenshot: `data:image/png;base64,${screenshotBase64}`,
      journeys: journeys || [],
      user_id: scheduled.user_id ?? null,
      regression,
      source: 'scheduled',
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    const { data: webhookList, error: webhookError } = await supabase
      .from('webhooks')
      .select('webhook_url, platform')
      .eq('url', scheduled.url);

    if (!webhookError && webhookList?.length) {
      const criticalCount = currentIssues.filter((issue) => issue.severity === 'critical').length;
      const totalIssues = currentIssues.length;
      webhookList.forEach((entry) => {
        notifyWebhook(
          entry.webhook_url,
          entry.platform,
          scanData.url,
          analysis.summary,
          criticalCount,
          totalIssues
        );
      });
    }

    return NextResponse.json({
      ranScans: 1,
      results: [
        {
          url: scheduled.url,
          status: 'success',
          newIssues: regression?.newIssues.length ?? null,
          resolvedIssues: regression?.resolvedIssues.length ?? null,
          persisted: regression?.persistedCount ?? null,
        },
      ],
    });
  } catch (err: any) {
    return NextResponse.json({
      ranScans: 1,
      results: [{ url: scheduled.url, status: 'failed', error: err.message }],
    });
  }
}