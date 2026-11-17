# CLAUDE.md — BRAND platform

> Werkafspraken en projectgeheugen. Houd dit bestand bij na elke fase.
> "BRAND" is een placeholder voor de merknaam; nooit hardcoden buiten `apps/web/src/config/brand.ts` en de i18n-bestanden.

## Product

Prop trading platform + broker-app voor de EU-markt. Talen: **EN (standaard)**, NL, ES (taalprefix in URL, bv. `/en/…`, `/es/…`).

1. **Instant funding** — trader betaalt een fee en krijgt direct een **gesimuleerd** funded account met winstdeling (accountvaluta USD, fee in EUR). Alleen Instant wordt aangeboden; 1-step/2-step blijven technisch mogelijk in engine/datamodel maar zijn niet actief. De UI zegt overal duidelijk dat accounts gesimuleerd zijn, tenzij er ooit echte kapitaalallocatie wordt ingebouwd.
2. **Eigen account = gratis demo** (besluit D31) — elke trader krijgt bij registratie een `DEMO`-account met $100.000 virtueel saldo (resetbaar). **Er gaat geen echt geld in of uit; wij houden nooit klantgeld vast.** Een echte broker-koppeling (`LIVE_BROKER`) blijft alleen als interface + mock voor later.

## Stack

- Monorepo met **pnpm workspaces**, Node 22 LTS, alles TypeScript (strict).
- `apps/web`: React + Vite, Tailwind (v4, CSS-first) + shadcn/ui, Framer Motion (`motion/react`), TradingView Lightweight Charts, TanStack Query, Zustand, React Router, react-i18next (locales als losse JSON per taal, lazy geladen).
- `apps/api`: NestJS, PostgreSQL via Prisma, Redis, WebSockets (Socket.IO + Redis-adapter), OpenAPI via `@nestjs/swagger`.
- `packages/shared`: gedeelde types, enums, foutcodes, WS-eventtypes, **gegenereerde API-client** (openapi-typescript + openapi-fetch).
- `packages/engine`: pure domeinlogica zonder IO (fixed-point rekenen, orders, posities, margin, PnL, spread/slippage, funding, challenge-regels). Deterministisch → volledig unit-testbaar.
- Docker Compose (postgres, redis, mailpit, api, web), GitHub Actions CI.
- Tests: Vitest (unit), Playwright (e2e). MSW alleen in development en tests.

## Harde regels

