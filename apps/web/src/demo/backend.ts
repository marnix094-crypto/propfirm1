/**
 * DEMO BACKEND — runs entirely in the browser for the shareable preview (no server).
 * Emulates the REST API used by the app with the real @brand/engine for execution, PnL,
 * margin and rule evaluation. Data is simulated and kept in this browser only.
 */
import {
  applyBps,
  accountMetrics,
  applyFill,
  closePrice,
  directionOf,
  evaluateRules,
  fundingProgress,
  monthCalendar,
  tradeStats,
  tradeStatsBy,
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
import { CLIENT_MODULES } from '@brand/shared';
import { bySymbol, DEMO_INSTRUMENTS, DemoMarket } from './market';
import { createCompeteDemo } from './compete';

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
  discount?: bigint;
  offerCode?: string;
}

interface User {
  id: string;
  email: string;
  password: string;
  locale: string;
  country: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** Preview admin (Daily Funded staff): admin login only, no trading account. */
  staff?: boolean;
}
interface Acc {
  id: string;
  userId: string;
  kind: 'DEMO' | 'FUNDED' | 'COMPETITION';
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
  offers?: {
    id: string;
    userId: string;
    code: string;
    discountBps: number;
    expiresAt: number;
    usedAt: number | null;
    purchaseId: string | null;
    createdAt: number;
    points: number;
  }[];
  profiles?: Record<string, { nickname: string; leaderboardOptIn: boolean }>;
  compEntries?: { competitionId: string; userId: string; accountId: string }[];
  copier?: {
    id: string;
    userId: string;
    master: string;
    follower: string;
    mult: number;
    active: boolean;
    createdAt: number;
  }[];
  copyEvents?: {
    id: string;
    linkId: string;
    symbol: string;
    side: string;
    qty: string;
    status: string;
    code: string | null;
    at: number;
  }[];
  certificates?: {
    id: string;
    userId: string;
    accountId: string;
    size: bigint;
    issuedAt: number;
  }[];
  journal?: {
    id: string;
    userId: string;
    accountId: string | null;
    date: string;
    title: string;
    body: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
  }[];
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
  roles: u.staff ? ['ADMIN'] : ['TRADER'],
  locale: u.locale,
  country: u.country,
  emailVerified: u.emailVerified,
  twoFactorEnabled: u.twoFactorEnabled,
  firmRole: null,
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

function newAccount(
  userId: string,
  kind: 'DEMO' | 'FUNDED' | 'COMPETITION',
  initial: bigint,
  label: string,
): Acc {
  const a: Acc = {
    id: uid(),
    userId,
    kind,
    label,
    status: kind === 'FUNDED' ? 'FUNDED_ACTIVE' : 'ACTIVE',
    initial,
    balance: initial,
    maxLeverage: kind === 'FUNDED' ? RULES.maxLeverage : 50,
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
    createdAt: new Date(a.createdAt).toISOString(),
    endedAt: null,
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
/** Preview-only admin credentials (also shown on the partner login in preview builds). */
const DEMO_ADMIN = { email: 'admin@dailyfunded.demo', password: 'demo-admin-2026' };
on('POST', '/auth/login', (_m, b) => {
  const email = String(b.email).trim().toLowerCase();
  const admin = b.audience === 'admin';
  if (admin && email === DEMO_ADMIN.email && !st.users.some((x) => x.email === email))
    st.users.push({
      id: 'demo-admin',
      email,
      password: DEMO_ADMIN.password,
      locale: 'en',
      country: 'NL',
      emailVerified: true,
      twoFactorEnabled: false,
      staff: true,
    });
  // Admins only on the admin login, clients only on the client login (D91).
  const u = st.users.find(
    (x) => x.email === email && x.password === b.password && !!x.staff === admin,
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
    otpauthUri: `otpauth://totp/Daily%20Funded:${encodeURIComponent(me().email)}?secret=DEMOJBSWY3DPEHPK3PXP&issuer=Daily%20Funded`,
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
on('POST', '/accounts/{id}/orders', (m, b) => {
  const a = ownAcc(m[1]!);
  const o = placeOrder(a, b);
  mirror(a, o);
  return json(201, orderDto(o));
});
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
  const o = closePosition(a, p, q);
  mirror(a, o);
  return json(200, orderDto(o));
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
/**
 * EXAMPLE history for the preview only (labelled "example" in the account name): ~3 weeks of
 * closed BTC trades with deterministic pseudo-random results, so the dashboard's win rate and
 * PnL calendar can be seen. Never used outside the demo build.
 */
function seedExampleHistory(a: Acc) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = Date.now();
  let balance = a.initial;
  a.equity = [{ t: now - 22 * DAY, e: balance, b: balance }];
  a.createdAt = now - 22 * DAY;
  for (let d = 21; d >= 1; d--) {
    const dayStart = now - d * DAY;
    const wd = new Date(dayStart).getUTCDay();
    if (wd === 0 || wd === 6 || rnd() < 0.15) continue; // weekends / days off
    const n = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const win = rnd() < 0.58;
      const size = BigInt(Math.round(win ? 4_000 + rnd() * 26_000 : 3_000 + rnd() * 17_000));
      const realized = win ? size : -size;
      const commission = 240n;
      const at = dayStart + (k + 1) * 3_600_000;
      st.fills.push({
        id: uid(),
        orderId: uid(),
        accountId: a.id,
        symbol: 'BTCUSDT',
        side: 'SELL',
        qty: 100n,
        price: 6_700_000n,
        commission,
        realized,
        at,
      });
      balance += realized - commission;
      a.equity.push({ t: at, e: balance, b: balance });
    }
    a.tradingDays += 1;
  }
  a.balance = balance;
  a.hwm = balance > a.hwm ? balance : a.hwm;
  a.dayStartBalance = balance;
  a.dayStartEquity = balance;
}
const DAY = 86_400_000;
on('POST', '/dev/example-funded-account', () => {
  const a = newAccount(me().id, 'FUNDED', 2_500_000n, 'Instant $25K (example)');
  seedExampleHistory(a);
  return json(201, { id: a.id });
});

const dayKey = (t: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));
on('GET', '/accounts/{id}/performance', (m, _b, url) => {
  const a = ownAcc(m[1]!);
  const month = url.searchParams.get('month') ?? today().slice(0, 7);
  const fills = st.fills.filter((f) => f.accountId === a.id);
  const trades = fills
    .filter((f) => f.realized !== 0n)
    .map((f) => ({
      netPnlMinor: f.realized - f.commission,
      day: dayKey(f.at),
      symbol: f.symbol,
      direction: f.side === 'SELL' ? 'LONG' : 'SHORT',
    }));
  const s = tradeStats(trades);
  const c = monthCalendar(
    month,
    fills.map((f) => ({ amountMinor: f.realized - f.commission, day: dayKey(f.at) })),
    trades,
  );
  const str = (v: bigint | null) => (v === null ? null : v.toString());
  const group = (g: { key: string; stats: typeof s }) => ({
    key: g.key,
    trades: g.stats.trades,
    wins: g.stats.wins,
    losses: g.stats.losses,
    winRateBps: g.stats.winRateBps,
    netPnlMinor: String(g.stats.netPnlMinor),
    profitFactorBps: g.stats.profitFactorBps,
  });
  return json(200, {
    bySymbol: tradeStatsBy(trades, (x) => x.symbol).map(group),
    byDirection: tradeStatsBy(trades, (x) => x.direction).map(group),
    stats: {
      trades: s.trades,
      wins: s.wins,
      losses: s.losses,
      winRateBps: s.winRateBps,
      grossProfitMinor: String(s.grossProfitMinor),
      grossLossMinor: String(s.grossLossMinor),
      netPnlMinor: String(s.netPnlMinor),
      avgWinMinor: str(s.avgWinMinor),
      avgLossMinor: str(s.avgLossMinor),
      profitFactorBps: s.profitFactorBps,
      expectancyMinor: str(s.expectancyMinor),
      bestTradeMinor: str(s.bestTradeMinor),
      worstTradeMinor: str(s.worstTradeMinor),
    },
    calendar: {
      month: c.month,
      days: c.days.map((d) => ({ date: d.day, pnlMinor: String(d.pnlMinor), trades: d.trades })),
      netMinor: String(c.netMinor),
      greenDays: c.greenDays,
      redDays: c.redDays,
      bestDayMinor: str(c.bestDayMinor),
      worstDayMinor: str(c.worstDayMinor),
    },
  });
});

// Landing page catalogue (same example data as the MSW mocks).
on('GET', '/products', () =>
  json(200, {
    items: adm()
      .products.filter((p) => p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => {
        const r = adm().ruleSets.find((x) => x.id === p.ruleSetId);
        return {
          ...(exampleProducts.find((e) => e.id === p.id) ?? exampleProducts[0]!),
          id: p.id,
          slug: p.slug,
          accountSizeMinor: String(p.size),
          priceMinor: String(p.price),
          isRecommended: p.isRecommended,
          isExample: p.isExample,
          rules: { ...exampleRules(r?.maxDrawdownBps ?? 600), isExample: r?.template ?? true },
        };
      }),
  }),
);
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
  totalMinor: String(p.unitPrice * BigInt(p.quantity) - (p.discount ?? 0n)),
  discountMinor: String(p.discount ?? 0n),
  offerCode: p.offerCode ?? null,
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
  let discount = 0n;
  let offer: NonNullable<State['offers']>[number] | undefined;
  if (b.offerCode) {
    offer = offers().find(
      (o) => o.userId === u.id && o.code === String(b.offerCode).trim().toUpperCase(),
    );
    if (!offer) throw new Fail(422, 'OFFER_INVALID');
    if (offer.usedAt) throw new Fail(422, 'OFFER_USED');
    if (offer.expiresAt < Date.now()) throw new Fail(422, 'OFFER_EXPIRED');
    discount = applyBps(price * BigInt(quantity), offer.discountBps);
  }
  const p: Purchase = {
    discount,
    offerCode: offer?.code,
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
  if (offer) {
    offer.usedAt = Date.now();
    offer.purchaseId = p.id;
  }
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
    } else {
      p.status = b.outcome === 'failed' ? 'FAILED' : 'CANCELLED';
      for (const o of offers().filter((x) => x.purchaseId === p.id)) {
        o.usedAt = null;
        o.purchaseId = null;
      }
    }
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

// Notebook (journal): private notes, newest first.
const journal = () => (st.journal ??= []);
const journalDto = (e: NonNullable<State['journal']>[number]) => ({
  id: e.id,
  accountId: e.accountId,
  date: e.date,
  title: e.title,
  body: e.body,
  tags: e.tags,
  createdAt: new Date(e.createdAt).toISOString(),
  updatedAt: new Date(e.updatedAt).toISOString(),
});
const cleanTags = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 8) : [];
const ownNote = (id: string) => {
  const e = journal().find((x) => x.id === id && x.userId === me().id);
  if (!e) throw new Fail(404, 'JOURNALENTRY_NOT_FOUND');
  return e;
};
on('GET', '/journal', (_m, _b, url) => {
  const limit = Number(url.searchParams.get('limit') ?? 30);
  const cursor = url.searchParams.get('cursor');
  const mine = journal()
    .filter((e) => e.userId === me().id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const start = cursor ? mine.findIndex((e) => e.id === cursor) + 1 : 0;
  const page = mine.slice(start, start + limit);
  return json(200, {
    items: page.map(journalDto),
    nextCursor: start + limit < mine.length ? page[page.length - 1]!.id : null,
  });
});
on('POST', '/journal', (_m, b) => {
  if (!String(b.title ?? '').trim()) throw new Fail(400, 'VALIDATION_ERROR');
  const now = Date.now();
  const e = {
    id: uid(),
    userId: me().id,
    accountId: typeof b.accountId === 'string' ? b.accountId : null,
    date: String(b.date),
    title: String(b.title).trim().slice(0, 120),
    body: String(b.body ?? '').slice(0, 10_000),
    tags: cleanTags(b.tags),
    createdAt: now,
    updatedAt: now,
  };
  journal().push(e);
  return json(201, journalDto(e));
});
on('PATCH', '/journal/{id}', (m, b) => {
  const e = ownNote(m[1]!);
  if (b.date !== undefined) e.date = String(b.date);
  if (b.title !== undefined) e.title = String(b.title).trim().slice(0, 120);
  if (b.body !== undefined) e.body = String(b.body).slice(0, 10_000);
  if (b.tags !== undefined) e.tags = cleanTags(b.tags);
  e.updatedAt = Date.now();
  return json(200, journalDto(e));
});
on('DELETE', '/journal/{id}', (m) => {
  const e = ownNote(m[1]!);
  st.journal = journal().filter((x) => x !== e);
  return json(204);
});

// ------------------------------------------------------------------ Daily Points & offers
const offers = () => (st.offers ??= []);
const POINTS = { TRADING_DAY: 10, EMAIL_VERIFIED: 50, TWO_FACTOR: 100, FUNDED_ACCOUNT: 250 };
const REWARD_LIST = [
  { id: 'discount-5', points: 300, discountBps: 500, validDays: 30 },
  { id: 'discount-10', points: 600, discountBps: 1000, validDays: 30 },
  { id: 'discount-20', points: 1200, discountBps: 2000, validDays: 30 },
];
function pointsOf(u: User) {
  const history: {
    id: string;
    reason: string;
    refKey: string;
    amount: number;
    createdAt: string;
  }[] = [];
  const add = (reason: string, refKey: string, amount: number, at: number) =>
    history.push({
      id: `${reason}-${refKey}`,
      reason,
      refKey,
      amount,
      createdAt: new Date(at).toISOString(),
    });
  const firstAcc = st.accounts.find((a) => a.userId === u.id);
  if (u.emailVerified)
    add('EMAIL_VERIFIED', 'email', POINTS.EMAIL_VERIFIED, firstAcc?.createdAt ?? Date.now());
  if (u.twoFactorEnabled) add('TWO_FACTOR', '2fa', POINTS.TWO_FACTOR, Date.now());
  for (const p of purchases().filter((x) => x.userId === u.id && x.status === 'FULFILLED'))
    for (const id of p.accountIds) add('FUNDED_ACCOUNT', id, POINTS.FUNDED_ACCOUNT, p.createdAt);
  const days = new Map<string, number>();
  for (const f of st.fills) {
    const a = st.accounts.find((x) => x.id === f.accountId);
    if (a?.userId === u.id && !days.has(dayKey(f.at))) days.set(dayKey(f.at), f.at);
  }
  for (const [d, at] of days) add('TRADING_DAY', d, POINTS.TRADING_DAY, at);
  for (const o of offers().filter((x) => x.userId === u.id))
    add('REDEEM', o.id, -o.points, o.createdAt);
  history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const earned = history.filter((h) => h.amount > 0).reduce((s2, h) => s2 + h.amount, 0);
  const spent = -history.filter((h) => h.amount < 0).reduce((s2, h) => s2 + h.amount, 0);
  return { balance: earned - spent, earned, spent, history: history.slice(0, 50) };
}
const offerDto = (o: NonNullable<State['offers']>[number]) => ({
  id: o.id,
  code: o.code,
  discountBps: o.discountBps,
  source: 'POINTS',
  expiresAt: new Date(o.expiresAt).toISOString(),
  usedAt: o.usedAt ? new Date(o.usedAt).toISOString() : null,
  status: o.usedAt ? 'USED' : o.expiresAt < Date.now() ? 'EXPIRED' : 'AVAILABLE',
  createdAt: new Date(o.createdAt).toISOString(),
});
on('GET', '/points', () =>
  json(200, {
    ...pointsOf(me()),
    rewards: REWARD_LIST,
    earnRules: Object.entries(POINTS).map(([reason, points]) => ({ reason, points })),
    isExample: true,
  }),
);
on('POST', '/points/redeem', (_m, b) => {
  const u = me();
  const r = REWARD_LIST.find((x) => x.id === b.rewardId);
  if (!r) throw new Fail(404, 'REWARD_NOT_FOUND');
  if (pointsOf(u).balance < r.points) throw new Fail(422, 'POINTS_INSUFFICIENT');
  const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code =
    'DF-' +
    Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((x) => B32[x % B32.length])
      .join('');
  const o = {
    id: uid(),
    userId: u.id,
    code,
    discountBps: r.discountBps,
    expiresAt: Date.now() + r.validDays * DAY,
    usedAt: null,
    purchaseId: null,
    createdAt: Date.now(),
    points: r.points,
  };
  offers().push(o);
  return json(201, offerDto(o));
});
on('GET', '/offers', () =>
  json(200, {
    items: offers()
      .filter((o) => o.userId === me().id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(offerDto),
  }),
);

// ------------------------------------------------------------------ profile, leaderboard, competitions
const profiles = () => (st.profiles ??= {});
const anon = (id: string) => `Trader ${id.replace(/-/g, '').slice(-4).toUpperCase()}`;
on('GET', '/me/profile', () => {
  const p = profiles()[me().id];
  return json(200, {
    nickname: p?.nickname ?? null,
    leaderboardOptIn: p?.leaderboardOptIn ?? false,
  });
});
on('PATCH', '/me/profile', (_m, b) => {
  const u = me();
  const cur = profiles()[u.id];
  const nickname = typeof b.nickname === 'string' ? b.nickname : cur?.nickname;
  if (!nickname) throw new Fail(422, 'NICKNAME_REQUIRED');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(nickname)) throw new Fail(400, 'VALIDATION_ERROR');
  if (Object.entries(profiles()).some(([id, p]) => id !== u.id && p.nickname === nickname))
    throw new Fail(409, 'NICKNAME_TAKEN');
  profiles()[u.id] = {
    nickname,
    leaderboardOptIn:
      typeof b.leaderboardOptIn === 'boolean'
        ? b.leaderboardOptIn
        : (cur?.leaderboardOptIn ?? false),
  };
  return json(200, profiles()[u.id]);
});
const tradesOf = (accountId: string) =>
  st.fills.filter((f) => f.accountId === accountId && f.realized !== 0n).length;
function row(a: Acc, initial: bigint, userId: string) {
  const pnl = metrics(a).equityMinor - initial;
  return {
    name: profiles()[a.userId]?.nickname ?? anon(a.userId),
    isYou: a.userId === userId,
    returnBps: initial > 0n ? Number((pnl * 10_000n) / initial) : 0,
    accountSizeMinor: String(initial),
    pnlMinor: String(pnl),
    trades: tradesOf(a.id),
  };
}
const ranked = <T extends { returnBps: number; trades: number }>(rows: T[]) =>
  rows
    .sort((x, y) => y.returnBps - x.returnBps || y.trades - x.trades)
    .map((r, i) => ({ ...r, rank: i + 1 }));
on('GET', '/leaderboard', () => {
  const u = me();
  const funded = st.accounts.filter(
    (a) =>
      a.kind === 'FUNDED' &&
      a.status === 'FUNDED_ACTIVE' &&
      purchases().some((p) => p.accountIds.includes(a.id)),
  );
  const best = new Map<string, ReturnType<typeof row>>();
  for (const a of funded) {
    const r = row(a, a.initial, u.id);
    const prev = best.get(a.userId);
    if (!prev || r.returnBps > prev.returnBps) best.set(a.userId, r);
  }
  const isPublic = (id: string) => !!profiles()[id]?.leaderboardOptIn;
  const pub = ranked([...best.entries()].filter(([id]) => isPublic(id)).map(([, r]) => r));
  const mine = best.get(u.id);
  const you = mine
    ? isPublic(u.id)
      ? pub.find((r) => r.isYou)!
      : { ...mine, rank: pub.filter((r) => r.returnBps > mine.returnBps).length + 1 }
    : null;
  return json(200, {
    rows: pub,
    you,
    youArePublic: isPublic(u.id),
    updatedAt: new Date().toISOString(),
  });
});
function monthly() {
  const ym = today().slice(0, 7);
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const start = Date.UTC(y, m - 1, 1) - 3_600_000;
  const end = Date.UTC(y, m, 1) - 3_600_000;
  const label = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return {
    id: `00000000-0000-7000-8000-${ym.replace('-', '').padStart(12, '0')}`,
    name: `Daily Funded Monthly — ${label}`,
    start,
    end,
  };
}
const compEntries = () => (st.compEntries ??= []);
function competitionDto() {
  const c = monthly();
  const u = me();
  const entries = compEntries().filter((e) => e.competitionId === c.id);
  const rows = ranked(
    entries
      .map((e) => st.accounts.find((a) => a.id === e.accountId))
      .filter((a): a is Acc => !!a)
      .map((a) => row(a, 10_000_000n, u.id)),
  );
  const mine = entries.find((e) => e.userId === u.id);
  const now = Date.now();
  return {
    id: c.id,
    name: c.name,
    startsAt: new Date(c.start).toISOString(),
    endsAt: new Date(c.end).toISOString(),
    status: now < c.start ? 'UPCOMING' : now < c.end ? 'RUNNING' : 'ENDED',
    startingBalanceMinor: '10000000',
    maxLeverage: 50,
    prize: null,
    entrants: entries.length,
    yourAccountId: mine?.accountId ?? null,
    standings: rows.slice(0, 50),
    you: rows.find((r) => r.isYou) ?? null,
  };
}
on('GET', '/competitions', () => json(200, { items: [competitionDto()] }));
on('POST', '/competitions/{id}/join', (m) => {
  const c = monthly();
  if (m[1] !== c.id) throw new Fail(404, 'COMPETITION_NOT_FOUND');
  const u = me();
  if (!compEntries().some((e) => e.competitionId === c.id && e.userId === u.id)) {
    const a = newAccount(
      u.id,
      'COMPETITION',
      10_000_000n,
      c.name.replace('Daily Funded Monthly — ', 'Competition '),
    );
    compEntries().push({ competitionId: c.id, userId: u.id, accountId: a.id });
  }
  return json(200, competitionDto());
});
on('GET', '/public/transparency', () => {
  const funded = st.accounts.filter(
    (a) => a.kind === 'FUNDED' && purchases().some((p) => p.accountIds.includes(a.id)),
  );
  return json(200, {
    traders: st.users.length,
    fundedAccounts: funded.length,
    activeFundedAccounts: funded.filter((a) => a.status === 'FUNDED_ACTIVE').length,
    closedFundedAccounts: funded.filter((a) => a.status === 'FAILED').length,
    payouts: 0,
    payoutsTotalMinor: '0',
    competitions: 1,
    updatedAt: new Date().toISOString(),
  });
});

// ------------------------------------------------------------------ trade copier
const copier = () => (st.copier ??= []);
const copyEvents = () => (st.copyEvents ??= []);
function mirror(master: Acc, o: Ord) {
  if (o.status !== 'FILLED' || o.source !== 'USER') return;
  for (const l of copier().filter((x) => x.master === master.id && x.active)) {
    const f = st.accounts.find((a) => a.id === l.follower);
    if (!f) continue;
    const sp = spec(o.symbol);
    let q = applyBps(o.qty, l.mult);
    q -= q % sp.qtyStep;
    if (o.reduceOnly) {
      const pos = st.positions.find(
        (p) =>
          p.accountId === f.id &&
          p.symbol === o.symbol &&
          p.state.side === (o.side === 'SELL' ? 'LONG' : 'SHORT'),
      );
      q = pos ? (pos.state.qty < q || q === 0n ? pos.state.qty : q) : 0n;
    }
    const ev = {
      id: uid(),
      linkId: l.id,
      symbol: o.symbol,
      side: o.side,
      qty: qty(q, o.symbol),
      status: 'COPIED',
      code: null as string | null,
      at: Date.now(),
    };
    if (q < sp.minQty) {
      ev.status = 'SKIPPED';
      ev.code = 'COPY_SIZE_TOO_SMALL';
    } else {
      try {
        placeOrder(f, {
          clientOrderId: uid(),
          symbol: o.symbol,
          side: o.side,
          type: 'MARKET',
          qty: qty(q, o.symbol),
          leverage: Math.min(o.leverage, f.maxLeverage),
          reduceOnly: o.reduceOnly,
        });
      } catch (e) {
        ev.status = 'FAILED';
        ev.code = e instanceof Fail ? e.code : 'COPY_ERROR';
      }
    }
    copyEvents().push(ev);
  }
}
const linkDto = (l: NonNullable<State['copier']>[number]) => ({
  id: l.id,
  masterAccountId: l.master,
  followerAccountId: l.follower,
  multiplierBps: l.mult,
  active: l.active,
  createdAt: new Date(l.createdAt).toISOString(),
});
on('GET', '/copier', () => {
  const mine = copier().filter((l) => l.userId === me().id);
  const ids = new Set(mine.map((l) => l.id));
  return json(200, {
    links: mine.map(linkDto),
    events: copyEvents()
      .filter((e) => ids.has(e.linkId))
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((e) => ({ ...e, createdAt: new Date(e.at).toISOString() })),
  });
});
on('POST', '/copier/links', (_m, b) => {
  const u = me();
  const master = ownAcc(String(b.masterAccountId));
  const follower = ownAcc(String(b.followerAccountId));
  if (master.id === follower.id) throw new Fail(422, 'COPIER_SAME_ACCOUNT');
  if (
    copier().some(
      (l) => l.follower === master.id || l.master === follower.id || l.follower === follower.id,
    )
  )
    throw new Fail(409, 'COPIER_CONFLICT');
  const l = {
    id: uid(),
    userId: u.id,
    master: master.id,
    follower: follower.id,
    mult: Number(b.multiplierBps) || 10000,
    active: true,
    createdAt: Date.now(),
  };
  copier().push(l);
  return json(201, linkDto(l));
});
const ownLink = (id: string) => {
  const l = copier().find((x) => x.id === id && x.userId === me().id);
  if (!l) throw new Fail(404, 'COPIERLINK_NOT_FOUND');
  return l;
};
on('PATCH', '/copier/links/{id}', (m, b) => {
  const l = ownLink(m[1]!);
  if (typeof b.active === 'boolean') l.active = b.active;
  if (typeof b.multiplierBps === 'number') l.mult = b.multiplierBps;
  return json(200, linkDto(l));
});
on('DELETE', '/copier/links/{id}', (m) => {
  const l = ownLink(m[1]!);
  st.copier = copier().filter((x) => x !== l);
  return json(204);
});

// ------------------------------------------------------------------ certificates
const certs = () => (st.certificates ??= []);
function syncCerts(userId: string) {
  for (const p of purchases().filter((x) => x.userId === userId && x.status === 'FULFILLED'))
    for (const id of p.accountIds)
      if (!certs().some((c) => c.accountId === id))
        certs().push({ id: uid(), userId, accountId: id, size: p.size, issuedAt: p.createdAt });
}
const certDto = (c: NonNullable<State['certificates']>[number]) => ({
  id: c.id,
  type: 'FUNDED',
  accountSizeMinor: String(c.size),
  issuedAt: new Date(c.issuedAt).toISOString(),
  holder: profiles()[c.userId]?.nickname ?? anon(c.userId),
  simulated: true,
});
on('GET', '/certificates', () => {
  const u = me();
  syncCerts(u.id);
  return json(200, {
    items: certs()
      .filter((c) => c.userId === u.id)
      .map(certDto),
  });
});
on('GET', '/public/certificates/{id}', (m) => {
  const c = certs().find((x) => x.id === m[1]);
  if (!c) throw new Fail(404, 'CERTIFICATE_NOT_FOUND');
  return json(200, certDto(c));
});

// Website demo requests: the preview never sends data anywhere.
on('POST', '/public/leads', (_m, b) => {
  if (b.consent !== true || !b.email || !b.company) throw new Fail(400, 'VALIDATION_ERROR');
  return json(204);
});

// ------------------------------------------------------------------ admin panel (preview)
// In the preview every visitor owns the example firm, so the admin panel can be explored.
// Example traders below are fictitious (example.com) and only exist in this browser.
interface DemoFirm {
  name: string;
  primaryColor: string | null;
  logoDataUrl: string | null;
  domain: string | null;
  supportEmail: string | null;
  /** Demo DNS: a domain becomes ACTIVE on the second check (simulated propagation). */
  domainStatus?: 'NONE' | 'PENDING_DNS' | 'ACTIVE';
  domainChecks?: number;
}

/** Preview: example platform domain for automatic subdomains (D95). */
const DEMO_PLATFORM_DOMAIN = 'dailyfunded.com';
const demoToken = (seed: string) =>
  Array.from(seed)
    .reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
    .toString(16)
    .padStart(8, '0')
    .repeat(4);
interface DemoDomainState {
  slug: string;
  domain: string | null;
  domainStatus?: 'NONE' | 'PENDING_DNS' | 'ACTIVE';
  domainChecks?: number;
}
const domainSetupOf = (f: DemoDomainState) => ({
  domain: f.domain,
  status: f.domain ? (f.domainStatus ?? 'PENDING_DNS') : 'NONE',
  subdomain: `${f.slug}.${DEMO_PLATFORM_DOMAIN}`,
  cnameTarget: `tenants.${DEMO_PLATFORM_DOMAIN}`,
  txtName: f.domain ? `_dailyfunded-verify.${f.domain}` : null,
  txtValue: f.domain ? demoToken(f.domain) : null,
  checkedAt: f.domainChecks ? new Date().toISOString() : null,
});
/** One DNS check: missing → CNAME missing → active (simulated propagation in the preview). */
const checkDomain = (f: DemoDomainState) => {
  if (!f.domain || f.domainStatus === 'ACTIVE') return;
  f.domainChecks = (f.domainChecks ?? 0) + 1;
  if (f.domainChecks >= 2) f.domainStatus = 'ACTIVE';
};
const stepsOf = (
  f: DemoDomainState & { dedicated?: boolean; platform?: boolean; createdAt: number },
) => {
  const at = new Date(f.createdAt).toISOString();
  const step = (step: string, status: string, detail: string) => ({
    step,
    status,
    detail,
    attempts: 1,
    updatedAt: at,
  });
  const dom = !f.domain
    ? step('CUSTOM_DOMAIN', 'SKIPPED', 'NO_DOMAIN')
    : f.domainStatus === 'ACTIVE'
      ? step('CUSTOM_DOMAIN', 'DONE', 'ACTIVE')
      : step(
          'CUSTOM_DOMAIN',
          'WAITING',
          (f.domainChecks ?? 0) >= 1 ? 'CNAME_MISSING' : 'TXT_MISSING',
        );
  return [
    step('TENANT', 'DONE', f.dedicated ? 'ON_OWN_INSTANCE' : 'CATALOGUE_READY'),
    f.platform ? step('ADMIN', 'SKIPPED', 'PLATFORM_FIRM') : step('ADMIN', 'DONE', 'ADMIN_INVITED'),
    step('DATABASE', 'DONE', f.dedicated ? 'DEDICATED_READY' : 'SHARED'),
    step('SUBDOMAIN', 'DONE', 'ACTIVE'),
    dom,
  ];
};
interface ExTrader {
  id: string;
  email: string;
  country: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: number;
  lastLoginAt: number | null;
  nickname: string | null;
}
interface ExAccount {
  id: string;
  userId: string;
  label: string;
  kind: 'DEMO' | 'FUNDED' | 'COMPETITION';
  status: 'ACTIVE' | 'FUNDED_ACTIVE' | 'FAILED';
  initial: bigint;
  balance: bigint;
  ruleSetName: string | null;
  failReason: string | null;
  createdAt: number;
}
interface ExAlert {
  id: string;
  type: 'BREACH' | 'NEAR_BREACH' | 'LARGE_LOSS';
  severity: 'WARNING' | 'CRITICAL';
  accountId: string;
  userId: string;
  details: Record<string, string>;
  createdAt: number;
  ackAt: number | null;
}
interface AdminProduct {
  id: string;
  slug: string;
  size: bigint;
  price: bigint;
  ruleSetId: string;
  isActive: boolean;
  isRecommended: boolean;
  isExample: boolean;
  sortOrder: number;
}
interface AdminRuleSet {
  id: string;
  code: string;
  version: number;
  name: string;
  template: boolean;
  maxDailyLossBps: number;
  maxDrawdownBps: number;
  drawdownType: 'TRAILING' | 'STATIC';
  maxLeverage: number;
  profitSplitBps: number | null;
  payoutIntervalDays: number | null;
  minTradingDaysPerPayout: number | null;
  minPayoutMinor: string | null;
  createdAt: number;
}
interface AdminState {
  firm: DemoFirm;
  traders: ExTrader[];
  accounts: ExAccount[];
  alerts: ExAlert[];
  products: AdminProduct[];
  ruleSets: AdminRuleSet[];
  audit: {
    id: number;
    ts: number;
    action: string;
    actorType: string;
    entityType: string;
    entityId: string;
    data: Record<string, unknown>;
  }[];
  team: { id: string; email: string; role: 'OWNER' | 'ADMIN' | 'SUPPORT'; createdAt: number }[];
  sales: { at: number; amount: bigint }[];
}
type WithAdmin = State & { admin?: AdminState };

function seedAdmin(): AdminState {
  const now = Date.now();
  const tpl = (id: string, dd: number, name: string): AdminRuleSet => ({
    id,
    code: `INSTANT_${dd / 100}`,
    version: 1,
    name,
    template: true,
    maxDailyLossBps: 300,
    maxDrawdownBps: dd,
    drawdownType: 'TRAILING',
    maxLeverage: 50,
    profitSplitBps: 8000,
    payoutIntervalDays: 14,
    minTradingDaysPerPayout: 3,
    minPayoutMinor: '5000',
    createdAt: now - 60 * DAY,
  });
  const ruleSets = [
    tpl('rs-6', 600, 'Instant funding (example rules)'),
    tpl('rs-4', 400, 'Instant funding, 4% drawdown (example rules)'),
    tpl('rs-8', 800, 'Instant funding, 8% drawdown (example rules)'),
  ];
  const products: AdminProduct[] = exampleProducts.map((p, i) => ({
    id: p.id,
    slug: p.slug,
    size: BigInt(p.accountSizeMinor),
    price: BigInt(p.priceMinor),
    ruleSetId: 'rs-6',
    isActive: true,
    isRecommended: p.isRecommended,
    isExample: true,
    sortOrder: i,
  }));
  const names = ['amira', 'lucas', 'sofia', 'noah', 'emma', 'daan', 'lea', 'mateo'];
  const countries = ['NL', 'DE', 'ES', 'BE', 'FR', 'NL', 'AT', 'ES'];
  const traders: ExTrader[] = names.map((n, i) => ({
    id: `ex-${n}`,
    email: `${n}.example@example.com`,
    country: countries[i]!,
    status: i === 6 ? 'SUSPENDED' : 'ACTIVE',
    createdAt: now - (40 - i * 4) * DAY,
    lastLoginAt: i === 6 ? null : now - (i + 1) * 3_600_000,
    nickname: i % 3 === 0 ? `${n}_trades` : null,
  }));
  const accounts: ExAccount[] = [];
  const sales: AdminState['sales'] = [];
  traders.forEach((t, i) => {
    accounts.push({
      id: `ex-acc-${t.id}-demo`,
      userId: t.id,
      label: 'Demo',
      kind: 'DEMO',
      status: 'ACTIVE',
      initial: 10_000_000n,
      balance: 10_000_000n + BigInt((i - 3) * 41_250),
      ruleSetName: null,
      failReason: null,
      createdAt: t.createdAt,
    });
    if (i % 2 === 0 || i === 5) {
      const p = products[i % products.length]!;
      const failed = i === 4;
      accounts.push({
        id: `ex-acc-${t.id}-funded`,
        userId: t.id,
        label: `Instant $${Number(p.size / 100_000n)}K`,
        kind: 'FUNDED',
        status: failed ? 'FAILED' : 'FUNDED_ACTIVE',
        initial: p.size,
        balance: p.size + (failed ? -(p.size * 7n) / 100n : (p.size * BigInt(2 + i)) / 100n),
        ruleSetName: ruleSets[0]!.name,
        failReason: failed ? 'MAX_DRAWDOWN' : null,
        createdAt: t.createdAt + 2 * DAY,
      });
      sales.push({ at: t.createdAt + 2 * DAY, amount: p.price });
    }
  });
  for (let d = 1; d < 30; d += 3)
    sales.push({ at: now - d * DAY, amount: products[(d % 3) + 1]!.price });
  const alerts: ExAlert[] = [
    {
      id: 'al-1',
      type: 'BREACH',
      severity: 'CRITICAL',
      accountId: 'ex-acc-ex-emma-funded',
      userId: 'ex-emma',
      details: { rule: 'MAX_DRAWDOWN' },
      createdAt: now - 5 * 3_600_000,
      ackAt: null,
    },
    {
      id: 'al-2',
      type: 'NEAR_BREACH',
      severity: 'WARNING',
      accountId: 'ex-acc-ex-sofia-funded',
      userId: 'ex-sofia',
      details: { rule: 'DAILY_LOSS', usedMinor: '58000', limitMinor: '75000' },
      createdAt: now - 9 * 3_600_000,
      ackAt: null,
    },
    {
      id: 'al-3',
      type: 'LARGE_LOSS',
      severity: 'WARNING',
      accountId: 'ex-acc-ex-amira-funded',
      userId: 'ex-amira',
      details: { realizedPnlMinor: '-14250', symbol: 'ETHUSDT' },
      createdAt: now - 2 * DAY,
      ackAt: now - DAY,
    },
  ];
  const audit: AdminState['audit'] = [];
  let id = 1000;
  for (const t of traders)
    audit.push({
      id: id++,
      ts: t.createdAt,
      action: 'user.registered',
      actorType: 'USER',
      entityType: 'User',
      entityId: t.id,
      data: { country: t.country },
    });
  for (const a of accounts)
    audit.push({
      id: id++,
      ts: a.createdAt,
      action: 'account.created',
      actorType: 'SYSTEM',
      entityType: 'TradingAccount',
      entityId: a.id,
      data: { kind: a.kind },
    });
  audit.push({
    id,
    ts: now - 5 * 3_600_000,
    action: 'rule.breached',
    actorType: 'SYSTEM',
    entityType: 'TradingAccount',
    entityId: 'ex-acc-ex-emma-funded',
    data: { rule: 'MAX_DRAWDOWN' },
  });
  audit.sort((a, b) => a.ts - b.ts);
  return {
    firm: {
      name: 'Daily Funded',
      primaryColor: null,
      logoDataUrl: null,
      domain: null,
      supportEmail: null,
    },
    traders,
    accounts,
    alerts,
    products,
    ruleSets,
    audit,
    team: [],
    sales,
  };
}
const adm = (): AdminState => ((st as WithAdmin).admin ??= seedAdmin());
const firmDto = () => {
  const f = adm().firm;
  return {
    id: 'demo-firm',
    slug: 'daily-funded',
    name: f.name,
    status: 'ACTIVE',
    domain: f.domain,
    domainStatus: f.domain ? (f.domainStatus ?? 'PENDING_DNS') : 'NONE',
    subdomain: `daily-funded.${DEMO_PLATFORM_DOMAIN}`,
    dedicatedDatabase: false,
    primaryColor: f.primaryColor,
    logoDataUrl: f.logoDataUrl,
    supportEmail: f.supportEmail,
    isDefault: true,
    disabledModules: disabledModules(),
    createdAt: new Date(Date.now() - 90 * DAY).toISOString(),
  };
};
const logAdmin = (
  action: string,
  entityType: string,
  entityId: string,
  data: Record<string, unknown> = {},
) => {
  const a = adm().audit;
  a.push({
    id: (a.at(-1)?.id ?? 1000) + 1,
    ts: Date.now(),
    action,
    actorType: 'ADMIN',
    entityType,
    entityId,
    data,
  });
};
const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());

const clients = () => st.users.filter((u) => !u.staff);
/** Clients registered in this browser + example traders, in one list. */
function allTraders() {
  const real = clients().map((u) => ({
    id: u.id,
    email: u.email,
    country: u.country,
    status: 'ACTIVE' as const,
    createdAt: st.accounts.find((a) => a.userId === u.id)?.createdAt ?? Date.now(),
    lastLoginAt: Date.now(),
    nickname: profiles()[u.id]?.nickname ?? null,
    firmRole: null,
  }));
  return [...real, ...adm().traders.map((t) => ({ ...t, firmRole: null }))];
}
function allAccounts() {
  const byId = new Map(clients().map((u) => [u.id, u]));
  const real = st.accounts
    .filter((a) => byId.has(a.userId))
    .map((a) => ({
      id: a.id,
      userId: a.userId,
      userEmail: byId.get(a.userId)!.email,
      label: a.label,
      kind: a.kind,
      status: a.status,
      currency: 'USD',
      initialBalanceMinor: String(a.initial),
      balanceMinor: String(a.balance),
      pnlMinor: String(a.balance - a.initial),
      ruleSetName: a.rules ? 'Instant funding (example rules)' : null,
      failReason: a.failReason,
      createdAt: iso(a.createdAt)!,
      endedAt: null,
    }));
  const emails = new Map(adm().traders.map((t) => [t.id, t.email]));
  const ex = adm().accounts.map((a) => ({
    id: a.id,
    userId: a.userId,
    userEmail: emails.get(a.userId) ?? '',
    label: a.label,
    kind: a.kind,
    status: a.status,
    currency: 'USD',
    initialBalanceMinor: String(a.initial),
    balanceMinor: String(a.balance),
    pnlMinor: String(a.balance - a.initial),
    ruleSetName: a.ruleSetName,
    failReason: a.failReason,
    createdAt: iso(a.createdAt)!,
    endedAt: null,
  }));
  return [...real, ...ex].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
const traderRow = (t: ReturnType<typeof allTraders>[number]) => {
  const accs = allAccounts().filter((a) => a.userId === t.id);
  return {
    id: t.id,
    email: t.email,
    country: t.country,
    status: t.status,
    emailVerified: true,
    firmRole: t.firmRole,
    createdAt: iso(t.createdAt)!,
    lastLoginAt: iso(t.lastLoginAt),
    accounts: {
      total: accs.length,
      funded: accs.filter((a) => a.kind === 'FUNDED').length,
      failed: accs.filter((a) => a.status === 'FAILED').length,
    },
  };
};

on('GET', '/public/firm', () => {
  const f = firmDto();
  // Preview: once the visitor customises the branding, show it as their own firm.
  const custom = f.name !== 'Daily Funded' || !!f.primaryColor || !!f.logoDataUrl;
  return json(200, {
    slug: f.slug,
    name: f.name,
    isDefault: !custom,
    primaryColor: f.primaryColor,
    logoDataUrl: f.logoDataUrl,
    supportEmail: f.supportEmail,
    status: 'ACTIVE',
    disabledModules: disabledModules(),
  });
});
const staffMe = () => {
  const u = me();
  if (!u.staff) throw new Fail(403, 'ADMIN_FORBIDDEN');
  return u;
};
on('GET', '/admin/me', () =>
  json(200, {
    role: (staffMe(), 'OWNER'),
    superadmin: true,
    firm: firmDto(),
    twoFactorEnabled: me().twoFactorEnabled,
    twoFactorRequired: false,
  }),
);
on('GET', '/admin/overview', () => {
  const now = Date.now();
  const a = adm();
  const accs = allAccounts();
  const recent = a.sales.filter((s) => s.at >= now - 30 * DAY);
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * DAY);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(d);
    const hits = recent.filter(
      (s) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(
          new Date(s.at),
        ) === key,
    );
    return {
      date: key,
      salesMinor: String(hits.reduce((x, s) => x + s.amount, 0n)),
      orders: hits.length,
    };
  });
  const traders = allTraders().filter((t) => !t.firmRole);
  return json(200, {
    traders: traders.length,
    newTraders30d: traders.filter((t) => t.createdAt >= now - 30 * DAY).length,
    demoAccounts: accs.filter((x) => x.kind === 'DEMO').length,
    fundedActive: accs.filter((x) => x.status === 'FUNDED_ACTIVE').length,
    fundedFailed30d: accs.filter((x) => x.kind === 'FUNDED' && x.status === 'FAILED').length,
    competitionAccounts: accs.filter((x) => x.kind === 'COMPETITION').length,
    sales30dMinor: String(recent.reduce((x, s) => x + s.amount, 0n)),
    orders30d: recent.length,
    salesAllTimeMinor: String(a.sales.reduce((x, s) => x + s.amount, 0n)),
    openAlerts: a.alerts.filter((x) => !x.ackAt).length,
    criticalAlerts: a.alerts.filter((x) => !x.ackAt && x.severity === 'CRITICAL').length,
    salesByDay: days,
    currency: 'EUR',
  });
});
on('GET', '/admin/traders', (_m, _b, url) => {
  const q = url.searchParams.get('q')?.toLowerCase() ?? '';
  const status = url.searchParams.get('status');
  const items = allTraders()
    .filter((t) => (!q || t.email.includes(q)) && (!status || t.status === status))
    .map(traderRow);
  return json(200, { items, nextCursor: null });
});
const traderDetail = (id: string) => {
  const t = allTraders().find((x) => x.id === id);
  if (!t) throw new Fail(404, 'TRADER_NOT_FOUND');
  return {
    ...traderRow(t),
    twoFactorEnabled: t.firmRole ? me().twoFactorEnabled : false,
    nickname: t.nickname,
    accountList: allAccounts().filter((a) => a.userId === id),
    purchases: [],
  };
};
on('GET', '/admin/traders/{id}', (m) => json(200, traderDetail(m[1]!)));
const setStatus = (id: string, status: 'ACTIVE' | 'SUSPENDED', reason: unknown) => {
  const t = adm().traders.find((x) => x.id === id);
  if (!t) throw new Fail(422, 'STAFF_PROTECTED');
  t.status = status;
  logAdmin(status === 'SUSPENDED' ? 'admin.user_suspended' : 'admin.user_reactivated', 'User', id, {
    reason,
  });
  return json(200, traderDetail(id));
};
on('POST', '/admin/traders/{id}/suspend', (m, b) => setStatus(m[1]!, 'SUSPENDED', b.reason));
on('POST', '/admin/traders/{id}/reactivate', (m, b) => setStatus(m[1]!, 'ACTIVE', b.reason));
on('GET', '/admin/accounts', (_m, _b, url) => {
  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status');
  return json(200, {
    items: allAccounts().filter(
      (a) => (!kind || a.kind === kind) && (!status || a.status === status),
    ),
    nextCursor: null,
  });
});
on('POST', '/admin/accounts/{id}/fail', (m, b) => {
  const ex = adm().accounts.find((a) => a.id === m[1]);
  const real = st.accounts.find((a) => a.id === m[1] && a.userId === me().id);
  const target = ex ?? real;
  if (!target) throw new Fail(404, 'ACCOUNT_NOT_FOUND');
  if (target.status === 'FAILED') throw new Fail(422, 'ACCOUNT_NOT_ACTIVE');
  target.status = 'FAILED';
  target.failReason = 'ADMIN';
  if (real) st.positions = st.positions.filter((p) => p.accountId !== real.id);
  logAdmin('account.failed_by_admin', 'TradingAccount', m[1]!, { reason: b.reason });
  return json(
    200,
    allAccounts().find((a) => a.id === m[1]),
  );
});
const ruleSetDto = (r: AdminRuleSet) => ({
  id: r.id,
  code: r.code,
  version: r.version,
  name: r.name,
  isTemplate: r.template,
  isExample: r.template,
  maxDailyLossBps: r.maxDailyLossBps,
  maxDrawdownBps: r.maxDrawdownBps,
  drawdownType: r.drawdownType,
  profitTargetBps: null,
  minTradingDays: 0,
  maxLeverage: r.maxLeverage,
  profitSplitBps: r.profitSplitBps,
  payoutIntervalDays: r.payoutIntervalDays,
  minTradingDaysPerPayout: r.minTradingDaysPerPayout,
  minPayoutMinor: r.minPayoutMinor,
  accounts: allAccounts().filter((a) => a.ruleSetName === r.name).length,
  createdAt: iso(r.createdAt)!,
});
on('GET', '/admin/rule-sets', () =>
  json(200, {
    items: [...adm().ruleSets]
      .sort((a, b) => Number(a.template) - Number(b.template) || b.createdAt - a.createdAt)
      .map(ruleSetDto),
  }),
);
on('POST', '/admin/rule-sets', (_m, b) => {
  const base = adm().ruleSets.find((r) => r.id === b.basedOnId);
  if (!base) throw new Fail(404, 'RULESET_NOT_FOUND');
  const daily = Number(b.maxDailyLossBps ?? base.maxDailyLossBps);
  const dd = Number(b.maxDrawdownBps ?? base.maxDrawdownBps);
  if (daily >= dd) throw new Fail(422, 'RULES_INCONSISTENT');
  const version =
    Math.max(
      0,
      ...adm()
        .ruleSets.filter((r) => !r.template && r.code === base.code)
        .map((r) => r.version),
    ) + 1;
  const r: AdminRuleSet = {
    ...base,
    id: uid(),
    version,
    name: String(b.name),
    template: false,
    maxDailyLossBps: daily,
    maxDrawdownBps: dd,
    drawdownType: (b.drawdownType as AdminRuleSet['drawdownType']) ?? base.drawdownType,
    maxLeverage: Number(b.maxLeverage ?? base.maxLeverage),
    profitSplitBps: b.profitSplitBps === undefined ? base.profitSplitBps : Number(b.profitSplitBps),
    payoutIntervalDays:
      b.payoutIntervalDays === undefined ? base.payoutIntervalDays : Number(b.payoutIntervalDays),
    minPayoutMinor: b.minPayoutMinor === undefined ? base.minPayoutMinor : String(b.minPayoutMinor),
    createdAt: Date.now(),
  };
  adm().ruleSets.push(r);
  logAdmin('admin.ruleset_created', 'RuleSet', r.id, { code: r.code, version: r.version });
  return json(201, ruleSetDto(r));
});
const productDto = (p: AdminProduct) => {
  const r = adm().ruleSets.find((x) => x.id === p.ruleSetId) ?? adm().ruleSets[0]!;
  return {
    id: p.id,
    slug: p.slug,
    type: 'INSTANT',
    accountSizeMinor: String(p.size),
    priceMinor: String(p.price),
    priceCurrency: 'EUR',
    ruleSetId: r.id,
    ruleSetName: r.name,
    ruleSetVersion: r.version,
    isActive: p.isActive,
    isRecommended: p.isRecommended,
    isExample: p.isExample,
    sortOrder: p.sortOrder,
    sold: adm().accounts.filter((a) => a.kind === 'FUNDED' && a.initial === p.size).length,
  };
};
on('GET', '/admin/products', () =>
  json(200, {
    items: [...adm().products].sort((a, b) => a.sortOrder - b.sortOrder).map(productDto),
  }),
);
on('POST', '/admin/products', (_m, b) => {
  if (adm().products.some((p) => p.slug === b.slug)) throw new Fail(409, 'SLUG_TAKEN');
  const p: AdminProduct = {
    id: uid(),
    slug: String(b.slug),
    size: BigInt(String(b.accountSizeMinor)),
    price: BigInt(String(b.priceMinor)),
    ruleSetId: String(b.ruleSetId),
    isActive: true,
    isRecommended: b.isRecommended === true,
    isExample: false,
    sortOrder: Number(b.sortOrder ?? adm().products.length),
  };
  adm().products.push(p);
  logAdmin('admin.product_created', 'Product', p.id, { slug: p.slug });
  return json(201, productDto(p));
});
on('PATCH', '/admin/products/{id}', (m, b) => {
  const p = adm().products.find((x) => x.id === m[1]);
  if (!p) throw new Fail(404, 'PRODUCT_NOT_FOUND');
  if (b.priceMinor !== undefined) p.price = BigInt(String(b.priceMinor));
  if (b.ruleSetId !== undefined) p.ruleSetId = String(b.ruleSetId);
  if (b.isActive !== undefined) p.isActive = b.isActive === true;
  if (b.isRecommended !== undefined) p.isRecommended = b.isRecommended === true;
  p.isExample = false;
  logAdmin('admin.product_updated', 'Product', p.id, { priceMinor: p.price, isActive: p.isActive });
  return json(200, productDto(p));
});
on('GET', '/admin/branding', () => json(200, firmDto()));
on('PUT', '/admin/branding', (_m, b) => {
  const f = adm().firm;
  if (typeof b.name === 'string') f.name = b.name;
  if (b.primaryColor !== undefined)
    f.primaryColor = (b.primaryColor as string | null)?.toUpperCase() ?? null;
  if (b.logoDataUrl !== undefined) f.logoDataUrl = b.logoDataUrl as string | null;
  if (b.domain !== undefined && b.domain !== f.domain) {
    f.domain = b.domain as string | null;
    f.domainStatus = f.domain ? 'PENDING_DNS' : 'NONE';
    f.domainChecks = 0;
  }
  if (b.supportEmail !== undefined) f.supportEmail = b.supportEmail as string | null;
  logAdmin('admin.branding_updated', 'Firm', 'demo-firm', { fields: Object.keys(b).sort() });
  return json(200, firmDto());
});
const ownDomainState = () => {
  const f = adm().firm;
  return Object.assign(f, { slug: 'daily-funded' }) as DemoFirm & DemoDomainState;
};
on('GET', '/admin/branding/domain', () => json(200, domainSetupOf(ownDomainState())));
on('POST', '/admin/branding/domain/check', () => {
  checkDomain(ownDomainState());
  return json(200, domainSetupOf(ownDomainState()));
});
on('GET', '/admin/alerts', (_m, _b, url) => {
  const open = (url.searchParams.get('state') ?? 'open') === 'open';
  const accs = allAccounts();
  return json(200, {
    items: adm()
      .alerts.filter((a) => !open || !a.ackAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => {
        const acc = accs.find((x) => x.id === a.accountId);
        return {
          ...a,
          accountLabel: acc?.label ?? '—',
          userEmail: acc?.userEmail ?? '—',
          createdAt: iso(a.createdAt),
          ackAt: iso(a.ackAt),
        };
      }),
    nextCursor: null,
  });
});
on('POST', '/admin/alerts/{id}/ack', (m) => {
  const a = adm().alerts.find((x) => x.id === m[1]);
  if (!a) throw new Fail(404, 'ALERT_NOT_FOUND');
  a.ackAt ??= Date.now();
  logAdmin('admin.alert_acknowledged', 'RiskAlert', a.id);
  return json(204);
});
on('GET', '/admin/audit', (_m, _b, url) => {
  const action = url.searchParams.get('action') ?? '';
  return json(200, {
    items: [...adm().audit]
      .reverse()
      .filter((r) => r.action.startsWith(action))
      .slice(0, 100)
      .map((r) => ({
        id: String(r.id),
        ts: iso(r.ts),
        actorType: r.actorType,
        actorId: null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        data: r.data,
        hash: (r.id * 2654435761).toString(16).padStart(16, '0'),
      })),
    nextCursor: null,
  });
});
on('GET', '/admin/audit/verify', () =>
  json(200, { ok: true, checked: adm().audit.length, brokenAtId: null }),
);
// Client-dashboard modules (D92).
const disabledModules = () => ((adm().firm as DemoFirm & { disabled?: string[] }).disabled ??= []);
on('GET', '/admin/modules', () =>
  json(200, { available: [...CLIENT_MODULES], disabled: [...disabledModules()].sort() }),
);
on('PUT', '/admin/modules', (_m, b) => {
  staffMe();
  const list = Array.isArray(b.disabled) ? (b.disabled as string[]) : [];
  if (list.some((x) => !(CLIENT_MODULES as readonly string[]).includes(x)))
    throw new Fail(400, 'VALIDATION_ERROR');
  (adm().firm as DemoFirm & { disabled?: string[] }).disabled = [...new Set(list)].sort();
  logAdmin('admin.modules_updated', 'Firm', 'demo-firm', { disabled: list });
  return json(200, { available: [...CLIENT_MODULES], disabled: disabledModules() });
});

