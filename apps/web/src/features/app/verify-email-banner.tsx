import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailWarning } from 'lucide-react';
import { call, client } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/components/ui/toaster';
import { useSession } from '@/stores/session';
import { useClientConfig } from '@/hooks/use-trading';

export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const updateUser = useSession((s) => s.updateUser);
  const config = useClientConfig();
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-primary-tint/40 px-4 py-2 text-center text-sm"
    >
      <MailWarning className="size-4 text-accent" aria-hidden="true" />
      <span>{t('app.verifyBanner.text', { email: user.email })}</span>
      <button
        type="button"
        disabled={busy}
        className="font-semibold text-link underline disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          try {
            await call(() => client.POST('/api/v1/auth/verify-email/resend'));
            toast({ kind: 'success', title: t('app.verifyBanner.sent') });
          } catch (e) {
            toast({ kind: 'error', title: errorMessage(t, e) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('app.verifyBanner.resend')}
      </button>
      {config.data?.devTools && (
        <button
          type="button"
          disabled={busy}
          className="rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-xs font-semibold"
          onClick={async () => {
            setBusy(true);
            try {
              await call(() => client.POST('/api/v1/dev/verify-email'));
              updateUser({ emailVerified: true });
            } catch (e) {
              toast({ kind: 'error', title: errorMessage(t, e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('app.verifyBanner.devVerify')}
        </button>
      )}
    </div>
  );
}
