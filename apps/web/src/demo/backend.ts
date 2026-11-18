/**
 * DEMO BACKEND — runs entirely in the browser for the shareable preview (no server).
 * Emulates the REST API used by the app with the real @brand/engine for execution, PnL,
 * margin and rule evaluation. Data is simulated and kept in this browser only.
 */
import {
  accountMetrics,
  applyFill,
  closePrice,
  directionOf,
  evaluateRules,
  fundingProgress,
  type FundingParams,
  fromDecimalString,
  isStopTriggered,
  limitExecution,
  marketExecution,
  nextHighWaterMark,
  toDecimalString,
  TradingError,
  unrealizedPnlMinor,
  usedMarginMinor,
  validateOrder,
  type MarkedPosition,
  type PositionState,
  type RuleParams,
} from '@brand/engine';
import { exampleProducts, exampleQuotePriceMinor, exampleRules } from '@/mocks/data';
import { bySymbol, DEMO_INSTRUMENTS, DemoMarket } from './market';

const uid = () => crypto.randomUUID();
const STORE = 'brand-demo-state-v1';

const RULES: RuleParams & { profitSplitBps: number; maxLeverage: number } = {
  maxDailyLossBps: 300,
  dailyLossBasis: 'INITIAL_BALANCE',
  dailyLossReference: 'MAX_OF_BOTH',
  maxDrawdownBps: 600,
  drawdownType: 'TRAILING',
  trailingBasis: 'EQUITY',
  trailingLocksAtInitial: true,
  profitTargetBps: null,
  minTradingDays: 0,
  warnRatioBps: 7000,
  profitSplitBps: 8000,
  maxLeverage: 50,
};

/** Example payout & scaling terms (same as the API's INSTANT_EXAMPLE v2). */
const FUNDING: FundingParams = {
  profitSplitBps: 8000,
  payoutIntervalDays: 14,
  minTradingDaysPerPayout: 3,
  minPayoutMinor: 5_000n,
  scalingProfitTargetBps: 1_000,
  scalingMinPayouts: 2,
  scalingStepBps: 2_500,
  scalingMaxBalanceMinor: 40_000_000n,
};

interface Purchase {
  id: string;
  userId: string;
  quantity: number;
  size: bigint;
  unitPrice: bigint;
  drawdownBps: number;
  status: 'PENDING' | 'FULFILLED' | 'FAILED' | 'CANCELLED';
  accountIds: string[];
  createdAt: number;
}

interface User {
  id: string;
  email: string;
  password: string;
  locale: string;
  country: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}
interface Acc {
  id: string;
  userId: string;
  kind: 'DEMO' | 'FUNDED';
  label: string;
  status: 'ACTIVE' | 'FUNDED_ACTIVE' | 'FAILED';
  initial: bigint;
  balance: bigint;
  maxLeverage: number;
  rules: boolean;
  hwm: bigint;
  dayStartBalance: bigint;
  dayStartEquity: bigint;
  tradingDays: number;
  lastTradingDate: string;
  failReason: string | null;
  createdAt: number;
  equity: { t: number; e: bigint; b: bigint }[];
}
interface Pos {
  id: string;
  accountId: string;
  symbol: string;
  state: PositionState;
  sl: bigint | null;
  tp: bigint | null;
  realized: bigint;
  openedAt: number;
}
interface Ord {
  id: string;
  accountId: string;
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  qty: bigint;
  limitPrice: bigint | null;
  stopPrice: bigint | null;
  sl: bigint | null;
  tp: bigint | null;
  leverage: number;
  reduceOnly: boolean;
  status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  avgFillPrice: bigint | null;
  rejectCode: string | null;
  source: string;
  createdAt: number;
}
interface State {
  users: User[];
  sessionUserId: string | null;
  accounts: Acc[];
  positions: Pos[];
  orders: Ord[];
  fills: {
    id: string;
    orderId: string;
    accountId: string;
    symbol: string;
    side: string;
    qty: bigint;
    price: bigint;
    commission: bigint;
    realized: bigint;
    at: number;
  }[];
  watchlist: Record<string, string[]>;
  purchases?: Purchase[];
}

const empty = (): State => ({
  users: [],
  sessionUserId: null,
  accounts: [],
  positions: [],
  orders: [],
  fills: [],
  watchlist: {},
});
function load(): State {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return empty();
    return JSON.parse(raw, (_k, v: unknown) =>
      v && typeof v === 'object' && '$big' in (v as object)
        ? BigInt((v as { $big: string }).$big)
        : v,
    ) as State;
  } catch {
    return empty();
  }
}
function save(s: State) {
  try {
    localStorage.setItem(
      STORE,
      JSON.stringify(s, (_k, v: unknown) => (typeof v === 'bigint' ? { $big: v.toString() } : v)),
    );
  } catch {
    /* storage unavailable: demo keeps working in memory */
  }
}

export const market = new DemoMarket();
const st = load();

// ------------------------------------------------------------------ helpers
const body = (v: unknown) =>
  JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));
