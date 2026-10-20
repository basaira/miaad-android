package com.miaad.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class RestoreRemindersReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        try {
            android.content.SharedPreferences prefs =
                    context.getSharedPreferences("miaad_native_v1", Context.MODE_PRIVATE);
            String owner=prefs.getString("reminder_owner","");
            com.google.firebase.auth.FirebaseUser active =
                    com.google.firebase.auth.FirebaseAuth.getInstance().getCurrentUser();
            if(owner.isEmpty()||active==null||!owner.equals(active.getUid()))return;
            String plan=prefs.getString("reminder_plan","[]");
            ReminderScheduler.sync(context,plan,owner);
        } catch (Exception e) {
            android.util.Log.w("MiaadReminders", "Unable to restore reminder plan", e);
        }
    }
}
