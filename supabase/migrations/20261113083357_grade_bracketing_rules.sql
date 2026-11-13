-- Grade defaults for long-form bracketing, with date-bound rep exceptions per slot.
-- No club or player identifiers belong in this migration.
create or replace function club_selection_private.fixture_apply_default_brackets(d jsonb, rows jsonb)
returns jsonb language plpgsql immutable set search_path='' as $fn$
declare rule text;
begin
 if d->>'format'<>'long_form' or d->>'bracket_source'='fixture' then return d;end if;
 select r->>'bracket_rule' into rule from jsonb_array_elements(coalesce(rows,'[]')) r
 where r->>'format'='long_form' and (case when nullif(d->>'grade_group_id','') is not null
 then r->>'grade_group_id'=d->>'grade_group_id' or nullif(r->>'grade_group_id','') is null and lower(r->>'grade')=lower(d->>'grade')
 else lower(r->>'grade')=lower(d->>'grade') end) limit 1;
 if rule is null then return d-'bracket_source';end if;
 if rule not in ('none','general','representative') then raise exception 'Choose a valid grade bracketing rule';end if;
 return (d-'bracket_basis')||jsonb_build_object('brackets',rule<>'none','bracket_source','default')
  ||case when rule='representative' then jsonb_build_object('bracket_basis',rule) else '{}'::jsonb end;
end $fn$;

create or replace function club_selection_private.rep_bracket_valid(d jsonb,s jsonb)
returns boolean language sql immutable set search_path='' as $fn$
 select coalesce(d->>'format'='long_form' and jsonb_array_length(d->'days')=2 and (d->>'brackets')::boolean
 and (s->>'d1') is distinct from (s->>'d2') and nullif(s->>'rep_player_id','') is not null
 and ((s->>'rep_player_id'=s->>'d1' and s->>'rep_absent_date'=d->'days'->1->>'date')
   or (s->>'rep_player_id'=s->>'d2' and s->>'rep_absent_date'=d->'days'->0->>'date')),false);
$fn$;

create or replace function club_selection_private.sync_default_fixture_brackets(c uuid, rows jsonb, actor uuid)
returns void language plpgsql set search_path='' as $fn$
declare zone text;
begin
 select timezone into zone from club_selection_private.access where club_id=c;
 -- Published snapshots, locks and selections are never rewritten by grade setup.
 update club_selection_private.fixtures f set details=club_selection_private.fixture_apply_default_brackets(f.details,rows),
 revision=f.revision+1,updated_by=actor,updated_at=now()
 where f.club_id=c and f.published is null and f.details->>'format'='long_form'
 and f.details->'days'->0->>'date'>=(now() at time zone coalesce(zone,'Australia/Sydney'))::date::text
 and f.details is distinct from club_selection_private.fixture_apply_default_brackets(f.details,rows);
end $fn$;

revoke all on function club_selection_private.fixture_apply_default_brackets(jsonb,jsonb) from public,anon,authenticated;
revoke all on function club_selection_private.rep_bracket_valid(jsonb,jsonb) from public,anon,authenticated;
revoke all on function club_selection_private.sync_default_fixture_brackets(uuid,jsonb,uuid) from public,anon,authenticated;

-- Preserve the existing authorised API, retry receipts, permissions and save checks.
do $patch$
declare src text;before text;after text;
begin
 select pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure) into src;
 before:=$old$notes:=notes||jsonb_build_array(jsonb_build_object('grade',v,'grade_group_id',uid,'format',x->>'format','overs',nullif(x->>'overs','')::int));$old$;
 after:=$new$if x ? 'bracket_rule' and (x->>'format'<>'long_form' or coalesce(x->>'bracket_rule','') not in ('none','general','representative')) then raise exception 'Choose a long-form grade bracketing rule';end if;
    notes:=notes||jsonb_build_array(jsonb_build_object('grade',v,'grade_group_id',uid,'format',x->>'format','overs',nullif(x->>'overs','')::int)||case when x ? 'bracket_rule' then jsonb_build_object('bracket_rule',x->>'bracket_rule') else '{}'::jsonb end);$new$;
 if strpos(src,before)=0 then raise exception 'Grade default save patch not found';end if;src:=replace(src,before,after);
 before:='perform club_selection_private.sync_default_fixture_overs(c,acc.fixture_defaults->''rows'',notes,me);';
 if strpos(src,before)=0 then raise exception 'Grade default sync patch not found';end if;
 src:=replace(src,before,before||E'\n   perform club_selection_private.sync_default_fixture_brackets(c,notes,me);');
 before:='if jsonb_typeof(s) is distinct from ''object'' then raise exception ''Invalid selection slot'';end if;';
 if strpos(src,before)=0 then raise exception 'Slot validation patch not found';end if;
 src:=replace(src,before,before||E'\n     if (s ? ''rep_player_id'' or s ? ''rep_absent_date'') and not club_selection_private.rep_bracket_valid(row->''details'',s) then raise exception ''Choose the bracketed player away on rep for this fixture date'';end if;');
 execute src;

 select pg_get_functiondef('club_selection_private.validate_details(jsonb)'::regprocedure) into src;
 before:='begin';
 src:=replace(src,before,before||E'\n if d->>''bracket_source'' is not null and d->>''bracket_source'' not in (''default'',''fixture'') then raise exception ''Choose grade-default bracketing or a fixture override'';end if;');execute src;

 select pg_get_functiondef('club_selection_private.fixture_overs_from_settings()'::regprocedure) into src;
 before:='new.details:=club_selection_private.fixture_apply_default_overs(new.details,rows);';
 if strpos(src,before)=0 then raise exception 'Fixture default trigger patch not found';end if;
 src:=replace(src,before,before||E'\n  if new.published is null then new.details:=club_selection_private.fixture_apply_default_brackets(new.details,rows);end if;');
 before:='return new;';
 src:=replace(src,before,$new$-- Source date corrections must not reuse an old representative-duty absence.
 if tg_op='UPDATE' and (select jsonb_agg(x->>'date') from jsonb_array_elements(old.details->'days') x)
 is distinct from (select jsonb_agg(x->>'date') from jsonb_array_elements(new.details->'days') x) then
  select jsonb_agg(s-'rep_player_id'-'rep_absent_date' order by n) into new.slots from jsonb_array_elements(new.slots) with ordinality a(s,n);
 end if;
 return new;$new$);execute src;

 select pg_get_functiondef('club_selection_private.issues(uuid)'::regprocedure) into src;
 before:='normal_limit:=club_selection_private.normal_player_limit(m.club_id,m.details);';
 if strpos(src,before)=0 then raise exception 'Publication validation patch not found';end if;
 src:=replace(src,before,before||$new$
 if jsonb_array_length(m.details->'days')=2 then
  for s,n in select slot,position::int from jsonb_array_elements(m.slots) with ordinality a(slot,position)
   where (slot->>'d1') is distinct from (slot->>'d2') loop
   if not coalesce((m.details->>'brackets')::boolean,false) or m.details->>'format'<>'long_form' then
    notes:=notes||jsonb_build_array(jsonb_build_object('level','error','code','bracket_not_permitted','text','Slot '||n||': this grade needs the same player on both days'));
   elsif m.details->>'bracket_basis'='representative' and not club_selection_private.rep_bracket_valid(m.details,s) then
    notes:=notes||jsonb_build_array(jsonb_build_object('level','error','code','rep_bracket_required','text','Slot '||n||': choose the player away on rep in the player picker, or use the same player on both days'));
   end if;
  end loop;
 end if;
$new$);execute src;
end $patch$;
