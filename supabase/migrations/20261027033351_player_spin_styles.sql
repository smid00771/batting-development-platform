-- Selector-entered spin style. Batting role and bowling workload stay independent.
begin;
alter table club_selection_private.roster
 add column spin_style text not null default 'unknown'
 constraint roster_spin_style check (spin_style in ('unknown','off_spin','left_arm_orthodox','leg_spin','left_arm_wrist'));

-- Patch the current guarded API, preserving permission checks, request receipts,
-- roster revisions and unrelated changes. Imports and old clients preserve style.
do $migration$
declare definition text; anchor text := '    if row ? ''account_email'' then';
begin
 select pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure) into definition;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
  raise exception 'Spin style migration: roster save anchor changed';
 end if;
 definition := replace(definition,anchor,$patch$
    if p_action='save_roster' then
     if row ? 'spin_style' and (jsonb_typeof(row->'spin_style') is distinct from 'string'
      or row->>'spin_style' not in ('unknown','off_spin','left_arm_orthodox','leg_spin','left_arm_wrist')) then
      raise exception 'Choose a valid spin type';
     end if;
     update club_selection_private.roster set spin_style=case
      when bowling<>'spin' then 'unknown'
      when row ? 'spin_style' then row->>'spin_style'
      else spin_style end
      where id=pid and club_id=c;
    end if;
$patch$ || anchor);
 -- A later full API replacement omitted the existing fielding save extension.
 -- Restore it only when absent, without changing any stored selector ratings.
 if position('row ? ''fielding''' in definition)=0 then
  definition := replace(definition,anchor,$patch$
    if p_action='save_roster' and row ? 'fielding' then
     if jsonb_typeof(row->'fielding') is distinct from 'string'
      or row->>'fielding' not in ('unknown','needs_work','reliable','strong') then
      raise exception 'Choose a valid fielding rating';
     end if;
     update club_selection_private.roster set fielding=row->>'fielding',updated_at=now()
      where id=pid and club_id=c;
    end if;
$patch$ || anchor);
 end if;
 anchor := '''bowling_load'',p.bowling_load,''keeper'',p.keeper';
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
  raise exception 'Spin style migration: roster context anchor changed';
 end if;
 definition := replace(definition,anchor,'''bowling_load'',p.bowling_load,''spin_style'',p.spin_style,''keeper'',p.keeper');
 if position('''fielding'',p.fielding' in definition)=0 then
  definition := replace(definition,'''keeper'',p.keeper)', '''keeper'',p.keeper,''fielding'',p.fielding)');
 end if;
 execute definition;
end;
$migration$;

-- New snapshots carry the saved style. Existing publications are not rewritten.
do $migration$
declare definition text; signature text; anchor text := '''bowling_load'',p.bowling_load,''keeper'',p.keeper';
begin
 foreach signature in array array['club_selection_private.draft_snapshot(uuid)','club_selection_private.scorecard_team_api(uuid,text,jsonb)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
   raise exception 'Spin style migration: snapshot anchor changed in %',signature;
  end if;
  definition := replace(definition,anchor,'''bowling_load'',p.bowling_load,''spin_style'',p.spin_style,''keeper'',p.keeper');
  execute definition;
 end loop;
end;
$migration$;

-- Preserve style during an already-authorised, explicit identity consolidation.
-- An explicit style on the canonical entry takes priority; no identity is inferred.
do $migration$
declare definition text; anchor text := '  keeper=keeper or original.keeper,updated_at=now() where id=new_id;';
begin
 select pg_get_functiondef('club_batting_private.consolidate_scorecard_roster(uuid,uuid,uuid,text)'::regprocedure) into definition;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
  raise exception 'Spin style migration: consolidation anchor changed';
 end if;
 definition := replace(definition,anchor,$patch$
  spin_style=case when bowling='spin' or (bowling='unknown' and original.bowling='spin') then
   case when spin_style='unknown' and original.bowling='spin' then original.spin_style else spin_style end
   else 'unknown' end,
$patch$ || anchor);
 anchor := '''bowling_load'',r.bowling_load,''keeper'',r.keeper';
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
  raise exception 'Spin style migration: consolidation snapshot anchor changed';
 end if;
 definition := replace(definition,anchor,'''bowling_load'',r.bowling_load,''spin_style'',r.spin_style,''keeper'',r.keeper');
 execute definition;
end;
$migration$;
commit;
