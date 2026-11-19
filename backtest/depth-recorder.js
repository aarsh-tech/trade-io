// Records Kite's live 5-level market depth for the research universe (backtest/depth-universe.json, 1,847 liquid NSE
// stocks) on every trading day, 08:58-15:32 IST. It is a separate PM2 process with its own websocket (Kite allows 3 per
// API key), so it never touches the trading backend or its ticker. It places no orders and has no HTTP endpoint.
//
// Output, per IST day, in $DEPTH_DIR (default ~/depth-data)/YYYY-MM-DD/:
//   meta.json           symbols + instrument tokens (index = position), file layouts, sampling settings
//   ticks-HHMMSS.bin.gz raw ticks, rotated hourly. Record = 4-byte uint32 LE receive time (ms since IST midnight)
//                       + 2-byte uint16 LE symbol index + the 184-byte Kite "full" packet exactly as received
//                       (big-endian, prices in paise; layout in meta.json). Every tick before SNAP_ALL_UNTIL (default
//                       10:00), then at most one tick per stock per SNAP_EVERY_MS (default 5000 ms).
//   bars.csv.gz         1-minute order-flow bars for every stock, built from EVERY tick (not the sampled ones):
//                       time,sym,o,h,l,c,vol,buyVol,sellVol,ticks,spreadBps,imb5,totBuy,totSell,bid,ask,bidQ5,askQ5
//                       buyVol/sellVol: volume traded at/above the previous best ask = buy, at/below the previous best
//                       bid = sell, otherwise by the tick direction. spreadBps / imb5 = averages over the minute's ticks,
//                       imb5 = (bid qty - ask qty) / (bid qty + ask qty) over the 5 levels. Last 6 columns = the minute's last tick.
// Files are multi-member gzip (a restart appends a new member), readable with zcat or backtest/depth-read.js.
// The ticks file stops (bars continue) if free disk falls under MIN_FREE_GB (default 4).
//
// Session: the app DB's active broker account (same as backtest/chain-logger.js), re-read every minute until Kite
// accepts it, so the morning login is picked up by itself. Local test: SESSION_FILE=backtest/.kite-session.json
// FORCE=1 (ignore the clock). The API key / access token are never logged.
//
// Usage on the server: pm2 start depth-recorder.js --name depth-recorder --max-memory-restart 200M --node-args=--max-old-space-size=160
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');
const { createRequire } = require('module');

const APP_ROOT = process.env.APP_ROOT || (fs.existsSync('/var/www/trade-io') ? '/var/www/trade-io' : path.join(__dirname, '..'));
const appRequire = createRequire(path.join(APP_ROOT, 'apps', 'auth-service', 'package.json'));
const WebSocket = createRequire(appRequire.resolve('kiteconnect'))('ws');

