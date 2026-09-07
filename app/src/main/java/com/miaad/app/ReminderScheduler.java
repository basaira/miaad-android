package com.miaad.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Persists the existing reminder plan and restores it after a reboot/update. */
final class ReminderScheduler {
    static void sync(Context context, String json) throws Exception {
        SharedPreferences prefs = context.getSharedPreferences("miaad_native_v1", Context.MODE_PRIVATE);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (String code : prefs.getStringSet("reminder_codes", new HashSet<>())) {
            PendingIntent pi = pending(context, Integer.parseInt(code), new JSONObject());
            alarms.cancel(pi);
            pi.cancel();
        }
        JSONArray plan = new JSONArray(json);
        Set<String> codes = new HashSet<>();
        Set<String> delivered = prefs.getStringSet("delivered_reminders", new HashSet<>());
        for (int i = 0; i < plan.length(); i++) {
            JSONObject item = plan.getJSONObject(i);
            String id = item.getString("id");
            if (delivered.contains(id)) continue;
            long at = item.optLong("at");
            if (at <= System.currentTimeMillis()) continue;
            int code = id.hashCode() & 0x7fffffff;
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, code, item));
            codes.add(String.valueOf(code));
        }
        prefs.edit().putString("reminder_plan", json).putStringSet("reminder_codes", codes).apply();
    }
    private static PendingIntent pending(Context context, int code, JSONObject item) {
        Intent intent = new Intent(context, ReminderReceiver.class)
                .putExtra("title", item.optString("title"))
                .putExtra("body", item.optString("body"))
                .putExtra("entity", item.optString("entity"))
                .putExtra("dedup", item.optString("id"))
                .putExtra("notification_id", code);
        return PendingIntent.getBroadcast(context, code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
