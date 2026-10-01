-- EMA-VWAP Options: index options with setups read on the option's own chart (split from EMA_VWAP_CROSSOVER).
-- On its own migration because Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE "StrategyType" ADD VALUE IF NOT EXISTS 'EMA_VWAP_OPTIONS' AFTER 'EMA_VWAP_CROSSOVER';
