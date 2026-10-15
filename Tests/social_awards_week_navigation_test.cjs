const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const start=source.indexOf('function socialReviewUpdatedAward(s,edition){');
const end=source.indexOf('\nconst socialAwards=createSocialAwards(',start);
assert.ok(start>=0&&end>start);
const helper=source.slice(start,end);
function setup(kind='team_week',existing={}){
 const key=kind==='team_week'?'week':'playerWeek',loads=[],prompts=[],s={view:'award_collection',[key]:{end:'2026-10-04',context:{design:{revision:3}},rows:[],...existing}};
 const moduleFor=name=>({state:x=>x[name]||=({end:'2026-10-18',context:null,rows:[],layout:{},title:'',blurb:''}),load:(x,options)=>loads.push({kind:name,end:x[name].end,options})});
 const context={socialHere:()=>true,socialCanLeave:()=>true,socialWeek:moduleFor('week'),socialPlayerWeek:moduleFor('playerWeek'),confirm:message=>{prompts.push(message);return context.accept;},accept:true};
 context.socialDraw=x=>{const name=x.view==='team_week'?'week':'playerWeek';if(!x[name].context)context[name==='week'?'socialWeek':'socialPlayerWeek'].load(x);};
 vm.createContext(context);vm.runInContext(helper,context);
 return {s,key,loads,prompts,context,open:()=>context.socialReviewUpdatedAward(s,{kind,week_end:'2026-10-11'})};
}
for(const kind of ['team_week','player_week']){
 test(kind+' opens the edition week and requests its scores',()=>{const t=setup(kind);assert.equal(t.open(),true);assert.equal(t.s[t.key].end,'2026-10-11');assert.equal(t.s.view,kind);assert.equal(t.loads.length,1);assert.equal(t.loads[0].end,'2026-10-11');});
 for(const draft of [{designDirty:true},{layoutDirty:true},{rows:[{key:'chosen-player'}]},{winner:{key:'winner'}},{blurb:'Our round'}])test(kind+' preserves a different-week draft when opening is cancelled: '+Object.keys(draft)[0],()=>{const t=setup(kind,draft),before=t.s[t.key];t.context.accept=false;assert.equal(t.open(),false);assert.equal(t.s[t.key],before);assert.equal(t.s.view,'award_collection');assert.equal(t.loads.length,0);assert.equal(t.prompts.length,1);});
 test(kind+' refreshes same-week choices and layout with preservation',()=>{const t=setup(kind,{end:'2026-10-11',designDirty:true,layoutDirty:true,rows:[{key:'chosen-player'}],winner:{key:'winner'},blurb:'Keep me'}),before=t.s[t.key];assert.equal(t.open(),true);assert.equal(t.s[t.key],before);assert.equal(t.prompts.length,0);assert.equal(t.loads[0].options.preserve,true);assert.equal(t.loads[0].end,'2026-10-11');});
 test(kind+' does not leave an unconfirmed save',()=>{const t=setup(kind);t.context.socialCanLeave=()=>false;const before=t.s[t.key];assert.equal(t.open(),false);assert.equal(t.s[t.key],before);assert.equal(t.loads.length,0);});
}
test('production initializer uses the exact-week hook and weekly APIs expose existing load',()=>{assert.match(source,/createSocialAwards\(\{reviewUpdatedAward:socialReviewUpdatedAward,/);for(const file of ['team-of-week.js','player-of-week.js'])assert.match(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),/return \{render,state,load\};/);});
