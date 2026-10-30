#!/usr/bin/env bash
# Legt die mit deploy/android.sh gebaute APK in LXC 124 ab (Datenverzeichnis, nicht im Git). Kein Neustart nötig:
# der Server liefert /app/lagebild.apk und /app/version.json direkt von dort. version.json kommt zuletzt, damit der
# Update-Hinweis in den Apps erst erscheint, wenn die APK da ist.
set -euo pipefail
CT=${CT:-124}
SRC=${SRC:-/root/projekte/lagebild-apk}
ZIEL=/var/lib/lagebild/app
[ -f "$SRC/lagebild.apk" ] && [ -f "$SRC/version.json" ] || { echo "Nichts in $SRC – erst deploy/android.sh ausführen" >&2; exit 1; }
cat "$SRC/lagebild.apk" | pct exec "$CT" -- bash -c "set -e; install -d -m 755 $ZIEL; cat > $ZIEL/lagebild.apk.neu; chmod 644 $ZIEL/lagebild.apk.neu; mv $ZIEL/lagebild.apk.neu $ZIEL/lagebild.apk"
cat "$SRC/version.json" | pct exec "$CT" -- bash -c "set -e; cat > $ZIEL/version.json.neu; chmod 644 $ZIEL/version.json.neu; mv $ZIEL/version.json.neu $ZIEL/version.json"
pct exec "$CT" -- bash -c 'node -e "fetch(\"http://127.0.0.1:8080/app/version.json\").then(async r=>{console.log(\"HTTP\",r.status,await r.text());process.exit(r.ok?0:1)})"'
