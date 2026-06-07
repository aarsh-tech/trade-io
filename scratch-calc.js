const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseTradesFromLogs(logs, strategyType) {
  const trades = [];
  let openTrade = null;

  for (const line of logs) {
    if (strategyType === 'EMA_RSI_OPTIONS') {
      const entryMatch = line.match(/📋\s+(BUY|SELL)\s+(\S+)\s+\|\s+LTP\s+₹([\d.]+).*Qty\s+(\d+)/i);
      if (entryMatch) {
        openTrade = {
          side: entryMatch[1].toUpperCase(),
          symbol: entryMatch[2],
          entryPrice: parseFloat(entryMatch[3]),
          qty: parseInt(entryMatch[4])
        };
      }
      
      const exitMatch = line.match(/Exit\s+—\s+Reason:\s+(\w+)\s+\|\s+P&L:\s*([+-]?)\s*₹?\s*([\d.]+)/i);
      if (exitMatch && openTrade) {
        const sign = exitMatch[2] === '-' ? -1 : 1;
        const pnl = sign * parseFloat(exitMatch[3]);
        trades.push({
          symbol: openTrade.symbol,
          entryPrice: openTrade.entryPrice,
          exitPrice: openTrade.entryPrice + (pnl / openTrade.qty),
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
    
    if (strategyType === 'GAMMA_BLAST') {
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

function calculatePerformance(executions, strategyType) {
  const completedTrades = [];

  for (const exec of executions) {
    const orders = exec.orders || [];
    let execTrades = [];

    // Approach 1: Try to calculate trades from completed orders in DB
    if (orders.length > 0) {
      const symbolOrders = {};
      for (const o of orders) {
        if (!symbolOrders[o.symbol]) {
          symbolOrders[o.symbol] = [];
        }
        symbolOrders[o.symbol].push(o);
      }

      for (const symbol in symbolOrders) {
        const list = symbolOrders[symbol].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        let position = 0;
        let cashFlow = 0;
        let entryPrice = 0;
        let entryQty = 0;
        let entrySide = null;

        for (const o of list) {
          const price = o.price || o.avgPrice || 0;
          if (price === 0) continue;

          if (position === 0) {
            entryPrice = price;
            entryQty = o.qty;
            entrySide = o.side;
          }

          if (o.side === 'BUY') {
            position += o.qty;
            cashFlow -= price * o.qty;
          } else {
            position -= o.qty;
            cashFlow += price * o.qty;
          }

          if (position === 0) {
            const pnl = cashFlow;
            execTrades.push({
              symbol,
              entryPrice,
              exitPrice: price,
              qty: entryQty,
              side: entrySide,
              pnl,
              isWin: pnl > 0,
              createdAt: o.createdAt,
              source: 'order'
            });
            cashFlow = 0;
          }
        }
      }
    }

    // Approach 2: If no completed trades could be parsed from orders, fall back to parsing logs
    if (execTrades.length === 0) {
      let logs = [];
      try {
        logs = JSON.parse(exec.logs || '[]');
      } catch (e) {
        logs = [];
      }
      if (logs.length > 0) {
        execTrades = parseTradesFromLogs(logs, strategyType);
      }
    }

    completedTrades.push(...execTrades.map(t => ({ ...t, executionId: exec.id })));
  }

  // Calculate metrics
  const totalTrades = completedTrades.length;
  const wins = completedTrades.filter(t => t.isWin);
  const losses = completedTrades.filter(t => !t.isWin);

  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  const netPnl = completedTrades.reduce((sum, t) => sum + t.pnl, 0);

  const totalProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99.9 : 0;

  const avgProfitPerWin = wins.length > 0 ? totalProfit / wins.length : 0;

  return {
    totalTrades,
    winRate,
    netPnl,
    profitFactor,
    avgProfitPerWin,
    trades: completedTrades
  };
}

async function main() {
  const strategies = await prisma.strategy.findMany({
    include: {
      executions: {
        include: {
          orders: {
            where: { status: 'COMPLETE' }
          }
        }
      }
    }
  });

  for (const s of strategies) {
    console.log(`========================================`);
    console.log(`Strategy: ${s.name} (${s.type})`);
    
    const performance = calculatePerformance(s.executions, s.type);
    console.log(`Total Trades: ${performance.totalTrades}`);
    console.log(`Win Rate: ${performance.winRate.toFixed(1)}%`);
    console.log(`Net P&L: ₹${performance.netPnl.toFixed(2)}`);
    console.log(`Profit Factor: ${performance.profitFactor.toFixed(2)}`);
    console.log(`Avg Profit per Win: ₹${performance.avgProfitPerWin.toFixed(2)}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
