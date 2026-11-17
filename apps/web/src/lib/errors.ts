import type { TFunction } from 'i18next';
import { ApiError } from './api';

/** Map an API error (stable problem+json code) to a translated message. */
export function errorMessage(t: TFunction, err: unknown): string {
  if (err instanceof ApiError)
    return t(`errors.${err.code}`, { defaultValue: t('errors.generic') });
  return t('errors.generic');
}
