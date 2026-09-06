package com.miaad.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.google.firebase.Timestamp;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.SetOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class MiaadBridge {
    private static final String PREFS = "miaad_native_v1";
    private static final String SNAPSHOT = "snapshot";
    private static final String REMINDER_CODES = "reminder_codes";

    private final MainActivity activity;
    private final WebView webView;
    private final SharedPreferences prefs;
    private final FirebaseFirestore firestore;
    private volatile String uid;
    private volatile boolean pageReady = false;

    MiaadBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.firestore = FirebaseFirestore.getInstance();
    }

    void setUid(String uid) {
        this.uid = uid;
        pushNativeStatus(uid == null ? "local-only" : "cloud-ready");
    }

    void setPageReady(boolean ready) {
        pageReady = ready;
        if (ready) pushNativeStatus(uid == null ? "local-only" : "cloud-ready");
    }

    @JavascriptInterface
    public String loadSnapshot() {
        return prefs.getString(SNAPSHOT, "");
    }

    @JavascriptInterface
    public void saveSnapshot(String json) {
        if (json == null || json.isEmpty()) return;
        prefs.edit().putString(SNAPSHOT, json).apply();

        String currentUid = uid;
        if (currentUid == null) return;

        long updatedAt = System.currentTimeMillis();
        try {
            JSONObject obj = new JSONObject(json);
            updatedAt = obj.optLong("updatedAt", updatedAt);
        } catch (Exception ignored) { }

        Map<String, Object> data = new HashMap<>();
        data.put("payload", json);
        data.put("updatedAt", updatedAt);
        data.put("serverUpdatedAt", Timestamp.now());
        data.put("platform", "android");

        firestore.collection("users")
                .document(currentUid)
                .collection("state")
                .document("main")
                .set(data, SetOptions.merge())
                .addOnFailureListener(e -> pushNativeStatus("cloud-pending"));
    }

    void pullCloudToWeb() {
        String currentUid = uid;
        if (!pageReady || currentUid == null) return;

        firestore.collection("users")
                .document(currentUid)
                .collection("state")
                .document("main")
                .get()
                .addOnSuccessListener(this::deliverCloudDocument)
                .addOnFailureListener(e -> pushNativeStatus("cloud-pending"));
    }

    private void deliverCloudDocument(DocumentSnapshot doc) {
        if (!doc.exists()) {
            String local = prefs.getString(SNAPSHOT, "");
            if (local != null && !local.isEmpty()) saveSnapshot(local);
            pushNativeStatus("cloud-ready");
            return;
        }
        String payload = doc.getString("payload");
        if (payload == null || payload.isEmpty()) return;
        activity.runOnUiThread(() -> webView.evaluateJavascript(
                "window.__miaadReceiveCloud && window.__miaadReceiveCloud(" + JSONObject.quote(payload) + ");",
                null));
        pushNativeStatus("synced");
    }

    void pushNativeStatus(String status) {
        if (!pageReady) return;
        activity.runOnUiThread(() -> webView.evaluateJavascript(
                "window.__miaadNativeStatus && window.__miaadNativeStatus(" + JSONObject.quote(status) + ");",
                null));
    }

    @JavascriptInterface
    public boolean notificationsEnabled() {
        return activity.notificationsEnabled();
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        activity.runOnUiThread(activity::requestNotificationPermissionIfNeeded);
    }

    @JavascriptInterface
    public void openNotificationSettings() {
        activity.runOnUiThread(activity::openAppNotificationSettings);
    }

    @JavascriptInterface
    public void syncReminders(String json) {
        try {
            JSONArray arr = new JSONArray(json == null ? "[]" : json);
            AlarmManager alarmManager = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);

            Set<String> previous = new HashSet<>(prefs.getStringSet(REMINDER_CODES, new HashSet<>()));
            for (String codeString : previous) {
                try {
                    int code = Integer.parseInt(codeString);
                    PendingIntent pi = reminderPendingIntent(code, "", "", 0L);
                    alarmManager.cancel(pi);
                    pi.cancel();
                } catch (Exception ignored) { }
            }

            Set<String> nextCodes = new HashSet<>();
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.getJSONObject(i);
                String id = item.optString("id", "reminder-" + i);
                String title = item.optString("title", "موعد درس");
                String body = item.optString("body", "لديك درس قريب");
                long at = item.optLong("at", 0L);
                if (at <= now + 15_000L) continue;

                int code = id.hashCode() & 0x7fffffff;
                PendingIntent pi = reminderPendingIntent(code, title, body, at);
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                nextCodes.add(String.valueOf(code));
            }
            prefs.edit().putStringSet(REMINDER_CODES, nextCodes).apply();
        } catch (Exception e) {
            pushNativeStatus("reminder-error");
        }
    }

    private PendingIntent reminderPendingIntent(int code, String title, String body, long at) {
        Intent intent = new Intent(activity, ReminderReceiver.class)
                .putExtra("title", title)
                .putExtra("body", body)
                .putExtra("notification_id", code)
                .putExtra("at", at);
        return PendingIntent.getBroadcast(
                activity,
                code,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @JavascriptInterface
    public void saveTextFile(String name, String mime, String content) {
        if (name == null || name.isEmpty()) name = "miaad-export.txt";
        if (mime == null || mime.isEmpty()) mime = "text/plain";
        if (content == null) content = "";

        final String safeName = name.replaceAll("[\\\\/:*?\"<>|]", "-");
        final String finalMime = mime;
        final String finalContent = content;

        new Thread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver resolver = activity.getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, finalMime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Miaad");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IllegalStateException("Unable to create download");
                    try (OutputStream out = resolver.openOutputStream(uri)) {
                        if (out == null) throw new IllegalStateException("Unable to open download");
                        out.write(finalContent.getBytes(StandardCharsets.UTF_8));
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    resolver.update(uri, values, null, null);
                } else {
                    File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new IllegalStateException("Downloads unavailable");
                    if (!dir.exists()) dir.mkdirs();
                    try (FileOutputStream out = new FileOutputStream(new File(dir, safeName))) {
                        out.write(finalContent.getBytes(StandardCharsets.UTF_8));
                    }
                }
                toast("تم حفظ الملف في التنزيلات / Miaad");
            } catch (Exception e) {
                toast("تعذر حفظ الملف");
            }
        }).start();
    }

    @JavascriptInterface
    public void haptic() {
        activity.runOnUiThread(() -> webView.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP));
    }

    private void toast(String message) {
        activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }
}
