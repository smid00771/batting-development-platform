const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8');
const demo=fs.readFileSync(path.join(__dirname,root,'demo.html'),'utf8');
const section=(text,start,end)=>{
  const a=text.indexOf(start),b=text.indexOf(end,a);
  assert.ok(a>=0&&b>a,'Expected application function boundaries');
  return text.slice(a,b);
};
const importer=text=>section(text,'function matchReviewImportState(){','function matchReviewImportCommand(){');
const locks=section(app,'function teamReviewSavePending(){','function confirmLeaveTeamReview(){');
const url='https://play.cricket.com.au/match/00000000-0000-4000-8000-000000000001';
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

// Exercise the real render, input binding and load functions. DOM controls and
// remote responses are simulated; these are not live-device or API tests.
function setup(overrides={}){
  const s={scope:'test-club:test-coach',group:'first-grade',sessionId:'saved-review',
    reviewCanEdit:true,editReview:false,loading:false,saving:false,pending:null,
    match_date:'2026-10-10',innings_number:1,drafts:{p1:{batting_to_plan:'mostly'}},...overrides};
  const calls=[],renders=[];let elements=new Map(),c;
  function render(){
    const html=c.renderMatchReviewImporter();elements=new Map();
    for(const tag of html.matchAll(/<(?:input|button|select)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
      const listeners={};
      elements.set(tag[1],{disabled:/\sdisabled(?:\s|>)/.test(tag[0]),
        value:tag[0].match(/\bvalue="([^"]*)"/)?.[1]||'',
        addEventListener:(event,fn)=>{listeners[event]=fn;},listeners});
    }
    c.bindMatchReviewImporter();
    renders.push({loading:s.loading,inputDisabled:elements.get('matchScorecardUrl').disabled});
    return html;
  }
  c=vm.createContext({teamReviewState:s,ensureTeamReviewState:()=>s,teamReviewRows:()=>[],
    esc:escape,formatDateShort:x=>x,todayIso:()=> '2026-10-12',currentTab:'team_review',
    club:{id:'test-club'},confirm:()=>true,renderTeamReviewContent:render,
    document:{getElementById:id=>elements.get(id),querySelectorAll:()=>[]},
    supabase:{functions:{invoke:async(name,args)=>{calls.push({name,args});return {data:{snapshot_id:'preview-only'}};}},
      rpc:async(name,args)=>{calls.push({name,args});return {data:{snapshot_id:'preview-only',player_links:[],
        scorecard:{url,teams:[{id:'ours',name:'Example CC'},{id:'theirs',name:'Visitors'}],
          dates:['2026-10-10'],grade:'First XI',format_label:'Limited Overs',innings:[]}}};}}});
  vm.runInContext(locks+importer(app),c);
  render();
  return {s,c,calls,renders,render,element:id=>elements.get(id),enter:value=>{
    const input=elements.get('matchScorecardUrl');
    assert.equal(input.disabled,false,'The match link must accept typing/pasting');
    input.value=value;input.listeners.input({target:input});
  }};
}

test('a saved editable review accepts typing and a pasted link before Edit review is selected',()=>{
  const h=setup();
  assert.equal(h.element('loadMatchScorecard').disabled,false);
  h.enter('https://play.cricket.com.au/');
  assert.equal(h.c.matchReviewImportState().url,'https://play.cricket.com.au/');
  h.enter(url);assert.equal(h.c.matchReviewImportState().url,url);
  assert.equal(h.s.editReview,false);
});

test('loading the entered link opens a preview and preserves existing review choices without saving',async()=>{
  const h=setup(),drafts=h.s.drafts;
  h.enter(url);await h.element('loadMatchScorecard').listeners.click();
  assert.equal(h.calls[0].name,'playcricket-scorecard');
  assert.equal(h.calls[0].args.body.url,url);
  assert.deepEqual(h.calls.map(x=>x.name),['playcricket-scorecard','get_match_review_scorecard']);
  assert.equal(h.s.drafts,drafts);assert.equal(h.s.drafts.p1.batting_to_plan,'mostly');
  assert.equal(h.s.editReview,true);assert.equal(h.s.loading,false);
  assert.ok(h.renders.some(x=>x.loading&&x.inputDisabled));
  assert.equal(h.element('matchScorecardUrl').disabled,false);
});

test('another author’s non-editable review cannot enter or load a scorecard',async()=>{
  const h=setup({reviewCanEdit:false});
  assert.equal(h.element('matchScorecardUrl').disabled,true);
  assert.equal(h.element('loadMatchScorecard').disabled,true);
  await h.c.loadMatchReviewScorecard();assert.equal(h.calls.length,0);
});

test('loading, saving and unresolved save states keep both scorecard controls locked',async()=>{
  for(const state of [{loading:true},{saving:true},{pending:{request_id:'pending'}},
    {rosterPending:{}},{deletePending:{}},{observation:{pending:{}}}]){
    const h=setup(state);
    assert.equal(h.element('matchScorecardUrl').disabled,true);
    assert.equal(h.element('loadMatchScorecard').disabled,true);
    await h.c.loadMatchReviewScorecard();assert.equal(h.calls.length,0);
  }
});

test('a new review and an explicitly edited saved review still accept the link',()=>{
  for(const state of [{sessionId:null,editReview:true},{editReview:true}]){
    const h=setup(state);h.enter(url);
    assert.equal(h.c.matchReviewImportState().url,url);
    assert.equal(h.element('loadMatchScorecard').disabled,false);
  }
});

test('the public demo retains the same scorecard input and loading implementation',()=>{
  assert.equal(importer(app),importer(demo));
});
