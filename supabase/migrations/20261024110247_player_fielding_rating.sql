-- A selector's fielding assessment, separate from calculated performance.
alter table club_selection_private.roster
 add column fielding text not null default 'unknown'
 constraint roster_fielding_rating check (fielding in ('unknown','needs_work','reliable','strong'));

-- Extend the existing revision-checked, idempotent roster save in place.
-- Missing fields from old clients and registration imports preserve the rating.
do $migration$
declare definition text; anchor text := '    if row ? ''account_email'' then';
begin
 select pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure) into definition;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
  raise exception 'Fielding migration: roster save anchor changed';
 end if;
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
 -- Captains receive the same profile field alongside the existing role fields.
 if position('''bowling_load'',p.bowling_load,''keeper'',p.keeper)' in definition)=0 then
  raise exception 'Fielding migration: profile context anchor changed';
 end if;
 definition := replace(definition,'''bowling_load'',p.bowling_load,''keeper'',p.keeper)',
  '''bowling_load'',p.bowling_load,''keeper'',p.keeper,''fielding'',p.fielding)');
 execute definition;
end;
$migration$;
