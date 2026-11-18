import { useId, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';
import { SectionTitle } from './fx';

import { BUILDER_PRESETS as PRESETS } from '@/config/brand-builder';

/** Readable text colour (black or white) on an arbitrary brand colour. */
export function onColor(hex: string): 'var(--builder-light-text)' | 'var(--builder-dark-text)' {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  // Contrast with near-black vs near-white text: pick the stronger one.
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05)
    ? 'var(--builder-light-text)'
    : 'var(--builder-dark-text)';
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'YF';

/** Live white-label preview: type a firm name, pick a colour, watch the platform re-brand. */
export function BrandBuilder() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESETS[1]!);
  const [dark, setDark] = useState(true);
  const nameId = useId();
  const firm = name.trim() || t('site.builder.placeholder');
  const vars = {
    '--b': color,
    '--b-fg': onColor(color),
    '--p-bg': `var(--builder-${dark ? 'dark' : 'light'}-bg)`,
    '--p-card': `var(--builder-${dark ? 'dark' : 'light'}-card)`,
    '--p-line': `var(--builder-${dark ? 'dark' : 'light'}-line)`,
    '--p-text': `var(--builder-${dark ? 'dark' : 'light'}-text)`,
    '--p-muted': `var(--builder-${dark ? 'dark' : 'light'}-muted)`,
  } as CSSProperties;

  return (
    <section
      id="brand-builder"
      className="scroll-mt-20 py-24 sm:py-32"
      aria-labelledby="builder-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle
          eyebrow={t('site.builder.eyebrow')}
          title={t('site.builder.title')}
          body={t('site.builder.body')}
        />
        <div className="mt-14 grid items-start gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
          <form
            className="flex flex-col gap-6 rounded-card border border-border bg-card p-6"
            onSubmit={(e) => e.preventDefault()}
            aria-label={t('site.builder.formLabel')}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="text-sm font-medium">
                {t('site.builder.name')}
              </label>
              <input
                id={nameId}
                value={name}
                maxLength={28}
                placeholder={t('site.builder.placeholder')}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-btn border border-border bg-card px-3.5 text-[15px] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            <fieldset>
              <legend className="text-sm font-medium">{t('site.builder.color')}</legend>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                {PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-pressed={color === c}
                    aria-label={t('site.builder.pick', { color: c })}
                    className={cn(
                      'size-9 rounded-full border-2 transition-transform motion-safe:hover:scale-110',
                      color === c ? 'border-fg' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="relative inline-flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border-strong text-xs font-semibold">
                  <span aria-hidden="true">+</span>
                  <span className="sr-only">{t('site.builder.custom')}</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value.toUpperCase())}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">{t('site.builder.mode')}</legend>
              <div className="mt-3 inline-flex rounded-btn border border-border p-1">
                {[true, false].map((d) => (
                  <button
                    key={String(d)}
                    type="button"
                    aria-pressed={dark === d}
                    onClick={() => setDark(d)}
                    className={cn(
                      'rounded-[calc(var(--radius-btn)-4px)] px-4 py-1.5 text-sm font-semibold transition-colors',
                      dark === d ? 'bg-primary-tint text-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    {t(d ? 'site.builder.dark' : 'site.builder.light')}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="text-xs leading-relaxed text-muted">{t('site.builder.note')}</p>
          </form>

          {/* Preview (decorative; the controls above describe it). */}
          <div
            aria-hidden="true"
            style={vars}
            className="overflow-hidden rounded-[20px] border border-border bg-[var(--p-bg)] text-[var(--p-text)] shadow-float transition-colors duration-500"
          >
            <div className="flex items-center gap-1.5 border-b border-[var(--p-line)] px-4 py-2.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2.5 rounded-full bg-[var(--p-line)]" />
              ))}
              <span className="ml-3 truncate rounded-md bg-[var(--p-card)] px-3 py-1 text-[11px] text-[var(--p-muted)]">
                app.{(name.trim() || 'yourfirm').toLowerCase().replace(/[^a-z0-9]+/g, '')}.com
              </span>
            </div>
            <div className="grid grid-cols-[150px_minmax(0,1fr)] sm:grid-cols-[190px_minmax(0,1fr)]">
              <div className="flex flex-col gap-1 border-r border-[var(--p-line)] p-3 sm:p-4">
                <div className="mb-4 flex items-center gap-2">
                  <motion.span
                    key={color}
                    initial={reduce ? false : { scale: 0.6, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--b)] text-xs font-bold text-[var(--b-fg)]"
                  >
                    {initials(firm)}
                  </motion.span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={firm}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="truncate text-sm font-bold"
                    >
                      {firm}
                    </motion.span>
                  </AnimatePresence>
                </div>
                {['home', 'trade', 'stats', 'payouts', 'leaderboard'].map((k, i) => (
                  <span
                    key={k}
                    className={cn(
                      'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-500',
                      i === 0 ? 'bg-[var(--b)] text-[var(--b-fg)]' : 'text-[var(--p-muted)]',
                    )}
                  >
                    {t(`site.builder.nav.${k}`)}
                  </span>
                ))}
              </div>
              <div className="min-w-0 p-3 sm:p-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(
                    [
                      ['site.hero.kpiEquity', '$102,340'],
                      ['site.hero.kpiToday', '+$1,184'],
                      ['site.hero.kpiWin', '58%'],
                    ] as const
                  ).map(([k, v], i) => (
                    <div
                      key={k}
                      className={cn(
                        'rounded-lg border border-[var(--p-line)] bg-[var(--p-card)] p-2.5',
                        i === 2 && 'hidden sm:block',
                      )}
                    >
                      <p className="text-[10px] text-[var(--p-muted)]">{t(k)}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
                <svg viewBox="0 0 400 110" className="mt-3 h-28 w-full">
                  <path
                    d="M0 95 C 40 90, 60 70, 100 74 S 160 50, 200 58 S 260 30, 300 38 S 360 12, 400 16"
                    fill="none"
                    stroke="var(--b)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="transition-[stroke] duration-500"
                  />
                </svg>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <span className="rounded-lg bg-[var(--b)] py-2.5 text-center text-sm font-bold text-[var(--b-fg)] transition-colors duration-500">
                    {t('site.builder.buy')}
                  </span>
                  <span className="rounded-lg border border-[var(--p-line)] py-2.5 text-center text-sm font-bold">
                    {t('site.builder.sell')}
                  </span>
                </div>
                <p className="mt-4 text-right text-[10px] text-[var(--p-muted)]">
                  {t('site.builder.powered')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
