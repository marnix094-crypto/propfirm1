import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const password = 'correct-horse-battery';

async function register(page: Page) {
  const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/en/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Country of residence').selectOption('NL');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
  await expect(page.getByTestId('account-value')).toHaveText('$100,000.00');
  return email;
}

test.describe('trading platform (real API)', () => {
  test('register → trade → close → logout → login', async ({ page, isMobile }) => {
    const email = await register(page);

    await page.goto('/en/app/trade/BTCUSDT');
    await expect(page.getByTestId('last-price')).not.toHaveText('—');
    if (isMobile) await page.getByRole('button', { name: 'Place order' }).click();
    const form = page.getByRole('form', { name: 'New order' }).last();
    await form.getByLabel('Size').fill('0.010');
    await form.getByRole('button', { name: 'Buy BTC' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Order filled' })).toBeVisible();

    await expect(page.getByRole('tab', { name: 'Positions (1)' })).toBeVisible();
    const position = page.getByTestId('position-BTCUSDT');
    await expect(position).toContainText('Long');
    await position.getByRole('button', { name: 'Close BTCUSDT' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close position' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Position closed' })).toBeVisible();
    await expect(page.getByTestId('position-BTCUSDT')).toHaveCount(0);

    // History shows both fills.
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText('Filled')).toHaveCount(2);

    // Logout and protected route redirect.
    await page.goto('/en/app/more');
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
    await page.goto('/en/app/portfolio');
    await expect(page).toHaveURL(/\/en\/login\?next=/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
  });

  test('limit order rests in open orders and can be cancelled', async ({ page, isMobile }) => {
    await register(page);
    await page.goto('/en/app/trade/ETHUSDT');
    await expect(page.getByTestId('last-price')).not.toHaveText('—');
    if (isMobile) await page.getByRole('button', { name: 'Place order' }).click();
    const form = page.getByRole('form', { name: 'New order' }).last();
    await form.getByRole('radio', { name: 'Limit' }).click();
    await form.getByLabel('Limit price').fill('1000.00');
    await form.getByLabel('Size').fill('0.100');
    await form.getByRole('button', { name: 'Buy ETH' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Order placed' })).toBeVisible();
    await page.getByRole('tab', { name: /Open orders/ }).click();
    await page.getByRole('button', { name: 'Cancel order ETHUSDT' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Order cancelled' })).toBeVisible();
    await expect(page.getByText('No open orders')).toBeVisible();
  });

  test('shows a translated error for an invalid order', async ({ page, isMobile }) => {
    await register(page);
    await page.goto('/en/app/trade/BTCUSDT');
    if (isMobile) await page.getByRole('button', { name: 'Place order' }).click();
    const form = page.getByRole('form', { name: 'New order' }).last();
    await form.getByLabel('Size').fill('500');
    await form.getByRole('button', { name: 'Buy BTC' }).click();
    await expect(form.getByRole('alert')).toHaveText('Not enough free margin for this order.');
  });

  test('wrong password shows a generic error', async ({ page }) => {
    await page.goto('/en/login');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill('wrong-password-123');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`portfolio and trade have no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => {
        localStorage.setItem('brand-theme', t);
        localStorage.setItem('df-platform-theme', t);
      }, theme);
      await register(page);
      for (const path of ['/en/app/portfolio', '/en/app/trade/BTCUSDT', '/en/app/more']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .exclude('.tv-lightweight-charts') // canvas chart; described via aria-label on its container
          .analyze();
        expect(
          results.violations.map(
            (v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
        ).toEqual([]);
      }
    });
  }
});
