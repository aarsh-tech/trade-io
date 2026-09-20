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
echo "📦 [2/6] Updating Packages & Installing System Dependencies..."
sudo apt update -y
sudo apt install -y curl wget git build-essential nginx postgresql postgresql-contrib certbot python3-certbot-nginx fail2ban ufw

echo ""
echo "⚡ [3/6] Installing Node.js 20 LTS, pnpm & pm2..."
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

sudo npm install -g pnpm pm2

echo ""
echo "🗄️ [4/6] Starting & Enabling PostgreSQL Service..."
sudo systemctl enable postgresql
sudo systemctl start postgresql

echo ""
echo "🛡️ [5/6] Hardening Server Security (UFW Firewall & Fail2ban)..."
# 1. Configure UFW Firewall (Only expose SSH, HTTP, and HTTPS; DB 5432 & Node 3002 remain locked)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
echo "y" | sudo ufw enable

# 2. Configure Fail2ban (Auto-bans IPs with 5 failed attempts or scanning for exploits)
sudo tee /etc/fail2ban/jail.local > /dev/null <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = 22
mode    = aggressive

[nginx-http-auth]
enabled = true

[nginx-botsearch]
enabled  = true
port     = http,https
logpath  = %(nginx_error_log)s
maxretry = 3
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
echo "  ✅ UFW Firewall & Fail2ban active (Port 5432 & 3002 isolated internally)"

echo ""
echo "🎉 [6/6] Server Memory & Hardware Status:"
free -h

echo ""
echo "=============================================================================="
echo "✅ Server Initialization & Security Hardening Complete!"
echo "Node: $(node -v) | pnpm: $(pnpm -v) | pm2: $(pm2 -v)"
echo "Firewall: UFW active (22, 80, 443) | Protection: Fail2ban active"
echo "Next Step: Configure PostgreSQL and run pnpm db:push"
echo "=============================================================================="
