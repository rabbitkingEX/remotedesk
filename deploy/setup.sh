#!/bin/bash
# RemoteDesk Server Setup — Ubuntu 20.04/22.04/24.04
# Usage: sudo bash setup.sh YOUR_DOMAIN.COM
#
# This script installs:
# - Node.js 20
# - Nginx (reverse proxy + SSL via Let's Encrypt)
# - Coturn (TURN/STUN server for NAT traversal)
# - PM2 (process manager)

set -e

DOMAIN=$1
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash setup.sh YOUR_DOMAIN.COM"
  exit 1
fi

TURN_SECRET="$(openssl rand -hex 32)"
APP_DIR="/opt/remotedesk"

echo "=== Setting up RemoteDesk on $DOMAIN ==="

# 1. Install Node.js 20
echo ">>> Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 2. Install Nginx
echo ">>> Installing Nginx..."
apt-get install -y nginx

# 3. Install Coturn
echo ">>> Installing Coturn..."
apt-get install -y coturn

# 4. Install Certbot
echo ">>> Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx

# 5. Install PM2
echo ">>> Installing PM2..."
npm install -g pm2

# 6. Copy app files
echo ">>> Setting up app..."
mkdir -p $APP_DIR
cp -r . $APP_DIR/
cd $APP_DIR
npm install --production

# 7. Build frontend
npm run build

# 8. Configure Coturn
echo ">>> Configuring Coturn..."
cat > /etc/turnserver.conf << EOF
# RemoteDesk TURN server
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=$DOMAIN
cert=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
pkey=/etc/letsencrypt/live/$DOMAIN/privkey.pem
no-cli
no-tlsv1
no-tlsv1_1
EOF

# Enable coturn daemon
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# 9. Configure Nginx
echo ">>> Configuring Nginx..."
cat > /etc/nginx/sites-available/remotedesk << EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/remotedesk /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 10. Get SSL certificate
echo ">>> Getting SSL certificate..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# 11. Start app with PM2
echo ">>> Starting RemoteDesk..."
cd $APP_DIR
TURN_DOMAIN=$DOMAIN TURN_SECRET=$TURN_SECRET PORT=3200 pm2 start server/index.js --name remotedesk
pm2 save
pm2 startup

# 12. Start Coturn
systemctl enable coturn
systemctl restart coturn

# 13. Open firewall ports
echo ">>> Configuring firewall..."
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3478/tcp  # TURN
ufw allow 3478/udp  # TURN
ufw allow 5349/tcp  # TURNS
ufw allow 49152:65535/udp  # TURN relay range

echo ""
echo "=== RemoteDesk is live! ==="
echo ""
echo "  URL:          https://$DOMAIN"
echo "  TURN Secret:  $TURN_SECRET"
echo ""
echo "  Save the TURN secret — you'll need it if you reconfigure."
echo ""
echo "  Both PCs just open https://$DOMAIN in Chrome."
echo ""
