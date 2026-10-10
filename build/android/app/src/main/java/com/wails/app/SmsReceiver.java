package com.wails.app;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Incoming M-Pesa catcher. Always on: every SMS_RECEIVED broadcast is
 * checked for an M-Pesa sender, and matches are appended to a small pending
 * queue the WebView drains (launch, resume, foreground interval) and merges
 * through the regular import pipeline. Nothing is parsed here, nothing is
 * notified — the queue is the whole job, so arrivals merge append-only and
 * the inbox is never re-read wholesale once listening is possible.
 */
public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "WailsSmsReceiver";
    static final String PREFS = "pending_sms";
    static final String KEY_QUEUE = "queue";
    static final int MAX_QUEUED = 50;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                JSONObject caught = catchMpesa(intent);
                if (caught != null) {
                    enqueue(context, caught);
                }
            } catch (Exception e) {
                Log.e(TAG, "catch failed", e);
            } finally {
                pending.finish();
            }
        }, "wails-sms-receiver").start();
    }

    /**
     * Returns the caught message ({id, address, dateMs, body}) when any part
     * carries an M-Pesa sender, else null. Bodies are carried, never read.
     */
    private JSONObject catchMpesa(Intent intent) {
        try {
            SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (parts == null || parts.length == 0) {
                return null;
            }
            String address = "";
            long dateMs = 0;
            StringBuilder body = new StringBuilder();
            for (SmsMessage part : parts) {
                String from = part.getDisplayOriginatingAddress();
                if (from != null && from.toUpperCase().contains("MPESA")) {
                    address = from;
                    if (dateMs == 0) {
                        dateMs = part.getTimestampMillis();
                    }
                    if (part.getDisplayMessageBody() != null) {
                        body.append(part.getDisplayMessageBody());
                    }
                }
            }
            if (address.isEmpty() || body.length() == 0) {
                return null;
            }
            if (dateMs == 0) {
                dateMs = System.currentTimeMillis();
            }
            return new JSONObject()
                    .put("id", address + "_" + dateMs)
                    .put("address", address)
                    .put("dateMs", dateMs)
                    .put("body", body.toString());
        } catch (Exception e) {
            Log.e(TAG, "sender check failed", e);
            return null;
        }
    }

    private void enqueue(Context context, JSONObject message) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue;
            try {
                queue = new JSONArray(prefs.getString(KEY_QUEUE, "[]"));
            } catch (Exception e) {
                queue = new JSONArray();
            }
            queue.put(message);
            while (queue.length() > MAX_QUEUED) {
                queue.remove(0);
            }
            prefs.edit().putString(KEY_QUEUE, queue.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "enqueue failed", e);
        }
    }

    static void setEnabled(Context context, boolean enabled) {
        ComponentName receiver = new ComponentName(context, SmsReceiver.class);
        context.getPackageManager().setComponentEnabledSetting(receiver,
                enabled
                        ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                        : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP);
    }

    /** Read and clear the pending queue. Called from the WebView thread. */
    static String drain(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_QUEUE, "[]");
        if (raw != null && !raw.equals("[]")) {
            prefs.edit().remove(KEY_QUEUE).apply();
        }
        return raw != null ? raw : "[]";
    }
}
