/** The ONLY place for brand identity. Replace "BRAND" when the name is final. */
export const brand = {
  name: 'BRAND',
  legalName: 'BRAND B.V.',
  supportEmail: 'support@example.com',
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
