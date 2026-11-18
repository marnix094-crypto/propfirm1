/**
 * Daily Points — EXAMPLE values (decision D65), to be confirmed. Awards are computed from
 * real account data and booked once per (user, reason, refKey).
 */
export const POINTS_AWARDS = {
  /** Per trading day (any account, Europe/Amsterdam), at most once per day per user. */
  TRADING_DAY: 10,
  EMAIL_VERIFIED: 50,
  TWO_FACTOR: 100,
  /** Per bought funded account. */
  FUNDED_ACCOUNT: 250,
} as const;

export interface Reward {
  id: string;
  points: number;
  discountBps: number;
  validDays: number;
}

/** Rewards: discount codes for a new account. */
export const REWARDS: Reward[] = [
  { id: 'discount-5', points: 300, discountBps: 500, validDays: 30 },
  { id: 'discount-10', points: 600, discountBps: 1000, validDays: 30 },
  { id: 'discount-20', points: 1200, discountBps: 2000, validDays: 30 },
];
