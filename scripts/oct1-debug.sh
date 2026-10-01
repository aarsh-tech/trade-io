#!/usr/bin/env bash
# Read-only debug dump for the 1 Oct 2026 EMA-VWAP trades (KARAMTARA 09:30-09:50, TARIL 10:15-10:25).
# Collects orders, strategy logs, the signal file and PM2 backend logs into ~/oct1-debug.txt.
# Usage on the server: bash scripts/oct1-debug.sh
cd "$(dirname "$0")/.." || exit 1
OUT=~/oct1-debug.txt
: > "$OUT"

# Find the database URL: .env files first, then the running PM2 process environment
DB=$(grep -h '^DATABASE_URL' apps/auth-service/.env .env apps/auth-service/.env.production .env.production 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'" | sed 's/?.*//')
if [ -z "$DB" ]; then
  PID=$(pm2 id algo-backend 2>/dev/null | tr -dc '0-9')
  [ -n "$PID" ] && DB=$(pm2 env "$PID" 2>/dev/null | grep '^DATABASE_URL' | cut -d: -f2- | xargs | sed 's/?.*//')
fi
if [ -z "$DB" ]; then echo "DATABASE_URL not found. Send the output of: pm2 ls"; exit 1; fi
echo "Database found."

echo "===== 1. ORDERS (IST) =====" >> "$OUT"
psql "$DB" -c "SELECT to_char(\"createdAt\" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata','HH24:MI:SS') AS ist, symbol, side, \"orderType\", qty, price, \"triggerPrice\", \"avgPrice\", \"filledQty\", status, tag FROM orders WHERE \"createdAt\" >= '2026-10-01 03:30:00' AND \"createdAt\" < '2026-10-01 10:00:00' ORDER BY \"createdAt\";" >> "$OUT" 2>&1

echo "===== 2. STRATEGY LOGS =====" >> "$OUT"
psql "$DB" -At -c "SELECT line FROM strategy_executions e JOIN strategies s ON s.id = e.\"strategyId\", json_array_elements_text(e.logs::json) AS line WHERE s.type = 'EMA_VWAP_CROSSOVER' AND e.\"startedAt\" >= '2026-09-25' AND line LIKE '[1/10/2026,%' AND (line ~ 'TARIL|KARAMTARA' OR line ~ '1/10/2026, (9:(1[5-9]|[2-5][0-9])|10:(1[0-9]|2[0-9]|3[0-5])):');" >> "$OUT" 2>&1

echo "===== 3. SIGNAL FILE =====" >> "$OUT"
grep -avE '"kind":"SCAN"' apps/auth-service/logs/strategy-signals/2026-10-01.jsonl >> "$OUT" 2>&1

echo "===== 4. PM2 BACKEND LOG =====" >> "$OUT"
LOGS=""
for f in logs/pm2-backend-out*.log logs/pm2-backend-error*.log ~/.pm2/logs/algo-backend-out*.log ~/.pm2/logs/algo-backend-error*.log; do [ -f "$f" ] && LOGS="$LOGS $f"; done
echo "log files: $LOGS" >> "$OUT"
if [ -n "$LOGS" ]; then
  # PM2 prefix in IST or UTC, plus Nest's own IST timestamp
  TIMES='2026-10-01[ T](09:(1[5-9]|[2-5][0-9])|10:(1[0-9]|2[0-9]|3[0-5])|03:(4[5-9]|5[0-9])|04:[0-5][0-9])|10/0?1/2026, (0?9:(1[5-9]|[2-5][0-9])|10:(1[0-9]|2[0-9]|3[0-5]))'
  grep -ahE "$TIMES" $LOGS | grep -avE 'SCANNER HEARTBEAT|Dynamically subscribed' >> "$OUT"
  echo "----- restarts / crashes today -----" >> "$OUT"
  grep -ahE 'Boot recovery|Nest application successfully started|uncaught|exited with code|WATCHDOG' $LOGS | grep -aE '2026-10-01|10/0?1/2026' >> "$OUT"
fi

ls -lh "$OUT"; wc -l "$OUT"
