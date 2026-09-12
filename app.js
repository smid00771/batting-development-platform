
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const app=document.getElementById('app');
let session,club,membership,profile,principles=[],catalogue=[],currentTab='studio';

const defaults={identity_statement:'',wicket_value:'balanced',scoring_intent:'',good_ball_response:'',scoring_ball_response:'',rotation_emphasis:'medium',scoring_areas_emphasis:true,separate_pace_spin:true,risk_framework:true,reset_routine:true,tempo_match_phases:false,long_form_relevant:true,practice_alignment:true,dismissal_review:true,pace_notes:'',spin_notes:'',risk_notes:''};
const rules=[
 ['trusted_shots',()=>true,'CORE'],['scoring_areas',p=>p.scoring_areas_emphasis,'FROM PHILOSOPHY'],
 ['strike_rotation',p=>p.rotation_emphasis!=='low','FROM PHILOSOPHY'],
 ['pace_plan',p=>p.separate_pace_spin,'FROM PHILOSOPHY'],['spin_plan',p=>p.separate_pace_spin,'FROM PHILOSOPHY'],
 ['decision_rules',p=>p.risk_framework,'FROM PHILOSOPHY'],['danger_reset',p=>p.reset_routine,'FROM PHILOSOPHY'],
 ['tempo_plan',p=>p.tempo_match_phases,'FROM PHILOSOPHY'],['long_form',p=>p.long_form_relevant,'FROM PHILOSOPHY'],
 ['current_focus',()=>true,'CORE']
];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const val=id=>document.getElementById(id)?.value.trim()||'';
const chk=id=>!!document.getElementById(id)?.checked;
const slug=s=>String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

