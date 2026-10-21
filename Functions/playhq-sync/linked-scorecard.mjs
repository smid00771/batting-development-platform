import {sharedScorecard} from './shared-scorecard.mjs';
import {normalizeScorecard,readLimitedJson} from '../playcricket-scorecard/scorecard.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Refresh only the source already confirmed for this fixture. Provider identities
// are unrelated: a matching name, grade or date never substitutes for that link.
export async function linkedScorecard(body,context,request=fetch){
 const summary=await sharedScorecard(body,context);
 const canonical=context.canonical_match;
 if(!summary||!canonical)return summary;
 if(canonical.provider!=='playcricket_au'||!uuid.test(canonical.match_id)||!uuid.test(canonical.team_id))throw Error('Check the saved scorecard link');
 const response=await request('https://grassrootsapiproxy.cricket.com.au/scores/matches/'+canonical.match_id+'?responseModifier=includeScorecard&jsconfig=eccn%3Atrue',{
  redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
 const card=normalizeScorecard(await readLimitedJson(response),canonical.match_id);
 if(JSON.stringify(card.dates)!==JSON.stringify(summary.dates)||card.format_key!==summary.format_key||!card.teams.some(t=>t.id===canonical.team_id))throw Error('Review the changed scorecard details');
 return {...card,our_team_id:canonical.team_id,upstream_match_id:summary.upstream_match_id,upstream_grade_id:summary.upstream_grade_id,upstream_team_id:summary.upstream_team_id};
}
