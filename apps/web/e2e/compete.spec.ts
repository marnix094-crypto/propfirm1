import { expect, test, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const API = 'http://localhost:3000/api/v1/compete';

/** Each test gets its own operator (tenant) so rounds of parallel tests never collide. */
async function operator(request: APIRequestContext) {
  const slug = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const res = await request.post(`${API}/dev/operators`, { data: { slug, name: 'E2E Arena' } });
  expect(res.ok()).toBe(true);
  return slug;
}

async function axe(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test.describe('Compete (separate product)', () => {
  test('home shows the next round, rules and prizes; reachable from the website', async ({
    page,
  }) => {
    await page.goto('/en');
    await expect(page.locator('header a[href="/en/compete"]').first()).toBeAttached();
    await page.goto('/en/compete');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Trade for one hour.');
    await expect(page.getByText('Test payments only')).toBeVisible();
    await expect(page.getByText(/^(Starts in|Ends in)$/).first()).toBeVisible();
    await expect(page.getByText('$100,000').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Join for \$10/ })).toBeVisible();
    await expect(page.getByText(/if your equity reaches \$90,000/)).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`home and sign-up have no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => localStorage.setItem('brand-theme', t), theme);
      for (const path of ['/en/compete', '/en/compete/register', '/en/compete/login']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await axe(page, path);
      }
    });
  }

  test('anonymous visitors are sent to the compete login', async ({ page }) => {
    await page.goto('/en/compete/app');
    await expect(page).toHaveURL(/\/en\/compete\/login/);
  });

  test('register, join with a test payment, trade live and see yourself on the leaderboard', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const slug = await operator(request);
    const headers = { 'X-Compete-Operator': slug };
    const round = await (
      await request.post(`${API}/dev/rounds`, {
        headers,
        data: { startsInSec: 25, durationSec: 600, minParticipants: 3 },
      })
    ).json();

    await page.goto(`/en/compete/register?operator=${slug}`);
    const nick = `p_${Date.now().toString(36)}`;
    await page.getByLabel('E-mail').fill(`${nick}@example.com`);
    await page.getByLabel('Nickname').fill(nick);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByLabel('I am 18 years or older.').check();
    await page.getByLabel('I accept the competition rules and terms.').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/en\/compete\/app/);

    await page
      .getByRole('button', { name: /Join today's round|Join for \$10/ })
      .last()
      .click();
    await expect(page).toHaveURL(/\/en\/compete\/pay\//);
    await expect(page.getByText('no real money is charged')).toBeVisible();
    await page.getByRole('button', { name: 'Pay (test)' }).click();
    await expect(page).toHaveURL(/\/en\/compete\/app/);
    await expect(page.getByTestId('compete-entered')).toBeVisible();
    await axe(page, 'dashboard (entered)');

    // Two more (example) players so the round reaches its minimum of 3.
    const bots = await request.post(`${API}/dev/bots`, { data: { roundId: round.id, count: 2 } });
    expect(bots.ok()).toBe(true);
    const wait = Date.parse(round.startsAt) - Date.now() + 200;
    if (wait > 0) await page.waitForTimeout(wait);
    await request.post(`${API}/dev/tick`, { data: {} });

    await expect(page.getByRole('button', { name: 'Buy' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('compete-pot')).toHaveText('$30.00');
    await page.getByLabel('Quantity').fill('0.010');
    await page.getByRole('button', { name: 'Buy' }).click();
    await expect(page.getByText(/Buy 0\.010 BTCUSDT filled/)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'BTCUSDT' })).toBeVisible();
    await expect(page.getByText('you', { exact: true })).toBeVisible({ timeout: 10_000 });
    await axe(page, 'dashboard (live)');
  });
});
