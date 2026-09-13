import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const app=document.getElementById('app');

let session=null;
let club=null;
let membership=null;
let userProfile=null;
let clubProfile={};
let dimensions=[];
let selectedDims=new Map();
let weights=new Map();
let myPlayer=null;
let workflow=null;
let currentTab='identity';
let previewFormat='limited_overs';
let builderSection='core';

const FORMATS=[
  ['t20','T20'],
  ['limited_overs','Limited Overs'],
  ['long_form','Long Form']
];

const WEIGHT_LABELS=['Not used','Low','Medium','High','Very High'];

const IDENTITY_OPTIONS=[
 ['strong_decisions','Make strong decisions','Judge each situation well rather than chasing outcomes.'],
 ['play_strengths','Play to their strengths','Build a method around what the individual batter genuinely owns.'],
 ['adapt','Adapt to conditions','Change method when pitch, bowling, field or match situation changes.'],
 ['commit','Commit to decisions','Once the decision is made, execute it positively.'],
 ['partnerships','Build partnerships','Understand that batting is a shared problem between two players.'],
 ['pressure','Put bowlers under pressure','Look for ways to make the bowler and captain keep solving problems.'],
 ['smart_risk','Manage risk intelligently','Understand when risk is justified rather than treating all aggression equally.'],
 ['composure','Stay composed','Recognise emotional drift and reset quickly.'],
 ['wicket_value','Value their wicket','Treat dismissal as a significant team cost while still looking to score.'],
 ['intent','Bat with intent','Have a clear purpose rather than simply surviving deliveries.']
];

const DEFAULT_WEIGHTS={
 wicket_preservation:{t20:2,limited_overs:3,long_form:4},
 leaving_defending:{t20:0,limited_overs:1,long_form:4},
 strike_rotation:{t20:3,limited_overs:4,long_form:2},
 boundary_access:{t20:4,limited_overs:3,long_form:2},
 running:{t20:3,limited_overs:4,long_form:2},
 scoring_areas:{t20:4,limited_overs:3,long_form:3},
 tempo:{t20:4,limited_overs:4,long_form:2},
 matchups:{t20:4,limited_overs:3,long_form:1},
 spin_method:{t20:3,limited_overs:3,long_form:3},
 pace_method:{t20:3,limited_overs:3,long_form:3},
 risk_management:{t20:4,limited_overs:4,long_form:4},
 reset_routines:{t20:3,limited_overs:3,long_form:3},
 dot_ball_management:{t20:4,limited_overs:3,long_form:1},
 powerplay:{t20:4,limited_overs:3,long_form:0},
 death_overs:{t20:4,limited_overs:3,long_form:0},
 innovation:{t20:3,limited_overs:2,long_form:1},
 patience:{t20:1,limited_overs:2,long_form:4},
 partnerships:{t20:2,limited_overs:4,long_form:4}
};

