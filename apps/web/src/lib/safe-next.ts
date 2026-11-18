/** Only allow in-app redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null, lang: string | undefined): string {
  return next && next.startsWith(`/${lang}/app`) && !next.startsWith('//') ? next : `/${lang}/app`;
}

/** `?next=…` suffix to carry a pending in-app destination between login and register. */
export function nextQuery(next: string | null): string {
  return next ? `?next=${encodeURIComponent(next)}` : '';
}
