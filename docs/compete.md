# Compete — dagelijkse tradingcompetitie (tweede product)

> Besluiten D97–D102. Dit product staat volledig los van de prop-firm-software (white label + adminpanel).

## Wat het is

Een white-label product voor klanten ("operators"): elke dag één competitie waaraan iedereen kan meedoen.
Speler meldt zich aan, betaalt de inleg en tradet één uur met een virtueel account tegen andere spelers.
Na het uur winnen de 3 spelers met het hoogste rendement samen 80% van de prijzenpot.

| Regel | Standaard (per operator instelbaar, per ronde vastgelegd) |
|---|---|
| Ronde | 1 per dag, 20:00–21:00 Europe/Amsterdam |
| Inleg | $10 (echt geld — nu alleen testbetalingen, D101) |
| Startsaldo | $100.000 virtueel |
| Hefboom | 1:100, alleen market orders, crypto-instrumenten uit de marktdata |
| Drawdown | statisch 10%: equity ≤ $90.000 → posities dicht, entry eindigt, resultaat telt |
| Meedoen | max. 1 entry per speler per ronde; elke dag opnieuw mag |
| Minimum | 50 betaalde deelnemers bij de start, anders annuleren + volledige terugbetaling |
| Prijzen | 80% van de pot: #1 50%, #2 30%, #3 20% (= 40/24/16% van de pot); 20% + restcenten naar de operator |
| Gelijke stand | eerder betaald wint |

## Architectuur (fase C1)

- **Engine** `packages/engine/src/compete`: pure functies (`validateCompeteParams`, `competeFloorMinor`,
  `rankStandings`, `prizeBreakdown`, `settleRound`, `roundStartMs` DST-veilig). Volledig unit-getest.
- **API** `apps/api/src/modules/compete` (importeert alleen `MarketDataModule`):
  - `operators.service.ts` — tenant-resolutie (`X-Compete-Operator` → domein → standaard `your-arena`).
  - `compete-auth.ts` + `players.service.ts` — eigen spelers, sessies en tokens (`purpose: compete`).
  - `compete.service.ts` — rondes (OPEN → LIVE/CANCELLED → SETTLED), inschrijving + betaling, trading
    (lock per entry: `SELECT … FOR UPDATE`), drawdown, afrekening, ranglijst.
  - `compete.scheduler.ts` — elke 5 s rondes starten/afrekenen/aanmaken, elke seconde drawdown-sweep
    (`COMPETE_LOOP_ENABLED`). Redis-lock zodat één instantie tikt.
  - `compete.gateway.ts` — Socket.IO-namespace `/compete`: `subscribe {roundId}`, `leaderboard` (elke 2 s
    tijdens de ronde), `round.update`, `entry.update`.
  - `payments.ts` — `CompetePaymentProvider` + fake (inleg, refund). Prijzen → `AWAITING_PAYOUT`.
  - `compete-audit.service.ts` — eigen hash-keten `CompeteAuditLog`.
  - `compete-dev.controller.ts` — alleen met `DEV_TOOLS_ENABLED`: ronde over N seconden, tick, bots.
- **Tabellen**: `CompeteOperator`, `CompetePlayer`, `CompeteSession`, `CompeteRound`, `CompeteEntry`,
  `CompetePosition`, `CompeteOrder` (append-only), `CompetePayment`, `CompeteAuditLog` (append-only).
  Geen relaties naar prop-firm-tabellen; alleen `Instrument` (gedeelde catalogus).

## API (`/api/v1/compete`)

| Route | Wie | Doel |
|---|---|---|
| `GET operator` | publiek | merk + spelregels van de operator |
| `GET rounds/current`, `rounds/recent`, `rounds/:id/leaderboard` | publiek | huidige/afgelopen rondes, ranglijst |
| `POST auth/register\|login\|refresh\|logout` | publiek | spelersaccount (18+ bevestigen, unieke nickname) |
| `GET me`, `me/round`, `me/history`, `me/rounds/:id`, `me/rounds/:id/leaderboard` | speler | eigen gegevens |
| `POST rounds/:id/entries` | speler | inschrijven → `paymentUrl` (Idempotency-Key) |
| `POST entries/:id/test-payment` | speler | testbetaling (alleen fake provider) |
| `GET entries/:id`, `entries/:id/orders` | speler | saldo, equity, posities, orders |
| `POST entries/:id/orders`, `entries/:id/positions/:symbol/close` | speler | market order / positie sluiten |

## Frontend (fase C2, D103)

Op de Daily Funded-website, strikt gescheiden in `apps/web/src/features/compete/`:

| Route | Inhoud |
|---|---|
| `/{lang}/compete` | home van de voorbeeld-operator: aftelklok, pot, spelregels, prijzen (50/30/20), recente rondes |
| `/{lang}/compete/register`, `/login` | spelersaccount (18+, bijnaam), eigen sessie (`compete_rt`) |
| `/{lang}/compete/app` | dashboard: ronde + aftelklok, meedoen, live terminal (grafiek, market order, posities), verliesgrens-meter, live ranglijst (WS + polling), mijn rondes |
| `/{lang}/compete/pay/:entryId` | testbetaalpagina (fake provider) |

