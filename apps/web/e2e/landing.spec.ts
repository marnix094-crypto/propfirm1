import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('landing page', () => {
  test('/ redirects to the default language landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Trade a funded account from day one',
    );
  });

  test('has all sections in order', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const ids = await page
      .locator('main > section')
      .evaluateAll((els) => els.map((e) => e.id || e.getAttribute('aria-labelledby')));
    expect(ids).toEqual([
      'hero-title',
      'how-it-works',
      'features',
      'pricing',
      'final-cta-title',
      'faq',
    ]);
    await expect(
      page.getByRole('contentinfo').getByRole('heading', { name: 'Risk disclosure' }),
    ).toBeVisible();
  });

  test('shows the payout card as a labelled example (no real payouts yet)', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByTestId('payout-example-badge')).toBeVisible();
  });

  test('pricing: products, recommended badge, quantity and buy link', async ({ page }) => {
    await page.goto('/en#pricing');
    const cards = page.locator('[data-testid^="pricing-card-"]');
    await expect(cards).toHaveCount(5);
    await expect(page.getByText('Recommended', { exact: true })).toHaveCount(1);
    const card = page.getByTestId('pricing-card-instant-25k');
    await card.getByRole('button', { name: 'More accounts' }).click();
    await card.getByRole('link', { name: 'Get this account' }).click();
    await expect(page).toHaveURL(/\/en\/register\?product=instant-25k&qty=2$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeVisible();
  });

  test('custom account configurator returns a server-calculated price', async ({ page }) => {
    await page.goto('/en#pricing');
    await page.getByRole('button', { name: /Build a custom account/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('custom-price')).toHaveText('€209.00');
    await dialog.getByRole('radio', { name: '8%' }).click();
    await expect(dialog.getByTestId('custom-price')).not.toHaveText('€209.00');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('leverage modal opens and closes with the keyboard', async ({ page }) => {
    await page.goto('/en#features');
    await page.getByRole('button', { name: 'What does leverage mean?' }).click();
    await expect(page.getByRole('dialog', { name: 'How leverage works' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('FAQ accordion expands', async ({ page }) => {
    await page.goto('/en#faq');
    const q = page.getByRole('button', { name: 'Am I trading real money?' });
    await q.click();
    await expect(q).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByText('No. All funded accounts are simulated', { exact: false }),
    ).toBeVisible();
  });

  test('Dutch and Spanish render with translated headings', async ({ page }) => {
    await page.goto('/nl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Handel vanaf dag één met een funded account',
    );
    await expect(page).toHaveTitle(/gesimuleerd/);
    await page.goto('/es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Opera con una cuenta financiada desde el primer día',
    );
  });

  test('no horizontal scroll', async ({ page }) => {
    for (const lang of ['en', 'nl', 'es']) {
      await page.goto(`/${lang}`);
      await expect(page.locator('[data-testid^="pricing-card-"]')).toHaveCount(5);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `/${lang}`).toBeLessThanOrEqual(0);
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => localStorage.setItem('brand-theme', t), theme);
      await page.goto('/en');
      await expect(page.locator('[data-testid^="pricing-card-"]')).toHaveCount(5);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }
});
