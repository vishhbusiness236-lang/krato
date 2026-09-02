import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

const MAX_PAGES = 5;

export type ExplorationStyle = 'happy_path' | 'edge_case' | 'adversarial' | 'security';

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
  suggestedFix?: string;
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
  interactionAttempts?: string[];
  securityFindings?: string[];
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

// ---------- HAPPY PATH ----------
// No extra interaction — plain crawl + observe. Handled by the default loop, no helper needed.

// ---------- EDGE CASE ----------
// Fills inputs with extreme/invalid data and force-submits forms, to surface
// validation gaps and crashes that happy-path scanning won't catch.

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
        await input.blur().catch(() => {});
        attempts.push(`Filled input[type=${type}] with edge-case value`);
        await page.waitForTimeout(300);
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
          await page.waitForTimeout(2000);
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

// ---------- ADVERSARIAL ----------
// Rapid multi-click on buttons (race condition probing), double-submits forms,
// and back/forward navigation spam — designed to surface bugs that only show up
// under rushed/repeated real-world usage (double charges, duplicate submits, etc).

async function runAdversarialInteractions(page: any): Promise<string[]> {
  const attempts: string[] = [];

  try {
    const buttons = page.locator('button:not([disabled])');
    const buttonCount = await buttons.count();

    for (let i = 0; i < Math.min(buttonCount, 8); i++) {
      const button = buttons.nth(i);
      try {
        // rapid multi-click — probes for race conditions / duplicate-action bugs
        await button.click({ timeout: 2000, force: true });
        await button.click({ timeout: 2000, force: true });
        await button.click({ timeout: 2000, force: true });
        attempts.push(`Rapid triple-clicked button #${i + 1}`);
        await page.waitForTimeout(500);
      } catch {
        // button not clickable — skip
      }
    }

    const forms = page.locator('form');
    const formCount = await forms.count();
    for (let i = 0; i < Math.min(formCount, 3); i++) {
      try {
        const submitBtn = forms.nth(i).locator('button[type="submit"], input[type="submit"]').first();
        if (await submitBtn.count() > 0) {
          // double-submit — probes for duplicate-submission bugs (e.g. double charge)
          await submitBtn.click({ timeout: 2000, force: true });
          await submitBtn.click({ timeout: 2000, force: true });
          attempts.push(`Double-submitted form #${i + 1}`);
          await page.waitForTimeout(1500);
        }
      } catch {
        // skip
      }
    }

    // back/forward navigation spam — probes for state bugs on rapid nav
    try {
      await page.goBack({ timeout: 3000 }).catch(() => {});
      await page.goForward({ timeout: 3000 }).catch(() => {});
      attempts.push('Spammed back/forward navigation');
    } catch {
      // skip
    }
  } catch (err) {
    // non-fatal — adversarial pass is best-effort
  }

  return attempts;
}

// ---------- SECURITY ----------
// Fills inputs with XSS/injection/template-injection payloads (safe, non-destructive,
// no real attacks executed) and checks whether the payload comes back unescaped in the
// page HTML — a signal of missing output sanitization. This is a basic application-level
// sanity check, not a full security audit.

const SECURITY_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  '{{7*7}}',
  '${7*7}',
  "'; DROP TABLE users; --",
];

async function runSecurityInteractions(page: any): Promise<{ attempts: string[]; findings: string[] }> {
  const attempts: string[] = [];
  const findings: string[] = [];

  try {
    const inputs = page.locator(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]), textarea'
    );
    const count = await inputs.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const input = inputs.nth(i);
      const payload = SECURITY_PAYLOADS[i % SECURITY_PAYLOADS.length];
      try {
        await input.fill(payload, { timeout: 3000 });
        await input.blur().catch(() => {});
        attempts.push(`Filled input #${i + 1} with security payload`);
        await page.waitForTimeout(300);
      } catch {
        continue;
      }
    }

    const forms = page.locator('form');
    const formCount = await forms.count();
    for (let i = 0; i < Math.min(formCount, 3); i++) {
      try {
        const submitBtn = forms.nth(i).locator('button[type="submit"], input[type="submit"]').first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click({ timeout: 3000, force: true });
          attempts.push(`Submitted form #${i + 1} with security payloads`);
          await page.waitForTimeout(1500);
        }
      } catch {
        // skip
      }
    }

    // check if any payload got reflected unescaped in the page
    try {
      const html = await page.content();
      for (const payload of SECURITY_PAYLOADS) {
        if (payload.includes('<script>') || payload.includes('<img')) {
          if (html.includes(payload)) {
            findings.push(`Payload reflected unescaped in page HTML: ${payload} — possible missing output sanitization.`);
          }
        }
      }
    } catch {
      // skip
    }
  } catch (err) {
    // non-fatal — security pass is best-effort
  }

  return { attempts, findings };
}

