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
    const { url, email } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const { scanData, analysis, screenshotBase64 } = await runScan(url);

    const supabase = await createClient();
    const { data: savedScan, error: dbError } = await supabase
      .from('scans')
      .insert({
        url: scanData.url,
        scan_data: scanData,
        analysis: JSON.stringify(analysis),
        screenshot: `data:image/png;base64,${screenshotBase64}`,
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
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Something went wrong' },
      { status: 500 }
    );
  }
}