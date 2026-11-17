# Besluiten (ADR-light)

| # | Besluit | Status |
|---|---|---|
| D1 | Geld als `bigint` minor units; prijs/qty fixed-point per instrument; percentages in bps; half-even afronding | voorgesteld |
| D2 | Domeinlogica in `packages/engine` (pure TS, geen IO) | voorgesteld (Q1) |
| D3 | Code-first OpenAPI (NestJS) → openapi-typescript client | voorgesteld |
| D4 | Socket.IO (rooms, reconnect, Redis-adapter) i.p.v. kale `ws` | voorgesteld |
| D5 | Rule sets onveranderlijk + geversioneerd; account pint versie | voorgesteld |
| D6 | Audit log append-only met hash-keten en DB-trigger | voorgesteld |
| D7 | Netting-posities (één per instrument per account) | open (Q4) |
| D8 | Orders alleen via REST (idempotent), WS alleen voor push | voorgesteld |
