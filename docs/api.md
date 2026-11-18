# API-spec — Fase 0 (ontwerp)

De definitieve OpenAPI 3.1-spec wordt in fase 5 **code-first** gegenereerd uit NestJS (`@nestjs/swagger`) naar `packages/shared/openapi.json`; daaruit genereren we de getypeerde client (`openapi-typescript` + `openapi-fetch`). CI faalt als de gegenereerde client niet overeenkomt met de spec.

## Algemeen
- Basis-URL: `/api/v1`. JSON. Auth: `Authorization: Bearer <accessToken>`; refresh via httpOnly-cookie.
- **Geld**: `…Minor` als integer-string (`"1000000"` = €10.000,00) + `currency`. **Prijs/qty**: decimale string (`"67012.35"`).
- **Idempotentie**: `Idempotency-Key` (UUID) verplicht op `POST /checkout`, `POST …/orders`, `POST …/positions/*/close`, `POST …/payouts`, admin-overrides. Zelfde key + zelfde body → zelfde response; andere body → `409 IDEMPOTENCY_KEY_REUSED`.
- **Fouten**: RFC 9457 `application/problem+json`: `{ type, title, status, code, detail?, errors?[] }`. `code` is stabiel (bv. `INSUFFICIENT_MARGIN`, `RULE_LEVERAGE_EXCEEDED`, `MARKET_DATA_STALE`, `MFA_REQUIRED`, `KYC_REQUIRED`).
- **Paginatie**: `?cursor=&limit=` → `{ items, nextCursor }`.
- Rate limits via `RateLimit-*`-headers; `429` met `Retry-After`.

## Endpoints

Legenda rol: P = publiek, T = trader (ingelogd), S = support, A = admin, ⚡ = step-up 2FA, 🔑 = Idempotency-Key.

### Auth
| Methode | Pad | Rol | Doel |
|---|---|---|---|
| POST | `/auth/register` | P | e-mail, wachtwoord, land, taal, akkoord voorwaarden → verificatiemail |
| POST | `/auth/verify-email` | P | token uit mail |
| POST | `/auth/login` | P | → tokens, of `{ mfaRequired: true, mfaToken }` |
| POST | `/auth/2fa/verify` | P | `mfaToken` + TOTP/recovery-code → tokens |
| POST | `/auth/refresh` | P (cookie) | roteert refresh-token |
| POST | `/auth/logout` | T | revoke huidige sessie |
| POST | `/auth/password/forgot` · `/auth/password/reset` | P | reset-flow |

### Profiel & beveiliging
| GET/PATCH | `/me` | T | profiel, taal, thema-voorkeur |
|---|---|---|---|
| POST | `/me/2fa/setup` | T | → `otpauthUri` (QR) |
| POST | `/me/2fa/enable` | T | bevestig met code → recovery-codes (eenmalig getoond) |
| POST | `/me/2fa/disable` · `/me/2fa/recovery-codes` | T ⚡ | |
| GET / DELETE | `/me/sessions`, `/me/sessions/:id` | T | actieve sessies |
| POST | `/me/password` | T ⚡ | wachtwoord wijzigen |
| POST | `/me/data-export` · `/me/delete-request` | T ⚡ | GDPR |
| GET / PUT | `/me/watchlist` | T | |

### KYC
| GET | `/kyc/status` | T | status + vereist niveau |
|---|---|---|---|
| POST | `/kyc/session` | T | start sessie → SDK-token/redirect van provider |
| POST | `/webhooks/kyc/:provider` | P (signature) | statusupdate |

### Catalogus & checkout
| GET | `/products?type=INSTANT\|ONE_STEP\|TWO_STEP` | P | pricing-kaarten incl. regels |
|---|---|---|---|
| GET | `/products/:id` | P | |
| POST | `/products/quote` | P | custom account configurator: `{ type, accountSizeMinor, options }` → berekende prijs + rules (server is bron van waarheid) |
| POST | `/checkout` | T 🔑 | `{ productId \| quoteId, quantity }` → `{ purchaseId, paymentUrl }` |
| GET | `/checkout/:purchaseId` | T | status na terugkeer van PSP |
| POST | `/webhooks/payments/:provider` | P (signature) | betaling → accounts aanmaken |
| GET | `/invoices` · `/invoices/:id/pdf` | T | |

