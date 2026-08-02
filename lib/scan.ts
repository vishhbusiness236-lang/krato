import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

const MAX_PAGES = 5;

export interface Issue {
  type: string;
  description: string;
  severity: 'critical' | 'medium' | 'low';
  location?: string;
}

export interface AnalysisResult {
  summary: string;
  priorityFix: string;
  issues: Issue[];
}

interface PageScan {
  url: string;
  buttons: string[];
  links: string[];
  formsCount: number;
  inputsCount: number;
  consoleErrors: string[];
  networkErrors: { url: string; status: number | string }[];
}

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

export async function runScan(inputUrl: string) {
  let url = inputUrl;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const startOrigin = new URL(url).origin;
  const browser = await getBrowser();
  const context = await browser.newContext();

  const visited = new Set<string>();
  const toVisit: string[] = [url];
  const pageScans: PageScan[] = [];
  let screenshotBase64 = '';

  while (toVisit.length > 0 && pageScans.length < MAX_PAGES) {
    const currentUrl = toVisit.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

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
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err: any) {
      await page.close();
      if (currentUrl === url) {
        await browser.close();
        throw new Error(`Failed to load page: ${err.message}`);
      }
      continue;
    }

    await page.waitForTimeout(1500);

    const buttons = (await page.locator('button').allTextContents()).filter(
      (b) => b.trim() !== ''
    );
    const rawLinks = await page.locator('a').evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).href).filter(Boolean)
    );
    const forms = await page.locator('form').count();
    const inputs = await page.locator('input').count();

    if (currentUrl === url) {
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      screenshotBase64 = screenshotBuffer.toString('base64');
    }

    pageScans.push({
      url: currentUrl,
      buttons,
      links: rawLinks.slice(0, 20),
      formsCount: forms,
      inputsCount: inputs,
      consoleErrors,
      networkErrors,
    });

    if (pageScans.length < MAX_PAGES) {
      for (const link of rawLinks) {
        try {
          const linkUrl = new URL(link);
          const clean = `${linkUrl.origin}${linkUrl.pathname}`;
          if (
            linkUrl.origin === startOrigin &&
            !visited.has(clean) &&
            !toVisit.includes(clean) &&
            !clean.match(/\.(png|jpg|jpeg|svg|pdf|zip|css|js)$/i)
          ) {
            toVisit.push(clean);
          }
        } catch {}
      }
    }

    await page.close();
  }

  await browser.close();

  const scanData = {
    url,
    pagesScanned: pageScans.length,
    pages: pageScans,
    buttons: pageScans.flatMap((p) => p.buttons),
    links: pageScans.flatMap((p) => p.links).slice(0, 20),
    formsCount: pageScans.reduce((sum, p) => sum + p.formsCount, 0),
    inputsCount: pageScans.reduce((sum, p) => sum + p.inputsCount, 0),
    consoleErrors: pageScans.flatMap((p) => p.consoleErrors.map((e) => `[${p.url}] ${e}`)),
    networkErrors: pageScans.flatMap((p) => p.networkErrors),
  };

  const pageBreakdown = pageScans
    .map(
      (p) =>
        `- ${p.url}: ${p.buttons.length} buttons, ${p.formsCount} forms, ${p.inputsCount} inputs, ${p.consoleErrors.length} console errors, ${p.networkErrors.length} network errors`
    )
    .join('\n');

  const prompt = `
You are a QA expert analyzing a multi-page website scan report.

Start URL: ${url}
Pages scanned: ${scanData.pagesScanned}

Per-page breakdown:
${pageBreakdown}

Total console errors across all pages: ${JSON.stringify(scanData.consoleErrors)}
Total network errors across all pages: ${JSON.stringify(scanData.networkErrors)}

Analyze this data and respond with ONLY valid JSON in this exact structure, nothing else:

{
  "summary": "2-3 sentence plain-English overview of the site's health across the pages scanned",
  "priorityFix": "1-2 sentences on what to fix first and why",
  "issues": [
    {
      "type": "short issue name",
      "description": "plain-English explanation, mention which page(s) affected if relevant",
      "severity": "critical" | "medium" | "low",
      "location": "the specific page URL this issue was found on, if applicable"
    }
  ]
}

Severity rules:
- "critical": breaks core functionality (failed page load, broken forms/auth, JS crash preventing interaction)
- "medium": degrades experience but page still usable (some failed requests, non-fatal console errors)
- "low": cosmetic or minor (missing alt text patterns, very few interactive elements found, minor warnings)

If there are no console/network errors and buttons/forms/inputs seem reasonable across all pages, return an empty issues array and a positive summary.
Do not include markdown formatting, code fences, or any text outside the JSON object.
`;

  const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
  });

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

  return { scanData, analysis, screenshotBase64 };
}