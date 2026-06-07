const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseTradesFromLogs(logs, strategyType) {
  const trades = [];
  
  // Track open trades in log parsing
  let openTrade = null;

  for (const line of logs) {
    // 1. EMA-RSI Options log patterns
    if (strategyType === 'EMA_RSI_OPTIONS') {
      // Entry: "📋 BUY/SELL symbol | LTP ₹price | SL ... | Qty qty"
      // or "Selected Option LTP: ₹price"
      const entryMatch = line.match(/📋\s+(BUY|SELL)\s+(\S+)\s+\|\s+LTP\s+₹([\d.]+).*Qty\s+(\d+)/i);
      if (entryMatch) {
        openTrade = {
          side: entryMatch[1].toUpperCase(),
          symbol: entryMatch[2],
          entryPrice: parseFloat(entryMatch[3]),
          qty: parseInt(entryMatch[4]),
          createdAt: line
        };
      }
      
      // Exit: "📤 Exit — Reason: reason | P&L: +/-(rs)pnl"
      const exitMatch = line.match(/Exit\s+—\s+Reason:\s+(\w+)\s+\|\s+P&L:\s*([+-]?)\s*₹?\s*([\d.]+)/i);
      if (exitMatch && openTrade) {
        const sign = exitMatch[2] === '-' ? -1 : 1;
        const pnl = sign * parseFloat(exitMatch[3]);
        trades.push({
          symbol: openTrade.symbol,
          entryPrice: openTrade.entryPrice,
          exitPrice: openTrade.entryPrice + (pnl / openTrade.qty), // reconstructed exit price
          qty: openTrade.qty,
          side: openTrade.side,
          pnl,
          isWin: pnl > 0,
          reason: exitMatch[1],
          source: 'log'
        });
        openTrade = null;
      }
    }
    
    // 2. Gamma Blast log patterns
    if (strategyType === 'GAMMA_BLAST') {
      // Entry: "📋 BUY CALL/PUT | optionSymbol | Strike: ... | LTP: ₹entryPx | Qty: qty"
      const entryMatch = line.match(/📋\s+BUY\s+(CE|PE|CALL|PUT)\s*\|\s*(\S+)\s*\|.*LTP:\s*₹([\d.]+).*Qty:\s*(\d+)/i);
      if (entryMatch) {
        openTrade = {
          side: 'BUY',
          symbol: entryMatch[2],
          entryPrice: parseFloat(entryMatch[3]),
          qty: parseInt(entryMatch[4]),
          optionType: entryMatch[1]
        };
      }
      
      // Exit (Trailing SL hit): "🎯 TRAILING SL HIT! Exit at ₹exitPrice"
      const exitMatch = line.match(/🎯\s+TRAILING\s+SL\s+HIT!\s+Exit\s+at\s+₹([\d.]+)/i);
      if (exitMatch && openTrade) {
        const exitPrice = parseFloat(exitMatch[1]);
        const pnl = (exitPrice - openTrade.entryPrice) * openTrade.qty;
        trades.push({
          symbol: openTrade.symbol,
          entryPrice: openTrade.entryPrice,
          exitPrice,
          qty: openTrade.qty,
          side: openTrade.side,
          pnl,
          isWin: pnl > 0,
          reason: 'TRAILING_SL',
          source: 'log'
        });
        openTrade = null;
      }
      
      // Force Exit: "Force exit: BUY/SELL optionSymbol | Entry: ₹entryPrice | ~P&L: ₹pnl"
      const forceMatch = line.match(/Force\s+exit:.*Entry:\s*₹([\d.]+).*~P&L:\s*([+-]?)\s*₹?\s*([\d.]+)/i);
      if (forceMatch && openTrade) {
        const sign = forceMatch[2] === '-' ? -1 : 1;
        const pnl = sign * parseFloat(forceMatch[3]);
        trades.push({
          symbol: openTrade.symbol,
          entryPrice: openTrade.entryPrice,
          exitPrice: openTrade.entryPrice + (pnl / openTrade.qty),
          qty: openTrade.qty,
          side: openTrade.side,
          pnl,
          isWin: pnl > 0,
          reason: 'FORCE_EXIT',
          source: 'log'
        });
        openTrade = null;
      }
    }
  }
  
  return trades;
}

async function main() {
  const strategies = await prisma.strategy.findMany({
    include: {
      executions: {
        orderBy: { startedAt: 'desc' }
      }
    }
  });

  for (const s of strategies) {
    console.log(`========================================`);
    console.log(`Strategy: ${s.name} (${s.type})`);
    
    let allLogTrades = [];
    for (const e of s.executions) {
      const logs = JSON.parse(e.logs || '[]');
      const trades = parseTradesFromLogs(logs, s.type);
      allLogTrades.push(...trades);
    }
    
    console.log(`Parsed Log Trades: ${allLogTrades.length}`);
    for (const t of allLogTrades) {
      console.log(`  - ${t.symbol} ${t.side} Entry: ${t.entryPrice} Exit: ${t.exitPrice} Qty: ${t.qty} P&L: ₹${t.pnl} (${t.isWin ? 'WIN' : 'LOSS'}) [Reason: ${t.reason}]`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
