import { randomUUID } from 'node:crypto';

/**
 * Money adapters of the compete product (interface + fake, CLAUDE.md). Entry fees, refunds and
 * prize payouts are REAL money once a licensed provider is connected (D101); until then only
 * the fake provider exists and production refuses it.
 */
export interface CompetePaymentProvider {
  readonly name: string;
  readonly isTest: boolean;
  /** Starts collecting an entry fee; the player is sent to `paymentUrl`. */
  createEntryPayment(input: {
    entryId: string;
    amountMinor: bigint;
    currency: string;
    locale: string;
  }): Promise<{ providerRef: string; paymentUrl: string }>;
  /** Full refund of a collected entry fee (cancelled round). */
  refund(input: { providerRef: string; amountMinor: bigint }): Promise<{ providerRef: string }>;
}

export const COMPETE_PAYMENTS = Symbol('COMPETE_PAYMENTS');

export class FakeCompetePaymentProvider implements CompetePaymentProvider {
  readonly name = 'fake';
  readonly isTest = true;
  constructor(private readonly appBaseUrl: string) {}

  async createEntryPayment(input: { entryId: string; locale: string }) {
    const lang = ['en', 'nl', 'es'].includes(input.locale) ? input.locale : 'en';
    return {
      providerRef: `fake_entry_${randomUUID()}`,
      paymentUrl: `${this.appBaseUrl}/${lang}/pay/${input.entryId}`,
    };
  }

  async refund() {
    return { providerRef: `fake_refund_${randomUUID()}` };
  }
}
