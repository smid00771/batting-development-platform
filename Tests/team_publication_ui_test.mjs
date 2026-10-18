import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const demo=fs.readFileSync(new URL('../demo.html',import.meta.url),'utf8');
let exercisedSource=source;
function get(name){const source=exercisedSource;const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(match,name);const start=match.index,next=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,start+1+next);}
const names=['seScorecardNote','seRevealPublication','sePublishReview','seWithSavedRoles','seShortTeams','seTeamNumbers','seDraftChanged','sePublishLabel','seNotice','sePersist','seRPC','seButtonWorking','seMutate','seLock','sePublishedDates','sePublishedWeekStart','seClubDate','sePublishedWeeks','sePublishedWeekLabel','seIsCaptain','seCanSetup','seBindPublishedActions','sePublished'];
for(const name of names.filter(name=>!['sePersist','seMutate'].includes(name)))assert.ok(demo.includes(get(name)),'Demo shares '+name);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Keep the fixtures in the current club week while using the real week-filter helpers.
class PublicationDate extends Date{
 constructor(...args){super(...(args.length?args:['2099-10-17T12:00:00Z']));}
 static now(){return new Date('2099-10-17T12:00:00Z').getTime();}
}
function harness({warn=true,short=false,failReload=false,badResponse=false,prepare=false}={}){
 const dom=new JSDOM('<main id="sePage"></main>',{url:'https://example.invalid'}),document=dom.window.document;
 const roster=Array.from({length:66},(_,i)=>({id:'p'+i,name:'Player '+i,user_id:'u'+i}));
 const fixtures=Array.from({length:6},(_,i)=>({id:'f'+i,revision:1,publication:0,published:null,details:{grade:'Grade '+i,opposition:'Visitors',days:[{date:'2099-10-17'}]},slots:Array.from({length:11},(_,j)=>({d1:short&&j===10?null:'p'+(i*11+j),d2:null})),issues:warn?[{level:'warning',text:'Role details incomplete'}]:[]}));
 const s={key:'head:club',view:'board',data:{fixtures,roster,admin:false,selector:true,captain:false,head_selector:true,socials:true,access:{timezone:'UTC'}},notice:'',busy:false,pending:null,undo:[]};
 let server=structuredClone(fixtures),publicationCount=0,socialLoads=0,shouldFail=failReload;
 const receipts=new Map(),requests=[],social={view:'awards',data:{fixtures:[]}};
 const ctx=vm.createContext({recordSelectionDrawer(){},queueMicrotask(){},bindSelectionBackButtons(){},document,Date:PublicationDate,structuredClone,Set,Number,JSON,Error,crypto:{randomUUID},sessionStorage:dom.window.sessionStorage,fixtureSessionStorage:dom.window.sessionStorage,
  session:{user:{id:'head'}},membership:{permission_role:'selector'},hasMatchCaptainAccess:()=>false,club:{id:'club',name:'Test Club'},selectionState:s,currentTab:'teams',ensureSelections:()=>s,selectionsScopeKey:()=>s.key,
  seEsc:esc,seDate:x=>x,seBoard:()=>{},seReviewLabel:()=> 'Captain checked',sePublicationChangeSummary:()=>'<p>Review lineup</p>',
  seFixtureLocked:()=>false,seCanRecordFixtureResults:()=>false,seGuardFixtureEdit:()=>true,sePrepareMatch:f=>prepare?{...f,details:{...f.details,prepared:true}}:f,
  seFormatLabel:()=> 'Limited overs',seSnapshotName:(snap,id)=>esc(snap.players.find(p=>p.id===id)?.name||'Vacant'),seSnapshotSplit:()=>false,sePublicationStamp:()=> 'Published version 1',
  confirmLeaveSelections:()=>true,socialEnsure:()=>social,refreshClubMessageBadge:()=>{},sePickerSaved:()=>{},
  supabase:{rpc:async(_,args)=>{const {p_action:action,p_data:data}=args;requests.push({action,data:structuredClone(data)});
   if(receipts.has(data.request_id))return {data:receipts.get(data.request_id)};
   if(action==='save_board'){server=server.map(f=>({...data.fixtures.find(x=>x.id===f.id)||f,revision:f.revision+1}));return {data:{saved:true}};}
   assert.equal(action,'publish');if(badResponse)return {data:{saved:true}};
   publicationCount++;server=server.map(f=>({...f,publication:1,published:{details:structuredClone(f.details),slots:structuredClone(f.slots),players:structuredClone(roster)}}));
   const result={published:true,recipients:7,groups:{added_memberships:12,unlinked_players:[],unmapped_grades:[]}};receipts.set(data.request_id,result);return {data:result};}},
  seReload:async()=>{if(shouldFail){shouldFail=false;throw Error('Connection lost while refreshing');}s.data.fixtures=structuredClone(server);return true;},
  drawSelections:()=>{document.getElementById('sePage').innerHTML='<p id="seNotice" tabindex="-1"></p><div id="seContent"></div>';ctx.seNotice(s.notice);if(s.view==='published')ctx.sePublished();else if(s.view==='socials'){socialLoads++;social.data.fixtures=structuredClone(server);document.getElementById('seContent').textContent='Fresh team graphics';}}
 });
 vm.runInContext(names.map(get).join('\n'),ctx);ctx.drawSelections();
 return {ctx,s,document,requests,social,publicationCount:()=>publicationCount,socialLoads:()=>socialLoads};
}