// Firms on the platform (preview: the visitor is Daily Funded staff).
interface DemoFirmRow {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  admin: { email: string; activated: boolean; twoFactorEnabled: boolean } | null;
  createdAt: number;
  domain: string | null;
  domainStatus?: 'NONE' | 'PENDING_DNS' | 'ACTIVE';
  domainChecks?: number;
  dedicated?: boolean;
}
const firms = (): DemoFirmRow[] =>
  ((adm() as AdminState & { firms?: DemoFirmRow[] }).firms ??= [
    {
      id: 'example-firm-acme',
      slug: 'acme-prop',
      name: 'Acme Prop (example)',
      status: 'ACTIVE',
      admin: { email: 'owner@acme.example', activated: true, twoFactorEnabled: true },
      createdAt: Date.now() - 20 * DAY,
      domain: 'trade.acme.example',
      domainStatus: 'ACTIVE',
      domainChecks: 2,
    },
  ]);
const firmRows = () => {
  const own = firmDto();
  return {
    items: [
      {
        ...own,
        traders: allTraders().length,
        fundedActive: 4,
        admin: null,
        provisioning: stepsOf({
          ...ownDomainState(),
          platform: true,
          createdAt: Date.now() - 90 * DAY,
        }),
        domainSetup: domainSetupOf(ownDomainState()),
      },
      ...firms().map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        status: f.status,
        domain: f.domain ?? null,
        domainStatus: f.domain ? (f.domainStatus ?? 'PENDING_DNS') : 'NONE',
        subdomain: `${f.slug}.${DEMO_PLATFORM_DOMAIN}`,
        dedicatedDatabase: !!f.dedicated,
        provisioning: stepsOf({ ...f, domain: f.domain ?? null }),
        domainSetup: domainSetupOf({ ...f, domain: f.domain ?? null }),
        primaryColor: null,
        logoDataUrl: null,
        supportEmail: null,
        isDefault: false,
        disabledModules: [],
        createdAt: iso(f.createdAt),
        traders: 0,
        fundedActive: 0,
        admin: f.admin,
      })),
    ],
    dedicatedAvailable: true,
    platformDomain: DEMO_PLATFORM_DOMAIN,
  };
};
on('GET', '/admin/firms', () => (staffMe(), json(200, firmRows())));
on('POST', '/admin/firms', (_m, b) => {
  staffMe();
  if (firms().some((f) => f.slug === b.slug)) throw new Fail(409, 'SLUG_TAKEN');
  firms().push({
    id: uid(),
    slug: String(b.slug),
    name: String(b.name),
    status: 'ACTIVE',
    admin: { email: String(b.ownerEmail).toLowerCase(), activated: false, twoFactorEnabled: false },
    createdAt: Date.now(),
    domain: typeof b.domain === 'string' ? b.domain.toLowerCase() : null,
    domainStatus: typeof b.domain === 'string' ? 'PENDING_DNS' : 'NONE',
    dedicated: b.dedicatedDatabase === true,
  });
  return json(201, firmRows());
});
on('POST', '/admin/firms/{id}/provisioning/run', (m) => {
  const f = m[1] === 'demo-firm' ? ownDomainState() : demoFirm(m[1]!);
  checkDomain(f);
  return json(200, firmRows());
});
on('POST', '/admin/firms/{id}/domain', (m, b) => {
  const f = m[1] === 'demo-firm' ? ownDomainState() : demoFirm(m[1]!);
  const domain = typeof b.domain === 'string' && b.domain ? b.domain.toLowerCase() : null;
  if (domain !== f.domain) {
    f.domain = domain;
    f.domainStatus = domain ? 'PENDING_DNS' : 'NONE';
    f.domainChecks = 0;
  }
  return json(200, firmRows());
});
const demoFirm = (id: string) => {
  const f = firms().find((x) => x.id === id);
  if (!f) throw new Fail(404, 'FIRM_NOT_FOUND');
  return f;
};
on('POST', '/admin/firms/{id}/status', (m, b) => {
  demoFirm(m[1]!).status = b.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  return json(200, firmRows());
});
on('POST', '/admin/firms/{id}/admin', (m, b) => {
  demoFirm(m[1]!).admin = {
    email: String(b.email).toLowerCase(),
    activated: false,
    twoFactorEnabled: false,
  };
  return json(200, firmRows());
});
on('POST', '/admin/firms/{id}/admin/invite', (m) => (demoFirm(m[1]!), json(204)));

/** Route /api/v1/* requests to the in-browser backend; everything else goes to the network. */
const handleCompete = createCompeteDemo(market);

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
    // Compete (separate product) has its own in-browser backend.
    const competeRes = handleCompete(path, req, b);
    if (competeRes) return competeRes;
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
