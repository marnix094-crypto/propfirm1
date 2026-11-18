import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router';
import { server } from '@/mocks/node';
import { exampleProducts, exampleRules } from '@/mocks/data';
import { renderWithProviders } from '@/test/render';
import { useSession } from '@/stores/session';
import type { Account } from '@/lib/api-client';
import type { FundingProgress, Purchase } from '@/hooks/use-checkout';
import { CheckoutPage } from '../checkout-page';
import { FundingCard } from '@/features/funding/funding-card';

const product = exampleProducts.find((p) => p.isRecommended)!;
const user = (emailVerified: boolean) => ({
  id: 'u1',
  email: 'a@b.c',
  roles: ['TRADER'],
  locale: 'en',
  country: 'NL',
  emailVerified,
  twoFactorEnabled: false,
});

const purchase: Purchase = {
  id: 'p1',
  status: 'PENDING',
  type: 'INSTANT',
  quantity: 2,
  accountSizeMinor: product.accountSizeMinor,
  unitPriceMinor: product.priceMinor,
  totalMinor: '39800',
  currency: 'EUR',
  provider: 'fake',
  isTestPayment: true,
  paymentUrl: 'http://localhost/en/app/checkout/p1/pay',
  failureCode: null,
  accountIds: [],
  rules: exampleRules(600),
  createdAt: new Date().toISOString(),
};

function renderCheckout() {
  return renderWithProviders(
    <Routes>
      <Route path="app/checkout" element={<CheckoutPage />} />
      <Route path="app/checkout/:purchaseId/pay" element={<p>payment page</p>} />
    </Routes>,
    { path: `/en/app/checkout?product=${product.id}&qty=2` },
  );
}

beforeEach(() => {
  server.use(
    http.get('*/api/v1/products/:id', ({ params }) =>
      params.id === product.id
        ? HttpResponse.json(product)
        : HttpResponse.json({ code: 'PRODUCT_NOT_FOUND' }, { status: 404 }),
    ),
  );
});

describe('checkout', () => {
  it('shows the summary and total, requires consent, then opens the test payment', async () => {
    useSession.setState({ status: 'authenticated', user: user(true), accessToken: 'at' } as never);
    let sent: { key: string | null; body: unknown } | null = null;
    server.use(
      http.post('*/api/v1/checkout', async ({ request }) => {
        sent = { key: request.headers.get('Idempotency-Key'), body: await request.json() };
        return HttpResponse.json(purchase, { status: 201 });
      }),
    );
    renderCheckout();
    expect(await screen.findByTestId('checkout-total')).toHaveTextContent('€398.00');
    expect(screen.getByText('$25,000')).toBeInTheDocument();
    expect(screen.getByText(/no real capital is allocated/)).toBeInTheDocument();

    const pay = screen.getByRole('button', { name: 'Continue to payment' });
    expect(pay).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(pay);

    expect(await screen.findByText('payment page')).toBeInTheDocument();
    expect(sent!.key).toMatch(/^checkout-/);
    expect(sent!.body).toEqual({
      productId: product.id,
      quantity: 2,
      acceptTerms: true,
      locale: 'en',
    });
  });

  it('asks to verify the email address before paying', async () => {
    useSession.setState({ status: 'authenticated', user: user(false), accessToken: 'at' } as never);
    renderCheckout();
    expect(await screen.findByText(/Confirm your email address before/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeDisabled();
  });

  it('shows the translated API error', async () => {
    useSession.setState({ status: 'authenticated', user: user(true), accessToken: 'at' } as never);
    server.use(
      http.post('*/api/v1/checkout', () =>
        HttpResponse.json({ code: 'COUNTRY_RESTRICTED' }, { status: 403 }),
      ),
    );
    renderCheckout();
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Our service is not available in your country.',
    );
  });
});

describe('FundingCard', () => {
  const account = { id: 'a1', kind: 'FUNDED', currency: 'USD' } as Account;
  const funding: FundingProgress = {
    available: true,
    isExample: true,
    accountSizeMinor: '2500000',
    profitSplitBps: 8000,
    profitMinor: '100000',
    traderShareMinor: '80000',
    payout: {
      eligible: false,
      eligibleFrom: '2026-12-02T00:00:00.000Z',
      kycRequired: true,
      conditions: [
        { code: 'PAYOUT_INTERVAL', met: false, current: '3', required: '14' },
        { code: 'PAYOUT_TRADING_DAYS', met: true, current: '3', required: '3' },
        { code: 'PAYOUT_MIN_AMOUNT', met: true, current: '80000', required: '5000' },
        { code: 'PAYOUT_NO_OPEN_POSITIONS', met: true, current: '0', required: '0' },
      ],
    },
    scaling: {
      profitMinor: '100000',
      targetMinor: '250000',
      targetBps: 1000,
      payouts: 0,
      requiredPayouts: 2,
      eligible: false,
      stepBps: 2500,
      nextSizeMinor: '3125000',
      maxSizeMinor: '40000000',
      atMaximum: false,
    },
  };

  it('shows profit share, payout checklist and scaling progress', async () => {
    useSession.setState({ status: 'authenticated', user: user(true), accessToken: 'at' } as never);
    server.use(http.get('*/api/v1/accounts/a1/funding', () => HttpResponse.json(funding)));
    renderWithProviders(<FundingCard account={account} />);
    expect(await screen.findByText('$800.00')).toBeInTheDocument();
    expect(screen.getByText('Your share (80%)')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Payout cycle completed \(3\/14 days, from Dec 2, 2026\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/At least 3 trading days \(3\/3\)/)).toBeInTheDocument();
    expect(screen.getByText(/KYC/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Profit towards next step' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    expect(screen.getByText(/grow your account by 25% to \$31,250/)).toBeInTheDocument();
  });

  it('renders nothing for non-funded accounts', async () => {
    const { container } = renderWithProviders(
      <FundingCard account={{ ...account, kind: 'DEMO' } as Account} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
