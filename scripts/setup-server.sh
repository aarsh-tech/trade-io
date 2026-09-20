#!/usr/bin/env bash
# ==============================================================================
# Tradeio.site Automated AWS Lightsail Server Initializer
# Tested on Ubuntu 22.04 / 24.04 LTS
# ==============================================================================
set -e

echo "🚀 [1/5] Checking and Configuring 4GB NVMe Swapfile..."
if [ $(swapon --show | wc -l) -le 1 ]; then
    echo "  -> Allocating 4GB swap space on NVMe SSD..."
    sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    echo "  ✅ 4GB Swap successfully created and activated!"
else
    echo "  ✅ Swap is already configured:"
    swapon --show
fi

echo ""
echo "📦 [2/5] Updating Packages & Installing System Dependencies..."
sudo apt update -y
sudo apt install -y curl wget git build-essential nginx postgresql postgresql-contrib certbot python3-certbot-nginx

echo ""
echo "⚡ [3/5] Installing Node.js 20 LTS, pnpm & pm2..."
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

sudo npm install -g pnpm pm2

echo ""
echo "🗄️ [4/5] Starting & Enabling PostgreSQL Service..."
sudo systemctl enable postgresql
sudo systemctl start postgresql

echo ""
echo "🎉 [5/5] Server Memory & Swap Status:"
free -h

echo ""
echo "=============================================================================="
echo "✅ Server Initialization Complete!"
echo "Node: $(node -v) | pnpm: $(pnpm -v) | pm2: $(pm2 -v)"
echo "Next Step: Configure PostgreSQL and run pnpm db:push"
echo "=============================================================================="
