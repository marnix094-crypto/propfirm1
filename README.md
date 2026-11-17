# BRAND platform

Prop trading platform (instant funding, simulated accounts) + broker track. See `CLAUDE.md` and `docs/`.

```bash
pnpm install
pnpm dev            # web on :5173, api on :3000
pnpm test && pnpm e2e
```

Docker: `cp .env.example .env`, change the passwords, then `docker compose up`.
