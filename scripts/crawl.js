// scripts/crawl.js
// Usage: node scripts/crawl.js https://your-app-url.com

const { chromium } = require('playwright');

async function main() {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.error('❌ Please provide a URL. Example:');
    console.error('   node scripts/crawl.js https://findteamo.vercel.app');
    process.exit(1);
  }

  console.log(`🔍 Starting crawl for: ${targetUrl}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push({ text: err.message, location: 'uncaught exception' });
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      networkErrors.push({ url: response.url(), status, statusText: response.statusText() });
    }
  });

  page.on('requestfailed', (request) => {
    networkErrors.push({
      url: request.url(),
      status: 'FAILED',
      statusText: request.failure()?.errorText || 'Unknown failure',
    });
  });

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (err) {
    console.error(`⚠️  Page load issue: ${err.message}`);
  }
await page.waitForTimeout(2000); // React/Next.js hydration ke liye extra wait
  console.log('✅ Page loaded. Scanning for interactive elements...\n');

  const buttons = await page.locator('button').allTextContents();
  const links = await page.locator('a').allTextContents();
  const forms = await page.locator('form').count();
  const inputs = await page.locator('input').count();

  await page.screenshot({ path: 'scan-screenshot.png', fullPage: true });

  await browser.close();

  const report = {
    url: targetUrl,
    scannedAt: new Date().toISOString(),
    elementsFound: {
      buttons: buttons.filter((b) => b.trim() !== ''),
      links: links.filter((l) => l.trim() !== '').slice(0, 20),
      formsCount: forms,
      inputsCount: inputs,
    },
    consoleErrors,
    networkErrors,
  };

  console.log('========== SCAN REPORT ==========\n');
  console.log(`URL: ${report.url}`);
  console.log(`Buttons found: ${report.elementsFound.buttons.length}`);
  console.log(`Links found: ${report.elementsFound.links.length}`);
  console.log(`Forms found: ${report.elementsFound.formsCount}`);
  console.log(`Inputs found: ${report.elementsFound.inputsCount}`);
  console.log(`Console errors: ${consoleErrors.length}`);
  console.log(`Network errors: ${networkErrors.length}\n`);

  if (consoleErrors.length > 0) {
    console.log('--- Console Errors ---');
    consoleErrors.forEach((e, i) => console.log(`${i + 1}. ${e.text}`));
    console.log('');
  }

  if (networkErrors.length > 0) {
    console.log('--- Network Errors ---');
    networkErrors.forEach((e, i) => console.log(`${i + 1}. [${e.status}] ${e.url}`));
    console.log('');
  }

  const fs = require('fs');
  fs.writeFileSync('scan-report.json', JSON.stringify(report, null, 2));
  console.log('📄 Full report saved to scan-report.json');
  console.log('📸 Screenshot saved to scan-screenshot.png');
}

main();