import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/panel';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import { Logo } from '@/components/layout/logo';
import {
  useAdminBranding,
  useAdminMe,
  useUpdateBranding,
  type AdminFirm,
  type UpdateBranding,
} from '@/hooks/use-admin';
import { brandPalette, DEFAULT_BRAND_COLOR as DEFAULT_COLOR, isHexColor } from '@/lib/brand-color';
import { errorMessage } from '@/lib/errors';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 200 * 1024;
const HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** What traders will see: logo, primary button, highlight — in the chosen colour. */
function Preview({ name, color, logo }: { name: string; color: string; logo: string | null }) {
  const { t } = useTranslation();
  const p = brandPalette(isHexColor(color) ? color : DEFAULT_COLOR);
  const vars = {
    '--pv-fill': p.fill,
    '--pv-on': p.onFill,
    '--pv-tint': p.tint,
    '--pv-deep': p.deep,
  } as CSSProperties;
  return (
    <Card padding="none" className="overflow-hidden" style={vars}>
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        {logo ? (
          <img src={logo} alt={name} className="h-8 w-auto max-w-[180px] object-contain" />
        ) : (
          <span className="text-lg font-extrabold tracking-tight">{name || '—'}</span>
        )}
      </div>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-sm text-muted">{t('admin.branding.previewBody')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 items-center rounded-full bg-[var(--pv-fill)] px-5 text-sm font-semibold text-[var(--pv-on)]">
            {t('admin.branding.previewButton')}
          </span>
          <span className="inline-flex h-8 items-center rounded-full bg-[var(--pv-tint)] px-3 text-xs font-semibold">
            1M
          </span>
          <span className="text-sm font-semibold text-[var(--pv-deep)] underline">
            {t('admin.branding.previewLink')}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--meter-track)]">
          <div className="h-full w-2/3 rounded-full bg-[var(--pv-fill)]" />
        </div>
      </div>
    </Card>
  );
}

function BrandingForm({ firm }: { firm: AdminFirm }) {
  const { t } = useTranslation();
  const me = useAdminMe().data;
  const save = useUpdateBranding();
  const canEdit = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const [name, setName] = useState(firm.name);
  const [color, setColor] = useState(firm.primaryColor ?? DEFAULT_COLOR);
  const [logo, setLogo] = useState<string | null>(firm.logoDataUrl);
  const [domain, setDomain] = useState(firm.domain ?? '');
  const [email, setEmail] = useState(firm.supportEmail ?? '');
  const [logoError, setLogoError] = useState<string | null>(null);

  const colorOk = isHexColor(color);
  const domainOk = domain === '' || HOSTNAME.test(domain);
  const valid = name.trim().length >= 2 && colorOk && domainOk;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            const body: UpdateBranding = {
              name: name.trim(),
              primaryColor: color.toUpperCase() === DEFAULT_COLOR ? null : color.toUpperCase(),
              logoDataUrl: logo,
              domain: domain || null,
              supportEmail: email || null,
            };
            save.mutate(body, {
              onSuccess: () => toast({ kind: 'success', title: t('admin.saved') }),
              onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
            });
          }}
        >
          <fieldset disabled={!canEdit} className="grid gap-5">
            <Input
              label={t('admin.branding.name')}
              hint={t('admin.branding.nameHint')}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid gap-1.5">
              <span className="text-sm font-medium" id="brand-color-label">
                {t('admin.branding.color')}
              </span>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-labelledby="brand-color-label"
                  value={colorOk ? color : DEFAULT_COLOR}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="size-11 cursor-pointer rounded-[var(--radius-field)] border border-border bg-card p-1"
                />
                <Input
                  className="w-40"
                  label={t('admin.branding.hex')}
                  value={color}
                  maxLength={7}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  error={colorOk ? null : t('admin.branding.hexInvalid')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setColor(DEFAULT_COLOR)}
                >
                  {t('admin.branding.resetColor')}
                </Button>
              </div>
              <p className="text-xs text-muted">{t('admin.branding.colorHint')}</p>
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t('admin.branding.logo')}</span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--btn-secondary-border)] bg-card px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-primary/40">
                  <ImageUp className="size-4" aria-hidden="true" />
                  {t('admin.branding.upload')}
                  <input
                    type="file"
                    accept={LOGO_TYPES.join(',')}
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      if (!LOGO_TYPES.includes(file.type))
                        return setLogoError(t('admin.branding.logoType'));
                      if (file.size > LOGO_MAX_BYTES)
                        return setLogoError(t('admin.branding.logoSize'));
                      setLogoError(null);
                      setLogo(await readAsDataUrl(file));
                    }}
                  />
                </label>
                {logo && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(null)}>
                    <Trash2 aria-hidden="true" /> {t('admin.branding.removeLogo')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">{t('admin.branding.logoHint')}</p>
              {logoError && (
                <p role="alert" className="text-xs font-medium text-loss">
                  {logoError}
                </p>
              )}
            </div>
            <Input
              label={t('admin.branding.domain')}
              hint={t('admin.branding.domainHint')}
              placeholder="trade.yourfirm.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value.trim().toLowerCase())}
              error={domainOk ? null : t('admin.branding.domainInvalid')}
            />
            <Input
              label={t('admin.branding.supportEmail')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
            />
          </fieldset>
          {canEdit && (
            <div className="flex justify-end">
              <Button type="submit" disabled={!valid || save.isPending}>
                {t('common.save')}
              </Button>
            </div>
          )}
        </form>
      </Card>
      <div className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">{t('admin.branding.preview')}</h2>
        <Preview name={name} color={color} logo={logo} />
        {firm.isDefault && !logo && (
          <p className="flex items-center gap-2 text-xs text-muted">
            {t('admin.branding.defaultLogo')} <Logo className="h-3" />
          </p>
        )}
      </div>
    </div>
  );
}

export function AdminBrandingPage() {
  const { t } = useTranslation();
  const branding = useAdminBranding();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('admin.nav.branding')} subtitle={t('admin.branding.subtitle')} />
      {branding.isPending ? (
        <Skeleton className="h-96 rounded-card" />
      ) : branding.isError ? (
        <ErrorState
          title={t('errors.generic')}
          retryLabel={t('common.retry')}
          onRetry={() => void branding.refetch()}
        />
      ) : (
        <BrandingForm key={branding.data.id + branding.data.name} firm={branding.data} />
      )}
    </div>
  );
}
