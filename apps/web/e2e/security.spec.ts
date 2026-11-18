import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const password = 'correct-horse-battery';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(s: string) {
  let bits = 0;
  let v = 0;
  const out: number[] = [];
  for (const c of s) {
    v = (v << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
/** RFC 6238 code for `stepOffset` steps from now (the API accepts ±1 and rejects replays). */
function totp(secret: string, stepOffset = 0) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset));
  const h = createHmac('sha1', base32(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  const n = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

async function register(page: Page) {
  const email = `sec${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/en/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Country of residence').selectOption('NL');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
  return email;
}

test.describe('security (real API)', () => {
  test('shows the verify-email banner after signup', async ({ page }) => {
    const email = await register(page);
    await expect(
      page.getByText(`Confirm your email address — we sent a link to ${email}.`),
    ).toBeVisible();
  });

  test('2FA: set up with the QR secret, then log in with a code; recovery codes are shown once', async ({
    page,
  }) => {
    const email = await register(page);
    await page.goto('/en/app/security');
    await expect(page.getByTestId('2fa-status')).toHaveText('Off');
    await page.getByRole('button', { name: 'Turn on' }).click();
    const secret = (await page.getByTestId('totp-secret').innerText()).trim();
    await expect(
      page.getByRole('img', { name: 'QR code for your authenticator app' }),
    ).toBeVisible();
    await page.getByLabel('2. Enter the 6-digit code shown in the app.').fill(totp(secret));
    await page.getByRole('button', { name: 'Turn on 2FA' }).click();
    await expect(page.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10);
    await page.getByRole('button', { name: "I've saved them" }).click();
    await expect(page.getByTestId('2fa-status')).toHaveText('On');

    // Log out and back in: password, then a code (next step: the enable step is used up).
    await page.goto('/en/app/more');
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await page.getByLabel('Authentication code').fill('000000');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'That code is not valid. Use the latest code from your app.',
    );
    await page.getByLabel('Authentication code').fill(totp(secret, 1));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
  });

  test('forgot password never reveals whether the email exists', async ({ page }) => {
    await page.goto('/en/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    // Both pages have an Email field: wait until the reset page is shown.
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.getByLabel('Email').fill('nobody-at-all@example.com');
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/auth/password/forgot')),
      page.getByRole('button', { name: 'Send link' }).click(),
    ]);
    expect(res.status()).toBe(204);
    await expect(
      page.getByText("If an account exists for this email, you'll receive a link"),
    ).toBeVisible();
  });

  test('an invalid verification link shows an error', async ({ page }) => {
    await page.goto('/en/verify-email?token=this-token-does-not-exist-at-all');
    await expect(
      page.getByText('This link is invalid or has expired.', { exact: false }),
    ).toBeVisible();
  });

  test('example funded account shows live rule meters', async ({ page }) => {
    await register(page);
    await page.getByRole('button', { name: 'Switch account' }).click();
    await page.getByRole('button', { name: 'Create example funded account (dev)' }).click();
    const card = page.getByTestId('rules-card');
    await expect(card.getByRole('meter', { name: 'Daily loss limit' })).toBeVisible();
    await expect(card.getByRole('meter', { name: 'Max drawdown (trailing)' })).toBeVisible();
    await expect(card).toContainText('Breach level: $24,250.00');
    await expect(card).toContainText('Example rules');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`security page and auth pages have no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => localStorage.setItem('brand-theme', t), theme);
      await register(page);
      for (const path of ['/en/app/security', '/en/forgot-password']) {
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
  }
});
