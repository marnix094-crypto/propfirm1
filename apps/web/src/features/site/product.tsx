import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EASE, SectionTitle, SpotlightCard } from './fx';

const inView = (reduce: boolean | null, delay = 0) =>
  reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true },
        transition: { duration: 0.5, ease: EASE, delay },
      };

function RuleMeters() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      {[
        ['site.product.rules.daily', 0.42, 'var(--meter-safe)'],
        ['site.product.rules.drawdown', 0.74, 'var(--meter-warn)'],
      ].map(([k, v, c], i) => (
        <div key={k as string}>
          <p className="flex justify-between text-xs">
            <span>{t(k as string)}</span>
            <span className="text-muted tabular-nums">{Math.round((v as number) * 100)}%</span>
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--meter-track)]">
            <motion.div
              className="h-full origin-left rounded-full"
              style={{ backgroundColor: c as string }}
              initial={reduce ? false : { scaleX: 0 }}
              whileInView={{ scaleX: v as number }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: EASE, delay: 0.2 + i * 0.2 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Checklist({ keys }: { keys: string[] }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <ul aria-hidden="true" className="flex flex-col gap-2 text-xs">
      {keys.map((k, i) => (
        <motion.li key={k} className="flex items-center gap-2" {...inView(reduce, 0.15 + i * 0.12)}>
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[var(--btn-primary-fg)]">
            <Check className="size-3" strokeWidth={3} />
          </span>
          {t(k)}
        </motion.li>
      ))}
    </ul>
  );
}

function Ranking() {
  const reduce = useReducedMotion();
  return (
    <ol aria-hidden="true" className="flex flex-col gap-1.5 text-xs">
      {[
        ['lime_trader', '+12.4%'],
        ['north_fx', '+9.8%'],
        ['Trader 4F2A', '+7.1%'],
      ].map(([n, r], i) => (
        <motion.li
          key={n}
          className="flex items-center gap-2 rounded-md border border-border bg-card-muted px-2 py-1.5"
          initial={reduce ? false : { opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.15 + i * 0.12 }}
        >
          <span
            className={cn(
              'inline-flex size-5 items-center justify-center rounded text-[10px] font-bold',
              i === 0 ? 'bg-primary text-[var(--btn-primary-fg)]' : 'text-muted',
            )}
          >
            {i + 1}
          </span>
          <span className="flex-1 truncate">{n}</span>
          <span className="font-semibold text-profit tabular-nums">{r}</span>
        </motion.li>
      ))}
    </ol>
  );
}

function Candles() {
  const reduce = useReducedMotion();
  const bars = [30, 44, 38, 52, 47, 60, 55, 68, 62, 74, 70, 82];
  return (
    <div aria-hidden="true" className="flex h-24 items-end gap-1.5">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className={cn(
            'w-full origin-bottom rounded-sm',
            i % 3 === 2 ? 'bg-[var(--loss)]' : 'bg-[var(--profit)]',
          )}
          style={{ height: `${h}%` }}
          initial={reduce ? false : { scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.1 + i * 0.06 }}
        />
      ))}
    </div>
  );
}

function Langs() {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-2">
      {['EN', 'NL', 'ES', 'EUR', 'USD', 'WCAG AA', '2FA'].map((l) => (
        <span
          key={l}
          className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold"
        >
          {l}
        </span>
      ))}
    </div>
  );
}

const TILES = [
  { key: 'rules', span: 'lg:col-span-2', visual: <RuleMeters /> },
  {
    key: 'funding',
    span: '',
    visual: (
      <Checklist
        keys={['site.product.funding.c1', 'site.product.funding.c2', 'site.product.funding.c3']}
      />
    ),
  },
  { key: 'community', span: '', visual: <Ranking /> },
  { key: 'tools', span: 'lg:col-span-2', visual: <Candles /> },
  {
    key: 'payouts',
    span: '',
    visual: (
      <Checklist
        keys={['site.product.payouts.c1', 'site.product.payouts.c2', 'site.product.payouts.c3']}
      />
    ),
    roadmap: true,
  },
  { key: 'global', span: '', visual: <Langs /> },
  {
    key: 'engagement',
    span: '',
    visual: (
      <Checklist
        keys={[
          'site.product.engagement.c1',
          'site.product.engagement.c2',
          'site.product.engagement.c3',
        ]}
      />
    ),
  },
] as const;

/** "Everything a prop firm needs": bento grid of what the platform does today. */
export function Product() {
  const { t } = useTranslation();
  return (
    <section id="product" className="scroll-mt-20 py-24 sm:py-32" aria-labelledby="product-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle
          eyebrow={t('site.product.eyebrow')}
          title={t('site.product.title')}
          body={t('site.product.body')}
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((tile) => (
            <SpotlightCard key={tile.key} className={cn('p-6', tile.span)}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-semibold tracking-tight">
                  {t(`site.product.${tile.key}.title`)}
                </h3>
                {'roadmap' in tile && tile.roadmap && (
                  <span className="shrink-0 rounded-full border border-dashed border-border-strong px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
                    {t('site.partlyRoadmap')}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{t(`site.product.${tile.key}.body`)}</p>
              <div className="mt-6">{tile.visual}</div>
            </SpotlightCard>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">{t('site.exampleNote')}</p>
      </div>
    </section>
  );
}
