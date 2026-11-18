/**
 * DEMO BACKEND — Compete product (D97). Emulates /api/v1/compete/* in the browser for the
 * shareable preview, with the real @brand/engine for execution, ranking and prizes.
 * Other players are clearly fictional "example players"; nothing leaves this browser.
 */
import {
  accountMetrics,
  applyFill,
  COMPETE_DEFAULTS as P,
  competeFloorMinor,
  fromDecimalString,
  isDrawdownBreached,
  marketExecution,
  prizeBreakdown,
  rankStandings,
  returnBps,
  settleRound,
  toDecimalString,
  TradingError,
  unrealizedPnlMinor,
  validateOrder,
  type PositionState,
  type Quote,
} from '@brand/engine';
import { bySymbol, type DemoMarket } from './market';

const STORE = 'brand-demo-compete-v1';
const uid = () => crypto.randomUUID();
const OPEN_MS = 3 * 60_000; // demo: next round opens 3 minutes ahead
const DURATION_MS = 10 * 60_000; // demo: 10-minute rounds
const EXAMPLE_PLAYERS = 57;

interface Player {
  id: string;
  email: string;
  password: string;
  nickname: string;
  country: string;
  locale: string;
}
interface Pos {
  symbol: string;
  state: PositionState;
}
interface Order {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: bigint;
  price: bigint;
  fee: bigint;
  pnl: bigint;
  reason: 'PLAYER' | 'DRAWDOWN' | 'ROUND_END';
  at: number;
}
interface Entry {
  id: string;
  roundId: string;
  playerId: string;
  status: 'PENDING_PAYMENT' | 'PAYMENT_FAILED' | 'ACTIVE' | 'BREACHED' | 'FINISHED' | 'REFUNDED';
  balance: bigint;
  positions: Pos[];
  orders: Order[];
  paidAt: number | null;
  final: bigint | null;
  rank: number | null;
  prize: bigint | null;
  endedAt: number | null;
}
interface Bot {
  nickname: string;
  joinAt: number;
  a: number;
  b: number;
  c: number;
  drift: number;
}
interface Round {
  id: string;
  startsAt: number;
  endsAt: number;
  status: 'OPEN' | 'LIVE' | 'SETTLED' | 'CANCELLED';
  bots: Bot[];
  pot: bigint | null;
  results: {
    nickname: string;
    equity: bigint;
    rank: number;
    prize: bigint;
    status: string;
    me: boolean;
  }[];
}
interface Settings {
  name: string;
  primaryColor: string;
  domain: string | null;
  timeZone: string;
  startMinuteOfDay: number;
  durationMinutes: number;
  entryFeeMinor: string;
  startBalanceMinor: string;
  leverage: number;
  maxDrawdownBps: number;
  minParticipants: number;
  prizePoolBps: number;
  prizeSplitBps: number[];
}
interface AuditRow {
  id: number;
  ts: number;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId: string;
}
interface State {
  players: Player[];
  session: string | null;
  rounds: Round[];
  entries: Entry[];
  adminSession?: boolean;
  settings?: Settings;
  suspended?: Record<string, string>;
  paid?: string[];
  audit?: AuditRow[];
}

/** Preview-only operator admin (never exists outside the demo build). */
export const DEMO_OPERATOR_ADMIN = {
  email: 'operator@yourarena.demo',
  password: 'demo-operator-2026',
};
const DEFAULT_SETTINGS: Settings = {
  name: 'Your Arena',
  primaryColor: '#AFE604',
  domain: null,
  timeZone: 'Europe/Amsterdam',
  startMinuteOfDay: 1200,
  durationMinutes: 60,
  entryFeeMinor: '1000',
  startBalanceMinor: '10000000',
  leverage: 100,
  maxDrawdownBps: 1000,
  minParticipants: 50,
  prizePoolBps: 8000,
  prizeSplitBps: [5000, 3000, 2000],
};

/** Example history for the admin panel: 14 past daily rounds (deterministic). */
function exampleHistory() {
  const day = 86_400_000;
  const today = new Date();
  today.setUTCHours(19, 0, 0, 0);
  return Array.from({ length: 14 }, (_, i) => {
    const n = i === 9 ? 41 : 58 + ((i * 37) % 90);
    const cancelled = n < 50;
    const pot = cancelled ? 0n : BigInt(n) * 1000n;
    const b = prizeBreakdown(P, cancelled ? 0 : n);
    return {
      id: `hist-${i}`,
      startsAt: today.getTime() - (i + 1) * day,
      participants: cancelled ? 0 : n,
      status: cancelled ? 'CANCELLED' : 'SETTLED',
      pot,
      prizes: b.prizesMinor,
      share: cancelled ? 0n : b.operatorMinor,
      winners: [0, 1, 2].map((k) => `example_${NAMES[(i * 3 + k) % NAMES.length]}`),
    };
  });
}

const NAMES = [
  'luna',
  'atlas',
  'kite',
  'nova',
  'orbit',
  'pixel',
  'rook',
  'sable',
  'tempo',
  'vega',
  'zen',
  'echo',
  'flux',
  'ivy',
  'jade',
  'koda',
  'lynx',
  'mako',
  'nyx',
  'opal',
];

