# CLAUDE.md — BRAND platform

> Werkafspraken en projectgeheugen. Houd dit bestand bij na elke fase.
> Merknaam: **Daily Funded** (besluit D57). Alleen in `apps/web/src/config/brand.ts`, `apps/api/src/config/brand.ts` en de logo-component; nergens anders hardcoden.

## Product

**Daily Funded is een white-label softwareplatform voor prop firms (B2B, besluit D74).** Wij zijn zelf géén prop firm: andere bedrijven draaien hun eigen merk op onze software. De website (`/{lang}`) verkoopt het platform; `/{lang}/storefront` is een voorbeeld-prop-firm ("Your Firm") die laat zien wat traders van een klant zien.

**Multi-tenant (D83):** elke klant is een `Firm` met eigen traders, producten, regelversies, huisstijl (naam, kleur, logo, domein) en een **adminpanel** op `/{lang}/admin`. Alleen de admin van die firma (één, aangemaakt door Daily Funded) en Daily Funded zelf (superadmin) komen erin, via de aparte partner-login `/{lang}/admin/login` (D91). Het adminpanel is nooit bereikbaar of gelinkt vanuit het klantdashboard; de admin stelt daar het klantdashboard samen (huisstijl, producten/regels, modules aan/uit, D92).

Functionaliteit van het platform (zoals een klant-prop-firm het inzet): prop trading platform + broker-app voor de EU-markt. Talen: **EN (standaard)**, NL, ES (taalprefix in URL, bv. `/en/…`, `/es/…`).

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
- **Tenant-isolatie (D83–D85):** elke query op firmadata is gescoped op `firmId` (via de gebruiker of `AdminGuard`-context); nooit een firma uit de request vertrouwen voor geauthenticeerde data. `X-Firm`/domein bepaalt alleen waar iemand registreert/inlogt en welke catalogus publiek zichtbaar is. Isolatie wordt getest in `apps/api/test/admin.e2e.test.ts`.
- Landenrestricties: configureerbare blocklist (EU-sancties + FATF), gecontroleerd bij registratie, checkout en uitbetaling.
- KYC pas bij promotie naar funded en bij uitbetaling.

## Design system

**Platform (`/{lang}/app…`) + login/registratie — Daily Funded licht + lime (D79, vervangt donker uit D58):** alleen licht, geen thema-toggle (`stores/theme.ts` `LIGHT_ONLY`; pre-paint-script in `index.html` zet platform/auth-routes op licht). Tokens in `:root[data-surface='platform'][data-theme='light']` (`tokens.css`); `AppLayout` en `AuthLayout` zetten `data-surface="platform"`. Stijl naar referentiedashboard: grijsgroene achtergrond, witte kaarten radius 20px met zachte schaduw, pil-knoppen/-tabs, velden radius 12px, `--card-highlight` (lime glans) voor de profielkaart; in het platform **Inter vet** voor titels en kerncijfers (geen Unbounded, D82). Logo-lime `#AFE604` (`--brand-lime`) alleen als vlak/accent; tekst-accent donker olijf (`--accent-deep`). Logo = `components/layout/logo.tsx`. Shell: inklapbare zijbalk (`df-sidebar-collapsed`), topbalk met paginatitel + breadcrumb, accountwisselaar, "Nieuw account"-pil, gebruikerschip. Dashboard (D81, `features/portfolio/portfolio-page.tsx` + `dashboard-widgets.tsx`): kapitaal · scaling-doel · volgende uitbetaling; equity-grafiek + profielkaart (win rate, resultaat per maand); P&L-kalender (`GET /accounts/:id/performance?month=`), posities, regels, winstdeling. Zijmenu-config in `features/app/nav.ts`; alle menu-items zijn werkende pagina's; API-modules `rewards`, `community`, `copier`, `certificates`. Website-knop "Live demo" → `/{lang}/login` (D80).

