// app/api/scan/route.ts

import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function getBrowser() {
  try {
    const executablePath = await chromium.executablePath();
    return await playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  } catch (err) {
    return await playwrightChromium.launch({ headless: true });
  }
}

interface Issue {
  type: string;
  description: string;
  severity: 'critical' | 'medium' | 'low';
  location?: string;
}

interface AnalysisResult {
  summary: string;
  priorityFix: string;
  issues: Issue[];
}

export async function POST(req: NextRequest) {
  try {
    let { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const browser = await getBrowser();
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
      networkErrors.push({ url: request.url(), status: 'FAILED' });
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

Analyze this data and respond with ONLY valid JSON in this exact structure, nothing else:

{
  "summary": "2-3 sentence plain-English overview of the page's health",
  "priorityFix": "1-2 sentences on what to fix first and why",
  "issues": [
    {
      "type": "short issue name, e.g. 'Console Error' or 'Failed Network Request' or 'No Interactive Elements'",
      "description": "plain-English explanation of the issue and likely cause",
      "severity": "critical" | "medium" | "low",
      "location": "optional: relevant URL, selector, or file if known"
    }
  ]
}

Severity rules:
- "critical": breaks core functionality (failed page load, broken forms/auth, JS crash preventing interaction)
- "medium": degrades experience but page still usable (some failed requests, non-fatal console errors)
- "low": cosmetic or minor (missing alt text patterns, very few interactive elements found, minor warnings)

If there are no console/network errors and buttons/forms/inputs seem reasonable, return an empty issues array and a positive summary.
Do not include markdown formatting, code fences, or any text outside the JSON object.
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
          response_format: { type: 'json_object' },
        }),
      }
    );

    const groqData = await groqResponse.json();
    const rawContent = groqData.choices?.[0]?.message?.content;

    let analysis: AnalysisResult;
    try {
      analysis = JSON.parse(rawContent);
      if (!Array.isArray(analysis.issues)) analysis.issues = [];
    } catch (err) {
      analysis = {
        summary: 'Analysis unavailable — could not parse AI response.',
        priorityFix: '',
        issues: [],
      };
    }

    const supabase = await createClient();
    const { data: savedScan, error: dbError } = await supabase
      .from('scans')
      .insert({
        url,
        scan_data: scanData,
        analysis: JSON.stringify(analysis),
        screenshot: `data:image/png;base64,${screenshotBase64}`,
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Failed to save scan — FULL ERROR:', JSON.stringify(dbError, null, 2));
    } else {
      console.log('Scan saved successfully, id:', savedScan?.id);
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