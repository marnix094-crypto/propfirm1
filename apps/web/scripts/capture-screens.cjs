/**
 * Captures real product screenshots for the website (D96) from the preview build
 * (in-browser demo backend, example data). Run: pnpm --filter @brand/web screens
 *   1. builds dist-demo  2. serves it  3. drives the app  4. writes WebP to src/assets/site/
 */
const { chromium } = require('playwright');
const { execSync, spawn } = require('node:child_process');
const { mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src/assets/site');
const TMP = path.join(ROOT, '.screens-tmp');
const PORT = 4187;
const BASE = `http://localhost:${PORT}/index.html`;
const HIDE = '[data-capture-hide]{display:none!important}*{caret-color:transparent!important}';
const BRANDS = [
  { key: 'lime', name: 'Your Firm', color: '#AFE604' },
  { key: 'orange', name: 'Nova Capital', color: '#F97316' },
  { key: 'cyan', name: 'Atlas Funding', color: '#22D3EE' },
  { key: 'violet', name: 'Vertex Prop', color: '#A78BFA' },
];
const CLIENT = { email: 'client@example.com', password: 'correct-horse-battery' };
const ADMIN = { email: 'admin@dailyfunded.demo', password: 'demo-admin-2026' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name, opts = {}) {
  await page.addStyleTag({ content: HIDE });
  await sleep(opts.wait ?? 900);
  await page.screenshot({ path: path.join(TMP, `${name}.png`), ...opts.shot });
  console.log('captured', name);
}

async function clientLogin(page) {
  await page.goto(BASE);
  await page
    .getByRole('link', { name: /live demo/i })
    .first()
    .click();
  await page.getByLabel('Email').fill(CLIENT.email);
  await page.getByLabel('Password').fill(CLIENT.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByTestId('account-value').waitFor();
}

async function adminLogin(page) {
  await page.goto(BASE);
  await page.getByRole('link', { name: 'Partner login' }).first().click();
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByTestId('admin-kpis').waitFor();
}

async function logout(page, admin) {
  if (admin) await page.getByRole('button', { name: 'Log out' }).first().click();
  else {
    await page.goto(BASE);
  }
  await page.evaluate(() => {
    // Keep the demo data, drop only the session.
    const k = 'brand-demo-state-v1';
    const s = JSON.parse(localStorage.getItem(k) ?? '{}');
    s.sessionUserId = null;
    localStorage.setItem(k, JSON.stringify(s));
  });
}

async function openFunded(page) {
  await page.getByRole('button', { name: 'Switch account' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Instant \$25K/ })
    .click();
  await page.getByTestId('pnl-calendar').waitFor();
  await sleep(1500);
}

(async () => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  if (!process.argv.includes('--no-build'))
    execSync('pnpm build:demo', { cwd: ROOT, stdio: 'inherit' });
  const server = spawn(
    'npx',
    ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORT), '--strictPort'],
    {
      cwd: ROOT,
      stdio: 'ignore',
    },
  );
  await sleep(2500);
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();

    // Client with an example funded account.
    await page.goto(BASE);
    await page
      .getByRole('link', { name: /live demo/i })
      .first()
      .click();
    await page.getByRole('link', { name: 'Create one' }).click();
    await page.getByRole('heading', { name: 'Create your account' }).waitFor();
    await sleep(300);
    await page.getByLabel('Email').fill(CLIENT.email);
    await page.getByLabel('Password').fill(CLIENT.password);
    await page.locator('select[name=country]').selectOption('NL');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByTestId('account-value').waitFor();
    await page.getByRole('button', { name: 'Switch account' }).click();
    await page.getByRole('button', { name: /example funded account/i }).click();
    await sleep(800);
    await openFunded(page);
    await shot(page, 'dashboard');
    await page.locator('aside nav').getByRole('link', { name: 'Trade', exact: true }).click();
    await shot(page, 'terminal', { wait: 3000 });
    await page.locator('aside nav').getByRole('link', { name: 'My Stats', exact: true }).click();
    await shot(page, 'stats', { wait: 1500 });

    // Mobile, same data.
    const state = await page.evaluate(() => localStorage.getItem('brand-demo-state-v1'));
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    await mobile.addInitScript((s) => localStorage.setItem('brand-demo-state-v1', s), state);
    const m = await mobile.newPage();
    await m.goto(BASE);
    await m
      .getByRole('link', { name: /live demo/i })
      .first()
      .click();
    await m.getByTestId('account-value').waitFor();
    await openFunded(m);
    await m.evaluate(() => window.scrollTo(0, 0));
    await shot(m, 'mobile-dashboard', { wait: 1800 });
    await mobile.close();

    // Admin panel, then the client dashboard in each example brand colour.
    await logout(page, false);
    await adminLogin(page);
    await shot(page, 'admin-overview', { wait: 1200 });
    const nav = () => page.locator('aside nav');
    await nav().getByRole('link', { name: 'Client dashboard', exact: true }).click();
    await shot(page, 'admin-modules');
    for (const b of BRANDS) {
      await nav().getByRole('link', { name: 'Branding', exact: true }).click();
      await page.getByLabel('Platform name').fill(b.name);
      await page.getByLabel('Hex code').fill(b.color);
      await page.getByRole('button', { name: 'Save' }).click();
      await sleep(600);
      if (b.key === 'orange') await shot(page, 'admin-branding');
      await logout(page, true);
      await clientLogin(page);
      await openFunded(page);
      await shot(page, `brand-${b.key}`);
      await logout(page, false);
      await adminLogin(page);
    }
  } finally {
    await browser.close();
    server.kill();
  }
  // PNG → WebP (sized for the site; 2x for sharp retina rendering).
  execSync(
    `python3 - <<'PY'
from PIL import Image
import glob, os
for p in glob.glob(${JSON.stringify(TMP)} + '/*.png'):
    im = Image.open(p).convert('RGB')
    w = 780 if 'mobile' in p else 2400
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    out = os.path.join(${JSON.stringify(OUT)}, os.path.basename(p)[:-4] + '.webp')
    im.save(out, 'WEBP', quality=80, method=6)
    print(os.path.basename(out), os.path.getsize(out) // 1024, 'KB')
PY`,
    { stdio: 'inherit' },
  );
  rmSync(TMP, { recursive: true, force: true });
})();