const json = (status: number, v?: unknown) =>
  new Response(v === undefined ? null : body(v), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: code, status, code });
class Fail extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const userDto = (u: User) => ({
  id: u.id,
  email: u.email,
  roles: ['TRADER'],
  locale: u.locale,
  country: u.country,
  emailVerified: u.emailVerified,
  twoFactorEnabled: u.twoFactorEnabled,
});
const auth = (u: User) => ({ accessToken: `demo.${u.id}`, expiresIn: 3600, user: userDto(u) });
const me = (): User => {
  const u = st.users.find((x) => x.id === st.sessionUserId);
  if (!u) throw new Fail(401, 'UNAUTHORIZED');
  return u;
};
const ownAcc = (id: string) => {
  const a = st.accounts.find((x) => x.id === id && x.userId === me().id);
  if (!a) throw new Fail(404, 'ACCOUNT_NOT_FOUND');
  return a;
};
const spec = (symbol: string) => {
  const s = bySymbol.get(symbol.toUpperCase());
  if (!s) throw new Fail(404, 'INSTRUMENT_NOT_FOUND');
  return s;
};
const px = (v: bigint | null, symbol: string) =>
  v === null ? null : toDecimalString(v, spec(symbol).priceDecimals);
const qty = (v: bigint, symbol: string) => toDecimalString(v, spec(symbol).qtyDecimals);
const quote = (symbol: string) => market.quotes.get(symbol) ?? null;

function marked(accountId: string): MarkedPosition[] {
  return st.positions
    .filter((p) => p.accountId === accountId)
    .map((p) => ({
      position: p.state,
      spec: spec(p.symbol),
      quote: quote(p.symbol) ?? { bid: p.state.avgEntryPrice, ask: p.state.avgEntryPrice, ts: 0 },
    }));
}
const metrics = (a: Acc) => accountMetrics(a.balance, marked(a.id));
const tradable = (a: Acc) => a.status === 'ACTIVE' || a.status === 'FUNDED_ACTIVE';

function newAccount(userId: string, kind: 'DEMO' | 'FUNDED', initial: bigint, label: string): Acc {
  const a: Acc = {
    id: uid(),
    userId,
    kind,
    label,
    status: kind === 'DEMO' ? 'ACTIVE' : 'FUNDED_ACTIVE',
    initial,
    balance: initial,
    maxLeverage: kind === 'DEMO' ? 50 : RULES.maxLeverage,
    rules: kind === 'FUNDED',
    hwm: initial,
    dayStartBalance: initial,
    dayStartEquity: initial,
    tradingDays: 0,
    lastTradingDate: '',
    failReason: null,
    createdAt: Date.now(),
    equity: [{ t: Date.now(), e: initial, b: initial }],
  };
  st.accounts.push(a);
  return a;
}

function accountDto(a: Acc) {
  const m = metrics(a);
  return {
    id: a.id,
    kind: a.kind,
    label: a.label,
    status: a.status,
    isSimulated: true,
    currency: 'USD',
    initialBalanceMinor: a.initial.toString(),
    balanceMinor: m.balanceMinor.toString(),
    equityMinor: m.equityMinor.toString(),
    unrealizedPnlMinor: m.unrealizedPnlMinor.toString(),
    usedMarginMinor: m.usedMarginMinor.toString(),
    freeMarginMinor: m.freeMarginMinor.toString(),
    marginLevelBps: m.marginLevelBps?.toString() ?? null,
    dailyPnlMinor: (m.equityMinor - a.dayStartBalance).toString(),
    maxLeverage: a.maxLeverage,
    seq: '0',
    hasRules: a.rules,
    failReason: a.failReason,
  };
}

const orderDto = (o: Ord) => ({
  id: o.id,
  clientOrderId: o.clientOrderId,
  symbol: o.symbol,
  side: o.side,
  type: o.type,
  qty: qty(o.qty, o.symbol),
  limitPrice: px(o.limitPrice, o.symbol),
  stopPrice: px(o.stopPrice, o.symbol),
  slPrice: px(o.sl, o.symbol),
  tpPrice: px(o.tp, o.symbol),
  leverage: o.leverage,
  reduceOnly: o.reduceOnly,
  status: o.status,
  filledQty: o.status === 'FILLED' ? qty(o.qty, o.symbol) : qty(0n, o.symbol),
  avgFillPrice: px(o.avgFillPrice, o.symbol),
  rejectCode: o.rejectCode,
  source: o.source,
  createdAt: new Date(o.createdAt).toISOString(),
  updatedAt: new Date(o.createdAt).toISOString(),
});

function evaluation(a: Acc) {
  const m = metrics(a);
  const base = {
    initialBalanceMinor: a.initial,
    balanceMinor: m.balanceMinor,
    equityMinor: m.equityMinor,
    dayStartBalanceMinor: a.dayStartBalance,
    dayStartEquityMinor: a.dayStartEquity,
    highWaterMarkMinor: a.hwm,
    tradingDays: a.tradingDays,
  };
  a.hwm = nextHighWaterMark(RULES, base);
  return evaluateRules(RULES, { ...base, highWaterMarkMinor: a.hwm });
}

