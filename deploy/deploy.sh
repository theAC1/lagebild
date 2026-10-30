#!/usr/bin/env bash
# Baut lokal (Proxmox-Host) und spielt Server + client/dist in LXC 124 ein, danach das App-Web-Bundle (web.sh). Daten (/var/lib/lagebild) bleiben.
set -euo pipefail
CT=${CT:-124}
cd "$(dirname "$0")/.."
npm run build
tar -czf - package.json package-lock.json shared server/src client/dist deploy/lagebild.service \
  | pct exec "$CT" -- bash -c 'set -e; rm -rf /opt/lagebild/neu; mkdir -p /opt/lagebild/neu; tar -xzf - -C /opt/lagebild/neu
    cd /opt/lagebild/neu && npm ci --omit=dev --no-audit --no-fund >/dev/null
    rm -rf /opt/lagebild/alt; [ -d /opt/lagebild/app ] && mv /opt/lagebild/app /opt/lagebild/alt; mv /opt/lagebild/neu /opt/lagebild/app
    install -m 644 /opt/lagebild/app/deploy/lagebild.service /etc/systemd/system/lagebild.service
    [ -f /etc/lagebild.env ] || { umask 077; echo "LAGE_ERSTELL_PASSWORT=$(head -c 18 /dev/urandom | base64)" > /etc/lagebild.env; echo "Zufälliges Erstell-Passwort gesetzt – mit set-passwort ersetzen"; }
    systemctl daemon-reload; systemctl enable -q lagebild; systemctl restart lagebild; sleep 2; systemctl is-active lagebild'
pct exec "$CT" -- bash -c 'node -e "fetch(\"http://127.0.0.1:8080/\").then(r=>{console.log(\"HTTP\",r.status);process.exit(r.ok?0:1)})"'

# Live-Update der Android-App: Oberfläche als Bundle + web.json bereitstellen (siehe deploy/web.sh)
deploy/web.sh # (Arbeitsverzeichnis ist oben auf die Repo-Wurzel gesetzt)
