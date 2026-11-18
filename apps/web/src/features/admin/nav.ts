import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  Package,
  Palette,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  UserCog,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

export interface AdminNavItem {
  /** Path below /:lang/admin ('' = overview). */
  to: string;
  /** i18n key below admin.nav. */
  key: string;
  icon: LucideIcon;
  superadminOnly?: boolean;
}

export const ADMIN_NAV: { key: string; items: AdminNavItem[] }[] = [
  {
    key: 'manage',
    items: [
      { to: '', key: 'overview', icon: LayoutDashboard },
      { to: 'traders', key: 'traders', icon: Users },
      { to: 'accounts', key: 'accounts', icon: WalletCards },
      { to: 'alerts', key: 'alerts', icon: ShieldAlert },
    ],
  },
  {
    key: 'offer',
    items: [
      { to: 'products', key: 'products', icon: Package },
      { to: 'rule-sets', key: 'ruleSets', icon: SlidersHorizontal },
      { to: 'branding', key: 'branding', icon: Palette },
    ],
  },
  {
    key: 'control',
    items: [
      { to: 'audit', key: 'audit', icon: ScrollText },
      { to: 'team', key: 'team', icon: UserCog },
      { to: 'firms', key: 'firms', icon: Building2, superadminOnly: true },
    ],
  },
];

export const ADMIN_MOBILE: AdminNavItem[] = [
  { to: '', key: 'overview', icon: LayoutDashboard },
  { to: 'traders', key: 'traders', icon: Users },
  { to: 'alerts', key: 'alerts', icon: ShieldAlert },
  { to: 'menu', key: 'menu', icon: ClipboardList },
];
