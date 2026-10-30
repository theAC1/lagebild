package ch.arvuna.lagebild;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Lang-Drücken soll nur die App-eigene Logik auslösen (Radial-Menü, Marker), nie das System-Menü
    // (Textauswahl, «Bild speichern», Link-Menü). Ergänzt user-select/contextmenu im Web-Code.
    WebView web = getBridge().getWebView();
    web.setLongClickable(false);
    web.setOnLongClickListener(v -> true);
    web.setHapticFeedbackEnabled(false);
    // Dateien aus der Oberfläche (z.B. Raster-PDF) teilen: der WebView kennt keine Downloads (features/raster/ausdruck.ts)
    web.addJavascriptInterface(new Datei(), "LagebildDatei");
  }

  /** window.LagebildDatei.teile(base64, name, typ): legt die Datei in den Cache und öffnet den Teilen-Dialog. */
  class Datei {
    @JavascriptInterface
    public void teile(String base64, String name, String typ) {
      try {
        File ordner = new File(getCacheDir(), "teilen");
        ordner.mkdirs();
        File datei = new File(ordner, name.replaceAll("[^A-Za-z0-9._-]", "_"));
        try (FileOutputStream aus = new FileOutputStream(datei)) {
          aus.write(Base64.decode(base64, Base64.DEFAULT));
        }
        Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", datei);
        Intent senden = new Intent(Intent.ACTION_SEND).setType(typ).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(senden, datei.getName()));
      } catch (Exception e) {
        Log.e("Lagebild", "Datei teilen fehlgeschlagen", e);
      }
    }
  }
}
