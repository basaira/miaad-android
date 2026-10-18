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
        assertFalse(SnapshotAdmission.valid(prefs.getString("snapshot","")));
    }
    @Test public void localSaveDoesNotUploadAndInvalidSavePreservesBytes() throws Exception {
        String user=uniqueId("local-only");
        DocumentReference main=doc(user);
        String good=snapshot(System.currentTimeMillis());
        prefs.edit().putString("snapshot",good).commit();
        bridge.setUid(user);
        bridge.saveSnapshot("{broken");
        assertEquals(good,prefs.getString("snapshot",""));
        absent(main);
        String replacement=snapshot(System.currentTimeMillis()+100);
        bridge.saveSnapshot(replacement);
        assertEquals(replacement,prefs.getString("snapshot",""));
        absent(main); // saveSnapshot is always local-only, even authenticated.
        assertFalse(SnapshotAdmission.valid(invalidTarget()));
        assertTrue(SnapshotAdmission.valid(replacement));
    }
    @Test public void missingCloudValidFirstSyncRequiresObservedAbsence() throws Exception {
        String user=uniqueId("first-sync");
        DocumentReference main=doc(user);
        String good=snapshot(System.currentTimeMillis());
        bridge.setUid(user);
        bridge.saveSnapshot(good);
        bridge.requestVerifiedSync(good); // No remote observation => no write.
        SystemClock.sleep(200);
        absent(main);
        bridge.setPageReady(true);
        deliver(bridge,read(main)); // Real Android DocumentSnapshot from emulator.
        bridge.requestVerifiedSync(good);
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
        bridge.setUid(user);bridge.saveSnapshot(candidate);
        bridge.requestVerifiedSync(candidate); // no acknowledged remote baseline
        SystemClock.sleep(200);
        assertEquals(old,read(main).getString("payload"));
        DocumentSnapshot observed=read(main);deliver(bridge,observed);
        bridge.confirmCloudSnapshot(old); // Exact delivered payload is required.
        // Simulate another client changing the cloud after observation.
        Map<String,Object> external=new HashMap<>();
        external.put("payload",snapshot(150));external.put("updatedAt",150L);
        Tasks.await(main.set(external),20,TimeUnit.SECONDS);
        bridge.requestVerifiedSync(candidate); // Transaction must abort.
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
        bridge.setUid(user);bridge.saveSnapshot(large);bridge.setPageReady(true);
        deliver(bridge,read(main));
        bridge.requestVerifiedSync(large);
        until("chunked first sync",()->read(main).contains("generation"));
        DocumentSnapshot written=read(main);
        assertTrue(written.getLong("chunkCount")>=2);
        assertNull(written.getString("payload"));
    }
}