function buildTriagedIssues(pageScans: PageScan[], style: ExplorationStyle): Issue[] {
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

      const isServerError = statusNum >= 500 || err.status === 'FAILED';
      const suggestedFix =
        err.status === 'FAILED'
          ? `Check if ${err.method} ${endpointPath} is reachable — could be a timeout, CORS block, DNS issue, or the endpoint being down. Add error handling/retry logic on the frontend for this call.`
          : statusNum >= 500
          ? `Server threw a ${err.status} on ${err.method} ${endpointPath} — check server-side logs for a stack trace and add a try/catch around the failing handler.`
          : statusNum === 404
          ? `${err.method} ${endpointPath} returned 404 — the route may be missing, misspelled, or not deployed. Verify the endpoint exists and the frontend is calling the right path.`
          : statusNum === 401 || statusNum === 403
          ? `${err.method} ${endpointPath} returned ${err.status} — check that auth tokens/cookies are being sent correctly and that the user has the right permissions for this action.`
          : `${err.method} ${endpointPath} returned ${err.status} — inspect the request payload and response body to see why it failed, and add proper error handling on the client.`;

      issues.push({
        type: isServerError ? 'Network Failure' : 'Failed Request',
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
        suggestedFix,
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
        suggestedFix: `Open DevTools on ${page.url} and reproduce this error to get the full stack trace, then trace it back to the source file/line. Common causes: a null/undefined value being accessed before it's ready, or a third-party script failing to load — wrap the risky code in a try/catch or add a null check.`,
      });
    }

    if (page.interactionAttempts && page.interactionAttempts.length > 0) {
      const label =
        style === 'adversarial'
          ? 'Adversarial Exploration'
          : style === 'security'
          ? 'Security Exploration'
          : 'Edge Case Exploration';

      const descriptionByStyle: Record<string, string> = {
        adversarial: `Ran ${page.interactionAttempts.length} adversarial interaction(s) on this page (rapid multi-clicks, double-submits, back/forward navigation spam) to probe for race conditions and duplicate-action bugs.`,
        security: `Ran ${page.interactionAttempts.length} security interaction(s) on this page (XSS/injection payloads in inputs and forms) to probe for missing input sanitization. This is a basic app-level check, not a full security audit.`,
        edge_case: `Ran ${page.interactionAttempts.length} edge-case interaction(s) on this page (extreme/invalid input values, forced form submits).`,
      };

      const suggestedFixByStyle: Record<string, string> = {
        adversarial: `Add debouncing/disabling on buttons after first click (disable while a request is in-flight) and idempotency keys on form submissions to prevent duplicate actions like double charges.`,
        security: `If any payload reflected unescaped (see below), sanitize/escape all user input before rendering it back to the page. Otherwise, no action needed — this was just the probe pass.`,
        edge_case: `Add proper input validation (client + server side) for extreme values — length limits, type checks, and rejecting malformed input with a clear error message instead of letting the form submit silently.`,
      };

      issues.push({
        type: label,
        description: descriptionByStyle[style] || descriptionByStyle.edge_case,
        severity: 'low',
        location: page.url,
        evidence: page.interactionAttempts.join('; '),
        reproSteps: page.interactionAttempts,
        suggestedFix: suggestedFixByStyle[style] || suggestedFixByStyle.edge_case,
      });
    }

    if (page.securityFindings && page.securityFindings.length > 0) {
      for (const finding of page.securityFindings) {
        issues.push({
          type: 'Possible Unsanitized Input',
          description: finding,
          severity: 'critical',
          location: page.url,
          evidence: finding,
          reproSteps: [
            `Visit ${page.url}`,
            'Submit a form or input field with an XSS-style payload (e.g. <script>alert(1)</script>)',
            'Check page HTML — payload appears unescaped instead of encoded',
          ],
          suggestedFix: `Escape/encode this input before rendering it (use your framework's built-in escaping — e.g. React does this by default unless you're using dangerouslySetInnerHTML). If this is server-rendered, run it through an HTML sanitizer before output. Never render raw user input directly into the DOM.`,
        });
      }
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
      /fburl\.com/i,
      /Credential Management service/i,
      /ErrorUtils caught an error/i,
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
      /\/collect(\?|$)/i,
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
      /\/videoplayback/i,
      /googlevideo\.com/i,
    ];

    function isNoiseUrl(u: string) {
      return NOISE_URL_PATTERNS.some((pattern) => pattern.test(u));
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

    let interactionAttempts: string[] | undefined;
    let securityFindings: string[] | undefined;

    if (style === 'edge_case') {
      interactionAttempts = await runEdgeCaseInteractions(page);
    } else if (style === 'adversarial') {
      interactionAttempts = await runAdversarialInteractions(page);
    } else if (style === 'security') {
      const result = await runSecurityInteractions(page);
      interactionAttempts = result.attempts;
      securityFindings = result.findings;
    }
    // happy_path: no extra interaction, just observe

       if (currentUrl === url) {
      // scroll through the page first to trigger lazy-loaded content before capturing
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 100);
        });
      });
      await page.waitForTimeout(500);
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
      interactionAttempts,
      securityFindings,
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

  const triagedIssues = buildTriagedIssues(pageScans, style);

  const pageBreakdown = pageScans
    .map(
      (p) =>
        `- ${p.url}: ${p.buttons.length} buttons, ${p.formsCount} forms, ${p.inputsCount} inputs, ${p.consoleErrors.length} console errors, ${p.networkErrors.length} network errors`
    )
    .join('\n');

  const styleNotes: Record<ExplorationStyle, string> = {
    happy_path: 'This scan used HAPPY PATH exploration: normal browsing behavior, no adversarial input.',
    edge_case:
      'This scan used EDGE CASE exploration: inputs were filled with extreme/invalid values and forms were force-submitted to probe validation and error handling.',
    adversarial:
      'This scan used ADVERSARIAL exploration: buttons were rapid-clicked and forms double-submitted to probe for race conditions and duplicate-action bugs.',
    security:
      'This scan used SECURITY exploration: inputs were filled with XSS/injection-style payloads to check for basic missing output sanitization. This is a sanity check, not a full security audit.',
  };

  const prompt = `
You are a QA expert analyzing a multi-page website scan report.

Start URL: ${url}
Exploration style: ${style}
${styleNotes[style]}
Pages scanned: ${scanData.pagesScanned}

Per-page breakdown:
${pageBreakdown}

Note: network and console errors are already reported separately with exact endpoints and status codes, so do NOT repeat them in your issues list. Only add issues that require judgment — e.g. suspiciously few buttons/forms/inputs for the page type, structural concerns, weak input validation implied by the exploration style, or UX red flags visible from the data. IMPORTANT: the per-page breakdown above shows counts for EACH individual page separately — do not assume a page has zero buttons/forms/inputs unless that exact page's line in the breakdown shows 0. Cross-check against the per-page numbers before flagging a "missing interactive elements" issue, and always name the specific page URL, not the site as a whole.

For every issue you list, also include a "suggestedFix" — a concrete, actionable fix (1-3 sentences, plain English or a short code-level pointer). Be specific to the issue, not generic advice.

Respond with ONLY valid JSON in this exact structure, nothing else:

{
  "summary": "2-3 sentence plain-English overview of the site's health across the pages scanned",
  "priorityFix": "1-2 sentences on what to fix first and why, considering both the errors already found and anything you notice",
  "issues": [
    {
      "type": "short issue name",
      "description": "plain-English explanation, mention which page(s) affected if relevant",
      "severity": "critical" | "medium" | "low",
      "location": "the specific page URL this issue was found on, if applicable",
      "reproSteps": ["step 1", "step 2", "step 3"],
      "suggestedFix": "concrete, actionable fix for this specific issue"
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
      model: 'openai/gpt-oss-20b',
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
    const aiIssues: Issue[] = (Array.isArray(parsed.issues) ? parsed.issues : []).map((issue: Issue) => {
      const cleanSteps = (issue.reproSteps || []).filter((s) => typeof s === 'string' && s.trim().length > 0);
      return {
        ...issue,
        reproSteps:
          cleanSteps.length > 0
            ? cleanSteps
            : [`Visit ${issue.location || url}`, `Review: ${issue.description}`, 'Confirm the issue is still present'],
        suggestedFix:
          typeof issue.suggestedFix === 'string' && issue.suggestedFix.trim().length > 0
            ? issue.suggestedFix
            : undefined,
      };
    });
    analysis = {
      summary: parsed.summary || '',
      priorityFix: parsed.priorityFix || '',
      issues: [...triagedIssues, ...aiIssues],
    };
  } catch (err) {
    console.error('🔥 Groq parse failed. Raw content was:', rawContent);
    console.error('🔥 Parse error:', err);
    analysis = {
      summary: 'Analysis unavailable — could not parse AI response.',
      priorityFix: '',
      issues: triagedIssues,
    };
  }

  return { scanData, analysis, screenshotBase64 };
}