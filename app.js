import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const app=document.getElementById('app');

let session,club,membership,profile,dimensions=[],selectedDims=new Map(),weights=new Map();
let currentTab='identity',previewFormat='limited_overs';

const FORMATS=[['t20','T20'],['limited_overs','Limited Overs'],['long_form','Long Form']];
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
 wicket_preservation:{t20:2,limited_overs:3,long_form:4},leaving_defending:{t20:0,limited_overs:1,long_form:4},
 strike_rotation:{t20:3,limited_overs:4,long_form:2},boundary_access:{t20:4,limited_overs:3,long_form:2},
 running:{t20:3,limited_overs:4,long_form:2},scoring_areas:{t20:4,limited_overs:3,long_form:3},
 tempo:{t20:4,limited_overs:4,long_form:2},matchups:{t20:4,limited_overs:3,long_form:1},
 spin_method:{t20:3,limited_overs:3,long_form:3},pace_method:{t20:3,limited_overs:3,long_form:3},
 risk_management:{t20:4,limited_overs:4,long_form:4},reset_routines:{t20:3,limited_overs:3,long_form:3},
 dot_ball_management:{t20:4,limited_overs:3,long_form:1},powerplay:{t20:4,limited_overs:3,long_form:0},
 death_overs:{t20:4,limited_overs:3,long_form:0},innovation:{t20:3,limited_overs:2,long_form:1},
 patience:{t20:1,limited_overs:2,long_form:4},partnerships:{t20:2,limited_overs:4,long_form:4}
};
const WEIGHT_LABELS=['Not used','Low','Medium','High','Very High'];

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const val=id=>document.getElementById(id)?.value.trim()||'';
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
 membership=data[0];club=membership.clubs;await loadData();renderShell();
}
function renderCreateClub(){
 app.innerHTML=`<div class="login"><h1>Create your club space.</h1><p>This account becomes the first Club Administrator.</p><div class="field"><label>Club name</label><input id="clubName"></div><div class="field"><label>Club slug</label><input id="clubSlug"></div><button class="btn secondary" id="create">Create club</button><div id="createStatus" class="help"></div></div>`;
 const n=document.getElementById('clubName'),s=document.getElementById('clubSlug');n.oninput=()=>{if(!s.dataset.touched)s.value=slug(n.value)};s.oninput=()=>s.dataset.touched='1';
 document.getElementById('create').onclick=async()=>{const {error}=await supabase.rpc('create_club_with_admin',{club_name:val('clubName'),club_slug:val('clubSlug'),primary_colour:'#202f78',accent_colour:'#d8232a'});if(error)return document.getElementById('createStatus').textContent=error.message;loadContext();};
}
async function loadData(){
 const [pRes,dRes,sdRes,wRes]=await Promise.all([
  supabase.from('philosophy_profiles').select('*').eq('club_id',club.id).single(),
  supabase.from('philosophy_dimension_catalogue').select('*').order('sort_order'),
  supabase.from('club_philosophy_dimensions').select('*').eq('club_id',club.id),
  supabase.from('club_format_weights').select('*').eq('club_id',club.id)
 ]);
 profile=pRes.data||{};
 profile.identity_values=Array.isArray(profile.identity_values)?profile.identity_values:[];
 profile.formats_enabled=profile.formats_enabled||{t20:true,limited_overs:true,long_form:true};
 dimensions=dRes.data||[];
 selectedDims=new Map((sdRes.data||[]).map(x=>[x.dimension_key,x]));
 weights=new Map((wRes.data||[]).map(x=>[`${x.dimension_key}:${x.format_key}`,Number(x.weight)]));
}
function renderShell(){
 document.documentElement.style.setProperty('--navy',club.primary_colour||'#202f78');
 document.documentElement.style.setProperty('--red',club.accent_colour||'#d8232a');
 app.innerHTML=`<div class="shell"><header class="hero"><div class="topline"><div><div class="k">${esc(club.name)}</div><h1>Batting Development</h1><p>Define what should always be true, choose the ideas that belong in your batting system, then decide how their importance changes by format.</p></div><button class="btn ghost" id="out">Sign out</button></div></header>
 <nav class="nav">
 <button data-tab="identity">1. Club Identity</button>
 <button data-tab="dimensions">2. What We Value</button>
 <button data-tab="formats">3. Format Emphasis</button>
 <button data-tab="preview">4. How We Bat</button>
 <button data-tab="plan">5. Player Plan</button>
 </nav><main class="page" id="page"></main></div>`;
 document.getElementById('out').onclick=()=>supabase.auth.signOut();
 document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;renderTab()});
 renderTab();
}
function renderTab(){
 document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));
 ({identity:renderIdentity,dimensions:renderDimensions,formats:renderFormats,preview:renderPreview,plan:renderPlan}[currentTab])();
}
function naturalList(a){
 if(a.length===1)return a[0];
 if(a.length===2)return `${a[0]} and ${a[1]}`;
 return `${a.slice(0,-1).join(', ')}, and ${a[a.length-1]}`;
}
function identitySummary(){
 const chosen=IDENTITY_OPTIONS.filter(([k])=>profile.identity_values.includes(k)).map(([,l])=>l.toLowerCase());
 if(!chosen.length)return 'Choose the ideas that should remain true regardless of format.';
 return `Across formats, ${club.name} wants batters who ${naturalList(chosen)}.`;
}
function renderIdentity(){
 document.getElementById('page').innerHTML=`<div class="grid">
 <section class="card"><div class="section-label">What should survive every format?</div><h2>Club batting identity</h2><div class="help">Choose everything that feels genuinely true of your club. There is deliberately no global “top three” — format-specific priorities come later.</div>
 <div class="choice-grid">${IDENTITY_OPTIONS.map(([k,l,d])=>`<label class="choice ${profile.identity_values.includes(k)?'on':''}"><input type="checkbox" data-identity="${k}" ${profile.identity_values.includes(k)?'checked':''}><strong>${esc(l)}</strong><p>${esc(d)}</p></label>`).join('')}</div>
 <div class="field"><label>Anything these choices don’t capture? (optional)</label><textarea id="identityNote" placeholder="Add nuance in your own words…">${esc(profile.identity_note||'')}</textarea></div></section>
 <section class="card"><div class="section-label">Formats your club plays</div><h2>Which versions of the game matter here?</h2>
 <div class="formats">${FORMATS.map(([k,l])=>`<label class="format-chip"><input type="checkbox" data-format="${k}" ${profile.formats_enabled?.[k]!==false?'checked':''}>${l}</label>`).join('')}</div>
 <div class="identity-summary"><div class="title">What we’re hearing</div><p id="identitySummary">${esc(identitySummary())}</p></div>
 <div class="btnrow"><button class="btn secondary" id="saveIdentity">Save & continue</button><span class="status" id="identityStatus"></span></div></section></div>`;
 document.querySelectorAll('[data-identity]').forEach(x=>x.onchange=()=>{x.closest('.choice').classList.toggle('on',x.checked);collectIdentity(false);document.getElementById('identitySummary').textContent=identitySummary()});
 document.getElementById('saveIdentity').onclick=async()=>{collectIdentity(true);const ok=await saveProfile('identityStatus');if(ok){currentTab='dimensions';renderTab()}};
}
function collectIdentity(withNote){
 profile.identity_values=[...document.querySelectorAll('[data-identity]:checked')].map(x=>x.dataset.identity);
 profile.formats_enabled=Object.fromEntries(FORMATS.map(([k])=>[k,!!document.querySelector(`[data-format="${k}"]`)?.checked]));
 if(withNote)profile.identity_note=val('identityNote');
}
async function saveProfile(statusId){
 const s=document.getElementById(statusId);if(s)s.textContent='Saving…';
 const payload={...profile,club_id:club.id,updated_at:new Date().toISOString()};delete payload.id;
 const {error}=await supabase.from('philosophy_profiles').upsert(payload,{onConflict:'club_id'});
 if(s)s.textContent=error?error.message:'Saved';
 return !error;
}
function renderDimensions(){
 document.getElementById('page').innerHTML=`<div class="grid">
 <section class="card"><div class="section-label">Stimulus, not a prescription</div><h2>Which ideas belong in your batting system?</h2><div class="help">Select broadly. You are not ranking them here. “Excellent leaving” can matter enormously even if it only becomes a major priority in long-form cricket.</div>
 <div class="dimension-list">${dimensions.map(d=>{const on=selectedDims.has(d.dimension_key);return `<label class="dimension ${on?'on':''}"><input type="checkbox" data-dim="${d.dimension_key}" ${on?'checked':''}><div><strong>${esc(d.label)}</strong><p>${esc(d.description)}</p><div class="stimulus"><strong>Think about:</strong> ${esc(d.stimulus)}</div></div></label>`}).join('')}</div></section>
 <section class="card"><div class="section-label">Optional nuance</div><h2>React first. Explain only where useful.</h2><div class="help">The choices are the stimulus material. You only need to write when your club has something specific to add.</div>
 <div id="dimensionNotes"></div><div class="btnrow"><button class="btn secondary" id="saveDims">Save & set format emphasis</button><span class="status" id="dimStatus"></span></div></section></div>`;
 document.querySelectorAll('[data-dim]').forEach(x=>x.onchange=()=>{x.closest('.dimension').classList.toggle('on',x.checked);renderDimensionNotes()});
 renderDimensionNotes();document.getElementById('saveDims').onclick=saveDimensions;
}
function renderDimensionNotes(){
 const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
 document.getElementById('dimensionNotes').innerHTML=keys.length?keys.map(k=>{const d=dimensions.find(x=>x.dimension_key===k);const note=selectedDims.get(k)?.club_note||'';return `<div class="field"><label>${esc(d.label)} — anything specific? (optional)</label><textarea data-dim-note="${k}" placeholder="Leave blank if the selections already say enough…">${esc(note)}</textarea></div>`}).join(''):'<div class="notice">Choose some dimensions on the left first.</div>';
}
async function saveDimensions(){
 const s=document.getElementById('dimStatus');s.textContent='Saving…';
 const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
 const rows=keys.map(k=>({club_id:club.id,dimension_key:k,enabled:true,club_note:document.querySelector(`[data-dim-note="${k}"]`)?.value.trim()||''}));
 let {error}=await supabase.from('club_philosophy_dimensions').delete().eq('club_id',club.id);if(error)return s.textContent=error.message;
 if(rows.length){({error}=await supabase.from('club_philosophy_dimensions').insert(rows));if(error)return s.textContent=error.message}
 selectedDims=new Map(rows.map(x=>[x.dimension_key,x]));initialiseMissingWeights();await saveWeights();s.textContent='Saved';currentTab='formats';renderTab();
}
function initialiseMissingWeights(){
 for(const k of selectedDims.keys())for(const [f] of FORMATS){const key=`${k}:${f}`;if(!weights.has(key))weights.set(key,DEFAULT_WEIGHTS[k]?.[f]??2);}
}
function enabledFormats(){return FORMATS.filter(([k])=>profile.formats_enabled?.[k]!==false)}
function renderFormats(){
 initialiseMissingWeights();const formats=enabledFormats();
 document.getElementById('page').innerHTML=`<div class="card"><div class="section-label">When does each thing matter most?</div><h2>Format emphasis</h2><div class="help">This is where the philosophy changes shape. Nothing is globally ranked. Set the emphasis for each selected dimension in each format your club plays.</div>
 ${formats.length?`<div class="matrix-wrap"><table class="matrix"><thead><tr><th>Batting dimension</th>${formats.map(([,l])=>`<th>${l}</th>`).join('')}</tr></thead><tbody>${[...selectedDims.keys()].map(k=>{const d=dimensions.find(x=>x.dimension_key===k);return `<tr><td class="dimname">${esc(d?.label||k)}</td>${formats.map(([f])=>`<td><select class="weight" data-weight-key="${k}:${f}">${WEIGHT_LABELS.map((l,i)=>`<option value="${i}" ${Number(weights.get(`${k}:${f}`)??2)===i?'selected':''}>${l}</option>`).join('')}</select></td>`).join('')}</tr>`}).join('')}</tbody></table></div>`:'<div class="notice">No formats are enabled. Go back to Club Identity and select at least one.</div>'}
 <div class="btnrow"><button class="btn secondary" id="saveWeights">Save & generate How We Bat</button><span class="status" id="weightStatus"></span></div></div>`;
 document.getElementById('saveWeights').onclick=async()=>{document.querySelectorAll('[data-weight-key]').forEach(x=>weights.set(x.dataset.weightKey,Number(x.value)));const ok=await saveWeights('weightStatus');if(ok){currentTab='preview';renderTab()}};
}
async function saveWeights(statusId){
 const s=statusId?document.getElementById(statusId):null;if(s)s.textContent='Saving…';
 let {error}=await supabase.from('club_format_weights').delete().eq('club_id',club.id);if(error){if(s)s.textContent=error.message;return false}
 const rows=[];for(const k of selectedDims.keys())for(const [f] of FORMATS)rows.push({club_id:club.id,dimension_key:k,format_key:f,weight:Number(weights.get(`${k}:${f}`)??2)});
 if(rows.length){({error}=await supabase.from('club_format_weights').insert(rows));if(error){if(s)s.textContent=error.message;return false}}
 if(s)s.textContent='Saved';return true;
}
function topEmphasis(format){
 return [...selectedDims.keys()].map(k=>({key:k,weight:Number(weights.get(`${k}:${format}`)??0),d:dimensions.find(x=>x.dimension_key===k)})).filter(x=>x.weight>0).sort((a,b)=>b.weight-a.weight||(a.d?.sort_order||999)-(b.d?.sort_order||999));
}
function formatNarrative(format){
 const top=topEmphasis(format);if(!top.length)return 'This format has not yet been given any specific emphasis.';
 const very=top.filter(x=>x.weight===4).map(x=>x.d.label.toLowerCase());const high=top.filter(x=>x.weight===3).map(x=>x.d.label.toLowerCase());const low=top.filter(x=>x.weight===1).map(x=>x.d.label.toLowerCase());
 let text='';if(very.length)text+=`In this format, ${naturalList(very)} ${very.length===1?'is':'are'} central to the way we want to bat. `;if(high.length)text+=`${naturalList(high)} ${high.length===1?'is':'are'} also strongly emphasised. `;if(low.length)text+=`${naturalList(low)} ${low.length===1?'remains':'remain'} part of the system, but with lower emphasis here.`;return text.trim();
}
function renderPreview(){
 const formats=enabledFormats();if(!formats.some(([k])=>k===previewFormat))previewFormat=formats[0]?.[0]||'limited_overs';
 const identity=identitySummary()+(profile.identity_note?` ${profile.identity_note}`:'');
 document.getElementById('page').innerHTML=`<div class="grid"><section><div class="preview"><div class="preview-head"><div class="k">${esc(club.name)}</div><h2>How We Bat</h2><div style="font-size:11px;line-height:1.5;opacity:.9">${esc(identity)}</div></div>
 <div class="preview-section"><h3>Our identity</h3><p>${esc(identity)}</p></div>
 <div class="preview-section"><div class="format-tabs">${formats.map(([k,l])=>`<button data-preview-format="${k}" class="${k===previewFormat?'active':''}">${l}</button>`).join('')}</div><h3>${esc(FORMATS.find(([k])=>k===previewFormat)?.[1]||'Format')} expression</h3><p>${esc(formatNarrative(previewFormat))}</p>
 <div class="emphasis">${topEmphasis(previewFormat).slice(0,8).map(x=>`<div class="emphasis-row"><strong>${esc(x.d.label)}</strong><span>${WEIGHT_LABELS[x.weight]}</span></div>`).join('')}</div></div></div></section>
 <section class="card"><div class="section-label">Why this flows</div><h2>One philosophy. Different expression.</h2><div class="help">The club identity does not change when the format changes. The emphasis does. That lets “excellent leaving” be huge in long-form cricket without pretending it should be equally important in T20.</div>
 <div class="notice"><strong>Next:</strong> the Player Plan uses the same structure — one core player identity plus format-specific overlays.</div><div class="btnrow"><button class="btn secondary" id="toPlan">See Player Plan structure</button></div></section></div>`;
 document.querySelectorAll('[data-preview-format]').forEach(b=>b.onclick=()=>{previewFormat=b.dataset.previewFormat;renderPreview()});document.getElementById('toPlan').onclick=()=>{currentTab='plan';renderTab()};
}
const OVERLAY_MAP={
 leaving_defending:['Leave / Defend','Which balls are you prepared to leave or defend, and what does good control look like?'],
 strike_rotation:['Strike Rotation','Where are your safest ways to keep the scoreboard moving?'],
 boundary_access:['Boundary Options','Which boundary options do you genuinely trust in this format?'],
 running:['Running Plan','How will you create runs through singles, twos and pressure running?'],
 scoring_areas:['Scoring Areas','Where are your strongest scoring areas and which balls access them?'],
 tempo:['Tempo / Match Phase','How should your intent change as the innings develops?'],
 matchups:['Matchup Plan','Which bowlers suit you, and which do you manage rather than force?'],
 spin_method:['Plan Against Spin','What method do you trust against spin?'],
 pace_method:['Plan Against Pace','What method do you trust against pace?'],
 risk_management:['Decision Rules','What tells you that extra risk is justified in this format?'],
 dot_ball_management:['Dot-Ball Response','When dots build up, what is your safest way of changing the situation?'],
 powerplay:['Powerplay Plan','How do you use the field restrictions without abandoning your strengths?'],
 death_overs:['Death-Overs Plan','Which options do you trust when boundary scoring becomes more important?'],
 patience:['Patience / Occupation','What helps you stay patient and keep making good decisions?'],
 partnerships:['Partnership Plan','What role do you play in building and managing a partnership?'],
 innovation:['Innovation','Which manufactured or premeditated options are genuinely part of your game?'],
 wicket_preservation:['Wicket Value','How should the value of your wicket affect your decisions in this format?'],
 reset_routines:['Reset Routine','What is your reset when the innings starts pulling you away from your plan?']
};
function overlayModules(format){
 return topEmphasis(format).filter(x=>x.weight>=2&&OVERLAY_MAP[x.key]).map(x=>({key:x.key,label:OVERLAY_MAP[x.key][0],prompt:OVERLAY_MAP[x.key][1],weight:x.weight}));
}
function renderPlan(){
 const formats=enabledFormats();
 const core=[['Trusted Strengths','What scoring options do you genuinely trust?'],['Danger + Reset','What tends to take you away from your plan, and how do you reset?'],['Current Focus','What are you trying to improve right now?']];
 document.getElementById('page').innerHTML=`<div class="grid"><section class="card"><div class="section-label">Always the same player</div><h2>Core player identity</h2><div class="modules">${core.map((m,i)=>`<div class="module"><div class="icon">${i+1}</div><div><strong>${m[0]}</strong><p>${m[1]}</p></div><div class="badge">CORE</div></div>`).join('')}</div></section>
 <section class="card"><div class="section-label">Same player, different demands</div><h2>Format overlays</h2><div class="help">The guided player questionnaire will change according to both the club philosophy and the selected format.</div>${formats.map(([f,l])=>`<h3>${l}</h3><div class="modules">${overlayModules(f).map((m,i)=>`<div class="module"><div class="icon">${i+1}</div><div><strong>${m.label}</strong><p>${m.prompt}</p></div><div class="badge format">${WEIGHT_LABELS[m.weight]}</div></div>`).join('')||'<div class="notice">No overlay modules yet.</div>'}</div>`).join('')}</section></div>`;
}
boot();
