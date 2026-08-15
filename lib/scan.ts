import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

const MAX_PAGES = 5;

export type ExplorationStyle = 'happy_path' | 'edge_case';

export interface Issue {
  type: string;
  description: string;
  severity: 'critical' | 'medium' | 'low';
  location?: string;
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
  edgeCaseAttempts?: string[];
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

const EDGE_CASE_VALUES: Record<string, string> = {
  text: 'A'.repeat(500),
  email: 'not-an-email',
  number: '-99999999',
  tel: '!!!not-a-phone!!!',
  url: 'javascript:alert(1)',
  search: '<script>alert(1)</script>',
  password: ' ',
  default: "' OR '1'='1",
};

// Fills inputs with deliberately bad/extreme data and attempts to submit forms,
// to surface validation gaps and crashes that happy-path scanning won't catch.
async function runEdgeCaseInteractions(page: any): Promise<string[]> {
  const attempts: string[] = [];

  try {
    const inputs = page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
    const count = await inputs.count();

    for (let i = 0; i < Math.min(count, 15); i++) {
      const input = inputs.nth(i);
      try {
        const type = (await input.getAttribute('type')) || 'text';
        const value = EDGE_CASE_VALUES[type] || EDGE_CASE_VALUES.default;
        await input.fill(value, { timeout: 3000 });
        await input.blur().catch(() => {}); // trigger validation-on-blur handlers
        attempts.push(`Filled input[type=${type}] with edge-case value`);
        await page.waitForTimeout(300); // give validation/UI time to react
      } catch {
        // input not fillable (e.g. disabled, readonly) — skip
      }
    }


    const forms = page.locator('form');
    const formCount = await forms.count();
    for (let i = 0; i < Math.min(formCount, 3); i++) {
      try {
        const submitBtn = forms.nth(i).locator('button[type="submit"], input[type="submit"]').first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click({ timeout: 3000, force: true });
          attempts.push(`Submitted form #${i + 1} with edge-case data`);
          await page.waitForTimeout(2000); // longer wait to catch delayed errors/crashes post-submit
        }
      } catch {
        // submit failed/blocked — that's fine, we just record the attempt
      }
    }
  } catch (err) {
    // non-fatal — edge case pass is best-effort
  }

  return attempts;
}

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

    if (page.edgeCaseAttempts && page.edgeCaseAttempts.length > 0) {
      issues.push({
        type: 'Edge Case Exploration',
        description: `Ran ${page.edgeCaseAttempts.length} edge-case interaction(s) on this page (extreme/invalid input values, forced form submits).`,
        severity: 'low',
        location: page.url,
        evidence: page.edgeCaseAttempts.join('; '),
        reproSteps: page.edgeCaseAttempts,
      });
    }
  }

  return issues;
}

export async function runScan(inputUrl: string, style: ExplorationStyle = 'happy_path') {
  let url = inputUrl;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const startOrigin = new URL(url).origin;
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });

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

    const NOISE_PATTERNS = [
      /requestStorageAccess/i,
      /Permission denied/i,
      /ResizeObserver loop/i,
      /Failed to load resource.*favicon/i,
      /third-party cookie/i,
      /\[Report Only\]/i,
      /Content Security Policy/i,
    ];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const isNoise = NOISE_PATTERNS.some((pattern) => pattern.test(text));
        if (!isNoise) consoleErrors.push(text);
      }
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    const NOISE_URL_PATTERNS = [
      /\/collect(\?|$)/i,           // GA/GTM tracking beacons (g/collect, ccm/collect etc.)
      /google-analytics\.com/i,
      /googletagmanager\.com/i,
      /doubleclick\.net/i,
      /facebook\.com\/tr/i,
      /connect\.facebook\.net/i,
      /hotjar\.com/i,
      /segment\.io/i,
      /mixpanel\.com/i,
      /sentry\.io/i,
      /analytics/i,
    ];

    function isNoiseUrl(url: string) {
      return NOISE_URL_PATTERNS.some((pattern) => pattern.test(url));
    }

    page.on('response', (res) => {
      if (res.status() >= 400 && !isNoiseUrl(res.url())) {
        networkErrors.push({
          url: res.url(),
          status: res.status(),
          method: res.request().method(),
        });
      }
    });
    page.on('requestfailed', (request) => {
      if (!isNoiseUrl(request.url())) {
        networkErrors.push({
          url: request.url(),
          status: 'FAILED',
          method: request.method(),
        });
      }
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

    let edgeCaseAttempts: string[] | undefined;
    if (style === 'edge_case') {
      edgeCaseAttempts = await runEdgeCaseInteractions(page);
      // errors triggered by edge-case interactions will already have been
      // captured by the console/response listeners above
    }

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
      edgeCaseAttempts,
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
    style,
    pagesScanned: pageScans.length,
    pages: pageScans,
    buttons: pageScans.flatMap((p) => p.buttons),
    links: pageScans.flatMap((p) => p.links).slice(0, 20),
    formsCount: pageScans.reduce((sum, p) => sum + p.formsCount, 0),
    inputsCount: pageScans.reduce((sum, p) => sum + p.inputsCount, 0),
    consoleErrors: pageScans.flatMap((p) => p.consoleErrors.map((e) => `[${p.url}] ${e}`)),
    networkErrors: pageScans.flatMap((p) => p.networkErrors),
  };

  const triagedIssues = buildTriagedIssues(pageScans);

  const pageBreakdown = pageScans
    .map(
      (p) =>
        `- ${p.url}: ${p.buttons.length} buttons, ${p.formsCount} forms, ${p.inputsCount} inputs, ${p.consoleErrors.length} console errors, ${p.networkErrors.length} network errors`
    )
    .join('\n');

  const styleNote =
    style === 'edge_case'
      ? 'This scan used EDGE CASE exploration: inputs were filled with extreme/invalid values and forms were force-submitted to probe validation and error handling.'
      : 'This scan used HAPPY PATH exploration: normal browsing behavior, no adversarial input.';

  const prompt = `
You are a QA expert analyzing a multi-page website scan report.

Start URL: ${url}
Exploration style: ${style}
${styleNote}
Pages scanned: ${scanData.pagesScanned}

Per-page breakdown:
${pageBreakdown}

Note: network and console errors are already reported separately with exact endpoints and status codes, so do NOT repeat them in your issues list. Only add issues that require judgment — e.g. suspiciously few buttons/forms/inputs for the page type, structural concerns, weak input validation implied by the exploration style, or UX red flags visible from the data.

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