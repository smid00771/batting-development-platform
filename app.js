import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const app=document.getElementById('app');

let session=null;
let allMemberships=[];
let platformRole=null;
let canBootstrapPlatform=false;
let platformView='home';
let platformSelectedProspectId=null;
let club=null;
let membership=null;
let userProfile=null;
let clubProfile={};                 // my working philosophy response
let selectedDims=new Map();          // my working response
let weights=new Map();               // my working response

let publishedProfile={};             // current published/live club philosophy
let publishedSelectedDims=new Map();
let publishedWeights=new Map();

let workshop=null;
let myContributor=null;
let myContribution=null;
let philosophyVersions=[];
let dimensions=[];
let myPlayer=null;
let workflow=null;
let currentTab='workshop';
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
 strike_rotation:{t20:2,limited_overs:4,long_form:4},
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
    options:['Decision making','Get off strike / rotate strike','Scoring against pace','Scoring against spin','Short-ball scoring','Full-ball scoring','Leaving','Defence','Running between wickets','Boundary options','Tempo','Mental routine','Footwork','Balance / shape']
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
    label:'How do you get off strike / rotate strike?',
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

function redirectUrl(){
  return location.origin+location.pathname+location.search;
}

async function loadPlatformContext(){
  if(!session){platformRole=null;canBootstrapPlatform=false;return;}
  const [{data:role},{data:canBoot}]=await Promise.all([
    supabase.rpc('get_my_platform_role'),
    supabase.rpc('can_bootstrap_platform_owner')
  ]);
  platformRole=role||null;
  canBootstrapPlatform=!!canBoot;
}

async function routeAuth(){
  const params=new URLSearchParams(location.search);
  const prospectToken=params.get('prospect');
  const paymentToken=params.get('payment');
  const adminInviteToken=params.get('admin_invite');
  const philosophyInviteToken=params.get('philosophy_invite');
  const leadHandoverToken=params.get('lead_handover');
  const playerJoinToken=params.get('player_join');
  const joinCodeToken=params.get('join');

  if(prospectToken){await renderProspectRoute(prospectToken);return;}
  if(paymentToken){await renderPaymentRoute(paymentToken);return;}
  if(adminInviteToken){await renderAdminInviteRoute(adminInviteToken);return;}
  if(philosophyInviteToken){await renderPhilosophyInviteRoute(philosophyInviteToken);return;}
  if(leadHandoverToken){await renderLeadAdminHandoverRoute(leadHandoverToken);return;}
  if(playerJoinToken){await renderPlayerJoinRoute(playerJoinToken);return;}

  if(joinCodeToken){
    if(!session){
      renderLogin('Sign in to continue joining the club. Your invitation link will still be here after sign-in.');
      return;
    }
    await loadPlatformContext();
    await renderJoinByCode(joinCodeToken);
    return;
  }

  if(!session){renderLogin();return;}
  await loadPlatformContext();
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
      options:{emailRedirectTo:redirectUrl()}
    });
    renderLogin(error?error.message:'Check your email and tap the sign-in link.');
  };
}

