package app.miagenda.teocratica;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

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
        mgr.updateAppWidget(id, v);
    }
}
