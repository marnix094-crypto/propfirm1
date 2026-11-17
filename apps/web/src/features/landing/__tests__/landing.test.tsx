import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { exampleProducts } from '@/mocks/data';
import { renderWithProviders } from '@/test/render';
import { Pricing, PricingCard } from '../sections/pricing';
import { PayoutNotification } from '../sections/payout-notification';

const recommended = exampleProducts.find((p) => p.isRecommended)!;

describe('PricingCard', () => {
  it('shows capital, drawdown in % and $, and updates total + buy link with quantity', async () => {
    renderWithProviders(<PricingCard product={recommended} />);
    const card = screen.getByTestId(`pricing-card-${recommended.slug}`);
    expect(within(card).getByText('$25,000')).toBeInTheDocument();
    expect(within(card).getByText('6% · $1,500')).toBeInTheDocument();
    expect(within(card).getByText('Recommended')).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'More accounts' }));
    expect(within(card).getByText('€398.00')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Get this account' })).toHaveAttribute(
      'href',
      `/en/register?product=${recommended.slug}&qty=2`,
    );
  });
});

describe('Pricing', () => {
  it('renders all products from the API with exactly one recommended', async () => {
    renderWithProviders(<Pricing />);
    expect(screen.getByLabelText('Loading…')).toHaveAttribute('aria-busy', 'true');
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Get this account' })).toHaveLength(5),
    );
    expect(screen.getAllByText('Recommended')).toHaveLength(1);
  });

  it('shows an error state with retry', async () => {
    server.use(
      http.get('*/api/v1/products', () => HttpResponse.json({ code: 'X' }, { status: 500 })),
    );
    renderWithProviders(<Pricing />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Prices could not be loaded.');
    server.resetHandlers();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Get this account' })).toHaveLength(5),
    );
  });

  it('custom account configurator shows a server-calculated price', async () => {
    renderWithProviders(<Pricing />);
    await userEvent.click(screen.getByRole('button', { name: /Build a custom account/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByTestId('custom-price')).toHaveTextContent('€209.00'),
    );
    expect(within(dialog).getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      '/en/register?quote=q_3000000_600',
    );
  });
});

describe('PayoutNotification', () => {
  it('labels the card as an example when there are no real payouts', async () => {
    renderWithProviders(<PayoutNotification />);
    expect(await screen.findByTestId('payout-example-badge')).toHaveTextContent('Example');
  });

  it('shows a real anonymised payout without the example label', async () => {
    server.use(
      http.get('*/api/v1/public/payouts-feed', () =>
        HttpResponse.json({
          items: [
            {
              id: 'p1',
              countryCode: 'NL',
              amountMinor: '250000',
              currency: 'USD',
              paidAt: new Date().toISOString(),
            },
          ],
        }),
      ),
    );
    renderWithProviders(<PayoutNotification />);
    expect(await screen.findByText(/\$2,500\.00 · Netherlands/)).toBeInTheDocument();
    expect(screen.queryByTestId('payout-example-badge')).not.toBeInTheDocument();
  });
});
