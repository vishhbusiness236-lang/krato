import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendScanReportEmail(
  to: string,
  url: string,
  summary: string,
  totalIssues: number,
  pdfBuffer: Buffer
) {
  await resend.emails.send({
    from: 'Krato <onboarding@resend.dev>',
    to,
    subject: `Krato scan report — ${url}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px;">
        <h2>Krato Scan Report</h2>
        <p><strong>URL:</strong> ${url}</p>
        <p><strong>Issues found:</strong> ${totalIssues}</p>
        <p>${summary}</p>
        <p>Full report attached as PDF.</p>
        <p style="color:#999; font-size:12px;">Sent by Krato — kratoai.vercel.app</p>
      </div>
    `,
    attachments: [
      {
        filename: 'krato-report.pdf',
        content: pdfBuffer.toString('base64'),
      },
    ],
  });
}