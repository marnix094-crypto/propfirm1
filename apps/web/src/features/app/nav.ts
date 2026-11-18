import {
  Award,
  BadgeCheck,
  ChartColumn,
  CandlestickChart,
  CirclePlay,
  Eye,
  FlaskConical,
  House,
  Medal,
  NotebookPen,
  ReceiptText,
  Repeat2,
  Settings,
  Star,
  Tag,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Features that are announced but not built yet: they open an honest "coming soon" page. */
export const SOON_FEATURES = [
  'points',
  'leaderboard',
  'competitions',
  'offers',
  'transparency',
  'copier',
  'backtesting',
  'certificates',
] as const;
export type SoonFeature = (typeof SOON_FEATURES)[number];

export interface NavItem {
  /** Path below /:lang/app. */
  to: string;
  /** i18n key below app.nav. */
  key: string;
  icon: LucideIcon;
  soon?: boolean;
  isNew?: boolean;
  /** Shows a lock until the active account may request a payout. */
  lockable?: boolean;
}

export interface NavSection {
  key: 'main' | 'backtesting' | 'performance';
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'main',
    items: [
      { to: 'portfolio', key: 'home', icon: House },
      { to: 'trade', key: 'trade', icon: CandlestickChart },
      { to: 'points', key: 'points', icon: Star, soon: true },
      { to: 'withdrawal', key: 'withdrawal', icon: Wallet, lockable: true },
      { to: 'leaderboard', key: 'leaderboard', icon: Trophy, soon: true },
      { to: 'competitions', key: 'competitions', icon: Medal, soon: true },
      { to: 'offers', key: 'offers', icon: Tag, soon: true },
      { to: 'transparency', key: 'transparency', icon: Eye, soon: true },
      { to: 'orders', key: 'orders', icon: ReceiptText },
      { to: 'copier', key: 'copier', icon: Repeat2, soon: true },
    ],
  },
  {
    key: 'backtesting',
    items: [{ to: 'backtesting', key: 'backtesting', icon: FlaskConical, soon: true }],
  },
  {
    key: 'performance',
    items: [
      { to: 'stats', key: 'stats', icon: ChartColumn },
      { to: 'track-record', key: 'trackRecord', icon: Award },
      { to: 'notebook', key: 'notebook', icon: NotebookPen },
      { to: 'certificates', key: 'certificates', icon: BadgeCheck, soon: true },
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  { to: 'tutorial', key: 'tutorial', icon: CirclePlay, isNew: true },
  { to: 'more', key: 'settings', icon: Settings },
];

/** Mobile bottom navigation (everything else lives on the "More" page). */
export const NAV_MOBILE: NavItem[] = [
  { to: 'portfolio', key: 'home', icon: House },
  { to: 'trade', key: 'trade', icon: CandlestickChart },
  { to: 'stats', key: 'stats', icon: ChartColumn },
  { to: 'more', key: 'more', icon: Settings },
];