// ------------------------------------------------------------------ trading
function fill(a: Acc, o: Ord, price: bigint, commission: bigint) {
  const s = spec(o.symbol);
  const idx = st.positions.findIndex((p) => p.accountId === a.id && p.symbol === o.symbol);
  const cur = idx >= 0 ? st.positions[idx]! : null;
  const r = applyFill(
    cur?.state ?? null,
    { side: o.side, qty: o.qty, price, leverage: o.leverage },
    s,
  );
  a.balance += r.realizedPnlMinor - commission;
  const flipped = cur && r.position && r.position.side !== cur.state.side;
  if (cur && (!r.position || flipped)) st.positions.splice(idx, 1);
  if (r.position) {
    if (cur && !flipped) {
      cur.state = r.position;
      if (o.sl !== null) cur.sl = o.sl;
      if (o.tp !== null) cur.tp = o.tp;
    } else
      st.positions.push({
        id: uid(),
        accountId: a.id,
        symbol: o.symbol,
        state: r.position,
        sl: o.sl,
        tp: o.tp,
        realized: 0n,
        openedAt: Date.now(),
      });
  }
  o.status = 'FILLED';
  o.avgFillPrice = price;
  st.fills.push({
    id: uid(),
    orderId: o.id,
    accountId: a.id,
    symbol: o.symbol,
    side: o.side,
    qty: o.qty,
    price,
    commission,
    realized: r.realizedPnlMinor,
    at: Date.now(),
  });
  const d = today();
  if (a.lastTradingDate !== d) {
    a.lastTradingDate = d;
    a.tradingDays += 1;
  }
  const m = metrics(a);
  a.equity.push({ t: Date.now(), e: m.equityMinor, b: m.balanceMinor });
}

function placeOrder(a: Acc, b: Record<string, unknown>, source = 'USER'): Ord {
  if (!tradable(a)) throw new Fail(422, 'ACCOUNT_NOT_ACTIVE');
  const s = spec(String(b.symbol));
  const q = quote(s.symbol);
  if (!q) throw new Fail(422, 'MARKET_DATA_STALE');
  const parse = (v: unknown, d: number, code: string) => {
    if (v === undefined || v === null || v === '') return undefined;
    try {
      return fromDecimalString(String(v), d);
    } catch {
      throw new Fail(422, code);
    }
  };
  const type = String(b.type) as Ord['type'];
  const req = {
    side: String(b.side) as 'BUY' | 'SELL',
    type,
    qty: parse(b.qty, s.qtyDecimals, 'QTY_PRECISION') ?? 0n,
    limitPrice:
      type === 'LIMIT' ? parse(b.limitPrice, s.priceDecimals, 'PRICE_PRECISION') : undefined,
    stopPrice: type === 'STOP' ? parse(b.stopPrice, s.priceDecimals, 'PRICE_PRECISION') : undefined,
    leverage: Number(b.leverage),
    reduceOnly: Boolean(b.reduceOnly),
  };
  const cur = st.positions.find((p) => p.accountId === a.id && p.symbol === s.symbol);
  try {
    validateOrder(req, {
      spec: s,
      quote: q,
      position: cur?.state ?? null,
      metrics: metrics(a),
      accountMaxLeverage: a.maxLeverage,
    });
  } catch (e) {
    if (e instanceof TradingError) throw new Fail(422, e.code);
    throw e;
  }
  const sl = parse(b.slPrice, s.priceDecimals, 'PRICE_PRECISION') ?? null;
  const tp = parse(b.tpPrice, s.priceDecimals, 'PRICE_PRECISION') ?? null;
  const ref = req.limitPrice ?? req.stopPrice ?? (req.side === 'BUY' ? q.ask : q.bid);
  const long = req.side === 'BUY';
  if (sl !== null && (long ? sl >= ref : sl <= ref)) throw new Fail(422, 'SL_INVALID');
  if (tp !== null && (long ? tp <= ref : tp >= ref)) throw new Fail(422, 'TP_INVALID');
  const o: Ord = {
    id: uid(),
    accountId: a.id,
    clientOrderId: String(b.clientOrderId ?? uid()),
    symbol: s.symbol,
    side: req.side,
    type,
    qty: req.qty,
    limitPrice: req.limitPrice ?? null,
    stopPrice: req.stopPrice ?? null,
    sl,
    tp,
    leverage: req.leverage,
    reduceOnly: req.reduceOnly,
    status: 'OPEN',
    avgFillPrice: null,
    rejectCode: null,
    source,
    createdAt: Date.now(),
  };
  st.orders.push(o);
  const exec =
    type === 'MARKET'
      ? marketExecution(o.side, o.qty, q, s)
      : type === 'LIMIT'
        ? limitExecution(o.side, o.qty, o.limitPrice!, q, s)
        : null;
  if (exec) fill(a, o, exec.price, exec.commissionMinor);
  return o;
}

