import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

const MAX_PAGES = 5;

export interface Issue {
  type: string;
  description: string;
  severity: 'critical' | 'medium' | 'low';
  location?: string;
  // NEW: actionable/triaged fields
  endpoint?: string;
  method?: string;
  statusCode?: number | string;
  reproSteps?: string[];
  evidence?: string;
}

export interface AnalysisResult {
  summary: string;
  priorityFix: string;
  issues: Issue[];
}

interface NetworkErrorEntry {
  url: string;
  status: number | string;
  method: string;
}

interface PageScan {
  url: string;
  buttons: string[];
  links: string[];
  formsCount: number;
  inputsCount: number;
  consoleErrors: string[];
  networkErrors: NetworkErrorEntry[];
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

// Turns raw network/console errors into guaranteed-accurate, actionable issues
// (no AI involved here, so the endpoint/status/repro steps are always correct)
function buildTriagedIssues(pageScans: PageScan[]): Issue[] {
  const issues: Issue[] = [];

  for (const page of pageScans) {
    for (const err of page.networkErrors) {
      let endpointPath = err.url;
      try {
        endpointPath = new URL(err.url).pathname;
      } catch {}

      const statusNum = typeof err.status === 'number' ? err.status : 0;
      const severity: Issue['severity'] =
        err.status === 'FAILED' || statusNum >= 500 ? 'critical' : 'medium';

      issues.push({
        type: statusNum >= 500 || err.status === 'FAILED' ? 'Network Failure' : 'Failed Request',
        description:
          err.status === 'FAILED'
            ? `Request to ${endpointPath} failed to complete (network error or timeout).`
            : `${err.method} ${endpointPath} returned ${err.status}.`,
        severity,
        location: page.url,
        endpoint: endpointPath,
        method: err.method,
        statusCode: err.status,
        reproSteps: [
          `Visit ${page.url}`,
          `Trigger the action that calls ${err.method} ${endpointPath}`,
          `Observe response: ${err.status}`,
        ],
      });
    }

    for (const errText of page.consoleErrors) {
      issues.push({
        type: 'Console Error',
        description: errText,
        severity: 'medium',
        location: page.url,
        evidence: errText,
        reproSteps: [`Visit ${page.url}`, 'Open browser DevTools console', 'Error appears on load or interaction'],
      });
    }
  }

  return issues;
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
    const networkErrors: NetworkErrorEntry[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('response', (res) => {
      if (res.status() >= 400) {
        networkErrors.push({
          url: res.url(),
          status: res.status(),
          method: res.request().method(),
        });
      }
    });
    page.on('requestfailed', (request) => {
      networkErrors.push({
        url: request.url(),
        status: 'FAILED',
        method: request.method(),
      });
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

  // Guaranteed-accurate issues built directly from raw data (no AI hallucination risk)
  const triagedIssues = buildTriagedIssues(pageScans);

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

Note: network and console errors are already reported separately with exact endpoints and status codes, so do NOT repeat them in your issues list. Only add issues that require judgment — e.g. suspiciously few buttons/forms/inputs for the page type, structural concerns, or UX red flags visible from the data.

Respond with ONLY valid JSON in this exact structure, nothing else:

{
  "summary": "2-3 sentence plain-English overview of the site's health across the pages scanned",
  "priorityFix": "1-2 sentences on what to fix first and why, considering both the errors already found and anything you notice",
  "issues": [
    {
      "type": "short issue name",
      "description": "plain-English explanation, mention which page(s) affected if relevant",
      "severity": "critical" | "medium" | "low",
      "location": "the specific page URL this issue was found on, if applicable"
    }
  ]
}

If nothing stands out beyond the already-reported errors, return an empty issues array and a summary that references the error counts.
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
    const parsed = JSON.parse(rawContent);
    const aiIssues: Issue[] = Array.isArray(parsed.issues) ? parsed.issues : [];
    analysis = {
      summary: parsed.summary || '',
      priorityFix: parsed.priorityFix || '',
      // Triaged (rule-based) issues first since they're the most actionable, then AI judgment calls
      issues: [...triagedIssues, ...aiIssues],
    };
  } catch (err) {
    analysis = {
      summary: 'Analysis unavailable — could not parse AI response.',
      priorityFix: '',
      issues: triagedIssues,
    };
  }

  return { scanData, analysis, screenshotBase64 };
}