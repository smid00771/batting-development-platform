const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('demo.html','utf8');const extract=name=>{const start=source.indexOf('function '+name+'('),rest=source.slice(start),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);};
function setup(){
 const details=(grade,date)=>({competition:'District',season:'2026',format:'long_form',grade,days:[{date}],captain_id:'cap'}),old={id:'prior',details:details('1st Grade','2026-10-10')};old.published={details:old.details,slots:['out','down','ongoing','unknown','unavailable'].map(d1=>({d1}))};
 const state={access:{head_selector_id:'head'},selectors:[],roster:['out','down','ongoing','unknown','unavailable'].map(id=>({id,name:id,active:true,availability:{available_dates:['out','down','ongoing'].includes(id)?['2026-10-17']:[],unavailable_dates:id==='unavailable'?['2026-10-17']:[]}})),fixtures:[old,{id:'first',details:details('1st Grade','2026-10-17'),slots:[]},{id:'second',details:details('2nd Grade','2026-10-17'),slots:[{d1:'down'}]},{id:'continuing',details:{...details('3rd Grade','2026-10-10'),days:[{date:'2026-10-10'},{date:'2026-10-17'}]},slots:[{d1:'ongoing',d2:'ongoing'}]}]};
 old.slots=old.published.slots;
 const c=vm.createContext({demoSelections:state,fixtureRows:{club_memberships:[{club_id:'club',user_id:'head',permission_role:'none'},{club_id:'club',user_id:'cap',permission_role:'captain'},{club_id:'club',user_id:'other',permission_role:'captain'},{club_id:'club',user_id:'coach',permission_role:'coach'},{club_id:'club',user_id:'player',permission_role:'none'}]},club:{id:'club'},demoCaptainUsers:d=>d.captain_id?[d.captain_id]:[],seGradeLevel:(comp,grade)=>parseInt(grade)||null,seDayStatus:(p,d)=>p.availability.available_dates.includes(d.date)?'available':'unknown',Date});
 vm.runInContext(extract('demoConversations'),c);return {c,state,old};
}
test('Demo follow-up agrees with database cases: lower grade, omitted, unknown, unavailable and ongoing two-day',()=>{
 const {c}=setup(),rows=c.demoConversations('head').filter(x=>x.date==='2026-10-17');assert.equal(rows.length,4);assert.deepEqual(Array.from(rows.filter(x=>x.kind==='left_out'),x=>[x.roster_id,x.availability]).sort(),[['out','available'],['unavailable','unavailable'],['unknown','unknown']]);assert.equal(rows.filter(x=>x.roster_id==='down').length,1);assert.equal(rows.some(x=>x.roster_id==='ongoing'),false);
});
test('Previous captain and coach retain shared markers; unrelated captain and player cannot read them',()=>{
 const {c,state}=setup(),move=c.demoConversations('cap').find(x=>x.roster_id==='out');state.conversation_status={[move.fixture_id+':out:'+move.movement_key]:{spoken_at:'2026-10-17T01:00:00Z',spoken_by:'Captain',revision:1}};assert.equal(c.demoConversations('coach').find(x=>x.roster_id==='out').spoken_by,'Captain');assert.equal(c.demoConversations('other').length,0);assert.equal(c.demoConversations('player').length,0);
});
test('Reselecting removes omission, inactive roster entries stay out, and washed-out previous games do not count',()=>{
 const {c,state,old}=setup();state.fixtures[1].slots.push({d1:'out'});assert.equal(c.demoConversations('cap').some(x=>x.kind==='left_out'&&x.roster_id==='out'),false);state.roster.find(p=>p.id==='unknown').active=false;assert.equal(c.demoConversations('cap').some(x=>x.kind==='left_out'&&x.roster_id==='unknown'),false);old.no_play='washed_out';assert.equal(c.demoConversations('cap').filter(x=>x.kind==='left_out').length,0);
});
