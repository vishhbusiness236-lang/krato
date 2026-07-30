import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { ReportDocument } from '@/lib/pdf/ReportDocument';

export async function POST(req: NextRequest) {
  try {
    const { url, analysis, scanData } = await req.json();

    if (!url || !scanData) {
      return NextResponse.json({ error: 'Missing scan data' }, { status: 400 });
    }

    const pdfBuffer = await renderToBuffer(
      ReportDocument({
        url,
        scanDate: new Date().toLocaleDateString(),
        analysis: analysis || 'No analysis available.',
        scanData,
      })
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="krato-report.pdf"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'PDF generation failed' }, { status: 500 });
  }
}