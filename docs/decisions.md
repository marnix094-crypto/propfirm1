# Besluiten (ADR-light)

| # | Besluit | Status |
|---|---|---|
| D1 | Geld als `bigint` minor units; prijs/qty fixed-point per instrument; percentages in bps; half-even afronding | besloten |
| D2 | Domeinlogica in `packages/engine` (pure TS, geen IO) | besloten (Q1) |
| D3 | Code-first OpenAPI (NestJS) → openapi-typescript client | besloten |
| D4 | Socket.IO (rooms, reconnect, Redis-adapter) i.p.v. kale `ws` | besloten |
| D5 | Rule sets onveranderlijk + geversioneerd; account pint versie | besloten |
| D6 | Audit log append-only met hash-keten en DB-trigger | besloten |
| D7 | Netting-posities (één per instrument per account) | besloten (Q4) |
| D8 | Orders alleen via REST (idempotent), WS alleen voor push | besloten |
| D9 | Marktdata: Binance **USDⓈ-M futures** publieke streams (`bookTicker`, `markPrice@1s` incl. funding, `kline_*`) | besloten (Q3) |
| D10 | Dagelijkse reset 00:00 **Europe/Amsterdam** (DST-bewust). Standaard daily loss: % van initiële balans, referentie = max(balans, equity) bij dagstart — instelbaar per rule set | besloten (Q5, basis = standaard voorstel) |
| D11 | Betaalprovider later: `PaymentProvider`-interface + mock tot keuze | besloten (Q6) |
| D12 | BTW/OSS later; prijzen nu excl. btw-logica, factuurmodel houdt `vatMinor` vrij | besloten (Q7) |
| D13 | Landenrestricties via configureerbare blocklist, gezaaid uit EU-sanctielijst + FATF "call for action" + "increased monitoring"; check bij registratie, checkout en uitbetaling; door jurist te bevestigen | besloten (Q8) |
| D14 | KYC pas bij promotie naar funded en bij uitbetaling | besloten (Q9) |
| D15 | Custom account = configurator met server-side berekende prijs (`POST /products/quote`) | besloten (Q12) |
| D16 | Partners-strook: alleen echte partners (logo's/namen aan te leveren) | besloten (Q14) |
| D17 | i18n met taalprefix in URL; talen **EN (standaard)**, NL, ES | besloten (Q15, C) |
| D18 | Accountvaluta **USD** (USDT = USD 1:1 in simulatie); challenge-fee in EUR | besloten (A) |
| D19 | Alleen **Instant funding** in aanbod en pricing (geen 1-step/2-step tabs). Engine en datamodel blijven generiek (ONE_STEP/TWO_STEP enum blijft bestaan, niet actief). Accountgroottes/prijzen: gelabelde voorbeeldwaarden tot aangeleverd | besloten (B) |
| D20 | Partners later aanleveren; strook verborgen tot er echte partners zijn | besloten (D) |
| D21 | `--meter-safe` light = #0284C7 (i.p.v. #0EA5E9, 2,8:1) zodat de meter-vulling 3:1 haalt | besloten (fase 1) |
| D22 | `--profit-text` #15803D voor cijfers (spec #16A34A haalt 3,3:1); #16A34A blijft voor grafieken | besloten (fase 1) |
| D23 | Primaire knop: zelfde gradient, marineblauwe tekst #0B2540 (5,6–7,3:1) | besloten (fase 2) |
| D24 | `--text-muted` → #56718A (AA op `--bg`) | besloten (fase 2) |
| D25 | Inter self-hosted via @fontsource (geen Google Fonts i.v.m. GDPR) | besloten |
| D26 | MSW opt-in via `VITE_ENABLE_MSW=true` (dev/test); productiebuild strip mock-chunk en service worker | besloten |
| D27 | Status-badges krijgen eigen teksttokens (`--badge-success/warn/danger-fg`) voor AA op hun tint | besloten |
| D28 | Payout-notificatie toont alleen echte data uit `/public/payouts-feed`; leeg → kaart met label "Voorbeeld" | besloten |
| D29 | Pricing: alleen Instant, 3 kaarten per rij; custom configurator haalt prijs van `POST /products/quote` | besloten |
| D30 | Risk disclosure en FAQ-teksten zijn concepten — juridische review vereist vóór livegang | open (jurist) |
| D31 | "Eigen geld" = gratis demo-account met virtueel saldo ($100k, resetbaar); geen stortingen/opnames; `LIVE_BROKER` blijft alleen interface | besloten (fase 3) |
| D32 | Markten: eerst crypto (Binance USDⓈ-M); aandelen/indices/goud later via betaalde feed | besloten |
| D33 | Binance blokkeert o.a. de cloud-regio en Nederlandse gebruikers; productiebron (Binance vanaf EU-server, of alternatief zoals Coinbase/Kraken/Bitvavo/Hyperliquid/Kaiko) + datalicentie nog kiezen | open |
| D34 | Volgorde: verticale slice — backend (fase 3) daarna platform-UI (fase 4); 2FA + regelengine schuiven naar fase 5 | besloten |
| D35 | Instrumentcatalogus in code (`instruments.ts`), bij boot ge-upsert — precisie en kosten versioneren met de code | besloten |
| D36 | Executie: market/stop op touch + ½ spread-markup + size-afhankelijke slippage, adverse tick-afronding; limit op limiet of beter zonder slippage; margin opnieuw gecheckt bij fill | besloten |
| D37 | Funding: echte rate uit de feed, afgerekend per interval, idempotent per (positie, tijdstip) + Redis-lock | besloten |
| D38 | Rate limiting voorlopig in-memory per instance; Redis-storage bij horizontaal schalen | besloten |
| D39 | Frontend-API-client = gegenereerde types uit OpenAPI + `openapi-fetch`; CI faalt bij drift van spec of types | besloten (fase 4) |
| D40 | Access token alleen in geheugen, stille refresh via httpOnly-cookie bij boot en 60 s vóór verloop; `?next=` alleen naar `/{lang}/app…` (open-redirect-bescherming) | besloten |
| D41 | App-structuur geïnspireerd op de aangeleverde screenshots (bottom-nav Portfolio/Trade/Meer, account-wisselaar, marktenlijst met favorieten, order-sheet) in eigen design — geen kopie van andermans merk/teksten | besloten |
| D42 | Geen "Book/Trades"-tab: we hebben geen echte orderboek-/tradedata; i.p.v. nep-data een Info-tab met contractspecificaties en funding | besloten |
| D43 | Koop/verkoop-knoppen eigen tokens (`--buy-bg`, `--sell-bg`) voor AA in beide thema's | besloten |
| D44 | Favorieten server-side (`/me/watchlist`); actieve account-keuze per apparaat (localStorage, alleen gemak) | besloten |
| D45 | Regelset `INSTANT_EXAMPLE v1` met VOORBEELDwaarden (3% daily loss van initieel t.o.v. max(dagstart-balans, -equity); 6% trailing equity-drawdown die stopt op de startbalans; 80% winstdeling; 1:50) — te vervangen door het echte aanbod via een nieuwe versie | besloten (fase 5), waarden open |
| D46 | Overtreding = equity ≤ grens (inclusief). Afhandeling: alle posities direct tegen markt sluiten (`SYSTEM_BREACH`), open orders annuleren, account `FAILED`, `RuleViolation` + audit. Precies één keer per account (guard + statuscheck in transactie) | besloten |
| D47 | High-water mark in geheugen per tick, elke 15 s persistent; dagwissel 00:00 Europe/Amsterdam zet dagstart-balans/equity; handelsdag telt bij ≥ 1 fill | besloten |
| D48 | 2FA: TOTP (RFC 6238, SHA-1, 6 cijfers, ±1 stap, replay-bescherming), secret AES-256-GCM versleuteld, 10 gehashte herstelcodes; uitschakelen vereist wachtwoord + code; inloggen in twee stappen met een 5-min MFA-token | besloten |
| D49 | E-mailtokens: eenmalig, gehasht, verifiëren 24 u / reset 1 u; "wachtwoord vergeten" verraadt nooit of een e-mail bestaat; reset en wachtwoordwijziging loggen andere sessies uit | besloten |
| D50 | E-mailverificatie blokkeert demo-handel niet (banner); vereist vóór checkout/uitbetaling (fase 6–7) | besloten |
| D51 | Uitbetaling & scaling (VOORBEELDwaarden, regelset `INSTANT_EXAMPLE v2`, `_DD400`/`_DD800` voor de configurator): uitbetalen na 14 dagen per cyclus, ≥ 3 handelsdagen in de cyclus, trader-aandeel ≥ $50, geen open posities, KYC vóór eerste uitbetaling; scaling +25% na 10% winst én 2 uitbetalingen, max $400K. Alleen gesloten balans telt (geen open PnL) | besloten (waarden voorlopig) |
| D52 | Aankoop in fase 6 via `PaymentProvider`-interface met **fake provider** (testbetaling op eigen pagina, geen geld); echte PSP + gesigneerde webhook in fase 7. `PAYMENT_PROVIDER=fake` is verboden in productie | besloten |
| D53 | Checkout: `Idempotency-Key` verplicht (advisory lock per gebruiker+key), vereist geverifieerd e-mailadres, actieve gebruiker en niet-geblokkeerd land; prijs/grootte/regelversie worden in `Purchase` vastgelegd; maximaal 5 accounts per aankoop | besloten |
| D54 | Betaalgebeurtenissen worden precies één keer verwerkt (uniek per provider+eventId, purchase-rij `FOR UPDATE`); accounts worden in dezelfde transactie als `PAID → FULFILLED` aangemaakt; late of dubbele events veranderen niets | besloten |
| D55 | KYC pas vóór de eerste uitbetaling (fase 9), niet bij aankoop (Q-fase 6) | besloten |
| D56 | Productcatalogus in code (`products.catalog.ts`), bij boot aangemaakt als de slug ontbreekt; bestaande rijen worden niet overschreven (later admin-beheer). Configurator-offertes (`PriceQuote`) verlopen na 30 min | besloten |
