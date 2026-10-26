package com.wails.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Posts one scheduled payment reminder. The notification is built entirely
 * from the alarm extras, so no WebView or Go runtime needs to be alive.
 */
public class ReminderReceiver extends BroadcastReceiver {
    private static final String TAG = "ReminderReceiver";
    static final String CHANNEL_ID = "tripwire_reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("id");
        if (id == null || id.isEmpty()) return;

        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(
                "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            // Keep the item in the list: if the user grants permission later,
            // the next reschedule can still use it. Nothing to show now.
            Log.i(TAG, "notification permission missing; reminder " + id + " skipped");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Payment reminders", NotificationManager.IMPORTANCE_DEFAULT);
            nm.createNotificationChannel(channel);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("tripwire_plan_id", intent.getStringExtra("planId"));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent content = PendingIntent.getActivity(context, 0, open, flags);

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title != null ? title : "Payment reminder")
                .setContentText(body != null ? body : "")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
                .setContentIntent(content)
                .setAutoCancel(true)
                .build();

        nm.notify(id.hashCode() & 0x0fffffff, notification);
        ReminderScheduler.remove(context, id);
    }
}