function closePosition(a: Acc, p: Pos, q?: bigint, source = 'USER') {
  const s = spec(p.symbol);
  const qt = market.quotes.get(p.symbol)!;
  const side = p.state.side === 'LONG' ? 'SELL' : 'BUY';
  const amount = q ?? p.state.qty;
  const o: Ord = {
    id: uid(),
    accountId: a.id,
    clientOrderId: uid(),
    symbol: p.symbol,
    side,
    type: 'MARKET',
    qty: amount,
    limitPrice: null,
    stopPrice: null,
    sl: null,
    tp: null,
    leverage: p.state.leverage,
    reduceOnly: true,
    status: 'OPEN',
    avgFillPrice: null,
    rejectCode: null,
    source,
    createdAt: Date.now(),
  };
  st.orders.push(o);
  const exec = marketExecution(side, amount, qt, s);
  fill(a, o, exec.price, exec.commissionMinor);
  return o;
}

/** Called on every simulated tick: matcher, SL/TP, rules, equity points. */
export function onTick() {
  for (const o of st.orders.filter((x) => x.status === 'OPEN')) {
    const a = st.accounts.find((x) => x.id === o.accountId);
    const q = quote(o.symbol);
    if (!a || !q || !tradable(a)) continue;
    const s = spec(o.symbol);
    const exec =
      o.type === 'LIMIT'
        ? limitExecution(o.side, o.qty, o.limitPrice!, q, s)
        : isStopTriggered(o.side, o.stopPrice!, q)
          ? marketExecution(o.side, o.qty, q, s)
          : null;
    if (exec) fill(a, o, exec.price, exec.commissionMinor);
  }
  for (const p of [...st.positions]) {
    const q = quote(p.symbol);
    const a = st.accounts.find((x) => x.id === p.accountId);
    if (!q || !a) continue;
    const pxNow = closePrice(directionOf(p.state.side), q);
    const long = p.state.side === 'LONG';
    const hitSl = p.sl !== null && (long ? pxNow <= p.sl : pxNow >= p.sl);
    const hitTp = p.tp !== null && (long ? pxNow >= p.tp : pxNow <= p.tp);
    if (hitSl || hitTp) closePosition(a, p, undefined, hitSl ? 'SYSTEM_SL' : 'SYSTEM_TP');
  }
  for (const a of st.accounts) {
    if (!a.rules || !tradable(a)) continue;
    const ev = evaluation(a);
    if (ev.breach) {
      for (const p of st.positions.filter((x) => x.accountId === a.id))
        closePosition(a, p, undefined, 'SYSTEM_BREACH');
      for (const o of st.orders.filter((x) => x.accountId === a.id && x.status === 'OPEN'))
        o.status = 'CANCELLED';
      a.status = 'FAILED';
      a.failReason = ev.breach;
    }
  }
  const now = Date.now();
  for (const a of st.accounts) {
    const last = a.equity.at(-1);
    if (st.positions.some((p) => p.accountId === a.id) && (!last || now - last.t > 10_000)) {
      const m = metrics(a);
      a.equity.push({ t: now, e: m.equityMinor, b: m.balanceMinor });
    }
  }
  save(st);
}

// ------------------------------------------------------------------ routing
type Handler = (m: RegExpMatchArray, b: Record<string, unknown>, url: URL) => Response;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, path: string, h: Handler) =>
  routes.push([method, new RegExp(`^${path.replace(/\{(\w+)\}/g, '([^/]+)')}$`), h]);

on('GET', '/config', () => json(200, { devTools: true }));
on('POST', '/auth/register', (_m, b) => {
  const email = String(b.email).trim().toLowerCase();
  if (st.users.some((u) => u.email === email)) throw new Fail(409, 'EMAIL_TAKEN');
  if (String(b.password ?? '').length < 12) throw new Fail(400, 'VALIDATION_ERROR');
  const u: User = {
    id: uid(),
    email,
    password: String(b.password),
    locale: String(b.locale ?? 'en'),
    country: String(b.country),
    emailVerified: true,
    twoFactorEnabled: false,
  }; // demo: no emails are sent
  st.users.push(u);
  newAccount(u.id, 'DEMO', 10_000_000n, 'Demo');
  st.sessionUserId = u.id;
  return json(201, auth(u));
});
on('POST', '/auth/login', (_m, b) => {
  const u = st.users.find(
    (x) => x.email === String(b.email).trim().toLowerCase() && x.password === b.password,
  );
  if (!u) throw new Fail(401, 'INVALID_CREDENTIALS');
  if (u.twoFactorEnabled) return json(200, { mfaRequired: true, mfaToken: `mfa.${u.id}` });
  st.sessionUserId = u.id;
  return json(200, auth(u));
});
on('POST', '/auth/2fa/verify', (_m, b) => {
  const u = st.users.find((x) => `mfa.${x.id}` === b.mfaToken);
  if (!u || !(/^\d{6}$/.test(String(b.code ?? '')) || b.recoveryCode))
    throw new Fail(401, 'TWO_FACTOR_CODE_INVALID');
  st.sessionUserId = u.id;
  return json(200, auth(u));
});
on('POST', '/auth/refresh', () => {
  const u = st.users.find((x) => x.id === st.sessionUserId);
  return u ? json(200, auth(u)) : problem(401, 'REFRESH_MISSING');
});
on('POST', '/auth/logout', () => {
  st.sessionUserId = null;
  return json(204);
});
on('POST', '/auth/verify-email', () => {
  const u = st.users.find((x) => x.id === st.sessionUserId);
  if (!u) throw new Fail(422, 'TOKEN_INVALID');
  u.emailVerified = true;
  return json(204);
});
on('POST', '/auth/verify-email/resend', () => (me(), json(204)));
on('POST', '/auth/password/forgot', () => json(204));
on('POST', '/auth/password/reset', () => json(204));
on('GET', '/me', () => json(200, userDto(me())));
on('POST', '/me/password', (_m, b) => {
  if (me().password !== b.currentPassword) throw new Fail(422, 'PASSWORD_INCORRECT');
  me().password = String(b.newPassword);
  return json(204);
});
on('POST', '/me/2fa/setup', () =>
  json(200, {
    secret: 'DEMOJBSWY3DPEHPK3PXP',
    otpauthUri: `otpauth://totp/BRAND:${encodeURIComponent(me().email)}?secret=DEMOJBSWY3DPEHPK3PXP&issuer=BRAND`,
  }),
);
const codes = () =>
  Array.from(
    { length: 10 },
    () => Math.random().toString(36).slice(2, 6) + '-' + Math.random().toString(36).slice(2, 6),
  );
