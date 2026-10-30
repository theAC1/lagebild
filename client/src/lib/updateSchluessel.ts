// Öffentlicher Schlüssel für das Siegel der Live-Update-Stände (ECDSA P-256), abgeleitet aus dem privaten Schlüssel
// /root/.config/lagebild/update-signatur.pem (`node deploy/siegel.mjs schluessel`). Steckt in der APK und in jedem
// gesiegelten Stand; nie vom Server übernehmen. Neuer Schlüssel = neue APK nötig (README Betrieb).
export const UPDATE_SCHLUESSEL: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'knS7f49cXdsR2ucd2ZhmnooXBwsg5Xq2h1FPGLVYcV4',
  y: 'D3-7mzTwWItaVF_J5h_QhNCTPkj6JfcmvKhazEh5ROY',
};
