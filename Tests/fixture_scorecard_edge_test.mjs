import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../Functions/playcricket-scorecard/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/,''));
const club='11111111-1111-4111-8111-111111111111',fixture='22222222-2222-4222-8222-222222222222';
async function run(body,allowed=true){
 let serve;const calls=[],card={provider:'playcricket_au',match_id:'match',status:'completed',innings:[]};
 const context={Request,Response,AbortSignal,Set,JSON,Error,matchIdFromUrl:()=> 'match',normalizeScorecard:()=>card,readLimitedJson:r=>r.json(),scorecardLogos:()=>[],Deno:{serve:fn=>{serve=fn;},env:{get:k=>k==='SUPABASE_URL'?'https://project.example':'synthetic-test-key'}},fetch:async(url,options)=>{calls.push({url,body:options.body&&JSON.parse(options.body)});if(url.endsWith('/auth/v1/user'))return Response.json({id:'user'});if(url.includes('/scores/matches/'))return Response.json({});if(url.endsWith('/stage_match_review_scorecard'))return Response.json({id:'snapshot'});return Response.json({allowed},{status:allowed?200:403});}};
 vm.createContext(context);vm.runInContext(source,context);const response=await serve(new Request('https://project.example/function',{method:'POST',headers:{authorization:'Bearer synthetic-user-token','content-type':'application/json',origin:'https://clubbatting.com'},body:JSON.stringify({club_id:club,url:'https://play.cricket.com.au/match/example',...body})}));return {response,calls};
}
test('fixture imports authorize the exact fixture before contacting PlayCricket',async()=>{
 const h=await run({purpose:'fixture_result',fixture_id:fixture});assert.equal(h.response.status,200);assert.deepEqual(h.calls[1].body,{p_club_id:club,p_action:'fixture_access',p_data:{fixture_id:fixture}});assert.match(h.calls[1].url,/club_match_results_api$/);assert.equal(h.calls[2].url.includes('/scores/matches/'),true);assert.equal((await h.response.json()).snapshot_id,'snapshot');
});
test('denied or missing fixture access never fetches or stores a scorecard',async()=>{
 const denied=await run({purpose:'fixture_result',fixture_id:fixture},false);assert.equal(denied.response.status,403);assert.equal(denied.calls.length,2);
 const missing=await run({purpose:'fixture_result'});assert.equal(missing.response.status,400);assert.equal(missing.calls.length,1);
});
test('existing Match Review and awards imports keep their own access checks',async()=>{
 const review=await run({});assert.match(review.calls[1].url,/get_team_review_roster$/);
 const awards=await run({purpose:'team_of_week'});assert.match(awards.calls[1].url,/team_of_week_api$/);assert.equal(awards.calls[1].body.p_action,'access');
});
