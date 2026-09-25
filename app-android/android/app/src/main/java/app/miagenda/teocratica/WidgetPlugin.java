package app.miagenda.teocratica;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** La web le pasa al widget lo que tiene hoy (título y líneas) y el widget se redibuja. */
@CapacitorPlugin(name = "AgendaWidget")
public class WidgetPlugin extends Plugin {
    static final String PREFS = "agenda_widget";

    /** ¿Esta app trae la configuración de avisos de Firebase (google-services.json)? */
    @PluginMethod
    public void info(PluginCall call) {
        Context ctx = getContext();
        int res = ctx.getResources().getIdentifier("google_app_id", "string", ctx.getPackageName());
        JSObject ret = new JSObject();
        ret.put("fcm", res != 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor ed = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putString("title", call.getString("title", "Hoy"));
        ed.putString("lines", call.getString("lines", ""));
        ed.putString("footer", call.getString("footer", ""));
        ed.apply();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, AgendaWidget.class));
        for (int id : ids) AgendaWidget.draw(ctx, mgr, id);
        JSObject ret = new JSObject();
        ret.put("widgets", ids.length);
        call.resolve(ret);
    }
}
