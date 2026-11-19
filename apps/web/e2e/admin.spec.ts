import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const API = 'http://localhost:3000/api/v1';
const PASSWORD = 'correct-horse-battery';
const unique = (p: string) => `${p}${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;

/** Dev-only: a new firm with an admin account (DEV_TOOLS_ENABLED; 2FA off in e2e). */
async function newFirmAdmin(request: APIRequestContext) {
  const email = unique('admin');
  const res = await request.post(`${API}/dev/staff`, { data: { email, password: PASSWORD } });
  expect(res.status()).toBe(201);
  const { slug } = (await res.json()) as { slug: string };
  return { email, slug };
}

async function adminLogin(page: Page, email: string) {
  await page.goto('/en');
  await page.getByRole('link', { name: 'Partner login' }).first().click();
  await expect(page).toHaveURL(/\/en\/admin\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
}

/** A client of a firm, in its own browser context (separate session). */
async function clientOf(browser: Browser, slug: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/en/register?firm=${slug}`);
  await page.getByLabel('Email').fill(unique('client'));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Country of residence').selectOption('NL');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
  return page;
}

test.describe('admin panel (real API)', () => {
  test('clients have no way into the admin panel', async ({ browser, request }) => {
    const { slug } = await newFirmAdmin(request);
    const page = await clientOf(browser, slug);
    await expect(page.getByRole('link', { name: /admin/i })).toHaveCount(0);
    await page.goto('/en/admin');
    await expect(page.getByRole('heading', { name: 'No access to the admin panel' })).toBeVisible();
  });

  test('firm admin composes the client dashboard and brand for their own clients', async ({
    page,
    browser,
    request,
    isMobile,
  }) => {
    const { email, slug } = await newFirmAdmin(request);
    await adminLogin(page, email);
    await expect(page.getByTestId('admin-kpis')).toContainText('Traders');
    // Staff never land in the client app.
    await page.goto('/en/app/portfolio');
    await expect(page).toHaveURL(/\/en\/admin$/);

    await page.goto('/en/admin/dashboard');
    await page.getByRole('switch', { name: 'Daily Points' }).click();
    await page.getByRole('switch', { name: 'Leaderboard' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

    await page.goto('/en/admin/branding');
    await page.getByLabel('Hex code').fill('#1D4ED8');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

    const client = await clientOf(browser, slug);
    await expect
      .poll(() =>
        client.evaluate(() => document.documentElement.style.getPropertyValue('--primary')),
      )
      .toBe('#1d4ed8');
    if (isMobile) await client.goto('/en/app/more');
    await expect(client.getByRole('link', { name: 'Trade', exact: true }).first()).toBeVisible();
    await expect(client.getByRole('link', { name: 'Daily Points' })).toHaveCount(0);
    await expect(client.getByRole('link', { name: 'Leaderboard' })).toHaveCount(0);
    // Not reachable by URL either.
    await client.goto('/en/app/points');
    await expect(client).toHaveURL(/\/en\/app\/portfolio$/);

    // The client's sign-up shows up for the admin.
    await page.goto('/en/admin/traders');
    await expect(page.getByRole('table')).toContainText('@example.com');
  });

  test('admin pages have no axe violations', async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { email } = await newFirmAdmin(request);
    await adminLogin(page, email);
    for (const path of [
      '/en/admin',
      '/en/admin/traders',
      '/en/admin/accounts',
      '/en/admin/products',
      '/en/admin/rule-sets',
      '/en/admin/dashboard',
      '/en/admin/branding',
      '/en/admin/alerts',
      '/en/admin/audit',
      '/en/admin/security',
      '/en/admin/menu',
      '/en/admin/login',
    ]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    }
  });
});

test.describe('automatic firm set-up (D93–D95)', () => {
  test('Daily Funded creates a firm with its own instance and own domain; steps and DNS are shown', async ({
    page,
    request,
  }) => {
    const email = unique('super');
    const res = await request.post(`${API}/dev/staff`, {
      data: { email, password: PASSWORD, superadmin: true },
    });
    expect(res.status()).toBe(201);
    await adminLogin(page, email);
    await page.goto('/en/admin/firms');
    const slug = `e2e-${Date.now().toString(36)}`;
    await page.getByLabel('Name', { exact: true }).fill('E2E Capital');
    await page.getByLabel('Code').fill(slug);
    await page.getByLabel('Admin email').fill(unique('owner'));
    await page.getByLabel('Own domain (optional)').fill(`trade.${slug}.example.com`);
    await page.getByRole('checkbox', { name: /Own database/ }).check();
    await page.getByRole('button', { name: 'Create firm' }).click();

    const dialog = page.getByRole('dialog', { name: 'Set-up of E2E Capital' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('own database created, migrated and filled')).toBeVisible();
    await expect(dialog.getByText('TXT record not found yet')).toBeVisible();
    await expect(dialog.getByText(`${slug}.dailyfunded.test`)).toBeVisible();
    await expect(dialog.getByRole('cell', { name: /_dailyfunded-verify\.trade\./ })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByText(`trade.${slug}.example.com`)).toBeVisible();
  });

  test('a firm admin sees DNS instructions for a new own domain', async ({ page, request }) => {
    const { email, slug } = await newFirmAdmin(request);
    await adminLogin(page, email);
    await page.goto('/en/admin/branding');
    await page.getByLabel('Custom domain').fill(`go.${slug}.example.com`);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Waiting for DNS')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'CNAME' })).toBeVisible();
    await expect(page.getByText('tenants.dailyfunded.test')).toBeVisible();
    await expect(page.getByText(`${slug}.dailyfunded.test`)).toBeVisible();
  });
});
