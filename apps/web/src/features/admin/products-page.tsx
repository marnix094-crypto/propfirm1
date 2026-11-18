import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import {
  useAdminMe,
  useAdminProducts,
  useAdminRuleSets,
  useCreateProduct,
  useUpdateProduct,
  type AdminProduct,
  type AdminRuleSet,
} from '@/hooks/use-admin';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { AdminTable, Td, Th, Tr } from './ui';

/** "1,234.50" / "1234,5" → minor units string, or null when not a valid amount. */
export function toMinor(input: string): string | null {
  const v = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ''] = v.split('.');
  return (BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0'))).toString();
}
const toUnits = (minor: string) => {
  const m = BigInt(minor);
  const cents = m % 100n;
  return cents === 0n ? (m / 100n).toString() : `${m / 100n}.${cents.toString().padStart(2, '0')}`;
};

const fundedRuleSets = (rs: AdminRuleSet[] | undefined) =>
  (rs ?? []).filter((r) => r.profitSplitBps !== null);

const ruleSetLabel = (r: AdminRuleSet) => `${r.name} · v${r.version}`;

function CreateProductDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const rules = useAdminRuleSets();
  const create = useCreateProduct();
  const [slug, setSlug] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [ruleSetId, setRuleSetId] = useState('');
  const [recommended, setRecommended] = useState(false);
  const sizeMinor = toMinor(size);
  const priceMinor = toMinor(price);
  const slugOk = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(slug);
  const options = fundedRuleSets(rules.data);
  const chosen = ruleSetId || options[0]?.id || '';
  const valid = slugOk && sizeMinor && priceMinor && chosen;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('admin.products.new')}
      description={t('admin.products.newBody')}
      closeLabel={t('common.close')}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          create.mutate(
            {
              slug,
              accountSizeMinor: sizeMinor!,
              priceMinor: priceMinor!,
              ruleSetId: chosen,
              isRecommended: recommended,
            },
            {
              onSuccess: () => {
                onOpenChange(false);
                toast({ kind: 'success', title: t('admin.products.created') });
              },
              onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
            },
          );
        }}
      >
        <Input
          label={t('admin.products.slug')}
          hint={t('admin.products.slugHint')}
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          error={slug && !slugOk ? t('admin.products.slugInvalid') : null}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('admin.products.size')}
            suffix="USD"
            inputMode="decimal"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            error={size && !sizeMinor ? t('admin.amountInvalid') : null}
            required
          />
          <Input
            label={t('admin.products.price')}
            suffix="EUR"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={price && !priceMinor ? t('admin.amountInvalid') : null}
            required
          />
        </div>
        <Select
          label={t('admin.products.ruleSet')}
          value={chosen}
          onChange={(e) => setRuleSetId(e.target.value)}
        >
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {ruleSetLabel(r)}
              {r.isTemplate ? ` (${t('admin.ruleSets.template')})` : ''}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent-deep)]"
            checked={recommended}
            onChange={(e) => setRecommended(e.target.checked)}
          />
          {t('admin.products.recommended')}
        </label>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!valid || create.isPending}>
            {t('admin.products.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditProductDialog({
  product,
  onClose,
}: {
  product: AdminProduct | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rules = useAdminRuleSets();
  const update = useUpdateProduct();
  const [price, setPrice] = useState(product ? toUnits(product.priceMinor) : '');
  const [ruleSetId, setRuleSetId] = useState(product?.ruleSetId ?? '');
  const priceMinor = toMinor(price);
  if (!product) return null;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.products.editTitle', { slug: product.slug })}
      description={t('admin.products.editBody')}
      closeLabel={t('common.close')}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!priceMinor) return;
          update.mutate(
            { id: product.id, priceMinor, ruleSetId },
            {
              onSuccess: () => {
                onClose();
                toast({ kind: 'success', title: t('admin.saved') });
              },
              onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
            },
          );
        }}
      >
        <Input
          label={t('admin.products.price')}
          suffix="EUR"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={price && !priceMinor ? t('admin.amountInvalid') : null}
        />
        <Select
          label={t('admin.products.ruleSet')}
          value={ruleSetId}
          onChange={(e) => setRuleSetId(e.target.value)}
        >
          {fundedRuleSets(rules.data).map((r) => (
            <option key={r.id} value={r.id}>
              {ruleSetLabel(r)}
            </option>
          ))}
        </Select>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!priceMinor || update.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AdminProductsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useAdminMe().data;
  const products = useAdminProducts();
  const update = useUpdateProduct();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const canEdit = me?.role === 'OWNER' || me?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('admin.nav.products')}
        subtitle={t('admin.products.subtitle')}
        actions={
          canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> {t('admin.products.new')}
            </Button>
          )
        }
      />
      <Card padding="none">
        {products.isPending ? (
          <Skeleton className="m-5 h-40" />
        ) : products.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void products.refetch()}
          />
        ) : products.data.length === 0 ? (
          <EmptyState title={t('admin.products.emptyTitle')} body={t('admin.products.emptyBody')} />
        ) : (
          <AdminTable
            label={t('admin.nav.products')}
            minWidth={900}
            head={
              <>
                <Th>{t('admin.products.product')}</Th>
                <Th right>{t('admin.products.size')}</Th>
                <Th right>{t('admin.products.price')}</Th>
                <Th>{t('admin.products.ruleSet')}</Th>
                <Th right>{t('admin.products.sold')}</Th>
                <Th>{t('admin.products.visible')}</Th>
                <Th>
                  <span className="sr-only">{t('admin.actions')}</span>
                </Th>
              </>
            }
          >
            {products.data.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <p className="font-semibold">{p.slug}</p>
                  <div className="mt-1 flex gap-1.5">
                    {p.isRecommended && (
                      <Badge variant="primary">{t('admin.products.recommendedBadge')}</Badge>
                    )}
                    {p.isExample && <Badge variant="simulated">{t('common.example')}</Badge>}
                  </div>
                </Td>
                <Td right>{f.money(p.accountSizeMinor, 'USD')}</Td>
                <Td right>{f.money(p.priceMinor, p.priceCurrency)}</Td>
                <Td className="text-muted">
                  {p.ruleSetName} · v{p.ruleSetVersion}
                </Td>
                <Td right>{p.sold}</Td>
                <Td>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      role="switch"
                      className="size-4 accent-[var(--accent-deep)]"
                      checked={p.isActive}
                      disabled={!canEdit || update.isPending}
                      aria-label={t('admin.products.visibleFor', { slug: p.slug })}
                      onChange={(e) =>
                        update.mutate(
                          { id: p.id, isActive: e.target.checked },
                          {
                            onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
                          },
                        )
                      }
                    />
                    {p.isActive ? t('admin.products.on') : t('admin.products.off')}
                  </label>
                </Td>
                <Td right>
                  {canEdit && (
                    <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>
                      {t('admin.edit')}
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </AdminTable>
        )}
      </Card>
      <p className="text-xs text-muted">{t('admin.products.snapshotNote')}</p>
      {creating && <CreateProductDialog open onOpenChange={setCreating} />}
      {editing && (
        <EditProductDialog key={editing.id} product={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