on('POST', '/me/2fa/enable', (_m, b) => {
  if (!/^\d{6}$/.test(String(b.code))) throw new Fail(422, 'TWO_FACTOR_CODE_INVALID');
  me().twoFactorEnabled = true;
  return json(200, { recoveryCodes: codes() });
});
on('POST', '/me/2fa/disable', (_m, b) => {
  if (me().password !== b.password) throw new Fail(422, 'PASSWORD_INCORRECT');
  me().twoFactorEnabled = false;
  return json(204);
});
on('POST', '/me/2fa/recovery-codes', () => json(200, { recoveryCodes: codes() }));
on('GET', '/me/sessions', () =>
  json(200, [
    {
      id: '00000000-0000-7000-8000-000000000001',
      userAgent: navigator.userAgent,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      current: true,
    },
  ]),
);
on('GET', '/me/watchlist', () =>
  json(200, { symbols: st.watchlist[me().id] ?? ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] }),
);
on('PUT', '/me/watchlist', (_m, b) => {
  st.watchlist[me().id] = (b.symbols as string[]).filter((s) => bySymbol.has(s));
  return json(200, { symbols: st.watchlist[me().id] });
});

on('GET', '/instruments', () =>
  json(
    200,
    DEMO_INSTRUMENTS.map((i) => ({
      symbol: i.symbol,
      displayName: i.displayName,
      baseAsset: i.baseAsset,
      quoteAsset: i.quoteAsset,
      priceDecimals: i.priceDecimals,
      qtyDecimals: i.qtyDecimals,
      tickSize: toDecimalString(i.tickSize, i.priceDecimals),
      minQty: toDecimalString(i.minQty, i.qtyDecimals),
      qtyStep: toDecimalString(i.qtyStep, i.qtyDecimals),
      maxLeverage: i.maxLeverage,
      commissionBps: i.commissionBps,
    })),
  ),
);
on('GET', '/market/status', () => json(200, { source: 'simulated', status: 'connected' }));
on('GET', '/market/tickers', () =>
  json(
    200,
    DEMO_INSTRUMENTS.map((i) => {
      const h = market.history(i.symbol, '1h', 24);
      const last = market.mid(i.symbol);
      const open = Number(h[0]!.o);
      return {
        symbol: i.symbol,
        last,
        open24h: h[0]!.o,
        changeBps: Math.round(((Number(last) - open) / open) * 10_000),
        high24h: null,
        low24h: null,
      };
    }),
  ),
);
on('GET', '/instruments/{s}/candles', (m, _b, url) =>
  json(
    200,
    market.history(
      spec(m[1]!).symbol,
      url.searchParams.get('tf') ?? '1m',
      Number(url.searchParams.get('limit') ?? 300),
    ),
  ),
);
on('GET', '/instruments/{s}/quote', (m) => {
  const s = spec(m[1]!);
  const q = quote(s.symbol);
  if (!q) throw new Fail(422, 'MARKET_DATA_STALE');
  return json(200, {
    symbol: s.symbol,
    bid: px(q.bid, s.symbol),
    ask: px(q.ask, s.symbol),
    markPrice: market.mid(s.symbol),
    fundingRate: '0.00010000',
    ts: q.ts,
  });
});

