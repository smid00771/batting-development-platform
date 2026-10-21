-- Populated line-ups expose the correlated scope lookup that empty-fixture tests missed.
-- This transaction uses synthetic data only and must always be rolled back.
begin;
set local statement_timeout='15s';
do $tests$
declare
 c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();
 grades uuid[]:='{}';players uuid[]:='{}';groups uuid[]:='{}';
 record_id uuid;gid uuid;d jsonb;slots jsonb;ctx jsonb;rows jsonb;timings jsonb:='{}';
 g integer;i integer;w integer;source_grade integer;configured integer;
 started timestamptz;elapsed_ms numeric;day date:='2099-10-03';
begin
 insert into auth.users(id,email) values(u,'group-performance-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic selector');
 insert into public.clubs(id,name,slug,created_by) values(c,'Group performance test','group-performance-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement)
  values(c,u,'admin','admin','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id)
  values(c,'standalone','active',u);
 for g in 1..6 loop
  gid:=gen_random_uuid();grades:=array_append(grades,gid);
  insert into public.playing_groups(id,club_id,name) values(gid,c,'Grade '||g);
  for i in 1..11 loop
   record_id:=gen_random_uuid();players:=array_append(players,record_id);
   insert into club_selection_private.roster(id,club_id,name) values(record_id,c,'Player '||g||'-'||i);
   insert into club_selection_private.availability(roster_id,available_dates)
    values(record_id,(select jsonb_agg((day+7*n)::text) from generate_series(0,3) n));
  end loop;
 end loop;
 -- Six grades over four rounds, each with eleven slots. The first player swaps
 -- between adjacent grades each week; the final round omits one player per grade.
 for w in 0..3 loop
  for g in 1..6 loop
   slots:='[]';
   for i in 1..11 loop
    source_grade:=case when i=1 and w%2=1 then case when g%2=1 then g+1 else g-1 end else g end;
    slots:=slots||jsonb_build_array(jsonb_build_object('d1',case when w=3 and i=11 then null else players[(source_grade-1)*11+i] end,'d2',null));
   end loop;
   d:=jsonb_build_object('grade','Grade '||g,'grade_group_id',grades[g],
    'competition','Test competition','season','2099/2100','format','limited_overs',
    'opposition','Test visitors','ground','Test oval','meeting','','staff','[]'::jsonb,
    'brackets',false,'min_quicks',0,'min_batters',0,
    'days',jsonb_build_array(jsonb_build_object('date',(day+7*w)::text)));
   -- Exercise legacy name resolution as well as explicit grade IDs.
   if w<2 and g in (1,4) then d:=d-'grade_group_id';end if;
   record_id:=gen_random_uuid();
   insert into club_selection_private.fixtures(id,club_id,details,slots) values(record_id,c,d,slots);
   if w<3 then
    update club_selection_private.fixtures f set published=club_selection_private.draft_snapshot(f.id),publication=1 where f.id=record_id;
   end if;
  end loop;
 end loop;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 for configured in 0..1 loop
  if configured=1 then
   for g in 1..3 loop
    gid:=gen_random_uuid();groups:=array_append(groups,gid);
    insert into club_selection_private.selection_groups(id,club_id,name) values(gid,c,'Selection group '||g);
    insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id)
     values(c,grades[2*g-1],gid),(c,grades[2*g],gid);
   end loop;
  end if;
  started:=clock_timestamp();
  select jsonb_agg(to_jsonb(m)) into rows from club_selection_private.selection_followups(c) m;
  elapsed_ms:=extract(epoch from clock_timestamp()-started)*1000;
  assert elapsed_ms<4000,'Populated follow-ups must complete well inside the 8-second RPC limit';
  assert (select count(*)=9 from jsonb_array_elements(rows) x where x->>'kind'='lower_grade'),'One drop per grade pair in each later round';
  assert (select count(*)=6 from jsonb_array_elements(rows) x where x->>'kind'='left_out'),'Each omitted player appears once';
  assert not exists(select 1 from jsonb_array_elements(rows) x where x->>'availability'<>'available'),'Saved availability retained';
  timings:=timings||jsonb_build_object(case when configured=0 then 'unconfigured_followups_ms' else 'configured_followups_ms' end,round(elapsed_ms));
  started:=clock_timestamp();ctx:=public.club_selections_api(c,'context');
  elapsed_ms:=extract(epoch from clock_timestamp()-started)*1000;
  assert elapsed_ms<5000,'Full Selections context must complete inside the RPC limit';
  assert jsonb_array_length(ctx->'fixtures')=24,'All fixtures remain in context';
  assert jsonb_array_length(ctx->'conversations')=15,'All player follow-ups remain in context';
  assert jsonb_array_length(ctx#>'{selection_setup,selection_groups}')=3*configured,'Setup state is preserved';
  if configured=1 then
   assert not exists(select 1 from jsonb_array_elements(ctx->'fixtures') x where nullif(x->>'selection_group_id','') is null),'Explicit and legacy grade matches both receive groups';
  end if;
  timings:=timings||jsonb_build_object(case when configured=0 then 'unconfigured_context_ms' else 'configured_context_ms' end,round(elapsed_ms));
 end loop;
 perform set_config('test.selection_group_performance',timings::text,true);
end $tests$;
select 'Selection Group performance and populated follow-up checks passed' result,
 current_setting('test.selection_group_performance')::jsonb timings;
rollback;
