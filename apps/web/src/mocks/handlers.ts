import { delay, http, HttpResponse } from 'msw';
import type { PriceQuote, PriceQuoteRequest } from '@/hooks/use-catalog';
import { exampleProducts, exampleQuotePriceMinor, exampleRules } from './data';

const API = '*/api/v1';

export const handlers = [
  http.get(`${API}/products`, async ({ request }) => {
    await delay(300);
    const type = new URL(request.url).searchParams.get('type');
    return HttpResponse.json({ items: exampleProducts.filter((p) => !type || p.type === type) });
  }),

  // No real payouts exist yet → empty feed. The UI then shows a clearly labelled example.
  http.get(`${API}/public/payouts-feed`, () => HttpResponse.json({ items: [] })),

  http.post(`${API}/products/quote`, async ({ request }) => {
    await delay(250);
    const body = (await request.json()) as PriceQuoteRequest;
    const size = BigInt(body.accountSizeMinor);
    if (size < 500_000n || size > 20_000_000n) {
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Invalid account size',
          status: 422,
          code: 'ACCOUNT_SIZE_INVALID',
        },
        { status: 422 },
      );
    }
    const res: PriceQuote = {
      quoteId: `q_${size}_${body.maxDrawdownBps}`,
      priceMinor: exampleQuotePriceMinor(size, body.maxDrawdownBps).toString(),
      priceCurrency: 'EUR',
      accountSizeMinor: body.accountSizeMinor,
      rules: exampleRules(body.maxDrawdownBps),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    return HttpResponse.json(res);
  }),
];