### Marktdata
| GET | `/instruments` | P | lijst + specificaties |
|---|---|---|---|
| GET | `/instruments/:symbol/candles?tf=1m\|5m\|15m\|1h\|4h\|1d&from&to` | P | historie (gecachet) |
| GET | `/instruments/:symbol/quote` | P | laatste bid/ask |
| GET | `/market/status` | P | status per feed |

### Accounts & trading
| GET | `/accounts` | T | alle accounts (challenge/funded/eigen geld) |
|---|---|---|---|
| GET | `/accounts/:id` | T | snapshot: balance, equity, margin, dailyPnl, status, `seq` |
| GET | `/accounts/:id/equity?range=1W\|1M\|3M\|6M\|1Y&from&to` | T | equity-curve (gedownsampled) |
| GET | `/accounts/:id/progress` | T | regels + huidige waarden + meterstatus (safe/warn/breach) |
| GET | `/accounts/:id/daily-stats` | T | |
| POST | `/accounts/:id/orders` | T 🔑 | `{ clientOrderId, symbol, side, type, qty, limitPrice?, stopPrice?, slPrice?, tpPrice?, leverage }` → `201 Order` |
| GET | `/accounts/:id/orders?status=open\|history` | T | |
| PATCH | `/accounts/:id/orders/:orderId` | T | prijs/qty van open order wijzigen |
| DELETE | `/accounts/:id/orders/:orderId` | T | annuleren |
| GET | `/accounts/:id/positions` | T | |
| PATCH | `/accounts/:id/positions/:positionId` | T | SL/TP wijzigen |
| POST | `/accounts/:id/positions/:positionId/close` | T 🔑 | `{ qty? }` (gedeeltelijk) |
| POST | `/accounts/:id/positions/close-all` | T 🔑 | |
| GET | `/accounts/:id/fills` · `/accounts/:id/ledger` | T | |

### Uitbetalingen & broker
| GET | `/payouts` | T | |
|---|---|---|---|
| POST | `/accounts/:id/payouts` | T ⚡ 🔑 | aanvraag (vereist KYC APPROVED) |
| GET | `/broker/connections` | T | |
| POST | `/broker/connections` | T | onboarding bij broker starten (mock) |
| POST | `/broker/connections/:id/sync` | T | balans/posities synchroniseren |

### Publiek
| GET | `/public/payouts-feed` | P | echte, geanonimiseerde uitbetalingen (land + bedrag afgerond + tijd); leeg = niets tonen |
|---|---|---|---|
| GET | `/health` · `/ready` | P | |

### Admin (`/admin/*`) — geïmplementeerd (D83–D92)
Toegang: alleen de admin van de firma (rol OWNER, apart adminaccount) of Daily Funded-superadmin (`Role.ADMIN`, kiest firma met header `X-Admin-Firm`). Inloggen via `POST /auth/login` met `audience: 'admin'` (partner-login); klantlogin weigert adminaccounts en andersom. 2FA verplicht (behalve `GET /admin/me`). Alle acties gelogd als `ADMIN`.

