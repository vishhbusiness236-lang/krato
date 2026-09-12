// app/api/scan/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runScan } from '@/lib/scan';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReportDocument } from '@/lib/pdf/ReportDocument';
import { sendScanReportEmail } from '@/lib/email/send';
import { notifyWebhook } from '@/lib/webhook/notify';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { url, email, style } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const { scanData, analysis, screenshotBase64, journeys } = await runScan(url, style || 'happy_path');

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- Regression diffing (#10/#15): compare against the most recent
    // prior scan of this same URL by this user, using stable fingerprints ---
    const { data: previousScan } = await supabase
      .from('scans')
      .select('analysis')
      .eq('url', scanData.url)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let regression: {
      newIssues: typeof analysis.issues;
      resolvedIssues: typeof analysis.issues;
      persistedCount: number;
    } | null = null;

    if (previousScan?.analysis) {
      try {
        const prevAnalysis = JSON.parse(previousScan.analysis);
        const prevIssues = Array.isArray(prevAnalysis.issues) ? prevAnalysis.issues : [];
        const currentIssues = analysis.issues || [];

        const prevFingerprints = new Set(prevIssues.map((i: any) => i.fingerprint).filter(Boolean));
        const currentFingerprints = new Set(currentIssues.map((i) => i.fingerprint).filter(Boolean));

        regression = {
          newIssues: currentIssues.filter((i) => !prevFingerprints.has(i.fingerprint)),
          resolvedIssues: prevIssues.filter((i: any) => i.fingerprint && !currentFingerprints.has(i.fingerprint)),
          persistedCount: currentIssues.filter((i) => prevFingerprints.has(i.fingerprint)).length,
        };
      } catch (err) {
        console.error('Failed to parse previous scan for regression diff:', err);
      }
    }

    const { data: savedScan, error: dbError } = await supabase
      .from('scans')
      .insert({
        url: scanData.url,
        scan_data: scanData,
        analysis: JSON.stringify(analysis),
        screenshot: `data:image/png;base64,${screenshotBase64}`,
        journeys: journeys || [],
        user_id: user.id,
        regression,
      })
      .select('id')
      .single();
    if (dbError) {
      console.error('Failed to save scan — FULL ERROR:', JSON.stringify(dbError, null, 2));
    }

    if (savedScan?.id) {
      const { data: webhookList, error: webhookError } = await supabase
        .from('webhooks')
        .select('webhook_url, platform')
        .eq('url', scanData.url);

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
    }

    if (email) {
      try {
        const pdfBuffer = await renderToBuffer(
          ReportDocument({
            url: scanData.url,
            scanDate: new Date().toLocaleDateString(),
            analysis,
            scanData,
          })
        );
        const totalIssues = analysis.issues?.length || 0;
        await sendScanReportEmail(email, scanData.url, analysis.summary, totalIssues, pdfBuffer);
      } catch (emailErr: any) {
        console.error('Failed to send email:', emailErr.message);
      }
    }

    return NextResponse.json({
      scanId: savedScan?.id,
      scanData,
      analysis,
      screenshot: `data:image/png;base64,${screenshotBase64}`,
      journeys: journeys || [],
      regression,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Something went wrong' },
      { status: 500 }
    );
  }
}