async function loadContext(){
  app.innerHTML='<div class="splash">Loading…</div>';

  const {data:memberships,error}=await supabase
    .from('club_memberships')
    .select('club_id,role,involvement,permission_role,clubs(id,name,slug,join_code,player_join_token,player_signup_open,lead_admin_user_id,primary_colour,accent_colour,subscription_calendar,season_start,season_end)')
    .eq('user_id',session.user.id);

  if(error){
    app.innerHTML=`<div class="splash">${esc(error.message)}</div>`;
    return;
  }

  allMemberships=memberships||[];

  if(platformRole && localStorage.getItem('bdp-context')==='platform'){
    renderPlatformConsole();
    return;
  }

  if(!allMemberships.length){
    if(platformRole){renderPlatformConsole();return;}
    renderNoClub();
    return;
  }

  const routeClub=new URLSearchParams(location.search).get('club');
  const savedClub=routeClub||localStorage.getItem('bdp-club-id');
  membership=allMemberships.find(m=>m.club_id===savedClub)||allMemberships[0];
  club=membership.clubs;
  localStorage.setItem('bdp-club-id',club.id);
  localStorage.setItem('bdp-context','club');

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
    <h1>Join your club.</h1>
    <p>If your club already uses the platform, enter its join code. If your club is being set up for the first time, use the activation or Admin invitation link sent by the platform.</p>
    <section class="card">
      <h2>Join an existing club</h2>
      <div class="field"><label>Your name</label><input id="joinName" placeholder="Full name"></div>
      <div class="field"><label>Club join code</label><input id="joinCode" placeholder="e.g. A1B2C3D4"></div>
      <div class="section-label">How are you involved?</div>
      ${roleCards('joinRole','player')}
      <button class="btn secondary" id="joinClub">Join club</button>
      <div id="joinStatus" class="help"></div>
    </section>
    <div class="notice" style="margin-top:14px"><strong>Setting up a new club?</strong><br>New clubs are created through a subscription or Beta invitation, so the Secretary / trial lead can hand the system to the right Club Admin without becoming the day-to-day operator.</div>
  </div>`;

  wireRoleCards();

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
  const [pRes,dRes,sdRes,wRes,playerRes,workshopRes,myContributorRes,versionsRes]=await Promise.all([
    supabase.from('philosophy_profiles').select('*').eq('club_id',club.id).single(),
    supabase.from('philosophy_dimension_catalogue').select('*').order('sort_order'),
    supabase.from('club_philosophy_dimensions').select('*').eq('club_id',club.id),
    supabase.from('club_format_weights').select('*').eq('club_id',club.id),
    supabase.from('players').select('*').eq('club_id',club.id).eq('user_id',session.user.id).maybeSingle(),
    supabase.from('philosophy_workshops').select('*').eq('club_id',club.id).maybeSingle(),
    supabase.from('philosophy_contributors').select('*').eq('club_id',club.id).eq('user_id',session.user.id).maybeSingle(),
    supabase.from('philosophy_versions').select('*').eq('club_id',club.id).order('version_number',{ascending:false})
  ]);

  publishedProfile=pRes.data||{};
  publishedProfile.identity_values=Array.isArray(publishedProfile.identity_values)?publishedProfile.identity_values:[];
  publishedProfile.formats_enabled=publishedProfile.formats_enabled||{t20:true,limited_overs:true,long_form:true};
  dimensions=dRes.data||[];
  publishedSelectedDims=new Map((sdRes.data||[]).map(x=>[x.dimension_key,x]));
  publishedWeights=new Map((wRes.data||[]).map(x=>[`${x.dimension_key}:${x.format_key}`,Number(x.weight)]));

  workshop=workshopRes.data||null;
  myContributor=myContributorRes.data||null;
  philosophyVersions=versionsRes.data||[];
  myContribution=null;

  if(myContributor){
    const {data:c}=await supabase
      .from('philosophy_contributions')
      .select('*')
      .eq('club_id',club.id)
      .eq('user_id',session.user.id)
      .maybeSingle();
    myContribution=c||null;
  }

  if(myContribution){
    clubProfile={
      identity_values:Array.isArray(myContribution.identity_values)?myContribution.identity_values:[],
      identity_note:myContribution.identity_note||'',
      formats_enabled:myContribution.formats_enabled||{t20:true,limited_overs:true,long_form:true}
    };

    const noteObj=myContribution.dimension_notes||{};
    selectedDims=new Map((myContribution.selected_dimensions||[]).map(k=>[
      k,
      {club_id:club.id,dimension_key:k,enabled:true,club_note:noteObj[k]||''}
    ]));
    weights=new Map(Object.entries(myContribution.format_weights||{}).map(([k,v])=>[k,Number(v)]));
  }else{
    clubProfile=structuredClone(publishedProfile);
    selectedDims=new Map([...publishedSelectedDims.entries()].map(([k,v])=>[k,{...v}]));
    weights=new Map(publishedWeights);
  }

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
function isPhilosophyLead(){
  return !!workshop && workshop.philosophy_lead_user_id===session.user.id;
}
function canContributePhilosophy(){
  return !!myContributor;
}
function contributionLocked(){
  return myContributor?.status==='submitted';
}


function renderShell(){
  document.documentElement.style.setProperty('--navy',club.primary_colour||'#202f78');
  document.documentElement.style.setProperty('--red',club.accent_colour||'#d8232a');

  const nav=[];
  if(isAdmin())nav.push(['dashboard','Club Setup']);
  if(isAdmin() || canContributePhilosophy() || isPhilosophyLead()){
    nav.push(['workshop','Philosophy Workshop']);
  }
  if(canContributePhilosophy()){
    nav.push(
      ['identity','1. Club Identity'],
      ['dimensions','2. What We Value'],
      ['formats','3. Format Emphasis'],
      ['preview','4. How We Bat'],
      ['plan','5. Player Plan Structure']
    );
  }
  if(isAdmin())nav.push(['permissions','Permissions']);
  if(isPlayerUser())nav.push(['myplan','My Player Plan']);

  if(!nav.some(([k])=>k===currentTab)){
    if(isAdmin())currentTab='dashboard';
    else if(nav.some(([k])=>k==='workshop'))currentTab='workshop';
    else if(isPlayerUser())currentTab='myplan';
    else currentTab=nav[0]?.[0]||'myplan';
  }

  const contextOptions=[...allMemberships.map(m=>`<option value="club:${m.club_id}" ${m.club_id===club.id?'selected':''}>${esc(m.clubs?.name||'Club')}</option>`),platformRole?`<option value="platform">Platform Admin</option>`:''].join('');

  app.innerHTML=`<div class="shell">
    <header class="hero">
      <div class="topline">
        <div>
          <div class="k">${esc(club.name)}</div>
          <h1>Batting Development</h1>
          <p>${isAdmin()?'Set the club up, build the philosophy, manage access, and guide players from reflection to an approved plan.':'Your club philosophy becomes the framework for player development.'}</p>
        </div>
        <div class="header-actions">
          ${(allMemberships.length>1||platformRole)?`<select id="contextSwitch" class="context-switch">${contextOptions}</select>`:''}
          ${canBootstrapPlatform&&!platformRole?'<button class="btn ghost" id="claimPlatform">Set up Platform Owner</button>':''}
          <button class="btn ghost" id="joinAnother">Join another club</button>
          <button class="btn ghost" id="out">Sign out</button>
        </div>
      </div>
    </header>
    <nav class="nav">${nav.map(([k,l])=>`<button data-tab="${k}">${l}</button>`).join('')}</nav>
    <main class="page" id="page"></main>
  </div>`;

  document.getElementById('out').onclick=()=>supabase.auth.signOut();
  document.getElementById('joinAnother').onclick=renderJoinAnotherClub;

  if(document.getElementById('contextSwitch')){
    document.getElementById('contextSwitch').onchange=async e=>{
      if(e.target.value==='platform'){
        localStorage.setItem('bdp-context','platform');
        renderPlatformConsole();
        return;
      }
      const id=e.target.value.replace('club:','');
      localStorage.setItem('bdp-context','club');
      localStorage.setItem('bdp-club-id',id);
      await loadContext();
    };
  }

  if(document.getElementById('claimPlatform')){
    document.getElementById('claimPlatform').onclick=async()=>{
      const {error}=await supabase.rpc('bootstrap_platform_owner');
      if(error){alert(error.message);return;}
      await loadPlatformContext();
      renderShell();
    };
  }

  document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;renderTab();});
  renderTab();
}



async function renderPlayerJoinRoute(token){
  const {data:info,error}=await supabase.rpc('get_public_player_join',{p_token:token});

  if(error || !info){
    app.innerHTML=`<div class="login">
      <div class="section-label">Player sign-up</div>
      <h1>This player link is no longer valid.</h1>
      <p>Ask your club for its current Player Sign-up link or QR code.</p>
    </div>`;
    return;
  }

  if(!info.open){
    app.innerHTML=`<div class="login" style="max-width:650px">
      <div class="section-label">${esc(info.club_name)}</div>
      <h1>Player sign-up is currently closed.</h1>
      <p>Your club has temporarily closed self-service player registration. Speak to a club coach or administrator if you still need access.</p>
    </div>`;
    return;
  }

  if(!session){
    app.innerHTML=`<div class="login" style="max-width:650px">
      <div class="section-label">Player sign-up</div>
      <h1>Join ${esc(info.club_name)}</h1>
      <p>This link registers you as a <strong>Player</strong>. If you are also a captain or coach, the Club Admin can add those permissions afterwards.</p>
      <div class="field"><label>Your email</label><input id="playerJoinEmail" type="email" placeholder="you@example.com"></div>
      <button class="btn secondary" id="playerJoinSignIn">Send secure sign-in link</button>
      <div id="playerJoinStatus" class="help"></div>
    </div>`;

    document.getElementById('playerJoinSignIn').onclick=async()=>{
      const email=val('playerJoinEmail');
      const st=document.getElementById('playerJoinStatus');
      if(!email){st.textContent='Enter your email address.';return;}
      st.textContent='Sending…';
      const {error:e}=await supabase.auth.signInWithOtp({
        email,
        options:{emailRedirectTo:redirectUrl()}
      });
      st.textContent=e?e.message:'Check your email and tap the secure sign-in link. It will bring you straight back here.';
    };
    return;
  }

  const {data:profileData}=await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id',session.user.id)
    .maybeSingle();

  app.innerHTML=`<div class="login" style="max-width:650px">
    <div class="section-label">Player sign-up</div>
    <h1>Join ${esc(info.club_name)}</h1>
    <p>You’re joining as a <strong>Player</strong>. Captain/coach access is assigned separately by the club.</p>
    <div class="field"><label>Your name</label><input id="playerJoinName" value="${esc(profileData?.display_name||'')}" placeholder="Full name"></div>
    <button class="btn secondary" id="completePlayerJoin">Join ${esc(info.club_name)}</button>
    <div id="completePlayerJoinStatus" class="help"></div>
  </div>`;

  document.getElementById('completePlayerJoin').onclick=async()=>{
    const st=document.getElementById('completePlayerJoinStatus');
    st.textContent='Joining…';

    const {data:clubId,error:jErr}=await supabase.rpc('join_club_as_player',{
      p_token:token,
      p_display_name:val('playerJoinName')
    });

    if(jErr){st.textContent=jErr.message;return;}

    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',clubId);
    history.replaceState({},'',location.pathname);
    currentTab='myplan';
    await loadPlatformContext();
    await loadContext();
  };
}

async function renderPlayerQRCode(link){
  const img=document.getElementById('playerSignupQR');
  const dl=document.getElementById('downloadPlayerQR');
  const fallback=document.getElementById('qrFallback');
  if(!img)return;

  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const QRCode=mod.default||mod;
    const dataUrl=await QRCode.toDataURL(link,{
      width:260,
      margin:2,
      errorCorrectionLevel:'M'
    });
    img.src=dataUrl;
    img.style.display='block';
    if(dl){
      dl.href=dataUrl;
      dl.download=`${slug(club.name)||'club'}-player-signup-qr.png`;
      dl.style.display='inline-flex';
    }
    if(fallback)fallback.style.display='none';
  }catch(e){
    if(fallback){
      fallback.style.display='block';
      fallback.textContent='QR could not load on this device. The WhatsApp/link buttons still work normally.';
    }
  }
}

async function renderJoinByCode(joinCode){
  const {data:profileData}=await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id',session.user.id)
    .maybeSingle();

  userProfile=profileData||null;

  app.innerHTML=`<div class="login" style="max-width:720px">
    <div class="section-label">Club invitation</div>
    <h1>Join your club.</h1>
    <p>Your club invitation is ready. Confirm your name and how you are involved; the club controls any additional coaching/captain permissions separately.</p>

    <div class="invite-code-confirm">
      <span>Club code</span>
      <strong>${esc(joinCode.toUpperCase())}</strong>
    </div>

    <div class="field"><label>Your name</label><input id="joinName" value="${esc(userProfile?.display_name||'')}" placeholder="Full name"></div>

    <div class="section-label">How are you involved?</div>
    ${roleCards('joinRole','player')}

    <div class="btnrow">
      <button class="btn secondary" id="joinClub">Join club</button>
      <button class="btn ghost" id="cancelJoinLink">Cancel</button>
      <span class="status" id="joinStatus"></span>
    </div>
  </div>`;

  wireRoleCards();

  document.getElementById('cancelJoinLink').onclick=async()=>{
    history.replaceState({},'',location.pathname);
    await loadContext();
  };

  document.getElementById('joinClub').onclick=async()=>{
    const involvement=document.querySelector('input[name="joinRole"]:checked')?.value;
    const st=document.getElementById('joinStatus');
    st.textContent='Joining…';

    const {data,error}=await supabase.rpc('join_club_by_code',{
      p_join_code:joinCode,
      p_display_name:val('joinName'),
      p_involvement:involvement
    });

    if(error){st.textContent=error.message;return;}

    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',data);
    history.replaceState({},'',location.pathname);
    await loadContext();
  };
}

function renderJoinAnotherClub(){
  app.innerHTML=`<div class="login" style="max-width:720px">
    <div class="section-label">Add another club to this login</div>
    <h1>Join another club.</h1>
    <p>The same email account can belong to multiple clubs. Each club controls its own permissions independently.</p>
    <div class="field"><label>Your name</label><input id="joinName" value="${esc(userProfile?.display_name||'')}"></div>
    <div class="field"><label>Club join code</label><input id="joinCode" placeholder="e.g. A1B2C3D4"></div>
    ${roleCards('joinRole','player')}
    <div class="btnrow"><button class="btn secondary" id="joinClub">Join club</button><button class="btn ghost" id="cancelJoin">Cancel</button><span class="status" id="joinStatus"></span></div>
  </div>`;
  wireRoleCards();
  document.getElementById('cancelJoin').onclick=renderShell;
  document.getElementById('joinClub').onclick=async()=>{
    const involvement=document.querySelector('input[name="joinRole"]:checked')?.value;
    const st=document.getElementById('joinStatus');
    st.textContent='Joining…';
    const {data,error}=await supabase.rpc('join_club_by_code',{
      p_join_code:val('joinCode'),p_display_name:val('joinName'),p_involvement:involvement
    });
    if(error){st.textContent=error.message;return;}
    localStorage.setItem('bdp-club-id',data);
    await loadContext();
  };
}

function renderTab(){
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));
  const map={
    dashboard:renderClubDashboard,
    workshop:renderWorkshop,
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


async function renderClubDashboard(){
  const page=document.getElementById('page');
  page.innerHTML='<div class="splash">Loading club setup…</div>';

  const [{data:entitlement},{data:contributors},{data:pendingInvites},{data:players}]=await Promise.all([
    supabase.rpc('get_club_entitlement',{p_club_id:club.id}),
    supabase.from('philosophy_contributors').select('user_id,status').eq('club_id',club.id),
    supabase.from('philosophy_contributor_invites').select('id,status').eq('club_id',club.id).eq('status','pending'),
    supabase.from('players').select('id,active').eq('club_id',club.id).eq('active',true)
  ]);

  const submitted=(contributors||[]).filter(x=>x.status==='submitted').length;
  const total=(contributors||[]).length;
  const published=philosophyVersions.length>0;
  const hasLead=!!workshop?.philosophy_lead_user_id;
  const entitlementActive=entitlement?.active!==false;
  const collaborative=workshop?.mode==='collaborative';
  const additionalContributors=(contributors||[]).filter(
    x=>x.user_id!==workshop?.philosophy_lead_user_id
  ).length + (pendingInvites||[]).length;

  const steps=[
    ['Subscription / entitlement active',entitlementActive],
    ['Club Admin appointed',true],
    ['Philosophy Lead chosen',hasLead],
    collaborative
      ? ['Philosophy contributors selected',additionalContributors>0]
      : ['Solo Philosophy Workshop ready',hasLead],
    ['Club philosophy published',published],
    ['Player Plans open',published]
  ];

  page.innerHTML=`<div class="grid">
    <section class="card">
      <div class="section-label">Getting ${esc(club.name)} ready</div>
      <h2>Club setup</h2>
      <div class="setup-steps">${steps.map(([label,done])=>`
        <div class="setup-step ${done?'done':''}"><span>${done?'✓':'○'}</span><strong>${esc(label)}</strong></div>`).join('')}</div>
      <div class="btnrow">
        ${!hasLead?'<button class="btn secondary" data-go="workshop">Choose Philosophy Lead</button>':''}
        ${hasLead&&!published?'<button class="btn secondary" data-go="workshop">Continue Philosophy Workshop</button>':''}
        ${published?'<button class="btn secondary" data-go="permissions">Invite / manage people</button>':''}
      </div>
    </section>
    <section class="card">
      <div class="section-label">Current position</div>
      <h2>${published?'Player Plans are open':'Player Plans are locked'}</h2>
      <div class="gate-state ${published?'open':'locked'}">${published?'🔓':'🔒'}</div>
      <p class="help">${published
        ?`Published Philosophy v${philosophyVersions[0]?.version_number}. Players can now build plans from the live club philosophy.`
        :'Players can join the club now, but they will see a holding message until the Philosophy Lead publishes the club philosophy.'}</p>
      <div class="dashboard-stats">
        <div><strong>${submitted}/${total}</strong><span>${collaborative?'philosophy responses':'lead response'}</span></div>
        <div><strong>${players?.length||0}</strong><span>active players</span></div>
        <div><strong>${philosophyVersions[0]?.version_number||0}</strong><span>published version</span></div>
      </div>
    </section>
  </div>
  <section class="card" style="margin-top:16px">
    <div class="section-label">Commercial status</div>
    <h2>${entitlement?.status==='development_legacy'?'Development / legacy club':entitlementActive?'Active':'Needs attention'}</h2>
    <div class="help">${entitlement?.status==='development_legacy'
      ?'This club existed before the commercial onboarding system was added. Platform Admin can attach commercial terms later without changing any cricket data.'
      :`Access ${entitlementActive?'is active':'has expired'}${entitlement?.active_until?` through ${new Date(entitlement.active_until+'T00:00:00').toLocaleDateString()}`:''}. Commercial terms are managed only in Platform Admin.`}</div>
  </section>`;

  page.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{currentTab=b.dataset.go;renderTab();});
}

/* ---------------- PHILOSOPHY WORKSHOP ---------------- */

function workshopModeLabel(){
  return workshop?.mode==='collaborative'?'Collaborative':'Solo';
}

function contributorStatusLabel(status){
  return status==='submitted'?'Submitted':status==='in_progress'?'In progress':'Invited';
}

async function renderWorkshop(){
  document.getElementById('page').innerHTML='<div class="splash">Loading Philosophy Workshop…</div>';

  const [{data:contribRows,error:cErr},{data:externalInvites,error:iErr}]=await Promise.all([
    supabase.from('philosophy_contributors').select('*').eq('club_id',club.id),
    (isAdmin() || isPhilosophyLead())
      ?supabase.from('philosophy_contributor_invites').select('*').eq('club_id',club.id).order('created_at',{ascending:true})
      :Promise.resolve({data:[],error:null})
  ]);

  if(cErr || iErr){
    document.getElementById('page').innerHTML=`<div class="notice">${esc((cErr||iErr).message)}</div>`;
    return;
  }

  let members=[];
  let profiles=[];
  if(isAdmin() || isPhilosophyLead()){
    const {data:m}=await supabase
      .from('club_memberships')
      .select('club_id,user_id,involvement,permission_role')
      .eq('club_id',club.id);
    members=m||[];
    const ids=members.map(x=>x.user_id);
    if(ids.length){
      const {data:p}=await supabase.from('user_profiles').select('*').in('user_id',ids);
      profiles=p||[];
    }
  }else{
    const ids=(contribRows||[]).map(x=>x.user_id);
    if(ids.length){
      const {data:p}=await supabase.from('user_profiles').select('*').in('user_id',ids);
      profiles=p||[];
    }
  }

  const pMap=new Map(profiles.map(x=>[x.user_id,x]));
  const submittedCount=(contribRows||[]).filter(x=>x.status==='submitted').length;
  const totalCount=(contribRows||[]).length;
  const pendingExternal=(externalInvites||[]).filter(x=>x.status==='pending');
  const me=(contribRows||[]).find(x=>x.user_id===session.user.id)||myContributor;
  const canSeeSynthesis=!!me && (me.status==='submitted' || (isPhilosophyLead() && workshop?.status==='review'));
  const allSubmitted=totalCount>0 && submittedCount===totalCount;
  const collaborative=workshop?.mode==='collaborative';

  let html=`<div class="workshop-grid">`;

  if(isAdmin()){
    html+=`<section class="card workshop-setup">
      <div class="section-label">Admin setup</div>
      <h2>How should the club build its philosophy?</h2>
      <div class="help">Choose Solo, or let selected coaches/captains contribute independently before the Philosophy Lead makes the final call.</div>

      <div class="mode-choice">
        <label class="mode-card ${!collaborative?'on':''}">
          <input type="radio" name="workshopMode" value="solo" ${!collaborative?'checked':''}>
          <strong>Solo</strong>
          <span>One nominated Philosophy Lead completes and publishes the club philosophy.</span>
        </label>
        <label class="mode-card ${collaborative?'on':''}">
          <input type="radio" name="workshopMode" value="collaborative" ${collaborative?'checked':''}>
          <strong>Collaborative</strong>
          <span>Selected people respond independently, then the system shows consensus and discussion points.</span>
        </label>
      </div>

      <div id="modeFeedback" class="mode-feedback ${collaborative?'show':''}">
        ${collaborative?'<strong>Collaborative selected.</strong> Choose the people whose batting perspective you want below.':''}
      </div>

      <div class="field">
        <label>Philosophy Lead — final approval and publishing</label>
        <select id="leadUser">
          ${members.map(m=>{
            const name=pMap.get(m.user_id)?.display_name||'Profile not completed';
            return `<option value="${m.user_id}" ${workshop?.philosophy_lead_user_id===m.user_id?'selected':''}>${esc(name)} · ${esc(labelInvolvement(m.involvement))}</option>`;
          }).join('')}
        </select>
      </div>

      <div id="contributorPicker" class="collaborative-panel ${collaborative?'show':''}">
        <div class="collab-intro">
          <div>
            <div class="section-label">Independent contributors</div>
            <h3>Who should have a say?</h3>
            <p>They answer privately first. They do not see everyone else's answers until they have submitted their own.</p>
          </div>
        </div>

        <label class="field-label">People already in this club</label>
        <div class="contributor-picker">
          ${members.map(m=>{
            const name=pMap.get(m.user_id)?.display_name||'Profile not completed';
            const selected=(contribRows||[]).some(c=>c.user_id===m.user_id);
            const isLead=m.user_id===workshop?.philosophy_lead_user_id;
            return `<label class="contributor-check ${isLead?'lead-person':''}">
              <input type="checkbox" data-contributor-user="${m.user_id}" ${selected||isLead?'checked':''} ${isLead?'disabled':''}>
              <span><strong>${esc(name)}${isLead?' · Philosophy Lead':''}</strong><small>${esc(labelInvolvement(m.involvement))}</small></span>
            </label>`;
          }).join('')}
        </div>

        <div class="external-invite-box">
          <div class="section-label">Not in the system yet?</div>
          <h3>Invite people by email</h3>
          <p class="help">Add everyone you want involved, then send the invitations together. They join as <strong>Philosophy Contributor only</strong> unless the Admin later gives them another role.</p>

          <div id="newContributorRows" class="new-contributor-rows">
            <div class="new-contributor-row" data-new-contributor-row>
              <div class="field"><label>Name</label><input data-new-name placeholder="e.g. Sam Brown"></div>
              <div class="field"><label>Email</label><input data-new-email type="email" placeholder="sam@example.com"></div>
              <button class="btn ghost remove-new-contributor" type="button" data-remove-new-contributor style="visibility:hidden">Remove</button>
            </div>
          </div>

          <button class="btn ghost add-person-btn" id="addContributorRow" type="button">+ Add another person</button>
          <div id="externalInviteStatus" class="help"></div>
          <div class="help">Prototype note: invitations are added to the Email Queue with secure links. Once the live email provider is connected, these will send automatically.</div>

          ${externalInvites?.length?`<div class="pending-invites">
            ${externalInvites.map(i=>`<div class="pending-invite-row">
              <div><strong>${esc(i.invited_name||i.invited_email)}</strong><small>${esc(i.invited_email)} · ${esc(i.status)}</small></div>
              <div class="member-controls">
                ${i.status==='pending'?`<button class="btn ghost" data-resend-philosophy-invite="${i.id}">Resend</button><button class="btn ghost" data-cancel-philosophy-invite="${i.id}">Cancel</button>`:''}
              </div>
            </div>`).join('')}
          </div>`:''}
        </div>

        <div class="notice compact"><strong>No committee meeting required.</strong><br>Invite people now; they complete their response independently when it suits them.</div>
      </div>

      <div class="btnrow">
        <button class="btn secondary" id="saveWorkshopSetup">${collaborative?'Save & send invitations':'Save Solo Workshop'}</button>
        <span class="status" id="workshopSetupStatus"></span>
      </div>
    </section>`;
  }

  html+=`<section class="card">
    <div class="section-label">Current workshop</div>
    <h2>${esc(workshopModeLabel())} philosophy process</h2>
    <div class="workshop-progress">
      <div><strong>${submittedCount}</strong><span>submitted</span></div>
      <div><strong>${Math.max(totalCount-submittedCount,0)}</strong><span>accepted / still to respond</span></div>
      <div><strong>${pendingExternal.length}</strong><span>email invitations pending</span></div>
    </div>`;

  if(me){
    html+=`<div class="my-response-card">
      <div>
        <div class="section-label">Your contribution</div>
        <strong>${esc(contributorStatusLabel(me.status))}</strong>
        <p>${me.status==='submitted'
          ?'Your independent response is locked. You can now review the synthesis when it is available.'
          :me.status==='in_progress'
            ?'Continue through Club Identity → What We Value → Format Emphasis. Other contributors cannot see your answers while you work.'
            :'You have been invited to contribute independently.'}</p>
      </div>
      <button class="btn secondary" id="myResponseAction">${me.status==='invited'?'Start my response':me.status==='in_progress'?'Continue my response':'Review my response'}</button>
    </div>`;
  }else if(!isAdmin()){
    html+=`<div class="notice">You have not been invited to contribute to this philosophy round.</div>`;
  }

  html+=`</section></div>`;

  if(isAdmin() || isPhilosophyLead()){
    html+=`<section class="card" style="margin-top:16px">
      <div class="section-label">Contribution progress</div>
      <h2>Independent responses</h2>
      <div class="member-list">
        ${(contribRows||[]).map(c=>{
          const name=pMap.get(c.user_id)?.display_name||'Contributor';
          return `<div class="member">
            <div><strong>${esc(name)}${c.user_id===workshop?.philosophy_lead_user_id?' · Philosophy Lead':''}</strong>
            <small>${esc(contributorStatusLabel(c.status))}</small></div>
            <div class="member-controls">
              ${c.status==='submitted' && isAdmin()?`<button class="btn ghost" data-reopen-contributor="${c.user_id}">Reopen</button>`:''}
            </div>
          </div>`;
        }).join('')||'<div class="notice">No accepted contributors selected yet.</div>'}
        ${pendingExternal.map(i=>`<div class="member">
          <div><strong>${esc(i.invited_name||i.invited_email)}</strong><small>Invitation sent · waiting to accept</small></div>
        </div>`).join('')}
      </div>
    </section>`;
  }

  if(canSeeSynthesis){
    const {data:responses}=await supabase
      .from('philosophy_contributions')
      .select('*')
      .eq('club_id',club.id)
      .not('submitted_at','is',null);

    if(responses?.length){
      html+=renderSynthesis(responses,pMap,allSubmitted);
    }
  }else if(totalCount>1 && me){
    html+=`<section class="card synthesis-locked" style="margin-top:16px">
      <div class="section-label">Synthesis</div>
      <h2>Submit first, then see the group picture.</h2>
      <div class="help">Responses stay independent while people are completing them. Once you submit, the system can show the areas of agreement and the areas worth discussing.</div>
    </section>`;
  }

  if(philosophyVersions.length){
    html+=`<section class="card" style="margin-top:16px">
      <div class="section-label">Published history</div>
      <h2>Club philosophy versions</h2>
      <div class="version-list">${philosophyVersions.map(v=>`
        <div class="version-row"><strong>Version ${v.version_number}</strong><span>${new Date(v.published_at).toLocaleDateString()}</span></div>`).join('')}</div>
    </section>`;
  }

  document.getElementById('page').innerHTML=html;

  const applyModeUI=()=>{
    const mode=document.querySelector('input[name="workshopMode"]:checked')?.value||'solo';
    const panel=document.getElementById('contributorPicker');
    const feedback=document.getElementById('modeFeedback');
    const save=document.getElementById('saveWorkshopSetup');
    const collaborativeNow=mode==='collaborative';

    if(panel)panel.classList.toggle('show',collaborativeNow);
    if(feedback){
      feedback.classList.toggle('show',collaborativeNow);
      feedback.innerHTML=collaborativeNow
        ?'<strong>Collaborative selected.</strong> Choose the people whose batting perspective you want below.'
        :'';
    }
    if(save)save.textContent=collaborativeNow?'Save & send invitations':'Save Solo Workshop';
  };

  document.querySelectorAll('.mode-card input').forEach(r=>r.onchange=()=>{
    document.querySelectorAll('.mode-card').forEach(x=>x.classList.toggle('on',x.querySelector('input').checked));
    applyModeUI();
  });

  if(document.getElementById('leadUser')){
    document.getElementById('leadUser').onchange=()=>{
      const lead=document.getElementById('leadUser').value;
      document.querySelectorAll('[data-contributor-user]').forEach(x=>{
        const isLead=x.dataset.contributorUser===lead;
        x.disabled=isLead;
        if(isLead)x.checked=true;
        x.closest('.contributor-check')?.classList.toggle('lead-person',isLead);
      });
    };
  }

  if(document.getElementById('saveWorkshopSetup')){
    document.getElementById('saveWorkshopSetup').onclick=()=>saveWorkshopSetup(contribRows||[],externalInvites||[]);
  }

  const refreshNewContributorRemoveButtons=()=>{
    const rows=[...document.querySelectorAll('[data-new-contributor-row]')];
    rows.forEach((row,i)=>{
      const remove=row.querySelector('[data-remove-new-contributor]');
      if(remove)remove.style.visibility=rows.length===1?'hidden':'visible';
    });
  };

  const wireNewContributorRows=()=>{
    document.querySelectorAll('[data-remove-new-contributor]').forEach(b=>{
      b.onclick=()=>{
        b.closest('[data-new-contributor-row]')?.remove();
        refreshNewContributorRemoveButtons();
      };
    });
    refreshNewContributorRemoveButtons();
  };

  if(document.getElementById('addContributorRow')){
    document.getElementById('addContributorRow').onclick=()=>{
      const wrap=document.getElementById('newContributorRows');
      const row=document.createElement('div');
      row.className='new-contributor-row';
      row.setAttribute('data-new-contributor-row','');
      row.innerHTML=`
        <div class="field"><label>Name</label><input data-new-name placeholder="e.g. Sam Brown"></div>
        <div class="field"><label>Email</label><input data-new-email type="email" placeholder="sam@example.com"></div>
        <button class="btn ghost remove-new-contributor" type="button" data-remove-new-contributor>Remove</button>`;
      wrap.appendChild(row);
      wireNewContributorRows();
      row.querySelector('[data-new-name]')?.focus();
    };
  }

  wireNewContributorRows();

  document.querySelectorAll('[data-resend-philosophy-invite]').forEach(b=>b.onclick=async()=>{
    b.textContent='Sending…';
    const {error}=await supabase.rpc('resend_philosophy_contributor_invite',{p_invite_id:b.dataset.resendPhilosophyInvite});
    if(error){alert(error.message);b.textContent='Resend';return;}
    b.textContent='Queued ✓';
  });

  document.querySelectorAll('[data-cancel-philosophy-invite]').forEach(b=>b.onclick=async()=>{
    const {error}=await supabase.rpc('cancel_philosophy_contributor_invite',{p_invite_id:b.dataset.cancelPhilosophyInvite});
    if(error){alert(error.message);return;}
    await renderWorkshop();
  });

  if(document.getElementById('myResponseAction')){
    document.getElementById('myResponseAction').onclick=async()=>{
      if(me.status==='invited'){
        const {error}=await supabase.rpc('start_my_philosophy_response',{p_club_id:club.id});
        if(error){alert(error.message);return;}
        await loadData();
      }
      currentTab='identity';
      renderShell();
    };
  }

  document.querySelectorAll('[data-reopen-contributor]').forEach(b=>b.onclick=async()=>{
    const {error}=await supabase.rpc('reopen_philosophy_contributor',{
      p_club_id:club.id,
      p_user_id:b.dataset.reopenContributor
    });
    if(error){alert(error.message);return;}
    await loadData();
    renderShell();
  });

  if(document.getElementById('buildFinalDraft')){
    document.getElementById('buildFinalDraft').onclick=()=>beginFinalDraftFromSynthesis();
  }
  if(document.getElementById('publishPhilosophy')){
    document.getElementById('publishPhilosophy').onclick=publishPhilosophy;
  }
}

async function saveWorkshopSetup(existingRows,externalInvites=[]){
  const s=document.getElementById('workshopSetupStatus');
  const btn=document.getElementById('saveWorkshopSetup');
  const externalStatus=document.getElementById('externalInviteStatus');

  const newPeople=[...document.querySelectorAll('[data-new-contributor-row]')]
    .map(row=>({
      name:row.querySelector('[data-new-name]')?.value.trim()||'',
      email:row.querySelector('[data-new-email]')?.value.trim()||''
    }))
    .filter(x=>x.name||x.email);

  if(newPeople.some(x=>!x.email || !x.email.includes('@'))){
    if(externalStatus)externalStatus.textContent='Each new person needs a valid email address.';
    return;
  }

  const emailSet=new Set();
  for(const person of newPeople){
    const e=person.email.toLowerCase();
    if(emailSet.has(e)){
      if(externalStatus)externalStatus.textContent=`${person.email} has been entered more than once.`;
      return;
    }
    emailSet.add(e);
  }

  s.textContent='Saving…';
  btn.disabled=true;

  const mode=document.querySelector('input[name="workshopMode"]:checked')?.value||'solo';
  const lead=document.getElementById('leadUser').value;
  let selected=mode==='solo'
    ?[lead]
    :[...document.querySelectorAll('[data-contributor-user]:checked')].map(x=>x.dataset.contributorUser);
  if(!selected.includes(lead))selected.push(lead);

  const {error:wErr}=await supabase
    .from('philosophy_workshops')
    .update({
      mode,
      philosophy_lead_user_id:lead,
      status:'collecting',
      final_draft_ready:false,
      updated_at:new Date().toISOString()
    })
    .eq('club_id',club.id);

  if(wErr){s.textContent=wErr.message;btn.disabled=false;return;}

  const existingMap=new Map(existingRows.map(x=>[x.user_id,x]));

  for(const userId of selected){
    if(!existingMap.has(userId)){
      const {error}=await supabase.rpc('invite_existing_philosophy_contributor',{
        p_club_id:club.id,p_user_id:userId
      });
      if(error){s.textContent=error.message;btn.disabled=false;return;}
    }
  }

  for(const row of existingRows){
    if(!selected.includes(row.user_id)){
      const {error}=await supabase
        .from('philosophy_contributors')
        .delete()
        .eq('club_id',club.id)
        .eq('user_id',row.user_id);
      if(error){s.textContent=error.message;btn.disabled=false;return;}
    }
  }

  if(mode==='collaborative' && newPeople.length){
    if(externalStatus)externalStatus.textContent=`Queuing ${newPeople.length} invitation${newPeople.length===1?'':'s'}…`;

    for(const person of newPeople){
      const {error}=await supabase.rpc('invite_philosophy_contributor_by_email',{
        p_club_id:club.id,
        p_name:person.name,
        p_email:person.email
      });
      if(error){
        if(externalStatus)externalStatus.textContent=error.message;
        s.textContent='Some invitations were not sent.';
        btn.disabled=false;
        return;
      }
    }

    if(externalStatus)externalStatus.textContent=`${newPeople.length} invitation${newPeople.length===1?'':'s'} queued ✓`;
  }

  if(mode==='solo'){
    for(const invite of externalInvites.filter(x=>x.status==='pending')){
      await supabase.rpc('cancel_philosophy_contributor_invite',{p_invite_id:invite.id});
    }
  }

  s.textContent=mode==='collaborative'?'Saved — invitations queued ✓':'Solo workshop saved ✓';
  await loadData();
  setTimeout(()=>renderShell(),350);
}

function consensusClass(ratio){
  if(ratio>=.8 || ratio<=.2)return {label:'Strong agreement',cls:'strong'};
  if(ratio>=.65 || ratio<=.35)return {label:'General agreement',cls:'general'};
  return {label:'Needs discussion',cls:'discuss'};
}

function median(nums){
  if(!nums.length)return 2;
  const a=[...nums].sort((x,y)=>x-y);
  const mid=Math.floor(a.length/2);
  return a.length%2?a[mid]:Math.round((a[mid-1]+a[mid])/2);
}

function buildSynthesis(responses){
  const n=responses.length;
  const identity=[];
  for(const [key,label] of IDENTITY_OPTIONS){
    const count=responses.filter(r=>(r.identity_values||[]).includes(key)).length;
    identity.push({key,label,count,ratio:count/n,...consensusClass(count/n)});
  }

  const dims=dimensions.map(d=>{
    const count=responses.filter(r=>(r.selected_dimensions||[]).includes(d.dimension_key)).length;
    return {key:d.dimension_key,label:d.label,count,ratio:count/n,...consensusClass(count/n)};
  });

  const weightRows=[];
  for(const d of dimensions){
    for(const [f,flabel] of FORMATS){
      const vals=responses
        .filter(r=>(r.selected_dimensions||[]).includes(d.dimension_key) && r.formats_enabled?.[f]!==false)
        .map(r=>Number(r.format_weights?.[`${d.dimension_key}:${f}`]))
        .filter(v=>Number.isFinite(v));
      if(!vals.length)continue;
      const min=Math.min(...vals),max=Math.max(...vals),spread=max-min;
      weightRows.push({
        key:d.dimension_key,dimension:d.label,format:f,formatLabel:flabel,
        values:vals,median:median(vals),min,max,spread,
        label:spread<=1?'Strong agreement':spread===2?'Some variation':'Needs discussion',
        cls:spread<=1?'strong':spread===2?'general':'discuss'
      });
    }
  }

  const flags=[
    ...identity.filter(x=>x.cls==='discuss').map(x=>`${x.label}: contributors are split on whether this belongs in the core identity.`),
    ...dims.filter(x=>x.cls==='discuss').map(x=>`${x.label}: contributors are split on whether this belongs in the batting system.`),
    ...weightRows.filter(x=>x.cls==='discuss').map(x=>`${x.dimension} · ${x.formatLabel}: emphasis ranges from ${WEIGHT_LABELS[x.min]} to ${WEIGHT_LABELS[x.max]}.`)
  ];

  return {n,identity,dims,weightRows,flags};
}

function buildConsensusDraft(responses){
  const s=buildSynthesis(responses);
  const identityValues=s.identity.filter(x=>x.ratio>.5).map(x=>x.key);
  const selectedDimensions=s.dims.filter(x=>x.ratio>.5).map(x=>x.key);

  const formatsEnabled={};
  for(const [f] of FORMATS){
    formatsEnabled[f]=responses.filter(r=>r.formats_enabled?.[f]!==false).length/responses.length>.5;
  }

  const formatWeights={};
  for(const k of selectedDimensions){
    for(const [f] of FORMATS){
      const vals=responses
        .filter(r=>(r.selected_dimensions||[]).includes(k) && r.formats_enabled?.[f]!==false)
        .map(r=>Number(r.format_weights?.[`${k}:${f}`]))
        .filter(v=>Number.isFinite(v));
      formatWeights[`${k}:${f}`]=median(vals);
    }
  }

  return {
    identity_values:identityValues,
    identity_note:'',
    formats_enabled:formatsEnabled,
    selected_dimensions:selectedDimensions,
    dimension_notes:{},
    format_weights:formatWeights
  };
}

function renderSynthesis(responses,pMap,allSubmitted){
  const syn=buildSynthesis(responses);
  const leadReady=isPhilosophyLead() && myContributor?.status==='submitted';
  const canPublish=isPhilosophyLead() && workshop?.final_draft_ready && myContributor?.status==='submitted';

  return `<section class="card synthesis" style="margin-top:16px">
    <div class="section-label">Curated group picture</div>
    <h2>What the contributors seem to be saying</h2>
    <div class="help">This synthesis does not average disagreements away. It highlights consensus, variation and the places where a human conversation is worth having.</div>

    ${!allSubmitted?`<div class="notice">This is provisional: ${syn.n} submitted response${syn.n===1?'':'s'} are currently included. It will update as others submit.</div>`:''}

    <h3>Club identity</h3>
    <div class="consensus-grid">${syn.identity.filter(x=>x.ratio>=.35).map(x=>`
      <div class="consensus-item ${x.cls}">
        <div><strong>${esc(x.label)}</strong><small>${x.count} of ${syn.n} selected this</small></div>
        <span>${x.label && esc(x.label) && esc(consensusClass(x.ratio).label)}</span>
      </div>`).join('')}</div>

    <h3>What belongs in the batting system</h3>
    <div class="consensus-grid">${syn.dims.filter(x=>x.ratio>=.35).map(x=>`
      <div class="consensus-item ${x.cls}">
        <div><strong>${esc(x.label)}</strong><small>${x.count} of ${syn.n} selected this</small></div>
        <span>${esc(consensusClass(x.ratio).label)}</span>
      </div>`).join('')}</div>

    <h3>Format emphasis</h3>
    <div class="synthesis-table-wrap"><table class="synthesis-table">
      <thead><tr><th>Dimension</th><th>Format</th><th>Typical emphasis</th><th>Spread</th><th></th></tr></thead>
      <tbody>${syn.weightRows.map(x=>`
        <tr class="${x.cls}">
          <td>${esc(x.dimension)}</td>
          <td>${esc(x.formatLabel)}</td>
          <td>${esc(WEIGHT_LABELS[x.median])}</td>
          <td>${esc(WEIGHT_LABELS[x.min])}${x.min!==x.max?` → ${esc(WEIGHT_LABELS[x.max])}`:''}</td>
          <td><span class="consensus-badge ${x.cls}">${esc(x.label)}</span></td>
        </tr>`).join('')}</tbody>
    </table></div>

    <h3>Discussion prompts</h3>
    ${syn.flags.length
      ?`<div class="discussion-list">${syn.flags.map(x=>`<div class="discussion-flag">⚑ ${esc(x)}</div>`).join('')}</div>`
      :'<div class="notice">No major splits are showing in the submitted responses.</div>'}

    ${renderSourceComments(responses,pMap)}

    ${isPhilosophyLead()?`<div class="lead-actions">
      <div>
        <div class="section-label">Philosophy Lead</div>
        <strong>${workshop?.final_draft_ready?'Final draft stage':'Turn the synthesis into a working draft'}</strong>
        <p>${workshop?.final_draft_ready
          ?'Adjust the draft through the three philosophy pages, submit it, then publish when you are satisfied.'
          :'Use the majority view and median format weightings as a starting point. Discussion flags are deliberately not “solved” for you — you make the final call.'}</p>
      </div>
      ${workshop?.final_draft_ready
        ?(canPublish?'<button class="btn secondary" id="publishPhilosophy">Approve & publish club philosophy</button>':'<button class="btn secondary" id="myResponseAction2">Continue final draft</button>')
        :(leadReady?'<button class="btn secondary" id="buildFinalDraft">Create final draft from synthesis</button>':'<span class="help">Submit your own independent response before creating the final draft.</span>')}
    </div>`:''}
  </section>`;
}

function renderSourceComments(responses,pMap){
  const items=[];
  for(const r of responses){
    const name=pMap.get(r.user_id)?.display_name||'Contributor';
    if(r.identity_note)items.push(`<div class="source-comment"><strong>${esc(name)} · Club Identity</strong><p>${esc(r.identity_note)}</p></div>`);
    const notes=r.dimension_notes||{};
    for(const [k,note] of Object.entries(notes)){
      if(!note)continue;
      const label=dimensions.find(d=>d.dimension_key===k)?.label||k;
      items.push(`<div class="source-comment"><strong>${esc(name)} · ${esc(label)}</strong><p>${esc(note)}</p></div>`);
    }
  }
  if(!items.length)return '';
  return `<details class="source-responses"><summary>View source comments</summary><div class="source-comments">${items.join('')}</div></details>`;
}

async function beginFinalDraftFromSynthesis(){
  const {data:responses,error}=await supabase
    .from('philosophy_contributions')
    .select('*')
    .eq('club_id',club.id)
    .not('submitted_at','is',null);

  if(error){alert(error.message);return;}
  if(!responses?.length){alert('No submitted responses yet.');return;}

  const draft=buildConsensusDraft(responses);
  const ok=confirm('Create a final working draft from the group synthesis? You will still be able to change every choice before publishing.');
  if(!ok)return;

  const {error:e}=await supabase.rpc('begin_final_philosophy_draft',{
    p_club_id:club.id,
    p_identity_values:draft.identity_values,
    p_identity_note:draft.identity_note,
    p_formats_enabled:draft.formats_enabled,
    p_selected_dimensions:draft.selected_dimensions,
    p_dimension_notes:draft.dimension_notes,
    p_format_weights:draft.format_weights
  });
  if(e){alert(e.message);return;}

  await loadData();
  currentTab='identity';
  renderShell();
}

async function publishPhilosophy(){
  const firstPublish=philosophyVersions.length===0;
  const ok=confirm(firstPublish
    ?'Publish this as the club’s first official batting philosophy? This will open Player Plans and queue the “your Player Plan is ready” message for every current Player / Both member.'
    :'Publish this as the club’s new official batting philosophy version? The current published version stays live until you confirm.');
  if(!ok)return;

  let notifyPlayers=firstPublish;
  if(!firstPublish){
    notifyPlayers=confirm('Would you also like to queue a notification to current players about this philosophy update?');
  }

  const {data,error}=await supabase.rpc('publish_philosophy',{
    p_club_id:club.id,
    p_notify_players:notifyPlayers
  });
  if(error){alert(error.message);return;}

  alert(firstPublish
    ?`Published as Club Philosophy v${data}. Player Plans are now open and player notification messages have been queued.`
    :`Published as Club Philosophy v${data}.`);
  await loadData();
  currentTab='dashboard';
  renderShell();
}

/* ---------------- CLUB PHILOSOPHY RESPONSE ---------------- */

/* ---------------- CLUB PHILOSOPHY ---------------- */


function identitySummary(){
  const chosen=IDENTITY_OPTIONS.filter(([k])=>(clubProfile.identity_values||[]).includes(k)).map(([,l])=>l.toLowerCase());
  if(!chosen.length)return 'Choose the ideas that should remain true regardless of format.';
  return `Across formats, ${club.name} wants batters who ${naturalList(chosen)}.`;
}

function renderIdentity(){
  if(!myContribution){
    document.getElementById('page').innerHTML=`<div class="card"><h2>Start your philosophy response first.</h2>
      <div class="help">Go to Philosophy Workshop and choose “Start my response”.</div>
      <div class="btnrow"><button class="btn secondary" id="backWorkshop">Go to Philosophy Workshop</button></div></div>`;
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
    return;
  }

  const locked=contributionLocked();
  document.getElementById('page').innerHTML=`${locked?'<div class="submitted-banner">✓ Independent response submitted. It is locked so the group synthesis cannot influence your original answers.</div>':''}
  <div class="grid">
    <section class="card">
      <div class="section-label">What should survive every format?</div>
      <h2>Club batting identity</h2>
      <div class="help">Choose everything that feels genuinely true of your club. Format-specific priorities come later.</div>
      <div class="choice-grid">${IDENTITY_OPTIONS.map(([k,l,d])=>`
        <label class="choice ${(clubProfile.identity_values||[]).includes(k)?'on':''}">
          <input type="checkbox" data-identity="${k}" ${(clubProfile.identity_values||[]).includes(k)?'checked':''} ${locked?'disabled':''}>
          <strong>${esc(l)}</strong><p>${esc(d)}</p>
        </label>`).join('')}</div>
      <div class="field"><label>Anything these choices don’t capture? (optional)</label>
        <textarea id="identityNote" placeholder="Add nuance in your own words…" ${locked?'disabled':''}>${esc(clubProfile.identity_note||'')}</textarea>
      </div>
    </section>
    <section class="card">
      <div class="section-label">Formats your club plays</div>
      <h2>Which versions of the game matter here?</h2>
      <div class="formats">${FORMATS.map(([k,l])=>`
        <label class="format-chip"><input type="checkbox" data-format="${k}" ${clubProfile.formats_enabled?.[k]!==false?'checked':''} ${locked?'disabled':''}>${l}</label>`).join('')}
      </div>
      <div class="identity-summary"><div class="title">What we’re hearing</div><p id="identitySummary">${esc(identitySummary())}</p></div>
      <div id="identityError" class="notice" style="display:none;background:#fff0f0;color:#9f1d1d;border:1px solid #efb8b8"></div>
      <div class="btnrow">
        ${locked
          ?'<button class="btn secondary" id="backWorkshop">Return to Philosophy Workshop</button>'
          :'<button class="btn secondary" id="saveIdentity">Save & continue</button><span class="status" id="identityStatus"></span>'}
      </div>
    </section>
  </div>`;

  if(locked){
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
    return;
  }

  document.querySelectorAll('[data-identity]').forEach(x=>x.onchange=()=>{
    x.closest('.choice').classList.toggle('on',x.checked);
    collectIdentity(false);
    document.getElementById('identitySummary').textContent=identitySummary();
  });

  document.getElementById('saveIdentity').onclick=async()=>{
    const btn=document.getElementById('saveIdentity');
    const err=document.getElementById('identityError');
    collectIdentity(true);
    btn.disabled=true;
    btn.textContent='Saving…';
    err.style.display='none';
    err.textContent='';
    const ok=await saveClubProfile('identityStatus');
    if(ok){
      btn.textContent='Saved ✓';
      setTimeout(()=>{currentTab='dimensions';renderTab();},300);
    }else{
      btn.disabled=false;
      btn.textContent='Save & continue';
    }
  };
}

function collectIdentity(withNote=true){
  clubProfile.identity_values=[...document.querySelectorAll('[data-identity]:checked')].map(x=>x.dataset.identity);
  clubProfile.formats_enabled=Object.fromEntries(FORMATS.map(([k])=>[k,!!document.querySelector(`[data-format="${k}"]`)?.checked]));
  if(withNote)clubProfile.identity_note=val('identityNote');
}

async function saveClubProfile(statusId){
  const s=document.getElementById(statusId);
  const errBox=document.getElementById('identityError');
  if(s)s.textContent='Saving…';

  const payload={
    identity_values:clubProfile.identity_values||[],
    identity_note:clubProfile.identity_note||'',
    formats_enabled:clubProfile.formats_enabled||{t20:true,limited_overs:true,long_form:true},
    updated_at:new Date().toISOString()
  };

  const {data,error}=await supabase
    .from('philosophy_contributions')
    .update(payload)
    .eq('club_id',club.id)
    .eq('user_id',session.user.id)
    .select('*')
    .single();

  if(error){
    if(s)s.textContent='';
    if(errBox){
      errBox.style.display='block';
      errBox.innerHTML=`<strong>Couldn’t save yet.</strong><br>${esc(error.message)}<br><br>Nothing has been lost.`;
    }
    return false;
  }

  myContribution=data;
  if(s)s.textContent='Saved';
  return true;
}

function renderDimensions(){
  if(!myContribution){currentTab='workshop';renderTab();return;}
  const locked=contributionLocked();

  document.getElementById('page').innerHTML=`${locked?'<div class="submitted-banner">✓ Independent response submitted and locked.</div>':''}
  <div class="grid">
    <section class="card">
      <div class="section-label">Stimulus, not a prescription</div>
      <h2>Which ideas belong in your batting system?</h2>
      <div class="help">Select broadly. You are not ranking them here.</div>
      <div class="dimension-list">${dimensions.map(d=>{
        const on=selectedDims.has(d.dimension_key);
        return `<label class="dimension ${on?'on':''}">
          <input type="checkbox" data-dim="${d.dimension_key}" ${on?'checked':''} ${locked?'disabled':''}>
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
      <div class="btnrow">
        ${locked
          ?'<button class="btn secondary" id="backWorkshop">Return to Philosophy Workshop</button>'
          :'<button class="btn secondary" id="saveDims">Save & set format emphasis</button><span class="status" id="dimStatus"></span>'}
      </div>
    </section>
  </div>`;

  if(!locked){
    document.querySelectorAll('[data-dim]').forEach(x=>x.onchange=()=>{
      x.closest('.dimension').classList.toggle('on',x.checked);
      renderDimensionNotes();
    });
  }
  renderDimensionNotes();

  if(locked){
    document.querySelectorAll('[data-dim-note]').forEach(x=>x.disabled=true);
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
  }else{
    document.getElementById('saveDims').onclick=saveDimensions;
  }
}

function renderDimensionNotes(){
  const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
  const locked=contributionLocked();
  document.getElementById('dimensionNotes').innerHTML=keys.length?keys.map(k=>{
    const d=dimensions.find(x=>x.dimension_key===k);
    const note=selectedDims.get(k)?.club_note||'';
    return `<div class="field"><label>${esc(d.label)} — anything specific? (optional)</label>
      <textarea data-dim-note="${k}" placeholder="Leave blank if the selections already say enough…" ${locked?'disabled':''}>${esc(note)}</textarea></div>`;
  }).join(''):'<div class="notice">Choose some dimensions on the left first.</div>';
}

async function saveDimensions(){
  const s=document.getElementById('dimStatus');
  s.textContent='Saving…';
  const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
  const notes={};
  for(const k of keys){
    notes[k]=document.querySelector(`[data-dim-note="${k}"]`)?.value.trim()||'';
  }

  selectedDims=new Map(keys.map(k=>[
    k,
    {club_id:club.id,dimension_key:k,enabled:true,club_note:notes[k]||''}
  ]));
  initialiseMissingWeights();

  const payload={
    selected_dimensions:keys,
    dimension_notes:notes,
    format_weights:Object.fromEntries(weights),
    updated_at:new Date().toISOString()
  };

  const {data,error}=await supabase
    .from('philosophy_contributions')
    .update(payload)
    .eq('club_id',club.id)
    .eq('user_id',session.user.id)
    .select('*')
    .single();

  if(error){s.textContent=error.message;return;}

  myContribution=data;
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

function publishedEnabledFormats(){
  return FORMATS.filter(([k])=>publishedProfile.formats_enabled?.[k]!==false);
}

function renderFormats(){
  if(!myContribution){currentTab='workshop';renderTab();return;}
  initialiseMissingWeights();
  const formats=enabledFormats();
  const locked=contributionLocked();

  document.getElementById('page').innerHTML=`${locked?'<div class="submitted-banner">✓ Independent response submitted and locked.</div>':''}
  <div class="card">
    <div class="section-label">When does each thing matter most?</div>
    <h2>Format emphasis</h2>
    <div class="help">Nothing is globally ranked. Set the emphasis for each selected dimension in each format.</div>
    ${formats.length?`<div class="matrix-wrap"><table class="matrix"><thead><tr><th>Batting dimension</th>${formats.map(([,l])=>`<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${[...selectedDims.keys()].map(k=>{
        const d=dimensions.find(x=>x.dimension_key===k);
        return `<tr><td class="dimname">${esc(d?.label||k)}</td>${formats.map(([f])=>`
          <td><select class="weight" data-weight-key="${k}:${f}" ${locked?'disabled':''}>
            ${WEIGHT_LABELS.map((l,i)=>`<option value="${i}" ${Number(weights.get(`${k}:${f}`)??2)===i?'selected':''}>${l}</option>`).join('')}
          </select></td>`).join('')}</tr>`;
      }).join('')}
    </tbody></table></div>`:'<div class="notice">No formats are enabled.</div>'}
    <div class="btnrow">
      ${locked
        ?'<button class="btn secondary" id="backWorkshop">Return to Philosophy Workshop</button>'
        :'<button class="btn secondary" id="saveWeights">Save & generate How We Bat</button><span class="status" id="weightStatus"></span>'}
    </div>
  </div>`;

  if(locked){
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
  }else{
    document.getElementById('saveWeights').onclick=async()=>{
      document.querySelectorAll('[data-weight-key]').forEach(x=>weights.set(x.dataset.weightKey,Number(x.value)));
      const ok=await saveWeights('weightStatus');
      if(ok){currentTab='preview';renderTab();}
    };
  }
}

async function saveWeights(statusId){
  const s=statusId?document.getElementById(statusId):null;
  if(s)s.textContent='Saving…';

  const payload={
    format_weights:Object.fromEntries(weights),
    updated_at:new Date().toISOString()
  };

  const {data,error}=await supabase
    .from('philosophy_contributions')
    .update(payload)
    .eq('club_id',club.id)
    .eq('user_id',session.user.id)
    .select('*')
    .single();

  if(error){if(s)s.textContent=error.message;return false;}
  myContribution=data;
  if(s)s.textContent='Saved';
  return true;
}

function topEmphasisFrom(format,dimsMap,weightMap){
  return [...dimsMap.keys()]
    .map(k=>({
      key:k,
      weight:Number(weightMap.get(`${k}:${format}`)??0),
      d:dimensions.find(x=>x.dimension_key===k)
    }))
    .filter(x=>x.weight>0)
    .sort((a,b)=>b.weight-a.weight||(a.d?.sort_order||999)-(b.d?.sort_order||999));
}

function topEmphasis(format){
  return topEmphasisFrom(format,selectedDims,weights);
}

function publishedTopEmphasis(format){
  return topEmphasisFrom(format,publishedSelectedDims,publishedWeights);
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
  if(!myContribution){currentTab='workshop';renderTab();return;}
  const formats=enabledFormats();
  if(!formats.some(([k])=>k===previewFormat))previewFormat=formats[0]?.[0]||'limited_overs';
  const identity=identitySummary()+(clubProfile.identity_note?` ${clubProfile.identity_note}`:'');
  const locked=contributionLocked();

  document.getElementById('page').innerHTML=`${locked?'<div class="submitted-banner">✓ This is your locked independent response.</div>':''}
  <div class="grid">
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
      <div class="section-label">${workshop?.final_draft_ready && isPhilosophyLead()?'Final working draft':'Your independent response'}</div>
      <h2>${locked?'Response submitted':'Ready to contribute your view?'}</h2>
      <div class="help">${locked
        ?'Your original response is now locked. Return to the Workshop to see the synthesis when available.'
        :'Submitting locks this response before you see what everyone else has said. That keeps each contribution genuinely independent.'}</div>
      <div class="btnrow">
        ${locked
          ?'<button class="btn secondary" id="backWorkshop">Return to Philosophy Workshop</button>'
          :'<button class="btn secondary" id="submitPhilosophy">Submit my philosophy response</button>'}
        <button class="btn ghost" id="toPlan">See Player Plan structure</button>
        <span class="status" id="submitPhilosophyStatus"></span>
      </div>
    </section>
  </div>`;

  document.querySelectorAll('[data-preview-format]').forEach(b=>b.onclick=()=>{previewFormat=b.dataset.previewFormat;renderPreview();});
  document.getElementById('toPlan').onclick=()=>{currentTab='plan';renderTab();};
  if(locked){
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
  }else{
    document.getElementById('submitPhilosophy').onclick=submitPhilosophyResponse;
  }
}

function overlayModules(format){
  return topEmphasis(format)
    .filter(x=>x.weight>=2 && QUESTION_LIBRARY[x.key])
    .map(x=>({key:x.key,label:questionSpecFor(format,x.key).label,weight:x.weight}));
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

async function submitPhilosophyResponse(){
  const s=document.getElementById('submitPhilosophyStatus');
  if(s)s.textContent='Submitting…';

  const {error}=await supabase.rpc('submit_my_philosophy_response',{p_club_id:club.id});
  if(error){if(s)s.textContent=error.message;return;}

  await loadData();
  currentTab='workshop';
  renderShell();
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
  const [{data:profiles},{data:grants},{data:players},{data:pendingHandovers}]=await Promise.all([
    userIds.length?supabase.from('user_profiles').select('*').in('user_id',userIds):Promise.resolve({data:[]}),
    supabase.from('club_access_grants').select('*').eq('club_id',club.id),
    supabase.from('players').select('id,user_id,display_name,grade,active').eq('club_id',club.id),
    supabase.from('club_admin_handovers').select('*').eq('club_id',club.id).eq('status','pending').order('created_at',{ascending:false}).limit(1)
  ]);

  const pMap=new Map((profiles||[]).map(p=>[p.user_id,p]));
  const grantMap=new Map();
  for(const g of grants||[]){
    if(!grantMap.has(g.user_id))grantMap.set(g.user_id,[]);
    grantMap.get(g.user_id).push(g);
  }

  const grades=[...new Set((players||[]).map(p=>p.grade).filter(Boolean))].sort();
  const activePlayerCount=(players||[]).filter(p=>p.active!==false).length;
  const leadAdminId=club.lead_admin_user_id;
  const leadAdminName=pMap.get(leadAdminId)?.display_name||'Club Admin';
  const amLeadAdmin=leadAdminId===session.user.id;
  const pendingHandover=(pendingHandovers||[])[0]||null;
  const playerJoinLink=`${location.origin}${location.pathname}?player_join=${encodeURIComponent(club.player_join_token||'')}`;
  const staffJoinLink=`${location.origin}${location.pathname}?join=${encodeURIComponent(club.join_code||'')}`;
  const signupOpen=club.player_signup_open!==false;

  document.getElementById('page').innerHTML=`<div class="grid permissions-top-grid">
    <section class="card player-signup-card">
      <div class="section-label">Player sign-up</div>
      <h2>One post. Players register themselves.</h2>
      <div class="help">Post the WhatsApp message in the players chat, or use the QR code at training / on a noticeboard. Everyone coming through this route joins automatically as a <strong>Player</strong>.</div>

      <div class="signup-status-row">
        <div>
          <span class="signup-pill ${signupOpen?'open':'closed'}">${signupOpen?'● SIGN-UP OPEN':'○ SIGN-UP CLOSED'}</span>
          <div class="signup-count"><strong>${activePlayerCount}</strong> players registered</div>
        </div>
        <button class="btn ghost" id="togglePlayerSignup">${signupOpen?'Close sign-up':'Open sign-up'}</button>
      </div>

      <div class="player-share-layout">
        <div class="qr-panel">
          <div class="qr-frame">
            <img id="playerSignupQR" alt="${esc(club.name)} player sign-up QR code" style="display:none">
            <div id="qrFallback" class="qr-loading">Generating QR…</div>
          </div>
          <a class="btn ghost" id="downloadPlayerQR" style="display:none">Download QR image</a>
        </div>

        <div class="share-actions">
          <h3>For the Players WhatsApp chat</h3>
          <p>Use the message button — the link is easier for players who are already reading it on their phone.</p>
          <button class="btn secondary" id="copyPlayerWhatsApp">Copy WhatsApp message</button>
          <button class="btn ghost" id="copyPlayerLink">Copy player sign-up link</button>
          <div id="playerShareStatus" class="help"></div>

          <div class="share-preview">
            <strong>What players experience</strong>
            <span>Open link → enter email → secure sign-in → confirm name → joined as Player.</span>
          </div>
        </div>
      </div>

      <div class="join-security-row">
        <div>
          <strong>Need to replace the link?</strong>
          <span>Regenerating invalidates the old Player link and QR immediately.</span>
        </div>
        <button class="btn ghost" id="regeneratePlayerLink">Regenerate link & QR</button>
      </div>
    </section>

    <section class="card">
      <div class="section-label">Captain / Coach permissions</div>
      <h2>Everyone who plays joins as a Player first.</h2>

      <div class="notice">
        <strong>Playing captain or coach?</strong><br>
        Use the normal <strong>Player sign-up</strong> above. Once they appear in the club, the Admin adds their Captain/Coach role and chooses what they can view or edit.
      </div>

      <div class="help" style="margin-top:14px">
        This means there is only <strong>one normal sign-up process for the playing group</strong>. Captains and player-coaches do not need a different link or a second account.
      </div>

      <div class="permission-explainer">
        <strong>Rare exception: non-playing coach</strong>
        <span>If someone coaches the club but does not play, they need a staff-only join link because they should not receive a Player Plan.</span>
      </div>

      <div class="btnrow">
        <button class="btn ghost" id="copyStaffJoinLink">Copy non-playing coach sign-up link</button>
      </div>
      <div id="staffJoinStatus" class="help"></div>

      <div class="permission-explainer">
        <strong>Viewing follows access.</strong>
        <span>Grade-based access follows the player automatically when their grade changes. Editing is assigned separately.</span>
      </div>
    </section>
  </div>

  <section class="card admin-continuity-card" style="margin-top:16px">
    <div class="admin-continuity-head">
      <div>
        <div class="section-label">Admin continuity</div>
        <h2>Lead Admin</h2>
        <div class="help">A club can have several Club Admins. The <strong>Lead Admin</strong> is simply the current custodian responsible for formally handing the system to the next person when committee or coaching roles change.</div>
      </div>
      <div class="lead-admin-badge">
        <span>Current Lead Admin</span>
        <strong>${esc(leadAdminName)}</strong>
      </div>
    </div>

    ${pendingHandover?`
      <div class="handover-pending">
        <div>
          <strong>Handover pending</strong>
          <span>${esc(pendingHandover.invited_name||pendingHandover.invited_email)} has been nominated. Nothing changes until they accept.</span>
        </div>
        ${amLeadAdmin?`<button class="btn ghost" id="cancelLeadHandover">Cancel handover</button>`:''}
      </div>
    `:amLeadAdmin?`
      <div class="handover-start">
        <div>
          <strong>Leaving the role?</strong>
          <span>Use a formal handover rather than changing Admin permissions manually. Your successor accepts first, then they decide what access you retain.</span>
        </div>
        <button class="btn secondary" id="openLeadHandover">Hand over Lead Admin</button>
      </div>

      <div id="leadHandoverForm" class="lead-handover-form" style="display:none">
        <div class="section-label">Choose your successor</div>
        <div class="handover-successor-choice">
          <label class="handover-option on">
            <input type="radio" name="handoverSuccessorType" value="existing" checked>
            <strong>Someone already in this club</strong>
            <span>Choose any registered player, coach, captain or existing Admin.</span>
          </label>
          <label class="handover-option">
            <input type="radio" name="handoverSuccessorType" value="external">
            <strong>Someone not in the system yet</strong>
            <span>Send the handover directly to their email.</span>
          </label>
        </div>

        <div id="existingSuccessorBox">
          <div class="field">
            <label>Successor</label>
            <select id="handoverExistingUser">
              <option value="">Choose a person…</option>
              ${(members||[]).filter(m=>m.user_id!==session.user.id).map(m=>{
                const nm=pMap.get(m.user_id)?.display_name||'Profile not completed';
                return `<option value="${m.user_id}">${esc(nm)} · ${esc(labelInvolvement(m.involvement))}</option>`;
              }).join('')}
            </select>
          </div>
        </div>

        <div id="externalSuccessorBox" style="display:none">
          <div class="grid handover-external-grid">
            <div class="field"><label>Name</label><input id="handoverExternalName" placeholder="Full name"></div>
            <div class="field"><label>Email</label><input id="handoverExternalEmail" type="email" placeholder="name@example.com"></div>
          </div>
        </div>

        <div class="notice"><strong>Your access does not change when you send this.</strong><br>The nominated person must accept the handover. During acceptance, they set your new club role and access — including removing your club access entirely if you have left.</div>

        <div class="btnrow">
          <button class="btn secondary" id="sendLeadHandover">Send handover</button>
          <button class="btn ghost" id="closeLeadHandover">Cancel</button>
          <span class="status" id="leadHandoverFormStatus"></span>
        </div>

        <div id="leadHandoverTestLink" class="test-link-box" style="display:none"></div>
      </div>
    `:`
      <div class="notice"><strong>${esc(leadAdminName)} is responsible for the next formal handover.</strong><br>Other Club Admins still have full administration access, but the Lead Admin designation cannot be casually removed through the permission dropdowns.</div>
    `}
  </section>

  <section class="card" style="margin-top:16px">
    <div class="section-label">Club people</div>
    <h2>Roles & access</h2>
    <div class="member-list">${(members||[]).map(m=>{
      const prof=pMap.get(m.user_id);
      const name=prof?.display_name||'Profile not completed';
      const gs=grantMap.get(m.user_id)||[];
      let access='pending',grade='';
      if(gs.some(g=>g.scope==='whole_club'&&g.can_edit))access='whole_edit';
      else if(gs.some(g=>g.scope==='whole_club'&&g.can_view))access='whole_view';
      else if(gs.some(g=>g.scope==='grade'&&g.can_edit)){access='grade_edit';grade=gs.find(g=>g.scope==='grade'&&g.can_edit)?.grade||'';}
      else if(gs.some(g=>g.scope==='grade'&&g.can_view)){access='grade_view';grade=gs.find(g=>g.scope==='grade'&&g.can_view)?.grade||'';}

      const isLead=m.user_id===leadAdminId;
      const selfAdmin=m.user_id===session.user.id && m.permission_role==='admin';

      if(isLead){
        return `<div class="member">
          <div>
            <strong>${esc(name)}${m.user_id===session.user.id?' · You':''}</strong>
            <small>${esc(labelInvolvement(m.involvement))}</small>
          </div>
          <div class="primary-admin-summary lead">
            <strong>Lead Admin</strong>
            <span>Full club access · formal handover required</span>
          </div>
        </div>`;
      }

      if(selfAdmin){
        return `<div class="member">
          <div>
            <strong>${esc(name)} · You</strong>
            <small>${esc(labelInvolvement(m.involvement))}</small>
          </div>
          <div class="primary-admin-summary">
            <strong>Club Admin</strong>
            <span>Full club access</span>
          </div>
        </div>`;
      }

      return `<div class="member">
        <div>
          <strong>${esc(name)}${m.user_id===session.user.id?' · You':''}</strong>
          <small>${esc(labelInvolvement(m.involvement))}</small>
          ${m.permission_role==='none'&&m.involvement!=='player'?'<span class="pending">ACCESS PENDING</span>':''}
        </div>
        <div class="member-controls">
          <select data-role-user="${m.user_id}">
            ${[
              ['none','No special role'],
              ['captain','Captain'],
              ['coach','Coach'],
              ['head_coach','Head Coach'],
              ['admin','Admin']
            ].map(([v,l])=>`<option value="${v}" ${m.permission_role===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <select data-access-user="${m.user_id}">
            <option value="pending" ${access==='pending'?'selected':''}>No assigned access</option>
            <option value="whole_view" ${access==='whole_view'?'selected':''}>Whole club · view</option>
            <option value="whole_edit" ${access==='whole_edit'?'selected':''}>Whole club · view + edit</option>
            <option value="grade_view" ${access==='grade_view'?'selected':''}>One grade · view</option>
            <option value="grade_edit" ${access==='grade_edit'?'selected':''}>One grade · view + edit</option>
          </select>
          <input data-grade-user="${m.user_id}" placeholder="Grade" value="${esc(grade)}" list="gradeList">
          <button class="btn ghost" data-save-user="${m.user_id}">Save</button>
        </div>
      </div>`;
    }).join('')}</div>
    <datalist id="gradeList">${grades.map(g=>`<option value="${esc(g)}">`).join('')}</datalist>
  </section>`;

  const playerWhatsAppMessage=`${club.name} players — our Batting Development system is ready for player registration.\n\nUse this link to join as a Player:\n${playerJoinLink}\n\nYou’ll sign in securely with your email and confirm your name. If the club batting philosophy is still being finalised, you can register now and we’ll let you know when Player Plans open.`;

  const copyText=async(text,label,statusId)=>{
    const st=document.getElementById(statusId);
    try{
      await navigator.clipboard.writeText(text);
      if(st)st.textContent=`${label} copied ✓`;
    }catch(e){
      if(st)st.textContent='Could not copy automatically — select and copy it manually.';
    }
  };

  document.getElementById('copyPlayerWhatsApp').onclick=()=>copyText(
    playerWhatsAppMessage,'WhatsApp message','playerShareStatus'
  );
  document.getElementById('copyPlayerLink').onclick=()=>copyText(
    playerJoinLink,'Player sign-up link','playerShareStatus'
  );
  document.getElementById('copyStaffJoinLink').onclick=()=>copyText(
    staffJoinLink,'Non-playing coach link','staffJoinStatus'
  );

  document.getElementById('togglePlayerSignup').onclick=async()=>{
    const button=document.getElementById('togglePlayerSignup');
    button.disabled=true;
    button.textContent=signupOpen?'Closing…':'Opening…';
    const {error}=await supabase.rpc('set_player_signup_open',{
      p_club_id:club.id,
      p_open:!signupOpen
    });
    if(error){alert(error.message);button.disabled=false;return;}
    await loadContext();
  };

  document.getElementById('regeneratePlayerLink').onclick=async()=>{
    const ok=confirm('Regenerate the Player Sign-up link and QR? The current link and QR will stop working immediately.');
    if(!ok)return;
    const button=document.getElementById('regeneratePlayerLink');
    button.disabled=true;
    button.textContent='Regenerating…';
    const {error}=await supabase.rpc('regenerate_player_join_token',{p_club_id:club.id});
    if(error){alert(error.message);button.disabled=false;button.textContent='Regenerate link & QR';return;}
    await loadContext();
  };

  renderPlayerQRCode(playerJoinLink);

  if(document.getElementById('openLeadHandover')){
    document.getElementById('openLeadHandover').onclick=()=>{
      document.getElementById('leadHandoverForm').style.display='block';
      document.getElementById('openLeadHandover').disabled=true;
    };
  }

  if(document.getElementById('closeLeadHandover')){
    document.getElementById('closeLeadHandover').onclick=()=>{
      document.getElementById('leadHandoverForm').style.display='none';
      document.getElementById('openLeadHandover').disabled=false;
    };
  }

  document.querySelectorAll('input[name="handoverSuccessorType"]').forEach(r=>r.onchange=()=>{
    document.querySelectorAll('.handover-option').forEach(x=>x.classList.toggle('on',x.querySelector('input').checked));
    const type=document.querySelector('input[name="handoverSuccessorType"]:checked')?.value||'existing';
    document.getElementById('existingSuccessorBox').style.display=type==='existing'?'block':'none';
    document.getElementById('externalSuccessorBox').style.display=type==='external'?'block':'none';
  });

  if(document.getElementById('sendLeadHandover')){
    document.getElementById('sendLeadHandover').onclick=async()=>{
      const st=document.getElementById('leadHandoverFormStatus');
      const btn=document.getElementById('sendLeadHandover');
      const type=document.querySelector('input[name="handoverSuccessorType"]:checked')?.value||'existing';

      let successorUserId=null;
      let successorName='';
      let successorEmail='';

      if(type==='existing'){
        successorUserId=document.getElementById('handoverExistingUser').value||null;
        if(!successorUserId){
          st.textContent='Choose the person who should take over.';
          return;
        }
      }else{
        successorName=val('handoverExternalName');
        successorEmail=val('handoverExternalEmail');
        if(!successorEmail || !successorEmail.includes('@')){
          st.textContent='Enter a valid successor email address.';
          return;
        }
      }

      btn.disabled=true;
      btn.textContent='Sending…';
      st.textContent='';

      const {data,error}=await supabase.rpc('initiate_lead_admin_handover',{
        p_club_id:club.id,
        p_successor_user_id:successorUserId,
        p_successor_name:successorName,
        p_successor_email:successorEmail
      });

      if(error){
        btn.disabled=false;
        btn.textContent='Send handover';
        st.textContent=error.message;
        return;
      }

      btn.textContent='Handover sent ✓';
      st.textContent='Nothing has changed yet. The nominated person must accept first.';

      const testLink=`${location.origin}${location.pathname}?lead_handover=${encodeURIComponent(data.handover_token)}`;
      const box=document.getElementById('leadHandoverTestLink');
      box.style.display='block';
      box.innerHTML=`<strong>Prototype test link</strong><span>Until live email delivery is connected, use this to test the acceptance flow.</span><button class="btn ghost" id="copyLeadHandoverTestLink">Copy test link</button>`;

      document.getElementById('copyLeadHandoverTestLink').onclick=()=>copyText(
        testLink,'Handover test link','leadHandoverFormStatus'
      );
    };
  }

  if(document.getElementById('cancelLeadHandover')){
    document.getElementById('cancelLeadHandover').onclick=async()=>{
      const ok=confirm('Cancel the pending Lead Admin handover? Nothing else will change.');
      if(!ok)return;
      const {error}=await supabase.rpc('cancel_lead_admin_handover',{
        p_handover_id:pendingHandover.id
      });
      if(error){alert(error.message);return;}
      await loadContext();
    };
  }

  document.querySelectorAll('[data-save-user]').forEach(b=>b.onclick=()=>saveMemberPermission(b.dataset.saveUser));
}

function labelInvolvement(v){
  return v==='player'
    ?'Player'
    :v==='coach_captain'
      ?'Coach / Captain'
      :v==='both'
        ?'Player + Coach / Captain'
        :v==='philosophy_contributor'
          ?'Philosophy Contributor'
          :'Not set';
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
  if(!philosophyVersions.length){
    document.getElementById('page').innerHTML=`<div class="card player-gate">
      <div class="gate-state locked">🔒</div>
      <div class="section-label">Player Plans are not open yet</div>
      <h2>Your club is still finalising its batting philosophy.</h2>
      <p>The framework that will guide your Player Plan has not been published yet, so there is nothing you need to complete at the moment.</p>
      <div class="notice">We’ll let players know when the Philosophy Lead publishes the club philosophy. When it goes live, you’ll be guided through your own plan and then review the draft with a coach.</div>
    </div>`;
    return;
  }

  if(!myPlayer){
    document.getElementById('page').innerHTML=`<div class="card">
      <h2>No Player Plan is attached to this account.</h2>
      <div class="help">Your account is currently set up as ${esc(labelInvolvement(membership.involvement))}. If you should also be a player, an Admin can help update your club identity.</div>
    </div>`;
    return;
  }

  const formats=publishedEnabledFormats();
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

  const modules=publishedTopEmphasis(section)
    .filter(x=>x.weight>=2 && QUESTION_LIBRARY[x.key]);

  if(!modules.length){
    return '<div class="notice">Your club has not given this format any Player Plan dimensions yet.</div>';
  }

  return modules.map(x=>{
    let spec=QUESTION_LIBRARY[x.key];
    const dim=dimensions.find(d=>d.dimension_key===x.key);

    if(x.key==='strike_rotation'){
      const byFormat={
        t20:{
          label:'When the boundary option is not there, how do you keep the innings moving?',
          options:['Take the safe single','Use a gap to change strike','Run hard on misfields','Turn ones into twos','Manipulate the field','Use pace behind square','Use feet to spin for one','Keep the right batter on strike when the matchup matters','Avoid forcing a boundary after dots']
        },
        limited_overs:{
          label:'Where are your reliable get-off-strike options?',
          options:['Clip into leg side','Drop into cover','Push to mid-on / mid-off','Use soft hands into point','Use feet to spin for one','Sweep for one','Run hard on misfields','Turn ones into twos','Identify the single before the ball','Rotate after a boundary']
        },
        long_form:{
          label:'How can you deliberately get off strike without expanding your risk?',
          options:['Clip the pads for one','Drop the ball into a safe gap','Push straight for one','Use soft hands into point','Use feet safely to spin','Sweep for a controlled single','Wait for the field to offer a low-risk single','Run hard on the misfield','Change strike after pressure has built','Keep my scoring envelope narrow']
        }
      };
      spec={...spec,...(byFormat[section]||{})};
    }

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


/* ---------------- PUBLIC COMMERCIAL ONBOARDING ---------------- */

const money=(cents,currency='AUD')=>new Intl.NumberFormat('en-AU',{style:'currency',currency,minimumFractionDigits:2}).format((Number(cents)||0)/100);
const niceDate=d=>d?new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';

async function sendRouteMagicLink(email){
  const {error}=await supabase.auth.signInWithOtp({
    email,
    options:{emailRedirectTo:redirectUrl()}
  });
  return error;
}

async function renderProspectRoute(token){
  const {data:p,error}=await supabase.rpc('get_public_prospect',{p_token:token});
  if(error||!p){
    app.innerHTML=`<div class="login"><h1>That club link isn’t available.</h1><p>${esc(error?.message||'It may have expired or been replaced.')}</p></div>`;
    return;
  }
  await supabase.rpc('mark_prospect_viewed',{p_token:token});

  if(p.entry_route==='direct_beta'){
    renderDirectBetaRoute(token,p);
    return;
  }
  renderSecretaryProspectRoute(token,p);
}

function renderDirectBetaRoute(token,p){
  if(!session){
    app.innerHTML=`<div class="prospect-shell">
      <section class="prospect-hero">
        <div class="section-label">Complimentary Beta Invitation</div>
        <h1>${esc(p.club_name)}</h1>
        <p>You’ve been invited to trial the Batting Development Platform directly with your club. The commercial Secretary → payer workflow has been deliberately skipped for this Beta.</p>
      </section>
      <section class="card prospect-card">
        <h2>Activate the trial</h2>
        <p class="help">Use the email address this Beta invitation was sent to. You’ll become the initial Club Admin, then choose who should lead the batting philosophy.</p>
        <div class="field"><label>Your email</label><input id="routeEmail" type="email" placeholder="you@club.com.au"></div>
        <button class="btn secondary" id="routeSignIn">Send secure sign-in link</button>
        <div id="routeStatus" class="help"></div>
      </section>
    </div>`;
    document.getElementById('routeSignIn').onclick=async()=>{
      const st=document.getElementById('routeStatus');st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check your email and tap the secure link to return here.';
    };
    return;
  }

  app.innerHTML=`<div class="prospect-shell">
    <section class="prospect-hero">
      <div class="section-label">Direct Beta</div>
      <h1>${esc(p.club_name)}</h1>
      <p>Complimentary trial access is ready through <strong>${esc(niceDate(p.offer_end))}</strong>. No payment or Secretary handoff is required.</p>
    </section>
    <section class="card prospect-card">
      <h2>One last thing</h2>
      <div class="field"><label>Your name</label><input id="betaName" placeholder="Full name"></div>
      <button class="btn secondary" id="activateBeta">Activate Beta & become Club Admin</button>
      <div id="betaStatus" class="help"></div>
    </section>
  </div>`;

  document.getElementById('activateBeta').onclick=async()=>{
    const st=document.getElementById('betaStatus');st.textContent='Activating…';
    const {data,error}=await supabase.rpc('accept_prospect_offer',{p_token:token,p_contact_name:val('betaName')});
    if(error){st.textContent=error.message;return;}
    if(data?.club_id)localStorage.setItem('bdp-club-id',data.club_id);
    localStorage.setItem('bdp-context','club');
    history.replaceState({},'',location.pathname);
    await loadPlatformContext();
    await loadContext();
  };
}

function prospectIntro(p){
  return `<section class="prospect-hero">
    <div class="section-label">For ${esc(p.club_name)}</div>
    <h1>A club-wide batting development system.</h1>
    <p>Define how your club wants to bat, turn that philosophy into individual Player Plans, and give coaches and captains a common framework for practice, matches and review.</p>
    <div class="prospect-value-grid">
      <div><strong>OUR CLUB</strong><span>Make the batting philosophy explicit.</span></div>
      <div><strong>OUR WAY</strong><span>Shape it for T20, Limited Overs and Long Form.</span></div>
      <div><strong>MY GAME</strong><span>Each player builds a plan around genuine strengths.</span></div>
    </div>
  </section>`;
}

function renderSecretaryProspectRoute(token,p){
  const amount=money(p.amount_due_cents,p.currency||'AUD');
  const free=p.amount_due_cents===0;
  const alreadyPaid=['awaiting_admin_handoff','admin_invited','active'].includes(p.status);

  if(!session && ['awaiting_payment','awaiting_admin_handoff','admin_invited','active'].includes(p.status)){
    const headline=p.status==='awaiting_payment'?'Payment is being arranged':p.status==='active'?'Club setup handoff is complete':'Your club is active';
    const body=p.status==='awaiting_payment'
      ?'A payment request has been sent. Sign in as the Club Contact if you want to check the current status.'
      :p.status==='active'
        ?'The Club Admin has taken over. Sign in only if you need to review the organisational handoff.'
        :'Sign in as the Club Contact to nominate or check the Club Admin handoff.';
    app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}<section class="card prospect-card"><h2>${headline}</h2><p>${body}</p><div class="field"><label>Club Contact email</label><input id="routeEmail" type="email"></div><button class="btn secondary" id="routeSignIn">Send secure sign-in link</button><div id="routeStatus" class="help"></div></section></div>`;
    document.getElementById('routeSignIn').onclick=async()=>{const st=document.getElementById('routeStatus');st.textContent='Sending…';const e=await sendRouteMagicLink(val('routeEmail'));st.textContent=e?e.message:'Check your email and tap the secure link to return here.';};
    return;
  }

  if(!session){
    app.innerHTML=`<div class="prospect-shell">
      ${prospectIntro(p)}
      <section class="card prospect-card">
        <div class="section-label">Club offer</div>
        <h2>${free?'Complimentary club access':`${amount} for this access period`}</h2>
        <p class="help">Access under this offer runs through <strong>${esc(niceDate(p.offer_end))}</strong>. ${free?'No payment is required.':''}</p>
        <div class="committee-summary">
          <strong>For the committee</strong>
          <p>The Secretary remains the organisational contact, but does not need to run the coaching system. After activation, the Secretary nominates the Club Admin and can step out of day-to-day involvement.</p>
          <button class="btn ghost" id="printSummary">Print / save committee summary</button>
        </div>
        <button class="btn secondary" id="committeeApproved">Our committee has approved — continue</button>
        <button class="btn ghost" id="wrongContact">I’m not the right club contact</button>
        <div id="verifyBox" style="display:none;margin-top:12px">
          <div class="field"><label>Club Contact email</label><input id="routeEmail" type="email" placeholder="secretary@club.com.au"></div>
          <button class="btn secondary" id="verifySecretary">Send secure sign-in link</button>
          <div id="routeStatus" class="help"></div>
        </div>
        <div id="wrongContactBox" style="display:none;margin-top:12px">
          <div class="field"><label>Correct contact name</label><input id="newContactName"></div>
          <div class="field"><label>Correct contact email</label><input id="newContactEmail" type="email"></div>
          <div class="field"><label>Note (optional)</label><textarea id="newContactNote" placeholder="e.g. I’m no longer the Secretary"></textarea></div>
          <button class="btn secondary" id="sendContactCorrection">Send correction</button>
          <div id="contactCorrectionStatus" class="help"></div>
        </div>
      </section>
    </div>`;
    document.getElementById('printSummary').onclick=()=>window.print();
    document.getElementById('committeeApproved').onclick=()=>document.getElementById('verifyBox').style.display='block';
    document.getElementById('wrongContact').onclick=()=>document.getElementById('wrongContactBox').style.display='block';
    document.getElementById('verifySecretary').onclick=async()=>{
      const st=document.getElementById('routeStatus');st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check that email and tap the secure sign-in link. You’ll return to this club offer.';
    };
    document.getElementById('sendContactCorrection').onclick=async()=>{
      const st=document.getElementById('contactCorrectionStatus');st.textContent='Sending…';
      const {error}=await supabase.rpc('request_prospect_contact_change',{
        p_token:token,p_name:val('newContactName'),p_email:val('newContactEmail'),p_note:val('newContactNote')
      });
      st.textContent=error?error.message:'Thanks. The platform team has been asked to update the club contact.';
    };
    return;
  }

  if(p.status==='active'){
    app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}<section class="card prospect-card"><div class="success-mark">✓</div><h2>Setup handoff complete.</h2><p>The Club Admin has taken over the platform. As Club Contact, you’re finished with day-to-day setup.</p><div class="notice">You’ll only receive important organisational messages such as renewal or account-contact notices.</div></section></div>`;
    return;
  }

  if(['awaiting_admin_handoff','admin_invited'].includes(p.status)){
    app.innerHTML=`<div class="prospect-shell">
      ${prospectIntro(p)}
      <section class="card prospect-card">
        <div class="success-mark">✓</div>
        <h2>${p.status==='admin_invited'?'Club Admin invitation sent.':'Your club is active.'}</h2>
        <p>${p.status==='admin_invited'?'You can step away now. The nominated Admin has the invitation to take over.':'Now offload the system to the person who will actually run it.'}</p>
        ${p.status==='admin_invited'?'<div class="notice"><strong>You’re done for now.</strong><br>We’ll handle the Admin handoff from here.</div>':`
          <div class="handoff-box">
            <div class="section-label">Nominate Club Admin</div>
            <div class="field"><label>Name</label><input id="adminName" placeholder="Head Coach / system manager"></div>
            <div class="field"><label>Email</label><input id="adminEmail" type="email"></div>
            <button class="btn secondary" id="sendAdminInvite">Send Admin invitation</button>
            <div id="adminInviteStatus" class="help"></div>
          </div>`}
      </section>
    </div>`;
    if(document.getElementById('sendAdminInvite')){
      document.getElementById('sendAdminInvite').onclick=async()=>{
        const st=document.getElementById('adminInviteStatus');st.textContent='Sending…';
        const {data,error}=await supabase.rpc('nominate_club_admin',{
          p_token:token,p_admin_name:val('adminName'),p_admin_email:val('adminEmail')
        });
        if(error){st.textContent=error.message;return;}
        st.innerHTML=`Admin invitation queued. <strong>You’re done for now.</strong>`;
        setTimeout(()=>renderProspectRoute(token),500);
      };
    }
    return;
  }

  if(p.status==='awaiting_payment'){
    app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}<section class="card prospect-card"><h2>Payment request sent.</h2><p>The nominated payer has been sent a payment link for <strong>${esc(amount)}</strong>.</p><div class="notice"><strong>No more work for you until payment is completed.</strong><br>When it is paid, you’ll be prompted to nominate the Club Admin.</div></section></div>`;
    return;
  }

  app.innerHTML=`<div class="prospect-shell">
    ${prospectIntro(p)}
    <section class="card prospect-card">
      <div class="section-label">Committee approved</div>
      <h2>${free?'No payment is required.':`${amount} is due.`}</h2>
      <p class="help">Signed in as ${esc(session.user.email||'')}. We verify the Club Contact before any subscription action.</p>
      <div class="field"><label>Your name</label><input id="secretaryName" placeholder="Club Secretary / Club Contact"></div>
      <button class="btn secondary" id="acceptOffer">Confirm & continue</button>
      <div id="acceptStatus" class="help"></div>
    </section>
  </div>`;

  document.getElementById('acceptOffer').onclick=async()=>{
    const st=document.getElementById('acceptStatus');st.textContent='Confirming…';
    const {data,error}=await supabase.rpc('accept_prospect_offer',{p_token:token,p_contact_name:val('secretaryName')});
    if(error){st.textContent=error.message;return;}
    if(data?.next==='payment'){
      app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}<section class="card prospect-card">
        <div class="section-label">Arrange payment</div><h2>Who should receive the payment request?</h2>
        <p class="help">This can be the Treasurer or anyone the committee has authorised. Paying does not create a platform account and does not make them the ongoing contact.</p>
        <div class="field"><label>Payer name (optional)</label><input id="payerName"></div>
        <div class="field"><label>Payer email</label><input id="payerEmail" type="email"></div>
        <button class="btn secondary" id="sendPayment">Send payment request</button>
        <div id="paymentStatus" class="help"></div>
      </section></div>`;
      document.getElementById('sendPayment').onclick=async()=>{
        const pst=document.getElementById('paymentStatus');pst.textContent='Sending…';
        const {error:e}=await supabase.rpc('create_payment_request_for_prospect',{
          p_token:token,p_payer_name:val('payerName'),p_payer_email:val('payerEmail')
        });
        if(e){pst.textContent=e.message;return;}
        await renderProspectRoute(token);
      };
      return;
    }
    await renderProspectRoute(token);
  };
}

async function renderPaymentRoute(token){
  const {data:p,error}=await supabase.rpc('get_public_payment_request',{p_token:token});
  if(error||!p){app.innerHTML=`<div class="login"><h1>Payment request unavailable.</h1><p>${esc(error?.message||'This link may no longer be active.')}</p></div>`;return;}

  if(p.status==='paid'){
    app.innerHTML=`<div class="login"><div class="success-mark">✓</div><h1>Payment complete.</h1><p>${esc(p.club_name)} has been activated. The Club Contact has been notified and will nominate the Club Admin.</p><div class="notice"><strong>Your part is finished.</strong> You won’t receive coaching-system emails just because you made the payment.</div></div>`;
    return;
  }

  app.innerHTML=`<div class="login" style="max-width:640px">
    <div class="section-label">Subscription payment</div>
    <h1>${esc(p.club_name)}</h1>
    <div class="payment-amount">${esc(money(p.amount_cents,p.currency))}</div>
    <p>You have been nominated only to make this payment. You do not need a platform account and this does not make you the ongoing club contact.</p>
    ${p.payment_mode==='prototype'
      ?'<div class="notice"><strong>Prototype payment mode</strong><br>No card will be charged. Use the button below to simulate a successful payment while we test the club workflow.</div><button class="btn secondary" id="prototypePay">Simulate successful payment</button>'
      :'<div class="notice">Secure card payment will be handled by the connected payment provider.</div>'}
    <div id="payStatus" class="help"></div>
  </div>`;

  if(document.getElementById('prototypePay')){
    document.getElementById('prototypePay').onclick=async()=>{
      const st=document.getElementById('payStatus');st.textContent='Processing…';
      const {error}=await supabase.rpc('prototype_complete_payment',{p_token:token});
      if(error){st.textContent=error.message;return;}
      await renderPaymentRoute(token);
    };
  }
}


async function renderPhilosophyInviteRoute(token){
  const {data:i,error}=await supabase.rpc('get_public_philosophy_invite',{p_token:token});

  if(error || !i){
    app.innerHTML=`<div class="login"><h1>Invitation not found.</h1><p>${esc(error?.message||'This philosophy invitation is invalid or no longer available.')}</p></div>`;
    return;
  }

  if(i.status==='accepted'){
    if(session){
      localStorage.setItem('bdp-context','club');
      localStorage.setItem('bdp-club-id',i.club_id);
      history.replaceState({},'',location.pathname);
      await loadPlatformContext();
      await loadContext();
      return;
    }
    app.innerHTML=`<div class="login"><h1>Invitation already accepted.</h1><p>Sign in normally to continue with ${esc(i.club_name)}.</p><button class="btn secondary" id="normalSignIn">Sign in</button></div>`;
    document.getElementById('normalSignIn').onclick=()=>{history.replaceState({},'',location.pathname);renderLogin();};
    return;
  }

  if(!session){
    app.innerHTML=`<div class="login" style="max-width:650px">
      <div class="section-label">Philosophy contributor invitation</div>
      <h1>${esc(i.club_name)}</h1>
      <p>You’ve been invited to have an independent say in the club’s batting philosophy.</p>
      <div class="notice"><strong>No committee meeting required.</strong><br>You’ll work through Club Identity → What We Value → Format Emphasis privately. Your answers are combined with the other contributors only after submission.</div>
      <div class="field"><label>Email address this invitation was sent to</label><input id="routeEmail" type="email"></div>
      <button class="btn secondary" id="routeSignIn">Send secure sign-in link</button>
      <div id="routeStatus" class="help"></div>
    </div>`;

    document.getElementById('routeSignIn').onclick=async()=>{
      const st=document.getElementById('routeStatus');
      st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check your email and tap the secure link to return to this invitation.';
    };
    return;
  }

  app.innerHTML=`<div class="login" style="max-width:650px">
    <div class="section-label">Philosophy contributor invitation</div>
    <h1>Contribute to ${esc(i.club_name)}</h1>
    <p>This gives you access only to the Philosophy Workshop unless the club separately gives you another role or permission.</p>
    <div class="field"><label>Your name</label><input id="philosophyInviteName" value="${esc(i.invited_name||'')}"></div>
    <div class="btnrow">
      <button class="btn secondary" id="acceptPhilosophyInvite">Accept & start</button>
      <button class="btn ghost" id="inviteSignOut">Use a different email</button>
    </div>
    <div id="philosophyInviteStatus" class="help"></div>
  </div>`;

  document.getElementById('inviteSignOut').onclick=()=>supabase.auth.signOut();

  document.getElementById('acceptPhilosophyInvite').onclick=async()=>{
    const st=document.getElementById('philosophyInviteStatus');
    st.textContent='Accepting…';
    const {data:clubId,error:aErr}=await supabase.rpc('accept_philosophy_contributor_invite',{
      p_token:token,p_display_name:val('philosophyInviteName')
    });
    if(aErr){st.textContent=aErr.message;return;}
    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',clubId);
    history.replaceState({},'',location.pathname);
    await loadPlatformContext();
    currentTab='workshop';
    await loadContext();
  };
}


async function renderLeadAdminHandoverRoute(token){
  const {data:h,error}=await supabase.rpc('get_public_lead_admin_handover',{p_token:token});

  if(error || !h){
    app.innerHTML=`<div class="login">
      <div class="section-label">Lead Admin handover</div>
      <h1>Handover invitation unavailable.</h1>
      <p>${esc(error?.message||'This invitation may have expired, been cancelled, or been replaced.')}</p>
    </div>`;
    return;
  }

  if(h.status==='accepted'){
    if(session){
      localStorage.setItem('bdp-context','club');
      localStorage.setItem('bdp-club-id',h.club_id);
      history.replaceState({},'',location.pathname);
      await loadPlatformContext();
      await loadContext();
      return;
    }

    app.innerHTML=`<div class="login">
      <div class="success-mark">✓</div>
      <h1>Handover already completed.</h1>
      <p>${esc(h.club_name)} already has its new Lead Admin in place.</p>
      <button class="btn secondary" id="handoverHome">Open platform</button>
    </div>`;
    document.getElementById('handoverHome').onclick=()=>{history.replaceState({},'',location.pathname);routeAuth();};
    return;
  }

  if(h.status!=='pending'){
    app.innerHTML=`<div class="login">
      <div class="section-label">Lead Admin handover</div>
      <h1>This handover is no longer active.</h1>
      <p>Ask the club’s current Lead Admin to create a new handover if required.</p>
    </div>`;
    return;
  }

  if(!session){
    app.innerHTML=`<div class="login" style="max-width:680px">
      <div class="section-label">Lead Admin handover</div>
      <h1>${esc(h.club_name)}</h1>
      <p><strong>${esc(h.outgoing_name)}</strong> has nominated you to take over as the club’s Lead Admin.</p>
      <div class="notice"><strong>Nothing changes until you accept.</strong><br>After you sign in, you’ll also decide what access ${esc(h.outgoing_name)} should retain after the handover.</div>
      <div class="field"><label>Email address this invitation was sent to</label><input id="routeEmail" type="email"></div>
      <button class="btn secondary" id="routeSignIn">Send secure sign-in link</button>
      <div id="routeStatus" class="help"></div>
    </div>`;

    document.getElementById('routeSignIn').onclick=async()=>{
      const st=document.getElementById('routeStatus');
      st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check your email and tap the secure link to return to the handover.';
    };
    return;
  }

  const outgoingRoleOptions=[
    ['remove','No club access — remove from club'],
    ...(h.outgoing_is_player?[['player','Player only — own Player Plan']]:[]),
    ['captain','Captain'],
    ['coach','Coach'],
    ['head_coach','Head Coach'],
    ['admin','Remain a Club Admin']
  ];

  app.innerHTML=`<div class="handover-shell">
    <section class="handover-hero">
      <div class="section-label">Formal Lead Admin handover</div>
      <h1>Take over ${esc(h.club_name)}</h1>
      <p>${esc(h.outgoing_name)} is formally passing responsibility for the platform to you.</p>
    </section>

    <section class="card handover-card">
      <div class="handover-step">
        <span>1</span>
        <div>
          <strong>You become Lead Admin</strong>
          <p>You’ll receive full club administration access. Other existing Club Admins are not changed.</p>
        </div>
      </div>

      <div class="handover-step">
        <span>2</span>
        <div>
          <strong>Set ${esc(h.outgoing_name)}’s ongoing access</strong>
          <p>The outgoing Admin does not decide this themselves. You set their new role as part of accepting the handover.</p>
        </div>
      </div>

      ${h.outgoing_is_philosophy_lead?`<div class="notice"><strong>${esc(h.outgoing_name)} is also the current Philosophy Lead.</strong><br>If you remove them from the club completely, Philosophy Lead responsibility will transfer to you temporarily so the club is never stranded. You can reassign it later.</div>`:''}

      <div class="field">
        <label>Your name</label>
        <input id="handoverAcceptName" value="${esc(h.invited_name||'')}" placeholder="Full name">
      </div>

      <div class="field">
        <label>${esc(h.outgoing_name)} after handover</label>
        <select id="outgoingPostRole">
          ${outgoingRoleOptions.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}
        </select>
      </div>

      <div id="outgoingAccessBox" style="display:none">
        <div class="field">
          <label>Player Plan access</label>
          <select id="outgoingPostAccess">
            <option value="none">No additional Player Plan access</option>
            <option value="grade_view">One grade · view</option>
            <option value="grade_edit">One grade · view + edit</option>
            <option value="whole_view">Whole club · view</option>
            <option value="whole_edit">Whole club · view + edit</option>
          </select>
        </div>
        <div class="field" id="outgoingGradeBox" style="display:none">
          <label>Grade</label>
          <input id="outgoingPostGrade" placeholder="e.g. 2nd Grade">
        </div>
      </div>

      <div id="handoverAccessExplanation" class="handover-access-explanation"></div>

      <div class="btnrow">
        <button class="btn secondary" id="acceptLeadHandover">Accept handover</button>
        <button class="btn ghost" id="handoverUseDifferentEmail">Use a different email</button>
        <span class="status" id="leadHandoverStatus"></span>
      </div>
    </section>
  </div>`;

  const refreshOutgoingAccessUI=()=>{
    const role=document.getElementById('outgoingPostRole').value;
    const accessBox=document.getElementById('outgoingAccessBox');
    const gradeBox=document.getElementById('outgoingGradeBox');
    const explain=document.getElementById('handoverAccessExplanation');

    const staffRole=['captain','coach','head_coach'].includes(role);
    accessBox.style.display=staffRole?'block':'none';

    const access=staffRole?document.getElementById('outgoingPostAccess').value:'none';
    gradeBox.style.display=staffRole && ['grade_view','grade_edit'].includes(access)?'block':'none';

    const messages={
      remove:`${h.outgoing_name} will leave ${h.club_name}. Their historical club records remain, but they will no longer be able to open the club.`,
      player:`${h.outgoing_name} will keep their own Player Plan only.`,
      captain:`${h.outgoing_name} will remain a Captain. Choose the Player Plan access they should have.`,
      coach:`${h.outgoing_name} will remain a Coach. Choose the Player Plan access they should have.`,
      head_coach:`${h.outgoing_name} will remain Head Coach. Choose the Player Plan access they should have.`,
      admin:`${h.outgoing_name} will remain a Club Admin with full club access, but you become the Lead Admin responsible for the next formal handover.`
    };
    explain.textContent=messages[role]||'';
  };

  document.getElementById('outgoingPostRole').onchange=refreshOutgoingAccessUI;
  document.getElementById('outgoingPostAccess').onchange=refreshOutgoingAccessUI;
  refreshOutgoingAccessUI();

  document.getElementById('handoverUseDifferentEmail').onclick=()=>supabase.auth.signOut();

  document.getElementById('acceptLeadHandover').onclick=async()=>{
    const st=document.getElementById('leadHandoverStatus');
    const btn=document.getElementById('acceptLeadHandover');
    const role=document.getElementById('outgoingPostRole').value;
    const access=['captain','coach','head_coach'].includes(role)
      ?document.getElementById('outgoingPostAccess').value
      :'none';
    const grade=['grade_view','grade_edit'].includes(access)
      ?val('outgoingPostGrade')
      :'';

    if(['grade_view','grade_edit'].includes(access) && !grade){
      st.textContent='Enter the grade for grade-based access.';
      return;
    }

    btn.disabled=true;
    btn.textContent='Completing handover…';
    st.textContent='';

    const {data:clubId,error:aErr}=await supabase.rpc('accept_lead_admin_handover',{
      p_token:token,
      p_display_name:val('handoverAcceptName'),
      p_outgoing_role:role,
      p_outgoing_access:access,
      p_outgoing_grade:grade
    });

    if(aErr){
      btn.disabled=false;
      btn.textContent='Accept handover';
      st.textContent=aErr.message;
      return;
    }

    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',clubId);
    history.replaceState({},'',location.pathname);
    await loadPlatformContext();
    currentTab='permissions';
    await loadContext();
  };
}

async function renderAdminInviteRoute(token){
  const {data:i,error}=await supabase.rpc('get_public_admin_invite',{p_token:token});
  if(error||!i){app.innerHTML=`<div class="login"><h1>Admin invitation unavailable.</h1><p>${esc(error?.message||'This invitation may have expired.')}</p></div>`;return;}
  if(i.status==='accepted'){
    app.innerHTML=`<div class="login"><div class="success-mark">✓</div><h1>Admin invitation accepted.</h1><p>Sign in normally to manage ${esc(i.club_name)}.</p><button class="btn secondary" id="goHome">Open platform</button></div>`;
    document.getElementById('goHome').onclick=()=>{history.replaceState({},'',location.pathname);routeAuth();};
    return;
  }
  if(!session){
    app.innerHTML=`<div class="login" style="max-width:640px"><div class="section-label">Club Admin invitation</div><h1>${esc(i.club_name)}</h1><p>You’ve been nominated to run the platform for the club. Sign in with the email address this invitation was sent to.</p><div class="field"><label>Your email</label><input id="routeEmail" type="email"></div><button class="btn secondary" id="routeSignIn">Send secure sign-in link</button><div id="routeStatus" class="help"></div></div>`;
    document.getElementById('routeSignIn').onclick=async()=>{
      const st=document.getElementById('routeStatus');st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check your email and tap the secure link to return here.';
    };
    return;
  }

  app.innerHTML=`<div class="login" style="max-width:640px"><div class="section-label">Take over club setup</div><h1>${esc(i.club_name)}</h1><p>As Club Admin you’ll manage people and permissions. You can then nominate the Philosophy Lead — that does not have to be you.</p><div class="field"><label>Your name</label><input id="adminAcceptName" value="${esc(i.invited_name||'')}"></div><button class="btn secondary" id="acceptAdminInvite">Accept Club Admin role</button><div id="adminAcceptStatus" class="help"></div></div>`;
  document.getElementById('acceptAdminInvite').onclick=async()=>{
    const st=document.getElementById('adminAcceptStatus');st.textContent='Accepting…';
    const {data,error}=await supabase.rpc('accept_club_admin_invite',{p_token:token,p_display_name:val('adminAcceptName')});
    if(error){st.textContent=error.message;return;}
    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',data);
    history.replaceState({},'',location.pathname);
    await loadPlatformContext();
    await loadContext();
  };
}

/* ---------------- PLATFORM ADMIN CONSOLE ---------------- */

async function renderPlatformConsole(){
  if(!session){renderLogin();return;}
  await loadPlatformContext();
  if(!platformRole){await loadContext();return;}
  localStorage.setItem('bdp-context','platform');

  app.innerHTML=`<div class="platform-shell">
    <header class="platform-header">
      <div><div class="section-label">Private Platform Administration</div><h1>Batting Development Platform</h1><p>Prospects, private commercial terms, subscriptions and club activation.</p></div>
      <div class="header-actions">
        ${allMemberships.length?`<select id="platformContextSwitch" class="context-switch"><option value="platform">Platform Admin</option>${allMemberships.map(m=>`<option value="${m.club_id}">${esc(m.clubs?.name||'Club')}</option>`).join('')}</select>`:''}
        <button class="btn ghost" id="platformOut">Sign out</button>
      </div>
    </header>
    <nav class="platform-nav">
      ${[['home','Prospects'],['new','New Club'],['clubs','Active Clubs'],['outbox','Email Queue'],['settings','Platform Settings']].map(([k,l])=>`<button data-platform-view="${k}" class="${platformView===k?'active':''}">${l}</button>`).join('')}
    </nav>
    <main class="platform-page" id="platformPage"></main>
  </div>`;

  document.getElementById('platformOut').onclick=()=>supabase.auth.signOut();
  if(document.getElementById('platformContextSwitch'))document.getElementById('platformContextSwitch').onchange=async e=>{
    if(e.target.value==='platform')return;
    localStorage.setItem('bdp-context','club');localStorage.setItem('bdp-club-id',e.target.value);await loadContext();
  };
  document.querySelectorAll('[data-platform-view]').forEach(b=>b.onclick=()=>{platformView=b.dataset.platformView;platformSelectedProspectId=null;renderPlatformView();});
  await renderPlatformView();
}

async function renderPlatformView(){
  document.querySelectorAll('[data-platform-view]').forEach(b=>b.classList.toggle('active',b.dataset.platformView===platformView));
  if(platformView==='new')return renderPlatformNewClub();
  if(platformView==='clubs')return renderPlatformActiveClubs();
  if(platformView==='outbox')return renderPlatformOutbox();
  if(platformView==='settings')return renderPlatformSettings();
  return renderPlatformProspects();
}

async function renderPlatformProspects(){
  const page=document.getElementById('platformPage');page.innerHTML='<div class="splash">Loading prospects…</div>';
  const {data:prospects,error}=await supabase.from('club_prospects').select('*').order('created_at',{ascending:false});
  if(error){page.innerHTML=`<div class="notice">${esc(error.message)}</div>`;return;}

  if(platformSelectedProspectId){
    const p=prospects.find(x=>x.id===platformSelectedProspectId);
    if(p){await renderPlatformProspectDetail(p);return;}
  }

  const counts={active:prospects.filter(x=>x.status==='active').length,waiting:prospects.filter(x=>['awaiting_payment','awaiting_admin_handoff','admin_invited'].includes(x.status)).length,beta:prospects.filter(x=>x.entry_route!=='standard').length};
  page.innerHTML=`<div class="platform-metrics"><div><strong>${prospects.length}</strong><span>prospects / activations</span></div><div><strong>${counts.waiting}</strong><span>waiting on next step</span></div><div><strong>${counts.beta}</strong><span>Beta routes</span></div></div>
  <section class="admin-card"><div class="admin-card-head"><div><div class="section-label">Club pipeline</div><h2>Prospects & onboarding</h2></div><button class="btn secondary" id="newProspectQuick">New club</button></div>
    <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Club</th><th>Route</th><th>Status</th><th>Rate reduction</th><th>Amount</th><th>Contact</th><th></th></tr></thead><tbody>
    ${prospects.map(x=>`<tr><td><strong>${esc(x.club_name)}</strong><small>${esc(niceDate(x.offer_end))}</small></td><td>${esc(x.entry_route.replaceAll('_',' '))}</td><td><span class="status-pill">${esc(x.status.replaceAll('_',' '))}</span></td><td>${Number(x.adjustment_percent).toFixed(0)}%${x.adjustment_end?`<small>to ${esc(niceDate(x.adjustment_end))}</small>`:''}</td><td>${esc(money(x.amount_due_cents))}</td><td>${esc(x.primary_contact_email)}</td><td><button class="btn ghost" data-manage-prospect="${x.id}">Manage</button></td></tr>`).join('')||'<tr><td colspan="7">No prospects yet.</td></tr>'}
    </tbody></table></div>
  </section>`;
  document.getElementById('newProspectQuick').onclick=()=>{platformView='new';renderPlatformConsole();};
  page.querySelectorAll('[data-manage-prospect]').forEach(b=>b.onclick=()=>{platformSelectedProspectId=b.dataset.manageProspect;renderPlatformProspects();});
}

async function loadSubscriptionCalendars(){
  const {data,error}=await supabase.from('subscription_calendars').select('*').eq('active',true).order('sort_order');
  if(error)return {data:[],error};
  return {data:data||[],error:null};
}

function calendarStartLabel(c){
  if(!c)return '';
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${c.club_year_start_day} ${months[c.club_year_start_month-1]}`;
}

function nextDayIso(value){
  if(!value)return '';
  const d=new Date(`${String(value).slice(0,10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}

function calendarOptions(calendars,selected='australia'){
  return (calendars||[]).map(c=>`<option value="${esc(c.code)}" ${c.code===selected?'selected':''}>${esc(c.label)} · renews ${esc(calendarStartLabel(c))}</option>`).join('');
}

function commercialPreviewHtml(q){
  if(!q)return '<div class="help">Choose a subscription calendar and access date to preview the term.</div>';
  const bundled=q.bundled_next_full_year===true || q.bundled_next_full_year==='true';
  return `<div class="commercial-preview-grid">
    <div><span>Access starts</span><strong>${esc(niceDate(q.access_start))}</strong></div>
    <div><span>Current term ends</span><strong>${esc(niceDate(q.offer_end))}</strong></div>
    <div><span>Next renewal</span><strong>${esc(niceDate(q.next_renewal))}</strong></div>
    <div><span>Standard annual price</span><strong>${esc(money(q.standard_annual_price_cents,q.currency))}</strong></div>
    <div><span>Current term before reduction</span><strong>${esc(money(q.base_prorated_cents,q.currency))}</strong></div>
    <div><span>Club price now</span><strong>${esc(money(q.amount_due_cents,q.currency))}</strong></div>
  </div>
  ${bundled?`<div class="notice compact"><strong>Near the renewal date:</strong> the short remaining period is included, and the charge covers the next full Club Year.</div>`:''}`;
}

async function getCommercialPreview(calendar,accessStart,reduction=0,adjustmentEnd=''){
  if(!calendar||!accessStart)return {data:null,error:null};
  return supabase.rpc('platform_preview_offer',{
    p_subscription_calendar:calendar,
    p_access_start:accessStart,
    p_adjustment_percent:Number(reduction||0),
    p_adjustment_end:adjustmentEnd||null
  });
}

async function renderPlatformProspectDetail(p){
  const page=document.getElementById('platformPage');
  const {data:calendars}=await loadSubscriptionCalendars();
  const publicLink=`${location.origin}${location.pathname}?prospect=${p.public_token}`;
  page.innerHTML=`<div class="btnrow"><button class="btn ghost" id="backProspects">← Back to prospects</button></div>
  <div class="grid">
    <section class="admin-card">
      <div class="section-label">Prospect</div><h2>${esc(p.club_name)}</h2>
      <div class="detail-grid"><div><span>Route</span><strong>${esc(p.entry_route.replaceAll('_',' '))}</strong></div><div><span>Status</span><strong>${esc(p.status.replaceAll('_',' '))}</strong></div><div><span>Club Contact</span><strong>${esc(p.primary_contact_email)}</strong></div><div><span>Current amount</span><strong>${esc(money(p.amount_due_cents))}</strong></div></div>
      <div class="field"><label>Prospect / Beta link</label><input id="prospectLink" value="${esc(publicLink)}" readonly></div>
      <button class="btn ghost" id="copyProspectLink">Copy link</button>
    </section>
    <section class="admin-card">
      <div class="section-label">Private commercial terms</div><h2>Club price & annual calendar</h2>
      <div class="private-note">Only Platform Admins see these controls. <strong>0% reduction = full standard price. 100% reduction = free.</strong> The club sees only its actual price and dates.</div>
      <div class="field"><label>Subscription calendar</label><select id="editCalendar">${calendarOptions(calendars,p.subscription_calendar||'australia')}</select></div>
      <div class="field"><label>Access starts</label><input id="editChargeFrom" type="date" value="${esc(String(p.charge_from).slice(0,10))}"></div>
      <div class="field"><label>Private rate reduction from standard price</label><input id="editAdjustment" type="number" min="0" max="100" step="1" value="${esc(p.adjustment_percent)}"><small>0% = standard price · 100% = complimentary</small></div>
      <div class="field"><label>Special rate ends (optional)</label><input id="editAdjEnd" type="date" value="${esc(p.adjustment_end?String(p.adjustment_end).slice(0,10):'')}"></div>
      <div class="field"><label>At expiry</label><select id="editExpiry"><option value="renewal_approval" ${p.expiry_action==='renewal_approval'?'selected':''}>Require renewal approval</option><option value="return_standard" ${p.expiry_action==='return_standard'?'selected':''}>Return to standard rate</option><option value="end_subscription" ${p.expiry_action==='end_subscription'?'selected':''}>End subscription</option></select></div>
      ${p.entry_route!=='standard'?'<div class="notice compact"><strong>Beta route:</strong> it bypasses charging, so the rate reduction must remain at 100%.</div>':''}
      ${['owner','commercial_admin'].includes(platformRole)&&!['payment_received','awaiting_admin_handoff','admin_invited','active'].includes(p.status)?'<button class="btn secondary" id="saveProspectTerms">Recalculate & save terms</button>':'<div class="notice">Activated clubs are managed under Active Clubs rather than changing the original offer.</div>'}
      <div id="prospectTermsStatus" class="help"></div>
    </section>
  </div>`;
  document.getElementById('backProspects').onclick=()=>{platformSelectedProspectId=null;renderPlatformProspects();};
  document.getElementById('copyProspectLink').onclick=async()=>{await navigator.clipboard.writeText(publicLink);document.getElementById('copyProspectLink').textContent='Copied ✓';};
  if(document.getElementById('saveProspectTerms'))document.getElementById('saveProspectTerms').onclick=async()=>{
    const st=document.getElementById('prospectTermsStatus');st.textContent='Saving…';
    const reduction=Number(val('editAdjustment')||0);
    const {data,error}=await supabase.rpc('platform_update_prospect_terms',{
      p_prospect_id:p.id,
      p_subscription_calendar:document.getElementById('editCalendar').value,
      p_adjustment_percent:reduction,
      p_adjustment_start:reduction>0?val('editChargeFrom'):null,
      p_adjustment_end:val('editAdjEnd')||null,
      p_expiry_action:document.getElementById('editExpiry').value,
      p_access_start:val('editChargeFrom')
    });
    if(error){st.textContent=error.message;return;}
    st.textContent=`Saved. New amount: ${money(data.amount_due_cents)} · next renewal ${niceDate(data.next_renewal)}.`;
    setTimeout(()=>renderPlatformProspects(),700);
  };
}

async function renderPlatformNewClub(){
  const page=document.getElementById('platformPage');
  page.innerHTML='<div class="splash">Loading commercial settings…</div>';

  const [{data:settings,error:settingsError},{data:calendars,error:calendarError}]=await Promise.all([
    supabase.from('platform_settings').select('*').eq('singleton',true).single(),
    loadSubscriptionCalendars()
  ]);

  if(settingsError||calendarError){
    page.innerHTML=`<div class="notice">${esc(settingsError?.message||calendarError?.message||'Could not load commercial settings.')}</div>`;
    return;
  }

  const today=new Date().toISOString().slice(0,10);
  const defaultCalendar=(calendars||[]).some(c=>c.code==='australia')?'australia':(calendars?.[0]?.code||'');

  page.innerHTML=`<section class="admin-card form-wide">
    <div class="section-label">Create prospect / Beta club</div><h2>How should this club enter the platform?</h2>
    <div class="field"><label>Entry route</label><select id="entryRoute"><option value="standard">Standard subscription — Secretary first</option><option value="direct_beta">Direct Beta — trial lead becomes initial Admin</option><option value="full_flow_beta">Full-flow Beta — Secretary handoff, $0 test flow</option></select></div>
    <div id="entryRouteHelp" class="notice compact"></div>

    <div class="form-grid">
      <div class="field"><label>Club name</label><input id="newClubName"></div>
      <div class="field"><label id="contactNameLabel">Club Secretary / contact name</label><input id="newContactName"></div>
      <div class="field"><label id="contactEmailLabel">Club Secretary / contact email</label><input id="newContactEmail" type="email"></div>
      <div class="field"><label>Subscription calendar</label><select id="subscriptionCalendar">${calendarOptions(calendars,defaultCalendar)}</select><small>Sets the club's universal annual renewal date. It does not delay access until the cricket season starts.</small></div>
      <div class="field"><label>Access starts</label><input id="accessStart" type="date" value="${today}"><small>Normally the activation/payment date — coaches can use the platform through preseason.</small></div>
    </div>

    <div class="commercial-box">
      <div class="section-label">Private commercial terms</div>
      <p class="help">These controls never appear to normal clubs. <strong>Rate reduction defaults to 0%.</strong></p>
      <div class="form-grid">
        <div class="field"><label>Private rate reduction from standard price</label><input id="adjustmentPct" type="number" min="0" max="100" value="0"><small>0% = full standard price · 100% = free</small></div>
        <div class="field"><label>Special rate ends (optional)</label><input id="adjustmentEnd" type="date"><small>Leave blank for a standard-rate club. Beta routes default to the end of the Club Year if left blank.</small></div>
        <div class="field"><label>At expiry</label><select id="expiryAction"><option value="renewal_approval">Require renewal approval</option><option value="return_standard">Return to standard rate</option><option value="end_subscription">End subscription</option></select></div>
      </div>
      <div class="field"><label>Internal note</label><textarea id="internalNote" placeholder="e.g. Founding Beta club / association partner / negotiated relationship rate"></textarea></div>
    </div>

    <div class="commercial-calculation">
      <div class="section-label">Calculated offer</div>
      <div id="newClubOfferPreview"><div class="help">Calculating…</div></div>
    </div>

    <div class="btnrow"><button class="btn secondary" id="createProspect">Create & queue invitation</button><span class="status" id="createProspectStatus"></span></div>
    <div id="createdProspectResult"></div>
  </section>`;

  const route=document.getElementById('entryRoute');
  const updateRoute=()=>{
    const beta=route.value!=='standard';
    document.getElementById('contactNameLabel').textContent=route.value==='direct_beta'?'Trial lead name':'Club Secretary / contact name';
    document.getElementById('contactEmailLabel').textContent=route.value==='direct_beta'?'Trial lead email':'Club Secretary / contact email';
    document.getElementById('entryRouteHelp').innerHTML=beta
      ?'<strong>Beta routes still start at 0% reduction.</strong> Because Beta bypasses real charging, deliberately set the rate reduction to <strong>100%</strong> when you want complimentary Beta access.'
      :'<strong>Standard subscription.</strong> The club receives immediate access from the date below and renews on its regional Club Year date.';
  };

  const refreshPreview=async()=>{
    const box=document.getElementById('newClubOfferPreview');
    box.innerHTML='<div class="help">Calculating…</div>';
    const {data,error}=await getCommercialPreview(
      document.getElementById('subscriptionCalendar').value,
      val('accessStart'),
      Number(val('adjustmentPct')||0),
      val('adjustmentEnd')||''
    );
    if(error){box.innerHTML=`<div class="notice compact">${esc(error.message)}</div>`;return;}
    box.innerHTML=commercialPreviewHtml(data);
  };

  route.onchange=()=>{updateRoute();refreshPreview();};
  ['subscriptionCalendar','accessStart','adjustmentPct','adjustmentEnd'].forEach(id=>{
    document.getElementById(id).onchange=refreshPreview;
    if(id==='adjustmentPct')document.getElementById(id).oninput=refreshPreview;
  });
  updateRoute();
  await refreshPreview();

  document.getElementById('createProspect').onclick=async()=>{
    const st=document.getElementById('createProspectStatus');st.textContent='Creating…';
    const reduction=Number(val('adjustmentPct')||0);
    const {data,error}=await supabase.rpc('platform_create_prospect',{
      p_club_name:val('newClubName'),
      p_entry_route:route.value,
      p_contact_name:val('newContactName'),
      p_contact_email:val('newContactEmail'),
      p_subscription_calendar:document.getElementById('subscriptionCalendar').value,
      p_access_start:val('accessStart'),
      p_adjustment_percent:reduction,
      p_adjustment_start:reduction>0?val('accessStart'):null,
      p_adjustment_end:val('adjustmentEnd')||null,
      p_expiry_action:document.getElementById('expiryAction').value,
      p_internal_note:val('internalNote')
    });
    if(error){st.textContent=error.message;return;}
    st.textContent='Created';
    const link=`${location.origin}${location.pathname}?prospect=${data.public_token}`;
    document.getElementById('createdProspectResult').innerHTML=`<div class="created-offer"><strong>Invitation ready</strong><span>Amount under this offer: ${esc(money(data.amount_due_cents,data.currency))}</span><span>Access through: ${esc(niceDate(data.offer_end))}</span><span>Next renewal: ${esc(niceDate(data.next_renewal))}</span><input id="createdLink" value="${esc(link)}" readonly><button class="btn ghost" id="copyCreatedLink">Copy invitation link</button><small>The notification is also in the Email Queue. Until a live email provider is connected, copy this link into your test/promo email.</small></div>`;
    document.getElementById('copyCreatedLink').onclick=async()=>{await navigator.clipboard.writeText(link);document.getElementById('copyCreatedLink').textContent='Copied ✓';};
  };
}

async function renderPlatformActiveClubs(){
  const page=document.getElementById('platformPage');page.innerHTML='<div class="splash">Loading active clubs…</div>';
  const [{data:subs,error:subsError},{data:clubs,error:clubsError},{data:calendars,error:calendarError},{data:settings,error:settingsError}]=await Promise.all([
    supabase.from('club_subscriptions').select('*,clubs(id,name)').in('status',['active','grace']).order('active_until'),
    supabase.from('clubs').select('id,name,subscription_calendar,season_start,season_end').order('name'),
    loadSubscriptionCalendars(),
    supabase.from('platform_settings').select('*').eq('singleton',true).single()
  ]);

  const loadError=subsError||clubsError||calendarError||settingsError;
  if(loadError){page.innerHTML=`<div class="notice">${esc(loadError.message)}</div>`;return;}

  const calendarMap=new Map((calendars||[]).map(c=>[c.code,c]));
  const activeIds=new Set((subs||[]).map(s=>s.club_id));
  const unactivated=(clubs||[]).filter(c=>!activeIds.has(c.id));
  const canCommercial=['owner','commercial_admin'].includes(platformRole);
  const today=new Date().toISOString().slice(0,10);
  const defaultCalendar=(calendars||[]).some(c=>c.code==='australia')?'australia':(calendars?.[0]?.code||'');

  page.innerHTML=`<section class="admin-card">
    <div class="section-label">Private commercial management</div><h2>Active clubs</h2>
    <div class="help">Annual access is based on the club's regional <strong>Club Year</strong>, not its playing season. Clubs do not see the private rate-reduction percentage.</div>
    <div class="active-club-list">${(subs||[]).map(s=>{
      const cal=calendarMap.get(s.subscription_calendar);
      const renewal=nextDayIso(s.season_end);
      return `<div class="active-club-row">
        <div><strong>${esc(s.clubs?.name||'Club')}</strong><small>${esc(cal?.label||s.subscription_calendar||'Club Year')} · Club Year ${esc(niceDate(s.season_start))} – ${esc(niceDate(s.season_end))} · annual renewal ${esc(niceDate(renewal))}</small></div>
        <div class="active-club-controls">
          <label>Rate reduction %<input data-sub-adjust="${s.club_id}" type="number" min="0" max="100" value="${esc(s.adjustment_percent)}"><small>0 = full price · 100 = free</small></label>
          <label>Special rate ends<input data-sub-adjend="${s.club_id}" type="date" value="${esc(s.adjustment_end?String(s.adjustment_end).slice(0,10):'')}"></label>
          <label>Current access to<input data-sub-active="${s.club_id}" type="date" value="${esc(String(s.active_until).slice(0,10))}"></label>
          <label>At expiry<select data-sub-expiry="${s.club_id}"><option value="renewal_approval" ${s.expiry_action==='renewal_approval'?'selected':''}>Renewal approval</option><option value="return_standard" ${s.expiry_action==='return_standard'?'selected':''}>Return standard</option><option value="end_subscription" ${s.expiry_action==='end_subscription'?'selected':''}>End</option></select></label>
          ${canCommercial?`<button class="btn ghost" data-save-sub="${s.club_id}">Save</button>`:''}
        </div>
      </div>`;
    }).join('')||'<div class="notice">No commercially activated clubs yet.</div>'}</div>
  </section>

  ${unactivated.length?`<section class="admin-card form-wide" style="margin-top:16px">
    <div class="section-label">Existing club migration</div><h2>Attach commercial terms to an existing club</h2>
    <div class="notice"><strong>Use this for clubs created before commercial onboarding existed.</strong><br>This attaches an annual entitlement to the existing club. It does not recreate the club and does not touch players, philosophy work or permissions.</div>
    ${canCommercial?`
      <div class="form-grid">
        <div class="field"><label>Existing club</label><select id="legacyClubId">${unactivated.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Subscription calendar</label><select id="legacyCalendar">${calendarOptions(calendars,unactivated[0]?.subscription_calendar||defaultCalendar)}</select></div>
        <div class="field"><label>Access starts</label><input id="legacyAccessStart" type="date" value="${today}"></div>
        <div class="field"><label>Private rate reduction from standard price</label><input id="legacyReduction" type="number" min="0" max="100" value="0"><small>0% = full standard price · 100% = free</small></div>
        <div class="field"><label>Special rate ends (optional)</label><input id="legacyAdjustmentEnd" type="date"></div>
        <div class="field"><label>At expiry</label><select id="legacyExpiry"><option value="renewal_approval">Require renewal approval</option><option value="return_standard">Return to standard rate</option><option value="end_subscription">End subscription</option></select></div>
      </div>
      <div class="field"><label>Internal note</label><textarea id="legacyNote" placeholder="e.g. Existing pilot club migrated into commercial model"></textarea></div>
      <div class="commercial-calculation"><div class="section-label">Calculated entitlement</div><div id="legacyOfferPreview"><div class="help">Calculating…</div></div></div>
      <div class="btnrow"><button class="btn secondary" id="activateExistingClub">Activate existing club</button><span class="status" id="legacyActivateStatus"></span></div>
    `:'<div class="help">Only Platform Owner / Commercial Admin can attach commercial terms.</div>'}
  </section>`:''}`;

  page.querySelectorAll('[data-save-sub]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.saveSub;
    b.textContent='Saving…';
    const {error}=await supabase.rpc('platform_update_subscription_terms',{
      p_club_id:id,
      p_adjustment_percent:Number(document.querySelector(`[data-sub-adjust="${id}"]`).value||0),
      p_adjustment_start:null,
      p_adjustment_end:document.querySelector(`[data-sub-adjend="${id}"]`).value||null,
      p_expiry_action:document.querySelector(`[data-sub-expiry="${id}"]`).value,
      p_active_until:document.querySelector(`[data-sub-active="${id}"]`).value
    });
    b.textContent=error?'Error':'Saved ✓';if(error)alert(error.message);
  });

  if(document.getElementById('activateExistingClub')){
    const selectedClub=()=>unactivated.find(c=>c.id===document.getElementById('legacyClubId').value);
    const syncLegacyCalendar=()=>{
      const c=selectedClub();
      if(c?.subscription_calendar && (calendars||[]).some(x=>x.code===c.subscription_calendar))document.getElementById('legacyCalendar').value=c.subscription_calendar;
    };
    const refreshLegacyPreview=async()=>{
      const box=document.getElementById('legacyOfferPreview');box.innerHTML='<div class="help">Calculating…</div>';
      const {data,error}=await getCommercialPreview(
        document.getElementById('legacyCalendar').value,
        val('legacyAccessStart'),
        Number(val('legacyReduction')||0),
        val('legacyAdjustmentEnd')||''
      );
      box.innerHTML=error?`<div class="notice compact">${esc(error.message)}</div>`:commercialPreviewHtml(data);
    };
    document.getElementById('legacyClubId').onchange=()=>{syncLegacyCalendar();refreshLegacyPreview();};
    ['legacyCalendar','legacyAccessStart','legacyReduction','legacyAdjustmentEnd'].forEach(id=>{
      document.getElementById(id).onchange=refreshLegacyPreview;
      if(id==='legacyReduction')document.getElementById(id).oninput=refreshLegacyPreview;
    });
    await refreshLegacyPreview();

    document.getElementById('activateExistingClub').onclick=async()=>{
      const st=document.getElementById('legacyActivateStatus');
      const btn=document.getElementById('activateExistingClub');
      const c=selectedClub();
      const reduction=Number(val('legacyReduction')||0);
      const ok=confirm(`Attach commercial terms to ${c?.name||'this club'}? This keeps the existing club and all of its cricket data.`);
      if(!ok)return;
      btn.disabled=true;btn.textContent='Activating…';st.textContent='';
      const {data,error}=await supabase.rpc('platform_activate_existing_club',{
        p_club_id:document.getElementById('legacyClubId').value,
        p_subscription_calendar:document.getElementById('legacyCalendar').value,
        p_access_start:val('legacyAccessStart'),
        p_adjustment_percent:reduction,
        p_adjustment_end:val('legacyAdjustmentEnd')||null,
        p_expiry_action:document.getElementById('legacyExpiry').value,
        p_internal_note:val('legacyNote')
      });
      if(error){btn.disabled=false;btn.textContent='Activate existing club';st.textContent=error.message;return;}
      st.textContent=`Activated through ${niceDate(data.active_until)}.`;
      setTimeout(()=>renderPlatformActiveClubs(),700);
    };
  }
}

async function renderPlatformOutbox(){
  const page=document.getElementById('platformPage');page.innerHTML='<div class="splash">Loading email queue…</div>';
  const {data:msgs,error}=await supabase.from('outbound_messages').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){page.innerHTML=`<div class="notice">${esc(error.message)}</div>`;return;}
  page.innerHTML=`<section class="admin-card"><div class="section-label">Notification infrastructure</div><h2>Email Queue</h2><div class="notice"><strong>Prototype state:</strong> the system is creating the real notification records and links, but a live email provider has not yet been connected. For testing, copy the generated link and send it manually. When we connect the email service, these same queued records become automatic emails.</div>
    <div class="message-list">${(msgs||[]).map(m=>{const path=m.payload?.link_path;const link=path?`${location.origin}${location.pathname}${path}`:'';return `<div class="message-row"><div><strong>${esc(m.subject)}</strong><small>${esc(m.recipient_email)} · ${esc(m.template_key)} · ${esc(m.status)}</small></div>${link?`<button class="btn ghost" data-copy-message="${esc(link)}">Copy link</button>`:''}</div>`;}).join('')||'<div class="notice">No messages queued yet.</div>'}</div>
  </section>`;
  page.querySelectorAll('[data-copy-message]').forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.copyMessage);b.textContent='Copied ✓';});
}

async function renderPlatformSettings(){
  const page=document.getElementById('platformPage');page.innerHTML='<div class="splash">Loading settings…</div>';
  const [{data:s,error},{data:calendars,error:calendarError}]=await Promise.all([
    supabase.from('platform_settings').select('*').eq('singleton',true).single(),
    loadSubscriptionCalendars()
  ]);
  if(error||calendarError){page.innerHTML=`<div class="notice">${esc(error?.message||calendarError?.message)}</div>`;return;}
  const canCommercial=['owner','commercial_admin'].includes(platformRole);
  page.innerHTML=`<section class="admin-card form-wide"><div class="section-label">Platform defaults</div><h2>Commercial settings</h2><div class="form-grid">
    <div class="field"><label>Standard annual club price (${esc(s.currency)})</label><input id="settingPrice" type="number" step="0.01" value="${(s.standard_season_price_cents/100).toFixed(2)}" ${canCommercial?'':'disabled'}><small>This is the full 12-month Club Year price before any private rate reduction.</small></div>
    <div class="field"><label>Minimum days before renewal for a pro-rata term</label><input id="settingMinDays" type="number" value="${s.minimum_prorata_days}" ${canCommercial?'':'disabled'}><small>If fewer days remain, those days are included and the club is charged for the next full Club Year instead.</small></div>
    <div class="field"><label>Payment grace period</label><input id="settingGrace" type="number" value="${s.payment_grace_days}" ${canCommercial?'':'disabled'}></div>
    <div class="field"><label>Private-rate expiry warning</label><input id="settingWarn" type="number" value="${s.commercial_adjustment_warning_days}" ${canCommercial?'':'disabled'}></div>
    <div class="field"><label>Payment mode</label><select id="settingMode" ${canCommercial?'':'disabled'}><option value="prototype" ${s.payment_mode==='prototype'?'selected':''}>Prototype — simulate payment</option><option value="live" ${s.payment_mode==='live'?'selected':''}>Live provider</option></select></div>
  </div>
  <div class="commercial-box" style="margin-top:16px">
    <div class="section-label">Regional Club Years</div>
    <p class="help">These universal renewal dates give clubs access before their playing season instead of trying to identify each club's exact season start and finish.</p>
    <div class="calendar-list">${(calendars||[]).map(c=>`<div><strong>${esc(c.label)}</strong><span>Club Year renews ${esc(calendarStartLabel(c))}</span></div>`).join('')}</div>
  </div>
  ${canCommercial?'<button class="btn secondary" id="savePlatformSettings">Save settings</button>':''}<div id="settingsStatus" class="help"></div></section>`;
  if(document.getElementById('savePlatformSettings'))document.getElementById('savePlatformSettings').onclick=async()=>{
    const st=document.getElementById('settingsStatus');st.textContent='Saving…';
    const {error}=await supabase.from('platform_settings').update({
      standard_season_price_cents:Math.round(Number(val('settingPrice'))*100),minimum_prorata_days:Number(val('settingMinDays')),
      payment_grace_days:Number(val('settingGrace')),commercial_adjustment_warning_days:Number(val('settingWarn')),payment_mode:document.getElementById('settingMode').value,updated_at:new Date().toISOString()
    }).eq('singleton',true);
    st.textContent=error?error.message:'Saved';
  };
}
