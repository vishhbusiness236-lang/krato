// app/api/scan/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    let { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Auto-add https:// if missing
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    const networkErrors: { url: string; status: number | string }[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('response', (res) => {
      if (res.status() >= 400) {
        networkErrors.push({ url: res.url(), status: res.status() });
      }
    });
    page.on('requestfailed', (request) => {
      networkErrors.push({
        url: request.url(),
        status: 'FAILED',
      });
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err: any) {
      await browser.close();
      return NextResponse.json(
        { error: `Failed to load page: ${err.message}` },
        { status: 400 }
      );
    }

    await page.waitForTimeout(2000);

    const buttons = (await page.locator('button').allTextContents()).filter(
      (b) => b.trim() !== ''
    );
    const links = (await page.locator('a').allTextContents()).filter(
      (l) => l.trim() !== ''
    );
    const forms = await page.locator('form').count();
    const inputs = await page.locator('input').count();

    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString('base64');

    await browser.close();

    const scanData = {
      url,
      buttons,
      links: links.slice(0, 20),
      formsCount: forms,
      inputsCount: inputs,
      consoleErrors,
      networkErrors,
    };

    const prompt = `
You are a QA expert analyzing a website scan report.

URL: ${scanData.url}
Buttons found: ${scanData.buttons.length} (${JSON.stringify(scanData.buttons)})
Links found: ${scanData.links.length}
Forms found: ${scanData.formsCount}
Inputs found: ${scanData.inputsCount}
Console errors: ${JSON.stringify(scanData.consoleErrors)}
Network errors: ${JSON.stringify(scanData.networkErrors)}

Based on this data:
1. Explain in clear, professional English what issues might exist on this page
2. If there are console/network errors, explain them in plain language (why they might have occurred)
3. If very few buttons/forms were found, note that content may be loading dynamically via JS
4. Give a short priority list: "fix this first"

Give only an actionable, concise report. No fluff.
`;

    const groqResponse = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      }
    );

    const groqData = await groqResponse.json();
    const analysis =
      groqData.choices?.[0]?.message?.content || 'Analysis unavailable.';

    return NextResponse.json({
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