const QUESTION_LIBRARY={
  core_strengths:{
    label:'My trusted scoring options',
    why:'Choose the options that genuinely feel like part of your game. This is not a wish list.',
    options:['Straight drive','Cover drive','On drive','Clip / flick','Cut','Pull','Hook','Sweep','Reverse sweep','Use feet to spin','Loft straight','Loft leg side','Ramp / scoop','Run hard into gaps']
  },
  core_danger:{
    label:'What most often takes you away from your plan?',
    why:'Pick the danger signs you recognise in your own batting.',
    options:['Driving too early','Chasing width','Forcing after dot balls','Getting stuck defending','Playing across the straight ball','Trying to hit too hard','Predetermining the shot','Losing concentration','Getting too passive','Getting too aggressive']
  },
  core_reset:{
    label:'What helps you reset?',
    why:'Choose cues you could genuinely use in the middle, not what sounds good on paper.',
    options:['Take guard again','Slow breath + cue word','Step away and restart routine','Re-check the field','Re-state my scoring plan','Talk to my partner','Focus only on the next ball','Relax grip / shoulders','Watch the ball earlier','Return to one trusted option']
  },
  core_focus:{
    label:'What are you working on right now?',
    why:'Choose one or two development priorities. The coach can refine these with you.',
    options:['Decision making','Strike rotation','Scoring against pace','Scoring against spin','Short-ball scoring','Full-ball scoring','Leaving','Defence','Running between wickets','Boundary options','Tempo','Mental routine','Footwork','Balance / shape']
  },

  wicket_preservation:{
    label:'How should you protect your wicket in this format?',
    options:['Make the bowler earn the wicket','Avoid low-percentage options','Build before expanding','Accept good dot balls','Choose risk by match situation','Trust defence when needed','Value partnership stability']
  },
  leaving_defending:{
    label:'What does good leaving / defending look like for you?',
    options:['Leave confidently outside off','Defend late under the eyes','Use soft hands','Play straight','Trust the ball to go past','Keep hands close to body','Defend with balance','Accept the dot when the ball earns it']
  },
  strike_rotation:{
    label:'How do you keep the scoreboard moving?',
    options:['Clip into leg side','Drop into cover','Push to mid-on / mid-off','Use soft hands into point','Use feet to spin for one','Sweep for one','Run hard on misfields','Turn ones into twos','Look for the single before the ball']
  },
  boundary_access:{
    label:'Which boundary options do you genuinely trust?',
    options:['Straight','Through cover','Behind point','Square leg','Mid-wicket','Fine leg','Pull / hook','Sweep','Use feet and loft straight','Loft over mid-wicket','Ramp / scoop','Hit over extra cover']
  },
  running:{
    label:'How do you create pressure with running?',
    options:['Sharp first run','Call early and loudly','Turn ones into twos','Pressure fielders','Back up hard','Look for overthrows','Run hard even when boundary is possible','Use partner communication']
  },
  scoring_areas:{
    label:'Where are your strongest scoring areas?',
    options:['Straight V','Cover','Extra cover','Point','Behind point','Square leg','Mid-wicket','Fine leg','Long-on / long-off','Behind square leg']
  },
  tempo:{
    label:'How do you want to manage tempo?',
    options:['Settle before expanding','Keep strike rotating','Increase intent after getting in','Respond to required rate','Use wickets in hand','Target particular overs','Reset after wickets','Build in partnerships','Accelerate deliberately rather than emotionally']
  },
  matchups:{
    label:'Which matchups suit you best?',
    options:['Fast pace','Medium pace','Left-arm pace','Right-arm pace','Off-spin','Leg-spin','Left-arm orthodox','Short-pitched bowling','Full bowling','Bowling into the pads']
  },
  spin_method:{
    label:'Which methods against spin are genuinely yours?',
    options:['Use feet','Sweep','Reverse sweep','Play from crease','Go deep in crease','Rotate into leg side','Rotate into off side','Hit straight','Use lofted option','Wait for bad ball','Manipulate field']
  },
  pace_method:{
    label:'Which methods against pace are genuinely yours?',
    options:['Score from width','Clip the pads','Drive only when full enough','Pull the short ball','Leave outside off','Defend good length','Use pace behind square','Hit straight','Rotate into gaps','Get inside the line']
  },
  risk_management:{
    label:'When is extra risk justified for you?',
    options:['When the ball is in my strength area','When the field gives me access','When required rate demands it','When matchup strongly favours me','When wickets in hand allow it','Late in the innings','After I am established','Only when a safer option is not enough']
  },
  reset_routines:{
    label:'What is your format-specific reset?',
    options:['Slow breath','Re-check field','Talk to partner','Return to trusted scoring option','Accept the previous ball','Re-state match situation','Reset guard / routine','Focus on next ball only']
  },
  dot_ball_management:{
    label:'When dot-ball pressure builds, what can you do safely?',
    options:['Accept it if bowling is good','Look for a safer single','Change crease position','Use feet to spin','Open another scoring area','Run harder','Target the next genuine scoring ball','Talk to partner and reset','Avoid forcing a boundary']
  },
  powerplay:{
    label:'How can you use the field restrictions?',
    options:['Hit straight','Use gaps through cover / point','Attack pads','Pull short bowling','Loft over infield','Run hard while ring is up','Choose one bowler to pressure','Keep a safe single available','Use conventional strengths first']
  },
  death_overs:{
    label:'Which late-innings options do you trust?',
    options:['Hit straight','Access mid-wicket','Access cover','Use pace behind square','Pull / hook','Ramp / scoop','Use feet to change length','Run twos','Keep a single fallback','Target full ball','Target short ball']
  },
  innovation:{
    label:'Which created / premeditated options are actually part of your game?',
    options:['Move across crease','Open stance / access off side','Use feet early','Sweep','Reverse sweep','Ramp','Scoop','Back away for room','Change depth in crease','None — react conventionally']
  },
  patience:{
    label:'What helps you occupy the crease well?',
    options:['Leave ego out of the contest','Trust defence','Wait for my ball','Reset each over','Break innings into small blocks','Stay patient after dots','Keep routine consistent','Talk to partner','Let bowler get bored first']
  },
  partnerships:{
    label:'How do you contribute to a partnership?',
    options:['Communicate plans','Rotate strike','Protect partner when needed','Take pressure off with boundaries','Rebuild after wickets','Share matchup information','Run hard together','Stay calm when partner struggles']
  }
};

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const val=id=>document.getElementById(id)?.value.trim()||'';
const slug=s=>String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const naturalList=a=>a.length===1?a[0]:a.length===2?`${a[0]} and ${a[1]}`:`${a.slice(0,-1).join(', ')}, and ${a[a.length-1]}`;

async function boot(){
  const {data:{session:s}}=await supabase.auth.getSession();
  session=s;
  supabase.auth.onAuthStateChange((_e,s2)=>{session=s2;routeAuth();});
  await routeAuth();
}

async function routeAuth(){
  if(!session){renderLogin();return;}
  await loadContext();
}

function renderLogin(msg=''){
  app.innerHTML=`<div class="login">
    <div style="font-size:10px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;color:#202f78">Batting Development Platform</div>
    <h1>Club coaching, made explicit.</h1>
    <p>Sign in by email. We’ll send a secure magic link — no password required.</p>
    ${msg?`<div class="notice">${esc(msg)}</div>`:''}
    <div class="field"><label>Email</label><input id="email" type="email" placeholder="you@club.com.au"></div>
    <button class="btn secondary" id="send">Send magic link</button>
  </div>`;
  document.getElementById('send').onclick=async()=>{
    const email=val('email');
    if(!email)return;
    const {error}=await supabase.auth.signInWithOtp({
      email,
      options:{emailRedirectTo:location.origin+location.pathname}
    });
    renderLogin(error?error.message:'Check your email and tap the sign-in link.');
  };
}

async function loadContext(){
  app.innerHTML='<div class="splash">Loading…</div>';

  const {data:memberships,error}=await supabase
    .from('club_memberships')
    .select('club_id,role,involvement,permission_role,clubs(id,name,slug,join_code,primary_colour,accent_colour)')
    .eq('user_id',session.user.id);

  if(error){
    app.innerHTML=`<div class="splash">${esc(error.message)}</div>`;
    return;
  }

  if(!memberships?.length){
    renderNoClub();
    return;
  }

  membership=memberships[0];
  club=membership.clubs;

  const {data:profileData}=await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id',session.user.id)
    .maybeSingle();

  userProfile=profileData||null;

  if(!userProfile || !membership.involvement){
    renderFirstIdentitySetup();
    return;
  }

  await loadData();
  renderShell();
}

function roleCards(prefix,selected=''){
  const roles=[
    ['player','Player','I want to build and use my own Player Plan.'],
    ['coach_captain','Coach / Captain','I do not need a Player Plan. An Admin will assign the players I can view or coach.'],
    ['both','Both','I am a player and also coach / captain. I need my own plan plus assigned coaching access.']
  ];
  return `<div class="role-grid">${roles.map(([k,t,d])=>`
    <label class="role-card ${selected===k?'on':''}">
      <input type="radio" name="${prefix}" value="${k}" ${selected===k?'checked':''}>
      <strong>${t}</strong><p>${d}</p>
    </label>`).join('')}</div>`;
}