function load(): State {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw)
      return JSON.parse(raw, (_k, v: unknown) =>
        typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v,
      ) as State;
  } catch {
    /* fresh state */
  }
  return { players: [], session: null, rounds: [], entries: [] };
}
function save(s: State) {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify(s, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v)),
    );
  } catch {
    /* storage unavailable: state lives in memory */
  }
}

class Fail extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
const json = (status: number, v?: unknown) =>
  new Response(
    v === undefined
      ? null
      : JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x)),
    { status, headers: { 'content-type': 'application/json' } },
  );

function newRound(startsAt: number): Round {
  const bots: Bot[] = Array.from({ length: EXAMPLE_PLAYERS }, (_, i) => ({
    nickname: `example_${NAMES[i % NAMES.length]}${Math.floor(i / NAMES.length) || ''}`,
    // Example players join spread over the registration window.
    joinAt: startsAt - OPEN_MS + Math.floor(((i + 1) / (EXAMPLE_PLAYERS + 1)) * (OPEN_MS - 20_000)),
    a: 60 + Math.random() * 520,
    b: 40_000 + Math.random() * 160_000,
    c: Math.random() * 6.28,
    drift: (Math.random() - 0.45) * 900,
  }));
  return {
    id: uid(),
    startsAt,
    endsAt: startsAt + DURATION_MS,
    status: 'OPEN',
    bots,
    pot: null,
    results: [],
  };
}

/** Example player's return (bps) at time t: smooth, deterministic wave + drift. */
function botReturn(bot: Bot, r: Round, t: number): number {
  const p = Math.min(1, Math.max(0, (t - r.startsAt) / DURATION_MS));
  return Math.round(
    Math.sin((t - r.startsAt) / bot.b + bot.c) * bot.a * p + bot.drift * p - Math.sin(bot.c) * 0,
  );
}

