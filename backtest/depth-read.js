// Reads a depth-recorder day folder (see depth-recorder.js).
// Usage: node backtest/depth-read.js <dayDir> [SYMBOL] [--limit N]   -> prints decoded ticks (all symbols or one)
//        node backtest/depth-read.js <dayDir> --summary               -> ticks per file / per symbol
// As a module: const { readTicks } = require('./depth-read'); for (const t of readTicks(dir)) ...
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function gunzipLenient(file) {
  // multi-member gzip; a crash can leave the last member truncated, so keep whatever decodes
  try { return zlib.gunzipSync(fs.readFileSync(file), { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch (e) { return Buffer.alloc(0); }
}
function decode(rec, o, syms) {
  const p = o + 6, i32 = (k) => rec.readInt32BE(p + k);
  const lvl = (base) => [0, 1, 2, 3, 4].map((l) => ({ qty: i32(base + l * 12), price: i32(base + l * 12 + 4) / 100, orders: rec.readInt16BE(p + base + l * 12 + 8) }));
  return {
    ms: rec.readUInt32LE(o), sym: syms[rec.readUInt16LE(o + 4)], ltp: i32(4) / 100, lastQty: i32(8), avg: i32(12) / 100, volume: i32(16),
    totBuy: i32(20), totSell: i32(24), open: i32(28) / 100, high: i32(32) / 100, low: i32(36) / 100, prevClose: i32(40) / 100,
    lastTradeTime: i32(44), exchTime: i32(60), bids: lvl(64), asks: lvl(124),
  };
}
function* readTicks(dir, only) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  for (const f of fs.readdirSync(dir).filter((f) => /^ticks-.*\.bin\.gz$/.test(f)).sort()) {
    const b = gunzipLenient(path.join(dir, f));
    for (let o = 0; o + 190 <= b.length; o += 190) {
      if (only !== undefined && b.readUInt16LE(o + 4) !== only) continue;
      yield decode(b, o, meta.symbols);
    }
  }
}
module.exports = { readTicks, decode };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.log('usage: node backtest/depth-read.js <dayDir> [SYMBOL] [--limit N] | --summary'); process.exit(1); }
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const li = process.argv.indexOf('--limit'), limit = li > 0 ? +process.argv[li + 1] : 20;
  if (process.argv.includes('--summary')) {
    const per = new Map(); let n = 0;
    for (const t of readTicks(dir)) { n++; per.set(t.sym, (per.get(t.sym) || 0) + 1); }
    console.log(`${meta.date}: ${n} ticks, ${per.size}/${meta.symbols.length} symbols; busiest:`, [...per].sort((a, b) => b[1] - a[1]).slice(0, 10));
  } else {
    const sym = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
    const only = sym ? meta.symbols.indexOf(sym) : undefined;
    if (sym && only < 0) { console.log('symbol not in this day:', sym); process.exit(1); }
    let k = 0;
    for (const t of readTicks(dir, only)) {
      const hhmmss = new Date(t.ms).toISOString().slice(11, 23);
      console.log(`${hhmmss} ${t.sym} ltp ${t.ltp} vol ${t.volume} buyQ ${t.totBuy} sellQ ${t.totSell} | bids ${t.bids.map((x) => `${x.price}x${x.qty}(${x.orders})`).join(' ')} | asks ${t.asks.map((x) => `${x.price}x${x.qty}(${x.orders})`).join(' ')}`);
      if (++k >= limit) break;
    }
  }
}
