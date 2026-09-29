package app.miagenda.teocratica;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
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
import android.os.PowerManager;
import android.app.usage.UsageStatsManager;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.ArrayList;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
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
        ed.putString("routines", call.getString("routines", "[]"));
        ed.putString("day", call.getString("day", ""));
        ed.apply();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, AgendaWidget.class));
        for (int id : ids) AgendaWidget.draw(ctx, mgr, id);
        JSObject ret = new JSObject();
        ret.put("widgets", ids.length);
        call.resolve(ret);
    }

    /**
     * Batería: ¿Android deja trabajar a la app en reposo? (si la «optimiza», los avisos pueden atrasarse o no llegar).
     * bucket: qué tan «usada» la considera Android (10 activa … 40 poco usada, 45 restringida).
     */
    @PluginMethod
    public void battery(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        ret.put("ignoring", pm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M || pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        ret.put("saver", pm != null && pm.isPowerSaveMode());
        int bucket = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            UsageStatsManager us = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
            if (us != null) bucket = us.getAppStandbyBucket();
        }
        ret.put("bucket", bucket);
        call.resolve(ret);
    }

    /** Abre la pantalla del teléfono para arreglar los avisos: battery | notifications | channel | app */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        String what = call.getString("what", "app");
        String pkg = ctx.getPackageName();
        Intent i;
        if ("battery".equals(what) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
        } else if ("channel".equals(what) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
            i.putExtra(Settings.EXTRA_CHANNEL_ID, call.getString("channel", ""));
        } else if (("notifications".equals(what) || "channel".equals(what)) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
        } catch (Exception e) {
            // Algunos teléfonos no tienen esa pantalla: se abre la de la app
            try {
                Intent d = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                d.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(d);
            } catch (Exception e2) { call.reject("no-disponible"); return; }
        }
        call.resolve();
    }

    /** Dictado por voz: abre el reconocedor de voz del teléfono y devuelve lo que se dijo (en español). */
    @PluginMethod
    public void dictate(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "es-VE"));
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Habla ahora"));
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, i, "dictateResult");
        } catch (ActivityNotFoundException e) {
            call.reject("no-disponible");
        }
    }

    @ActivityCallback
    private void dictateResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        String text = "";
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> m = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (m != null && !m.isEmpty()) text = m.get(0);
        }
        ret.put("text", text);
        call.resolve(ret);
    }
}