| Methode | Pad | Wie | Opmerking |
|---|---|---|---|
| GET | `/admin/me` | admin, superadmin | rol, firma, 2FA-status |
| GET | `/admin/overview` | admin, superadmin | kerncijfers + omzet per dag (30 d) |
| GET | `/admin/traders?q=&status=&cursor=` · `/admin/traders/:id` | admin, superadmin | alleen klanten (nooit admins) |
| POST | `/admin/traders/:id/suspend` · `/reactivate` | admin, superadmin | `{ reason }` |
| GET | `/admin/accounts?kind=&status=&cursor=` · POST `/admin/accounts/:id/fail` | admin, superadmin | |
| GET / POST / PATCH | `/admin/products` · `/admin/products/:id` | admin, superadmin | |
| GET / POST | `/admin/rule-sets` | admin, superadmin | POST = nieuwe versie |
| GET / PUT | `/admin/modules` | admin, superadmin | klantdashboard samenstellen (D92) |
| GET / PUT | `/admin/branding` | admin, superadmin | |
| GET | `/admin/alerts` · POST `/admin/alerts/:id/ack` | admin, superadmin | |
| GET | `/admin/audit` · `/admin/audit/verify` | admin, superadmin | |
| GET / POST | `/admin/firms` · POST `/admin/firms/:id/status` | superadmin | nieuwe firma + admin-uitnodiging |
| POST | `/admin/firms/:id/admin` · `/admin/firms/:id/admin/invite` | superadmin | admin vervangen · uitnodiging opnieuw |

Publiek: `GET /public/firm` (huisstijl + uitgeschakelde modules). Dev: `POST /dev/staff` (alleen `DEV_TOOLS_ENABLED`: firma + admin, of superadmin).

## WebSockets (Socket.IO)

Typen staan in `packages/shared/src/ws.ts` en worden door server én client gebruikt.

### Namespace `/market` (publiek)
| Richting | Event | Payload |
|---|---|---|
| C→S | `subscribe` / `unsubscribe` | `{ symbols: string[] }` |
| S→C | `quote` | `{ s, bid, ask, ts }` (gethrottled) |
| S→C | `candle` | `{ s, tf, o, h, l, c, v, t, closed }` |
| S→C | `feed.status` | `{ source, status }` |

### Namespace `/account` (auth via access-token in handshake)
| Richting | Event | Payload |
|---|---|---|
| C→S | `subscribe` | `{ accountId, lastSeq? }` → server stuurt `snapshot` of gemiste events |
| S→C | `snapshot` | volledige accountstatus + open orders/posities + `seq` |
| S→C | `account.update` | `{ seq, balanceMinor, equityMinor, usedMarginMinor, freeMarginMinor, dailyPnlMinor }` |
| S→C | `order.update` | `{ seq, order }` (incl. `clientOrderId` voor optimistische UI) |
| S→C | `position.update` · `fill` | `{ seq, … }` |
| S→C | `rule.progress` | `{ seq, rules: [{ rule, current, limit, state: safe\|warn\|breach }] }` |
| S→C | `account.status` | `{ seq, status, reason? }` (PASSED / FAILED / PENDING_FUNDED …) |
| S→C | `notification` | `{ id, type, i18nKey, params }` |

- Elk account-event heeft een oplopend `seq`. Gat gedetecteerd → client vraagt opnieuw `subscribe` met `lastSeq` → server levert delta of `snapshot`.
- Orders worden **niet** via WS geplaatst, alleen via REST (idempotent).
- Heartbeat/ping 20s; client toont "verbinding verbroken" na 2 gemiste pings.

## Status fase 3 (geïmplementeerd)

Geïmplementeerd en getest: `auth/register|login|refresh|logout`, `me`, `instruments`, `instruments/:symbol/quote|candles`, `market/status`, `accounts`, `accounts/:id`, `…/positions`, `…/orders?status=open|history`, `…/fills`, `…/ledger`, `…/equity?range=1D|1W|1M|3M|6M|1Y`, `POST …/orders` (Idempotency-Key verplicht), `DELETE …/orders/:orderId`, `PATCH …/positions/:id` (SL/TP), `POST …/positions/:id/close`, `POST …/positions/close-all`, `POST …/reset` (alleen DEMO).

WebSocket (Socket.IO, path `/api/v1/ws`): namespace `/market` (`subscribe {symbols}` → `quote`, `candle` (1m), `feed.status`) en `/account` (handshake `auth.token`; `subscribe {accountId}` → ack met `{account, positions, orders, seq}`; daarna `order.update`, `position.update`, `fill`, `account.update`, `account.status` als `{accountId, seq, data}`; `seq` = 0 voor tick-gedreven `account.update`).