// root .env (DATABASE_URL, ENCRYPTION_SECRET, TELEGRAM_*) without printing anything
try {
  for (const l of fs.readFileSync(path.join(APP_ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* local runs may have none */ }

const OUT = process.env.DEPTH_DIR || path.join(require('os').homedir(), 'depth-data');
const UNIVERSE = JSON.parse(fs.readFileSync(process.env.UNIVERSE || path.join(__dirname, 'depth-universe.json'), 'utf8'));
const START_MIN = 8 * 60 + 58, STOP_MIN = 15 * 60 + 32;
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const SNAP_ALL_UNTIL = hm(process.env.SNAP_ALL_UNTIL || '10:00') * 60000;
const SNAP_EVERY_MS = +(process.env.SNAP_EVERY_MS || 5000);
const MIN_FREE_GB = +(process.env.MIN_FREE_GB || 4);
const FORCE = process.env.FORCE === '1';
const IST = 330 * 60000;
const istNow = () => new Date(Date.now() + IST);
const istDate = () => istNow().toISOString().slice(0, 10);
const istMs = () => (Date.now() + IST) % 86400000;
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const log = (...a) => console.log(new Date(Date.now() + IST).toISOString().slice(0, 19).replace('T', ' '), ...a);

let isTradingDay = () => { const d = istNow().getUTCDay(); return d > 0 && d < 6; };
try { isTradingDay = require(path.join(APP_ROOT, 'apps', 'auth-service', 'dist', 'market', 'market-calendar.js')).isTradingDay; } catch { log('market-calendar not found: weekdays only'); }

// ---------------- session ----------------
async function getSession() {
  if (process.env.SESSION_FILE) {
    const s = JSON.parse(fs.readFileSync(process.env.SESSION_FILE, 'utf8'));
    return { apiKey: s.apiKey, accessToken: s.accessToken };
  }
  const { PrismaClient } = appRequire('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const a = await prisma.brokerAccount.findFirst({ where: { isActive: true, accessToken: { not: null } }, orderBy: { updatedAt: 'desc' } });
    if (!a) return null;
    const { decrypt } = require(path.join(APP_ROOT, 'apps', 'auth-service', 'dist', 'common', 'utils', 'crypto'));
    return { apiKey: decrypt(a.apiKeyEnc), accessToken: decrypt(a.accessToken) };
  } finally { await prisma.$disconnect(); }
}
function httpGet(url, headers) {
  return new Promise((res, rej) => {
    https.get(url, { headers }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c));
      r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', rej).setTimeout(30000, function () { this.destroy(new Error('timeout')); });
  });
}
async function loadTokens(sess) {
  const r = await httpGet('https://api.kite.trade/instruments/NSE', { 'X-Kite-Version': '3', Authorization: `token ${sess.apiKey}:${sess.accessToken}` });
  if (r.status !== 200) throw Object.assign(new Error(`instruments HTTP ${r.status}`), { status: r.status });
  const lines = r.body.split('\n'), head = lines[0].split(',');
  const iTok = head.indexOf('instrument_token'), iSym = head.indexOf('tradingsymbol'), iSeg = head.indexOf('segment');
  const map = new Map();
  for (let i = 1; i < lines.length; i++) { const c = lines[i].split(','); if (c[iSeg] === 'NSE') map.set(c[iSym], +c[iTok]); }
  return map;
}
function telegram(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  const body = JSON.stringify({ chat_id: chat, text });
  const req = https.request({ hostname: 'api.telegram.org', path: `/bot${tok}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
  req.on('error', () => {}); req.end(body);
}

// ---------------- day state ----------------
let day = null; // { date, dir, syms, tokToIdx, bars, ticksOut, ticksOpenedAt, barsOut, stats, lastSnap, st }
function gzAppend(file) {
  const gz = zlib.createGzip({ level: 6 });
  gz.pipe(fs.createWriteStream(file, { flags: 'a' }));
  return gz;
}
function openDay(tokens) {
  const date = istDate(), dir = path.join(OUT, date);
  fs.mkdirSync(dir, { recursive: true });
  const syms = [], toks = [];
  for (const s of UNIVERSE) { const t = tokens.get(s); if (t) { syms.push(s); toks.push(t); } }
  const metaFile = path.join(dir, 'meta.json');
  // keep the first run's symbol order for the whole day so a restart's indices match
  if (fs.existsSync(metaFile)) {
    const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    syms.length = 0; toks.length = 0; m.symbols.forEach((s, i) => { syms.push(s); toks.push(m.tokens[i]); });
  } else {
    fs.writeFileSync(metaFile, JSON.stringify({
      date, symbols: syms, tokens: toks, snapAllUntil: hhmm(SNAP_ALL_UNTIL), snapEveryMs: SNAP_EVERY_MS,
      tickRecord: 'uint32LE recvMsSinceISTMidnight, uint16LE symIndex, 184-byte Kite full packet (big-endian)',
      kiteFullPacket: 'int32BE: 0 token, 4 ltp, 8 lastQty, 12 avgPrice, 16 volume, 20 totBuyQty, 24 totSellQty, 28 open, 32 high, 36 low, 40 prevClose, 44 lastTradeTime(epoch s), 48 oi, 52 oiHigh, 56 oiLow, 60 exchangeTime(epoch s); 64..184 = 10 depth entries of 12 bytes (int32 qty, int32 price, int16 orders, 2 pad): 5 bids then 5 asks. Prices in paise.',
      bars: 'time,sym,o,h,l,c,vol,buyVol,sellVol,ticks,spreadBps,imb5,totBuy,totSell,bid,ask,bidQ5,askQ5',
    }));
  }
  const tokToIdx = new Map(toks.map((t, i) => [t, i]));
  const barsFile = path.join(dir, 'bars.csv.gz');
  const fresh = !fs.existsSync(barsFile) || fs.statSync(barsFile).size === 0;
  const barsOut = gzAppend(barsFile);
  if (fresh) barsOut.write('time,sym,o,h,l,c,vol,buyVol,sellVol,ticks,spreadBps,imb5,totBuy,totSell,bid,ask,bidQ5,askQ5\n');
  day = {
    date, dir, syms, toks, tokToIdx, barsOut, ticksOut: null, ticksHour: -1, diskOk: true,
    st: syms.map(() => ({ ltp: 0, vol: -1, bid: 0, ask: 0, side: 0 })),
    bars: new Map(), barMin: Math.floor(istMs() / 60000), lastSnap: new Float64Array(syms.length),
    stats: { ticks: 0, saved: 0, bars: 0, reconnects: 0, firstTick: null, lastTick: null, unknown: 0 },
  };
  log(`day ${date}: ${syms.length}/${UNIVERSE.length} symbols resolved, writing to ${dir}`);
  return day;
}
function ticksStream(ms) {
  const h = Math.floor(ms / 3600000);
  if (day.ticksOut && day.ticksHour === h) return day.ticksOut;
  if (day.ticksOut) day.ticksOut.end();
  const name = `ticks-${new Date(ms).toISOString().slice(11, 19).replace(/:/g, '')}.bin.gz`;
  day.ticksOut = gzAppend(path.join(day.dir, name)); day.ticksHour = h;
  return day.ticksOut;
}
function flushBars(uptoMin) {
  if (!day) return;
  const lines = [];
  for (const [key, b] of day.bars) {
    const [m, i] = key.split('|').map(Number);
    if (m >= uptoMin) continue;
    lines.push(`${hhmm(m * 60000)},${day.syms[i]},${b.o},${b.h},${b.l},${b.c},${b.v},${b.bv},${b.sv},${b.n},${(b.spr / Math.max(b.ns, 1)).toFixed(2)},${(b.imb / Math.max(b.ns, 1)).toFixed(3)},${b.tb},${b.ts},${b.bid},${b.ask},${b.bq},${b.aq}`);
    day.bars.delete(key);
  }
  if (lines.length) { day.barsOut.write(lines.join('\n') + '\n'); day.barsOut.flush(zlib.constants.Z_SYNC_FLUSH); day.stats.bars += lines.length; }
  if (day.ticksOut) day.ticksOut.flush(zlib.constants.Z_SYNC_FLUSH);
}
function closeDay(reason) {
  if (!day) return;
  flushBars(Infinity);
  const d = day; day = null;
  const ends = [d.barsOut, d.ticksOut].filter(Boolean).map((s) => new Promise((r) => { s.on('finish', r); s.end(); }));
  Promise.all(ends).then(() => setTimeout(() => {
    let size = 0; for (const f of fs.readdirSync(d.dir)) size += fs.statSync(path.join(d.dir, f)).size;
    const s = d.stats, msg = `📼 Depth recorder ${d.date} (${reason}): ${d.syms.length} stocks, ${s.ticks.toLocaleString('en-IN')} ticks, ${s.saved.toLocaleString('en-IN')} saved, ${s.bars.toLocaleString('en-IN')} 1m bars, ${(size / 1e6).toFixed(0)} MB, ${s.reconnects} reconnects, ticks ${s.firstTick ? hhmm(s.firstTick) : '-'}–${s.lastTick ? hhmm(s.lastTick) : '-'}`;
    log(msg); if (reason === 'close') telegram(msg);
  }, 500));
}

// ---------------- packet handling ----------------
function onBinary(buf) {
  if (!day || buf.length < 4) return; // 1-byte heartbeats
  const ms = istMs(), min = Math.floor(ms / 60000);
  if (min !== day.barMin) { flushBars(min); day.barMin = min; }
  const n = buf.readUInt16BE(0);
  let j = 2;
  const saveAll = ms < SNAP_ALL_UNTIL;
  for (let k = 0; k < n && j + 2 <= buf.length; k++) {
    const len = buf.readUInt16BE(j), p = j + 2; j = p + len;
    if (len !== 184) continue;
    const idx = day.tokToIdx.get(buf.readInt32BE(p));
    if (idx === undefined) { day.stats.unknown++; continue; }
    day.stats.ticks++; if (!day.stats.firstTick) day.stats.firstTick = ms; day.stats.lastTick = ms;
    // raw save (sampled after SNAP_ALL_UNTIL)
    if (day.diskOk && (saveAll || ms - day.lastSnap[idx] >= SNAP_EVERY_MS)) {
      day.lastSnap[idx] = ms;
      const rec = Buffer.allocUnsafe(190);
      rec.writeUInt32LE(ms, 0); rec.writeUInt16LE(idx, 4); buf.copy(rec, 6, p, p + 184);
      ticksStream(ms).write(rec); day.stats.saved++;
    }
    // order-flow bar from every tick
    const ltp = buf.readInt32BE(p + 4) / 100, vol = buf.readInt32BE(p + 16);
    const tb = buf.readInt32BE(p + 20), ts = buf.readInt32BE(p + 24);
    let bq = 0, aq = 0;
    for (let l = 0; l < 5; l++) { bq += buf.readInt32BE(p + 64 + l * 12); aq += buf.readInt32BE(p + 124 + l * 12); }
    const bid = buf.readInt32BE(p + 68) / 100, ask = buf.readInt32BE(p + 128) / 100;
    const S = day.st[idx], key = min + '|' + idx;
    let b = day.bars.get(key);
    if (!b) { b = { o: ltp, h: ltp, l: ltp, c: ltp, v: 0, bv: 0, sv: 0, n: 0, spr: 0, imb: 0, ns: 0, tb, ts, bid, ask, bq, aq }; day.bars.set(key, b); }
    if (ltp > 0) { if (!(b.o > 0)) b.o = b.h = b.l = ltp; b.h = Math.max(b.h, ltp); b.l = Math.min(b.l, ltp); b.c = ltp; }
    const dv = S.vol >= 0 ? vol - S.vol : 0;
    if (dv > 0) {
      let side = 0;
      if (S.ask > 0 && ltp >= S.ask) side = 1; else if (S.bid > 0 && ltp <= S.bid) side = -1;
      else if (ltp > S.ltp) side = 1; else if (ltp < S.ltp) side = -1; else side = S.side;
      if (side > 0) b.bv += dv; else if (side < 0) b.sv += dv;
      b.v += dv; S.side = side || S.side;
    }
    if (bid > 0 && ask > 0 && ask >= bid) { b.spr += (ask - bid) / ((ask + bid) / 2) * 1e4; b.imb += (bq + aq) ? (bq - aq) / (bq + aq) : 0; b.ns++; }
    b.n++; b.tb = tb; b.ts = ts; b.bid = bid; b.ask = ask; b.bq = bq; b.aq = aq;
    S.ltp = ltp; if (vol >= S.vol) S.vol = vol; S.bid = bid; S.ask = ask;
  }
}

// ---------------- connection ----------------
let ws = null, wsState = 'idle', badToken = null, nextTryAt = 0, connectedAt = 0;
async function connect() {
  wsState = 'connecting';
  let sess;
  try { sess = await getSession(); } catch (e) { log('session read failed:', e.message); }
  if (!sess) { wsState = 'idle'; nextTryAt = Date.now() + 60000; log('no active Kite session in the DB yet; retry in 60s'); return; }
  if (badToken && badToken === sess.accessToken) { wsState = 'idle'; nextTryAt = Date.now() + 60000; return; } // still yesterday's token
  if (!day || day.date !== istDate()) {
    try { openDay(await loadTokens(sess)); } catch (e) {
      wsState = 'idle'; nextTryAt = Date.now() + 60000;
      if (e.status === 403 || e.status === 401) { if (badToken !== sess.accessToken) log('Kite refused the session (not logged in today yet?); re-reading the DB every 60s'); badToken = sess.accessToken; }
      else log('instrument list failed:', e.message, '- retry in 60s');
      return;
    }
  }
  const url = `wss://ws.kite.trade?api_key=${encodeURIComponent(sess.apiKey)}&access_token=${encodeURIComponent(sess.accessToken)}`;
  const sock = new WebSocket(url, { headers: { 'X-Kite-Version': '3' } });
  ws = sock;
  let lastMsg = Date.now();
  const watchdog = setInterval(() => { if (Date.now() - lastMsg > 20000) { log('no data for 20s, reconnecting'); sock.terminate(); } }, 5000);
  sock.on('unexpected-response', (req, res) => {
    log(`websocket handshake refused: HTTP ${res.statusCode}`);
    if (res.statusCode === 403 || res.statusCode === 401) badToken = sess.accessToken;
    sock.terminate();
  });
  sock.on('open', () => {
    wsState = 'open'; connectedAt = Date.now(); badToken = null;
    const toks = day.toks;
    for (let i = 0; i < toks.length; i += 500) {
      const part = toks.slice(i, i + 500);
      sock.send(JSON.stringify({ a: 'subscribe', v: part }));
      sock.send(JSON.stringify({ a: 'mode', v: ['full', part] }));
    }
    log(`connected, subscribed ${toks.length} instruments in full mode`);
    if (!day.announced) { day.announced = true; telegram(`📼 Depth recorder ${day.date}: recording ${toks.length} stocks (5-level depth), every tick until ${hhmm(SNAP_ALL_UNTIL)} then every ${SNAP_EVERY_MS / 1000}s`); }
  });
  sock.on('message', (data) => {
    lastMsg = Date.now();
    if (Buffer.isBuffer(data)) onBinary(data);
    else if (typeof data === 'string' && data.includes('"error"')) log('kite message:', data.slice(0, 200));
  });
  sock.on('error', (e) => log('websocket error:', e.message));
  sock.on('close', (code) => {
    clearInterval(watchdog);
    if (ws === sock) { ws = null; wsState = 'idle'; }
    if (day) day.stats.reconnects++;
    nextTryAt = Date.now() + 5000;
    log(`websocket closed (${code})`);
  });
}

// ---------------- scheduler ----------------
let lastHealth = 0;
setInterval(() => {
  const min = Math.floor(istMs() / 60000);
  const inWindow = FORCE || (isTradingDay(new Date()) && min >= START_MIN && min < STOP_MIN);
  if (inWindow) {
    if (day && day.date !== istDate()) closeDay('date change');
    if (wsState === 'idle' && Date.now() >= nextTryAt) connect().catch((e) => { wsState = 'idle'; nextTryAt = Date.now() + 60000; log('connect failed:', e.message); });
    if (day && min !== day.barMin && wsState === 'open') { flushBars(min); day.barMin = min; }
  } else {
    if (ws) { const s = ws; ws = null; wsState = 'idle'; s.close(); }
    if (day) closeDay('close');
  }
  if (Date.now() - lastHealth > 600000) {
    lastHealth = Date.now();
    try {
      fs.mkdirSync(OUT, { recursive: true });
      const sf = fs.statfsSync(OUT), freeGb = sf.bavail * sf.bsize / 1e9;
      if (day) {
        const was = day.diskOk; day.diskOk = freeGb >= MIN_FREE_GB;
        if (was && !day.diskOk) { log(`free disk ${freeGb.toFixed(1)} GB < ${MIN_FREE_GB} GB: raw ticks paused, bars continue`); telegram(`⚠️ Depth recorder: disk ${freeGb.toFixed(1)} GB free, raw ticks paused`); }
        log(`health: ${wsState}, ticks ${day.stats.ticks}, saved ${day.stats.saved}, bars ${day.stats.bars}, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB, disk free ${freeGb.toFixed(1)} GB`);
      }
    } catch (e) { log('health check failed:', e.message); }
  }
}, 1000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log(sig); if (ws) ws.terminate(); closeDay('stop'); setTimeout(() => process.exit(0), 1500); });
log(`depth recorder up: ${UNIVERSE.length} symbols, window ${hhmm(START_MIN * 60000)}-${hhmm(STOP_MIN * 60000)} IST on trading days, output ${OUT}`);
