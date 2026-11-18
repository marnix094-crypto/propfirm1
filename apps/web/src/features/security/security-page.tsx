import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Copy, Laptop, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import { call, client } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { useSession } from '@/stores/session';
import { ErrorNote } from '../auth/login-page';

const codeInput = {
  inputMode: 'numeric' as const,
  autoComplete: 'one-time-code',
  pattern: '\\d{6}',
  maxLength: 6,
  placeholder: '123456',
};

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('app.security.twoFactor.codesBody')}</p>
      <ul
        className="grid grid-cols-2 gap-2 rounded-[16px] bg-card-muted p-4 font-mono text-sm"
        data-testid="recovery-codes"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join('\n'));
            setCopied(true);
          }}
        >
          <Copy aria-hidden="true" />{' '}
          {copied ? t('app.security.twoFactor.copied') : t('app.security.twoFactor.copy')}
        </Button>
        <Button onClick={onDone}>{t('app.security.twoFactor.done')}</Button>
      </div>
    </div>
  );
}

function TwoFactorSetup({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const updateUser = useSession((s) => s.updateUser);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const setup = useQuery({
    queryKey: ['2fa-setup'],
    queryFn: () => call(() => client.POST('/api/v1/me/2fa/setup')),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (setup.data)
      void QRCode.toDataURL(setup.data.otpauthUri, { margin: 1, width: 220 }).then(setQr);
  }, [setup.data]);
  const enable = useMutation({
    mutationFn: (code: string) =>
      call(() => client.POST('/api/v1/me/2fa/enable', { body: { code } })),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      updateUser({ twoFactorEnabled: true });
      toast({ kind: 'success', title: t('app.security.twoFactor.enabledToast') });
    },
    onError: (e) => setError(errorMessage(t, e)),
  });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && (codes ? onClose() : onClose())}
      title={
        codes ? t('app.security.twoFactor.codesTitle') : t('app.security.twoFactor.setupTitle')
      }
      closeLabel={t('common.close')}
    >
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : setup.isPending ? (
        <Skeleton className="h-64" />
      ) : setup.isError ? (
        <ErrorNote>{errorMessage(t, setup.error)}</ErrorNote>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setError(null);
            enable.mutate(String(new FormData(e.currentTarget).get('code')).trim());
          }}
        >
          <p className="text-sm">{t('app.security.twoFactor.step1')}</p>
          {qr ? (
            <img
              src={qr}
              alt={t('app.security.twoFactor.qrAlt')}
              width={220}
              height={220}
              className="mx-auto rounded-[12px] bg-white p-2"
            />
          ) : (
            <Skeleton className="mx-auto size-[220px]" />
          )}
          <div className="text-sm">
            <p className="text-muted">{t('app.security.twoFactor.manual')}</p>
            <code
              className="mt-1 block rounded-[10px] bg-card-muted px-3 py-2 font-mono text-sm break-all"
              data-testid="totp-secret"
            >
              {setup.data?.secret}
            </code>
          </div>
          <Input label={t('app.security.twoFactor.step2')} name="code" required {...codeInput} />
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" disabled={enable.isPending}>
            {enable.isPending && (
              <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
            )}
            {t('app.security.twoFactor.confirm')}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function CodeDialog({
  title,
  body,
  withPassword,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  body: string;
  withPassword?: boolean;
  submitLabel: string;
  onSubmit: (v: { code: string; password: string }) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={body}
      closeLabel={t('common.close')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            await onSubmit({
              code: String(f.get('code')).trim(),
              password: String(f.get('password') ?? ''),
            });
          } catch (err) {
            setError(errorMessage(t, err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {withPassword && (
          <Input
            label={t('auth.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        )}
        <Input label={t('app.security.password.code')} name="code" required {...codeInput} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TwoFactorCard() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const updateUser = useSession((s) => s.updateUser);
  const [dialog, setDialog] = useState<'setup' | 'disable' | 'regenerate' | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const on = !!user?.twoFactorEnabled;
  return (
    <Card padding="lg">
      <div className="flex items-start gap-4">
        <span
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-tile bg-primary-tint/50 text-accent"
          aria-hidden="true"
        >
          {on ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {t('app.security.twoFactor.title')}
            <Badge variant={on ? 'success' : 'warning'} data-testid="2fa-status">
              {on ? t('app.security.twoFactor.on') : t('app.security.twoFactor.off')}
            </Badge>
          </h2>
          <p className="mt-1 text-sm text-muted">{t('app.security.twoFactor.description')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {on ? (
              <>
                <Button variant="secondary" onClick={() => setDialog('regenerate')}>
                  {t('app.security.twoFactor.regenerate')}
                </Button>
                <Button variant="secondary" onClick={() => setDialog('disable')}>
                  {t('app.security.twoFactor.disable')}
                </Button>
              </>
            ) : (
              <Button onClick={() => setDialog('setup')}>
                {t('app.security.twoFactor.enable')}
              </Button>
            )}
          </div>
        </div>
      </div>
      {dialog === 'setup' && <TwoFactorSetup onClose={() => setDialog(null)} />}
      {dialog === 'disable' && (
        <CodeDialog
          title={t('app.security.twoFactor.disableTitle')}
          body={t('app.security.twoFactor.disableBody')}
          withPassword
          submitLabel={t('app.security.twoFactor.disable')}
          onClose={() => setDialog(null)}
          onSubmit={async ({ code, password }) => {
            await call(() => client.POST('/api/v1/me/2fa/disable', { body: { code, password } }));
            updateUser({ twoFactorEnabled: false });
            toast({ kind: 'success', title: t('app.security.twoFactor.disabledToast') });
            setDialog(null);
          }}
        />
      )}
      {dialog === 'regenerate' && (
        <CodeDialog
          title={t('app.security.twoFactor.regenerate')}
          body={t('app.security.twoFactor.regenerateBody')}
          submitLabel={t('app.security.twoFactor.regenerate')}
          onClose={() => setDialog(null)}
          onSubmit={async ({ code }) => {
            const r = await call(() =>
              client.POST('/api/v1/me/2fa/recovery-codes', { body: { code } }),
            );
            setDialog(null);
            setCodes(r.recoveryCodes);
          }}
        />
      )}
      {codes && (
        <Modal
          open
          onOpenChange={(o) => !o && setCodes(null)}
          title={t('app.security.twoFactor.codesTitle')}
          closeLabel={t('common.close')}
        >
          <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
        </Modal>
      )}
    </Card>
  );
}

function PasswordCard() {
  const { t } = useTranslation();
  const twoFactor = useSession((s) => !!s.user?.twoFactorEnabled);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold">{t('app.security.password.title')}</h2>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          setError(null);
          try {
            await call(() =>
              client.POST('/api/v1/me/password', {
                body: {
                  currentPassword: String(f.get('current')),
                  newPassword: String(f.get('new')),
                  ...(twoFactor ? { code: String(f.get('code')).trim() } : {}),
                },
              }),
            );
            form.reset();
            toast({ kind: 'success', title: t('app.security.password.done') });
          } catch (err) {
            setError(errorMessage(t, err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          label={t('app.security.password.current')}
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
        <Input
          label={t('app.security.password.new')}
          name="new"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          hint={t('auth.register.passwordHint')}
        />
        {twoFactor && (
          <Input label={t('app.security.password.code')} name="code" required {...codeInput} />
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="secondary" disabled={busy} className="self-start">
          {t('app.security.password.submit')}
        </Button>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: qk.sessions,
    queryFn: () => call(() => client.GET('/api/v1/me/sessions')),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      call(() => client.DELETE('/api/v1/me/sessions/{id}', { params: { path: { id } } })),
    onSuccess: () => toast({ kind: 'success', title: t('app.security.sessions.revoked') }),
    onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.sessions }),
  });
  const device = (ua: string | null) => {
    if (!ua) return t('app.security.sessions.unknown');
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
    const os = /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
    return [browser, os].filter(Boolean).join(' · ') || t('app.security.sessions.unknown');
  };
  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold">{t('app.security.sessions.title')}</h2>
      {sessions.isPending ? (
        <Skeleton className="mt-4 h-16" />
      ) : sessions.isError ? (
        <ErrorState
          title={t('errors.generic')}
          retryLabel={t('common.retry')}
          onRetry={() => void sessions.refetch()}
        />
      ) : (
        <ul className="mt-2">
          {sessions.data.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 border-t border-border py-3 first:border-t-0"
            >
              <Laptop className="size-5 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {device(s.userAgent)}
                  {s.current && (
                    <Badge variant="primary">{t('app.security.sessions.current')}</Badge>
                  )}
                </p>
                <p className="text-sm text-muted">
                  {t('app.security.sessions.started', {
                    date: new Date(s.createdAt).toLocaleString(f.locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              </div>
              {!s.current && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(s.id)}
                >
                  {t('app.security.sessions.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SecurityPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <title>{t('app.security.title')}</title>
      <h1 className="text-2xl font-bold tracking-tight">{t('app.security.title')}</h1>
      <TwoFactorCard />
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}
