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
| D17 | i18n met taalprefix in URL, meerdere talen (NL standaard, EN, ES, uitbreidbaar) | besloten (Q15), talenlijst open |
| D18 | Accountvaluta | open — zie vraag A |
| D19 | Producttypes in pricing | open — zie vraag B |
