const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('async function socialReviewUpdatedAward(s,edition){');
const end=source.indexOf('\nfunction socialAdoptResultsWeek(',start);
assert.ok(start>=0&&end>start);
const helper=source.slice(start,end);
function setup(kind='team_week',existing={}){
 const key=kind==='team_week'?'week':'playerWeek',loads=[],prompts=[],s={view:'award_collection',[key]:{end:'2026-10-04',context:{design:{revision:3}},rows:[],...existing}};
 const moduleFor=name=>({state:x=>x[name]||=({end:'2026-10-18',context:null,rows:[],layout:{},title:'',blurb:''}),load:(x,options)=>{loads.push({kind:name,end:x[name].end,options});x[name].context={};}});
 const context={socialAdoptResultsWeek:(s,end)=>{s.resultsWeek=end;s[key].end=end;},socialHere:()=>true,socialCanLeave:()=>true,socialAwardScopes:{review:async(s,k,scope)=>{s.openedScope=scope||{key:'all'};}},socialMessage:(_,m)=>{throw Error(m);},socialAwards:moduleFor('awards'),socialWeek:moduleFor('week'),socialPlayerWeek:moduleFor('playerWeek'),confirm:message=>{prompts.push(message);return context.accept;},accept:true};
 context.socialDraw=x=>{const name=x.view==='team_week'?'week':'playerWeek';if(!x[name].context)context[name==='week'?'socialWeek':'socialPlayerWeek'].load(x);};
 vm.createContext(context);vm.runInContext(helper,context);
 return {s,key,loads,prompts,context,open:()=>context.socialReviewUpdatedAward(s,{kind,week_end:'2026-10-11'})};
}
for(const kind of ['team_week','player_week']){
 test(kind+' opens the edition week and requests its scores',async()=>{const t=setup(kind);assert.equal(await t.open(),true);assert.equal(t.s[t.key].end,'2026-10-11');assert.equal(t.s.view,kind);assert.equal(t.loads.length,1);assert.equal(t.loads[0].end,'2026-10-11');});
 for(const draft of [{designDirty:true},{layoutDirty:true},{rows:[{key:'chosen-player'}]},{winner:{key:'winner'}},{blurb:'Our round'}])test(kind+' preserves a different-week draft when opening is cancelled: '+Object.keys(draft)[0],async()=>{const t=setup(kind,draft),before=t.s[t.key];t.context.accept=false;assert.equal(await t.open(),false);assert.equal(t.s[t.key],before);assert.equal(t.s.view,'award_collection');assert.equal(t.loads.length,0);assert.equal(t.prompts.length,1);});
 test(kind+' refreshes same-week choices and layout with preservation',async()=>{const t=setup(kind,{end:'2026-10-11',designDirty:true,layoutDirty:true,rows:[{key:'chosen-player'}],winner:{key:'winner'},blurb:'Keep me'}),before=t.s[t.key];assert.equal(await t.open(),true);assert.equal(t.s[t.key],before);assert.equal(t.prompts.length,0);assert.equal(t.loads[0].options.preserve,true);assert.equal(t.loads[0].end,'2026-10-11');});
 test(kind+' does not leave an unconfirmed save',async()=>{const t=setup(kind);t.context.socialCanLeave=()=>false;const before=t.s[t.key];assert.equal(await t.open(),false);assert.equal(t.s[t.key],before);assert.equal(t.loads.length,0);});
}
test('production initializer uses the exact-week hook and weekly APIs expose existing load',async()=>{assert.match(source,/createSocialAwards\(\{[^\n]*reviewUpdatedAward:socialReviewUpdatedAward,/);for(const [file,factory] of [['team-of-week.js','createTeamOfWeek'],['player-of-week.js','createPlayerOfWeek']]){const module=await import('../'+file);assert.equal(typeof module[factory]({}).load,'function');}});

test('changing the shared awards week clears per-graphic labels without changing reusable styles',()=>{
 const begin=source.indexOf('function socialAdoptResultsWeek(s,end){'),finish=source.indexOf('\nasync function socialResultsChanged(',begin),states=['awards','week','playerWeek'];
 const s=Object.fromEntries(states.map(key=>[key,{end:'2026-10-18',title:'Round 2',layout:{text_colour:'#FFFFFF'},graphicAssistant:{candidate:false}}]));
 const context={socialAwards:{state:s=>s.awards},socialWeek:{state:s=>s.week},socialPlayerWeek:{state:s=>s.playerWeek}};vm.createContext(context);vm.runInContext(source.slice(begin,finish),context);
 context.socialAdoptResultsWeek(s,'2026-10-25');for(const key of states){assert.equal(s[key].title,'');assert.equal(s[key].end,'2026-10-25');assert.equal(s[key].layout.text_colour,'#FFFFFF');assert.equal(s[key].graphicAssistant,null);}
});

test('reviewing another saved scope opens that scope and resets current selections',async()=>{const t=setup('team_week',{end:'2026-10-11',context:{award_scope:{key:'all'}},rows:[{key:'old'}]});const scope={key:'groups:masters',mode:'groups',ids:['masters']};assert.equal(await t.context.socialReviewUpdatedAward(t.s,{kind:'team_week',week_end:'2026-10-11',award_scope:scope}),true);assert.equal(t.s.openedScope,scope);assert.equal(t.s.week.rows.length,0);assert.equal(t.loads[0].options.preserve,false);});
