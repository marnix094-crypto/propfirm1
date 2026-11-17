import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('design system preview', () => {
  test('redirects / to the default language', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/design$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('theme toggle switches and persists', async ({ page }) => {
    await page.goto('/en/design');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('theme-toggle').click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('renders Dutch and Spanish', async ({ page }) => {
    await page.goto('/nl/design');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Componenten & tokens' }),
    ).toBeVisible();
    await page.goto('/es/design');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Componentes y tokens' }),
    ).toBeVisible();
  });

  test('unknown language falls back to English', async ({ page }) => {
    await page.goto('/de/design');
    await expect(page).toHaveURL(/\/en\/design$/);
  });

  test('has no horizontal page scroll', async ({ page }) => {
    for (const lang of ['en', 'nl', 'es']) {
      await page.goto(`/${lang}/design`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on /${lang}`).toBeLessThanOrEqual(0);
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`has no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => localStorage.setItem('brand-theme', t), theme);
      await page.goto('/en/design');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        // The primary-button contrast is a pending product decision (see Contrast lab + tokens.test.ts).
        .exclude('.btn-primary')
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }
});
