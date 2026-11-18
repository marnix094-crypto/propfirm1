import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const password = 'correct-horse-battery';

test.describe('instant funding checkout (real API, test payments)', () => {
  test('pricing → sign up → verify → test payment → funded account with progress', async ({
    page,
  }) => {
    await page.goto('/en/storefront');
    const card = page.getByTestId('pricing-card-instant-25k');
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: 'More accounts' }).click();
    await card.getByRole('link', { name: 'Get this account' }).click();

    // Not signed in → login, continue to sign-up; the checkout destination is kept.
    await expect(page).toHaveURL(/\/en\/login\?next=/);
    await page.getByRole('link', { name: 'Create one' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    const email = `buy${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Country of residence').selectOption('NL');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/en\/app\/checkout\?product=.+&qty=2$/);
    await expect(page.getByTestId('checkout-total')).toHaveText('€398.00');
    await expect(page.getByText('Confirm your email address before you check out.')).toBeVisible();
    await page.getByRole('button', { name: 'Verify now (dev)' }).click();
    await expect(page.getByText('Confirm your email address before you check out.')).toBeHidden();

    const pay = page.getByRole('button', { name: 'Continue to payment' });
    await expect(pay).toBeDisabled();
    await page.getByRole('checkbox').check();
    await pay.click();

    await expect(page).toHaveURL(/\/en\/app\/checkout\/[0-9a-f-]+\/pay$/);
    await expect(page.getByRole('heading', { name: 'Test payment' })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();

    await expect(page.getByTestId('purchase-status')).toHaveText('Your account is ready');
    await expect(page.getByText('Instant $25K #1')).toBeVisible();
    await expect(page.getByText('Instant $25K #2')).toBeVisible();
    await page.getByRole('button', { name: 'Open account' }).first().click();

    await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
    await expect(page.getByTestId('account-value')).toHaveText('$25,000.00');
    const funding = page.getByTestId('funding-card');
    await expect(funding).toContainText('Profit split & payouts');
    await expect(funding).toContainText('Your share (80%)');
    await expect(funding).toContainText('Not yet');
    await expect(funding).toContainText('Scaling plan');
    await expect(page.getByTestId('rules-card')).toBeVisible();
  });

  test('a failed test payment creates no account', async ({ page }) => {
    const email = `fail${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
    await page.goto('/en/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Country of residence').selectOption('NL');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
    await page.getByRole('button', { name: 'Verify now (dev)' }).click();
    await expect(page.getByRole('button', { name: 'Verify now (dev)' })).toBeHidden();

    await page.goto('/en/storefront');
    await page
      .getByTestId('pricing-card-instant-5k')
      .getByRole('link', { name: 'Get this account' })
      .click();
    await expect(page.getByTestId('checkout-total')).toHaveText('€59.00');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await page.getByRole('button', { name: 'Payment fails' }).click();
    await expect(page.getByTestId('purchase-status')).toHaveText('Payment failed');
    await expect(page.getByText('No money was charged and no account was created.')).toBeVisible();
  });
});
