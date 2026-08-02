import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function buildBadgeSvg(text: string, color: string) {
  const label = 'Krato QA';
  const labelWidth = 72;
  const valueWidth = Math.max(40, text.length * 7 + 20);
  const width = labelWidth + valueWidth;
  const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${label}: ${safeText}">
  <linearGradient id="smooth" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".7"/>
    <stop offset="1" stop-opacity=".7"/>
  </linearGradient>
  <rect rx="10" width="${width}" height="20" fill="#555"/>
  <rect rx="10" x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
  <rect rx="10" width="${width}" height="20" fill="url(#smooth)"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${safeText}</text>
  </g>
</svg>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { scanId: string } }
) {
  const scanId = params.scanId;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('scans')
      .select('analysis')
      .eq('id', scanId)
      .single();

    if (error || !data) {
      throw new Error('Scan not found');
    }

    const analysis =
      typeof data.analysis === 'string' ? JSON.parse(data.analysis) : data.analysis;
    const issues = analysis?.issues || [];
    const criticalCount = issues.filter((issue: any) => issue.severity === 'critical').length;
    const mediumLowCount = issues.filter(
      (issue: any) => issue.severity === 'medium' || issue.severity === 'low'
    ).length;

    let text = 'passing';
    let color = '#4c1';

    if (criticalCount > 0) {
      text = `${criticalCount} critical`;
      color = '#e05d44';
    } else if (mediumLowCount > 0) {
      text = `${issues.length} issues`;
      color = '#fe7d37';
    }

    const svg = buildBadgeSvg(text, color);
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch {
    const svg = buildBadgeSvg('scan not found', '#9f9f9f');
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  }
}
