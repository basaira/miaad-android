package com.miaad.app;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Iterator;
import java.util.regex.Pattern;

/**
 * Native defense-in-depth at the remote write boundary. The JS Domain validator
 * remains the application semantic authority. This independently rejects
 * malformed v4 envelopes, invalid canonical record identities, settings and
 * schedule revisions, before any Firestore transaction is started.
 *
 * No data repair, coercion, default filling or Firebase interaction here.
 */
public final class SnapshotAdmission {
    private SnapshotAdmission() {}
    private static final Pattern TIME=Pattern.compile("(?:[01]\\d|2[0-3]):[0-5]\\d");
    private static final Pattern NUMERIC=Pattern.compile("(?:0|[1-9]\\d*)(?:\\.\\d+)?");
    private static boolean map(Object x){return x instanceof JSONObject;}
    private static boolean str(Object x){return x instanceof String && !((String)x).trim().isEmpty();}
    private static boolean bool(Object x){return x instanceof Boolean;}
    private static boolean time(Object x){return x instanceof String && TIME.matcher((String)x).matches();}
    private static boolean end(Object x){return time(x)||"24:00".equals(x);}
    private static boolean date(Object x){
        if(!(x instanceof String)||!((String)x).matches("\\d{4}-\\d{2}-\\d{2}"))return false;
        try{LocalDate.parse((String)x);return true;}catch(DateTimeParseException ex){return false;}
    }
    private static boolean numeric(Object x){
        if(x instanceof Number)return Double.isFinite(((Number)x).doubleValue());
        return x instanceof String && NUMERIC.matcher((String)x).matches() &&
                Double.isFinite(Double.parseDouble((String)x));
    }
    // Domain v4 schedule writers historically accept nonblank numeric strings,
    // including decimal forms and surrounding whitespace. This is deliberately
    // separate from the narrower settings numeric-string contract.
    private static boolean scheduleDuration(Object x){
        if(x instanceof Number)return Double.isFinite(((Number)x).doubleValue()) &&
             ((Number)x).doubleValue()>=0;
        if(!(x instanceof String)||((String)x).trim().isEmpty())return false;
        try{double d=Double.parseDouble(((String)x).trim());return Double.isFinite(d)&&d>=0;}
        catch(Exception ex){return false;}
    }
    private static boolean integer(Object x,int min,int max){
        if(!numeric(x))return false;
        double v=x instanceof Number?((Number)x).doubleValue():Double.parseDouble((String)x);
        return v>=min&&v<=max&&Math.rint(v)==v;
    }
    private static Object value(JSONObject j,String key){return j.opt(key);}
    private static boolean optionalBoolean(JSONObject j,String key){return !j.has(key)||bool(j.opt(key));}
    private static boolean oneOf(Object x,String...values){
        if(!(x instanceof String))return false;
        for(String v:values)if(v.equals(x))return true;return false;
    }
    private static boolean interval(JSONArray pair){
        return pair!=null&&pair.length()==2&&time(pair.opt(0))&&end(pair.opt(1))
                &&!pair.opt(0).equals(pair.opt(1));
    }
    private static boolean setting(JSONObject s){
        if(s==null)return false;
        for(String key:new String[]{"target","duration","minSlot"})
            if(s.has(key)&&!integer(s.opt(key),1,Integer.MAX_VALUE))return false;
        if(s.has("buffer")&&(!numeric(s.opt("buffer"))||
                Double.parseDouble(String.valueOf(s.opt("buffer")))<0))return false;
        if(s.has("periodDay")&&!integer(s.opt("periodDay"),1,31))return false;
        if(s.has("periodMode")&&!oneOf(s.opt("periodMode"),"calendar","monthly","custom"))return false;
        if(s.has("language")&&!oneOf(s.opt("language"),"ar","en"))return false;
        if(s.has("teacherTimeZone")){
            if(!(s.opt("teacherTimeZone") instanceof String))return false;
            String zone=((String)s.opt("teacherTimeZone")).trim();
            if(!zone.isEmpty())try{ZoneId.of(zone);}catch(Exception e){return false;}
        }
        for(String key:new String[]{"autoCycle","autoPeriod","showNotes"})
            if(!optionalBoolean(s,key))return false;
        if(s.has("rules")){
            JSONObject r=s.optJSONObject("rules");if(r==null)return false;
            for(String key:new String[]{"entered","absent","student_cancelled","missed","notheld","rescheduled","makeup"})
                if(!optionalBoolean(r,key))return false;
        }
        if(s.has("notifications")){
            JSONObject n=s.optJSONObject("notifications");if(n==null)return false;
            for(String key:new String[]{"upcoming","cycle","period","pending","daily","availability"})
                if(!optionalBoolean(n,key))return false;
            if(n.has("dailyTime")&&!time(n.opt("dailyTime")))return false;
        }
        if(s.has("working")){
            JSONObject w=s.optJSONObject("working");if(w==null)return false;
            for(Iterator<String> it=w.keys();it.hasNext();){
                String key=it.next();if(!key.matches("[0-6]"))return false;
                JSONArray pairs=w.optJSONArray(key);if(pairs==null)return false;
                for(int k=0;k<pairs.length();k++)if(!interval(pairs.optJSONArray(k)))return false;
            }
        }
        if(s.has("blocked")){
            JSONArray blocks=s.optJSONArray("blocked");if(blocks==null)return false;
            for(int i=0;i<blocks.length();i++){
                JSONObject b=blocks.optJSONObject(i);
                if(b==null||!interval(new JSONArray().put(b.opt("start")).put(b.opt("end"))))return false;
                if(!b.has("date")&&!b.has("day"))return false;
                if(b.has("date")&&!date(b.opt("date")))return false;
                if(b.has("day")&&!integer(b.opt("day"),0,6))return false;
            }
        }
        return true;
    }
    private static boolean students(JSONObject students){
        for(Iterator<String> it=students.keys();it.hasNext();){
            String id=it.next();JSONObject s=students.optJSONObject(id);
            if(!str(id)||s==null||!id.equals(s.opt("id"))||!str(s.opt("name"))||!date(s.opt("startDate")))return false;
            if(!optionalBoolean(s,"custom"))return false;
            if(s.has("settings")&&!setting(s.optJSONObject("settings")))return false;
        }
        return true;
    }
    private static boolean records(JSONObject records,JSONObject students){
        for(Iterator<String> it=records.keys();it.hasNext();){
            String id=it.next();JSONObject r=records.optJSONObject(id);
            if(!str(id)||r==null||!id.equals(r.opt("id"))||!str(r.opt("studentId"))
                    ||!students.has(r.optString("studentId"))||!date(r.opt("date"))
                    ||!oneOf(r.opt("status"),"entered","absent","student_cancelled","missed","notheld","rescheduled","makeup","pending")
                    ||!numeric(r.opt("duration"))||r.opt("duration") instanceof String
                    ||Double.parseDouble(String.valueOf(r.opt("duration")))<0)return false;
            if(r.has("time")&&!"".equals(r.opt("time"))&&!time(r.opt("time")))return false;
            if(r.has("scheduleId")&&!str(r.opt("scheduleId")))return false;
            if(r.has("actualMinutes")&&(!numeric(r.opt("actualMinutes"))||r.opt("actualMinutes") instanceof String||Double.parseDouble(String.valueOf(r.opt("actualMinutes")))<0))return false;
            if(r.has("note")&&!(r.opt("note") instanceof String))return false;
            if(r.has("countOverride")&&r.opt("countOverride")!=JSONObject.NULL&&!bool(r.opt("countOverride")))return false;
            if(!optionalBoolean(r,"deleted"))return false;
        }
        return true;
    }
    private static boolean schedules(JSONObject schedules,JSONObject students){
        for(Iterator<String> it=schedules.keys();it.hasNext();){
            String id=it.next();JSONArray revisions=schedules.optJSONArray(id);
            if(!str(id)||revisions==null||revisions.length()==0)return false;
            String previous="";
            for(int i=0;i<revisions.length();i++){
                JSONObject r=revisions.optJSONObject(i);
                if(r==null||!date(r.opt("from"))||r.optString("from").compareTo(previous)<=0)return false;
                previous=r.optString("from");
                Object lesson=r.opt("lesson");if(lesson==JSONObject.NULL)continue;
                if(!(lesson instanceof JSONObject))return false;
                JSONObject l=(JSONObject)lesson;
                if(!id.equals(l.opt("id"))||!str(l.opt("studentId"))||!students.has(l.optString("studentId"))
                        ||!integer(l.opt("day"),0,6)||!(l.opt("start") instanceof String)
                        ||(!time(l.opt("start"))&&!"".equals(l.opt("start")))
                        ||("".equals(l.opt("start"))&&!str(l.opt("displayTime")))
                        ||!scheduleDuration(l.opt("duration"))
                        ||!oneOf(l.opt("repeat"),"weekly","biweekly","flex"))return false;
            }
        }
        return true;
    }
    private static boolean timestamp(Object x){
        if(!(x instanceof Number))return false;
        double v=((Number)x).doubleValue();
        return Double.isFinite(v)&&v>=0&&v<=9007199254740991d&&Math.rint(v)==v;
    }
    public static boolean valid(String raw){
        if(raw==null||raw.isEmpty())return false;
        try{
            Object parsed=new JSONTokener(raw).nextValue();
            if(!(parsed instanceof JSONObject))return false;
            JSONObject root=(JSONObject)parsed;
            if(!integer(root.opt("schemaVersion"),4,4)||!timestamp(root.opt("updatedAt")))return false;
            JSONArray lessons=root.optJSONArray("lessons");if(lessons==null)return false;
            for(int i=0;i<lessons.length();i++){
                JSONObject l=lessons.optJSONObject(i);
                if(l==null||!str(l.opt("id")))return false;
            }
            for(String key:new String[]{"sessionState","sessionNotes","sessionAudit"})
                if(root.has(key)&&root.optJSONObject(key)==null)return false;
            if(root.has("idrisPhase")&&!integer(root.opt("idrisPhase"),0,1))return false;
            JSONObject d=root.optJSONObject("domain");if(d==null||!integer(d.opt("version"),4,4)||d.opt("version") instanceof String)return false;
            JSONObject students=d.optJSONObject("students"),records=d.optJSONObject("records"),
                    schedules=d.optJSONObject("schedules"),cycles=d.optJSONObject("cycles"),
                    periods=d.optJSONObject("periods"),notifications=d.optJSONObject("notifications"),
                    settings=d.optJSONObject("settings");
            JSONArray activity=d.optJSONArray("activity");
            if(students==null||records==null||schedules==null||cycles==null||periods==null||
                    notifications==null||settings==null||activity==null||!setting(settings))return false;
            if(!students(students)||!records(records,students)||!schedules(schedules,students))return false;
            for(JSONObject map:new JSONObject[]{cycles,periods,notifications}){
                for(Iterator<String> it=map.keys();it.hasNext();)if(map.optJSONObject(it.next())==null)return false;
            }
            for(int i=0;i<activity.length();i++)if(activity.optJSONObject(i)==null)return false;
            return true;
        }catch(Exception ex){return false;}
    }
}