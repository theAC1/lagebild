package ch.arvuna.lagebild;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

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
  }
}
