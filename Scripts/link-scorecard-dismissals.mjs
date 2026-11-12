export {linkScorecardDismissals} from '../Functions/playhq-sync/dismissal-links.mjs';

export function dismissalLinkSQL(row,next){
 const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 if(![row.id,row.club_id,row.source_match_id].every(x=>uuid.test(x))||!/^[0-9a-f]{32}$/.test(row.original_hash))throw Error('Invalid snapshot guard');
 const data=Buffer.from(JSON.stringify(next)).toString('base64');
 return `begin;\nDO $links$\ndeclare affected integer;\nbegin\nupdate public.match_review_scorecards s set scorecard=convert_from(decode('${data}','base64'),'UTF8')::jsonb where s.id='${row.id}' and s.club_id='${row.club_id}' and s.source_match_id='${row.source_match_id}' and md5(s.scorecard::text)='${row.original_hash}' and not exists(select 1 from public.match_review_scorecards newer where newer.club_id=s.club_id and newer.source_match_id=s.source_match_id and (newer.created_at,newer.id)>(s.created_at,s.id));\nget diagnostics affected=row_count; if affected<>1 then raise exception 'Snapshot changed; reload before linking dismissals'; end if;\nend $links$;\ncommit;`;
}
