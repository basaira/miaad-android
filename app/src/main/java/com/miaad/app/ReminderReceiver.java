package com.miaad.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

public class ReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "miaad_lessons";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "تذكيرات الدروس",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("تنبيهات مِيعاد قبل بدء الدروس");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        int id = intent.getIntExtra("notification_id", 1001);

        Intent open = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("entity", intent.getStringExtra("entity"));
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                id,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);

        Notification notification = builder
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title == null || title.isEmpty() ? "مِيعاد" : title)
                .setContentText(body == null || body.isEmpty() ? "لديك درس قريب" : body)
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build();

        manager.notify(id, notification);
        android.content.SharedPreferences prefs = context.getSharedPreferences("miaad_native_v1", Context.MODE_PRIVATE);
        java.util.Set<String> delivered = new java.util.HashSet<>(prefs.getStringSet("delivered_reminders", new java.util.HashSet<>()));
        String dedup = intent.getStringExtra("dedup");
        if (dedup != null) { delivered.add(dedup); prefs.edit().putStringSet("delivered_reminders", delivered).apply(); }
    }
}