on('GET', '/accounts', () =>
  json(200, st.accounts.filter((a) => a.userId === me().id).map(accountDto)),
);
on('GET', '/accounts/{id}', (m) => json(200, accountDto(ownAcc(m[1]!))));
on('GET', '/accounts/{id}/positions', (m) => {
  const a = ownAcc(m[1]!);
  return json(
    200,
    st.positions
      .filter((p) => p.accountId === a.id)
      .map((p) => {
        const s = spec(p.symbol);
        const q = quote(p.symbol);
        return {
          id: p.id,
          symbol: p.symbol,
          side: p.state.side,
          qty: qty(p.state.qty, p.symbol),
          avgEntryPrice: px(p.state.avgEntryPrice, p.symbol),
          markPrice: q ? px(closePrice(directionOf(p.state.side), q), p.symbol) : null,
          leverage: p.state.leverage,
          usedMarginMinor: usedMarginMinor(p.state, s).toString(),
          unrealizedPnlMinor: q ? unrealizedPnlMinor(p.state, q, s).toString() : null,
          realizedPnlMinor: p.realized.toString(),
          fundingAccruedMinor: '0',
          slPrice: px(p.sl, p.symbol),
          tpPrice: px(p.tp, p.symbol),
          openedAt: new Date(p.openedAt).toISOString(),
        };
      }),
  );
});
on('GET', '/accounts/{id}/orders', (m, _b, url) => {
  const a = ownAcc(m[1]!);
  const open = url.searchParams.get('status') !== 'history';
  return json(
    200,
    st.orders
      .filter((o) => o.accountId === a.id && (open ? o.status === 'OPEN' : o.status !== 'OPEN'))
      .sort((x, y) => y.createdAt - x.createdAt)
      .map(orderDto),
  );
});
on('GET', '/accounts/{id}/fills', (m) =>
  json(
    200,
    st.fills
      .filter((f) => f.accountId === ownAcc(m[1]!).id)
      .map((f) => ({
        id: f.id,
        orderId: f.orderId,
        symbol: f.symbol,
        side: f.side,
        qty: qty(f.qty, f.symbol),
        price: px(f.price, f.symbol),
        commissionMinor: f.commission.toString(),
        realizedPnlMinor: f.realized.toString(),
        executedAt: new Date(f.at).toISOString(),
      })),
  ),
);
on('GET', '/accounts/{id}/ledger', () => json(200, []));
on('GET', '/accounts/{id}/equity', (m) => {
  const a = ownAcc(m[1]!);
  const now = metrics(a);
  return json(200, [
    ...a.equity.map((p) => ({ t: p.t, equityMinor: p.e.toString(), balanceMinor: p.b.toString() })),
    {
      t: Date.now(),
      equityMinor: now.equityMinor.toString(),
      balanceMinor: now.balanceMinor.toString(),
    },
  ]);
});
on('GET', '/accounts/{id}/rules', (m) => {
  const a = ownAcc(m[1]!);
  if (!a.rules)
    return json(200, {
      ruleSet: null,
      rules: [],
      breach: null,
      passed: false,
      status: a.status,
      failReason: a.failReason,
      tradingDays: a.tradingDays,
    });
  const ev = evaluation(a);
  return json(200, {
    ruleSet: {
      code: 'INSTANT_EXAMPLE',
      version: 1,
      name: 'Instant funding (example rules)',
      isExample: true,
      maxDailyLossBps: RULES.maxDailyLossBps,
      maxDrawdownBps: RULES.maxDrawdownBps,
      drawdownType: RULES.drawdownType,
      profitTargetBps: null,
      minTradingDays: 0,
      profitSplitBps: RULES.profitSplitBps,
      maxLeverage: RULES.maxLeverage,
    },
    rules: ev.rules.map((r) => ({
      rule: r.rule,
      usedMinor: r.usedMinor.toString(),
      limitMinor: r.limitMinor.toString(),
      floorEquityMinor: r.floorEquityMinor?.toString() ?? null,
      state: r.state,
      reached: r.reached ?? null,
    })),
    breach: a.status === 'FAILED' ? a.failReason : ev.breach,
    passed: ev.passed,
    status: a.status,
    failReason: a.failReason,
    tradingDays: a.tradingDays,
  });
});
on('POST', '/accounts/{id}/orders', (m, b) => json(201, orderDto(placeOrder(ownAcc(m[1]!), b))));
on('DELETE', '/accounts/{id}/orders/{oid}', (m) => {
  const a = ownAcc(m[1]!);
  const o = st.orders.find((x) => x.id === m[2] && x.accountId === a.id);
  if (!o) throw new Fail(404, 'ORDER_NOT_FOUND');
  if (o.status !== 'OPEN') throw new Fail(422, 'ORDER_NOT_OPEN');
  o.status = 'CANCELLED';
  return json(200, orderDto(o));
});
on('PATCH', '/accounts/{id}/positions/{pid}', (m, b) => {
  const a = ownAcc(m[1]!);
  const p = st.positions.find((x) => x.id === m[2] && x.accountId === a.id);
  if (!p) throw new Fail(404, 'POSITION_NOT_FOUND');
  const d = spec(p.symbol).priceDecimals;
  const q = quote(p.symbol)!;
  const long = p.state.side === 'LONG';
  const now = long ? q.bid : q.ask;
  const sl =
    b.slPrice === null || b.slPrice === undefined ? null : fromDecimalString(String(b.slPrice), d);
  const tp =
    b.tpPrice === null || b.tpPrice === undefined ? null : fromDecimalString(String(b.tpPrice), d);
  if (sl !== null && (long ? sl >= now : sl <= now)) throw new Fail(422, 'SL_INVALID');
  if (tp !== null && (long ? tp <= now : tp >= now)) throw new Fail(422, 'TP_INVALID');
  p.sl = sl;
  p.tp = tp;
  return json(204);
});
on('POST', '/accounts/{id}/positions/{pid}/close', (m, b) => {
  const a = ownAcc(m[1]!);
  const p = st.positions.find((x) => x.id === m[2] && x.accountId === a.id);
  if (!p) throw new Fail(404, 'POSITION_NOT_FOUND');
  const q = b.qty ? fromDecimalString(String(b.qty), spec(p.symbol).qtyDecimals) : undefined;
  return json(200, orderDto(closePosition(a, p, q)));
});
on('POST', '/accounts/{id}/positions/close-all', (m) => {
  const a = ownAcc(m[1]!);
  const list = st.positions.filter((p) => p.accountId === a.id);
  for (const p of list) closePosition(a, p);
  return json(200, { closed: list.length });
});
on('POST', '/accounts/{id}/reset', (m) => {
  const a = ownAcc(m[1]!);
  if (a.kind !== 'DEMO') throw new Fail(422, 'NOT_A_DEMO_ACCOUNT');
  if (st.positions.some((p) => p.accountId === a.id)) throw new Fail(422, 'POSITIONS_OPEN');
  for (const o of st.orders.filter((x) => x.accountId === a.id && x.status === 'OPEN'))
    o.status = 'CANCELLED';
  a.balance = a.initial;
  a.equity.push({ t: Date.now(), e: a.initial, b: a.initial });
  return json(204);
});
on('POST', '/dev/example-funded-account', () =>
  json(201, { id: newAccount(me().id, 'FUNDED', 2_500_000n, 'Instant $25K (example)').id }),
);

