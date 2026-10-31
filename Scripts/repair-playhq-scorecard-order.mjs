// Offline repair of already-saved snapshots using their exact saved source IDs.
// No provider calls, name matching, score changes or automatic database writes.
import {sourceId,scorecardOrder} from '../Functions/playhq-sync/shared-scorecard.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export async function repairScorecardOrder(card,summary){
 if(card.provider!=='playhq_au'||summary.source!=='playhq'||card.upstream_match_id!==summary.source_match_id||card.upstream_grade_id!==summary.source_grade_id||card.match_id!==await sourceId('match',summary.source_match_id))throw Error('Scorecard source does not match');
 const result=structuredClone(card),periods=new Map(summary.periods.map(p=>[p.source_period_id,p]));
 for(const innings of result.innings){
  const period=periods.get(innings.source_period_id);
  if(!period||innings.id!==await sourceId('innings',summary.source_match_id,period.source_period_id))throw Error('Innings source does not match');
  for(const [key,discipline] of [['batters','BATTING'],['bowlers','BOWLING']]){
   const source=period.teams.filter(t=>t.discipline===discipline);
   if(source.length!==1){if(!innings[key]?.length)continue;throw Error('Discipline source is ambiguous');}
   const sourceTeam=await sourceId('team',summary.source_match_id,source[0].team_id);
   if((discipline==='BATTING')!==(sourceTeam===innings.team_id))throw Error('Innings team does not match');
   const positions=new Map();
   for(const player of source[0].players){
    const id=await sourceId('appearance',summary.source_match_id,player.source_appearance_id);
    if(positions.has(id))throw Error('Duplicate source appearance');
    positions.set(id,player.position);
   }
   // A withheld/unmatched identity cannot be reordered safely; keep that whole
   // discipline unchanged rather than move it around identified players.
   if((innings[key]||[]).some(p=>!p.player_id||!positions.has(p.player_id)))continue;
   innings[key]=scorecardOrder((innings[key]||[]).map(row=>({row,position:positions.get(row.player_id)}))).map(p=>p.row);
  }
 }
 return result;
}

export async function repairSQL(rows){
 const statements=[],changed=[];
 const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 for(const row of rows){
  const next=await repairScorecardOrder(row.scorecard,row.summary);
  if(JSON.stringify(next)===JSON.stringify(row.scorecard))continue;
  if(!uuid.test(row.id)||!uuid.test(row.club_id)||!uuid.test(row.source_match_id)||!/^[0-9a-f]{32}$/.test(row.original_hash))throw Error('Invalid snapshot identity');
  const value=Buffer.from(JSON.stringify(next)).toString('base64');
  statements.push(`update public.match_review_scorecards s set scorecard=convert_from(decode('${value}','base64'),'UTF8')::jsonb where s.id='${row.id}' and s.club_id='${row.club_id}' and s.source_match_id='${row.source_match_id}' and md5(s.scorecard::text)='${row.original_hash}' and not exists(select 1 from public.match_review_scorecards newer where newer.club_id=s.club_id and newer.source_match_id=s.source_match_id and (newer.created_at,newer.id)>(s.created_at,s.id));\nget diagnostics affected=row_count; if affected<>1 then raise exception 'Snapshot changed; reload before repairing order'; end if;`);
  changed.push(row.id);
 }
 return {changed,sql:`begin;\n-- Reorder only. All identities, figures, metadata and timestamps are retained.\nDO $repair$\ndeclare affected integer;\nbegin\n${statements.join('\n')}\nend $repair$;\ncommit;\n`};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node Scripts/repair-playhq-scorecard-order.mjs snapshots.json repair.sql');
 const result=await repairSQL(JSON.parse(await readFile(input,'utf8')));
 await writeFile(output,result.sql);console.log(`Prepared ${result.changed.length} snapshot order repairs; database unchanged.`);
}
