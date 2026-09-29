package app.miagenda.teocratica;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** Widget de la pantalla de inicio: lo de hoy y el botón «Registrar». */
public class AgendaWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(ctx, mgr, id);
    }

    static PendingIntent open(Context ctx, String action, int code) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(Uri.parse("app.miagenda.teocratica://" + action));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void draw(Context ctx, AppWidgetManager mgr, int id) {
        SharedPreferences p = ctx.getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String lines = p.getString("lines", "");
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_agenda);
        v.setTextViewText(R.id.w_title, p.getString("title", "Hoy"));
        v.setTextViewText(R.id.w_lines, lines.isEmpty() ? "Abre la app para ver lo de hoy." : lines);
        v.setTextViewText(R.id.w_footer, p.getString("footer", ""));
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, "hoy", 10));
        v.setOnClickPendingIntent(R.id.w_log, open(ctx, "registrar", 11));
        // Rutinas de hoy: «✓ Texto diario» la marca como hecha (abre la app un momento y vuelve)
        int[] slots = { R.id.w_r1, R.id.w_r2 };
        int shown = 0;
        try {
            JSONArray rs = new JSONArray(p.getString("routines", "[]"));
            String day = p.getString("day", "");
            for (int i = 0; i < slots.length; i++) {
                JSONObject r = i < rs.length() ? rs.optJSONObject(i) : null;
                if (r == null) { v.setViewVisibility(slots[i], View.GONE); continue; }
                boolean done = r.optBoolean("d", false);
                v.setViewVisibility(slots[i], View.VISIBLE);
                v.setTextViewText(slots[i], (done ? "✔ " : "✓ ") + r.optString("t", "Rutina"));
                v.setTextColor(slots[i], done ? 0xFF6B8A87 : 0xFF1D5F5A);
                v.setOnClickPendingIntent(slots[i], done ? open(ctx, "hoy", 30 + i)
                    : open(ctx, "hecho?eid=" + Uri.encode(r.optString("e", "")) + "&dia=" + Uri.encode(day), 20 + i));
                shown++;
            }
        } catch (Exception e) {
            for (int s2 : slots) v.setViewVisibility(s2, View.GONE);
        }
        v.setViewVisibility(R.id.w_rt, shown > 0 ? View.VISIBLE : View.GONE);
        mgr.updateAppWidget(id, v);
    }
}
