package com.miaad.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.DocumentReference;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

/**
 * Exercises the actual MiaadBridge + Firebase Android SDK against the
 * Firestore emulator on 10.0.2.2. The Activity is launched with the
 * debug-only flag that disables any production Firebase Authentication.
 */
@RunWith(AndroidJUnit4.class)
public class NativeWriteBoundaryTest {
    private static volatile boolean emulatorConfigured=false;
    private FirebaseFirestore db;
    private ActivityScenario<MainActivity> scenario;
    private MiaadBridge bridge;
    private SharedPreferences prefs;

    private static JSONObject domain() throws Exception {
        return new JSONObject().put("version",4)
                .put("students",new JSONObject())
                .put("records",new JSONObject())
                .put("schedules",new JSONObject())
                .put("cycles",new JSONObject())
                .put("periods",new JSONObject())
                .put("notifications",new JSONObject())
                .put("settings",new JSONObject().put("teacherTimeZone","UTC")
                        .put("target",12).put("duration",30))
                .put("activity",new JSONArray());
    }
    private static String snapshot(long stamp) throws Exception {
        return new JSONObject().put("schemaVersion",4)
                .put("updatedAt",stamp).put("lessons",new JSONArray())
                .put("sessionState",new JSONObject()).put("sessionNotes",new JSONObject())
                .put("sessionAudit",new JSONObject()).put("idrisPhase",0)
                .put("domain",domain()).toString();
    }
    private static String invalidTarget() throws Exception {
        JSONObject invalid=domain();
        invalid.getJSONObject("settings").put("target",0);
        return new JSONObject().put("schemaVersion",4)
                .put("updatedAt",System.currentTimeMillis())
                .put("lessons",new JSONArray()).put("domain",invalid).toString();
    }
    private DocumentReference doc(String id) {
        return db.collection("users").document(id).collection("state").document("main");
    }
    private static DocumentSnapshot read(DocumentReference ref) throws Exception {
        return Tasks.await(ref.get(),20,TimeUnit.SECONDS);
    }
    private static void absent(DocumentReference ref) throws Exception { assertFalse(read(ref).exists()); }
    private static void deliver(MiaadBridge bridge,DocumentSnapshot snapshot) throws Exception {
        Method m=MiaadBridge.class.getDeclaredMethod("deliverCloudDocument",DocumentSnapshot.class);
        m.setAccessible(true);m.invoke(bridge,snapshot);
    }
    private static void until(String description,BooleanCheck check) throws Exception {
        for(int n=0;n<120;n++){if(check.check())return;SystemClock.sleep(150);}
        fail("Timed out: "+description);
    }
    private interface BooleanCheck {boolean check() throws Exception;}
    private String uniqueId(String name){return "v1r7-"+name+"-"+UUID.randomUUID();}

