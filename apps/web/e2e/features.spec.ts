import { expect, test, type Page } from '@playwright/test';

const password = 'correct-horse-battery';

async function register(page: Page) {
  const email = `ft${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/en/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Country of residence').selectOption('NL');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('account-value')).toHaveText('$100,000.00');
}

test.describe('platform features (real API)', () => {
  test('daily points, competition, leaderboard profile and transparency', async ({ page }) => {
    await register(page);
    await page.getByRole('button', { name: 'Verify now (dev)' }).click();
    await expect(page.getByRole('button', { name: 'Verify now (dev)' })).toBeHidden();

    await page.goto('/en/app/points');
    await expect(page.getByTestId('points-balance')).toHaveText('50');
    await expect(page.getByTestId('reward-discount-5').getByRole('button')).toBeDisabled();

    await page.goto('/en/app/competitions');
    const comp = page.getByTestId('competition').first();
    await comp.getByRole('button', { name: 'Join for free' }).click();
    await expect(comp.getByRole('button', { name: 'Trade competition account' })).toBeVisible();
    await expect(page.getByTestId('competition-standings')).toContainText('(you)');

    await page.goto('/en/app/leaderboard');
    const nick = `e2e_${Date.now() % 1_000_000}`;
    await page.getByLabel('Nickname', { exact: true }).fill(nick);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Profile saved' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Show me on the leaderboard/ })).toBeEnabled();

    await page.goto('/en/app/transparency');
    await expect(page.getByTestId('transparency')).toContainText('Registered traders');
    await expect(page.getByText('No payouts yet.')).toBeVisible();
  });

  test('trade copier link and backtesting replay', async ({ page }) => {
    await register(page);
    await page.getByRole('button', { name: 'Switch account' }).click();
    await page.getByRole('button', { name: /example funded account/i }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Example funded account created' }),
    ).toBeVisible();

    await page.goto('/en/app/copier');
    await page.getByLabel('Copy from (master)').selectOption({ label: 'Demo' });
    await page.getByLabel('Copy to (follower)').selectOption({ label: 'Instant $25K (example)' });
    await page.getByLabel('Size').selectOption({ label: '0.5×' });
    await page.getByRole('button', { name: 'Start copying' }).click();
    await expect(page.getByTestId('copier-links')).toContainText('Instant $25K (example)');

    await page.goto('/en/app/backtesting');
    await page.getByRole('button', { name: 'Buy / Long' }).click();
    await expect(page.getByText(/^Long 0\.010$/)).toBeVisible();
    await page.getByRole('button', { name: 'Next candle' }).click();
    await page.getByRole('button', { name: 'Close position' }).click();
    await expect(page.getByText('Buy or sell to start, then play the candles.')).toBeHidden();
  });
});
