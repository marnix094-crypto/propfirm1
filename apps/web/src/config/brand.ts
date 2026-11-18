/** The ONLY place for brand identity in the web app (API: apps/api/src/config/brand.ts). */
export const brand = {
  name: 'Daily Funded',
  legalName: 'Daily Funded B.V.', // TODO: confirm legal entity name
  supportEmail: 'support@example.com',
} as const;

/**
 * Fictional client used on the example storefront (/:lang/storefront) to show what a prop firm
 * built on Daily Funded looks like. Never presented as a real company.
 */
export const exampleFirm = {
  name: 'Your Firm',
  legalName: 'Your Firm Ltd. (example)',
} as const;

/** Real partners only (decision D20). The partner strip is hidden while this list is empty. */
export const partners: { name: string; logoSrc: string; href?: string }[] = [];

export type SocialNetwork = 'x' | 'instagram' | 'youtube' | 'discord' | 'linkedin';

/** Fill in real profile URLs. Entries without an href render as "coming soon" (not as dead links). */
export const socials: { network: SocialNetwork; href: string | null }[] = [
  { network: 'x', href: null },
  { network: 'instagram', href: null },
  { network: 'youtube', href: null },
  { network: 'discord', href: null },
  { network: 'linkedin', href: null },
];
