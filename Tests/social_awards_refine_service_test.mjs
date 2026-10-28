import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {refineAward} from '../Functions/club-social-style/award-refine.mjs';
import {visualSettings,refinedAwardLayout} from '../social-awards-design.js';
import {awardLayout} from '../social-awards-model.js';

const club='11111111-1111-4111-8111-111111111111',example=club+'/artwork/22222222-2222-4222-8222-222222222222.png';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const request=()=>({purpose:'award_refine',club_id:club,kind:'results',brief:'Match our green and gold brush badges. Keep the rest.',week_end:'2026-10-11',design_revision:3,current:visualSettings(awardLayout('results')),preview:'data:image/png;base64,'+png.toString('base64')});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function setup(overrides={}){
 const calls=[],response={changes:{badge_style:'brush',win_colour:'#225533'},badges:[],explanation:'Green brush badges.',artwork_brief:null};
 const fetcher=async(url,options)=>{const body=options.body?JSON.parse(options.body):null;calls.push({url,options,body});
  if(url.endsWith('/auth/v1/user'))return json({id:'user'},overrides.auth||200);
  if(body?.p_action==='access')return json({allowed:overrides.allowed!==false});
  if(body?.p_action==='context')return json(overrides.context||{designs:{results:{revision:overrides.revision??3,layout:{example_path:overrides.example??example}}}});
  if(body?.p_action==='style_request')return overrides.limit?json({message:'The club has used its style suggestions for now.'},400):json({brand:{name:'Green & Gold Club',primary:'#225533',accent:'#EAC552'},references:[]});
  if(url.includes('/storage/'))return new Response(png,{headers:{'Content-Type':'image/png'}});
  if(url==='https://api.openai.com/v1/responses')return overrides.providerStatus?json({},overrides.providerStatus):json({status:'completed',output_text:JSON.stringify(overrides.output||response)});
  throw Error('Unexpected request');
 };
 return {calls,options:{url:'https://test.supabase.co',anon:'public-key',key:'test-provider-key',model:'configured-vision-model',authorization:'Bearer user-token',fetcher}};
}
test('uses the current preview, only this club’s saved example, configured model and existing allowance',async()=>{
 const {calls,options}=setup(),body=request();body.example_path='other-club/artwork/forged.png';body.request_id='reuse-me';
 const result=await refineAward(body,options);assert.equal(result.status,200);assert.equal(result.body.example_path,example);assert.equal(result.body.changes.badge_style,'brush');
 const provider=calls.find(c=>c.url.includes('api.openai.com')),counted=calls.find(c=>c.body?.p_action==='style_request');
 assert.equal(provider.body.model,'configured-vision-model');assert.equal(provider.body.store,false);assert.equal(provider.body.text.format.strict,true);assert.equal(provider.body.input[0].content.filter(c=>c.type==='input_image').length,2);
 assert.ok(!JSON.stringify(provider.body).includes('forged.png'));assert.ok(!JSON.stringify(provider.body.text.format.schema).includes('our_team'));
 assert.deepEqual(counted.body.p_data.reference_ids,[]);assert.notEqual(counted.body.p_data.request_id,body.request_id);
 assert.equal(calls.find(c=>c.url.includes('/storage/')).url,'https://test.supabase.co/storage/v1/object/authenticated/club-social-awards/'+example);
 for(const c of calls.filter(c=>c.url.includes('supabase')))assert.equal(c.options.headers.Authorization,'Bearer user-token');
 assert.ok(!calls.some(c=>/save_design|reserve_image|finish_image/.test(c.body?.p_action||'')));
 await refineAward(body,options);const attempts=calls.filter(c=>c.body?.p_action==='style_request');assert.notEqual(attempts[0].body.p_data.request_id,attempts[1].body.p_data.request_id);
});
test('denied auth, club access, stale revision, foreign reference and allowance never call the model',async()=>{
 for(const [overrides,status] of [[{auth:401},401],[{allowed:false},403],[{revision:4},409],[{example:'another-club/artwork/example.png'},400],[{limit:true},429]]){
  const {calls,options}=setup(overrides);assert.equal((await refineAward(request(),options)).status,status);assert.ok(!calls.some(c=>c.url.includes('openai')));
 }
});
test('rejects oversized/invalid previews and factual or unsafe settings before any request',async()=>{
 for(const mutate of [b=>b.current.result='WIN',b=>b.current.toString=true,b=>b.current.row_gap=-50,b=>b.preview='https://evil.invalid/image.png',b=>b.preview='data:image/png;base64,'+'A'.repeat(2800000)]){
  const {calls,options}=setup(),body=request();mutate(body);assert.equal((await refineAward(body,options)).status,400);assert.equal(calls.length,0);
 }
});
test('model output cannot change facts, replace asset paths or produce invalid crops',async()=>{
 for(const output of [{changes:{result:'WIN'}},{changes:{background_path:example}},{changes:{rows_top:65,rows_bottom:70}},{changes:{},badges:[{label:'VICTORY',x:0,y:0,width:.1,height:.1}]},{changes:{},badges:[{label:'WIN',x:.99,y:0,width:.2,height:.1}]}]){
  const {options}=setup({output});assert.equal((await refineAward(request(),options)).status,502);
 }
});
test('only valid WIN/DEF crops from the saved example can reach the renderer',async()=>{
 const badges=[{label:'WIN',x:.4,y:.3,width:.15,height:.05},{label:'DEF',x:.4,y:.6,width:.15,height:.05}],{options}=setup({output:{changes:{badge_size:50},badges,explanation:'Check both badge crops.',artwork_brief:null}});
 const result=await refineAward(request(),options);assert.equal(result.status,200);
 const current=awardLayout('results',{example_path:example}),next=refinedAwardLayout(current,result.body,'results');assert.equal(next.badge_source,example);assert.deepEqual(next.badge_crops,badges);
 assert.throws(()=>refinedAwardLayout({...current,example_path:'changed.png'},result.body,'results'),/example changed/);
 assert.throws(()=>refinedAwardLayout(current,result.body,'century'),/example changed/);
 assert.equal(refinedAwardLayout(next,{changes:{badge_style:'outline'},badges:[]},'results').badge_crops,undefined);
});
test('image changes hand off honestly and provider failures leave the existing design alone',async()=>{
 const output={changes:{},badges:[],explanation:'The heading is part of the background. Review the artwork edit.',artwork_brief:'Move the existing title down a little. Preserve everything else.'},first=setup({output});
 const result=await refineAward(request(),first.options);assert.equal(result.status,200);assert.equal(result.body.artwork_brief,output.artwork_brief);assert.deepEqual(result.body.changes,{});
 for(const providerStatus of [429,500]){const {options}=setup({providerStatus});const failed=await refineAward(request(),options);assert.equal(failed.status,providerStatus===429?429:502);assert.equal(failed.body.changes,undefined);}
});
test('the deployed router preserves legacy team suggestions and gates both routes',async()=>{
 let handler,refined=0;const network=[];
 const legacy={design:{layout:'list',theme:'solid',frame:'rectangle',font:'clean',marker:'name',primary:'#223344',accent:'#553322'},explanation:'Club palette.'};
 const source=stripTypeScriptTypes(readFileSync(new URL('../Functions/club-social-style/index.ts',import.meta.url),'utf8').replace("import {refineAward} from './award-refine.mjs';",''));
 vm.runInNewContext(source,{Deno:{env:{get:k=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-key',OPENAI_API_KEY:'test-provider-key',OPENAI_SOCIAL_STYLE_MODEL:'configured-model'})[k]},serve:fn=>handler=fn},refineAward:async()=>{refined++;return {status:200,body:{changes:{}}};},Request,Response,AbortSignal,crypto,Uint8Array,btoa,fetch:async(url,options)=>{
  network.push(url);if(url.endsWith('/auth/v1/user'))return json({id:'user'});const body=JSON.parse(options.body);if(body.p_action==='access')return json({allowed:true});if(body.p_action==='style_request')return json({brand:{name:'Test'},references:[]});assert.equal(body.text.format.name,'club_announcement_style');return json({output_text:JSON.stringify(legacy)});
 }});
 const req=body=>new Request('https://test/club-social-style',{method:'POST',headers:{Authorization:'Bearer user-token'},body:JSON.stringify(body)});
 assert.equal((await handler(new Request('https://test/',{method:'OPTIONS'}))).status,204);
 assert.equal((await handler(new Request('https://test/',{method:'POST',body:'{}'}))).status,401);
 const old=await handler(req({club_id:club,brief:'Use our colours.',reference_ids:[]}));assert.equal(old.status,200);assert.deepEqual(await old.json(),legacy);
 assert.equal((await handler(req(request()))).status,200);assert.equal(refined,1);
 const before=network.length;assert.equal((await handler(req({club_id:club,brief:'x'.repeat(7100),reference_ids:[]}))).status,400);assert.equal(network.length,before);
});

test('every graphic profile uses scoped grades, caller permissions and revision checks',async()=>{
 const grade='Rippit Development League';
 for(const [kind,api] of [['team_week','team_of_week_api'],['player_week','player_of_week_api'],['team_selections','club_socials_api'],['results','club_social_awards_api'],['century','club_social_awards_api'],['five_wickets','club_social_awards_api']]){
  const layout=kind==='team_week'?{top:620,bottom:1230,left:65,figures_right:825,grade_right:1015}:{};
  const context={design:{revision:3,layout},designs:{[kind]:{revision:3,layout}},revision:3,candidates:[{grade},{grade:'1st Grade'}],fixtures:[{published:{details:{grade}}}],assets:[]};if(kind==='team_selections')context.design=layout;
  const output={changes:{},grade_labels:[{grade,label:'Dev'}],badges:[],explanation:'Short label.',artwork_brief:null},base={...request(),kind,purpose:'graphic_refine',current:layout,preview_grades:[grade],grade_labels:[{grade,label:'Dev League'}]};
  const good=setup({context,output}),result=await refineAward(base,good.options);assert.equal(result.status,200,kind+': '+JSON.stringify(result.body));assert.deepEqual(result.body.grade_labels,[{grade,label:'Dev'}]);
  assert.ok(good.calls.some(c=>c.body?.p_action==='context'&&c.url.endsWith('/'+api)));
  const prompt=JSON.parse(good.calls.find(c=>c.url.includes('openai')).body.input[0].content[0].text);assert.deepEqual(prompt.available_grades,[{grade,label:'Dev League'}]);
  for(const [override,status] of [[{allowed:false},403],[{auth:401},401],[{limit:true},429]]){const denied=setup({context,output,...override});assert.equal((await refineAward(base,denied.options)).status,status);assert.ok(!denied.calls.some(c=>c.url.includes('openai')));}
  const stale=setup({context,output});assert.equal((await refineAward({...base,design_revision:2},stale.options)).status,409);assert.ok(!stale.calls.some(c=>c.body?.p_action==='style_request'));
  for(const badOutput of [{changes:{players:['Replacement']},grade_labels:[]},{changes:{},grade_labels:[{grade:'Other Club Grade',label:'Dev'}]},{changes:{},grade_labels:[{grade,label:'<script>bad</script>'}]}]){const bad=setup({context,output:badOutput});assert.equal((await refineAward(base,bad.options)).status,502);}
  const unknown=setup({context,output});assert.equal((await refineAward({...base,preview_grades:['Foreign grade']},unknown.options)).status,400);assert.ok(!unknown.calls.some(c=>c.body?.p_action==='style_request'));
 }
});

test('week/round labels are bounded presentation text, separate from reusable styles and source dates',async()=>{
 for(const kind of ['team_week','player_week','results','century','five_wickets']){
  const layout=kind==='team_week'?{top:620,bottom:1230,left:65,figures_right:825,grade_right:1015}:{},context={design:{revision:3,layout},designs:{[kind]:{revision:3,layout}},candidates:[]};
  const output={changes:{},grade_labels:[],graphic_label:'Round 2',artwork_brief:null,explanation:'Show Round 2.'};
  const body={...request(),purpose:'graphic_refine',kind,current:layout,graphic_label:'WEEK ENDING 18/10/2026',brief:'Replace Week ending with Round 2 for this week.'};
  const {calls,options}=setup({context,output}),result=await refineAward(body,options);assert.equal(result.status,200);assert.equal(result.body.graphic_label,'Round 2');assert.deepEqual(result.body.changes,{});assert.equal(result.body.artwork_brief,null);assert.equal(body.week_end,'2026-10-11');
  const provider=calls.find(c=>c.url.includes('openai'));assert.equal(JSON.parse(provider.body.input[0].content[0].text).graphic_label,body.graphic_label);assert.match(provider.body.instructions,/must return graphic_label/);assert.match(provider.body.instructions,/never infer a round/);assert.ok(provider.body.text.format.schema.required.includes('graphic_label'));assert.equal(provider.body.text.format.schema.properties.changes.properties.graphic_label,undefined);
  for(const value of ['', 'x'.repeat(61),'<script>x</script>','Round\n2',2]){const invalid=setup({context,output:{...output,graphic_label:value}});assert.equal((await refineAward(body,invalid.options)).status,502);}
  const invalid=setup({context,output});assert.equal((await refineAward({...body,graphic_label:'<html>'},invalid.options)).status,400);assert.equal(invalid.calls.length,0);
 }
 const unsupported=setup({context:{design:{},revision:3},output:{changes:{},graphic_label:'Round 2'}});assert.equal((await refineAward({...request(),kind:'team_selections',current:{}},unsupported.options)).status,502);
});

const figuresFixture=()=>{
 const dominic={key:'card:team:dominic',name:'Dominic Wood',grade:'Dev League Sky',batting:[{runs:47}],bowling:[{wickets:2,runs:8}]};
 const other={key:'card:team:other',name:'Other Player',grade:'Dev League Sky',batting:[{runs:80}],bowling:[]};
 const layout={top:620,bottom:1230,left:65,figures_right:825,grade_right:1015};
 return {dominic,other,context:{design:{revision:3,layout},candidates:[dominic,other]},body:{...request(),purpose:'graphic_refine',kind:'team_week',current:layout,brief:"Show Dominic Wood's bowling figures also",preview_players:[{key:dominic.key,display:'batting'}],include_provisional:true,award_scope:{mode:'grades',ids:['dev-sky']}}};
};
test('bowling also uses verified selected-player keys and a display-only schema, preserving week and scope',async()=>{
 const {dominic,context,body}=figuresFixture(),player_displays=[{key:dominic.key,display:'both'}];
 const {calls,options}=setup({context,output:{changes:{},grade_labels:[],graphic_label:null,player_displays,explanation:'Show both recorded figures.',artwork_brief:null}});
 const before=JSON.stringify(context),result=await refineAward(body,options);assert.equal(result.status,200);assert.deepEqual(result.body.player_displays,player_displays);assert.equal(JSON.stringify(context),before);
 const provider=calls.find(c=>c.url.includes('openai')),prompt=JSON.parse(provider.body.input[0].content[0].text),schema=provider.body.text.format.schema;
 assert.deepEqual(prompt.available_players,[{key:dominic.key,name:dominic.name,grade:dominic.grade,display:'batting',available_figures:['batting','bowling']}]);
 assert.equal(prompt.design_brief,body.brief);assert.deepEqual(schema.properties.player_displays.items.properties.key.enum,[dominic.key]);
 assert.deepEqual(Object.keys(schema.properties.player_displays.items.properties),['key','display']);assert.equal(schema.properties.player_displays.items.additionalProperties,false);
 assert.ok(schema.required.includes('player_displays'));assert.match(provider.body.instructions,/ALSO.*display: "both"/);assert.match(provider.body.instructions,/ask which player if ambiguous/);
 assert.deepEqual(calls.find(c=>c.body?.p_action==='context').body.p_data,{week_end:body.week_end,include_provisional:true,award_scope:body.award_scope});
 assert.ok(!calls.some(c=>/save|reserve|finish/.test(c.body?.p_action||'')));
});
test('invalid, missing or unavailable preview players fail before using the club allowance',async()=>{
 const {dominic,other,context,body}=figuresFixture();
 for(const preview_players of [[{key:'foreign',display:'both'}],[{key:dominic.key,display:'batting',name:'Forged player'}],[{key:dominic.key,display:'batting'},{key:dominic.key,display:'both'}],[{key:other.key,display:'both'}],[{key:dominic.key,display:'allround'}],{}]){
  const {calls,options}=setup({context});const result=await refineAward({...body,preview_players},options);assert.equal(result.status,400);assert.ok(!calls.some(c=>c.body?.p_action==='style_request'||c.url.includes('openai')));
 }
 const denied=setup({context});assert.equal((await refineAward({...body,kind:'player_week',current:{}},denied.options)).status,400);
});
test('assistant output cannot invent figures, use an unselected player or show a missing bowling record',async()=>{
 const {dominic,other,context,body}=figuresFixture();
 for(const player_displays of [[{key:dominic.key,display:'both',wickets:5}],[{key:other.key,display:'batting'}],[{key:dominic.key,display:'both'},{key:dominic.key,display:'bowling'}],[{key:dominic.key,display:'allround'}]]){
  const {options}=setup({context,output:{changes:{},grade_labels:[],player_displays}});assert.equal((await refineAward(body,options)).status,502);
 }
 const missing=setup({context,output:{changes:{},player_displays:[{key:other.key,display:'bowling'}]}});
 assert.equal((await refineAward({...body,preview_players:[{key:other.key,display:'batting'}]},missing.options)).status,502);
 // Existing frontends do not send players and retain the previous schema and response.
 const legacy=setup({context,output:{changes:{},grade_labels:[],artwork_brief:null}}),legacyBody={...body};delete legacyBody.preview_players;
 const result=await refineAward(legacyBody,legacy.options);assert.equal(result.status,200);assert.equal(result.body.player_displays,undefined);
 assert.equal(legacy.calls.find(c=>c.url.includes('openai')).body.text.format.schema.properties.player_displays,undefined);
});

test('initial example setup matches supported typography, wording and layout without copying labels or facts',async()=>{
 const output={changes:{font:'sporting',result_labels:'won_lost',rows_top:24,rows_bottom:95,row_gap:18},badges:[],grade_labels:[],graphic_label:null,explanation:'Matched the wording and closest supported font.',artwork_brief:null};
 const body={...request(),example_setup:true},good=setup({output}),result=await refineAward(body,good.options);
 assert.equal(result.status,200);assert.deepEqual(result.body.changes,output.changes);
 assert.match(good.calls.find(c=>c.url.includes('openai')).body.instructions,/INITIAL EXAMPLE SETUP/);
 for(const extra of [{graphic_label:'Old round'}, {artwork_brief:'Paint WON into the background'}, {badges:[{label:'WON',x:.4,y:.3,width:.15,height:.05}]}]){
  const bad=setup({output:{...output,...extra}});assert.equal((await refineAward(body,bad.options)).status,502);
 }
 const missing=setup({context:{designs:{results:{revision:3,layout:{}}}}});assert.equal((await refineAward(body,missing.options)).status,400);assert.ok(!missing.calls.some(c=>c.body?.p_action==='style_request'));
});
test('paired wording is supported across every row; incomplete crops fall back consistently and older clients remain compatible',async()=>{
 const changes={result_labels:'won_lost',font:'sporting'},good=setup({output:{changes,badges:[],artwork_brief:null}}),result=await refineAward(request(),good.options);
 assert.equal(result.status,200);assert.deepEqual(result.body.changes,changes);assert.equal(result.body.artwork_brief,null);
 const partial=setup({output:{changes:{result_labels:'won_lost'},badges:[{label:'WON',x:.4,y:.3,width:.15,height:.05}],artwork_brief:null}}),fallback=await refineAward(request(),partial.options);
 assert.equal(fallback.status,200);assert.deepEqual(fallback.body.badges,[]);assert.match(fallback.body.explanation,/Both result words/);
 const legacyBody=request();delete legacyBody.current.result_labels;
 const legacy=setup(),old=await refineAward(legacyBody,legacy.options);assert.equal(old.status,200);
 const schema=legacy.calls.find(c=>c.url.includes('openai')).body.text.format.schema;assert.equal(schema.properties.changes.properties.result_labels,undefined);assert.deepEqual(schema.properties.badges.items.properties.label.enum,['WIN','DEF']);
 const invalid=setup({output:{changes,badges:[]}});assert.equal((await refineAward(legacyBody,invalid.options)).status,502);
});

test('template typography and margin styling are visual-only; actual font samples reach the model',async()=>{
 const changes={title_font:'condensed',player_font:'sans',badge_font:'script',badge_style:'glow',margin_font:'condensed',show_margin:true,layout_mode:'template'},body={...request(),font_samples:request().preview,reference_review:true};
 const {calls,options}=setup({output:{changes,badges:[],grade_labels:[],graphic_label:null,artwork_brief:null,explanation:'Separate heading, body and brush lettering.'}}),result=await refineAward(body,options);
 assert.equal(result.status,200);assert.deepEqual(result.body.changes,changes);
 const provider=calls.find(c=>c.url.includes('openai'));assert.equal(provider.body.input[0].content.filter(x=>x.type==='input_image').length,3);assert.match(provider.body.instructions,/already RENDERED/);assert.match(provider.body.instructions,/show_margin renders the true/);
 const fields=provider.body.text.format.schema.properties.changes.properties;assert.ok(fields.badge_font.enum.includes('script'));assert.equal(fields.margin_text,undefined);assert.equal(fields.result,undefined);
 for(const font_samples of ['https://example.test/font.png','data:image/png;base64,YmFk']){const bad=setup();assert.equal((await refineAward({...body,font_samples},bad.options)).status,400);assert.equal(bad.calls.length,0);}
 for(const extra of [{artwork_brief:'Change the background'},{graphic_label:'Old round'},{changes:{margin_text:'BY 100 RUNS'}}]){const bad=setup({output:{changes,badges:[],...extra}});assert.equal((await refineAward(body,bad.options)).status,502);}
});
test('older award clients receive no unsupported typography or glow fields',async()=>{
 const body=request();for(const key of Object.keys(body.current))if(key.endsWith('_font')||['layout_mode','title_case','grade_case','show_margin','margin_size','margin_y','margin_colour','grade_width','row_logo_size','row_logo_y','player_top','score_y'].includes(key))delete body.current[key];
 const good=setup();assert.equal((await refineAward(body,good.options)).status,200);
 const fields=good.calls.find(c=>c.url.includes('openai')).body.text.format.schema.properties.changes.properties;assert.equal(fields.title_font,undefined);assert.equal(fields.show_margin,undefined);assert.ok(!fields.badge_style.enum.includes('glow'));assert.equal(fields.row_gap.maximum,55);
 for(const changes of [{title_font:'condensed'},{badge_style:'glow'},{row_gap:80}]){const bad=setup({output:{changes,badges:[]}});assert.equal((await refineAward(body,bad.options)).status,502);}
});

test('reference matching reselects every type role and retains a complete lettering pair through initial setup',async()=>{
 const changes={result_labels:'won_lost',title_font:'condensed',week_font:'sans',grade_font:'condensed',score_font:'condensed',player_font:'sans',badge_font:'script',margin_font:'condensed'};
 const badges=[{label:'WON',x:.4,y:.3,width:.17,height:.06},{label:'LOST',x:.4,y:.8,width:.17,height:.06}];
 for(const example_setup of [undefined,true]){
  const body={...request(),match_reference:true,...(example_setup?{example_setup}:{}),current:visualSettings(awardLayout('results',{font:'classic'}))};
  const good=setup({output:{changes,badges,artwork_brief:null}}),result=await refineAward(body,good.options);
  assert.equal(result.status,200);assert.deepEqual(result.body.badges,badges);assert.equal(result.body.reference_lettering,true);
  const fields=good.calls.find(c=>c.url.includes('openai')).body.text.format.schema.properties.changes.properties;
  for(const role of ['title','week','grade','score','player','badge','margin']){assert.equal(fields[role+'_font'].type,'string');assert.ok(!fields[role+'_font'].enum.includes('inherit'));}
  const next=refinedAwardLayout(awardLayout('results',{example_path:example}),result.body,'results');assert.equal(next.badge_cutout,true);assert.deepEqual(next.badge_crops,badges);
  for(const value of [null,'inherit',undefined]){const bad=setup({output:{changes:{...changes,player_font:value},badges}});assert.equal((await refineAward(body,bad.options)).status,502);}
 }
 const partial=setup({output:{changes,badges:badges.slice(0,1)}}),result=await refineAward({...request(),match_reference:true},partial.options);
 assert.equal(result.status,200);assert.deepEqual(result.body.badges,[]);assert.equal(result.body.reference_lettering,undefined);
 const legacy=request();delete legacy.current.title_font;const denied=setup();assert.equal((await refineAward({...legacy,match_reference:true},denied.options)).status,400);assert.equal(denied.calls.length,0,'Unsupported clients are rejected before spending an allowance');
});

test('reference measurements are bounded presentation geometry and old clients retain their existing schema',async()=>{
 const changes={title_font:'condensed',week_font:'sans',grade_font:'condensed',score_font:'condensed',player_font:'sans',badge_font:'script',margin_font:'condensed'},reference_geometry={title_top:.02,title_width:.42,title_height:.1,player_height:.018,player_align:'center',left_column_end:.34};
 const body={...request(),match_reference:true,reference_geometry:true},good=setup({output:{changes,reference_geometry,badges:[]}}),result=await refineAward(body,good.options);
 assert.equal(result.status,200);assert.deepEqual(result.body.reference_geometry,reference_geometry);assert.deepEqual(result.body.reference_size,{width:1,height:1});
 const provider=good.calls.find(c=>c.url.includes('openai'));assert.ok(provider.body.text.format.schema.required.includes('reference_geometry'));assert.match(provider.body.instructions,/MEASURE THE REFERENCE/);
 for(const measured of [{...reference_geometry,title_height:5},{...reference_geometry,result:'won'},{...reference_geometry,player_name:'Someone'}]){const bad=setup({output:{changes,reference_geometry:measured}});assert.equal((await refineAward(body,bad.options)).status,502);}
 const old=request();for(const key of ['player_align','left_column_end','right_column_start'])delete old.current[key];
 const legacy=setup();assert.equal((await refineAward(old,legacy.options)).status,200);assert.equal(legacy.calls.find(c=>c.url.includes('openai')).body.text.format.schema.properties.changes.properties.player_align,undefined);
 const denied=setup();assert.equal((await refineAward({...old,match_reference:true,reference_geometry:true},denied.options)).status,400);assert.equal(denied.calls.length,0);
 const unsupported=setup({output:{changes:{player_align:'center'}}});assert.equal((await refineAward(old,unsupported.options)).status,502);
});