async function boot(){
 const {data:{session:s}}=await supabase.auth.getSession();session=s;
 supabase.auth.onAuthStateChange((_e,s2)=>{session=s2;routeAuth()});
 routeAuth();
}
async function routeAuth(){if(!session)return renderLogin(); await loadContext();}
function renderLogin(msg=''){
 app.innerHTML=`<div class="login"><div style="font-size:10px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;color:#202f78">Batting Development Platform</div><h1>Club coaching, made explicit.</h1><p>Sign in by email. We’ll send a secure magic link — no password required.</p>${msg?`<div class="notice">${esc(msg)}</div>`:''}<div class="field"><label>Email</label><input id="email" type="email" placeholder="coach@club.com.au"></div><button class="btn secondary" id="send">Send magic link</button></div>`;
 document.getElementById('send').onclick=async()=>{const email=val('email');if(!email)return;const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});renderLogin(error?error.message:'Check your email and tap the sign-in link.');};
}
async function loadContext(){
 app.innerHTML='<div class="splash">Loading your club…</div>';
 const {data,error}=await supabase.from('club_memberships').select('club_id,role,clubs(id,name,slug,primary_colour,accent_colour)').eq('user_id',session.user.id);
 if(error)return app.innerHTML=`<div class="splash">${esc(error.message)}</div>`;
 if(!data?.length)return renderCreateClub();
 membership=data[0];club=membership.clubs;await loadPhilosophy();renderShell();
}
function renderCreateClub(){
 app.innerHTML=`<div class="login"><h1>Create your club space.</h1><p>This account becomes the first Club Administrator.</p><div class="field"><label>Club name</label><input id="clubName" placeholder="Club name"></div><div class="field"><label>Club slug</label><input id="clubSlug" placeholder="club-name"></div><button class="btn secondary" id="create">Create club</button><div id="createStatus" class="help"></div></div>`;
 const n=document.getElementById('clubName'),s=document.getElementById('clubSlug');n.oninput=()=>{if(!s.dataset.touched)s.value=slug(n.value)};s.oninput=()=>s.dataset.touched='1';
 document.getElementById('create').onclick=async()=>{const {error}=await supabase.rpc('create_club_with_admin',{club_name:val('clubName'),club_slug:val('clubSlug'),primary_colour:'#202f78',accent_colour:'#d8232a'});if(error)return document.getElementById('createStatus').textContent=error.message;loadContext();};
}
async function loadPhilosophy(){
 const [a,b,c]=await Promise.all([
  supabase.from('philosophy_profiles').select('*').eq('club_id',club.id).single(),
  supabase.from('philosophy_principles').select('*').eq('club_id',club.id).order('sort_order'),
  supabase.from('plan_module_catalogue').select('*').order('sort_order')
 ]);
 profile={...defaults,...(a.data||{})};principles=b.data||[];catalogue=c.data||[];
 if(!principles.length)principles=[1,2,3].map(n=>({sort_order:n,title:''}));
}
function renderShell(){
 document.documentElement.style.setProperty('--navy',club.primary_colour||'#202f78');document.documentElement.style.setProperty('--red',club.accent_colour||'#d8232a');
 app.innerHTML=`<div class="shell"><header class="hero"><div class="topline"><div><div class="k">${esc(club.name)}</div><h1>Batting Development</h1><p>Define how your club wants to bat. The platform turns that philosophy into teaching content and individual Player Plans.</p></div><button class="btn ghost" id="out">Sign out</button></div></header><nav class="nav"><button data-tab="studio">1. Philosophy Studio</button><button data-tab="preview">2. How We Bat</button><button data-tab="modules">3. Player Plan</button></nav><main class="page" id="page"></main></div>`;
 document.getElementById('out').onclick=()=>supabase.auth.signOut();document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;renderTab()});renderTab();
}
function renderTab(){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));currentTab==='studio'?renderStudio():currentTab==='preview'?renderPreview():renderModules();}
function toggle(id,t,d,on){return `<label class="toggle"><div><strong>${t}</strong><span>${d}</span></div><input id="${id}" type="checkbox" ${on?'checked':''}></label>`}
function renderStudio(){
 const p=profile;document.getElementById('page').innerHTML=`<div class="grid"><section class="card"><h2>Club batting identity</h2><div class="help">Make coaching decisions here — not website copy.</div>
 <div class="field"><label>Finish this sentence: “We want batters who…”</label><textarea id="identity">${esc(p.identity_statement)}</textarea></div>
 <div class="field"><label>How strongly should players value their wicket?</label><select id="wicket"><option value="high" ${p.wicket_value==='high'?'selected':''}>Very highly — occupation is central</option><option value="balanced" ${p.wicket_value==='balanced'?'selected':''}>Balance wicket value with scoring intent</option><option value="aggressive" ${p.wicket_value==='aggressive'?'selected':''}>High intent — accept more calculated risk</option></select></div>
 <div class="field"><label>What should “positive batting” mean at your club?</label><textarea id="intent">${esc(p.scoring_intent)}</textarea></div>
 <div class="field"><label>What should a batter do with a genuinely good ball?</label><textarea id="good">${esc(p.good_ball_response)}</textarea></div>
 <div class="field"><label>What should happen when the bowler offers a genuine scoring opportunity?</label><textarea id="score">${esc(p.scoring_ball_response)}</textarea></div>
 <h3>Headline principles</h3><div class="help">Short phrases players should actually remember.</div>${[1,2,3].map(n=>`<div class="principle"><div class="n">${n}</div><input id="p${n}" value="${esc(principles.find(x=>x.sort_order===n)?.title||'')}" placeholder="Principle ${n}"></div>`).join('')}</section>
 <section class="card"><h2>What matters in your system?</h2><div class="help">These choices are what make Player Plans morph from club to club.</div>
 <div class="field"><label>Strike rotation emphasis</label><select id="rotation"><option value="low" ${p.rotation_emphasis==='low'?'selected':''}>Low</option><option value="medium" ${p.rotation_emphasis==='medium'?'selected':''}>Medium</option><option value="high" ${p.rotation_emphasis==='high'?'selected':''}>High</option></select></div>
 ${toggle('areas','Scoring areas','Players should explicitly know where and from which balls they score.',p.scoring_areas_emphasis)}
 ${toggle('paceSpin','Separate pace and spin methods','The plan distinguishes the player’s method against pace and spin.',p.separate_pace_spin)}
 ${toggle('risk','Risk / decision framework','Players have explicit rules for attack, rotation and respect.',p.risk_framework)}
 ${toggle('reset','Reset routine','Players identify what takes them away from their plan and how they reset.',p.reset_routine)}
 ${toggle('tempo','Tempo / match phases','Plans change according to innings phase or match situation.',p.tempo_match_phases)}
 ${toggle('longForm','Long-form adjustment','The player has an explicit longer-form adjustment.',p.long_form_relevant)}
 ${toggle('practice','Practice aligned to plan','Training deliberately rehearses the plan.',p.practice_alignment)}
 ${toggle('review','Dismissal review','Coaches review dismissals against the plan.',p.dismissal_review)}
 <div class="field"><label>Anything specific about batting pace?</label><textarea id="pace">${esc(p.pace_notes)}</textarea></div><div class="field"><label>Anything specific about batting spin?</label><textarea id="spin">${esc(p.spin_notes)}</textarea></div><div class="field"><label>How does your club think about risk?</label><textarea id="riskNotes">${esc(p.risk_notes)}</textarea></div>
 <div class="btnrow"><button class="btn secondary" id="save">Save philosophy</button><button class="btn ghost" id="see">Preview How We Bat</button><span class="status" id="status"></span></div></section></div>`;
 document.getElementById('save').onclick=saveStudio;document.getElementById('see').onclick=()=>{collect();currentTab='preview';renderTab()};
}
function collect(){
 profile={...profile,identity_statement:val('identity'),wicket_value:document.getElementById('wicket').value,scoring_intent:val('intent'),good_ball_response:val('good'),scoring_ball_response:val('score'),rotation_emphasis:document.getElementById('rotation').value,scoring_areas_emphasis:chk('areas'),separate_pace_spin:chk('paceSpin'),risk_framework:chk('risk'),reset_routine:chk('reset'),tempo_match_phases:chk('tempo'),long_form_relevant:chk('longForm'),practice_alignment:chk('practice'),dismissal_review:chk('review'),pace_notes:val('pace'),spin_notes:val('spin'),risk_notes:val('riskNotes')};
 principles=[1,2,3].map(n=>({sort_order:n,title:val(`p${n}`),explanation:'',coaching_cues:''}));
}
async function saveStudio(){
 collect();const s=document.getElementById('status');s.textContent='Saving…';const payload={...profile,club_id:club.id,updated_at:new Date().toISOString()};delete payload.id;
 let {error}=await supabase.from('philosophy_profiles').upsert(payload,{onConflict:'club_id'});if(error)return s.textContent=error.message;
 await supabase.from('philosophy_principles').delete().eq('club_id',club.id);const rows=principles.filter(x=>x.title).map(x=>({...x,club_id:club.id}));if(rows.length){({error}=await supabase.from('philosophy_principles').insert(rows));if(error)return s.textContent=error.message}s.textContent='Saved';
}
function mods(){const map=new Map(catalogue.map(x=>[x.module_key,x]));return rules.filter(([k,test])=>test(profile)).map(([k,_t,kind])=>({...map.get(k),kind})).filter(x=>x.module_key)}
function renderPreview(){
 const wicket={high:'Your wicket is a major team resource. Make the opposition earn it.',balanced:'Value your wicket while continuing to look for controlled ways to score.',aggressive:'Play with intent and accept calculated risk when it creates meaningful pressure.'}[profile.wicket_value];
 const titles=principles.filter(x=>x.title).map(x=>x.title);document.getElementById('page').innerHTML=`<div class="grid"><section><div class="preview"><div class="preview-head"><div class="k">${esc(club.name)}</div><h2>How We Bat</h2><div style="font-size:11px;line-height:1.45;opacity:.88">${esc(profile.identity_statement||'Define the kind of batter your club wants to develop.')}</div>${titles.length?`<div class="pillrow">${titles.map(t=>`<div class="pill" style="background:#fff;color:#17245f">${esc(t)}</div>`).join('')}</div>`:''}</div>
 <div class="preview-section"><h3>Our batting identity</h3><p>${esc(wicket)} ${esc(profile.scoring_intent||'Be clear about what positive batting means here.')}</p></div>
 <div class="preview-section"><h3>Respect good bowling</h3><p>${esc(profile.good_ball_response||'Respect genuinely good bowling without surrendering your method.')}</p></div>
 <div class="preview-section"><h3>Recognise opportunity</h3><p>${esc(profile.scoring_ball_response||'Recognise genuine scoring opportunities and commit to them.')}</p></div>
 ${profile.rotation_emphasis!=='low'?`<div class="preview-section"><h3>Keep the innings moving</h3><p>Strike rotation is a ${esc(profile.rotation_emphasis)} priority in this batting system.</p></div>`:''}
 ${profile.separate_pace_spin?`<div class="preview-section"><h3>Pace and spin</h3><p>${esc(profile.pace_notes||'Players should understand their method against pace.')} ${esc(profile.spin_notes||'Players should also have a deliberate method against spin.')}</p></div>`:''}</div></section>
 <section class="card"><h2>Generated from coaching choices</h2><div class="help">For v0.1 the wording is deterministic. Later, AI can polish language without changing the underlying coaching decisions.</div><div class="modules">${mods().map((m,i)=>`<div class="module"><div class="icon">${i+1}</div><div><strong>${esc(m.default_label)}</strong><p>${esc(m.description)}</p></div><div class="badge">${m.kind}</div></div>`).join('')}</div><div class="btnrow"><button class="btn secondary" id="toMods">Build Player Plan structure</button></div></section></div>`;
 document.getElementById('toMods').onclick=()=>{currentTab='modules';renderTab()};
}
function renderModules(){
 document.getElementById('page').innerHTML=`<div class="grid"><section class="card"><h2>Recommended Player Plan</h2><div class="help">This is the key test: does the plan structure reflect how this club actually wants to coach batting?</div><div class="modules">${mods().map((m,i)=>`<div class="module"><div class="icon">${i+1}</div><div><strong>${esc(m.default_label)}</strong><p>${esc(m.default_prompt)}</p></div><div class="badge">${m.kind}</div></div>`).join('')}</div></section><section class="card"><h2>What happens next</h2><div class="help">The coach never designs a software form. They make coaching decisions; the platform translates those decisions into the form.</div><div class="notice"><strong>v0.2:</strong> approve, remove, rename and reorder these modules, then use the approved structure to build an individual player’s plan.</div></section></div>`;
}
boot();
