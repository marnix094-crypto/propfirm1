/** Shared Socket.IO options: one path behind the /api prefix, CORS from env. */
export const WS_OPTIONS = {
  path: '/api/v1/ws',
  cors: {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
    credentials: true,
  },
  pingInterval: 20_000,
  pingTimeout: 20_000,
};
