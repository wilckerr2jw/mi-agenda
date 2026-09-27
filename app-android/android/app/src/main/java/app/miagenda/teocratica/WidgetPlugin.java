package app.miagenda.teocratica;

import android.app.DownloadManager;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
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

    /**
     * Descarga el APK nuevo con el administrador de descargas de Android (se ve el avance en la barra de avisos)
     * y, al terminar, abre el instalador. Si falta el permiso «Instalar apps de este origen», abre esa pantalla.
     */
    @PluginMethod
    public void installApk(PluginCall call) {
        final Context ctx = getContext();
        String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("Falta el enlace"); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(s);
            JSObject ret = new JSObject(); ret.put("status", "permiso"); call.resolve(ret);
            return;
        }
        File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        final File file = new File(dir, "agenda-teocratica.apk");
        if (file.exists()) file.delete();
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
            .setTitle("Agenda Teocrática")
            .setDescription("Descargando la actualización")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationUri(Uri.fromFile(file));
        final long id = dm.enqueue(req);
        BroadcastReceiver done = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                try { c.unregisterReceiver(this); } catch (Exception ignored) { }
                if (!file.exists() || file.length() == 0) return;
                Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", file);
                Intent inst = new Intent(Intent.ACTION_VIEW);
                inst.setDataAndType(uri, "application/vnd.android.package-archive");
                inst.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(inst);
            }
        };
        IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(done, f, Context.RECEIVER_EXPORTED);
        else ctx.registerReceiver(done, f);
        JSObject ret = new JSObject(); ret.put("status", "descargando"); call.resolve(ret);
    }

    /** Abre un enlace en el navegador del teléfono (no dentro de la app). */
    @PluginMethod
    public void openExternal(PluginCall call) {
        Intent v = new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url", "")));
        v.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(v);
        call.resolve();
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