Volgt: 2FA, e-mailverificatie, sessiebeheer, KYC, checkout, uitbetalingen, admin.

## Status fase 5 (geïmplementeerd)

Auth: `auth/2fa/verify`, `auth/verify-email`, `auth/verify-email/resend`, `auth/password/forgot`, `auth/password/reset`; `auth/login` geeft bij 2FA `{ mfaRequired, mfaToken }`. Me: `me/password`, `me/2fa/setup|enable|disable|recovery-codes`, `me/sessions` (GET), `me/sessions/:id` (DELETE). Regels: `accounts/:id/rules` + WS-event `rule.progress` (`{ breach, passed, rules[] }`) en `account.status` bij FAILED. Config: `config` (`{ devTools }`), dev-only `dev/example-funded-account`.

## Status fase 6 (geïmplementeerd)

Catalogus (publiek): `GET /products?type=INSTANT`, `GET /products/:id`, `POST /products/quote` (server-berekende prijs, 30 min geldig), `GET /products/quotes/:id`, `GET /public/payouts-feed` (leeg tot er echte uitbetalingen zijn). Checkout (ingelogd): `POST /checkout` (🔑 `Idempotency-Key`, `{ productId | quoteId, quantity 1–5, acceptTerms, locale }`; vereist geverifieerd e-mailadres), `GET /checkout`, `GET /checkout/:id`, `POST /checkout/:id/test-payment` (`{ outcome: succeeded | failed | cancelled }`, alleen fake provider). Funded-voortgang: `GET /accounts/:id/funding` (winstdeling, uitbetalingsvoorwaarden, scaling). Dev-only: `POST /dev/verify-email`. Nieuwe foutcodes: `EMAIL_NOT_VERIFIED`, `COUNTRY_RESTRICTED`, `QUOTE_EXPIRED`, `ACCOUNT_SIZE_INVALID`, `PRODUCT_TYPE_UNAVAILABLE`, `CHECKOUT_ITEM_INVALID`, `PAYMENT_PROVIDER_UNAVAILABLE`, `PURCHASE_NOT_FOUND`.

## Dashboard (na fase 6)

`GET /accounts/:id/performance?month=YYYY-MM` → `{ stats: { trades, wins, losses, winRateBps, profitFactorBps, avgWinMinor, avgLossMinor, expectancyMinor, bestTradeMinor, worstTradeMinor, … }, calendar: { month, days[{ date, pnlMinor, trades }], netMinor, greenDays, redDays, bestDayMinor, worstDayMinor } }`. Dev-only: `POST /dev/verify-email`.
`GET /accounts/:id/performance` geeft ook `bySymbol[]` en `byDirection[]` (LONG/SHORT). Notitieboek: `GET /journal?cursor&limit`, `POST /journal`, `PATCH /journal/:id`, `DELETE /journal/:id`. `AccountDto` bevat `createdAt`/`endedAt`.

## Platformfuncties (na fase 6)

Daily Points: `GET /points`, `POST /points/redeem` (🔑). Aanbiedingen: `GET /offers`; checkout accepteert `offerCode`. Profiel: `GET|PATCH /me/profile` (bijnaam, opt-in). `GET /leaderboard`. Competities: `GET /competitions`, `POST /competitions/:id/join`. Publiek: `GET /public/transparency`, `GET /public/certificates/:id`. Trade Copier: `GET /copier`, `POST /copier/links`, `PATCH|DELETE /copier/links/:id`. `GET /certificates`. Nieuwe foutcodes: `POINTS_INSUFFICIENT`, `OFFER_INVALID|USED|EXPIRED`, `NICKNAME_TAKEN|REQUIRED`, `COMPETITION_NOT_ACTIVE`, `COPIER_SAME_ACCOUNT`, `COPIER_CONFLICT`.

Website: `POST /public/leads` (publiek, 204; `{ name, email, company, website?, message?, volume?, locale, consent: true }`).
