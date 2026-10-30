#!/usr/bin/env bash
# Baut die Android-App (APK) reproduzierbar: Oberfläche hier (Node), Gradle in LXC 120 «android-build» (JDK 21 + SDK).
# Ergebnis: $OUT/lagebild-<versionName>.apk, $OUT/lagebild.apk und $OUT/version.json (für deploy/apk.sh).
# Nichts wird ausgeliefert. Signier-Keystore: einmalig erzeugt unter $KS_DIR (nie ins Git).
#   VARIANTE=debug ./deploy/android.sh   → unsigniert/Debug-signiert, nur zum Ausprobieren
set -euo pipefail
CT=${CT:-120}
OUT=${OUT:-/root/projekte/lagebild-apk}
KS_DIR=${KS_DIR:-/root/.config/lagebild}
VARIANTE=${VARIANTE:-release}
BUILD=/root/lagebild-build
JAVA_HOME_CT=/usr/lib/jvm/java-1.21.0-openjdk-amd64
SDK=/opt/android-sdk
cd "$(dirname "$0")/.."

# versionCode: Minuten seit 1.1.2026 (steigt mit jedem Bauen, passt in 31 Bit bis ins Jahr 6000+)
VERSION_CODE=${VERSION_CODE:-$(( ($(date +%s) - 1767225600) / 60 ))}
VERSION_NAME=${VERSION_NAME:-1.0.$(git rev-list --count HEAD)}
echo "== Version $VERSION_NAME (Code $VERSION_CODE), Variante $VARIANTE"

echo "== Oberfläche bauen und in android/ synchronisieren"
WEB_CODE=$VERSION_CODE npm run build:app # eingebauter Web-Stand = Rückfall des Live-Updates
npx cap sync android

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/node_modules"

if [ "$VARIANTE" = release ]; then
  if [ ! -f "$KS_DIR/lagebild.jks" ]; then
    echo "== Signier-Keystore einmalig erzeugen (in $KS_DIR, Passwort daneben)"
    install -d -m 700 "$KS_DIR"
    PASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
    ( umask 077; printf '%s' "$PASS" > "$KS_DIR/keystore.pass" )
    # Passwort über stdin, nicht über die Prozessliste
    printf '%s\n' "$PASS" | pct exec "$CT" -- bash -c "set -e; read -r p; keytool -genkeypair -keystore /tmp/lagebild.jks -storetype PKCS12 -alias lagebild \
      -keyalg RSA -keysize 4096 -validity 36500 -storepass \"\$p\" -keypass \"\$p\" -dname 'CN=Lagebild, O=Arvuna, C=CH' >/dev/null 2>&1; cat /tmp/lagebild.jks; rm /tmp/lagebild.jks" \
      > "$KS_DIR/lagebild.jks"
    chmod 600 "$KS_DIR/lagebild.jks"
  fi
  cp "$KS_DIR/lagebild.jks" "$STAGE/lagebild.jks"
  ( umask 077; printf 'storeFile=%s/android/lagebild.jks\nstorePassword=%s\nkeyAlias=lagebild\nkeyPassword=%s\n' \
      "$BUILD" "$(cat "$KS_DIR/keystore.pass")" "$(cat "$KS_DIR/keystore.pass")" > "$STAGE/keystore.properties" )
  TASK=assembleRelease
  APK_PFAD=app/build/outputs/apk/release/app-release.apk
else
  TASK=assembleDebug
  APK_PFAD=app/build/outputs/apk/debug/app-debug.apk
fi

echo "== Projekt nach LXC $CT kopieren"
# Die nativen Teile der Capacitor-Plugins liegen in node_modules (capacitor.settings.gradle verweist dorthin)
cp -r node_modules/@capacitor node_modules/@capacitor-community node_modules/@capgo "$STAGE/node_modules/"
tar -czf - --exclude='android/.gradle' --exclude='android/build' --exclude='android/app/build' android -C "$STAGE" node_modules \
  $( [ "$VARIANTE" = release ] && echo "lagebild.jks keystore.properties" ) \
  | pct exec "$CT" -- bash -c "set -e; rm -rf $BUILD; mkdir -p $BUILD; tar -xzf - -C $BUILD
    cd $BUILD; [ -f lagebild.jks ] && mv lagebild.jks keystore.properties android/ || true
    [ -f android/keystore.properties ] && chmod 600 android/keystore.properties android/lagebild.jks || true"

echo "== Gradle $TASK"
pct exec "$CT" -- bash -c "set -e; cd $BUILD/android
  export JAVA_HOME=$JAVA_HOME_CT ANDROID_HOME=$SDK ANDROID_SDK_ROOT=$SDK
  echo \"sdk.dir=$SDK\" > local.properties
  ./gradlew --no-daemon -q $TASK -PlageVersionCode=$VERSION_CODE -PlageVersionName=$VERSION_NAME
  rm -f keystore.properties lagebild.jks"

echo "== APK holen"
mkdir -p "$OUT"
APK="$OUT/lagebild-$VERSION_NAME.apk"
pct exec "$CT" -- cat "$BUILD/android/$APK_PFAD" > "$APK"
cp "$APK" "$OUT/lagebild.apk"
printf '{"versionCode":%s,"versionName":"%s"}\n' "$VERSION_CODE" "$VERSION_NAME" > "$OUT/version.json"

echo "== Prüfung (aapt2)"
pct exec "$CT" -- bash -c "$SDK/build-tools/36.0.0/aapt2 dump badging $BUILD/android/$APK_PFAD | grep -E '^(package|sdkVersion|targetSdkVersion|uses-permission)'"
echo "== Fertig: $APK"
