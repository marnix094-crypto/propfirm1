import { randomUUID } from 'node:crypto';

/**
 * Payment provider adapter (CLAUDE.md: every adapter = interface + fake).
 * Phase 6 ships only the fake provider; the real PSP (and its signed webhook) follows in phase 7.
 */
export interface CreatePaymentInput {
  purchaseId: string;
  amountMinor: bigint;
  currency: string;
  description: string;
  locale: string;
}

export interface CreatedPayment {
  providerRef: string;
  /** Where the client is sent to pay. */
  paymentUrl: string;
}

export type PaymentEventType = 'payment.succeeded' | 'payment.failed' | 'payment.cancelled';

/** Normalised provider event. `eventId` is unique per provider (deduplication). */
export interface PaymentEvent {
  provider: string;
  eventId: string;
  providerRef: string;
  type: PaymentEventType;
}

export interface PaymentProvider {
  readonly name: string;
  /** Test provider: no real money moves; never allowed in production. */
  readonly isTest: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/**
 * Fake provider: "pays" on our own test-payment page (`/{lang}/app/checkout/:id/pay`),
 * which reports the outcome through `POST /checkout/:id/test-payment`.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  readonly isTest = true;
  constructor(private readonly appBaseUrl: string) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const lang = ['en', 'nl', 'es'].includes(input.locale) ? input.locale : 'en';
    return {
      providerRef: `fake_${randomUUID()}`,
      paymentUrl: `${this.appBaseUrl}/${lang}/app/checkout/${input.purchaseId}/pay`,
    };
  }
}