function wireRoleCards(){
  document.querySelectorAll('.role-card input').forEach(r=>r.onchange=()=>{
    document.querySelectorAll(`input[name="${r.name}"]`).forEach(x=>x.closest('.role-card').classList.toggle('on',x.checked));
  });
}

function renderNoClub(){
  app.innerHTML=`<div class="login" style="max-width:760px">
    <h1>Join or create a club.</h1>
    <p>If your club already uses the platform, ask the Admin for its join code. If you are setting up a new club, create it here.</p>
    <div class="grid">
      <section class="card">
        <h2>Join an existing club</h2>
        <div class="field"><label>Your name</label><input id="joinName" placeholder="Full name"></div>
        <div class="field"><label>Club join code</label><input id="joinCode" placeholder="e.g. A1B2C3D4"></div>
        <div class="section-label">How are you involved?</div>
        ${roleCards('joinRole','player')}
        <button class="btn secondary" id="joinClub">Join club</button>
        <div id="joinStatus" class="help"></div>
      </section>
      <section class="card">
        <h2>Create a new club</h2>
        <div class="field"><label>Club name</label><input id="clubName" placeholder="Club name"></div>
        <div class="field"><label>Club slug</label><input id="clubSlug" placeholder="club-name"></div>
        <button class="btn secondary" id="createClub">Create club</button>
        <div id="createStatus" class="help"></div>
      </section>
    </div>
  </div>`;

  wireRoleCards();

  const n=document.getElementById('clubName');
  const s=document.getElementById('clubSlug');
  n.oninput=()=>{if(!s.dataset.touched)s.value=slug(n.value);};
  s.oninput=()=>s.dataset.touched='1';

  document.getElementById('joinClub').onclick=async()=>{
    const involvement=document.querySelector('input[name="joinRole"]:checked')?.value;
    const status=document.getElementById('joinStatus');
    status.textContent='Joining…';
    const {error}=await supabase.rpc('join_club_by_code',{
      p_join_code:val('joinCode'),
      p_display_name:val('joinName'),
      p_involvement:involvement
    });
    if(error){status.textContent=error.message;return;}
    await loadContext();
  };

  document.getElementById('createClub').onclick=async()=>{
    const status=document.getElementById('createStatus');
    status.textContent='Creating…';
    const {error}=await supabase.rpc('create_club_with_admin',{
      club_name:val('clubName'),
      club_slug:val('clubSlug'),
      primary_colour:'#202f78',
      accent_colour:'#d8232a'
    });
    if(error){status.textContent=error.message;return;}
    await loadContext();
  };
}

function renderFirstIdentitySetup(){
  app.innerHTML=`<div class="login" style="max-width:720px">
    <div class="section-label">${esc(club.name)}</div>
    <h1>How are you involved?</h1>
    <p>This only determines whether you need your own Player Plan. It does <strong>not</strong> give coaching access — the Club Admin controls that separately.</p>
    <div class="field"><label>Your name</label><input id="myName" value="${esc(userProfile?.display_name||'')}"></div>
    ${roleCards('myRole',membership.involvement||'both')}
    <button class="btn secondary" id="saveIdentity">Continue</button>
    <div id="identitySetupStatus" class="help"></div>
  </div>`;
  wireRoleCards();

  document.getElementById('saveIdentity').onclick=async()=>{
    const status=document.getElementById('identitySetupStatus');
    const involvement=document.querySelector('input[name="myRole"]:checked')?.value;
    status.textContent='Saving…';
    const {error}=await supabase.rpc('setup_my_club_identity',{
      p_club_id:club.id,
      p_display_name:val('myName'),
      p_involvement:involvement
    });
    if(error){status.textContent=error.message;return;}
    await loadContext();
  };
}

async function loadData(){
  const [pRes,dRes,sdRes,wRes,playerRes]=await Promise.all([
    supabase.from('philosophy_profiles').select('*').eq('club_id',club.id).single(),
    supabase.from('philosophy_dimension_catalogue').select('*').order('sort_order'),
    supabase.from('club_philosophy_dimensions').select('*').eq('club_id',club.id),
    supabase.from('club_format_weights').select('*').eq('club_id',club.id),
    supabase.from('players').select('*').eq('club_id',club.id).eq('user_id',session.user.id).maybeSingle()
  ]);

  clubProfile=pRes.data||{};
  clubProfile.identity_values=Array.isArray(clubProfile.identity_values)?clubProfile.identity_values:[];
  clubProfile.formats_enabled=clubProfile.formats_enabled||{t20:true,limited_overs:true,long_form:true};
  dimensions=dRes.data||[];
  selectedDims=new Map((sdRes.data||[]).map(x=>[x.dimension_key,x]));
  weights=new Map((wRes.data||[]).map(x=>[`${x.dimension_key}:${x.format_key}`,Number(x.weight)]));
  myPlayer=playerRes.data||null;

  if(myPlayer){
    const {data:w}=await supabase
      .from('player_plan_workflows')
      .select('*')
      .eq('player_id',myPlayer.id)
      .maybeSingle();
    workflow=w||null;
  }else{
    workflow=null;
  }
}

function isAdmin(){
  return membership.permission_role==='admin';
}
function isCoachCaptain(){
  return ['coach_captain','both'].includes(membership.involvement);
}
function isPlayerUser(){
  return ['player','both'].includes(membership.involvement);
}

function renderShell(){
  document.documentElement.style.setProperty('--navy',club.primary_colour||'#202f78');
  document.documentElement.style.setProperty('--red',club.accent_colour||'#d8232a');

  const nav=[];
  if(isAdmin()){
    nav.push(
      ['identity','1. Club Identity'],
      ['dimensions','2. What We Value'],
      ['formats','3. Format Emphasis'],
      ['preview','4. How We Bat'],
      ['plan','5. Player Plan Structure'],
      ['permissions','Permissions']
    );
  }
  if(isPlayerUser())nav.push(['myplan','My Player Plan']);

  if(!nav.some(([k])=>k===currentTab)){
    currentTab=isPlayerUser()?'myplan':(isAdmin()?'identity':'myplan');
  }

  app.innerHTML=`<div class="shell">
    <header class="hero">
      <div class="topline">
        <div>
          <div class="k">${esc(club.name)}</div>
          <h1>Batting Development</h1>
          <p>${isAdmin()?'Build the club philosophy, control access, and guide players from reflection to a coach-reviewed plan.':'Your club philosophy becomes the framework for your own batting plan.'}</p>
        </div>
        <button class="btn ghost" id="out">Sign out</button>
      </div>
    </header>
    <nav class="nav">${nav.map(([k,l])=>`<button data-tab="${k}">${l}</button>`).join('')}</nav>
    <main class="page" id="page"></main>
  </div>`;

  document.getElementById('out').onclick=()=>supabase.auth.signOut();
  document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;renderTab();});
  renderTab();
}

