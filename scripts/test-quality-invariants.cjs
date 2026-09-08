const assert=require('node:assert/strict');
const {createMiaadDomain}=require('../app/src/main/assets/app-domain.js');

let now=new Date('2026-09-30T12:00:00');
const clock=()=>new Date(now);
const make=(seed={},legacy={})=>createMiaadDomain(seed,legacy,clock);
const pad=n=>String(n).padStart(2,'0');
const date=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;

// 1) Calendar and rolling-period boundaries across leap/non-leap years.
{
  const d=make();
  for(let y=2024;y<=2032;y++)for(let m=1;m<=12;m++){
    const last=new Date(y,m,0).getDate();
    for(const day of [1,Math.min(15,last),last]){
      const b=d.periodBounds(date(y,m,day),'calendar',1);
      assert.equal(b.start,date(y,m,1));
      assert.equal(b.end,date(y,m,last));
    }
  }
  for(const anchor of [1,15,28,29,30,31]){
    let start='2026-01-31';
    for(let i=0;i<18;i++){
      const b=d.periodBounds(start,'monthly',anchor);
      assert.equal(b.start,start);
      assert.ok(b.end>=b.start);
      const next=d.plus(b.end,1);
      assert.equal(d.plus(b.end,1),next);
      start=next;
    }
  }
}

// 2) Validation must reject malformed targets, dates, states and future attendance.
{
  const d=make(),s=d.saveStudent({name:'Validation',startDate:'2026-09-01'});
  for(const target of [0,-1,1.5,NaN,Infinity])assert.throws(()=>d.setTarget(s.id,target));
  assert.throws(()=>d.record({studentId:s.id,date:'2026-02-30',time:'10:00',duration:30,status:'entered'}));
  assert.throws(()=>d.record({studentId:s.id,date:'2026-09-01',time:'24:01',duration:30,status:'entered'}));
  assert.throws(()=>d.record({studentId:s.id,date:'2026-09-01',time:'10:00',duration:-1,status:'entered'}));
  assert.throws(()=>d.record({studentId:s.id,date:'2026-09-01',time:'10:00',duration:30,status:'bogus'}));
  assert.throws(()=>d.record({studentId:s.id,date:'2026-10-01',time:'10:00',duration:30,status:'entered'}));
  assert.doesNotThrow(()=>d.record({studentId:s.id,date:'2026-10-01',time:'10:00',duration:30,status:'pending'}));
}

// 3) Statistics must equal the records' explicit states; no attendance inference.
{
  const d=make(),s=d.saveStudent({name:'Stats',startDate:'2026-09-01'});
  const states=['entered','absent','student_cancelled','missed','notheld','rescheduled','makeup','pending'];
  const rows=[];
  states.forEach((status,i)=>rows.push(d.record({studentId:s.id,date:`2026-09-${pad(i+1)}`,time:`0${i}:00`.slice(-5),duration:30,status,actualMinutes:status==='entered'?25:undefined})));
  const st=d.stats(rows);
  assert.equal(st.scheduled,8);
  assert.equal(st.attended,2);
  assert.equal(st.absent,1);
  assert.equal(st.cancelled,3);
  assert.equal(st.rescheduled,1);
  assert.equal(st.makeup,1);
  assert.equal(st.counted,3); // entered + absent + makeup under defaults
  assert.equal(st.minutes,55); // entered 25 + makeup 30
  const absent=rows.find(r=>r.status==='absent');
  d.record({...absent,countOverride:false});
  assert.equal(d.stats(Object.values(d.data.records)).counted,2);
  d.record({...absent,countOverride:true});
  assert.equal(d.stats(Object.values(d.data.records)).counted,3);
  d.removeRecord(rows.find(r=>r.status==='makeup'));
  assert.equal(d.stats(Object.values(d.data.records)).attended,1);
}

// 4) Duplicate lesson identity cannot be silently created at the same student/date/time.
{
  const d=make(),s=d.saveStudent({name:'Duplicate',startDate:'2026-09-01'});
  d.record({studentId:s.id,date:'2026-09-10',time:'17:00',duration:30,status:'entered'});
  assert.throws(()=>d.record({studentId:s.id,date:'2026-09-10',time:'17:00',duration:30,status:'absent'}));
}

// 5) Cycle boundaries, reversal and notification de-duplication for configurable targets.
for(const target of [1,12,22]){
  const d=make(),s=d.saveStudent({name:`Cycle ${target}`,startDate:'2026-09-01'});d.setTarget(s.id,target);const c=d.cycle(s.id),rows=[];
  for(let i=0;i<target;i++)rows.push(d.record({studentId:s.id,date:d.plus('2026-09-01',i),time:'09:00',duration:30,status:'entered'}));
  assert.equal(d.cycleStats(c).counted,target);
  for(let i=0;i<20;i++)d.notifications();
  assert.equal(Object.values(d.data.notifications).filter(n=>n.type==='cycle'&&n.studentId===s.id).length,1);
  d.record({...rows.at(-1),status:'student_cancelled'});
  d.notifications();assert.equal(d.cycleStats(c).counted,target-1);assert.equal(d.data.notifications['cycle:'+c.id].active,false);
  d.record({...rows.at(-1),status:'entered'});d.notifications();assert.equal(d.cycleStats(c).counted,target);
  assert.equal(Object.values(d.data.notifications).filter(n=>n.type==='cycle'&&n.studentId===s.id).length,1);
}

