import { useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { CircleCheck, Loader2 } from 'lucide-react';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { call, client } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { EASE, SectionTitle } from './fx';

/* ------------------------------------------------------------------ how it works */
export function HowItWorks() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const steps = ['brand', 'configure', 'launch'] as const;
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-32" aria-labelledby="how-title">
      <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionTitle
            id="how-title"
            eyebrow={t('site.how.eyebrow')}
            title={t('site.how.title')}
            body={t('site.how.body')}
          />
        </div>
        <ol ref={ref} className="relative flex flex-col gap-6 pl-10">
          <span aria-hidden="true" className="absolute top-2 bottom-2 left-[11px] w-px bg-border" />
          <motion.span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[11px] w-px origin-top bg-primary"
            style={{ scaleY: reduce ? 1 : scrollYProgress }}
          />
          {steps.map((s, i) => (
            <motion.li
              key={s}
              className="relative rounded-card border border-border bg-card p-6"
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -15% 0px' }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <span
                aria-hidden="true"
                className="absolute top-6 -left-10 inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-[var(--btn-primary-fg)]"
              >
                {i + 1}
              </span>
              <h3 className="font-display text-xl font-semibold tracking-tight">
                {t(`site.how.${s}.title`)}
              </h3>
              <p className="mt-2 text-muted">{t(`site.how.${s}.body`)}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {(t(`site.how.${s}.tags`, { returnObjects: true }) as string[]).map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ security */
function AuditChain() {
  const reduce = useReducedMotion();
  const blocks = ['order.placed', 'fill', 'rule.check', 'payout.req'];
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 font-mono text-[11px] sm:text-xs">
      {blocks.map((b, i) => (
        <motion.div
          key={b}
          className="flex items-center gap-3 rounded-lg border border-border bg-card-muted px-3 py-2.5"
          initial={reduce ? false : { opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: EASE, delay: i * 0.18 }}
        >
          <span className="text-accent">#{1040 + i}</span>
          <span className="flex-1 truncate">{b}</span>
          <span className="text-muted">prev {['9f3a', 'c21e', '7b04', 'e8d1'][i]}…</span>
          <span className="text-muted">→ {['c21e', '7b04', 'e8d1', '41af'][i]}…</span>
        </motion.div>
      ))}
    </div>
  );
}

export function Security() {
  const { t } = useTranslation();
  const facts = [
    'money',
    'audit',
    'idempotent',
    'writer',
    'gdpr',
    'auth',
    'a11y',
    'tests',
  ] as const;
  return (
    <section
      id="security"
      className="scroll-mt-20 border-y border-border bg-card/40 py-24 sm:py-32"
      aria-labelledby="security-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle
          id="security-title"
          eyebrow={t('site.security.eyebrow')}
          title={t('site.security.title')}
          body={t('site.security.body')}
        />
        <div className="mt-14 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {facts.map((f) => (
              <div key={f} className="border-t border-border pt-4">
                <dt className="font-semibold">{t(`site.security.${f}.title`)}</dt>
                <dd className="mt-1.5 text-sm text-muted">{t(`site.security.${f}.body`)}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-card border border-border bg-card p-5">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
              {t('site.security.chain')}
            </p>
            <div className="mt-4">
              <AuditChain />
            </div>
            <p className="mt-4 text-xs text-muted">{t('site.security.chainNote')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ roadmap */
export function Roadmap() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const cols = ['live', 'building', 'next'] as const;
  return (
    <section id="roadmap" className="scroll-mt-20 py-24 sm:py-32" aria-labelledby="roadmap-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle
          id="roadmap-title"
          eyebrow={t('site.roadmap.eyebrow')}
          title={t('site.roadmap.title')}
          body={t('site.roadmap.body')}
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {cols.map((c, i) => (
            <motion.div
              key={c}
              className={cn(
                'rounded-card border p-6',
                c === 'live' ? 'border-primary bg-card' : 'border-border bg-card',
              )}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: EASE, delay: i * 0.1 }}
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 rounded-full',
                    c === 'live'
                      ? 'bg-primary'
                      : c === 'building'
                        ? 'bg-[var(--meter-warn)]'
                        : 'bg-border-strong',
                  )}
                />
                {t(`site.roadmap.${c}.title`)}
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                {(t(`site.roadmap.${c}.items`, { returnObjects: true }) as string[]).map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ FAQ */
export function SiteFaq() {
  const { t } = useTranslation();
  const qs = ['what', 'firm', 'money', 'simulated', 'markets', 'pricing', 'time', 'data'] as const;
  return (
    <section id="faq" className="scroll-mt-20 py-24 sm:py-32" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <SectionTitle id="faq-title" eyebrow={t('site.faq.eyebrow')} title={t('site.faq.title')} />
        <Accordion type="single" collapsible>
          {qs.map((q) => (
            <AccordionItem key={q} value={q} question={t(`site.faq.${q}.q`)}>
              {t(`site.faq.${q}.a`)}
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ contact */
const VOLUMES = ['lt100', '100-1000', '1000-10000', 'gt10000', 'unknown'] as const;

export function Contact() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState('busy');
    setError(null);
    try {
      await call(() =>
        client.POST('/api/v1/public/leads', {
          body: {
            name: String(f.get('name')),
            email: String(f.get('email')),
            company: String(f.get('company')),
            website: String(f.get('website') || '') || undefined,
            message: String(f.get('message') || '') || undefined,
            volume: String(f.get('volume')) as (typeof VOLUMES)[number],
            locale: (['en', 'nl', 'es'] as const).find((l) => l === lang) ?? 'en',
            consent: true,
            fax: String(f.get('fax') || '') || undefined,
          },
        }),
      );
      setState('done');
    } catch (err) {
      setError(errorMessage(t, err));
      setState('idle');
    }
  }

  return (
    <section id="contact" className="scroll-mt-20 pb-24 sm:pb-32" aria-labelledby="contact-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[28px] border border-border [background-image:var(--cta-gradient)] p-6 text-[var(--cta-fg)] sm:p-12">
          <div aria-hidden="true" className="site-grid absolute inset-0 opacity-30" />
          <div className="relative grid gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[var(--brand-lime)] uppercase">
                {t('site.contact.eyebrow')}
              </p>
              <h2
                id="contact-title"
                className="mt-4 font-display text-3xl leading-[1.08] font-semibold tracking-tight sm:text-5xl"
              >
                {t('site.contact.title')}
              </h2>
              <p className="mt-5 max-w-md text-[var(--builder-dark-muted)]">
                {t('site.contact.body')}
              </p>
              <ul className="mt-8 flex flex-col gap-3 text-sm">
                {(t('site.contact.points', { returnObjects: true }) as string[]).map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <CircleCheck
                      className="size-5 shrink-0 text-[var(--brand-lime)]"
                      aria-hidden="true"
                    />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-card border border-border bg-card p-5 text-fg sm:p-6">
              {state === 'done' ? (
                <div
                  role="status"
                  className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center"
                >
                  <CircleCheck className="size-10 text-accent" aria-hidden="true" />
                  <p className="font-display text-xl font-semibold">
                    {t('site.contact.thanksTitle')}
                  </p>
                  <p className="max-w-sm text-sm text-muted">{t('site.contact.thanksBody')}</p>
                </div>
              ) : (
                <form
                  onSubmit={(e) => void submit(e)}
                  className="flex flex-col gap-4"
                  aria-labelledby="contact-title"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      name="name"
                      label={t('site.contact.name')}
                      autoComplete="name"
                      required
                      minLength={2}
                    />
                    <Input
                      name="email"
                      type="email"
                      label={t('site.contact.email')}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      name="company"
                      label={t('site.contact.company')}
                      autoComplete="organization"
                      required
                      minLength={2}
                    />
                    <Input
                      name="website"
                      label={t('site.contact.website')}
                      placeholder="https://"
                    />
                  </div>
                  <Select name="volume" label={t('site.contact.volume')} defaultValue="unknown">
                    {VOLUMES.map((v) => (
                      <option key={v} value={v}>
                        {t(`site.contact.volumes.${v}`)}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    name="message"
                    label={t('site.contact.message')}
                    rows={4}
                    maxLength={2000}
                    className="[&_textarea]:min-h-28"
                  />
                  {/* Honeypot (hidden from people and assistive tech). */}
                  <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
                    <label>
                      Fax
                      <input name="fax" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      required
                      className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="text-muted">{t('site.contact.consent')}</span>
                  </label>
                  {error && (
                    <p role="alert" className="text-sm font-medium text-loss">
                      {error}
                    </p>
                  )}
                  <Button type="submit" size="lg" disabled={state === 'busy'}>
                    {state === 'busy' && (
                      <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
                    )}
                    {t('site.contact.submit')}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Parallax statement band between sections. */
export function Statement() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const x = useTransform(scrollYProgress, [0, 1], ['8%', '-8%']);
  return (
    <div ref={ref} className="overflow-hidden py-16 sm:py-24">
      <motion.p
        style={reduce ? undefined : { x }}
        className="mx-auto max-w-6xl px-4 text-center font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl"
      >
        {t('site.statement.a')} <span className="text-lime-gradient">{t('site.statement.b')}</span>
      </motion.p>
    </div>
  );
}
