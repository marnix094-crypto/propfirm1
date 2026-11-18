import { create } from 'zustand';

const FIRM_KEY = 'df-firm';
const ADMIN_FIRM_KEY = 'df-admin-firm';
const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value) storage().setItem(key, value);
    else storage().removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Which firm (tenant) this browser talks to. Normally the API decides from the domain; for
 * previews a `?firm=slug` link or VITE_FIRM_SLUG picks one explicitly (sent as `X-Firm`).
 */
export function initialFirmSlug(search = typeof location === 'undefined' ? '' : location.search) {
  const fromUrl = new URLSearchParams(search).get('firm')?.toLowerCase() ?? null;
  if (fromUrl && SLUG.test(fromUrl)) {
    write(() => sessionStorage, FIRM_KEY, fromUrl);
    return fromUrl;
  }
  const stored = read(() => sessionStorage, FIRM_KEY);
  if (stored && SLUG.test(stored)) return stored;
  const env = import.meta.env.VITE_FIRM_SLUG as string | undefined;
  return env && SLUG.test(env) ? env : null;
}

interface FirmState {
  /** Explicit firm slug for public requests (X-Firm), or null to let the domain decide. */
  slug: string | null;
  /** Superadmins: the firm being administered (X-Admin-Firm), or null for their own. */
  adminFirmId: string | null;
  setAdminFirm: (id: string | null) => void;
}

export const useFirmStore = create<FirmState>((set) => ({
  slug: initialFirmSlug(),
  adminFirmId: read(() => sessionStorage, ADMIN_FIRM_KEY),
  setAdminFirm: (id) => {
    write(() => sessionStorage, ADMIN_FIRM_KEY, id);
    set({ adminFirmId: id });
  },
}));