// Landing page catalogue (same example data as the MSW mocks).
on('GET', '/products', () => json(200, { items: exampleProducts }));
on('GET', '/public/payouts-feed', () => json(200, { items: [] }));
const QUOTE_ID = /^q_(\d+)_(\d+)$/;
const quoteDto = (size: bigint, dd: number) => ({
  quoteId: `q_${size}_${dd}`,
  priceMinor: exampleQuotePriceMinor(size, dd).toString(),
  priceCurrency: 'EUR',
  accountSizeMinor: String(size),
  rules: exampleRules(dd),
  expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
});
on('POST', '/products/quote', (_m, b) => {
  const size = BigInt(String(b.accountSizeMinor));
  if (size < 500_000n || size > 20_000_000n || size % 500_000n !== 0n)
    throw new Fail(422, 'ACCOUNT_SIZE_INVALID');
  return json(200, quoteDto(size, Number(b.maxDrawdownBps)));
});
on('GET', '/products/quotes/{id}', (m) => {
  const q = QUOTE_ID.exec(decodeURIComponent(m[1]!));
  if (!q) throw new Fail(404, 'QUOTE_NOT_FOUND');
  return json(200, quoteDto(BigInt(q[1]!), Number(q[2])));
});
on('GET', '/products/{id}', (m) => {
  const p = exampleProducts.find((x) => x.id === decodeURIComponent(m[1]!));
  if (!p) throw new Fail(404, 'PRODUCT_NOT_FOUND');
  return json(200, p);
});

