-- The EMA-VWAP Crossover engine now trades stocks only and refuses index symbols, so EMA-VWAP strategies on
-- NIFTY / BANKNIFTY / SENSEX move to EMA_VWAP_OPTIONS. The symbol is normalised to the option underlying, and the
-- old fixed lot count becomes the new lot cap (maxLots) so a moved strategy never trades more lots than before.
-- stopLossRs keeps its value and now means the max loss per trade used for sizing. Rows whose config is not
-- valid JSON are left alone.
DO $$
DECLARE
  r RECORD;
  cfg JSONB;
  sym TEXT;
  underlying TEXT;
BEGIN
  FOR r IN SELECT id, config FROM "strategies" WHERE type = 'EMA_VWAP_CROSSOVER' LOOP
    BEGIN
      cfg := r.config::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF jsonb_typeof(cfg) <> 'object' THEN
      CONTINUE;
    END IF;

    sym := regexp_replace(upper(trim(coalesce(cfg->>'symbol', ''))), '^(NSE|BSE|NFO|BFO):', '');
    underlying := CASE
      WHEN sym IN ('NIFTY', 'NIFTY 50', 'NIFTY50') THEN 'NIFTY'
      WHEN sym IN ('BANKNIFTY', 'NIFTY BANK', 'BANK NIFTY') THEN 'BANKNIFTY'
      WHEN sym IN ('SENSEX', 'BSE SENSEX') THEN 'SENSEX'
      ELSE NULL
    END;
    IF underlying IS NULL THEN
      CONTINUE;
    END IF;

    cfg := cfg || jsonb_build_object(
      'symbol', underlying,
      'exchange', CASE WHEN underlying = 'SENSEX' THEN 'BFO' ELSE 'NFO' END,
      'instrumentType', 'OPTION'
    );
    IF (cfg->>'lots') ~ '^[0-9]+$' AND (cfg->>'lots')::int >= 1 AND NOT cfg ? 'maxLots' THEN
      cfg := cfg || jsonb_build_object('maxLots', (cfg->>'lots')::int);
    END IF;

    UPDATE "strategies"
       SET type = 'EMA_VWAP_OPTIONS',
           config = cfg::text,
           "updatedAt" = now()
     WHERE id = r.id;
  END LOOP;
END $$;
