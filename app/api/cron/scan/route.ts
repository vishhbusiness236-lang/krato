import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runScan } from '@/lib/scan';
import { notifyWebhook } from '@/lib/webhook/notify';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: dueScans, error: fetchError } = await supabase
    .from('scheduled_scans')
    .select('*');

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results = [];

  for (const scheduled of dueScans || []) {
    try {
      const { scanData, analysis, screenshotBase64 } = await runScan(scheduled.url);

      await supabase.from('scans').insert({
        url: scanData.url,
        scan_data: scanData,
        analysis: JSON.stringify(analysis),
        screenshot: `data:image/png;base64,${screenshotBase64}`,
        user_id: scheduled.user_id ?? null,
      });

      const { data: webhookList, error: webhookError } = await supabase
        .from('webhooks')
        .select('webhook_url, platform')
        .eq('url', scheduled.url);

      if (!webhookError && webhookList?.length) {
        const criticalCount = analysis.issues?.filter((issue) => issue.severity === 'critical').length || 0;
        const totalIssues = analysis.issues?.length || 0;
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

      await supabase
        .from('scheduled_scans')
        .update({ last_run: new Date().toISOString() })
        .eq('id', scheduled.id);

      results.push({ url: scheduled.url, status: 'success' });
    } catch (err: any) {
      results.push({ url: scheduled.url, status: 'failed', error: err.message });
    }
  }

  return NextResponse.json({ ranScans: results.length, results });
}