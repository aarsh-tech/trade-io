#!/usr/bin/env bash
# ==============================================================================
# Tradeio.site Automated Nginx & SSL Initializer
# ==============================================================================
set -e

echo "🌐 [1/3] Configuring Nginx Reverse Proxy for api.tradeio.site..."
sudo mkdir -p /var/www/certbot

sudo tee /etc/nginx/sites-available/tradeio.site > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name api.tradeio.site tradeio.site www.tradeio.site;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Block Swagger /docs in production
    location /docs {
        return 404;
    }

    # REST APIs
    location /v1/ {
        proxy_pass http://127.0.0.1:3002/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket Real-Time Feeds (Market Ticks & Strategy Streams)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3002/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/tradeio.site /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
echo "  ✅ Initial Nginx proxy active."

echo "🔒 [2/3] Generating Free SSL Certificate via Let's Encrypt Certbot..."
sudo certbot --nginx -d api.tradeio.site --non-interactive --agree-tos --register-unsafely-without-email || true

echo "🚀 [3/3] Reloading Nginx with SSL..."
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "=============================================================================="
echo "🎉 NGINX & SSL SETUP COMPLETE!"
echo "Test your API health now with:"
echo "curl -k http://localhost:3002/v1/health"
echo "Or visit in browser: https://api.tradeio.site/v1/health"
echo "=============================================================================="