function renderTab(){
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));
  const map={
    identity:renderIdentity,
    dimensions:renderDimensions,
    formats:renderFormats,
    preview:renderPreview,
    plan:renderPlanStructure,
    permissions:renderPermissions,
    myplan:renderMyPlan
  };
  (map[currentTab]||renderMyPlan)();
}

/* ---------------- CLUB PHILOSOPHY ---------------- */

function identitySummary(){
  const chosen=IDENTITY_OPTIONS.filter(([k])=>clubProfile.identity_values.includes(k)).map(([,l])=>l.toLowerCase());
  if(!chosen.length)return 'Choose the ideas that should remain true regardless of format.';
  return `Across formats, ${club.name} wants batters who ${naturalList(chosen)}.`;
}

function renderIdentity(){
  document.getElementById('page').innerHTML=`<div class="grid">
    <section class="card">
      <div class="section-label">What should survive every format?</div>
      <h2>Club batting identity</h2>
      <div class="help">Choose everything that feels genuinely true of your club. Format-specific priorities come later.</div>
      <div class="choice-grid">${IDENTITY_OPTIONS.map(([k,l,d])=>`
        <label class="choice ${clubProfile.identity_values.includes(k)?'on':''}">
          <input type="checkbox" data-identity="${k}" ${clubProfile.identity_values.includes(k)?'checked':''}>
          <strong>${esc(l)}</strong><p>${esc(d)}</p>
        </label>`).join('')}</div>
      <div class="field"><label>Anything these choices don’t capture? (optional)</label>
        <textarea id="identityNote" placeholder="Add nuance in your own words…">${esc(clubProfile.identity_note||'')}</textarea>
      </div>
    </section>
    <section class="card">
      <div class="section-label">Formats your club plays</div>
      <h2>Which versions of the game matter here?</h2>
      <div class="formats">${FORMATS.map(([k,l])=>`
        <label class="format-chip"><input type="checkbox" data-format="${k}" ${clubProfile.formats_enabled?.[k]!==false?'checked':''}>${l}</label>`).join('')}
      </div>
      <div class="identity-summary"><div class="title">What we’re hearing</div><p id="identitySummary">${esc(identitySummary())}</p></div>
      <div class="btnrow"><button class="btn secondary" id="saveIdentity">Save & continue</button><span class="status" id="identityStatus"></span></div>
    </section>
  </div>`;

  document.querySelectorAll('[data-identity]').forEach(x=>x.onchange=()=>{
    x.closest('.choice').classList.toggle('on',x.checked);
    collectIdentity(false);
    document.getElementById('identitySummary').textContent=identitySummary();
  });

  document.getElementById('saveIdentity').onclick=async()=>{
    collectIdentity(true);
    const ok=await saveClubProfile('identityStatus');
    if(ok){currentTab='dimensions';renderTab();}
  };
}

function collectIdentity(withNote=true){
  clubProfile.identity_values=[...document.querySelectorAll('[data-identity]:checked')].map(x=>x.dataset.identity);
  clubProfile.formats_enabled=Object.fromEntries(FORMATS.map(([k])=>[k,!!document.querySelector(`[data-format="${k}"]`)?.checked]));
  if(withNote)clubProfile.identity_note=val('identityNote');
}

async function saveClubProfile(statusId){
  const s=document.getElementById(statusId);
  if(s)s.textContent='Saving…';
  const payload={...clubProfile,club_id:club.id,updated_at:new Date().toISOString()};
  delete payload.id;
  const {error}=await supabase.from('philosophy_profiles').upsert(payload,{onConflict:'club_id'});
  if(s)s.textContent=error?error.message:'Saved';
  return !error;
}

function renderDimensions(){
  document.getElementById('page').innerHTML=`<div class="grid">
    <section class="card">
      <div class="section-label">Stimulus, not a prescription</div>
      <h2>Which ideas belong in your batting system?</h2>
      <div class="help">Select broadly. You are not ranking them here.</div>
      <div class="dimension-list">${dimensions.map(d=>{
        const on=selectedDims.has(d.dimension_key);
        return `<label class="dimension ${on?'on':''}">
          <input type="checkbox" data-dim="${d.dimension_key}" ${on?'checked':''}>
          <div><strong>${esc(d.label)}</strong><p>${esc(d.description)}</p>
          <div class="stimulus"><strong>Think about:</strong> ${esc(d.stimulus)}</div></div>
        </label>`;
      }).join('')}</div>
    </section>
    <section class="card">
      <div class="section-label">Optional nuance</div>
      <h2>React first. Explain only where useful.</h2>
      <div class="help">Only write where your club has something specific to add.</div>
      <div id="dimensionNotes"></div>
      <div class="btnrow"><button class="btn secondary" id="saveDims">Save & set format emphasis</button><span class="status" id="dimStatus"></span></div>
    </section>
  </div>`;

  document.querySelectorAll('[data-dim]').forEach(x=>x.onchange=()=>{
    x.closest('.dimension').classList.toggle('on',x.checked);
    renderDimensionNotes();
  });
  renderDimensionNotes();
  document.getElementById('saveDims').onclick=saveDimensions;
}

function renderDimensionNotes(){
  const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
  document.getElementById('dimensionNotes').innerHTML=keys.length?keys.map(k=>{
    const d=dimensions.find(x=>x.dimension_key===k);
    const note=selectedDims.get(k)?.club_note||'';
    return `<div class="field"><label>${esc(d.label)} — anything specific? (optional)</label>
      <textarea data-dim-note="${k}" placeholder="Leave blank if the selections already say enough…">${esc(note)}</textarea></div>`;
  }).join(''):'<div class="notice">Choose some dimensions on the left first.</div>';
}

