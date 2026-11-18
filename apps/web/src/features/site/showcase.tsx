import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import dashboardShot from '@/assets/site/dashboard.webp';
import terminalShot from '@/assets/site/terminal.webp';
import statsShot from '@/assets/site/stats.webp';
import mobileShot from '@/assets/site/mobile-dashboard.webp';
import adminOverviewShot from '@/assets/site/admin-overview.webp';
import { EASE, SectionTitle } from './fx';

/** Real product screenshots (captured by `pnpm --filter @brand/web screens`, example data, D96). */
export const SHOTS = {
  dashboard: dashboardShot,
  terminal: terminalShot,
  stats: statsShot,
  mobile: mobileShot,
  admin: adminOverviewShot,
};

/** Desktop screenshots are 1440×900 viewports. */
const DESKTOP = { width: 2400, height: 1500 };
const MOBILE = { width: 780, height: 1688 };

/** Minimal browser chrome around a screenshot. */
export function BrowserFrame({
  src,
  alt,
  url,
  eager,
  className,
  children,
}: {
  src: string;
  alt: string;
  url: string;
  eager?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-[18px] border border-white/10 bg-[var(--brand-ink)] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.75)] ring-1 ring-black/5',
        className,
      )}
    >
      <div
        className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5"
        aria-hidden="true"
      >
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/25" />
          <span className="size-2.5 rounded-full bg-white/25" />
          <span className="size-2.5 rounded-full bg-white/25" />
        </span>
        <span className="mx-auto flex max-w-[60%] items-center gap-1.5 truncate rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
          <Lock className="size-3 shrink-0" />
          {url}
        </span>
        <span className="w-12" />
      </div>
      <div className="relative">
        <img
          src={src}
          alt={alt}
          width={DESKTOP.width}
          height={DESKTOP.height}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          {...(eager ? { fetchPriority: 'high' as const } : {})}
          className="block h-auto w-full"
        />
        {children}
      </div>
    </figure>
  );
}

export function PhoneFrame({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-[34px] border-[6px] border-[var(--brand-ink)] bg-[var(--brand-ink)] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)] ring-1 ring-white/10',
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        width={MOBILE.width}
        height={MOBILE.height}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full rounded-[28px]"
      />
    </figure>
  );
}

/**
 * Hero product shot: the real dashboard in a browser frame that tilts flat as you scroll,
 * with the mobile app floating beside it. Static when reduced motion is preferred.
 */
export function HeroShowcase() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  const rotateX = useTransform(progress, [0, 1], [22, 0]);
  const scale = useTransform(progress, [0, 1], [0.9, 1]);
  const phoneY = useTransform(progress, [0, 1], [120, 0]);
  return (
    <div
      ref={ref}
      className="relative mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6 [perspective:1600px]"
    >
      {/* Brand glow behind the product. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[10%] -top-10 bottom-10 rounded-[50%] bg-[radial-gradient(closest-side,rgb(175_230_4/0.35),transparent)] blur-3xl"
      />
      <motion.div
        style={reduce ? undefined : { rotateX, scale, transformOrigin: 'center top' }}
        initial={reduce ? false : { opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: EASE, delay: 0.35 }}
        className="relative"
      >
        <BrowserFrame
          src={SHOTS.dashboard}
          alt={t('site.shots.dashboard')}
          url="app.yourfirm.com"
          eager
        />
      </motion.div>
      <motion.div
        style={reduce ? undefined : { y: phoneY }}
        className="absolute -right-2 bottom-[2%] hidden w-[19%] min-w-36 sm:block lg:-right-10"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.9 }}
      >
        <PhoneFrame src={SHOTS.mobile} alt={t('site.shots.mobile')} />
      </motion.div>
      <p className="mt-6 text-center text-xs text-muted sm:mt-[14%] lg:mt-[12%]">
        {t('site.shots.caption')}
      </p>
    </div>
  );
}

const TOUR = [
  { key: 'dashboard', shot: SHOTS.dashboard, url: 'app.yourfirm.com/portfolio' },
  { key: 'terminal', shot: SHOTS.terminal, url: 'app.yourfirm.com/trade/BTCUSDT' },
  { key: 'stats', shot: SHOTS.stats, url: 'app.yourfirm.com/stats' },
  { key: 'admin', shot: SHOTS.admin, url: 'app.yourfirm.com/admin' },
] as const;

/** Product tour: tabs with real screenshots of each part of the platform. */
export function ProductTour() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [active, setActive] = useState<(typeof TOUR)[number]['key']>('dashboard');
  const current = TOUR.find((x) => x.key === active)!;
  return (
    <section id="tour" className="scroll-mt-20 py-24 sm:py-32" aria-labelledby="tour-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle
          id="tour-title"
          eyebrow={t('site.tour.eyebrow')}
          title={t('site.tour.title')}
          body={t('site.tour.body')}
        />
        <div
          role="tablist"
          aria-label={t('site.tour.tabs')}
          className="mx-auto mt-12 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card/70 p-1 backdrop-blur"
        >
          {TOUR.map((x) => (
            <button
              key={x.key}
              id={`tour-tab-${x.key}`}
              role="tab"
              type="button"
              aria-selected={active === x.key}
              aria-controls="tour-panel"
              tabIndex={active === x.key ? 0 : -1}
              onClick={() => setActive(x.key)}
              onKeyDown={(e) => {
                const i = TOUR.findIndex((y) => y.key === x.key);
                const next =
                  e.key === 'ArrowRight'
                    ? (i + 1) % TOUR.length
                    : e.key === 'ArrowLeft'
                      ? (i - 1 + TOUR.length) % TOUR.length
                      : e.key === 'Home'
                        ? 0
                        : e.key === 'End'
                          ? TOUR.length - 1
                          : -1;
                if (next < 0) return;
                e.preventDefault();
                const key = TOUR[next]!.key;
                setActive(key);
                document.getElementById(`tour-tab-${key}`)?.focus();
              }}
              className={cn(
                'relative shrink-0 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                active === x.key ? 'text-[var(--btn-primary-fg)]' : 'text-muted hover:text-fg',
              )}
            >
              {active === x.key && (
                <motion.span
                  layoutId="tour-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={
                    reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }
                  }
                />
              )}
              <span className="relative">{t(`site.tour.tab.${x.key}`)}</span>
            </button>
          ))}
        </div>
        <div
          id="tour-panel"
          role="tabpanel"
          aria-labelledby={`tour-tab-${active}`}
          className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_320px]"
        >
          <div className="relative">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.key}
                initial={reduce ? false : { opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.985 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <BrowserFrame
                  src={current.shot}
                  alt={t(`site.shots.${current.key}`)}
                  url={current.url}
                />
              </motion.div>
            </AnimatePresence>
          </div>
          <div>
            <h3 className="font-display text-2xl font-semibold tracking-tight">
              {t(`site.tour.tab.${current.key}`)}
            </h3>
            <p className="mt-3 text-muted">{t(`site.tour.desc.${current.key}`)}</p>
            <ul className="mt-6 flex flex-col gap-3 text-sm">
              {(t(`site.tour.points.${current.key}`, { returnObjects: true }) as string[]).map(
                (p) => (
                  <li key={p} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                    />
                    {p}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-muted">{t('site.shots.caption')}</p>
      </div>
    </section>
  );
}