// 6) Archived period is immune to schedule edits but deliberate attendance correction updates it.
{
  now=new Date('2026-09-15T12:00:00');
  const d=make(),s=d.saveStudent({name:'Archive',startDate:'2026-09-01'});
  d.saveSchedule({id:'weekly-a',studentId:s.id,name:s.name,day:2,start:'17:00',duration:30,repeat:'weekly'},'2026-09-15');
  const r=d.record({id:'manual-a',studentId:s.id,name:s.name,date:'2026-09-10',time:'11:00',duration:30,status:'entered'});
  const p=d.createPeriod(s.id,'2026-09-01','2026-09-30','custom');d.archive(p);const before=JSON.stringify(d.report(p));
  d.saveSchedule({id:'weekly-a',studentId:s.id,name:s.name,day:2,start:'18:30',duration:45,repeat:'weekly'},'2026-09-15');
  assert.equal(JSON.stringify(d.report(p)),before);
  d.record({...r,status:'absent'});
  assert.equal(d.report(p).rows.find(x=>x.id===r.id).status,'absent');
}

// 7) Legacy migration is idempotent and preserves historical schedule facts.
{
  now=new Date('2026-09-15T10:00:00');
  const legacy={lessons:[{id:'legacy-weekly',name:'طالب قديم',day:2,start:'17:00',duration:30,repeat:'weekly'}],sessionState:{'2026-09-08__legacy-weekly':'entered'},sessionNotes:{'2026-09-08__legacy-weekly':'ملاحظة قديمة'},idrisPhase:0};
  const d=make({},legacy),s=Object.values(d.data.students)[0];
  assert.equal(d.occurrences('2026-09-08',s.id)[0].time,'17:00');
  assert.equal(d.occurrences('2026-09-08',s.id)[0].note,'ملاحظة قديمة');
  const snapshot=JSON.parse(JSON.stringify(d.data));
  const again=createMiaadDomain(snapshot,legacy,clock);
  assert.equal(Object.keys(again.data.records).length,Object.keys(snapshot.records).length);
  assert.equal(Object.keys(again.data.schedules).length,Object.keys(snapshot.schedules).length);
}

// 8) Availability windows must be sorted, non-overlapping, within the day and at least minSlot.
{
  now=new Date('2026-09-15T10:00:00');
  const d=make(),s=d.saveStudent({name:'Availability invariant',startDate:'2026-09-01'}),cfg=d.copy(d.data.settings);
  cfg.working[2]=[['08:00','23:30']];cfg.blocked=[{day:2,start:'09:15',end:'10:00'},{date:'2026-09-15',start:'18:00',end:'19:15'}];cfg.buffer=15;cfg.minSlot=30;d.saveSettings(cfg);
  d.record({studentId:s.id,date:'2026-09-15',time:'11:00',duration:45,status:'pending'});
  d.record({studentId:s.id,date:'2026-09-15',time:'20:00',duration:60,status:'entered'});
  const hard=d.occupied('2026-09-15').hard,wins=d.availability('2026-09-15');
  for(let i=0;i<wins.length;i++){
    const w=wins[i];assert.ok(w.start>=0&&w.end<=1440&&w.end>w.start);assert.ok(w.end-w.start>=cfg.minSlot);
    if(i)assert.ok(wins[i-1].end<=w.start);
    assert.ok(!hard.some(h=>Math.max(h.start,w.start)<Math.min(h.end,w.end)));
  }
  cfg.working[2]=[['22:00','02:00']];cfg.working[3]=[];cfg.blocked=[];cfg.buffer=0;d.saveSettings(cfg);
  assert.deepEqual(d.availability('2026-09-16').map(w=>[w.start,w.end]),[[0,120]]);
}

// 9) Merge conflict resolution must keep newer objects and never duplicate activity IDs.
{
  now=new Date('2026-09-20T10:00:00');
  const d=make(),s=d.saveStudent({id:'s-merge',name:'Local',startDate:'2026-09-01'});
  s.updatedAt='2026-09-20T10:00:00.000Z';
  const localActivity={id:'a-fixed',type:'x',studentId:s.id,detail:{source:'local'},at:'2026-09-20T10:00:00.000Z'};d.data.activity=[localActivity];
  d.merge({students:{'s-merge':{...s,name:'Older remote',updatedAt:'2026-09-19T10:00:00.000Z'}},activity:[localActivity]});
  assert.equal(d.data.students['s-merge'].name,'Local');assert.equal(d.data.activity.filter(x=>x.id==='a-fixed').length,1);
  d.merge({students:{'s-merge':{...s,name:'Newer remote',updatedAt:'2026-09-21T10:00:00.000Z'}}});
  assert.equal(d.data.students['s-merge'].name,'Newer remote');
}

console.log('QUALITY INVARIANTS PASS: validation, calendars, stats, duplicate prevention, configurable cycles, notifications, archive semantics, migration, availability and merge ordering.');