export function createCompeteDemo(market: DemoMarket) {
  const st = load();
  const quote = (symbol: string): Quote | null => market.quotes.get(symbol) ?? null;
  const spec = (symbol: string) => {
    const s = bySymbol.get(symbol.toUpperCase());
    if (!s) throw new Fail(404, 'INSTRUMENT_NOT_FOUND');
    return s;
  };

  const current = () => st.rounds.find((r) => r.status === 'OPEN' || r.status === 'LIVE');
  const botsJoined = (r: Round, t = Date.now()) => r.bots.filter((b) => b.joinAt <= t);
  const paidEntries = (r: Round) =>
    st.entries.filter((e) => e.roundId === r.id && e.paidAt !== null && e.status !== 'REFUNDED');
  const participants = (r: Round) => botsJoined(r).length + paidEntries(r).length;

  const metrics = (e: Entry) =>
    accountMetrics(
      e.balance,
      e.status === 'ACTIVE'
        ? e.positions
            .map((p) => ({ position: p.state, spec: spec(p.symbol), quote: quote(p.symbol)! }))
            .filter((x) => x.quote)
        : [],
    );
  const equityOf = (e: Entry) =>
    e.status === 'ACTIVE' ? metrics(e).equityMinor : (e.final ?? e.balance);

  function fill(
    e: Entry,
    symbol: string,
    side: 'BUY' | 'SELL',
    q: bigint,
    reason: Order['reason'],
    clientOrderId: string,
  ) {
    const s = spec(symbol);
    const qt = quote(symbol);
    if (!qt) throw new Fail(422, 'QUOTE_STALE');
    const lev = Math.min(P.leverage, s.maxLeverage);
    const cur = e.positions.find((p) => p.symbol === symbol) ?? null;
    if (reason === 'PLAYER')
      validateOrder(
        { side, type: 'MARKET', qty: q, leverage: lev },
        {
          spec: s,
          quote: qt,
          position: cur?.state ?? null,
          metrics: metrics(e),
          accountMaxLeverage: lev,
        },
      );
    const exec = marketExecution(side, q, qt, s);
    const r = applyFill(cur?.state ?? null, { side, qty: q, price: exec.price, leverage: lev }, s);
    e.balance += r.realizedPnlMinor - exec.commissionMinor;
    e.positions = e.positions.filter((p) => p.symbol !== symbol);
    if (r.position) e.positions.push({ symbol, state: r.position });
    const o: Order = {
      id: uid(),
      clientOrderId,
      symbol,
      side,
      qty: q,
      price: exec.price,
      fee: exec.commissionMinor,
      pnl: r.realizedPnlMinor,
      reason,
      at: Date.now(),
    };
    e.orders.unshift(o);
    return o;
  }
  const closeAll = (e: Entry, reason: Order['reason']) => {
    for (const p of [...e.positions])
      fill(
        e,
        p.symbol,
        p.state.side === 'LONG' ? 'SELL' : 'BUY',
        p.state.qty,
        reason,
        `${reason}-${uid()}`,
      );
  };

  /** Advances the demo clock: start, drawdown, settle, next round. */
  function advance(now = Date.now()) {
    if (!current()) st.rounds.push(newRound(now + OPEN_MS));
    for (const r of st.rounds) {
      if (r.status === 'OPEN' && now >= r.startsAt) {
        for (const e of st.entries.filter(
          (x) => x.roundId === r.id && x.status === 'PENDING_PAYMENT',
        ))
          e.status = 'PAYMENT_FAILED';
        if (participants(r) >= P.minParticipants) r.status = 'LIVE';
        else {
          r.status = 'CANCELLED';
          for (const e of paidEntries(r)) e.status = 'REFUNDED';
        }
      }
      if (r.status === 'LIVE') {
        for (const e of st.entries.filter((x) => x.roundId === r.id && x.status === 'ACTIVE')) {
          if (isDrawdownBreached(metrics(e).equityMinor, competeFloorMinor(P))) {
            closeAll(e, 'DRAWDOWN');
            e.status = 'BREACHED';
            e.final = e.balance;
            e.endedAt = now;
          }
        }
      }
      if (r.status === 'LIVE' && now >= r.endsAt) {
        for (const e of st.entries.filter((x) => x.roundId === r.id && x.status === 'ACTIVE')) {
          closeAll(e, 'ROUND_END');
          e.status = 'FINISHED';
          e.final = e.balance;
          e.endedAt = now;
        }
        const mine = st.entries.filter(
          (x) => x.roundId === r.id && (x.status === 'FINISHED' || x.status === 'BREACHED'),
        );
        const standings = [
          ...mine.map((e) => ({
            entryId: e.id,
            equityMinor: e.final!,
            startBalanceMinor: P.startBalanceMinor,
            enteredAtMs: e.paidAt!,
          })),
          ...botsJoined(r).map((b) => ({
            entryId: `bot:${b.nickname}`,
            equityMinor:
              P.startBalanceMinor +
              (P.startBalanceMinor * BigInt(Math.max(-1000, botReturn(b, r, r.endsAt)))) / 10_000n,
            startBalanceMinor: P.startBalanceMinor,
            enteredAtMs: b.joinAt,
          })),
        ];
        const out = settleRound(P, standings);
        if (out.status === 'SETTLED') {
          r.pot = out.breakdown.potMinor;
          r.results = out.ranking.map((x) => {
            const e = mine.find((m) => m.id === x.entryId);
            if (e) {
              e.rank = x.rank;
              e.prize = x.prizeMinor;
            }
            return {
              nickname: e
                ? st.players.find((p) => p.id === e.playerId)!.nickname
                : x.entryId.slice(4),
              equity: x.equityMinor,
              rank: x.rank,
              prize: x.prizeMinor,
              status: e?.status ?? 'FINISHED',
              me: !!e,
            };
          });
        }
        r.status = 'SETTLED';
      }
    }
    if (!current()) st.rounds.push(newRound(now + OPEN_MS));
  }

  const roundDto = (r: Round, playerId: string | null) => {
    const n = r.status === 'CANCELLED' ? 0 : participants(r);
    const b = prizeBreakdown(P, n);
    const e = playerId
      ? st.entries.find((x) => x.roundId === r.id && x.playerId === playerId)
      : undefined;
    return {
      id: r.id,
      status: r.status,
      startsAt: new Date(r.startsAt).toISOString(),
      endsAt: new Date(r.endsAt).toISOString(),
      entryFeeMinor: P.entryFeeMinor,
      currency: 'USD',
      startBalanceMinor: P.startBalanceMinor,
      leverage: P.leverage,
      maxDrawdownBps: P.maxDrawdownBps,
      minParticipants: P.minParticipants,
      prizePoolBps: P.prizePoolBps,
      prizeSplitBps: P.prizeSplitBps,
      participants: n,
      potMinor: r.pot ?? b.potMinor,
      prizesMinor: b.prizesMinor,
      myEntry: e ? entryDto(e) : null,
    };
  };

  const entryDto = (e: Entry) => {
    const m = metrics(e);
    const equity = equityOf(e);
    return {
      id: e.id,
      roundId: e.roundId,
      status: e.status,
      startBalanceMinor: P.startBalanceMinor,
      balanceMinor: e.balance,
      equityMinor: equity,
      usedMarginMinor: m.usedMarginMinor,
      freeMarginMinor: equity - m.usedMarginMinor,
      floorMinor: competeFloorMinor(P),
      returnBps: returnBps(equity, P.startBalanceMinor),
      rank: e.rank,
      prizeMinor: e.prize,
      paidAt: e.paidAt ? new Date(e.paidAt).toISOString() : null,
      endedAt: e.endedAt ? new Date(e.endedAt).toISOString() : null,
      positions: e.positions.map((p) => {
        const s = spec(p.symbol);
        const q = quote(p.symbol);
        return {
          symbol: p.symbol,
          side: p.state.side,
          qty: toDecimalString(p.state.qty, s.qtyDecimals),
          avgEntryPrice: toDecimalString(p.state.avgEntryPrice, s.priceDecimals),
          markPrice: q ? toDecimalString((q.bid + q.ask) / 2n, s.priceDecimals) : null,
          unrealizedPnlMinor: q ? unrealizedPnlMinor(p.state, q, s) : 0n,
          leverage: p.state.leverage,
        };
      }),
    };
  };

  const leaderboard = (r: Round, playerId: string | null) => {
    const now = Math.min(Date.now(), r.endsAt);
    let rows: {
      rank: number;
      nickname: string;
      returnBps: bigint;
      equityMinor: bigint;
      status: string;
      prizeMinor: bigint;
      isMe: boolean;
    }[];
    const b = prizeBreakdown(P, participants(r));
    if (r.status === 'SETTLED') {
      rows = r.results.map((x) => ({
        rank: x.rank,
        nickname: x.nickname,
        returnBps: returnBps(x.equity, P.startBalanceMinor),
        equityMinor: x.equity,
        status: x.status,
        prizeMinor: x.prize,
        isMe: x.me && !!playerId,
      }));
    } else {
      const mine = st.entries.filter(
        (e) => e.roundId === r.id && ['ACTIVE', 'BREACHED', 'FINISHED'].includes(e.status),
      );
      const standings = [
        ...mine.map((e) => ({
          entryId: e.id,
          equityMinor: equityOf(e),
          startBalanceMinor: P.startBalanceMinor,
          enteredAtMs: e.paidAt!,
        })),
        ...botsJoined(r).map((bot) => {
          const ret = r.status === 'LIVE' ? Math.max(-1000, botReturn(bot, r, now)) : 0;
          return {
            entryId: `bot:${bot.nickname}`,
            equityMinor: P.startBalanceMinor + (P.startBalanceMinor * BigInt(ret)) / 10_000n,
            startBalanceMinor: P.startBalanceMinor,
            enteredAtMs: bot.joinAt,
          };
        }),
      ];
      rows = rankStandings(standings).map((x) => {
        const e = mine.find((m) => m.id === x.entryId);
        return {
          rank: x.rank,
          nickname: e ? st.players.find((p) => p.id === e.playerId)!.nickname : x.entryId.slice(4),
          returnBps: x.returnBps,
          equityMinor: x.equityMinor,
          status: e?.status ?? (x.returnBps <= -1000n ? 'BREACHED' : 'ACTIVE'),
          prizeMinor: b.prizesMinor[x.rank - 1] ?? 0n,
          isMe: !!e && e.playerId === playerId,
        };
      });
    }
    return {
      roundId: r.id,
      status: r.status,
      participants: participants(r),
      potMinor: r.pot ?? b.potMinor,
      asOf: new Date().toISOString(),
      rows: rows.slice(0, 100),
      me: rows.find((x) => x.isMe) ?? null,
    };
  };

  const playerOf = (req: Request): Player | null => {
    const h = req.headers.get('authorization') ?? '';
    const id = h.startsWith('Bearer demo-compete-') ? h.slice('Bearer demo-compete-'.length) : null;
    return st.players.find((p) => p.id === id) ?? null;
  };
  const need = (req: Request) => {
    const p = playerOf(req);
    if (!p) throw new Fail(401, 'TOKEN_INVALID');
    return p;
  };
  const playerDto = (p: Player) => ({
    id: p.id,
    email: p.email,
    nickname: p.nickname,
    country: p.country,
    locale: p.locale,
    operatorId: 'demo-operator',
  });
  const tokens = (p: Player) => ({
    accessToken: `demo-compete-${p.id}`,
    expiresIn: 3600,
    player: playerDto(p),
  });
  const roundById = (id: string) => {
    const r = st.rounds.find((x) => x.id === id);
    if (!r) throw new Fail(404, 'ROUND_NOT_FOUND');
    return r;
  };
  const ownEntry = (id: string, p: Player) => {
    const e = st.entries.find((x) => x.id === id);
    if (!e || e.playerId !== p.id) throw new Fail(404, 'ENTRY_NOT_FOUND');
    return e;
  };

  type H = (m: RegExpMatchArray, b: Record<string, unknown>, req: Request) => Response;
  const routes: [string, RegExp, H][] = [];
  const on = (method: string, path: string, h: H) =>
    routes.push([method, new RegExp(`^/compete${path.replace(/\{(\w+)\}/g, '([^/]+)')}$`), h]);

  on('GET', '/operator', () =>
    json(200, {
      slug: 'your-arena',
      name: (st.settings ?? DEFAULT_SETTINGS).name,
      primaryColor: (st.settings ?? DEFAULT_SETTINGS).primaryColor,
      timeZone: 'Europe/Amsterdam',
      startMinuteOfDay: 1200,
      durationMinutes: 60,
      entryFeeMinor: P.entryFeeMinor,
      currency: 'USD',
      startBalanceMinor: P.startBalanceMinor,
      leverage: P.leverage,
      maxDrawdownBps: P.maxDrawdownBps,
      minParticipants: P.minParticipants,
      prizePoolBps: P.prizePoolBps,
      prizeSplitBps: P.prizeSplitBps,
      testPayments: true,
    }),
  );
  on('GET', '/rounds/current', () => json(200, roundDto(current()!, null)));
  on('GET', '/me/round', (_m, _b, req) => json(200, roundDto(current()!, need(req).id)));
  on('GET', '/rounds/recent', () =>
    json(
      200,
      st.rounds
        .filter((r) => r.status === 'SETTLED' || r.status === 'CANCELLED')
        .reverse()
        .slice(0, 5)
        .map((r) => {
          const { myEntry: _x, ...rest } = roundDto(r, null);
          return rest;
        }),
    ),
  );
  on('GET', '/rounds/{id}/leaderboard', (m) => json(200, leaderboard(roundById(m[1]!), null)));
  on('GET', '/me/rounds/{id}/leaderboard', (m, _b, req) =>
    json(200, leaderboard(roundById(m[1]!), need(req).id)),
  );
  on('GET', '/me/rounds/{id}', (m, _b, req) => json(200, roundDto(roundById(m[1]!), need(req).id)));
  on('POST', '/auth/register', (_m, b) => {
    const email = String(b.email ?? '')
      .trim()
      .toLowerCase();
    const nickname = String(b.nickname ?? '');
    if (
      !b.confirmAdult ||
      !b.acceptTerms ||
      String(b.password ?? '').length < 12 ||
      !/^[A-Za-z0-9_]{3,20}$/.test(nickname)
    )
      throw new Fail(400, 'VALIDATION_ERROR');
    if (st.players.some((p) => p.email === email)) throw new Fail(409, 'EMAIL_TAKEN');
    if (st.players.some((p) => p.nickname === nickname)) throw new Fail(409, 'NICKNAME_TAKEN');
    const p: Player = {
      id: uid(),
      email,
      password: String(b.password),
      nickname,
      country: String(b.country ?? 'NL'),
      locale: String(b.locale ?? 'en'),
    };
    st.players.push(p);
    st.session = p.id;
    return json(201, tokens(p));
  });
  on('POST', '/auth/login', (_m, b) => {
    const p = st.players.find(
      (x) =>
        x.email ===
          String(b.email ?? '')
            .trim()
            .toLowerCase() && x.password === b.password,
    );
    if (!p) throw new Fail(401, 'INVALID_CREDENTIALS');
    st.session = p.id;
    return json(200, tokens(p));
  });
  on('POST', '/auth/refresh', () => {
    const p = st.players.find((x) => x.id === st.session);
    if (!p) throw new Fail(401, 'REFRESH_INVALID');
    return json(200, { accessToken: `demo-compete-${p.id}`, expiresIn: 3600 });
  });
  on('POST', '/auth/logout', () => {
    st.session = null;
    return json(204);
  });
  on('GET', '/me', (_m, _b, req) => json(200, playerDto(need(req))));
  on('GET', '/me/history', (_m, _b, req) => {
    const p = need(req);
    return json(
      200,
      st.entries
        .filter((e) => e.playerId === p.id && e.paidAt !== null)
        .reverse()
        .map((e) => {
          const { myEntry: _x, ...round } = roundDto(roundById(e.roundId), null);
          return { round, entry: entryDto(e) };
        }),
    );
  });
  on('POST', '/rounds/{id}/entries', (m, _b, req) => {
    const p = need(req);
    const r = roundById(m[1]!);
    if (r.status !== 'OPEN' || Date.now() >= r.startsAt) throw new Fail(422, 'ROUND_CLOSED');
    let e = st.entries.find((x) => x.roundId === r.id && x.playerId === p.id);
    if (e && e.status !== 'PENDING_PAYMENT' && e.status !== 'PAYMENT_FAILED')
      throw new Fail(409, 'ALREADY_ENTERED');
    if (!e) {
      e = {
        id: uid(),
        roundId: r.id,
        playerId: p.id,
        status: 'PENDING_PAYMENT',
        balance: P.startBalanceMinor,
        positions: [],
        orders: [],
        paidAt: null,
        final: null,
        rank: null,
        prize: null,
        endedAt: null,
      };
      st.entries.push(e);
    } else e.status = 'PENDING_PAYMENT';
    return json(201, { entry: entryDto(e), paymentUrl: `/${p.locale}/compete/pay/${e.id}` });
  });
  on('POST', '/entries/{id}/test-payment', (m, b, req) => {
    const e = ownEntry(m[1]!, need(req));
    if (e.status !== 'PENDING_PAYMENT') throw new Fail(409, 'PAYMENT_NOT_PENDING');
    if (b.outcome !== 'succeeded') e.status = 'PAYMENT_FAILED';
    else {
      e.status = 'ACTIVE';
      e.paidAt = Date.now();
      if (roundById(e.roundId).status !== 'OPEN') e.status = 'REFUNDED';
    }
    return json(200, entryDto(e));
  });
  on('GET', '/entries/{id}', (m, _b, req) => json(200, entryDto(ownEntry(m[1]!, need(req)))));
  on('GET', '/entries/{id}/orders', (m, _b, req) =>
    json(
      200,
      ownEntry(m[1]!, need(req)).orders.map((o) => {
        const s = spec(o.symbol);
        return {
          id: o.id,
          clientOrderId: o.clientOrderId,
          symbol: o.symbol,
          side: o.side,
          qty: toDecimalString(o.qty, s.qtyDecimals),
          price: toDecimalString(o.price, s.priceDecimals),
          feeMinor: o.fee,
          realizedPnlMinor: o.pnl,
          reason: o.reason,
          createdAt: new Date(o.at).toISOString(),
        };
      }),
    ),
  );
  const tradable = (e: Entry) => {
    const r = roundById(e.roundId);
    if (e.status !== 'ACTIVE') throw new Fail(422, 'ENTRY_NOT_ACTIVE');
    if (r.status !== 'LIVE') throw new Fail(422, 'ROUND_NOT_LIVE');
  };
  const orderDto = (o: Order) => {
    const s = spec(o.symbol);
    return {
      id: o.id,
      clientOrderId: o.clientOrderId,
      symbol: o.symbol,
      side: o.side,
      qty: toDecimalString(o.qty, s.qtyDecimals),
      price: toDecimalString(o.price, s.priceDecimals),
      feeMinor: o.fee,
      realizedPnlMinor: o.pnl,
      reason: o.reason,
      createdAt: new Date(o.at).toISOString(),
    };
  };
  on('POST', '/entries/{id}/orders', (m, b, req) => {
    const e = ownEntry(m[1]!, need(req));
    const dup = e.orders.find((o) => o.clientOrderId === b.clientOrderId);
    if (dup) return json(201, orderDto(dup));
    tradable(e);
    const symbol = String(b.symbol ?? '');
    let q: bigint;
    try {
      q = fromDecimalString(String(b.qty ?? ''), spec(symbol).qtyDecimals);
    } catch {
      throw new Fail(422, 'INVALID_QTY');
    }
    return json(
      201,
      orderDto(
        fill(e, symbol, b.side === 'SELL' ? 'SELL' : 'BUY', q, 'PLAYER', String(b.clientOrderId)),
      ),
    );
  });
  on('POST', '/entries/{id}/positions/{symbol}/close', (m, _b, req) => {
    const e = ownEntry(m[1]!, need(req));
    tradable(e);
    const pos = e.positions.find((p) => p.symbol === m[2]);
    if (!pos) throw new Fail(404, 'POSITION_NOT_FOUND');
    return json(
      201,
      orderDto(
        fill(
          e,
          pos.symbol,
          pos.state.side === 'LONG' ? 'SELL' : 'BUY',
          pos.state.qty,
          'PLAYER',
          uid(),
        ),
      ),
    );
  });
  // ---------------------------------------------------------------- operator admin (preview)
  const needAdmin = () => {
    if (!st.adminSession) throw new Fail(401, 'TOKEN_INVALID');
  };
  const history = exampleHistory();
  const staffDto = () => ({
    id: 'demo-staff',
    email: DEMO_OPERATOR_ADMIN.email,
    role: 'OWNER',
    operatorId: 'demo-operator',
    operatorName: (st.settings ?? DEFAULT_SETTINGS).name,
    operatorSlug: 'your-arena',
    twoFactorEnabled: true,
    twoFactorRequired: false,
  });
  const audit = (
    action: string,
    entityType: string,
    entityId: string,
    actorType: AuditRow['actorType'] = 'ADMIN',
  ) => {
    st.audit ??= [];
    st.audit.unshift({
      id: (st.audit[0]?.id ?? 1000) + 1,
      ts: Date.now(),
      actorType,
      action,
      entityType,
      entityId,
    });
  };
  const roundSummaries = () => [
    ...st.rounds
      .slice()
      .reverse()
      .map((r) => {
        const d = roundDto(r, null);
        const settled = r.status === 'SETTLED';
        const b = prizeBreakdown(P, d.participants);
        return {
          id: r.id,
          status: r.status,
          startsAt: d.startsAt,
          participants: d.participants,
          potMinor: String(d.potMinor),
          prizesMinor: String(settled ? b.prizesMinor.reduce((a, x) => a + x, 0n) : 0n),
          operatorShareMinor: String(settled ? b.operatorMinor : 0n),
        };
      }),
    ...history.map((h) => ({
      id: h.id,
      status: h.status,
      startsAt: new Date(h.startsAt).toISOString(),
      participants: h.participants,
      potMinor: String(h.pot),
      prizesMinor: String(h.prizes.reduce((a, x) => a + x, 0n)),
      operatorShareMinor: String(h.share),
    })),
  ];
  const payoutRows = () => {
    const rows = history
      .filter((h) => h.status === 'SETTLED')
      .flatMap((h, i) =>
        h.prizes.map((amount, k) => ({
          id: `${h.id}-p${k}`,
          entryId: `${h.id}-e${k}`,
          roundId: h.id,
          roundStartsAt: new Date(h.startsAt).toISOString(),
          nickname: h.winners[k]!,
          rank: k + 1,
          amountMinor: String(amount),
          currency: 'USD',
          status:
            i < 2 && !(st.paid ?? []).includes(`${h.id}-p${k}`) ? 'AWAITING_PAYOUT' : 'SUCCEEDED',
          updatedAt: new Date(h.startsAt + 3_600_000).toISOString(),
        })),
      );
    return rows;
  };

  on('POST', '/admin/auth/login', (_m, b) => {
    if (
      String(b.email ?? '').toLowerCase() !== DEMO_OPERATOR_ADMIN.email ||
      b.password !== DEMO_OPERATOR_ADMIN.password
    )
      throw new Fail(401, 'INVALID_CREDENTIALS');
    st.adminSession = true;
    audit('compete.admin.login', 'CompeteStaff', 'demo-staff');
    return json(200, { accessToken: 'demo-compete-admin', expiresIn: 3600, staff: staffDto() });
  });
  on('POST', '/admin/auth/refresh', () => {
    needAdmin();
    return json(200, { accessToken: 'demo-compete-admin', expiresIn: 3600 });
  });
  on('POST', '/admin/auth/logout', () => {
    st.adminSession = false;
    return json(204);
  });
  on('GET', '/admin/me', () => (needAdmin(), json(200, staffDto())));
  on('GET', '/admin/overview', () => {
    needAdmin();
    const cur = current()!;
    const recent = roundSummaries()
      .filter((r) => r.status === 'SETTLED' || r.status === 'CANCELLED')
      .slice(0, 14);
    const settled = recent.filter((r) => r.status === 'SETTLED');
    const sum = (xs: string[]) => xs.reduce((a, x) => a + BigInt(x), 0n);
    const awaiting = payoutRows().filter((p) => p.status === 'AWAITING_PAYOUT');
    return json(200, {
      current: roundDto(cur, null),
      currency: 'USD',
      players: EXAMPLE_PLAYERS + 180 + st.players.length,
      roundsSettled30d: settled.length,
      roundsCancelled30d: recent.length - settled.length,
      entries30d: settled.reduce((a, r) => a + r.participants, 0),
      netEntryFeesMinor30d: String(sum(settled.map((r) => r.potMinor))),
      prizesMinor30d: String(sum(settled.map((r) => r.prizesMinor))),
      operatorRevenueMinor30d: String(sum(settled.map((r) => r.operatorShareMinor))),
      awaitingPayouts: awaiting.length,
      awaitingPayoutsMinor: String(sum(awaiting.map((p) => p.amountMinor))),
      recent,
    });
  });
  on('GET', '/admin/rounds', () => (needAdmin(), json(200, roundSummaries())));
  on('GET', '/admin/rounds/{id}', (m) => {
    needAdmin();
    const sum = roundSummaries().find((r) => r.id === m[1]);
    if (!sum) throw new Fail(404, 'ROUND_NOT_FOUND');
    const live = st.rounds.find((r) => r.id === m[1]);
    const rows = live
      ? live.status === 'OPEN'
        ? []
        : leaderboard(live, null).rows.map((r, i) => ({
            ...r,
            entryId: `e${i}`,
            playerId: `p${i}`,
          }))
      : sum.status === 'CANCELLED'
        ? []
        : Array.from({ length: sum.participants }, (_, i) => {
            const h = history.find((x) => x.id === sum.id)!;
            const ret = Math.round(900 - i * (1700 / sum.participants));
            return {
              rank: i + 1,
              nickname: i < 3 ? h.winners[i]! : `example_${NAMES[(i * 7) % NAMES.length]}${i}`,
              returnBps: String(ret),
              equityMinor: String(
                P.startBalanceMinor + (P.startBalanceMinor * BigInt(ret)) / 10_000n,
              ),
              status: ret <= -1000 ? 'BREACHED' : 'FINISHED',
              prizeMinor: String(h.prizes[i] ?? 0n),
              isMe: false,
              entryId: `${h.id}-e${i}`,
              playerId: `${h.id}-p${i}`,
            };
          });
    return json(200, {
      round: sum,
      endsAt: new Date(Date.parse(sum.startsAt) + 3_600_000).toISOString(),
      minParticipants: 50,
      entryFeeMinor: '1000',
      currency: 'USD',
      rows,
    });
  });
  on('GET', '/admin/players', (_m, _b, req) => {
    needAdmin();
    const q = (new URL(req.url).searchParams.get('q') ?? '').toLowerCase();
    const real = st.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      email: p.email,
      country: p.country,
      createdAt: new Date().toISOString(),
    }));
    const examples = NAMES.map((n, i) => ({
      id: `ex-${n}`,
      nickname: `example_${n}`,
      email: `${n}@example.invalid`,
      country: ['NL', 'DE', 'ES', 'BE', 'FR'][i % 5]!,
      createdAt: new Date(Date.now() - (i + 2) * 86_400_000).toISOString(),
    }));
    const items = [...real, ...examples]
      .filter((p) => !q || p.nickname.toLowerCase().includes(q) || p.email.includes(q))
      .map((p, i) => {
        const reason = st.suspended?.[p.id];
        return {
          ...p,
          status: reason ? 'SUSPENDED' : 'ACTIVE',
          statusReason: reason ?? null,
          entries: p.id.startsWith('ex-') ? 3 + (i % 9) : 1,
          prizesMinor: p.id.startsWith('ex-') && i % 4 === 0 ? '1840' : '0',
        };
      });
    return json(200, { items, nextCursor: null });
  });
  on('POST', '/admin/players/{id}/suspend', (m, b) => {
    needAdmin();
    st.suspended = { ...(st.suspended ?? {}), [m[1]!]: String(b.reason ?? '') };
    audit('compete.player.suspended', 'CompetePlayer', m[1]!);
    return json(204);
  });
  on('POST', '/admin/players/{id}/reactivate', (m) => {
    needAdmin();
    const { [m[1]!]: _x, ...rest } = st.suspended ?? {};
    st.suspended = rest;
    audit('compete.player.reactivated', 'CompetePlayer', m[1]!);
    return json(204);
  });
  on('GET', '/admin/payouts', (_m, _b, req) => {
    needAdmin();
    const status =
      new URL(req.url).searchParams.get('status') === 'SUCCEEDED' ? 'SUCCEEDED' : 'AWAITING_PAYOUT';
    return json(
      200,
      payoutRows().filter((p) => p.status === status),
    );
  });
  on('POST', '/admin/payouts/{id}/mark-paid', (m) => {
    needAdmin();
    const row = payoutRows().find((p) => p.id === m[1]);
    if (!row) throw new Fail(404, 'PAYOUT_NOT_FOUND');
    if (row.status !== 'AWAITING_PAYOUT') throw new Fail(409, 'PAYOUT_NOT_PENDING');
    st.paid = [...(st.paid ?? []), row.id];
    audit('compete.prize.marked_paid', 'CompetePayment', row.id);
    return json(204);
  });
  on(
    'GET',
    '/admin/settings',
    () => (needAdmin(), json(200, { ...(st.settings ?? DEFAULT_SETTINGS), currency: 'USD' })),
  );
  on('PUT', '/admin/settings', (_m, b) => {
    needAdmin();
    const split = (b.prizeSplitBps as number[]) ?? [];
    if (
      split.reduce((a, x) => a + x, 0) !== 10_000 ||
      split.some((x, i) => i > 0 && x > split[i - 1]!)
    )
      throw new Fail(422, 'SETTINGS_INVALID');
    st.settings = { ...DEFAULT_SETTINGS, ...(b as unknown as Settings) };
    audit('compete.operator.settings_updated', 'CompeteOperator', 'demo-operator');
    return json(200, { ...st.settings, currency: 'USD' });
  });
  on('GET', '/admin/audit', () => {
    needAdmin();
    const base: AuditRow[] = history.slice(0, 6).flatMap((h, i) => [
      {
        id: 900 - i * 3,
        ts: h.startsAt + 3_600_000,
        actorType: 'SYSTEM' as const,
        action: h.status === 'SETTLED' ? 'compete.round.settled' : 'compete.round.cancelled',
        entityType: 'CompeteRound',
        entityId: h.id,
      },
      {
        id: 899 - i * 3,
        ts: h.startsAt,
        actorType: 'SYSTEM' as const,
        action: 'compete.round.started',
        entityType: 'CompeteRound',
        entityId: h.id,
      },
    ]);
    const items = [...(st.audit ?? []), ...base].map((r) => ({
      ...r,
      id: String(r.id),
      ts: new Date(r.ts).toISOString(),
      actorId: null,
      data: {},
    }));
    return json(200, { items, nextCursor: null, chainIntact: true });
  });

  // Demo-only shortcut so the preview does not have to wait for the start time.
  on('POST', '/dev/start-now', () => {
    const r = current();
    if (r && r.status === 'OPEN') {
      const shift = r.startsAt - Date.now() - 1;
      r.startsAt -= shift;
      r.endsAt -= shift;
      for (const bot of r.bots) bot.joinAt = Math.min(bot.joinAt - shift, r.startsAt - 1);
    }
    advance();
    return json(200, { ok: true });
  });

  /** Handles /compete/* paths; returns null for anything else. */
  return function handle(path: string, req: Request, b: Record<string, unknown>): Response | null {
    if (!path.startsWith('/compete/')) return null;
    advance();
    for (const [method, re, h] of routes) {
      const m = path.match(re);
      if (m && method === req.method) {
        try {
          const res = h(m, b, req);
          save(st);
          return res;
        } catch (e) {
          save(st);
          if (e instanceof Fail)
            return json(e.status, {
              type: 'about:blank',
              title: e.code,
              status: e.status,
              code: e.code,
            });
          if (e instanceof TradingError)
            return json(422, {
              type: 'about:blank',
              title: 'Order rejected',
              status: 422,
              code: e.code,
            });
          console.error(e);
          return json(500, { code: 'INTERNAL_ERROR' });
        }
      }
    }
    return json(404, { code: 'NOT_FOUND' });
  };
}
