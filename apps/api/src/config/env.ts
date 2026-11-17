export interface AppConfig {
  port: number;
  corsOrigins: string[];
}

/** Validates env at boot; fails fast on bad config. Expanded in phase 3 (DB, Redis, secrets). */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const port = Number(env.API_PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid API_PORT: ${env.API_PORT}`);
  }
  const corsOrigins = (env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return { port, corsOrigins };
}
