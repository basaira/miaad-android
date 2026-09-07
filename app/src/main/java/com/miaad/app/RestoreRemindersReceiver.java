package com.miaad.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class RestoreRemindersReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            String plan = context.getSharedPreferences("miaad_native_v1", Context.MODE_PRIVATE)
                    .getString("reminder_plan", "[]");
            ReminderScheduler.sync(context, plan);
        } catch (Exception e) {
            android.util.Log.w("MiaadReminders", "Unable to restore reminder plan", e);
        }
    }
}
