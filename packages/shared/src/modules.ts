/**
 * Client-dashboard modules a firm admin can switch on or off (D92). The core (home, trade,
 * withdrawal, order history, stats, settings) is always on. Keys match the web nav keys.
 */
export const CLIENT_MODULES = [
  'points',
  'offers',
  'leaderboard',
  'competitions',
  'transparency',
  'copier',
  'backtesting',
  'trackRecord',
  'notebook',
  'certificates',
  'tutorial',
] as const;

export type ClientModule = (typeof CLIENT_MODULES)[number];

export const isClientModule = (v: string): v is ClientModule =>
  (CLIENT_MODULES as readonly string[]).includes(v);
