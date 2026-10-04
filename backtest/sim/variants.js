// Named configurations for sim/run.js. `baseline` = the live engine's defaults (AUTO mode, FULL target).
const ALL = ['DIRECT', 'OPEN_DRIVE', 'PULLBACK_REJECTION', 'TREND_BREAKDOWN', 'TREND_CONT_SHORT', 'INSIDE_CANDLE'];
const without = (...x) => ALL.filter((s) => !x.includes(s));
module.exports = {
  baseline: {},
  nocost: { costs: false, slipTicks: 0, slipPct: 0 },
  // single changes
  noStag: { stagnation: false },
  noOpenDrive: { setups: without('OPEN_DRIVE') },
  noPullback: { setups: without('PULLBACK_REJECTION') },
  onlyInside: { setups: ['INSIDE_CANDLE'] },
  onlyDirect: { setups: ['DIRECT'] },
  trendMatch: { requireTrendMatch: true },
  lowTurnover: { turnoverW: 2 },
  chase3: { chaseMaxFromOpenPct: 3 },
  tR1: { targetMode: 'R', targetR: 1 },
  tR2: { targetMode: 'R', targetR: 2 },
  tR3: { targetMode: 'R', targetR: 3 },
  tEma: { targetMode: 'EMA' },
  wideSl: { minSlPct: 1.5, maxSlPct: 3 },
  after930: { firstEntrySlot: 3 },
  after1000: { firstEntrySlot: 9 },
  max1: { maxTradesPerDay: 1 },
  max4: { maxTradesPerDay: 4 },
  noLock: { dailyLock: false },
  mkt01: { marketFilterPct: 0.1 },
  mkt03: { marketFilterPct: 0.3 },
  noVolGate: { volumeGate: false },
  volZ2: { minZ: 2, rvolFloor: 2 },
  longOnly: { directions: ['LONG'] },
  shortOnly: { directions: ['SHORT'] },
  liquid50: { minTurnoverCr: 50 },
};
