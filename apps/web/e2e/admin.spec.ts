import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function registerOwner(page: Page) {
  const email = `adm${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/en/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByLabel('Country of residence').selectOption('NL');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
  return email;
}

/** Dev helper (DEV_TOOLS_ENABLED): make the signed-in user OWNER of the default firm. */
async function becomeOwner(page: Page) {
  await page.goto('/en/app/more');
  await page.getByRole('button', { name: 'Make me owner of this firm (dev)' }).click();
  await expect(page).toHaveURL(/\/en\/admin$/);
}

test.describe('admin panel (real API)', () => {
  test('traders cannot open it', async ({ page }) => {
    await registerOwner(page);
    await page.goto('/en/admin');
    await expect(page.getByRole('heading', { name: 'No access to the admin panel' })).toBeVisible();
  });

  test('owner: overview, traders, products and a brand colour on the platform', async ({
    page,
  }) => {
    const email = await registerOwner(page);
    await becomeOwner(page);
    await expect(page.getByTestId('admin-kpis')).toContainText('Traders');

    await page.goto('/en/admin/traders');
    await page.getByLabel('Search by email').fill(email);
    await expect(page.getByRole('link', { name: email })).toBeVisible();
    await page.getByRole('link', { name: email }).click();
    await expect(page.getByText('Joined')).toBeVisible();

    await page.goto('/en/admin/products');
    await expect(page.getByText('instant-25k', { exact: true })).toBeVisible();

    // Brand colour: applied to the platform, restored afterwards (shared default firm).
    await page.goto('/en/admin/branding');
    const hex = page.getByLabel('Hex code');
    const previous = await hex.inputValue();
    try {
      await hex.fill('#1D4ED8');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
      await page.goto('/en/app/portfolio');
      await expect
        .poll(() =>
          page.evaluate(() => document.documentElement.style.getPropertyValue('--primary')),
        )
        .toBe('#1d4ed8');
      // White text on the dark blue buttons (computed for contrast).
      expect(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue('--btn-primary-fg'),
        ),
      ).toBe('#ffffff');
    } finally {
      await page.goto('/en/admin/branding');
      await page.getByLabel('Hex code').fill(previous);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    }
  });

  test('admin pages have no axe violations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await registerOwner(page);
    await becomeOwner(page);
    for (const path of [
      '/en/admin',
      '/en/admin/traders',
      '/en/admin/accounts',
      '/en/admin/products',
      '/en/admin/rule-sets',
      '/en/admin/branding',
      '/en/admin/alerts',
      '/en/admin/audit',
      '/en/admin/team',
      '/en/admin/menu',
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
