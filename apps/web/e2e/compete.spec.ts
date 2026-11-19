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
    await expect(page.locator('header a[href="/en/products/compete"]').first()).toBeAttached();
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

test.describe('Compete product page and operator admin (D104, D105)', () => {
  test('product page sells the software and links to the example and operator login', async ({
    page,
  }) => {
    await page.goto('/en/products/compete');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Daily trading competitions',
    );
    await expect(page.getByText('What one round can bring in.')).toBeVisible();
    await expect(page.getByText('Your share')).toBeVisible();
    await expect(page.getByText(/not a forecast or guarantee/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'See the example' })).toHaveAttribute(
      'href',
      '/en/compete',
    );
    await expect(page.getByRole('link', { name: 'Operator login' })).toHaveAttribute(
      'href',
      '/en/compete/admin/login',
    );
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`product page has no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => localStorage.setItem('brand-theme', t), theme);
      await page.goto('/en/products/compete');
      await page.waitForLoadState('networkidle');
      await axe(page, 'products/compete');
    });
  }

  test('operator owner runs the panel: overview, players, settings, payouts', async ({
    page,
    request,
  }) => {
    const slug = await operator(request);
    const email = `owner-${slug}@example.com`;
    const password = 'owner-password-123';
    expect(
      (
        await request.post(`${API}/dev/staff`, { data: { email, password, operatorSlug: slug } })
      ).ok(),
    ).toBe(true);
    // One player so the players page has a row.
    const reg = await request.post(`${API}/auth/register`, {
      headers: { 'X-Compete-Operator': slug },
      data: {
        email: `pl-${slug}@example.com`,
        password: 'correct-horse-battery',
        nickname: `pl_${slug.slice(-6).replace(/-/g, '_')}`,
        country: 'NL',
        locale: 'en',
        acceptTerms: true,
        confirmAdult: true,
      },
    });
    expect(reg.ok()).toBe(true);

    await page.goto('/en/compete/admin');
    await expect(page).toHaveURL(/\/en\/compete\/admin\/login/);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Your revenue')).toBeVisible();
    await axe(page, 'admin overview');

    const nav = page.getByRole('navigation', { name: 'Admin menu' });
    await nav.getByRole('link', { name: 'Players' }).click();
    await expect(page.getByRole('cell', { name: `pl-${slug}@example.com` })).toBeVisible();
    await axe(page, 'admin players');

    await nav.getByRole('link', { name: 'Payouts' }).click();
    await expect(page.getByText('Nothing here.')).toBeVisible();

    await nav.getByRole('link', { name: 'Settings' }).click();
    await page.getByLabel('Name').fill('E2E Royale');
    await page.getByLabel('Prize split (%)').fill('60 / 30 / 20');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('alert')).toContainText('not consistent');
    await page.getByLabel('Prize split (%)').fill('60 / 25 / 15');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await axe(page, 'admin settings');
    const pub = await (
      await request.get(`${API}/operator`, { headers: { 'X-Compete-Operator': slug } })
    ).json();
    expect(pub).toMatchObject({ name: 'E2E Royale', prizeSplitBps: [6000, 2500, 1500] });

    await nav.getByRole('link', { name: 'Audit log' }).click();
    await expect(page.getByText('The audit chain is intact.')).toBeVisible();
    await expect(page.getByText('compete.operator.settings_updated')).toBeVisible();
  });

  test('superadmin creates an operator and gets a one-time owner link', async ({
    page,
    request,
  }) => {
    const email = `sa-${Date.now().toString(36)}@example.com`;
    expect(
      (
        await request.post(`${API}/dev/staff`, { data: { email, password: 'super-password-123' } })
      ).ok(),
    ).toBe(true);
    await page.goto('/en/compete/admin/login');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Password').fill('super-password-123');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page
      .getByRole('navigation', { name: 'Admin menu' })
      .getByRole('link', { name: 'Operators' })
      .click();
    const slug = `new-${Date.now().toString(36)}`;
    await page.getByLabel('Name', { exact: true }).fill('New Arena');
    await page.getByLabel('Identifier').fill(slug);
    await page.getByLabel('Owner e-mail').fill(`owner-${slug}@example.com`);
    await page.getByRole('button', { name: 'Create operator' }).click();
    await expect(page.getByText('One-time link for the owner')).toBeVisible();
    await expect(page.getByText(/\/en\/compete\/admin\/setup\?token=/)).toBeVisible();
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
    await axe(page, 'admin operators');
  });

  test('operator connects Compete to its website: domain, widgets, SSO (D108/D109)', async ({
    page,
    request,
  }) => {
    const slug = await operator(request);
    const email = `int-${slug}@example.com`;
    const password = 'operator-password-123';
    expect(
      (
        await request.post(`${API}/dev/staff`, { data: { email, password, operatorSlug: slug } })
      ).ok(),
    ).toBe(true);
    await page.goto('/en/compete/admin/login');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page
      .getByRole('navigation', { name: 'Admin menu' })
      .getByRole('link', { name: 'Integration' })
      .click();
    await expect(page.getByRole('heading', { name: 'Integration', level: 1 })).toBeVisible();

    await page.getByLabel('Own domain').fill(`arena.${slug}.example.com`);
    await page.getByLabel('Websites allowed to show widgets').fill('https://www.example.com');
    await page.getByLabel('Widget', { exact: true }).selectOption('leaderboard');
    await page.getByRole('button', { name: 'Save integration' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(page.getByText('Waiting for DNS')).toBeVisible();
    await expect(page.getByText(`_dailyfunded-verify.arena.${slug}.example.com`)).toBeVisible();
    await expect(page.getByLabel('Embed code', { exact: true })).toContainText(
      'data-compete-widget="leaderboard"',
    );
    await expect(
      page
        .frameLocator('[data-testid="widget-preview"]')
        .getByText(/Registration open|Live/)
        .first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Generate secret' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Your SSO secret');
    await dialog.getByRole('button', { name: 'I have stored it' }).click();
    await page.getByLabel('Allow sign-in from my website').check();
    await page.getByRole('button', { name: 'Save integration' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await axe(page, 'admin integration');

    // A trader of the operator arrives from its website with a signed token.
    const { token } = await (
      await request.post(`${API}/dev/sso-token`, {
        data: { operatorSlug: slug, sub: `user-${slug}`, nickname: 'sso_e2e' },
      })
    ).json();
    const player = await page.context().newPage();
    await player.goto(`/en/compete/sso?operator=${slug}#token=${token}`);
    await expect(player).toHaveURL(/\/en\/compete\/app$/);
    await expect(player.getByText('Hi sso_e2e')).toBeVisible();
    // The token is single use.
    const again = await page.context().newPage();
    await again.goto(`/en/compete/sso?operator=${slug}#token=${token}`);
    await expect(again.getByRole('alert')).toContainText('already used');
  });

  test('widgets render standalone for embedding', async ({ page, request }) => {
    const slug = await operator(request);
    for (const kind of ['countdown', 'leaderboard', 'join']) {
      await page.goto(`/en/compete/widget/${kind}?operator=${slug}&theme=light`);
      await expect(page.getByTestId(`compete-widget-${kind}`)).toBeVisible();
      await expect(page.getByRole('link', { name: /Join for \$10/ })).toHaveAttribute(
        'target',
        '_top',
      );
      await axe(page, `widget ${kind}`);
    }
  });
});
