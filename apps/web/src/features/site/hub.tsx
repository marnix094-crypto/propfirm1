import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { Cpu } from 'lucide-react';
import { useFormat } from '@/hooks/use-format';
import { EASE } from './fx';

/** Example firms running on the platform (labelled "Example" — not real customers). */
const FIRMS = [
  { name: 'Nova Capital', country: 'NL', traders: 1284, paidMinor: '4821040', y: 70 },
  { name: 'Atlas Funding', country: 'ES', traders: 862, paidMinor: '3104500', y: 210 },
  { name: 'Vertex Prop', country: 'DE', traders: 2019, paidMinor: '7288050', y: 350 },
] as const;

/** Core (x=150) → card edge (x=330): two parallel orthogonal-ish curves per firm. */
const paths = FIRMS.flatMap((f, i) =>
  [-6, 6].map((o) => ({
    id: `hub-${i}-${o}`,
    d: `M 214 ${210 + o} C 270 ${210 + o}, 262 ${f.y + o}, 330 ${f.y + o} L 352 ${f.y + o}`,
  })),
);

/**
 * Hero visual: the Daily Funded engine at the centre, wired to example firms that run their
 * own brand on it. Data flows along the wires (static with reduced motion).
 */
export function PlatformHub() {
  const { t } = useTranslation();
  const f = useFormat();
  const reduce = useReducedMotion();
  return (
    <figure className="relative mx-auto w-full max-w-[620px]" aria-labelledby="hub-caption">
      <div className="relative aspect-[600/420] w-full">
        {/* Wires (decorative). */}
        <svg
          viewBox="0 0 600 420"
          className="absolute inset-0 hidden h-full w-full sm:block"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="hub-wire" x1="0" x2="1">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          {paths.map((p, i) => (
            <g key={p.id}>
              <motion.path
                id={p.id}
                d={p.d}
                fill="none"
                stroke="url(#hub-wire)"
                strokeWidth="1.4"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.1, ease: EASE, delay: 0.4 + i * 0.06 }}
              />
              {!reduce && i % 2 === 0 && (
                <circle r="2.6" fill="var(--primary)">
                  <animateMotion
                    dur={`${2.6 + i * 0.25}s`}
                    repeatCount="indefinite"
                    begin={`${i * 0.4}s`}
                  >
                    <mpath href={`#${p.id}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          ))}
          {FIRMS.map((fm) => (
            <circle key={fm.name} cx="352" cy={fm.y} r="3.5" fill="var(--primary)" />
          ))}
        </svg>

        {/* Engine core. */}
        <motion.div
          className="absolute top-1/2 left-[25%] hidden -translate-x-1/2 -translate-y-1/2 sm:block"
          initial={reduce ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
        >
          <div className="relative size-32">
            <span
              aria-hidden="true"
              className="core-pulse absolute inset-0 rounded-full border border-primary"
            />
            <span
              aria-hidden="true"
              className="absolute -inset-6 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary)_45%,transparent),transparent)] blur-xl"
            />
            <div className="relative flex size-32 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--primary)_60%,transparent)] bg-[radial-gradient(circle_at_35%_30%,color-mix(in_srgb,var(--primary)_55%,var(--card)),var(--card)_70%)] shadow-[inset_0_0_30px_color-mix(in_srgb,var(--primary)_35%,transparent)]">
              <div className="flex size-20 items-center justify-center rounded-full bg-primary text-[var(--btn-primary-fg)] shadow-[0_0_40px_color-mix(in_srgb,var(--primary)_70%,transparent)]">
                <Cpu className="size-9" aria-hidden="true" />
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs font-semibold tracking-wide text-muted">
            {t('site.hub.core')}
          </p>
        </motion.div>

        {/* Example firms. */}
        <div className="absolute inset-y-0 right-0 flex w-full flex-col justify-between gap-3 sm:w-[42%]">
          {FIRMS.map((fm, i) => (
            <motion.div
              key={fm.name}
              className="glow-card glass px-4 py-3"
              initial={reduce ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.6 + i * 0.12 }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{fm.name}</p>
                <span className="text-[11px] font-semibold text-muted">{fm.country}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-[11px] text-muted">{t('site.hub.traders')}</dt>
                  <dd className="text-base font-semibold tabular-nums">
                    {fm.traders.toLocaleString(f.locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">{t('site.hub.paid')}</dt>
                  <dd className="text-base font-semibold text-accent tabular-nums">
                    {f.money(fm.paidMinor, 'USD')}
                  </dd>
                </div>
              </dl>
            </motion.div>
          ))}
        </div>
      </div>
      <figcaption id="hub-caption" className="mt-4 text-center text-xs text-muted sm:text-right">
        <span className="mr-1.5 rounded-full border border-dashed border-border-strong px-2 py-0.5 font-semibold">
          {t('site.hub.example')}
        </span>
        {t('site.hub.caption')}
      </figcaption>
    </figure>
  );
}

/** Rotating text badge ("Book a demo · Book a demo ·") around an icon; links to the contact form. */
export function RotatingBadge({ label, href }: { label: string; href: string }) {
  const reduce = useReducedMotion();
  const text = `${label} · ${label} · `;
  return (
    <a
      href={href}
      className="group relative inline-flex size-24 items-center justify-center rounded-full"
      aria-label={label}
    >
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full"
        aria-hidden="true"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 14, ease: 'linear', repeat: Infinity }}
      >
        <defs>
          <path id="badge-circle" d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
        </defs>
        <text className="fill-[var(--text-muted)] text-[9.5px] font-semibold tracking-[0.18em] uppercase">
          <textPath href="#badge-circle">{text}</textPath>
        </text>
      </motion.svg>
      <span className="glow-card-strong flex size-12 items-center justify-center rounded-full bg-primary text-[var(--btn-primary-fg)] transition-transform group-hover:scale-110 motion-reduce:transition-none">
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </a>
  );
}