async function saveDimensions(){
  const s=document.getElementById('dimStatus');
  s.textContent='Saving…';
  const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
  const rows=keys.map(k=>({
    club_id:club.id,
    dimension_key:k,
    enabled:true,
    club_note:document.querySelector(`[data-dim-note="${k}"]`)?.value.trim()||''
  }));

  let {error}=await supabase.from('club_philosophy_dimensions').delete().eq('club_id',club.id);
  if(error){s.textContent=error.message;return;}

  if(rows.length){
    ({error}=await supabase.from('club_philosophy_dimensions').insert(rows));
    if(error){s.textContent=error.message;return;}
  }

  selectedDims=new Map(rows.map(x=>[x.dimension_key,x]));
  initialiseMissingWeights();
  await saveWeights();
  s.textContent='Saved';
  currentTab='formats';
  renderTab();
}

function initialiseMissingWeights(){
  for(const k of selectedDims.keys()){
    for(const [f] of FORMATS){
      const key=`${k}:${f}`;
      if(!weights.has(key))weights.set(key,DEFAULT_WEIGHTS[k]?.[f]??2);
    }
  }
}

function enabledFormats(){
  return FORMATS.filter(([k])=>clubProfile.formats_enabled?.[k]!==false);
}

function renderFormats(){
  initialiseMissingWeights();
  const formats=enabledFormats();
  document.getElementById('page').innerHTML=`<div class="card">
    <div class="section-label">When does each thing matter most?</div>
    <h2>Format emphasis</h2>
    <div class="help">Nothing is globally ranked. Set the emphasis for each selected dimension in each format.</div>
    ${formats.length?`<div class="matrix-wrap"><table class="matrix"><thead><tr><th>Batting dimension</th>${formats.map(([,l])=>`<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${[...selectedDims.keys()].map(k=>{
        const d=dimensions.find(x=>x.dimension_key===k);
        return `<tr><td class="dimname">${esc(d?.label||k)}</td>${formats.map(([f])=>`
          <td><select class="weight" data-weight-key="${k}:${f}">
            ${WEIGHT_LABELS.map((l,i)=>`<option value="${i}" ${Number(weights.get(`${k}:${f}`)??2)===i?'selected':''}>${l}</option>`).join('')}
          </select></td>`).join('')}</tr>`;
      }).join('')}
    </tbody></table></div>`:'<div class="notice">No formats are enabled.</div>'}
    <div class="btnrow"><button class="btn secondary" id="saveWeights">Save & generate How We Bat</button><span class="status" id="weightStatus"></span></div>
  </div>`;

  document.getElementById('saveWeights').onclick=async()=>{
    document.querySelectorAll('[data-weight-key]').forEach(x=>weights.set(x.dataset.weightKey,Number(x.value)));
    const ok=await saveWeights('weightStatus');
    if(ok){currentTab='preview';renderTab();}
  };
}

async function saveWeights(statusId){
  const s=statusId?document.getElementById(statusId):null;
  if(s)s.textContent='Saving…';

  let {error}=await supabase.from('club_format_weights').delete().eq('club_id',club.id);
  if(error){if(s)s.textContent=error.message;return false;}

  const rows=[];
  for(const k of selectedDims.keys()){
    for(const [f] of FORMATS){
      rows.push({
        club_id:club.id,
        dimension_key:k,
        format_key:f,
        weight:Number(weights.get(`${k}:${f}`)??2)
      });
    }
  }

  if(rows.length){
    ({error}=await supabase.from('club_format_weights').insert(rows));
    if(error){if(s)s.textContent=error.message;return false;}
  }
  if(s)s.textContent='Saved';
  return true;
}

function topEmphasis(format){
  return [...selectedDims.keys()]
    .map(k=>({
      key:k,
      weight:Number(weights.get(`${k}:${format}`)??0),
      d:dimensions.find(x=>x.dimension_key===k)
    }))
    .filter(x=>x.weight>0)
    .sort((a,b)=>b.weight-a.weight||(a.d?.sort_order||999)-(b.d?.sort_order||999));
}

function formatNarrative(format){
  const top=topEmphasis(format);
  if(!top.length)return 'This format has not yet been given any specific emphasis.';
  const very=top.filter(x=>x.weight===4).map(x=>x.d.label.toLowerCase());
  const high=top.filter(x=>x.weight===3).map(x=>x.d.label.toLowerCase());
  const low=top.filter(x=>x.weight===1).map(x=>x.d.label.toLowerCase());
  let text='';
  if(very.length)text+=`In this format, ${naturalList(very)} ${very.length===1?'is':'are'} central to the way we want to bat. `;
  if(high.length)text+=`${naturalList(high)} ${high.length===1?'is':'are'} also strongly emphasised. `;
  if(low.length)text+=`${naturalList(low)} ${low.length===1?'remains':'remain'} part of the system, but with lower emphasis here.`;
  return text.trim();
}

function renderPreview(){
  const formats=enabledFormats();
  if(!formats.some(([k])=>k===previewFormat))previewFormat=formats[0]?.[0]||'limited_overs';
  const identity=identitySummary()+(clubProfile.identity_note?` ${clubProfile.identity_note}`:'');

  document.getElementById('page').innerHTML=`<div class="grid">
    <section><div class="preview">
      <div class="preview-head"><div class="k">${esc(club.name)}</div><h2>How We Bat</h2><div style="font-size:11px;line-height:1.5;opacity:.9">${esc(identity)}</div></div>
      <div class="preview-section"><h3>Our identity</h3><p>${esc(identity)}</p></div>
      <div class="preview-section">
        <div class="format-tabs">${formats.map(([k,l])=>`<button data-preview-format="${k}" class="${k===previewFormat?'active':''}">${l}</button>`).join('')}</div>
        <h3>${esc(FORMATS.find(([k])=>k===previewFormat)?.[1]||'Format')} expression</h3>
        <p>${esc(formatNarrative(previewFormat))}</p>
        <div class="emphasis">${topEmphasis(previewFormat).slice(0,8).map(x=>`
          <div class="emphasis-row"><strong>${esc(x.d.label)}</strong><span>${WEIGHT_LABELS[x.weight]}</span></div>`).join('')}</div>
      </div>
    </div></section>
    <section class="card">
      <div class="section-label">One philosophy. Different expression.</div>
      <h2>Format-aware by design</h2>
      <div class="help">The club identity stays stable; the weighting changes by format. The Player Builder uses those same weightings to decide what questions to ask.</div>
      <div class="btnrow"><button class="btn secondary" id="toPlan">See Player Plan structure</button></div>
    </section>
  </div>`;

  document.querySelectorAll('[data-preview-format]').forEach(b=>b.onclick=()=>{previewFormat=b.dataset.previewFormat;renderPreview();});
  document.getElementById('toPlan').onclick=()=>{currentTab='plan';renderTab();};
}

function overlayModules(format){
  return topEmphasis(format)
    .filter(x=>x.weight>=2 && QUESTION_LIBRARY[x.key])
    .map(x=>({key:x.key,label:QUESTION_LIBRARY[x.key].label,weight:x.weight}));
}

function renderPlanStructure(){
  const formats=enabledFormats();
  document.getElementById('page').innerHTML=`<div class="grid">
    <section class="card">
      <div class="section-label">Always the same player</div>
      <h2>Core reflection</h2>
      <div class="modules">
        ${[
          ['Trusted strengths','Structured choices + optional comments'],
          ['Danger + Reset','Structured danger signs and reset cues'],
          ['Current Focus','Choose priorities, then refine with coach']
        ].map((m,i)=>`<div class="module"><div class="icon">${i+1}</div><div><strong>${m[0]}</strong><p>${m[1]}</p></div><div class="badge">CORE</div></div>`).join('')}
      </div>
    </section>
    <section class="card">
      <div class="section-label">Questions morph by club + format</div>
      <h2>Format overlays</h2>
      ${formats.map(([f,l])=>`<h3>${l}</h3><div class="modules">
        ${overlayModules(f).map((m,i)=>`<div class="module"><div class="icon">${i+1}</div><div><strong>${esc(m.label)}</strong><p>Asked because ${esc(dimensions.find(d=>d.dimension_key===m.key)?.label||m.key)} is ${WEIGHT_LABELS[m.weight].toLowerCase()} in this format.</p></div><div class="badge format">${WEIGHT_LABELS[m.weight]}</div></div>`).join('')||'<div class="notice">No overlay modules yet.</div>'}
      </div>`).join('')}
    </section>
  </div>`;
}

/* ---------------- PERMISSIONS ---------------- */

async function renderPermissions(){
  document.getElementById('page').innerHTML='<div class="splash">Loading club permissions…</div>';

  const {data:members,error}=await supabase
    .from('club_memberships')
    .select('club_id,user_id,involvement,permission_role')
    .eq('club_id',club.id);

  if(error){
    document.getElementById('page').innerHTML=`<div class="notice">${esc(error.message)}</div>`;
    return;
  }

  const userIds=(members||[]).map(m=>m.user_id);
  const [{data:profiles},{data:grants},{data:players}]=await Promise.all([
    userIds.length?supabase.from('user_profiles').select('*').in('user_id',userIds):Promise.resolve({data:[]}),
    supabase.from('club_access_grants').select('*').eq('club_id',club.id),
    supabase.from('players').select('id,user_id,display_name,grade').eq('club_id',club.id)
  ]);

  const pMap=new Map((profiles||[]).map(p=>[p.user_id,p]));
  const grantMap=new Map();
  for(const g of grants||[]){
    if(!grantMap.has(g.user_id))grantMap.set(g.user_id,[]);
    grantMap.get(g.user_id).push(g);
  }

  const grades=[...new Set((players||[]).map(p=>p.grade).filter(Boolean))].sort();

  document.getElementById('page').innerHTML=`<div class="grid">
    <section class="card">
      <div class="section-label">Invite people with one code</div>
      <h2>Club join code</h2>
      <div class="help">Players and coaches/captains use the same code. Their first screen asks whether they are a Player, Coach / Captain, or Both.</div>
      <div class="join-code">${esc(club.join_code||'—')}</div>
      <div class="notice">Choosing <strong>Coach / Captain</strong> does not give access to anyone’s plan. They stay pending until an Admin assigns it here.</div>
    </section>
    <section class="card">
      <div class="section-label">Simple permission model</div>
      <h2>What access means</h2>
      <div class="help"><strong>Viewing follows access.</strong> Editing follows coaching responsibility. Grade-based access follows the player automatically when their grade is updated.</div>
    </section>
  </div>
  <section class="card" style="margin-top:16px">
    <h2>People & access</h2>
    <div class="member-list">${(members||[]).map(m=>{
      const prof=pMap.get(m.user_id);
      const name=prof?.display_name||'Profile not completed';
      const gs=grantMap.get(m.user_id)||[];
      let access='pending',grade='';
      if(gs.some(g=>g.scope==='whole_club'&&g.can_edit))access='whole_edit';
      else if(gs.some(g=>g.scope==='whole_club'&&g.can_view))access='whole_view';
      else if(gs.some(g=>g.scope==='grade'&&g.can_edit)){access='grade_edit';grade=gs.find(g=>g.scope==='grade'&&g.can_edit)?.grade||'';}
      else if(gs.some(g=>g.scope==='grade'&&g.can_view)){access='grade_view';grade=gs.find(g=>g.scope==='grade'&&g.can_view)?.grade||'';}

      const selfAdmin=m.user_id===session.user.id && m.permission_role==='admin';
      return `<div class="member">
        <div>
          <strong>${esc(name)}${m.user_id===session.user.id?' · You':''}</strong>
          <small>${esc(labelInvolvement(m.involvement))}</small>
          ${m.permission_role==='none'&&m.involvement!=='player'?'<span class="pending">ACCESS PENDING</span>':''}
        </div>
        <div class="member-controls">
          <select data-role-user="${m.user_id}" ${selfAdmin?'disabled':''}>
            ${[
              ['none','No special role'],
              ['captain','Captain'],
              ['coach','Coach'],
              ['head_coach','Head Coach'],
              ['admin','Admin']
            ].map(([v,l])=>`<option value="${v}" ${m.permission_role===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <select data-access-user="${m.user_id}" ${selfAdmin?'disabled':''}>
            <option value="pending" ${access==='pending'?'selected':''}>No assigned access</option>
            <option value="whole_view" ${access==='whole_view'?'selected':''}>Whole club · view</option>
            <option value="whole_edit" ${access==='whole_edit'?'selected':''}>Whole club · view + edit</option>
            <option value="grade_view" ${access==='grade_view'?'selected':''}>One grade · view</option>
            <option value="grade_edit" ${access==='grade_edit'?'selected':''}>One grade · view + edit</option>
          </select>
          <input data-grade-user="${m.user_id}" placeholder="Grade" value="${esc(grade)}" list="gradeList" ${selfAdmin?'disabled':''}>
          ${selfAdmin?'<span class="help" style="margin:0">Primary Admin</span>':`<button class="btn ghost" data-save-user="${m.user_id}">Save</button>`}
        </div>
      </div>`;
    }).join('')}</div>
    <datalist id="gradeList">${grades.map(g=>`<option value="${esc(g)}">`).join('')}</datalist>
  </section>`;

  document.querySelectorAll('[data-save-user]').forEach(b=>b.onclick=()=>saveMemberPermission(b.dataset.saveUser));
}

function labelInvolvement(v){
  return v==='player'?'Player':v==='coach_captain'?'Coach / Captain':v==='both'?'Player + Coach / Captain':'Not set';
}

async function saveMemberPermission(userId){
  const role=document.querySelector(`[data-role-user="${userId}"]`).value;
  const access=document.querySelector(`[data-access-user="${userId}"]`).value;
  const grade=document.querySelector(`[data-grade-user="${userId}"]`).value.trim();

  const {error:roleError}=await supabase
    .from('club_memberships')
    .update({permission_role:role})
    .eq('club_id',club.id)
    .eq('user_id',userId);

  if(roleError){alert(roleError.message);return;}

  const {error:deleteError}=await supabase
    .from('club_access_grants')
    .delete()
    .eq('club_id',club.id)
    .eq('user_id',userId);

  if(deleteError){alert(deleteError.message);return;}

  let row=null;
  if(access==='whole_view')row={club_id:club.id,user_id:userId,scope:'whole_club',can_view:true,can_edit:false};
  if(access==='whole_edit')row={club_id:club.id,user_id:userId,scope:'whole_club',can_view:true,can_edit:true};
  if(access==='grade_view'){
    if(!grade){alert('Enter the grade this person should view.');return;}
    row={club_id:club.id,user_id:userId,scope:'grade',grade,can_view:true,can_edit:false};
  }
  if(access==='grade_edit'){
    if(!grade){alert('Enter the grade this person should coach.');return;}
    row={club_id:club.id,user_id:userId,scope:'grade',grade,can_view:true,can_edit:true};
  }

  if(row){
    const {error}=await supabase.from('club_access_grants').insert(row);
    if(error){alert(error.message);return;}
  }

  alert('Access updated.');
  await loadContext();
}

/* ---------------- GUIDED PLAYER PLAN ---------------- */

function rawAnswers(){
  return workflow?.raw_answers && typeof workflow.raw_answers==='object'
    ? structuredClone(workflow.raw_answers)
    : {core:{},formats:{}};
}

function answerFor(section,key){
  const raw=rawAnswers();
  if(section==='core')return raw.core?.[key]||{choices:[],comment:''};
  return raw.formats?.[section]?.[key]||{choices:[],comment:''};
}

function renderMyPlan(){
  if(!myPlayer){
    document.getElementById('page').innerHTML=`<div class="card">
      <h2>No Player Plan is attached to this account.</h2>
      <div class="help">Your account is currently set up as ${esc(labelInvolvement(membership.involvement))}. If you should also be a player, an Admin can help update your club identity.</div>
    </div>`;
    return;
  }

  const formats=enabledFormats();
  if(builderSection!=='core'&&!formats.some(([k])=>k===builderSection))builderSection='core';

  const status=workflow?.status||'in_progress';

  document.getElementById('page').innerHTML=`<div class="grid">
    <section class="card">
      <div class="builder-head">
        <div>
          <div class="section-label">Guided Player Reflection</div>
          <h2>${esc(myPlayer.display_name)}</h2>
          <div class="help">Choose what genuinely describes your game. Add comments only where the options do not capture it. Your coach will review the draft with you.</div>
        </div>
        <span class="workflow-status ${status==='ready_for_review'?'ready':status==='approved'?'approved':''}">${status==='ready_for_review'?'READY FOR REVIEW':status==='approved'?'APPROVED':'IN PROGRESS'}</span>
      </div>

      <div class="subnav">
        <button data-builder-section="core" class="${builderSection==='core'?'active':''}">Core</button>
        ${formats.map(([k,l])=>`<button data-builder-section="${k}" class="${builderSection===k?'active':''}">${l}</button>`).join('')}
      </div>

      <div id="builderQuestions">${renderQuestions(builderSection)}</div>

      <div class="btnrow">
        <button class="btn secondary" id="saveReflection">Save progress</button>
        <button class="btn" id="submitReflection">Ready for coach review</button>
        <span class="status" id="builderStatus"></span>
      </div>
    </section>

    <section class="card">
      <div class="section-label">Curated draft</div>
      <h2>What your plan is becoming</h2>
      <div class="help">For this prototype the curation is rules-based. Later, AI can tighten the wording while staying traceable to your actual answers.</div>
      <div id="draftPreview">${renderDraftPreview()}</div>
    </section>
  </div>`;

  document.querySelectorAll('[data-builder-section]').forEach(b=>b.onclick=()=>{
    collectBuilderAnswers();
    builderSection=b.dataset.builderSection;
    renderMyPlan();
  });

  document.querySelectorAll('.option-chip input').forEach(x=>x.onchange=()=>{
    collectBuilderAnswers();
    document.getElementById('draftPreview').innerHTML=renderDraftPreviewFromLocal();
  });
  document.querySelectorAll('[data-comment-key]').forEach(x=>x.oninput=()=>{
    collectBuilderAnswers();
    document.getElementById('draftPreview').innerHTML=renderDraftPreviewFromLocal();
  });

  document.getElementById('saveReflection').onclick=()=>saveWorkflow('in_progress');
  document.getElementById('submitReflection').onclick=()=>saveWorkflow('ready_for_review');
}

function renderQuestions(section){
  if(section==='core'){
    const keys=['core_strengths','core_danger','core_reset','core_focus'];
    return keys.map(k=>renderQuestion(section,k,QUESTION_LIBRARY[k])).join('');
  }

  const modules=topEmphasis(section)
    .filter(x=>x.weight>=2 && QUESTION_LIBRARY[x.key]);

  if(!modules.length){
    return '<div class="notice">Your club has not given this format any Player Plan dimensions yet.</div>';
  }

  return modules.map(x=>{
    const spec=QUESTION_LIBRARY[x.key];
    const dim=dimensions.find(d=>d.dimension_key===x.key);
    return renderQuestion(section,x.key,{
      ...spec,
      why:`${dim?.label||spec.label} is ${WEIGHT_LABELS[x.weight].toLowerCase()} in your club’s ${FORMATS.find(([k])=>k===section)?.[1]||section} philosophy.`
    });
  }).join('');
}

function renderQuestion(section,key,spec){
  const a=answerFor(section,key);
  return `<div class="question">
    <h3>${esc(spec.label)}</h3>
    <div class="why">${esc(spec.why||'Choose all that genuinely apply.')}</div>
    <div class="option-grid">
      ${(spec.options||[]).map((o,i)=>{
        const id=`q_${section}_${key}_${i}`;
        return `<label class="option-chip"><input type="checkbox" id="${id}" data-answer-section="${section}" data-answer-key="${key}" value="${esc(o)}" ${(a.choices||[]).includes(o)?'checked':''}><span>${esc(o)}</span></label>`;
      }).join('')}
    </div>
    <div class="optional-comment">
      <textarea data-comment-key="${key}" data-comment-section="${section}" placeholder="Anything else? Optional.">${esc(a.comment||'')}</textarea>
    </div>
  </div>`;
}

let localRaw=null;

function collectBuilderAnswers(){
  if(!localRaw)localRaw=rawAnswers();

  const section=builderSection;
  if(section==='core'&&!localRaw.core)localRaw.core={};
  if(section!=='core'){
    if(!localRaw.formats)localRaw.formats={};
    if(!localRaw.formats[section])localRaw.formats[section]={};
  }

  const keys=[...new Set([...document.querySelectorAll('[data-answer-key]')].map(x=>x.dataset.answerKey))];

  for(const key of keys){
    const choices=[...document.querySelectorAll(`[data-answer-key="${key}"][data-answer-section="${section}"]:checked`)].map(x=>x.value);
    const comment=document.querySelector(`[data-comment-key="${key}"][data-comment-section="${section}"]`)?.value.trim()||'';
    const answer={choices,comment};
    if(section==='core')localRaw.core[key]=answer;
    else localRaw.formats[section][key]=answer;
  }
}

function curate(raw){
  const result={core:[],formats:{}};

  const coreLabels={
    core_strengths:'Trusted strengths',
    core_danger:'My danger',
    core_reset:'My reset',
    core_focus:'Current focus'
  };

  for(const [k,label] of Object.entries(coreLabels)){
    const a=raw.core?.[k];
    if(!a)continue;
    const bits=[...(a.choices||[])];
    if(a.comment)bits.push(a.comment);
    if(bits.length)result.core.push({label,value:bits.join(' · ')});
  }

  for(const [f,label] of enabledFormats()){
    const lines=[];
    for(const [k,a] of Object.entries(raw.formats?.[f]||{})){
      const spec=QUESTION_LIBRARY[k];
      const bits=[...(a.choices||[])];
      if(a.comment)bits.push(a.comment);
      if(bits.length)lines.push({label:spec?.label||k,value:bits.join(' · ')});
    }
    result.formats[f]={label,lines};
  }

  return result;
}

function renderDraftPreviewFromLocal(){
  return renderCuratedDraft(curate(localRaw||rawAnswers()));
}

function renderDraftPreview(){
  const curated=workflow?.curated_draft&&Object.keys(workflow.curated_draft||{}).length
    ? workflow.curated_draft
    : curate(rawAnswers());
  return renderCuratedDraft(curated);
}

function renderCuratedDraft(curated){
  const core=curated.core||[];
  const formats=curated.formats||{};

  return `<div class="plan-draft">
    <div class="plan-draft-head"><div class="section-label" style="color:#fff;opacity:.75">Draft Player Plan</div><h2>${esc(myPlayer?.display_name||'Player')}</h2></div>
    ${core.length?core.map(x=>`<div class="plan-line"><div class="label">${esc(x.label)}</div><div class="value">${esc(x.value)}</div></div>`).join(''):'<div class="plan-line"><div class="value">Start answering the guided questions to build your draft.</div></div>'}
    ${Object.values(formats).map(f=>f.lines?.length?`<div class="plan-line"><div class="label">${esc(f.label)}</div><div class="value">${f.lines.map(x=>`<strong>${esc(x.label)}:</strong> ${esc(x.value)}`).join('<br><br>')}</div></div>`:'').join('')}
  </div>`;
}

async function saveWorkflow(status){
  collectBuilderAnswers();
  const raw=localRaw||rawAnswers();
  const curated=curate(raw);
  const payload={
    player_id:myPlayer.id,
    raw_answers:raw,
    curated_draft:curated,
    status,
    submitted_at:status==='ready_for_review'?new Date().toISOString():workflow?.submitted_at||null,
    updated_at:new Date().toISOString()
  };

  const s=document.getElementById('builderStatus');
  s.textContent='Saving…';

  const {data,error}=await supabase
    .from('player_plan_workflows')
    .upsert(payload,{onConflict:'player_id'})
    .select()
    .single();

  if(error){s.textContent=error.message;return;}
  workflow=data;
  localRaw=null;
  s.textContent=status==='ready_for_review'?'Sent to coach for review':'Saved';
  renderMyPlan();
}

boot();
