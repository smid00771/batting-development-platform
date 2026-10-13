-- Available bowling figures may be selected even when a spell took zero wickets.
CREATE OR REPLACE FUNCTION club_selection_private.team_week_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();cards jsonb;cfg club_selection_private.team_week_design%rowtype;
 e club_selection_private.team_week_editions%rowtype;last_day date;first_day date;sid uuid;card jsonb;
 candidates jsonb;chosen jsonb:='[]';row_input jsonb;candidate jsonb;used text[]:='{}';layout jsonb;path text;
begin
 if me is null or not club_selection_private.social_allowed(c) or not club_batting_private.team_review_staff(c) then raise exception 'Club socials and Match Review access are required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>40000 then raise exception 'Invalid Team of the Week request';end if;
 if p_action='access' then return jsonb_build_object('allowed',true);end if;
 if p_action in ('context','reserve_image') then
  last_day:=(p_data->>'week_end')::date;if last_day is null then raise exception 'Choose the week ending date';end if;first_day:=last_day-6;
 end if;
 if p_action='context' then
  cards:=club_selection_private.team_week_cards(c,first_day,last_day);
  select * into cfg from club_selection_private.team_week_design where club_id=c;
  return jsonb_build_object('cards',cards,'candidates',club_selection_private.team_week_candidates(cards),
   'design',jsonb_build_object('background_path',cfg.background_path,'layout',coalesce(cfg.layout,'{}'),'revision',coalesce(cfg.revision,0)),
   'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.week_end desc,h.created_at desc) from
    (select id,week_end,title,rows,image_path,created_at,request->>'blurb' blurb from club_selection_private.team_week_editions where club_id=c and sealed_at is not null order by week_end desc,created_at desc limit 100) h),'[]'));
 end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,16100));
 if p_action='use_team' then
  select scorecard into card from public.match_review_scorecards where id=(p_data->>'snapshot_id')::uuid and club_id=c;
  if card is null or not exists(select 1 from jsonb_array_elements(card->'teams') t where t->>'id'=p_data->>'team_id') then raise exception 'Choose a team from this club’s imported scorecard';end if;
  insert into club_selection_private.team_week_sources values(c,(card->>'match_id')::uuid,(p_data->>'team_id')::uuid,me)
   on conflict(club_id,source_match_id) do update set team_id=excluded.team_id,updated_by=me;
  return jsonb_build_object('saved',true);
 elsif p_action='save_design' then
  select * into cfg from club_selection_private.team_week_design where club_id=c;
  if coalesce(cfg.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'The background settings changed. Reload before saving';end if;
  path:=nullif(p_data->>'background_path','');layout:=p_data->'layout';
  if path is not null and (path !~ ('^'||c::text||'/backgrounds/[0-9a-f-]{36}\.png$') or not exists(select 1 from storage.objects where bucket_id='club-team-week' and name=path)) then raise exception 'Upload the background before saving';end if;
  if jsonb_typeof(layout) is distinct from 'object' or jsonb_typeof(layout->'includes_title') is distinct from 'boolean'
   or coalesce(layout->>'top','')!~'^[0-9]{1,4}$' or (layout->>'top')::integer not between 50 and 1200
   or coalesce(layout->>'bottom','')!~'^[0-9]{1,4}$' or (layout->>'bottom')::integer not between 150 and 1320 or (layout->>'bottom')::integer-(layout->>'top')::integer<100 then raise exception 'Check the artwork layout';end if;

  if coalesce(layout->>'font_scale','100')!~'^[0-9]{2,3}$' or coalesce((layout->>'font_scale')::integer,100) not between 75 and 120
   or coalesce(layout->>'logo_scale','100')!~'^[0-9]{2,3}$' or coalesce((layout->>'logo_scale')::integer,100) not between 70 and 150
   or coalesce(layout->>'text_colour','#FFFFFF')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Check text and logo sizing';end if;
  for candidate in select * from jsonb_array_elements(jsonb_build_array(layout->'example_path',layout->'logo_path')) loop
   if candidate#>>'{}' is not null and ((candidate#>>'{}') !~ ('^'||c::text||'/backgrounds/[0-9a-f-]{36}\.png$')
    or not exists(select 1 from storage.objects where bucket_id='club-team-week' and name=candidate#>>'{}')) then raise exception 'Upload artwork from this club before saving';end if;
  end loop;

  for candidate in select * from jsonb_array_elements('[ ["title_y",0,1300],["title_size",40,160],["week_y",0,1320],["left",20,160],["figures_right",650,910],["grade_right",950,1060],["logo_x",0,100],["logo_y",0,100],["logo_width",3,60] ]') loop
   if layout ? (candidate->>0) and (jsonb_typeof(layout->(candidate->>0)) is distinct from 'number' or layout->>(candidate->>0)!~'^[0-9]{1,4}$' or (layout->>(candidate->>0))::int not between (candidate->>1)::int and (candidate->>2)::int) then raise exception 'Check overlay positions';end if;
  end loop;
  if layout ? 'show_logo' and jsonb_typeof(layout->'show_logo') is distinct from 'boolean' then raise exception 'Choose whether to add a logo';end if;
  if layout ? 'reference' then
   if jsonb_typeof(layout->'reference') is distinct from 'object' or jsonb_typeof(layout#>'{reference,names}') is distinct from 'array' or jsonb_array_length(layout#>'{reference,names}')>20
    or (layout#>>'{reference,week_end}' is not null and layout#>>'{reference,week_end}'!~'^\d{4}-\d{2}-\d{2}$') then raise exception 'Check example names and week';end if;
   for candidate in select * from jsonb_array_elements(layout#>'{reference,names}') loop
    if jsonb_typeof(candidate) is distinct from 'object' or jsonb_typeof(candidate->'name') is distinct from 'string' or length(btrim(candidate->>'name')) not between 1 and 80 or length(coalesce(candidate->>'grade',''))>80 or length(coalesce(candidate->>'figures',''))>100 then raise exception 'Use short player names and grades';end if;
   end loop;
  end if;
  insert into club_selection_private.team_week_design values(c,path,layout,1)
   on conflict(club_id) do update set background_path=excluded.background_path,layout=excluded.layout,revision=club_selection_private.team_week_design.revision+1;
  return jsonb_build_object('saved',true);
 elsif p_action='reserve_image' then
  sid:=(p_data->>'id')::uuid;if sid is null then raise exception 'Image identity required';end if;
  select * into e from club_selection_private.team_week_editions where id=sid;
  if found then
   if e.club_id<>c or e.created_by<>me or e.request<>p_data then raise exception 'This image identity was already used';end if;
   return jsonb_build_object('id',e.id,'path',e.image_path,'sealed',e.sealed_at is not null);
  end if;
  if length(coalesce(p_data->>'blurb',''))>2000 or length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>60 or jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')<>11
   or coalesce(p_data->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(p_data->>'bytes','')!~'^[0-9]{1,8}$' or (p_data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Choose 11 players and check the graphic';end if;
  candidates:=club_selection_private.team_week_candidates(club_selection_private.team_week_cards(c,first_day,last_day));
  for row_input in select * from jsonb_array_elements(p_data->'rows') loop
   select x into candidate from jsonb_array_elements(candidates) x where x->>'key'=row_input->>'key';
   if candidate is null or candidate->>'player_id'=any(used) or coalesce(row_input->>'display','') not in ('batting','bowling','both') then raise exception 'Scores changed or a player is duplicated. Reload scores and review the XI';end if;
   if (row_input->>'display' in ('batting','both') and jsonb_array_length(candidate->'batting')=0) or (row_input->>'display' in ('bowling','both') and jsonb_array_length(candidate->'bowling')=0) then raise exception 'Choose available batting or bowling figures';end if;
   used:=array_append(used,candidate->>'player_id');chosen:=chosen||jsonb_build_array(candidate||jsonb_build_object('display',row_input->>'display'));
  end loop;
  path:=c::text||'/editions/'||sid::text||'.png';
  insert into club_selection_private.team_week_editions(id,club_id,week_end,title,rows,image_path,image_sha,image_bytes,request,created_by)
   values(sid,c,last_day,p_data->>'title',chosen,path,p_data->>'sha256',(p_data->>'bytes')::integer,p_data,me);
  return jsonb_build_object('id',sid,'path',path,'sealed',false);
 elsif p_action='finish_image' then
  select * into e from club_selection_private.team_week_editions where club_id=c and id=(p_data->>'id')::uuid and created_by=me for update;
  if e.id is null then raise exception 'Saved image not found';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-team-week' and name=e.image_path and (metadata->>'size')::bigint=e.image_bytes) then raise exception 'Image upload is not confirmed. Retry saving';end if;
  update club_selection_private.team_week_editions set sealed_at=coalesce(sealed_at,now()) where id=e.id;
  return jsonb_build_object('saved',true,'path',e.image_path);
 end if;
 raise exception 'Unknown Team of the Week action';
end $function$;
