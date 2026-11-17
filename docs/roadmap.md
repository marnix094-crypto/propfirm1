# Roadmap

| Fase | Inhoud | Opleverbewijs |
|---|---|---|
| 0 | Plan: repo-structuur, ERD, API-spec, CLAUDE.md | deze documenten |
| 1 | Monorepo, Docker Compose, CI, `tokens.css`, componentbibliotheek (Button, Card, GlassCard, Accordion, Slider, Stepper, Badge, Meter, Tabs, Modal, Toast, IconTile), thema-toggle | preview-pagina `/_design` + screenshots light/dark, CI groen |
| 2 | Landingspagina (9 secties) + animaties, NL/EN, nog zonder backend (MSW voor pricing/feed) | screenshots mobiel/desktop, Lighthouse, reduced-motion check |
| 3 | Prisma-schema + migraties, auth + 2FA, Binance-adapter, simulatie-engine | unit tests engine (coverage ≥ 90%), integratietests auth |
| 4 | Regelengine + realtime equity-controle, auto pass/fail, promotie | scenario- en property-tests |
| 5 | REST + WS, OpenAPI, gegenereerde client, registratie/login in frontend | contract-drift-check in CI |
| 6 | Dashboard + terminal op echte API/WS, live prijzen, orders | integratietest order-flow, reconnect-test |
| 7 | Challenge-voortgang, account-wissel, checkout (testmodus) | testbetaling end-to-end via webhook |
| 8 | Admin, audit log (+verify), risico-alerts | rolrechten-tests |
| 9 | KYC-hook, broker-mock, uitbetalingen, Playwright e2e, performance, a11y | e2e-suite, axe-rapport, Lighthouse |