// The demo remains parked. Execute publication behavior in both versions instead of requiring an identical move-feedback implementation.
for(const candidate of [source,demo]){
exercisedSource=candidate;
// First action opens a focused review. Unacknowledged warnings explain the blocker beside the button.
const h=harness();await h.ctx.seWithSavedRoles(h.s.data.fixtures,h.ctx.sePublishReview);
assert.match(h.document.body.textContent,/Not published yet/);assert.equal(h.document.activeElement.id,'sePublishHeading');
assert.equal(h.document.querySelectorAll('details[open]').length,0,'Long team changes and warnings stay compact');
await h.document.getElementById('seConfirmPublish').onclick();assert.equal(h.requests.length,0);
assert.match(h.document.getElementById('sePublishStatus').textContent,/Tick the warnings/);assert.equal(h.document.activeElement.id,'sePublishStatus');
h.document.getElementById('seAcknowledge').checked=true;await h.document.getElementById('seConfirmPublish').onclick();
assert.equal(h.publicationCount(),1);assert.equal(h.s.view,'published');assert.equal(h.s.pending,null);
assert.match(h.document.getElementById('seNotice').textContent,/6 teams published.*Messages created for 7.*existing grades kept/);
assert.equal(h.document.querySelectorAll('.se-team-head').length,6);assert.equal(h.document.activeElement.id,'seNotice');
h.document.getElementById('sePublishedGraphics').click();assert.equal(h.s.view,'socials');assert.equal(h.social.view,'graphics');assert.equal(h.socialLoads(),1);assert.equal(h.social.data.fixtures.length,6);assert.equal(h.social.date,'2099-10-17');assert.equal(h.social.selected.size,6);

// Preparing default roles still opens review; a draft save is never reported as publication.
const prepared=harness({prepare:true});await prepared.ctx.seWithSavedRoles(prepared.s.data.fixtures,prepared.ctx.sePublishReview);
assert.deepEqual(prepared.requests.map(r=>r.action),['save_board']);assert.equal(prepared.publicationCount(),0);assert.match(prepared.document.body.textContent,/Not published yet/);

// A committed publication with a lost refresh retries the same request; no duplicate delivery.
const retry=harness({warn:false,failReload:true});retry.ctx.sePublishReview(retry.s.data.fixtures);await retry.document.getElementById('seConfirmPublish').onclick();
assert.equal(retry.publicationCount(),1);assert.ok(retry.s.pending);assert.match(retry.document.getElementById('seNotice').textContent,/Save not confirmed/);assert.equal(retry.document.activeElement.id,'seNotice');
const requestId=retry.s.pending.data.request_id;await retry.ctx.seMutate(retry.s.pending.action,retry.s.pending.data);
assert.equal(retry.requests[1].data.request_id,requestId);assert.equal(retry.publicationCount(),1);assert.equal(retry.s.pending,null);assert.equal(retry.s.view,'published');

// Short teams remain an explicit decision; hard errors and non-head users cannot publish.
const short=harness({warn:false,short:true});short.ctx.sePublishReview(short.s.data.fixtures);await short.document.getElementById('seConfirmPublish').onclick();assert.equal(short.requests.length,0);assert.match(short.document.getElementById('sePublishStatus').textContent,/vacant places/);
short.document.querySelectorAll('[data-se-ack-short]').forEach(el=>el.checked=true);await short.document.getElementById('seConfirmPublish').onclick();assert.equal(short.requests[0].data.acknowledge_short.length,6);
const denied=harness();denied.s.data.head_selector=false;denied.ctx.sePublishReview(denied.s.data.fixtures);assert.equal(denied.document.getElementById('seConfirmPublish').disabled,true);assert.match(denied.document.body.textContent,/Only the current Head/);
denied.s.data.head_selector=true;denied.s.data.fixtures[0].issues.push({level:'error',text:'Player unavailable'});denied.ctx.sePublishReview(denied.s.data.fixtures);assert.equal(denied.document.getElementById('seConfirmPublish').disabled,true);assert.match(denied.document.body.textContent,/Fix these issues/);
const bad=harness({warn:false,badResponse:true});bad.ctx.sePublishReview(bad.s.data.fixtures);await bad.document.getElementById('seConfirmPublish').onclick();assert.ok(bad.s.pending);assert.equal(bad.s.view,'board');assert.match(bad.document.getElementById('seNotice').textContent,/Publication was not confirmed/);
}
for(const script of demo.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
console.log('Team publication review, feedback, Teams, graphics handoff and idempotent retry checks passed.');
