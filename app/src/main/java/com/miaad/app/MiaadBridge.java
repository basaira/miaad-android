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
    // Server-side authority is represented by the EXACT remote main-document
    // fingerprint observed during a successful read; never by a JS Boolean.
    private final Object writeLock = new Object();
    private volatile String observedRemoteToken;
    private volatile String pendingRemotePayload;
    private volatile String pendingRemoteToken;
    private volatile boolean remoteMissingVerified;
    private volatile boolean writeInProgress;
    private volatile String remoteOwnerUid;

    MiaadBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.firestore = FirebaseFirestore.getInstance();
    }

    void setUid(String uid) {
        this.uid = uid;
        synchronized (writeLock) {
            observedRemoteToken = null; pendingRemotePayload = null;
            pendingRemoteToken = null; remoteMissingVerified = false;
            writeInProgress = false; remoteOwnerUid = null;
        }
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

    // Local persistence is NOT remote write authorization.
    // Invalid input never overwrites the previous recoverable Native copy.
    @JavascriptInterface
    public void saveSnapshot(String json) {
        if (!SnapshotAdmission.valid(json)) { pushNativeStatus("cloud-pending"); return; }
        String old = prefs.getString(SNAPSHOT, "");
        if (old != null && !old.isEmpty() && !old.equals(json) && !SnapshotAdmission.valid(old)) {
            String backup = "snapshot_recovery_" + remoteDigest(old);
            if (!prefs.contains(backup) && !prefs.edit().putString(backup, old).commit()) {
                pushNativeStatus("cloud-pending"); return;
            }
        }
        prefs.edit().putString(SNAPSHOT, json).apply();
    }

    private static String remoteToken(DocumentSnapshot doc) {
        if (!doc.exists()) return "absent";
        try {
            String state = doc.contains("generation")
                ? "chunks:" + doc.getString("generation") + ":" + doc.getLong("chunkCount")
                : "payload:" + doc.getString("payload");
            state += "|revision:" + doc.get("updatedAt");
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(state.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return hex.toString();
        } catch (Exception ex) { return ""; }
    }

    // Only an exact payload actually delivered by the Native Firestore read
    // may establish the optimistic concurrency baseline. JS cannot supply
    // an arbitrary remote version or mark a write successful.
    @JavascriptInterface
    public void confirmCloudSnapshot(String raw) {
        synchronized (writeLock) {
            if (uid == null || !uid.equals(remoteOwnerUid)
                    || pendingRemotePayload == null || !pendingRemotePayload.equals(raw)) return;
            observedRemoteToken = pendingRemoteToken;
            remoteMissingVerified = false;
            pendingRemotePayload = null; pendingRemoteToken = null;
        }
    }

    @JavascriptInterface
    public void requestVerifiedSync(String json) {
        final String owner = uid;
        if (owner == null || !SnapshotAdmission.valid(json)
                || !json.equals(prefs.getString(SNAPSHOT, ""))) {
            pushNativeStatus("cloud-pending"); return;
        }
        final String expected;
        synchronized (writeLock) {
            if (writeInProgress || !owner.equals(remoteOwnerUid)
                    || (!remoteMissingVerified && observedRemoteToken == null)) {
                pushNativeStatus("cloud-pending"); return;
            }
            expected = remoteMissingVerified ? "absent" : observedRemoteToken;
            writeInProgress = true;
        }
        final long revision;
        try { revision = new JSONObject(json).getLong("updatedAt"); }
        catch (Exception ex) {
            synchronized (writeLock) { writeInProgress = false; }
            pushNativeStatus("cloud-pending"); return;
        }
        final com.google.firebase.firestore.DocumentReference main = firestore.collection("users")
                .document(owner).collection("state").document("main");
        final String generation = java.util.UUID.randomUUID().toString();
        final int size = json.getBytes(StandardCharsets.UTF_8).length;
        final int parts = (json.length() + 119999) / 120000;
        if (parts > 450) {
            synchronized (writeLock) { writeInProgress = false; }
            pushNativeStatus("cloud-pending"); return;
        }
        firestore.runTransaction(tx -> {
            DocumentSnapshot current = tx.get(main);
            if (!expected.equals(remoteToken(current)))
                throw new com.google.firebase.firestore.FirebaseFirestoreException(
                        "Academic snapshot changed remotely; refusing overwrite",
                        com.google.firebase.firestore.FirebaseFirestoreException.Code.ABORTED);
            Map<String,Object> state = new HashMap<>();
            state.put("updatedAt", revision);
            state.put("serverUpdatedAt", Timestamp.now());
            if (size < 700000) {
                state.put("payload", json);
            } else {
                for (int i = 0; i < parts; i++) {
                    Map<String,Object> chunk = new HashMap<>();
                    chunk.put("payload", json.substring(i*120000, Math.min(json.length(),(i+1)*120000)));
                    chunk.put("createdAt", revision);
                    tx.set(main.collection("snapshots").document(generation+"-"+i), chunk);
                }
                state.put("generation", generation);
                state.put("chunkCount", parts);
                state.put("platform", "android");
            }
            tx.set(main, state);
            // This token describes exactly the published main document,
            // excluding the serverUpdatedAt presentation metadata.
            String signature = size < 700000 ? "payload:"+json : "chunks:"+generation+":"+parts;
            return remoteDigest(signature + "|revision:" + revision);
        }).addOnSuccessListener(token -> {
            synchronized (writeLock) {
                writeInProgress = false;
                if (owner.equals(uid)) {
                    observedRemoteToken = token;
                    remoteMissingVerified = false;
                }
            }
            if (owner.equals(uid)) pushNativeStatus("synced");
        }).addOnFailureListener(error -> {
            synchronized (writeLock) { writeInProgress = false; }
            if (owner.equals(uid)) pushNativeStatus("cloud-pending");
        });
    }

    private static String remoteDigest(String state) {
        try {
            byte[] bytes = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(state.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return out.toString();
        } catch (Exception ex) { return ""; }
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
            synchronized (writeLock) {
                remoteOwnerUid = uid; remoteMissingVerified = true;
                observedRemoteToken = null; pendingRemotePayload = null; pendingRemoteToken = null;
            }
            pushNativeStatus("cloud-ready");
            activity.runOnUiThread(() -> webView.evaluateJavascript(
                    "window.__miaadCloudAbsent && window.__miaadCloudAbsent();", null));
            return;
        }
        if (doc.contains("generation")) {
            String generation = doc.getString("generation");
            Long countValue = doc.getLong("chunkCount");
            int count = countValue == null ? 0 : countValue.intValue();
            if (count < 1 || count > 450) { pushNativeStatus("cloud-pending"); return; }
            java.util.List<com.google.android.gms.tasks.Task<DocumentSnapshot>> tasks = new java.util.ArrayList<>();
            for (int i = 0; i < count; i++) tasks.add(doc.getReference().collection("snapshots")
                    .document(generation + "-" + i).get());
            com.google.android.gms.tasks.Tasks.whenAllSuccess(tasks).addOnSuccessListener(results -> {
                StringBuilder payload = new StringBuilder();
                for (Object result : results) {
                    String part = ((DocumentSnapshot) result).getString("payload");
                    if (part == null) { pushNativeStatus("cloud-pending"); return; }
                    payload.append(part);
                }
                deliverPayload(payload.toString(), doc);
            }).addOnFailureListener(e -> pushNativeStatus("cloud-pending"));
        } else {
            deliverPayload(doc.getString("payload"), doc);
        }
    }

    private void deliverPayload(String payload, DocumentSnapshot doc) {
        if (payload == null || payload.isEmpty()) return;
        synchronized (writeLock) {
            remoteOwnerUid = uid;
            remoteMissingVerified = false;
            observedRemoteToken = null;
            pendingRemotePayload = payload;
            pendingRemoteToken = remoteToken(doc);
        }
        activity.runOnUiThread(() -> webView.evaluateJavascript(
                "window.__miaadReceiveCloud && window.__miaadReceiveCloud(" + JSONObject.quote(payload) + ");", null));
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
        try { ReminderScheduler.sync(activity, json == null ? "[]" : json); }
        catch (Exception e) { pushNativeStatus("reminder-error"); }
    }

    private WebView printView;
    @JavascriptInterface
    public void printReport(String html, String title) {
        activity.runOnUiThread(() -> {
            printView = new WebView(activity);
            printView.setWebViewClient(new android.webkit.WebViewClient() {
                @Override public void onPageFinished(WebView view, String url) {
                    android.print.PrintManager manager = (android.print.PrintManager)
                            activity.getSystemService(Context.PRINT_SERVICE);
                    manager.print(title, view.createPrintDocumentAdapter(title),
                            new android.print.PrintAttributes.Builder().build());
                }
            });
            printView.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
        });
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
