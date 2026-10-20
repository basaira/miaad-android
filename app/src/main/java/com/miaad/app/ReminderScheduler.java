package com.miaad.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Never schedule student-identifying alarms without a verified owner. */
final class ReminderScheduler {
    private static final String PREFS="miaad_native_v1";
    private static final String REMINDER_OWNER="reminder_owner";
    static String ownerKey(String owner) {
        try {
            byte[] data=java.security.MessageDigest.getInstance("SHA-256")
                .digest(owner.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex=new StringBuilder();
            for(byte b:data)hex.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
            return hex.toString();
        }catch(Exception e){throw new IllegalStateException("SHA-256 unavailable",e);}
    }

    static void clearForAccountChange(Context context) {
        SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        AlarmManager alarm=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        for(String code:prefs.getStringSet("reminder_codes",new HashSet<>())) {
            try {
                PendingIntent intent=pending(context,Integer.parseInt(code),new JSONObject(),"");
                alarm.cancel(intent);intent.cancel();
            }catch(Exception ignored){}
        }
        NotificationManager notification=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(notification!=null)notification.cancelAll();
        // Preserve the exact existing plan, including historical unowned plans,
        // rather than erasing recoverable notification context.
        final String previous=prefs.getString("reminder_plan",null);
        final String owner=prefs.getString(REMINDER_OWNER,"");
        final String backupKey="reminder_plan_preserved_"+ownerKey(owner)+
                "_"+(previous==null?"absent":ownerKey(previous));
        SharedPreferences.Editor edit=prefs.edit();
        if(previous!=null&&!prefs.contains(backupKey))edit.putString(backupKey,previous);
        edit.remove("reminder_plan").remove(REMINDER_OWNER)
             .putStringSet("reminder_codes",new HashSet<>()).commit();
    }

    static void sync(Context context,String json) throws Exception {
        // Old unowned scheduling API must not create ownerless notifications.
        throw new SecurityException("Owner-bound reminder session required");
    }

    static void sync(Context context,String json,String owner) throws Exception {
        if(owner==null||owner.isEmpty())throw new SecurityException("Missing reminder owner");
        SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        String previousOwner=prefs.getString(REMINDER_OWNER,"");
        if(!previousOwner.isEmpty()&&!owner.equals(previousOwner))clearForAccountChange(context);
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        for(String code:prefs.getStringSet("reminder_codes",new HashSet<>())) {
            PendingIntent intent=pending(context,Integer.parseInt(code),new JSONObject(),owner);
            alarms.cancel(intent);intent.cancel();
        }
        JSONArray plan=new JSONArray(json);
        Set<String> codes=new HashSet<>();
        final String deliveredKey="delivered_reminders_owner_"+ownerKey(owner);
        Set<String> delivered=prefs.getStringSet(deliveredKey,new HashSet<>());
        for(int i=0;i<plan.length();i++){
            JSONObject item=plan.getJSONObject(i);
            String id=item.getString("id");
            if(delivered.contains(id))continue;
            long at=item.optLong("at");
            if(at<=System.currentTimeMillis())continue;
            int code=id.hashCode()&0x7fffffff;
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending(context,code,item,owner));
            codes.add(String.valueOf(code));
        }
        if(!prefs.edit().putString(REMINDER_OWNER,owner).putString("reminder_plan",json)
                .putStringSet("reminder_codes",codes).commit())
            throw new IllegalStateException("Unable to persist owner-bound reminder plan");
    }

    private static PendingIntent pending(Context context,int code,JSONObject item,String owner) {
        Intent intent=new Intent(context,ReminderReceiver.class)
                .putExtra("owner_uid",owner)
                .putExtra("title",item.optString("title"))
                .putExtra("body",item.optString("body"))
                .putExtra("entity",item.optString("entity"))
                .putExtra("dedup",item.optString("id"))
                .putExtra("notification_id",code);
        return PendingIntent.getBroadcast(context,code,intent,
                PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
}