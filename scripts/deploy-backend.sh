#!/usr/bin/env bash
# ==============================================================================
# Tradeio.site Automated Backend Deployer & Initializer
# ==============================================================================
set -e

echo "🗄️ [1/6] Setting up PostgreSQL Database..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'algotrade'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE algotrade;"
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'TradeioPass2026!';"

echo "⚙️ [2/6] Generating Production .env..."
if [ ! -f .env ]; then
  JWT_SEC=$(openssl rand -hex 32)
  ENC_SEC=$(openssl rand -hex 32)
  cat <<EOF > .env
DATABASE_URL="postgresql://postgres:TradeioPass2026!@localhost:5432/algotrade?schema=public"
NODE_ENV="production"
PORT=3002
FRONTEND_URL="https://tradeio.site,https://www.tradeio.site"
JWT_SECRET="$JWT_SEC"
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
ENCRYPTION_SECRET="$ENC_SEC"
ENABLE_SWAGGER="false"
EOF
  echo "  ✅ .env created with fresh encryption keys."
else
  echo "  ✅ .env already exists, preserving existing secrets."
fi

echo "📦 [3/6] Installing Dependencies & Generating Prisma Client..."
pnpm install
pnpm db:push

echo "👤 [4/6] Seeding Dedicated Admin User..."
pnpm db:seed:admin

echo "🏗️ [5/6] Compiling Production Backend Bundle..."
pnpm --filter @algo-trade/auth-service build

echo "🚀 [6/6] Launching Backend with PM2 Supervisor..."
pm2 delete algo-backend 2>/dev/null || true
pm2 start ecosystem.config.js --only algo-backend --env production
pm2 save

echo ""
echo "=============================================================================="
echo "🎉 BACKEND DEPLOYMENT COMPLETE & ONLINE!"
echo "Status:"
pm2 status
echo "=============================================================================="