**Website & site-pagina's:** dezelfde huisstijl zwart + lime (D75; de lichtblauwe stijl is vervallen), donker standaard (`brand-theme`), display-font **Unbounded** voor koppen (`--font-display`), animaties met `motion/react` (woord-reveal, zelftekenende grafiek, tilt, marquee, scroll-voortgang), alles uit bij `prefers-reduced-motion`. Website-componenten in `features/site/`; demo-aanvragen via `POST /public/leads` (versleuteld opgeslagen). Onderstaande tabel beschrijft de oorspronkelijke (vervallen) lichtblauwe stijl, alleen ter historie:

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
- App: `/{lang}/app/portfolio|trade/:symbol|more`, auth: `/{lang}/login|register`. Access token alleen in geheugen; refresh via httpOnly-cookie (`stores/session.ts`).
- Frontend-API: gegenereerde types (`@brand/shared/api`, `pnpm --filter @brand/shared generate:api`) + `openapi-fetch` via `lib/api-client.ts` (`call()` ververst de sessie bij 401). Realtime: `lib/realtime.ts` (Socket.IO, resync via `seq`).
- Regels: `packages/engine/src/rules/rule-engine.ts` (puur). Regelsets als catalogus in `apps/api/src/modules/rules/catalog.ts`; rijen zijn onveranderlijk (DB-trigger) → nieuwe versie toevoegen i.p.v. wijzigen. Realtime evaluatie in `AccountStateService` (elke tick + na elke fill); overtreding → `TradingService.failAccount` (posities sluiten tegen markt, orders annuleren, FAILED, `RuleViolation`, audit).
- Nieuwe env: `FIELD_ENCRYPTION_KEY` (32 bytes base64, versleutelt 2FA-secrets — back-up nodig), `APP_BASE_URL` (links in e-mails), `SMTP_URL` (Mailpit in dev; zonder → mails in API-log), `MAIL_FROM`, `DEV_TOOLS_ENABLED` (alleen dev; verboden in productie).
- Dev-hulpmiddel: in de accountwisselaar "Voorbeeld funded account aanmaken (dev)" en in de e-mailbanner "Nu verifiëren (dev)" (alleen met `DEV_TOOLS_ENABLED=true`).
- Aankoop: `apps/api/src/modules/commerce` (producten, offertes, checkout, `PaymentProvider` + `FakePaymentProvider`). `PAYMENT_PROVIDER=fake` (verboden in productie) → testbetaalpagina `/{lang}/app/checkout/:id/pay`. Funded-economie (winstdeling, uitbetaling, scaling) puur in `packages/engine/src/funding`; voorbeeldwaarden in regelset `INSTANT_EXAMPLE v2`.
- Website-screenshots (D96): `pnpm --filter @brand/web screens` (bouwt demo, legt dashboard/terminal/stats/mobiel/admin + vier voorbeeldmerken vast → `apps/web/src/assets/site/*.webp`; `--no-build` slaat de build over). Opnieuw draaien na UI-wijzigingen in het dashboard.
- Demo-preview (claude.ai Artifact): `pnpm --filter @brand/web build:demo` → `dist-demo` (in-browser backend `src/demo/`, alleen met `VITE_DEMO_MODE=true`).
- E2E draait tegen de echte API (Playwright start API + preview); vereist Postgres + Redis.
- Landing: `/{en|nl|es}` · design-preview: `/{en|nl|es}/design` · placeholders: `/login`, `/register`, `/legal/:doc`
- API lokaal: Postgres 16 + Redis 7, `apps/api/.env` (zie `.env.example`), `pnpm --filter './packages/*' build`, `pnpm --filter @brand/api db:migrate`, `pnpm --filter @brand/api dev`. Docs: `/api/docs`, spec: `/api/v1/openapi.json`.
- OpenAPI-export: `pnpm --filter @brand/api build && pnpm --filter @brand/api openapi:export` → `packages/shared/openapi.json` (CI faalt bij drift).
- API-tests draaien tegen een verse `<db>_test`-database (globalSetup); audit log blokkeert TRUNCATE.
- Workspace-packages gebruiken `.js`-extensies in relatieve imports (NodeNext); `dist` wordt gebouwd voor de API, Vite/Vitest lezen `src` via de `source`-conditie.
- MSW: alleen met `VITE_ENABLE_MSW=true` (dev/test). Productiebuilds bevatten geen mock-code of service worker; een zichtbare "Mock data (dev)"-pil verschijnt zodra mocks actief zijn.
- Repo: https://github.com/marnix094-crypto/propfirm1 (branch `main`, CI via GitHub Actions)
- Workspace-pakketten worden als TS-bron geconsumeerd via de `source` export-conditie.
- Adminpanel: API `apps/api/src/modules/admin` (`AdminGuard`: alleen firma-admin (OWNER) of superadmin + 2FA + firmakeuze superadmin), firma-resolutie + `ModuleGuard` (`@RequiresModule`) in `modules/firms`, risicomeldingen `modules/risk`. Modules-lijst gedeeld: `@brand/shared` `CLIENT_MODULES`. Superadmin aanmaken: `pnpm --filter @brand/api build && pnpm --filter @brand/api superadmin:create <email>` (print link om wachtwoord in te stellen). Web: `features/admin/*`, hooks `hooks/use-admin.ts`, huisstijl `components/layout/firm-brand.tsx` + `lib/brand-color.ts` (AA-palet). Nieuwe env: `DEFAULT_FIRM_SLUG` (standaard `daily-funded`), `ADMIN_REQUIRE_2FA` (alleen `false` in dev/e2e). Lokaal/e2e: `POST /dev/staff` (alleen `DEV_TOOLS_ENABLED`) maakt een firma + admin met wachtwoord; preview-admin: `admin@dailyfunded.demo` / `demo-admin-2026` (alleen in preview-builds). Preview van een andere firma: `?firm=slug` (of `VITE_FIRM_SLUG`).
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
- [x] Fase 3 — Backend-slice: DB, auth (zonder 2FA), marktdata (Binance + simulated), engine, trading-API, WebSockets, OpenAPI
- [x] Fase 4 — Platform-UI op de echte API: app-shell (mobiel bottom-nav), portfolio/dashboard, trading terminal, login/registratie, account-wissel
- [x] Fase 5 — 2FA (TOTP + herstelcodes), e-mailverificatie, wachtwoord-reset, sessiebeheer, regelengine (daily loss/drawdown, targets) + realtime equity-controle met automatische FAILED (wacht op akkoord)
- [x] Fase 6 — Funded-accounts (instant funding): catalogus, checkout met testbetaling, accounts na betaling, winstdeling/uitbetaalbaarheid/scaling-voortgang (wacht op akkoord)
- [ ] Fase 7 — Pricing-checkout (betaalprovider), facturen (na fase 8, D90)
- [x] Fase 8 — Multi-tenant firma's, gescheiden adminpanel voor firma-admins + Daily Funded (overzicht, traders, accounts, producten, regelsets, klantdashboard samenstellen, huisstijl, risicomeldingen, audit log, beveiliging, firma's), white-label huisstijl (wacht op akkoord)
- [ ] Fase 9 — KYC, broker-mock, uitbetalingen, e2e, performance, a11y
