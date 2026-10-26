package com.wails.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * AlarmManager alarms are cleared by a reboot and by an app update. Re-arm
 * the stored schedule when either happens.
 */
public class ReminderBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        ReminderScheduler.reschedule(context);
    }
}
