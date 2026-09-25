package app.miagenda.teocratica;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Complemento propio: el widget de la pantalla de inicio
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