// Checkout with the TEST payment provider: no money moves, the pay page picks the outcome.
const purchases = () => (st.purchases ??= []);
const purchaseDto = (p: Purchase) => ({
  id: p.id,
  status: p.status,
  type: 'INSTANT',
  quantity: p.quantity,
  accountSizeMinor: String(p.size),
  unitPriceMinor: String(p.unitPrice),
  totalMinor: String(p.unitPrice * BigInt(p.quantity)),
  currency: 'EUR',
  provider: 'fake',
  isTestPayment: true,
  paymentUrl: p.status === 'PENDING' ? `demo://checkout/${p.id}/pay` : null,
  failureCode:
    p.status === 'FAILED'
      ? 'PAYMENT_FAILED'
      : p.status === 'CANCELLED'
        ? 'PAYMENT_CANCELLED'
        : null,
  accountIds: p.accountIds,
  rules: exampleRules(p.drawdownBps),
  createdAt: new Date(p.createdAt).toISOString(),
});
const ownPurchase = (id: string) => {
  const p = purchases().find((x) => x.id === id && x.userId === me().id);
  if (!p) throw new Fail(404, 'PURCHASE_NOT_FOUND');
  return p;
};
const sizeLabel = (minor: bigint) => `$${minor / 100_000n}K`;
on('POST', '/checkout', (_m, b) => {
  const u = me();
  if (b.acceptTerms !== true) throw new Fail(400, 'VALIDATION_ERROR');
  const quantity = Math.min(5, Math.max(1, Number(b.quantity) || 1));
  let size: bigint;
  let price: bigint;
  let dd: number;
  if (b.productId) {
    const p = exampleProducts.find((x) => x.id === b.productId);
    if (!p) throw new Fail(404, 'PRODUCT_NOT_FOUND');
    size = BigInt(p.accountSizeMinor);
    price = BigInt(p.priceMinor);
    dd = p.rules.maxDrawdownBps;
  } else {
    const q = QUOTE_ID.exec(String(b.quoteId ?? ''));
    if (!q) throw new Fail(404, 'QUOTE_NOT_FOUND');
    size = BigInt(q[1]!);
    dd = Number(q[2]);
    price = exampleQuotePriceMinor(size, dd);
  }
  const p: Purchase = {
    id: uid(),
    userId: u.id,
    quantity,
    size,
    unitPrice: price,
    drawdownBps: dd,
    status: 'PENDING',
    accountIds: [],
    createdAt: Date.now(),
  };
  purchases().push(p);
  return json(201, purchaseDto(p));
});
on('GET', '/checkout', () =>
  json(200, {
    items: purchases()
      .filter((p) => p.userId === me().id)
      .map(purchaseDto),
  }),
);
on('GET', '/checkout/{id}', (m) => json(200, purchaseDto(ownPurchase(m[1]!))));
on('POST', '/checkout/{id}/test-payment', (m, b) => {
  const p = ownPurchase(m[1]!);
  if (p.status === 'PENDING') {
    if (b.outcome === 'succeeded') {
      for (let i = 1; i <= p.quantity; i++) {
        const label = `Instant ${sizeLabel(p.size)}${p.quantity > 1 ? ` #${i}` : ''}`;
        p.accountIds.push(newAccount(p.userId, 'FUNDED', p.size, label).id);
      }
      p.status = 'FULFILLED';
    } else p.status = b.outcome === 'failed' ? 'FAILED' : 'CANCELLED';
  }
  return json(200, purchaseDto(p));
});
on('GET', '/accounts/{id}/funding', (m) => {
  const a = ownAcc(m[1]!);
  const profit = a.balance > a.initial ? a.balance - a.initial : 0n;
  if (a.kind !== 'FUNDED')
    return json(200, {
      available: false,
      isExample: false,
      accountSizeMinor: String(a.initial),
      profitSplitBps: null,
      profitMinor: String(profit),
      traderShareMinor: '0',
      payout: null,
      scaling: null,
    });
  const f = fundingProgress(FUNDING, {
    initialBalanceMinor: a.initial,
    balanceMinor: a.balance,
    payoutBaselineMinor: a.initial,
    scalingProfitMinor: a.balance - a.initial,
    cycleStartedAtMs: a.createdAt,
    nowMs: Date.now(),
    cycleTradingDays: a.tradingDays,
    payoutsCount: 0,
    hasOpenPositions: st.positions.some((p) => p.accountId === a.id),
  });
  return json(200, {
    available: true,
    isExample: true,
    accountSizeMinor: String(a.initial),
    profitSplitBps: FUNDING.profitSplitBps,
    profitMinor: String(f.profitMinor),
    traderShareMinor: String(f.traderShareMinor),
    payout: {
      eligible: f.payout.eligible && a.status === 'FUNDED_ACTIVE',
      eligibleFrom: new Date(f.payout.eligibleFromMs).toISOString(),
      kycRequired: true,
      conditions: f.payout.conditions.map((c) => ({
        code: c.code,
        met: c.met,
        current: String(c.current),
        required: String(c.required),
      })),
    },
    scaling: {
      profitMinor: String(f.scaling.profitMinor),
      targetMinor: String(f.scaling.targetMinor),
      targetBps: FUNDING.scalingProfitTargetBps,
      payouts: 0,
      requiredPayouts: FUNDING.scalingMinPayouts,
      eligible: false,
      stepBps: FUNDING.scalingStepBps,
      nextSizeMinor: String(f.scaling.nextSizeMinor),
      maxSizeMinor: String(FUNDING.scalingMaxBalanceMinor),
      atMaximum: f.scaling.atMaximum,
    },
  });
});

/** Route /api/v1/* requests to the in-browser backend; everything else goes to the network. */
export function installDemoBackend() {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const i = url.pathname.indexOf('/api/v1/');
    if (i < 0) return original(input, init);
    const path = url.pathname.slice(i + 7);
    const text = req.method === 'GET' || req.method === 'DELETE' ? '' : await req.text();
    let b: Record<string, unknown> = {};
    try {
      b = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      /* empty */
    }
    await new Promise((r) => setTimeout(r, 60)); // feel like a network
    for (const [method, re, h] of routes) {
      const m = path.match(re);
      if (m && method === req.method) {
        try {
          const res = h(m, b, url);
          save(st);
          return res;
        } catch (e) {
          if (e instanceof Fail) return problem(e.status, e.code);
          console.error(e);
          return problem(500, 'INTERNAL_ERROR');
        }
      }
    }
    return problem(404, 'NOT_FOUND');
  };
}
