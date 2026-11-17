/** Mirrors the Prisma enums (docs/datamodel.md). Kept in sync from phase 3 onward. */
export const AccountKind = {
  CHALLENGE: 'CHALLENGE',
  FUNDED: 'FUNDED',
  LIVE_BROKER: 'LIVE_BROKER',
} as const;
export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

export const ProductType = {
  INSTANT: 'INSTANT',
  ONE_STEP: 'ONE_STEP',
  TWO_STEP: 'TWO_STEP',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

/** Only INSTANT is offered (decision D19). */
export const ACTIVE_PRODUCT_TYPES: readonly ProductType[] = [ProductType.INSTANT];

export const Role = { TRADER: 'TRADER', SUPPORT: 'SUPPORT', ADMIN: 'ADMIN' } as const;
export type Role = (typeof Role)[keyof typeof Role];
