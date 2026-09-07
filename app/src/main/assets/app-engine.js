/*
  SmartScheduleEngine — a self-contained local scheduling backend.
  No external module. Hard intervals are exact commitments. Flexible labels
  (e.g. "بعد المغرب") are soft constraints: suggestions may use them only
  with a warning and a score penalty. Variable-duration lessons reserve their
  declared maxDuration so a new lesson is not placed inside the likely overrun.
*/
const SmartScheduleEngine=(()=>{
 const DAY=86400,GRID=300,UNCERTAIN_DEFAULT=1800;
 const overlaps=(a,b)=>Math.max(a.start,b.start)<Math.min(a.end,b.end);
 function isSoft(l){return !hasFixedTime(l)}
 function effectiveSeconds(l){return Math.max(60,(l.maxDuration||l.duration||UNCERTAIN_DEFAULT/60)*60)}
 function blocks(date,excludeId=''){
   const out=[];
   // Include yesterday's overruns. Unknown clock times remain whole-day
   // uncertainty, never a fabricated minute or a guaranteed free interval.
   for(const offset of [-1,0]){
     for(const l of lessonsForDate(addDays(date,offset)).filter(l=>l.id!==excludeId)){
       const soft=isSoft(l);
       if(soft){if(offset===0)out.push({id:l.id,name:l.name,start:0,end:DAY,soft:true,label:l.displayTime||'وقت غير محدد',lesson:l});continue}
       const start=offset*DAY+toSeconds(l.start),end=start+effectiveSeconds(l);
       if(end>0&&start<DAY)out.push({id:l.id,name:l.name,start:Math.max(0,start),end:Math.min(DAY,end),soft:false,label:l.displayTime||l.start,lesson:l});
     }
   }
   return out.sort((a,b)=>a.start-b.start)
 }
 function merge(list){if(!list.length)return[];const a=list.map(x=>({...x})).sort((x,y)=>x.start-y.start),out=[a[0]];for(let i=1;i<a.length;i++){const last=out[out.length-1],cur=a[i];if(cur.start<=last.end)last.end=Math.max(last.end,cur.end);else out.push(cur)}return out}
 function freeWindows(date,excludeId=''){
   if(typeof domain!=='undefined')return domain.availability(dateKey(date),excludeId).map(w=>({start:w.start*60,end:w.end*60,seconds:w.minutes*60,softRisks:w.soft}));
   const bs=blocks(date,excludeId),hard=merge(bs.filter(b=>!b.soft)),soft=bs.filter(b=>b.soft),out=[];let cursor=0;
   for(const b of hard){if(b.start>cursor)out.push({start:cursor,end:b.start});cursor=Math.max(cursor,b.end)}if(cursor<DAY)out.push({start:cursor,end:DAY});
   return out.map(w=>({...w,seconds:w.end-w.start,softRisks:soft.filter(s=>overlaps(w,s))}))
 }
 function conflict(date,startSec,durationMin,excludeId=''){
   const end=startSec+Math.max(1,durationMin)*60,hits=[];
   for(let day=0;day<=Math.floor((end-1)/DAY);day++){
     const probe={start:Math.max(0,startSec-day*DAY),end:Math.min(DAY,end-day*DAY)};
     hits.push(...blocks(addDays(date,day),excludeId).filter(b=>overlaps(probe,b)));
   }
   const unique=[...new Map(hits.map(b=>[b.id,b])).values()];
   return {hard:unique.filter(b=>!b.soft),soft:unique.filter(b=>b.soft)}
 }
 function affinity(startMin){
   const starts=lessons.filter(hasFixedTime).map(l=>toMinutes(l.start));if(!starts.length)return .5;
   let sum=0;for(const x of starts){const dist=Math.min(Math.abs(startMin-x),1440-Math.abs(startMin-x));sum+=Math.exp(-(dist*dist)/(2*120*120))}return Math.min(1,sum/Math.max(2,starts.length*.23))
 }
 function scoreCandidates(date,durationMin,excludeId=''){
   durationMin=Math.max(10,Number(durationMin)||30);const dur=durationMin*60,bs=blocks(date,excludeId),hard=bs.filter(x=>!x.soft),soft=bs.filter(x=>x.soft),wins=freeWindows(date,excludeId),raw=[];
   for(const w of wins){if(w.seconds<dur)continue;for(let st=Math.ceil(w.start/GRID)*GRID;st+dur<=w.end;st+=GRID){const en=st+dur,left=st-w.start,right=w.end-en;let score=62;
     score+=affinity(st/60)*20;
     const near=Math.min(...hard.flatMap(b=>[Math.abs(st-b.end),Math.abs(en-b.start)]),7200);score+=Math.max(0,12-near/300);
     if(left>0&&left<1200)score-=10;if(right>0&&right<1200)score-=10;
     if(left>=600&&right>=600)score+=4;
     const softHits=soft.filter(b=>overlaps({start:st,end:en},b));score-=softHits.length*28;
     if(affinity(st/60)<.18)score-=7;
     raw.push({start:st,end:en,score:Math.max(1,Math.min(99,Math.round(score))),softHits,window:w});
   }}
   raw.sort((a,b)=>b.score-a.score||a.start-b.start);const chosen=[];for(const c of raw){if(chosen.every(x=>Math.abs(x.start-c.start)>=1200)){chosen.push(c);if(chosen.length===6)break}}return chosen
 }
 function liveFree(now=new Date()){
   const d=startOfDay(now),sec=now.getHours()*3600+now.getMinutes()*60+now.getSeconds(),wins=freeWindows(d);const w=wins.find(x=>sec>=x.start&&sec<x.end);if(!w)return null;return{...w,remaining:w.end-sec,now:sec}
 }
 function activeBlock(now=new Date()){const sec=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();return blocks(now).filter(b=>!b.soft&&sec>=b.start&&sec<b.end).sort((a,b)=>b.start-a.start)[0]||null}
 function nearestDateForDay(day,reference=selectedDate){const s=getSunday(reference);return addDays(s,day)}
 return{blocks,freeWindows,conflict,scoreCandidates,liveFree,activeBlock,nearestDateForDay,effectiveSeconds};
})();

function buildOccurrences(daysAhead=21){const base=getSunday(new Date()),out=[];for(let i=0;i<=daysAhead+6;i++){const d=addDays(base,i);lessonsForDate(d).filter(hasFixedTime).forEach(l=>out.push({lesson:l,date:d,start:timeDate(d,l.start)}))}return out.sort((a,b)=>a.start-b.start)}
function syncNativeReminders(){if(!NATIVE||typeof NATIVE.syncReminders!=='function')return;try{NATIVE.syncReminders(JSON.stringify(buildNativeReminders()))}catch{}}
function nextOccurrence(){const now=new Date();return buildOccurrences(21).find(x=>x.start>=new Date(now.getTime()-10*60000))||null}
function currentOrNextOccurrence(){
 const now=new Date(),today=startOfDay(now),candidates=[];
 for(const date of [addDays(today,-1),today])for(const lesson of lessonsForDate(date).filter(hasFixedTime)){
   const start=timeDate(date,lesson.start),end=new Date(start.getTime()+SmartScheduleEngine.effectiveSeconds(lesson)*1000);
   if(start<=now&&end>now)candidates.push({lesson,date,start,end,inProgress:true});
 }
 return candidates.sort((a,b)=>b.start-a.start)[0]||nextOccurrence();
}
