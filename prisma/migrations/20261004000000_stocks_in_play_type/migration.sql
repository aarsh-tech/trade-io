-- Stocks-in-Play ORB: shorts the break of the first 5m candle in NSE stocks trading >= 10x their usual opening volume.
-- On its own migration because Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE "StrategyType" ADD VALUE IF NOT EXISTS 'STOCKS_IN_PLAY' AFTER 'EMA_VWAP_OPTIONS';
