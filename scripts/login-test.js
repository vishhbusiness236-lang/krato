// scripts/login-test.js
// Usage: node scripts/login-test.js https://your-app-url.com/login

const { chromium } = require('playwright');

async function main() {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.error('❌ Please provide a URL. Example:');
    console.error('   node scripts/login-test.js https://findteamo.vercel.app/login');
    process.exit(1);
  }

  console.log(`🔐 Testing login/signup flow on: ${targetUrl}\n`);

  const browser = await chromium.launch({ headless: false }); // visible browser for debugging
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('response', (res) => {
    if (res.status() >= 400) {
      networkErrors.push({ url: res.url(), status: res.status() });
    }
  });

  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('🔎 Looking for email/password fields...\n');

  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[id*="email" i]',
    'input[placeholder*="email" i]',
  ];
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[id*="password" i]',
  ];

  let emailField = null;
  let passwordField = null;

  for (const sel of emailSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      emailField = el;
      break;
    }
  }

  for (const sel of passwordSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      passwordField = el;
      break;
    }
  }

  if (!emailField || !passwordField) {
    console.log('⚠️  No email/password form found. Checking where the page ended up...\n');

    const currentUrl = page.url();

    // Case 1: Already auto-redirected to an OAuth provider
    if (
      currentUrl.includes('accounts.google.com') ||
      currentUrl.includes('appleid.apple.com') ||
      currentUrl.includes('github.com/login')
    ) {
      console.log('========== LOGIN TEST REPORT ==========\n');
      console.log(`✅ Auto-redirected to OAuth provider: ${currentUrl}`);
      console.log('ℹ️  This means the login flow is working correctly — it redirects straight to the provider.');
      await page.screenshot({ path: 'login-scan-screenshot.png', fullPage: true });
      await browser.close();
      return;
    }

    // Case 2: Still on the app's own page — check for OAuth buttons to click
    const oauthProviders = ['Google', 'GitHub', 'Facebook', 'Apple', 'Twitter', 'Discord'];
    const foundProviders = [];

    for (const provider of oauthProviders) {
      const el = page.locator(`button:has-text("${provider}"), a:has-text("${provider}")`).first();
      if (await el.count() > 0) {
        foundProviders.push(provider);
      }
    }

    await page.screenshot({ path: 'login-scan-screenshot.png', fullPage: true });
    await browser.close();

    console.log('========== LOGIN TEST REPORT ==========\n');
    if (foundProviders.length > 0) {
      console.log(`✅ OAuth login button(s) detected: ${foundProviders.join(', ')}`);
      console.log('ℹ️  Automated clicking/testing of OAuth flows is not supported yet (Google/GitHub block bots).');
      console.log('   Noted for manual testing.');
    } else {
      console.log('❌ No email/password form AND no OAuth buttons found.');
      console.log('   This could mean: page not fully loaded, unusual login UI, or a real bug.');
    }
    console.log('\n📸 Screenshot saved: login-scan-screenshot.png');
    return;
  }

  console.log('✅ Found email and password fields. Filling test data...\n');

  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  await emailField.fill(testEmail);
  await passwordField.fill(testPassword);

  await page.screenshot({ path: 'login-before-submit.png', fullPage: true });

  const submitSelectors = [
    'button[type="submit"]',
    'button:has-text("Log in")',
    'button:has-text("Sign in")',
    'button:has-text("Sign up")',
    'button:has-text("Continue")',
  ];

  let submitted = false;
  for (const sel of submitSelectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      console.log(`🖱️  Clicking submit button (matched: ${sel})`);
      await el.click();
      submitted = true;
      break;
    }
  }

  if (!submitted) {
    console.log('⚠️  No submit button found. Trying Enter key...');
    await passwordField.press('Enter');
  }

  await page.waitForTimeout(3000);

  const finalUrl = page.url();
  await page.screenshot({ path: 'login-after-submit.png', fullPage: true });

  await browser.close();

  console.log('\n========== LOGIN TEST REPORT ==========\n');
  console.log(`Started at: ${targetUrl}`);
  console.log(`Ended at:   ${finalUrl}`);
  console.log(`URL changed: ${finalUrl !== targetUrl ? 'Yes (likely success or redirect)' : 'No (likely stayed on page — possible error)'}`);
  console.log(`Console errors: ${consoleErrors.length}`);
  console.log(`Network errors: ${networkErrors.length}\n`);

  if (consoleErrors.length > 0) {
    console.log('--- Console Errors ---');
    consoleErrors.forEach((e, i) => console.log(`${i + 1}. ${e}`));
  }
  if (networkErrors.length > 0) {
    console.log('--- Network Errors ---');
    networkErrors.forEach((e, i) => console.log(`${i + 1}. [${e.status}] ${e.url}`));
  }

  console.log('\n📸 Screenshots saved: login-before-submit.png, login-after-submit.png');
}

main();