- **Geld = integers in minor units (cents)**, type `bigint` in engine/DB (`BigInt` in Prisma). Nooit `number`-floats voor geld. In de API: veldnamen eindigen op `Minor` (bv. `balanceMinor`) en worden als integer-**string** verstuurd.
- **Prijzen en hoeveelheden** = fixed-point integers met per-instrument `priceDecimals` / `qtyDecimals`. In de API als decimale string (`"67012.35"`), nooit float.
- **Percentages** = basispunten (int), bv. 10% = `1000` bps.
- **Afronding**: één centrale functie in `packages/engine/money`, half-even (banker's rounding), behalve waar expliciet anders gedocumenteerd.
- **Idempotentie**: elke muterende order/betaal-call vereist `Idempotency-Key`-header; orders hebben daarnaast een unieke `clientOrderId` per account.
- **Single writer per account**: mutaties op een account in één DB-transactie met `SELECT … FOR UPDATE` op de account-rij.
- **Audit log is onveranderlijk**: alleen INSERT (DB-trigger blokkeert UPDATE/DELETE), hash-keten (`prevHash` → `hash`). Elke order, fill, regelovertreding, statuswijziging en adminactie wordt gelogd.
- **Rule sets zijn onveranderlijk en geversioneerd**: een account blijft op de regelversie waarmee het gekocht is.
- **GDPR**: PII alleen in `UserProfile` (veldversleuteling AES-256-GCM, sleutel uit env). Audit log bevat geen PII, alleen ids. Verwijderverzoek = pseudonimiseren met behoud van wettelijk verplichte financiële gegevens. Hosting in de EU.
- **Secrets alleen in env-bestanden** (`.env`, nooit gecommit); elke app heeft een `.env.example`. Config wordt bij boot gevalideerd.
- **Frontend praat uitsluitend met de echte API + WS.** MSW-handlers alleen achter `import.meta.env.DEV`/test-flag.
- **Loading-, lege- en foutstaten** op elk scherm. Globale "Verbinding verbroken"-banner met automatische reconnect (exponential backoff) en resync via snapshot.
- **Social proof**: notificaties als "uitbetaling ontvangen" alleen uit echte, geanonimiseerde data (`/public/payouts-feed`) of zichtbaar gelabeld als "Voorbeeld".
- **Geen claims over gegarandeerde winst.** Risk disclaimers zichtbaar in footer, checkout en terminal.
- **Toegankelijkheid**: WCAG 2.2 AA contrast, volledige toetsenbordbediening, zichtbare focus, `prefers-reduced-motion` gerespecteerd. Mobile-first.
- Partners-strook: alleen echte partners; verborgen zolang er geen zijn.
- Marktdata: adapter-interface; `MARKET_DATA_SOURCE=binance` (USDⓈ-M) of `simulated` (dev/CI). Binance weigert verbindingen uit geblokkeerde regio's (o.a. deze cloud-omgeving) — bron voor productie nog te bevestigen (D33). Daily reset 00:00 Europe/Amsterdam. Netting-posities.
- Landenrestricties: configureerbare blocklist (EU-sancties + FATF), gecontroleerd bij registratie, checkout en uitbetaling.
- KYC pas bij promotie naar funded en bij uitbetaling.

## Design system (lichtblauw, premium broker-look)

Alle kleuren als CSS-variabelen in **één** bestand: `apps/web/src/styles/tokens.css`. Componenten gebruiken nooit hex-waarden direct.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F4F9FE` + radiale gradient `#E6F3FD` | `#07111F` |
| `--card` | `#FFFFFF` | `#0D1B2E` |
| `--border` | `#DCEBF7` | `#17304D` |
| `--primary` | `#0EA5E9` | `#38BDF8` |
| `--primary-light` | `#38BDF8` | `#38BDF8` |
| `--primary-tint` | `#BAE6FD` | (afgeleid, lage opacity) |
| `--accent-deep` | `#2563EB` | `#22D3EE` |
| `--text` | `#0B2540` | `#E6F1FB` |
| `--text-muted` | `#56718A` (spec #5B7690, iets donkerder voor AA) | `#8FA9C4` |
| `--glow-aqua` | `#22D3EE` (alleen gradients/glows) | idem |
| `--glow-lavender` | `#A5B4FC` (alleen gradients/glows) | idem |
| `--profit` | `#16A34A` grafieken; cijfers `--profit-text` `#15803D` | `#4ADE80` |
| `--loss` | `#DC2626` (alleen PnL/getallen) | lichtere variant voor AA |
| `--meter-safe` / `--meter-warn` / `--meter-breach` | `#0284C7` / `#CA8A04` / `#DC2626` | `#38BDF8` / `#FACC15` / `#F87171` |
| `--badge-*-fg` | donkere tekst op status-tint (AA) | `#4ADE80` / `#FACC15` / `#F87171` |

- Primaire knop: gradient `#38BDF8 → #0EA5E9`, **marineblauwe tekst** (`#0B2540`, besluit D23 i.v.m. AA), radius 12–14px, blauwe glow bij hover. Secundair: wit met blauwe rand.
- Font **Inter**; grote koppen met tekstgradient (marineblauw → hemelblauw); `font-variant-numeric: tabular-nums` voor alle cijfers.
- Kaarten radius 28px, zachte blauwe schaduw; glass-kaarten met `backdrop-blur`; outline-iconen in afgeronde vierkantjes.
- Thema-toggle in de header, zachte crossfade bij wissel; light = standaard.
- Animaties: scroll-reveal (fade + slide-up, stagger), count-up getallen, zelftekenende grafieklijnen, hover-lift, zwevende notificatiekaart, vloeiende accordion/slider. Alleen `transform`/`opacity` animeren (60fps, geen layout shift). `prefers-reduced-motion` → animaties uit.

## Commando's

- `pnpm install` · `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm e2e`
- Docker: `cp .env.example .env` → `docker compose up` (postgres, redis, mailpit :8025, api :3000, web :5173)
- Landing: `/{en|nl|es}` · design-preview: `/{en|nl|es}/design` · placeholders: `/login`, `/register`, `/legal/:doc`
- API lokaal: Postgres 16 + Redis 7, `apps/api/.env` (zie `.env.example`), `pnpm --filter './packages/*' build`, `pnpm --filter @brand/api db:migrate`, `pnpm --filter @brand/api dev`. Docs: `/api/docs`, spec: `/api/v1/openapi.json`.
- OpenAPI-export: `pnpm --filter @brand/api build && pnpm --filter @brand/api openapi:export` → `packages/shared/openapi.json` (CI faalt bij drift).
- API-tests draaien tegen een verse `<db>_test`-database (globalSetup); audit log blokkeert TRUNCATE.
- Workspace-packages gebruiken `.js`-extensies in relatieve imports (NodeNext); `dist` wordt gebouwd voor de API, Vite/Vitest lezen `src` via de `source`-conditie.
- MSW: alleen met `VITE_ENABLE_MSW=true` (dev/test). Productiebuilds bevatten geen mock-code of service worker; een zichtbare "Mock data (dev)"-pil verschijnt zodra mocks actief zijn.
- Repo: https://github.com/marnix094-crypto/propfirm1 (branch `main`, CI via GitHub Actions)
- Workspace-pakketten worden als TS-bron geconsumeerd via de `source` export-conditie.
- Contrast wordt bewaakt door `apps/web/src/styles/tokens.test.ts` en axe in Playwright.

## Code-afspraken

- Code, identifiers en commentaar in het **Engels**; documentatie NL; UI-teksten EN (standaard) + NL + ES. Geen hardcoded UI-strings: alles via i18n.
- Formatting via `Intl` met locale (`nl-NL`: `€ 1.234,56`).
- ESLint + Prettier, Conventional Commits.
- API: REST onder `/api/v1`, fouten als RFC 9457 `application/problem+json` met stabiele `code` (vertaald in de client). Cursor-paginatie.
- Elke NestJS-module: controller → service → repository (Prisma). Domeinberekeningen alleen in `packages/engine`.
- Nieuwe adapters (marktdata, broker, betaling, KYC, uitbetaling) implementeren altijd een interface + hebben een mock/fake voor tests.

## Werkwijze

- Werk in fases, strikt in volgorde. Na elke fase: samenvatting, wat getest is, open vragen → **wachten op "ga door"**.
- Bij onduidelijkheid: vragen stellen, geen aannames.
- Ontwerpdocumenten: `docs/architecture.md`, `docs/datamodel.md`, `docs/api.md`, `docs/roadmap.md`, besluiten in `docs/decisions.md`.

## Status

- [x] Fase 0 — Plan
- [x] Fase 1 — Monorepo, Docker, CI, tokens + componentbibliotheek
- [x] Fase 2 — Landingspagina
- [x] Fase 3 — Backend-slice: DB, auth (zonder 2FA), marktdata (Binance + simulated), engine, trading-API, WebSockets, OpenAPI (wacht op akkoord)
- [ ] Fase 4 — Platform-UI op de echte API: app-shell (mobiel bottom-nav), portfolio/dashboard, trading terminal, login/registratie, account-wissel
- [ ] Fase 5 — 2FA, e-mailverificatie, gegenereerde API-client, regelengine (daily loss/drawdown, pass/fail) + realtime equity-controle
- [ ] Fase 6 — Funded-accounts (instant funding) + challenge-voortgang
- [ ] Fase 7 — Pricing-checkout (betaalprovider), facturen
- [ ] Fase 8 — Admin, audit log, risico-alerts
- [ ] Fase 9 — KYC, broker-mock, uitbetalingen, e2e, performance, a11y
