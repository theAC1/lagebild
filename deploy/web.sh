#!/usr/bin/env bash
# Live-Update der Android-App: baut die Oberfläche der App (build:app), packt sie als web-<code>.zip und legt sie samt
# web.json nach LXC 124 (/var/lib/lagebild/app, Datenverzeichnis, nicht im Repo). Kein Neustart nötig: der Server liefert
# /app/web.json und /app/web-<code>.zip direkt von dort. web.json kommt zuletzt, damit die Apps erst bei vollständigem Bundle laden.
# Läuft am Ende von deploy/deploy.sh mit; einzeln: deploy/web.sh
# Eine neue APK ist nur nötig, wenn sich Natives ändert (Plugins, Manifest, MainActivity); dann deploy/min-native-code auf
# den versionCode der neuen APK setzen, damit ältere Apps den Stand nicht übernehmen.
set -euo pipefail
CT=${CT:-124}
ZIEL=/var/lib/lagebild/app
BEHALTEN=${BEHALTEN:-3}
cd "$(dirname "$0")/.."

# Stand der Oberfläche: Minuten seit 1.1.2026 (gleiche Skala wie der APK-versionCode in deploy/android.sh)
WEB_CODE=${WEB_CODE:-$(( ($(date +%s) - 1767225600) / 60 ))}
WEB_NAME=${WEB_NAME:-1.0.$(git rev-list --count HEAD)}
MIN_NATIVE=$(tr -d '[:space:]' < deploy/min-native-code)
[[ "$MIN_NATIVE" =~ ^[0-9]+$ ]] || { echo "deploy/min-native-code muss eine Zahl enthalten" >&2; exit 1; }
echo "== Web-Stand $WEB_NAME (Code $WEB_CODE, nativ ab $MIN_NATIVE)"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
WEB_CODE=$WEB_CODE npm run build:app
ZIP="$WORK/web-$WEB_CODE.zip"
# index.html muss im Wurzelverzeichnis des zip liegen (Anforderung des Plugins)
python3 -I - client/dist-app "$ZIP" <<'PY'
import os, sys, zipfile
src, ziel = sys.argv[1:3]
with zipfile.ZipFile(ziel, "w", zipfile.ZIP_DEFLATED) as z:
    for ordner, _, dateien in sorted(os.walk(src)):
        for d in sorted(dateien):
            p = os.path.join(ordner, d)
            z.write(p, os.path.relpath(p, src))
PY
SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)
printf '{"webCode":%s,"webName":"%s","minNativeCode":%s,"url":"/app/web-%s.zip","sha256":"%s"}\n' \
  "$WEB_CODE" "$WEB_NAME" "$MIN_NATIVE" "$WEB_CODE" "$SHA" > "$WORK/web.json"
echo "== $(du -h "$ZIP" | cut -f1) zip, SHA-256 $SHA"

pct exec "$CT" -- bash -c "set -e; install -d -m 755 $ZIEL; cat > $ZIEL/web-$WEB_CODE.zip.neu; chmod 644 $ZIEL/web-$WEB_CODE.zip.neu; mv $ZIEL/web-$WEB_CODE.zip.neu $ZIEL/web-$WEB_CODE.zip" < "$ZIP"
pct exec "$CT" -- bash -c "set -e; cat > $ZIEL/web.json.neu; chmod 644 $ZIEL/web.json.neu; mv $ZIEL/web.json.neu $ZIEL/web.json" < "$WORK/web.json"
# Alte Bundles aufräumen (die neuesten $BEHALTEN bleiben)
pct exec "$CT" -- bash -c "cd $ZIEL && ls -1 web-*.zip | sort -t- -k2 -n -r | tail -n +$((BEHALTEN + 1)) | xargs -r rm -f --"
pct exec "$CT" -- bash -c 'node -e "fetch(\"http://127.0.0.1:8080/app/web.json\").then(async r=>{console.log(\"HTTP\",r.status,await r.text());process.exit(r.ok?0:1)})"'
