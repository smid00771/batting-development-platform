-- Read-only guard: optional context work is paused without bypassing writes.
do $checks$
declare definition text:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
begin
 assert position('perform club_selection_private.sync_players(c,' in definition)=0,'Access/context must not take the player-sync lock';
 assert position('if p_action=''context'' and (adm or sel) then perform club_selection_private.sync_republication_alerts(c)' in definition)=0,'No full-club alert scan on context reads';
 assert position('''conversations'',''[]''::jsonb' in definition)>0,'Automatic comparison output is paused';
 assert position('''issues'',''[]''::jsonb' in definition)>0,'Do not recalculate warnings for every fixture on every read';
 assert (length(definition)-length(replace(definition,'notes:=club_selection_private.issues(fid);','')))/length('notes:=club_selection_private.issues(fid);')=2,'Captain review and publication must still validate the team';
 assert position('if me is null then raise exception ''Sign in to use Selections''' in definition)>0,'Authentication remains required';
 assert position('A team changed in another session' in definition)>0,'Stale save protection remains';
 assert position('Mark availability before selecting' in definition)>0,'Save checks availability';
end $checks$;
select 'Background work paused; authentication, availability, stale-save, review and publication checks retained' as verification;
