import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { renderWithProviders } from '@/test/render';
import { LoginPage } from '../login-page';
import { AccountClosedBanner, isTradable } from '@/features/rules/rules-card';
import { useSession } from '@/stores/session';
import type { Account } from '@/lib/api-client';

const base = { status: 'FUNDED_ACTIVE', failReason: null } as unknown as Account;

describe('rules UI helpers', () => {
  it('only active/funded accounts can trade', () => {
    expect(isTradable({ status: 'ACTIVE' })).toBe(true);
    expect(isTradable({ status: 'FUNDED_ACTIVE' })).toBe(true);
    expect(isTradable({ status: 'FAILED' })).toBe(false);
  });

  it('explains why an account was closed', () => {
    const { rerender } = renderWithProviders(<AccountClosedBanner account={base} />);
    expect(screen.queryByTestId('account-closed')).not.toBeInTheDocument();
    rerender(
      <AccountClosedBanner account={{ ...base, status: 'FAILED', failReason: 'MAX_DRAWDOWN' }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The maximum drawdown was breached.');
  });
});

describe('login with two-step verification', () => {
  it('asks for a code after the password and signs in with it', async () => {
    useSession.setState({ status: 'anonymous' });
    const user = {
      id: 'u1',
      email: 'a@b.c',
      roles: ['TRADER'],
      locale: 'en',
      country: 'NL',
      emailVerified: true,
      twoFactorEnabled: true,
    };
    let verifyBody: unknown;
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ code: 'REFRESH_MISSING' }, { status: 401 }),
      ),
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ mfaRequired: true, mfaToken: 'mfa-token' }),
      ),
      http.post('*/api/v1/auth/2fa/verify', async ({ request }) => {
        verifyBody = await request.json();
        return HttpResponse.json({ accessToken: 'at', expiresIn: 900, user });
      }),
    );
    renderWithProviders(<LoginPage />, { path: '/en/login' });
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await userEvent.type(await screen.findByLabelText('Authentication code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(useSession.getState().status).toBe('authenticated'));
    expect(verifyBody).toEqual({ mfaToken: 'mfa-token', code: '123456' });
  });
});
