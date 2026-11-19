import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  ImageUp,
  KeyRound,
  Puzzle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';
import {
  adminCall,
  adminClient,
  useAdminIntegration,
  useAdminMutation,
  useCompeteAdmin,
  type AdminIntegration,
} from './api';
import { PageTitle, StatusBadge, useAdminError } from './ui';

const LOGO_MAX = 200_000;
const WIDGETS = ['countdown', 'leaderboard', 'join'] as const;

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation('competeAdmin');
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        })
      }
      aria-label={`${t('integration.copy')}: ${label}`}
    >
      {done ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {done ? t('integration.copied') : t('integration.copy')}
    </Button>
  );
}

function Code({ children, label }: { children: string; label: string }) {
  return (
    <div className="relative">
      <pre
        className="overflow-x-auto rounded-[12px] border border-border bg-card-muted p-4 pr-28 font-mono text-xs leading-relaxed"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={children} label={label} />
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  sub,
  children,
}: {
  icon: typeof Globe;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary-tint/50">
          <Icon className="size-5 text-accent" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{sub}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

/** The demo preview has no URL routing: it opens the same page with `?demo-path=`. */
function widgetPreviewUrl(path: string): string {
  return import.meta.env.VITE_DEMO_MODE === 'true'
    ? `${window.location.pathname}?demo-path=${encodeURIComponent(path)}`
    : path;
}

/** Where the widgets / app are served from: own domain once active, else the subdomain. */
function appOrigin(i: AdminIntegration): string {
  return i.playUrl ?? window.location.origin;
}

function IntegrationForm({ i }: { i: AdminIntegration }) {
  const { t, i18n } = useTranslation('competeAdmin');
  const toMessage = useAdminError();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [logo, setLogo] = useState<string | null>(i.logoDataUrl);
  const [widget, setWidget] = useState<(typeof WIDGETS)[number]>('countdown');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [secret, setSecret] = useState<string | null>(null);
  const save = useAdminMutation(
    (body: {
      domain: string | null;
      logoDataUrl: string | null;
      widgetOrigins: string[];
      ssoEnabled: boolean;
    }) => adminCall(() => adminClient.PUT('/api/v1/compete/admin/integration', { body })),
  );
  const verify = useAdminMutation(() =>
    adminCall(() => adminClient.POST('/api/v1/compete/admin/integration/domain/verify')),
  );
  const rotate = useAdminMutation(() =>
    adminCall(() => adminClient.POST('/api/v1/compete/admin/integration/sso/secret')),
  );

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setMsg(null);
    try {
      await save.mutateAsync({
        domain:
          String(f.get('domain') ?? '')
            .trim()
            .toLowerCase() || null,
        logoDataUrl: logo,
        widgetOrigins: String(f.get('origins') ?? '')
          .split(/[\s,]+/)
          .map((o) => o.trim())
          .filter(Boolean),
        ssoEnabled: f.get('sso') === 'on',
      });
      setMsg({ ok: true, text: t('integration.saved') });
    } catch (err) {
      setMsg({ ok: false, text: toMessage(err) });
    }
  };

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > (LOGO_MAX * 3) / 4)
      return setMsg({ ok: false, text: t('errors.LOGO_INVALID') });
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result));
    r.readAsDataURL(file);
  };

  const origin = appOrigin(i);
  const lang = i18n.language.slice(0, 2);
  const snippet = `<script src="${origin}/compete-embed.js" async></script>
<div data-compete-widget="${widget}" data-lang="${lang}" data-theme="${theme}"></div>`;
  const ssoExample = `// Your server (Node.js, "jose"): one short-lived token per click
import { SignJWT } from 'jose';

const token = await new SignJWT({
  nickname: user.publicName,   // optional, 3–20 letters/digits/_
  email: user.email,           // optional
  country: user.country,       // ISO-2, required
  adult: true,                 // 18+ confirmed, required
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer('${i.slug}')
  .setAudience('dailyfunded-compete-sso')
  .setSubject(String(user.id))
  .setJti(crypto.randomUUID())
  .setIssuedAt()
  .setExpirationTime('2m')
  .sign(new TextEncoder().encode(process.env.COMPETE_SSO_SECRET));

redirect(\`${origin}/${lang}/compete/sso#token=\${token}\`);`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {/* Where players play */}
      <Section icon={Globe} title={t('integration.where.title')} sub={t('integration.where.sub')}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[14px] border border-border p-4">
            <dt className="text-xs font-medium text-muted">{t('integration.where.subdomain')}</dt>
            <dd className="mt-1 font-mono text-sm break-all">
              {i.subdomain ?? t('integration.where.noSubdomain')}
            </dd>
          </div>
          <div className="rounded-[14px] border border-border p-4">
            <dt className="text-xs font-medium text-muted">{t('integration.where.playUrl')}</dt>
            <dd className="mt-1 flex items-center gap-2 font-mono text-sm break-all">
              {i.playUrl ? (
                <a
                  href={i.playUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-link hover:underline"
                >
                  {i.playUrl}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input
            label={t('integration.domain.label')}
            name="domain"
            defaultValue={i.domain ?? ''}
            placeholder="competition.your-firm.com"
            hint={t('integration.domain.hint')}
          />
          {i.domain && (
            <div className="flex items-center gap-2 sm:pb-6">
              <StatusBadge status={i.domainStatus} />
              {i.domainStatus !== 'ACTIVE' && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={verify.isPending}
                  onClick={() => void verify.mutateAsync(undefined).catch(() => undefined)}
                >
                  <RefreshCw aria-hidden="true" />
                  {t('integration.domain.check')}
                </Button>
              )}
            </div>
          )}
        </div>
        {i.domain && i.domainStatus !== 'ACTIVE' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{t('integration.domain.records')}</p>
            <div className="overflow-x-auto rounded-[12px] border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-card-muted/60 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{t('integration.domain.type')}</th>
                    <th className="px-4 py-2 font-semibold">{t('integration.domain.name')}</th>
                    <th className="px-4 py-2 font-semibold">{t('integration.domain.value')}</th>
                    <th className="px-4 py-2">
                      <span className="sr-only">{t('integration.copy')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {i.dnsRecords.map((r) => (
                    <tr key={r.type} className="border-t border-border">
                      <td className="px-4 py-2.5 font-semibold">{r.type}</td>
                      <td className="px-4 py-2.5 font-mono text-xs break-all">{r.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs break-all">{r.value}</td>
                      <td className="px-4 py-2.5 text-right">
                        <CopyButton text={r.value} label={`${r.type} ${r.name}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Brand */}
      <Section icon={ImageUp} title={t('integration.logo.title')} sub={t('integration.logo.sub')}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 min-w-40 items-center justify-center rounded-[14px] border border-dashed border-border-strong bg-card-muted/50 px-4">
            {logo ? (
              <img src={logo} alt={t('integration.logo.preview')} className="h-10 w-auto" />
            ) : (
              <span className="text-xs text-muted">{t('integration.logo.none')}</span>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-[12px] border border-border px-4 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-[var(--focus-ring)] hover:bg-card-muted">
            <ImageUp className="size-4" aria-hidden="true" />
            {t('integration.logo.upload')}
            <input
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              className="sr-only"
              onChange={(e) => onLogo(e.target.files?.[0])}
            />
          </label>
          {logo && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(null)}>
              {t('integration.logo.remove')}
            </Button>
          )}
        </div>
      </Section>

      {/* Widgets */}
      <Section
        icon={Puzzle}
        title={t('integration.widgets.title')}
        sub={t('integration.widgets.sub')}
      >
        <Textarea
          label={t('integration.widgets.origins')}
          name="origins"
          rows={3}
          defaultValue={i.widgetOrigins.join('\n')}
          placeholder={'https://www.your-firm.com'}
          hint={t('integration.widgets.originsHint')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('integration.widgets.kind')}
            value={widget}
            onChange={(e) => setWidget(e.target.value as (typeof WIDGETS)[number])}
          >
            {WIDGETS.map((w) => (
              <option key={w} value={w}>
                {t(`integration.widgets.kinds.${w}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t('integration.widgets.theme')}
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
          >
            <option value="dark">{t('integration.widgets.dark')}</option>
            <option value="light">{t('integration.widgets.light')}</option>
          </Select>
        </div>
        <Code label={t('integration.widgets.snippet')}>{snippet}</Code>
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">
            {t('integration.widgets.preview')}
          </p>
          <div className="flex justify-center rounded-[16px] border border-border bg-card-muted p-4">
            <iframe
              key={`${widget}-${theme}`}
              title={t('integration.widgets.previewTitle', {
                kind: t(`integration.widgets.kinds.${widget}`),
              })}
              src={widgetPreviewUrl(
                `/${lang}/compete/widget/${widget}?theme=${theme}&operator=${i.slug}`,
              )}
              className="h-[440px] w-full max-w-sm rounded-[20px]"
              data-testid="widget-preview"
            />
          </div>
        </div>
      </Section>

      {/* SSO */}
      <Section icon={KeyRound} title={t('integration.sso.title')} sub={t('integration.sso.sub')}>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="sso"
            defaultChecked={i.ssoEnabled}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            <span className="font-semibold">{t('integration.sso.enable')}</span>
            <span className="block text-muted">{t('integration.sso.enableHint')}</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={rotate.isPending}
            onClick={() =>
              void rotate
                .mutateAsync(undefined)
                .then((r) => setSecret(r.secret))
                .catch((err: unknown) => setMsg({ ok: false, text: toMessage(err) }))
            }
          >
            <KeyRound aria-hidden="true" />
            {i.ssoConfigured ? t('integration.sso.rotate') : t('integration.sso.generate')}
          </Button>
          <span className="text-sm text-muted">
            {i.ssoConfigured ? t('integration.sso.configured') : t('integration.sso.notConfigured')}
          </span>
        </div>
        <Code label={t('integration.sso.example')}>{ssoExample}</Code>
      </Section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-[16px] border border-border bg-card/90 p-3 backdrop-blur">
        <Button type="submit" disabled={save.isPending}>
          {t('integration.save')}
        </Button>
        {msg && (
          <p role="status" className={cn('text-sm', msg.ok ? 'text-accent' : 'text-loss')}>
            {msg.text}
          </p>
        )}
      </div>

      <Modal
        open={secret !== null}
        onOpenChange={(o) => !o && setSecret(null)}
        title={t('integration.sso.secretTitle')}
        description={t('integration.sso.secretBody')}
        closeLabel={t('integration.close')}
      >
        <div className="flex flex-col gap-4">
          <Code label={t('integration.sso.secretTitle')}>{secret ?? ''}</Code>
          <Button type="button" onClick={() => setSecret(null)}>
            {t('integration.sso.stored')}
          </Button>
        </div>
      </Modal>
    </form>
  );
}

/** Operator panel: connect Compete to the operator's own website (D108/D109). */
export function CompeteAdminIntegrationPage() {
  const { t } = useTranslation('competeAdmin');
  const q = useAdminIntegration();
  const operator = useCompeteAdmin((s) => s.operator);
  return (
    <>
      <PageTitle title={t('integration.title')} sub={t('integration.sub')} />
      {q.isPending ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : q.isError ? (
        <ErrorState
          title={t('errors.load')}
          retryLabel={t('retry')}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <IntegrationForm key={operator ?? 'own'} i={q.data} />
      )}
    </>
  );
}
