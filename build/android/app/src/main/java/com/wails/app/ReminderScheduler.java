package com.wails.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Schedules payment reminders with AlarmManager.
 *
 * <p>The frontend precomputes every fire time (plan name, body, epoch ms) and
 * sends the list here. We keep that list in SharedPreferences so a reboot can
 * re-arm it, and cancel the previous batch first so an edit or delete never
 * leaves a stale alarm behind. Alarms use setAndAllowWhileIdle: exact enough
 * for a reminder and it needs no SCHEDULE_EXACT_ALARM permission.
 *
 * <p>This class is also used by ReminderBootReceiver, which runs without the
 * activity.
 */
final class ReminderScheduler {
    private static final String TAG = "ReminderScheduler";
    static final String PREFS = "tripwire_reminders";
    static final String KEY_ITEMS = "items";

    private ReminderScheduler() {
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Replace the schedule with this JSON payload: {"items":[...]}. */
    static void schedule(Context context, String json) {
        try {
            JSONObject payload = new JSONObject(json);
            JSONArray items = payload.optJSONArray("items");
            if (items == null) items = new JSONArray();

            cancelAll(context);
            prefs(context).edit().putString(KEY_ITEMS, items.toString()).apply();

            AlarmManager alarms =
                    (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms == null) return;

            long now = System.currentTimeMillis();
            int scheduled = 0;
            int limit = Math.min(items.length(), 100);
            for (int i = 0; i < limit; i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                String id = item.optString("id", "");
                long at = item.optLong("at", 0);
                // Ignore dates that slipped past while the list was built.
                if (id.isEmpty() || at <= now + 30_000) continue;

                PendingIntent intent = pendingIntent(context, item, id);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
                } else {
                    alarms.set(AlarmManager.RTC_WAKEUP, at, intent);
                }
                scheduled++;
            }
            Log.i(TAG, "scheduled " + scheduled + " reminders");
        } catch (Exception e) {
            Log.e(TAG, "could not schedule reminders", e);
        }
    }

    /** Re-arm the stored list, e.g. after a reboot. Alarms do not survive. */
    static void reschedule(Context context) {
        String raw = prefs(context).getString(KEY_ITEMS, "");
        if (raw == null || raw.isEmpty()) return;
        schedule(context, "{\"items\":" + raw + "}");
    }

    /** Drop one item after its notification was posted. */
    static void remove(Context context, String id) {
        try {
            String raw = prefs(context).getString(KEY_ITEMS, "");
            if (raw == null || raw.isEmpty()) return;
            JSONArray items = new JSONArray(raw);
            JSONArray kept = new JSONArray();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null && !id.equals(item.optString("id", ""))) {
                    kept.put(item);
                }
            }
            prefs(context).edit().putString(KEY_ITEMS, kept.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "could not remove reminder " + id, e);
        }
    }

    private static void cancelAll(Context context) {
        try {
            String raw = prefs(context).getString(KEY_ITEMS, "");
            if (raw == null || raw.isEmpty()) return;
            JSONArray items = new JSONArray(raw);
            AlarmManager alarms =
                    (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms == null) return;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                String id = item.optString("id", "");
                if (id.isEmpty()) continue;
                alarms.cancel(pendingIntent(context, item, id));
            }
        } catch (Exception e) {
            Log.e(TAG, "could not cancel old reminders", e);
        }
    }

    private static PendingIntent pendingIntent(
            Context context, JSONObject item, String id) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        // Unique data per item: the request code can stay 0 and two plans
        // firing at the same minute never share a PendingIntent.
        intent.setData(Uri.parse("tripwire://reminder/" + Uri.encode(id)));
        intent.putExtra("id", id);
        intent.putExtra("planId", item.optString("planId", ""));
        intent.putExtra("title", item.optString("title", "Payment reminder"));
        intent.putExtra("body", item.optString("body", ""));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }
}
