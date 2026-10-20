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
    private volatile long accountEpoch;
    private volatile String webSessionToken="";

    MiaadBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.firestore = FirebaseFirestore.getInstance();
    }

    void setUid(String uid) {
        synchronized (writeLock) {
            if (java.util.Objects.equals(this.uid, uid) && !webSessionToken.isEmpty()) return;
            this.uid = uid;
            accountEpoch++;
            webSessionToken = uid == null ? "" : java.util.UUID.randomUUID().toString();
            observedRemoteToken = null; pendingRemotePayload = null;
            pendingRemoteToken = null; remoteMissingVerified = false;
            writeInProgress = false; remoteOwnerUid = null;
            pageReady = false;
        }
        ReminderScheduler.clearForAccountChange(activity);
    }

    private static String uidHash(String text) {
        return remoteDigest("owned-v1:" + text);
    }
    private String scopedKey(String owner) { return "snapshot_owner_" + uidHash(owner); }
    private boolean validSession(String session) {
        return uid != null && session != null && !session.isEmpty()
            && session.equals(webSessionToken);
    }
    private boolean activeIdentity(String owner, long epoch) {
        synchronized (writeLock) {
            if (!java.util.Objects.equals(uid, owner) || accountEpoch != epoch) return false;
        }
        // No production write authorization may be derived from JS session data.
        if (!activity.isIsolatedFirebaseTestMode() ||
             activity.requiresIsolatedAuthVerification()) {
            com.google.firebase.auth.FirebaseUser user =
                com.google.firebase.auth.FirebaseAuth.getInstance().getCurrentUser();
            return user != null && owner.equals(user.getUid());
        }
        return true;
    }
    @JavascriptInterface
    public String sessionToken() { return webSessionToken; }
    @JavascriptInterface
    public String storageScope(String session) {
        if (!validSession(session)) return "";
        return "miaadUidV1_" + uidHash(uid) + "_";
    }
    @JavascriptInterface
    public boolean hasUnownedSnapshot() {
        final String legacy = prefs.getString(SNAPSHOT, "");
        return legacy != null && !legacy.isEmpty();
    }
    @JavascriptInterface
    public String loadSnapshotOwned(String session) {
        if (!validSession(session)) return "";
        return prefs.getString(scopedKey(uid), "");
    }

    void setPageReady(boolean ready) {
        pageReady = ready;
        if (ready) pushNativeStatus(uid == null ? "local-only" : "cloud-ready");
    }

    @JavascriptInterface
    public String loadSnapshot() {
        // Historical unowned bytes are preserved, never exposed as a signed-in
        // owner's verified snapshot.
        return uid == null ? prefs.getString(SNAPSHOT, "") : "";
    }

    // Local persistence is NOT remote write authorization.
    // Invalid input never overwrites the previous recoverable Native copy.
    @JavascriptInterface
    public void saveSnapshot(String json) {
        // Legacy API can never bind unknown historical data to a Firebase UID.
        if (uid != null) { pushNativeStatus("cloud-pending"); return; }
        if (!SnapshotAdmission.valid(json)) return;
        prefs.edit().putString(SNAPSHOT, json).commit();
    }

    @JavascriptInterface
    public boolean saveSnapshotOwned(String json, String session) {
        if (!validSession(session) || !SnapshotAdmission.valid(json)) {
            pushNativeStatus("cloud-pending"); return false;
        }
        final String owner = uid;
        final long epoch = accountEpoch;
        if (!activeIdentity(owner, epoch)) return false;
        // Per-UID durable storage. Never overwrite unowned/foreign snapshots.
        // Native serialization order and web session are checked again under
        // the same lock before the write.
        synchronized (writeLock) {
            if (!activeIdentity(owner, epoch) || !validSession(session)) return false;
            final String key = scopedKey(owner);
            final String old = prefs.getString(key, "");
            if (old != null && !old.isEmpty() && !old.equals(json) &&
                !SnapshotAdmission.valid(old)) {
                final String backup="snapshot_recovery_"+uidHash(owner)+"_"+remoteDigest(old);
                if (!prefs.contains(backup) &&
                    !prefs.edit().putString(backup, old).commit()) return false;
            }
            return prefs.edit().putString(key, json).commit();
        }
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
        // Obsolete unscoped bridge entry point cannot authorize Cloud writes.
        pushNativeStatus("cloud-pending");
    }
    @JavascriptInterface
    public void confirmCloudSnapshotOwned(String raw, String session) {
        synchronized (writeLock) {
            if (!validSession(session)||uid==null||!uid.equals(remoteOwnerUid)
                    ||pendingRemotePayload==null||!pendingRemotePayload.equals(raw)) return;
            observedRemoteToken = pendingRemoteToken;
            remoteMissingVerified = false;
            pendingRemotePayload=null;pendingRemoteToken=null;
        }
    }

    @JavascriptInterface
    public void requestVerifiedSync(String json) {
        // Stale/unowned JS must not be able to upload under a new UID.
        pushNativeStatus("cloud-pending");
    }
    @JavascriptInterface
    public void requestVerifiedSyncOwned(String json, String session) {
        final String owner = uid;
        final long epoch = accountEpoch;
        if (owner == null || !validSession(session) || !activeIdentity(owner, epoch)
                || !SnapshotAdmission.valid(json)
                || !json.equals(prefs.getString(scopedKey(owner), ""))) {
            pushNativeStatus("cloud-pending"); return;
        }
        final String expected;
        synchronized (writeLock) {
            if (!activeIdentity(owner,epoch)||!validSession(session)||writeInProgress
                    ||!owner.equals(remoteOwnerUid)
                    ||(!remoteMissingVerified && observedRemoteToken==null)) {
                pushNativeStatus("cloud-pending"); return;
            }
            expected=remoteMissingVerified?"absent":observedRemoteToken;
            writeInProgress=true;
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
            if (!activeIdentity(owner,epoch)) throw new IllegalStateException("Firebase account changed before transaction");
            DocumentSnapshot current = tx.get(main);
            if (!activeIdentity(owner,epoch)) throw new IllegalStateException("Firebase account changed during transaction");
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
            if (!activeIdentity(owner,epoch)) throw new IllegalStateException("Firebase account changed before transaction write");
            tx.set(main, state);
            // This token describes exactly the published main document,
            // excluding the serverUpdatedAt presentation metadata.
            String signature = size < 700000 ? "payload:"+json : "chunks:"+generation+":"+parts;
            return remoteDigest(signature + "|revision:" + revision);
        }).addOnSuccessListener(token -> {
            synchronized (writeLock) {
                writeInProgress = false;
                if (activeIdentity(owner,epoch)) {
                    observedRemoteToken = token;
                    remoteMissingVerified = false;
                }
            }
            if (activeIdentity(owner,epoch)) pushNativeStatus("synced");
        }).addOnFailureListener(error -> {
            synchronized (writeLock) { writeInProgress = false; }
            if (activeIdentity(owner,epoch)) pushNativeStatus("cloud-pending");
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
        final String owner = uid;
        final long epoch=accountEpoch;
        if (!pageReady || owner == null || !activeIdentity(owner,epoch)) return;
        firestore.collection("users").document(owner).collection("state").document("main").get()
                .addOnSuccessListener(doc -> {
                    if (activeIdentity(owner,epoch)&&pageReady)
                        deliverCloudDocument(doc,owner,epoch);
                })
                .addOnFailureListener(e -> {
                    if (activeIdentity(owner,epoch))pushNativeStatus("cloud-pending");
                });
    }

    // Compatibility wrapper used only by controlled Java instrumentation.
    private void deliverCloudDocument(DocumentSnapshot doc) {
        final String owner=uid;
        final long epoch=accountEpoch;
        deliverCloudDocument(doc,owner,epoch);
    }

    private void deliverCloudDocument(DocumentSnapshot doc,String owner,long epoch) {
        if (!activeIdentity(owner,epoch))return;
        if (!doc.exists()) {
            synchronized (writeLock) {
                if (!activeIdentity(owner,epoch))return;
                remoteOwnerUid=owner;remoteMissingVerified=true;
                observedRemoteToken=null;pendingRemotePayload=null;pendingRemoteToken=null;
            }
            pushNativeStatus("cloud-ready");
            final String session=webSessionToken;
            activity.runOnUiThread(() -> {
                if (activeIdentity(owner,epoch)&&session.equals(webSessionToken)&&pageReady)
                    webView.evaluateJavascript("window.__miaadCloudAbsent && window.__miaadCloudAbsent("
                            +JSONObject.quote(session)+");",null);
            });
            return;
        }
        if (doc.contains("generation")) {
            final String generation=doc.getString("generation");
            final Long countValue=doc.getLong("chunkCount");
            final int count=countValue==null?0:countValue.intValue();
            if (generation==null||count<1||count>450){pushNativeStatus("cloud-pending");return;}
            java.util.List<com.google.android.gms.tasks.Task<DocumentSnapshot>> tasks=new java.util.ArrayList<>();
            for(int i=0;i<count;i++)tasks.add(doc.getReference().collection("snapshots")
                    .document(generation+"-"+i).get());
            com.google.android.gms.tasks.Tasks.whenAllSuccess(tasks).addOnSuccessListener(results -> {
                if (!activeIdentity(owner,epoch))return;
                StringBuilder payload=new StringBuilder();
                for(Object result:results) {
                    String part=((DocumentSnapshot)result).getString("payload");
                    if(part==null){pushNativeStatus("cloud-pending");return;}
                    payload.append(part);
                }
                deliverPayload(payload.toString(),doc,owner,epoch);
            }).addOnFailureListener(e -> {
                if(activeIdentity(owner,epoch))pushNativeStatus("cloud-pending");
            });
        } else deliverPayload(doc.getString("payload"),doc,owner,epoch);
    }

    private void deliverPayload(String payload,DocumentSnapshot doc,String owner,long epoch) {
        if (payload==null||payload.isEmpty()||!activeIdentity(owner,epoch))return;
        final String session=webSessionToken;
        synchronized (writeLock) {
            if (!activeIdentity(owner,epoch)||!session.equals(webSessionToken))return;
            remoteOwnerUid=owner;remoteMissingVerified=false;
            observedRemoteToken=null;pendingRemotePayload=payload;pendingRemoteToken=remoteToken(doc);
        }
        activity.runOnUiThread(() -> {
            if (!activeIdentity(owner,epoch)||!session.equals(webSessionToken)||!pageReady)return;
            webView.evaluateJavascript("window.__miaadReceiveCloud && window.__miaadReceiveCloud("
                    +JSONObject.quote(payload)+","+JSONObject.quote(session)+");",null);
        });
    }

    void pushNativeStatus(String status) {
        if (!pageReady)return;
        final String owner=uid,session=webSessionToken;
        final long epoch=accountEpoch;
        activity.runOnUiThread(() -> {
            if(!pageReady||!java.util.Objects.equals(owner,uid)||epoch!=accountEpoch||
               !session.equals(webSessionToken))return;
            webView.evaluateJavascript("window.__miaadNativeStatus && window.__miaadNativeStatus("
                    +JSONObject.quote(status)+","+JSONObject.quote(session)+");",null);
        });
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
        // Legacy unowned WebView code cannot schedule personally identifying
        // notifications in an authenticated account.
        pushNativeStatus("reminder-error");
    }

    @JavascriptInterface
    public void syncRemindersOwned(String json,String session) {
        final String owner=uid;
        final long epoch=accountEpoch;
        if (!validSession(session)||!activeIdentity(owner,epoch))return;
        try {
            if(!activeIdentity(owner,epoch))return;
            ReminderScheduler.sync(activity,json,owner);
        }catch(Exception ex){pushNativeStatus("reminder-error");}
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