    @Before public void setup() {
        db=FirebaseFirestore.getInstance();
        // Configure once, before launching any Activity or running SDK reads.
        synchronized (NativeWriteBoundaryTest.class) {
            if(!emulatorConfigured) {
                db.useEmulator("10.0.2.2",8080);
                emulatorConfigured=true;
            }
        }
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent=new Intent(context,MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra("miaad_isolated_no_firebase",true);
        scenario=ActivityScenario.launch(intent);
        AtomicReference<MiaadBridge> ref=new AtomicReference<>();
        AtomicReference<SharedPreferences> pref=new AtomicReference<>();
        scenario.onActivity(activity->{
            ref.set(new MiaadBridge(activity,new WebView(activity)));
            pref.set(activity.getSharedPreferences("miaad_native_v1",Context.MODE_PRIVATE));
        });
        bridge=ref.get();prefs=pref.get();
        assertNotNull(bridge);
    }
    @After public void teardown(){if(scenario!=null)scenario.close();}

    @Test public void corruptedStoredSnapshotDoesNotBootstrapMissingCloud() throws Exception {
        String user=uniqueId("missing-invalid");
        DocumentReference main=doc(user);
        absent(main);
        prefs.edit().putString("snapshot",invalidTarget()).commit();
        bridge.setUid(user);
        bridge.setPageReady(true);
        deliver(bridge,read(main));
        SystemClock.sleep(400);
        absent(main);
        assertEquals("",bridge.loadSnapshotOwned(bridge.sessionToken()));
        assertFalse(SnapshotAdmission.valid(prefs.getString("snapshot","")));
        assertTrue(bridge.hasUnownedSnapshot());
    }
    @Test public void localSaveDoesNotUploadAndInvalidSavePreservesBytes() throws Exception {
        String user=uniqueId("local-only");
        DocumentReference main=doc(user);
        String good=snapshot(System.currentTimeMillis());
        prefs.edit().putString("snapshot",good).commit();
        bridge.setUid(user);
        bridge.saveSnapshotOwned("{broken",bridge.sessionToken());
        assertEquals(good,bridge.loadSnapshotOwned(bridge.sessionToken()));
        absent(main);
        String replacement=snapshot(System.currentTimeMillis()+100);
        bridge.saveSnapshotOwned(replacement,bridge.sessionToken());
        assertEquals(replacement,bridge.loadSnapshotOwned(bridge.sessionToken()));
        absent(main); // saveSnapshot is always local-only, even authenticated.
        assertFalse(SnapshotAdmission.valid(invalidTarget()));
        assertTrue(SnapshotAdmission.valid(replacement));
    }
    @Test public void missingCloudValidFirstSyncRequiresObservedAbsence() throws Exception {
        String user=uniqueId("first-sync");
        DocumentReference main=doc(user);
        String good=snapshot(System.currentTimeMillis());
        bridge.setUid(user);
        bridge.saveSnapshotOwned(good,bridge.sessionToken());
        bridge.requestVerifiedSyncOwned(good,bridge.sessionToken()); // No remote observation => no write.
        SystemClock.sleep(200);
        absent(main);
        bridge.setPageReady(true);
        deliver(bridge,read(main)); // Real Android DocumentSnapshot from emulator.
        bridge.requestVerifiedSyncOwned(good,bridge.sessionToken());
        until("authorized first write",()->read(main).exists());
        assertEquals(good,read(main).getString("payload"));
    }
    @Test public void preexistingCloudRequiresExactlyAcceptedRemoteBaseline() throws Exception {
        String user=uniqueId("conflict");
        DocumentReference main=doc(user);
        String old=snapshot(100);
        Map<String,Object> record=new HashMap<>();
        record.put("payload",old);record.put("updatedAt",100L);
        Tasks.await(main.set(record),20,TimeUnit.SECONDS);
        String candidate=snapshot(200);
        bridge.setUid(user);bridge.saveSnapshotOwned(candidate,bridge.sessionToken());
        bridge.requestVerifiedSyncOwned(candidate,bridge.sessionToken()); // no acknowledged remote baseline
        SystemClock.sleep(200);
        assertEquals(old,read(main).getString("payload"));
        DocumentSnapshot observed=read(main);deliver(bridge,observed);
        bridge.confirmCloudSnapshotOwned(old,bridge.sessionToken()); // Exact delivered payload is required.
        // Simulate another client changing the cloud after observation.
        Map<String,Object> external=new HashMap<>();
        external.put("payload",snapshot(150));external.put("updatedAt",150L);
        Tasks.await(main.set(external),20,TimeUnit.SECONDS);
        bridge.requestVerifiedSyncOwned(candidate,bridge.sessionToken()); // Transaction must abort.
        SystemClock.sleep(600);
        assertEquals(external.get("payload"),read(main).getString("payload"));
    }
    @Test public void chunkedFirstSyncIsVersionGuarded() throws Exception {
        String user=uniqueId("large");
        DocumentReference main=doc(user);
        JSONObject payload=new JSONObject(snapshot(System.currentTimeMillis()));
        char[] data=new char[720000];java.util.Arrays.fill(data,'x');
        payload.getJSONObject("domain").getJSONArray("activity")
                .put(new JSONObject().put("note",new String(data)));
        String large=payload.toString();
        assertTrue(large.length()>700000);
        assertTrue(SnapshotAdmission.valid(large));
        bridge.setUid(user);bridge.saveSnapshotOwned(large,bridge.sessionToken());bridge.setPageReady(true);
        deliver(bridge,read(main));
        bridge.requestVerifiedSyncOwned(large,bridge.sessionToken());
        until("chunked first sync",()->read(main).contains("generation"));
        DocumentSnapshot written=read(main);
        assertTrue(written.getLong("chunkCount")>=2);
        assertNull(written.getString("payload"));
    }
    @Test public void ownerAIsNeverSilentlyUploadedAsBOnMissingCloud() throws Exception {
        String A=uniqueId("ownerA"),B=uniqueId("ownerB");
        String ownA=snapshot(345);
        bridge.setUid(A);
        assertTrue(bridge.saveSnapshotOwned(ownA,bridge.sessionToken()));
        bridge.setUid(B);
        assertEquals("",bridge.loadSnapshotOwned(bridge.sessionToken()));
        bridge.setPageReady(true);
        deliver(bridge,read(doc(B)));
        bridge.requestVerifiedSyncOwned(ownA,bridge.sessionToken());
        SystemClock.sleep(350);
        absent(doc(B));
        bridge.setUid(A);
        assertEquals(ownA,bridge.loadSnapshotOwned(bridge.sessionToken()));
    }
    @Test public void delayedCloudResponseFromOldEpochCannotAuthorizeNewUid() throws Exception {
        String A=uniqueId("stale-A"),B=uniqueId("stale-B");
        String ownA=snapshot(100);
        Map<String,Object> fields=new HashMap<>();
        fields.put("payload",ownA);fields.put("updatedAt",100L);
        Tasks.await(doc(A).set(fields),20,TimeUnit.SECONDS);
        bridge.setUid(A);
        java.lang.reflect.Field field=MiaadBridge.class.getDeclaredField("accountEpoch");
        field.setAccessible(true);
        long epoch=field.getLong(bridge);
        DocumentSnapshot oldReply=read(doc(A));
        bridge.setUid(B);
        String activeToken=bridge.sessionToken();
        assertTrue(bridge.saveSnapshotOwned(snapshot(200),activeToken));
        Method delayed=MiaadBridge.class.getDeclaredMethod(
             "deliverCloudDocument",DocumentSnapshot.class,String.class,long.class);
        delayed.setAccessible(true);
        delayed.invoke(bridge,oldReply,A,epoch);
        bridge.requestVerifiedSyncOwned(snapshot(200),activeToken);
        SystemClock.sleep(200);
        absent(doc(B));
        assertEquals("",bridge.loadSnapshotOwned("old-A-token"));
    }
    @Test public void accountRoundtripPersistsSeparatedOriginalBytes() throws Exception {
        String A=uniqueId("round-A"),B=uniqueId("round-B");
        String sA=snapshot(301),sB=snapshot(302);
        bridge.setUid(A);
        assertTrue(bridge.saveSnapshotOwned(sA,bridge.sessionToken()));
        bridge.setUid(B);
        assertTrue(bridge.saveSnapshotOwned(sB,bridge.sessionToken()));
        assertEquals(sB,bridge.loadSnapshotOwned(bridge.sessionToken()));
        bridge.setUid(A);
        assertEquals(sA,bridge.loadSnapshotOwned(bridge.sessionToken()));
        bridge.setUid(B);
        assertEquals(sB,bridge.loadSnapshotOwned(bridge.sessionToken()));
    }
    @Test public void unownedHistoricalNativeBytesAreNeverBoundToCurrentUid() throws Exception {
        String B=uniqueId("unowned-B");
        String raw=snapshot(200);
        prefs.edit().putString("snapshot",raw).commit();
        bridge.setUid(B);
        assertTrue(bridge.hasUnownedSnapshot());
        assertEquals("",bridge.loadSnapshotOwned(bridge.sessionToken()));
        bridge.requestVerifiedSyncOwned(raw,bridge.sessionToken());
        SystemClock.sleep(200);
        absent(doc(B));
        assertEquals(raw,prefs.getString("snapshot",""));
    }
    @Test public void restoredBridgeKeepsOwnerBindingAcrossProcessLikeRestart() throws Exception {
        String A=uniqueId("process-A"),B=uniqueId("process-B");
        String ownA=snapshot(501);
        bridge.setUid(A);assertTrue(bridge.saveSnapshotOwned(ownA,bridge.sessionToken()));
        AtomicReference<MiaadBridge> restored=new AtomicReference<>();
        scenario.onActivity(activity->restored.set(new MiaadBridge(activity,new WebView(activity))));
        assertNotNull(restored.get());
        restored.get().setUid(B);
        assertEquals("",restored.get().loadSnapshotOwned(restored.get().sessionToken()));
        restored.get().setUid(A);
        assertEquals(ownA,restored.get().loadSnapshotOwned(restored.get().sessionToken()));
    }
    @Test public void sessionTransitionRevokesOldWriteAuthorization() throws Exception {
        String A=uniqueId("oldtoken-A"),B=uniqueId("oldtoken-B");
        bridge.setUid(A);
        String tokenA=bridge.sessionToken(),ownA=snapshot(601);
        assertTrue(bridge.saveSnapshotOwned(ownA,tokenA));
        bridge.setUid(B);
        assertFalse(bridge.saveSnapshotOwned(ownA,tokenA));
        bridge.requestVerifiedSyncOwned(ownA,tokenA);
        absent(doc(B));
        bridge.setUid(A);
        assertEquals(ownA,bridge.loadSnapshotOwned(bridge.sessionToken()));
    }

    @Test public void uidSwitchDuringPendingTransactionCannotWriteIntoNewOwner() throws Exception {
        String A=uniqueId("inflight-A"),B=uniqueId("inflight-B");
        String snapshotA=snapshot(702);
        bridge.setUid(A);
        String sessionA=bridge.sessionToken();
        assertTrue(bridge.saveSnapshotOwned(snapshotA,sessionA));
        bridge.setPageReady(true);
        deliver(bridge,read(doc(A)));  // Confirmed Cloud absence for A.
        bridge.requestVerifiedSyncOwned(snapshotA,sessionA);
        // A transaction may commit under A. It must never authorize a write
        // into B after the UID and account generation have changed.
        bridge.setUid(B);
        String sessionB=bridge.sessionToken();
        bridge.requestVerifiedSyncOwned(snapshotA,sessionA);
        SystemClock.sleep(500);
        absent(doc(B));
        assertEquals("",bridge.loadSnapshotOwned(sessionB));
        bridge.setUid(A);
        assertEquals(snapshotA,bridge.loadSnapshotOwned(bridge.sessionToken()));
    }
    @Test public void delayedChunkedResponseFromSupersededUidCannotAuthorizeB() throws Exception {
        String A=uniqueId("chunkA"),B=uniqueId("chunkB");
        String original=snapshot(806),generation=UUID.randomUUID().toString();
        Map<String,Object> mainDoc=new HashMap<>();
        mainDoc.put("generation",generation);
        mainDoc.put("chunkCount",1L);
        mainDoc.put("updatedAt",806L);
        Map<String,Object> part=new HashMap<>();
        part.put("payload",original);
        Tasks.await(doc(A).collection("snapshots").document(generation+"-0").set(part),20,TimeUnit.SECONDS);
        Tasks.await(doc(A).set(mainDoc),20,TimeUnit.SECONDS);
        bridge.setUid(A);
        bridge.setPageReady(true);
        java.lang.reflect.Field epochField=MiaadBridge.class.getDeclaredField("accountEpoch");
        epochField.setAccessible(true);
        long oldEpoch=epochField.getLong(bridge);
        Method delayed=MiaadBridge.class.getDeclaredMethod(
            "deliverCloudDocument",DocumentSnapshot.class,String.class,long.class);
        delayed.setAccessible(true);
        DocumentSnapshot oldResponse=read(doc(A));
        delayed.invoke(bridge,oldResponse,A,oldEpoch);
        bridge.setUid(B);
        final String sessionB=bridge.sessionToken();
        assertTrue(bridge.saveSnapshotOwned(snapshot(807),sessionB));
        // Replaying the old chunk header after switching must also fail.
        delayed.invoke(bridge,oldResponse,A,oldEpoch);
        SystemClock.sleep(500);
        java.lang.reflect.Field ownerField=MiaadBridge.class.getDeclaredField("remoteOwnerUid");
        ownerField.setAccessible(true);
        assertNull(ownerField.get(bridge));
        bridge.requestVerifiedSyncOwned(snapshot(807),sessionB);
        absent(doc(B));
        assertEquals("",bridge.loadSnapshotOwned("superseded-A-token"));
    }

    @Test public void uidChangeCancelsOldOwnerRemindersAndPreservesPlanBytes() throws Exception {
        String A=uniqueId("reminder-A"),B=uniqueId("reminder-B");
        bridge.setUid(A);
        String sessionA=bridge.sessionToken();
        long future=System.currentTimeMillis()+3600000;
        String plan=new JSONArray().put(new JSONObject()
            .put("id","confidential-academic-reminder")
            .put("at",future)
            .put("title","Private student belonging to A")
            .put("body","CONFIDENTIAL_A")).toString();
        bridge.syncRemindersOwned(plan,sessionA);
        assertEquals(A,prefs.getString("reminder_owner",null));
        assertEquals(plan,prefs.getString("reminder_plan",null));
        assertFalse(prefs.getStringSet("reminder_codes",new java.util.HashSet<>()).isEmpty());
        bridge.setUid(B);
        assertNull(prefs.getString("reminder_owner",null));
        assertNull(prefs.getString("reminder_plan",null));
        assertTrue(prefs.getStringSet("reminder_codes",new java.util.HashSet<>()).isEmpty());
        String backup="reminder_plan_preserved_"+ReminderScheduler.ownerKey(A)+"_"
            +ReminderScheduler.ownerKey(plan);
        assertEquals(plan,prefs.getString(backup,null));
        bridge.syncRemindersOwned(plan,sessionA);
        assertNull(prefs.getString("reminder_owner",null));
        bridge.syncRemindersOwned("[]",bridge.sessionToken());
        assertEquals(B,prefs.getString("reminder_owner",null));
        assertEquals("[]",prefs.getString("reminder_plan",null));
    }

}