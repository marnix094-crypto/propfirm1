import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Daily Funded website (white label)', () => {
  test('/ redirects to the language home with the B2B hero', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /Launch your prop firm\.\s+We run the engine\./,
    );
    await expect(page.getByRole('contentinfo')).toContainText('provides software only');
  });

  test('brand builder switches between real example-brand screenshots', async ({ page }) => {
    await page.goto('/en#brand-builder');
    const section = page.locator('#brand-builder');
    await section.getByRole('button', { name: 'Atlas Funding' }).click();
    await expect(section.getByRole('button', { name: 'Atlas Funding' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      section.getByRole('img', { name: 'The trader dashboard branded as Atlas Funding' }),
    ).toBeVisible();
  });

  test('product tour shows real screenshots per tab', async ({ page }) => {
    await page.goto('/en#tour');
    const tour = page.locator('#tour');
    await tour.getByRole('tab', { name: 'Trading terminal' }).click();
    await expect(tour.getByRole('tab', { name: 'Trading terminal' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(tour.getByRole('img', { name: /Trading terminal with live chart/ })).toBeVisible();
  });

  test('demo request form sends a lead', async ({ page }) => {
    await page.goto('/en#contact');
    const form = page.locator('#contact form');
    await form.getByLabel('Your name').fill('Jane Founder');
    await form.getByLabel('Work email').fill('jane@firm.example');
    await form.getByLabel('Company').fill('Acme Funding');
    await form.getByLabel('Expected traders per month').selectOption('100-1000');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Request a demo' }).click();
    await expect(page.getByText("Thanks — we'll be in touch.")).toBeVisible();
  });

  test('live demo goes to the platform login; storefront still links back', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('link', { name: 'Try the live demo' }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
    await page.goto('/en/storefront');
    await page.getByRole('link', { name: 'Back to Daily Funded' }).click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test('is translated (NL, ES)', async ({ page }) => {
    await page.goto('/nl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Start jouw prop firm/);
    await page.goto('/es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Lanza tu prop firm/);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`has no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => localStorage.setItem('brand-theme', t), theme);
      await page.goto('/en');
      await page.waitForLoadState('networkidle');
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