- `api.ts` (eigen openapi-fetch-client, header `X-Compete-Operator` via `?operator=slug` of `VITE_COMPETE_OPERATOR`),
  `session.ts`, `realtime.ts`, `hooks.ts`; teksten in `locales/*/compete.json`.
- Demo-preview: `src/demo/compete.ts` (rondes van 10 min, 57 fictieve `example_*`-spelers, knop "Start de ronde nu (demo)").
- E2E: `apps/web/e2e/compete.spec.ts` (eigen operator per test via `POST /compete/dev/operators`).

## Beheer en verkoop (fase C3, D104–D105)

- API `/api/v1/compete/admin/*` (`modules/compete/admin`): login (+ TOTP), refresh, wachtwoord via eenmalige link,
  2FA instellen, `overview`, `rounds`, `rounds/:id`, `players` (+ `suspend`/`reactivate`), `payouts` (+ `mark-paid`),
  `settings` (GET/PUT), `audit`; superadmin: `operators` (lijst/aanmaken/status/heruitnodigen).
- Web `/{lang}/compete/admin/*` (`features/compete/admin`, eigen client/sessie, namespace `competeAdmin`):
  login, setup, beveiliging (QR), overzicht met grafiek, rondes, spelers, uitbetalingen, instellingen, audit log, operators.
- Website: `/{lang}/products/compete` (`features/site/compete-product-page.tsx`), screenshots via `pnpm --filter @brand/web screens`.
- Tests: `apps/api/test/compete-admin.e2e.test.ts`, `apps/web/e2e/compete.spec.ts`.

## Koppelen aan de website van een klant (fase C4, D107–D110)

Een prop firm (operator) zet Compete onder het eigen merk naast de eigen website:

1. **Eigen (sub)domein** — automatisch `<slug>.<COMPETE_BASE_DOMAIN>` (wildcard-DNS + TLS via de edge). Eigen domein (bv. `competitie.firma.nl`) in het operatorpanel → *Integratie*: TXT `_dailyfunded-verify.<domein>` met het getoonde token + CNAME naar `PLATFORM_CNAME_TARGET`, daarna "DNS controleren". Pas dan routeert het domein (`/internal/route` → `{ product: 'compete', operator, frameAncestors }`, `/internal/tls/allow`). Op dat domein opent `/` direct de competitie.
2. **Widgets op de eigen site** — twee regels HTML:

   ```html
   <script src="https://<competitiedomein>/compete-embed.js" async></script>
   <div data-compete-widget="countdown|leaderboard|join" data-lang="nl" data-theme="dark"></div>
   ```

   Het script maakt een iframe naar `/{lang}/compete/widget/:kind` en past de hoogte aan (postMessage, alleen van het eigen origin). Alleen websites uit *Widgetwebsites* mogen insluiten: de edge zet `Content-Security-Policy: frame-ancestors <lijst>` voor widgetpaden; nginx zet `frame-ancestors 'self'` op alle andere pagina's.
3. **Single sign-on** — bestaande klanten van de firma hoeven geen tweede account: de server van de firma ondertekent per klik een kortlevend HS256-token en stuurt de trader naar `/{lang}/compete/sso#token=…`. Claims: `iss` = operator-slug, `aud` = `dailyfunded-compete-sso`, `sub` = eigen user-id, `jti`, `iat`, `exp` (≤ 5 min), `country` (ISO-2), `adult: true`, optioneel `nickname`, `email`, `locale`. Codevoorbeeld staat in het operatorpanel. Tokens zijn eenmalig (Redis), het geheim wordt één keer getoond.
4. **Logo + kleur** — logo (PNG/SVG/WebP/JPEG ≤ 200 kB) en huisstijlkleur kleuren het hele Compete-oppervlak en de widgets.

Bestaande prop-firm-klant ook Compete-operator maken (alleen huisstijl wordt gekopieerd):

```bash
pnpm --filter @brand/api build && pnpm --filter @brand/api compete:operator:from-firm <firma-slug> <eigenaar-email>
```

Lokaal testen van SSO: `POST /api/v1/compete/dev/sso-token` (alleen `DEV_TOOLS_ENABLED`) ondertekent een token zoals de server van een operator zou doen. Tests: `apps/api/test/compete-integration.e2e.test.ts`, `apps/web/e2e/compete.spec.ts`.

## Volgende fases

- **Later** — echte betaal- en uitbetaalprovider (na vergunning), KYC voor winnaars,
  verantwoord-spelen-limieten en e-mailnotificaties.

## Juridisch (open)

Betaalde inleg + prijzenpot = in de EU meestal kansspel. Echte betalingen pas na juridisch advies en een
vergunning bij de operator (bv. Ksa/MGA), met verantwoord-spelen-maatregelen (leeftijdscheck, limieten,
zelfuitsluiting — status `SELF_EXCLUDED` bestaat al in het datamodel).
