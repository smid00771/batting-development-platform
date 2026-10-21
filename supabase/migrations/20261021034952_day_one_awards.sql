-- Day 1 awards are an explicit per-award choice, separate from completed-match season totals.
CREATE OR REPLACE FUNCTION club_selection_private.team_week_cards(c uuid, first_day date, last_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('snapshot_id',s.id,'scorecard',s.scorecard,'our_team',coalesce(t.team_id::text,confirmed.team_id,club_batting_private.scorecard_club_team(c,s.scorecard))) order by s.scorecard->>'grade',s.source_match_id),'[]')
 from (select distinct on(source_match_id) * from public.match_review_scorecards where club_id=c order by source_match_id,created_at desc,id desc) s
 left join club_selection_private.team_week_sources t on t.club_id=c and t.source_match_id=s.source_match_id
 left join lateral (
  select case when count(distinct i->>'team_id')=1 then min(i->>'team_id') end team_id
  from public.match_review_score_links l join public.match_review_scorecards original on original.id=l.snapshot_id and original.club_id=c
  cross join lateral jsonb_array_elements(original.scorecard->'innings') i
  where l.club_id=c and l.source_match_id=s.source_match_id and i->>'id'=l.source_innings_id::text
 ) confirmed on true
 where (select max(d) from jsonb_array_elements_text(s.scorecard->'dates') d) between first_day::text and last_day::text
 or (s.scorecard->>'status'='in_progress' and s.scorecard->>'format_key'='long_form' and jsonb_array_length(s.scorecard->'dates')=2 and s.scorecard#>>'{dates,0}' between first_day::text and last_day::text)
$function$;


create function club_selection_private.award_scorecards(c uuid,cards jsonb,include_provisional boolean default false) returns jsonb
language plpgsql stable set search_path='' as $$
declare wrapped jsonb;card jsonb;inning jsonb;person jsonb;out_cards jsonb:='[]';innings jsonb;batters jsonb;bowlers jsonb;eligible boolean;today date;tz text;
begin
 select coalesce(timezone,'Australia/Sydney') into tz from club_selection_private.access where club_id=c;
 today:=(now() at time zone coalesce(tz,'Australia/Sydney'))::date;
 for wrapped in select * from jsonb_array_elements(coalesce(cards,'[]')) loop
  card:=wrapped->'scorecard';
  eligible:=coalesce(card->>'status'='in_progress' and card->>'format_key'='long_form' and jsonb_array_length(card->'dates')=2
   and (card->'dates'->>0)::date<=today and ((card->'dates'->>0)::date<today or card->>'source_status'='STUMPS')
   and exists(select 1 from jsonb_array_elements(card->'innings') i where jsonb_array_length(coalesce(i->'batters','[]'))>0 or jsonb_array_length(coalesce(i->'bowlers','[]'))>0),false);
  if include_provisional and eligible then
   innings:='[]';
   for inning in select * from jsonb_array_elements(card->'innings') loop
    batters:='[]';bowlers:='[]';
    for person in select * from jsonb_array_elements(coalesce(inning->'batters','[]')) loop
     person:=person||jsonb_build_object('importable',coalesce(nullif(person->>'player_id','') is not null and nullif(person->>'name','') is not null and
      (person->>'status'='did_not_bat' or person->>'status'='played' and coalesce(person->>'runs','')~'^\d{1,4}$' and jsonb_typeof(person->'not_out')='boolean' and coalesce((person->>'figures_valid')::boolean,person->>'importable'='true' or lower(regexp_replace(coalesce(person->>'dismissal',''),'[^a-zA-Z]','','g')) in ('notout','retirednotout','retiredhurt','out','bowled','caught','caughtandbowled','lbw','runout','stumped','hitwicket','retiredout','obstructingthefield','timedout','hittheballtwice','handledtheball'))),false));
     batters:=batters||jsonb_build_array(person);
    end loop;
    for person in select * from jsonb_array_elements(coalesce(inning->'bowlers','[]')) loop
     person:=person||jsonb_build_object('importable',coalesce(nullif(person->>'player_id','') is not null and nullif(person->>'name','') is not null and coalesce(person->>'runs','')~'^\d{1,4}$' and coalesce(person->>'wickets','')~'^([0-9]|10)$',false));
     bowlers:=bowlers||jsonb_build_array(person);
    end loop;
    innings:=innings||jsonb_build_array(inning||jsonb_build_object('batters',batters,'bowlers',bowlers));
   end loop;
   card:=card||jsonb_build_object('innings',innings,'award_provisional',true);
  else card:=card-'award_provisional';end if;
  out_cards:=out_cards||jsonb_build_array(wrapped||jsonb_build_object('scorecard',card,'provisional_available',eligible));
 end loop;
 return out_cards;
end $$;
revoke all on function club_selection_private.award_scorecards(uuid,jsonb,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION club_selection_private.team_week_candidates(cards jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 with source as (
  select x->>'snapshot_id' snapshot_id,x->>'our_team' team_id,x->'scorecard' card from jsonb_array_elements(cards) x
  where x->>'our_team' is not null and (x->'scorecard'->>'status'='completed' or x#>>'{scorecard,award_provisional}'='true') and x->'scorecard'->>'schema_version'='2'
   and (x#>>'{scorecard,award_provisional}'='true' or not exists(select 1 from jsonb_array_elements(x->'scorecard'->'innings') i where i->>'complete' is distinct from 'true'))
 ), stats as (
  select s.*,b->>'player_id' player_id,b->>'name' name,'bat' kind,i->>'number' innings,b stat
  from source s cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(i->'batters') b
  where i->>'team_id'=s.team_id and b->>'importable'='true' and b->>'status'='played'
  union all
  select s.*,b->>'player_id',b->>'name','bowl',i->>'number',b
  from source s cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(coalesce(i->'bowlers','[]')) b
  where i->>'team_id'<>s.team_id and b->>'team_id'=s.team_id and b->>'importable'='true'
 ), players as (
  select bool_or(coalesce(card->>'award_provisional'='true',false)) provisional,snapshot_id,team_id,card->>'match_id' match_id,card->>'grade' grade,card->>'url' url,player_id,min(name) name,
   coalesce(jsonb_agg(stat order by innings::integer) filter(where kind='bat'),'[]') batting,
   coalesce(jsonb_agg(stat order by innings::integer) filter(where kind='bowl'),'[]') bowling,
   coalesce(sum((stat->>'runs')::integer) filter(where kind='bat'),0) runs,
   coalesce(sum((stat->>'wickets')::integer) filter(where kind='bowl'),0) wickets,
   coalesce(sum((stat->>'runs')::integer) filter(where kind='bowl'),0) conceded
  from stats group by snapshot_id,team_id,card->>'match_id',card->>'grade',card->>'url',player_id
 ) select coalesce(jsonb_agg((to_jsonb(p)-'provisional')||case when p.provisional then jsonb_build_object('provisional',true) else '{}'::jsonb end||jsonb_build_object('key',snapshot_id||':'||team_id||':'||player_id) order by grade,name,player_id),'[]') from players p where runs>0 or wickets>0 or jsonb_array_length(bowling)>0
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.player_week_performances(cards jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 with source as (
  select x->>'snapshot_id' snapshot_id,x->>'our_team' team_id,x->'scorecard' card from jsonb_array_elements(cards) x
  where x->>'our_team' is not null and (x->'scorecard'->>'status'='completed' or x#>>'{scorecard,award_provisional}'='true') and x->'scorecard'->>'schema_version'='2'
   and (x#>>'{scorecard,award_provisional}'='true' or not exists(select 1 from jsonb_array_elements(x->'scorecard'->'innings') i where i->>'complete' is distinct from 'true'))
 ), stats as (
  select s.*,b->>'player_id' player_id,b->>'name' name,'bat' kind,i->>'number' innings,b stat
  from source s cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(i->'batters') b
  where i->>'team_id'=s.team_id and b->>'importable'='true' and b->>'status'='played'
  union all
  select s.*,b->>'player_id',b->>'name','bowl',i->>'number',b
  from source s cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(coalesce(i->'bowlers','[]')) b
  where i->>'team_id'<>s.team_id and b->>'team_id'=s.team_id and b->>'importable'='true'
 ), players as (
  select bool_or(coalesce(card->>'award_provisional'='true',false)) provisional,snapshot_id,team_id,card->>'match_id' match_id,card->>'grade' grade,card->>'url' url,player_id,min(name) name,
   coalesce(jsonb_agg(stat order by innings::integer) filter(where kind='bat'),'[]') batting,
   coalesce(jsonb_agg(stat order by innings::integer) filter(where kind='bowl'),'[]') bowling,
   coalesce(sum((stat->>'runs')::integer) filter(where kind='bat'),0) runs,
   coalesce(sum((stat->>'wickets')::integer) filter(where kind='bowl'),0) wickets,
   coalesce(sum((stat->>'runs')::integer) filter(where kind='bowl'),0) conceded
  from stats group by snapshot_id,team_id,card->>'match_id',card->>'grade',card->>'url',player_id
 ) select coalesce(jsonb_agg((to_jsonb(p)-'provisional')||case when p.provisional then jsonb_build_object('provisional',true) else '{}'::jsonb end||jsonb_build_object('key',snapshot_id||':'||team_id||':'||player_id) order by grade,name,player_id),'[]') from players p where jsonb_array_length(batting)>0 or jsonb_array_length(bowling)>0
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_award_candidates(cards jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 with matches as (
  select x->>'snapshot_id' snapshot_id,x->>'our_team' our_team,x->'scorecard' card
  from jsonb_array_elements(cards) x where x->>'our_team' is not null and x#>>'{scorecard,schema_version}'='2'
   and (x#>>'{scorecard,status}'='completed' or x#>>'{scorecard,award_provisional}'='true')
   and (x#>>'{scorecard,award_provisional}'='true' or not exists(select 1 from jsonb_array_elements(x#>'{scorecard,innings}') i where i->>'complete' is distinct from 'true'))
 ), performances as (
  select m.*, 'century' kind,i->>'id' innings_id,i->>'number' innings_number,b stat
  from matches m cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(i->'batters') b
  where i->>'team_id'=our_team and b->>'importable'='true' and b->>'status'='played' and (b->>'runs')::integer>=100
  union all
  select m.*,'five_wickets',i->>'id',i->>'number',b
  from matches m cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(coalesce(i->'bowlers','[]')) b
  where i->>'team_id'<>our_team and b->>'team_id'=our_team and b->>'importable'='true' and (b->>'wickets')::integer>=5
 ), items as (
  select (case when card->>'award_provisional'='true' then jsonb_build_object('provisional',true) else '{}'::jsonb end)||jsonb_build_object('key',(card->>'match_id')||':results','kind','results','snapshot_id',snapshot_id,'match_id',card->>'match_id',
   'grade',card->>'grade','dates',card->'dates','result',card->>'result','our_team',our_team,'teams',card->'teams','innings',card->'innings') item from matches
  union all
  select (case when card->>'award_provisional'='true' then jsonb_build_object('provisional',true) else '{}'::jsonb end)||jsonb_build_object('key',(card->>'match_id')||':'||kind||':'||innings_id||':'||(stat->>'player_id'),'kind',kind,'snapshot_id',snapshot_id,
   'match_id',card->>'match_id','grade',card->>'grade','dates',card->'dates','player_id',stat->>'player_id','name',stat->>'name',
   'innings_id',innings_id,'innings_number',innings_number,'stat',stat,'opposition',(select t->>'name' from jsonb_array_elements(card->'teams') t where t->>'id'<>our_team limit 1)) from performances
 ) select coalesce(jsonb_agg(item||jsonb_build_object('signature',md5((item-'snapshot_id')::text)) order by item->>'grade',item->>'name',item->>'key'),'[]') from items
$function$;

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
 if me is null or not club_selection_private.social_allowed(c) then raise exception 'Club socials access is required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>40000 then raise exception 'Invalid Team of the Week request';end if;
 if p_action='access' then return jsonb_build_object('allowed',true);end if;
 if p_action in ('context','reserve_image') then
  last_day:=(p_data->>'week_end')::date;if last_day is null then raise exception 'Choose the week ending date';end if;first_day:=last_day-6;
 end if;
 if p_action='context' then
  cards:=club_selection_private.award_scorecards(c,club_selection_private.team_week_cards(c,first_day,last_day),coalesce((p_data->>'include_provisional')::boolean,false));
  select * into cfg from club_selection_private.team_week_design where club_id=c;
  return jsonb_build_object('provisional_available',exists(select 1 from jsonb_array_elements(cards) x where x->>'provisional_available'='true'),'cards',cards,'candidates',club_selection_private.team_week_candidates(cards),
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
  candidates:=club_selection_private.team_week_candidates(club_selection_private.award_scorecards(c,club_selection_private.team_week_cards(c,first_day,last_day),coalesce((p_data->>'include_provisional')::boolean,false)));
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

CREATE OR REPLACE FUNCTION club_selection_private.player_week_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();last_day date;cards jsonb;prior_cards jsonb;past jsonb;candidates jsonb;
 cfg club_selection_private.player_week_design%rowtype;profile club_selection_private.player_week_profiles%rowtype;
 e club_selection_private.player_week_editions%rowtype;layout jsonb;field jsonb;chosen_winner jsonb;sid uuid;latest uuid;
begin
 if me is null or not club_selection_private.social_allowed(c) then raise exception 'Club socials access is required';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>30000 then raise exception 'Invalid Player of the Week request';end if;
 if p_action in ('context','profile','reserve_image') then
  last_day:=(p_data->>'week_end')::date;if last_day is null then raise exception 'Choose a week ending date';end if;
  cards:=club_selection_private.award_scorecards(c,club_selection_private.team_week_cards(c,last_day-6,last_day),coalesce((p_data->>'include_provisional')::boolean,false));
  candidates:=club_selection_private.player_week_candidates(c,cards);
 end if;
 if p_action='context' then
  prior_cards:=club_selection_private.team_week_cards(c,last_day-90,last_day-7);
  past:=club_selection_private.player_week_candidates(c,prior_cards);
  select * into cfg from club_selection_private.player_week_design where club_id=c;
  return jsonb_build_object('provisional_available',exists(select 1 from jsonb_array_elements(cards) x where x->>'provisional_available'='true'),'cards',cards,'candidates',coalesce((select jsonb_agg(p||jsonb_build_object('previous',coalesce(
   (select jsonb_agg(q) from jsonb_array_elements(past) q where q->>'player_id'=p->>'player_id'),'[]'))) from jsonb_array_elements(candidates) p),'[]'),
   'profiles',coalesce((select jsonb_object_agg(player_id,jsonb_build_object('stage',stage,'note',note,'revision',revision)) from club_selection_private.player_week_profiles where club_id=c),'{}'),
   'design',jsonb_build_object('layout',coalesce(cfg.layout,'{}'),'revision',coalesce(cfg.revision,0)),
   'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.week_end desc,h.created_at desc) from
    (select id,week_end,winner,title,blurb,image_path,sealed_at as created_at from club_selection_private.player_week_editions where club_id=c and sealed_at is not null order by week_end desc,sealed_at desc limit 150) h),'[]'));
 end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,17200));
 if p_action='profile' then
  if not exists(select 1 from jsonb_array_elements(candidates) p where p->>'player_id'=p_data->>'player_id') then raise exception 'Choose a player from this week’s imported scores';end if;
  if coalesce(p_data->>'stage','') not in ('unspecified','emerging','established','experienced') or length(coalesce(p_data->>'note',''))>300 then raise exception 'Check the player context';end if;
  select * into profile from club_selection_private.player_week_profiles where club_id=c and player_id=p_data->>'player_id';
  if coalesce(profile.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'Player context changed. Reload scores before saving';end if;
  insert into club_selection_private.player_week_profiles(club_id,player_id,stage,note,updated_by) values(c,p_data->>'player_id',p_data->>'stage',coalesce(p_data->>'note',''),me)
   on conflict(club_id,player_id) do update set stage=excluded.stage,note=excluded.note,updated_by=me,revision=club_selection_private.player_week_profiles.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(profile.revision,0)+1);
 elsif p_action='save_design' then
  select * into cfg from club_selection_private.player_week_design where club_id=c;
  if coalesce(cfg.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'Layout changed. Reload scores before saving';end if;
  layout:=p_data->'layout';if jsonb_typeof(layout) is distinct from 'object' then raise exception 'Check the layout';end if;
  for field in select * from jsonb_array_elements('["background_path","logo_path","example_path"]') loop
   if not club_selection_private.player_week_asset(c,nullif(layout->>(field#>>'{}'),'')) then raise exception 'Upload artwork for this club first';end if;
  end loop;
  for field in select * from jsonb_array_elements('[["title_y",0,100],["week_y",0,100],["name_y",0,100],["figures_y",0,100],["grade_y",0,100],["photo_x",0,100],["photo_y",0,100],["photo_size",10,100],["logo_x",0,100],["logo_y",0,100],["logo_size",3,50],["text_x",0,100],["text_width",25,95],["title_size",20,120],["name_size",20,120],["figures_size",16,100]]') loop
   if layout ? (field->>0) and (jsonb_typeof(layout->(field->>0)) is distinct from 'number' or layout->>(field->>0)!~'^[0-9]{1,3}$' or (layout->>(field->>0))::integer not between (field->>1)::integer and (field->>2)::integer) then raise exception 'Check artwork sizes and positions';end if;
  end loop;
  for field in select * from jsonb_array_elements('["includes_title","show_logo","show_photo","text_panel"]') loop
   if layout ? (field#>>'{}') and jsonb_typeof(layout->(field#>>'{}')) is distinct from 'boolean' then raise exception 'Check artwork options';end if;
  end loop;
  if layout ? 'text_colour' and coalesce(layout->>'text_colour','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Choose a text colour';end if;
  insert into club_selection_private.player_week_design values(c,layout,1) on conflict(club_id) do update set layout=excluded.layout,revision=club_selection_private.player_week_design.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(cfg.revision,0)+1);
 elsif p_action='reserve_image' then
  sid:=(p_data->>'id')::uuid;if sid is null then raise exception 'Image identity required';end if;
  select * into e from club_selection_private.player_week_editions where id=sid;
  if found then
   if e.club_id<>c or e.created_by<>me or e.request<>p_data then raise exception 'Image identity already used';end if;
   return jsonb_build_object('id',e.id,'path',e.image_path,'sealed',e.sealed_at is not null);
  end if;
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=last_day and sealed_at is not null order by sealed_at desc limit 1;
  if latest is distinct from (p_data->>'previous_id')::uuid then raise exception 'This week’s winner changed. Reload scores before saving';end if;
  select p into chosen_winner from jsonb_array_elements(candidates) p where p->>'key'=p_data->>'key';
  if chosen_winner is null then raise exception 'Scores changed. Reload and choose the winner again';end if;
  if chosen_winner->'batting' is distinct from p_data->'batting' or chosen_winner->'bowling' is distinct from p_data->'bowling' then raise exception 'Figures changed. Reload and review the winner';end if;
  if length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>60 or length(coalesce(p_data->>'blurb',''))>2000
   or coalesce(p_data->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(p_data->>'bytes','')!~'^[0-9]{1,8}$' or (p_data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Check the winner and graphic';end if;
  if not club_selection_private.player_week_asset(c,nullif(p_data->>'photo_path','')) then raise exception 'Upload the player photo first';end if;
  insert into club_selection_private.player_week_editions(id,club_id,week_end,winner,title,blurb,image_path,image_sha,image_bytes,request,created_by)
   values(sid,c,last_day,chosen_winner,p_data->>'title',coalesce(p_data->>'blurb',''),c::text||'/editions/'||sid||'.png',p_data->>'sha256',(p_data->>'bytes')::integer,p_data,me) returning * into e;
  return jsonb_build_object('id',sid,'path',e.image_path,'sealed',false);
 elsif p_action='finish_image' then
  select * into e from club_selection_private.player_week_editions where club_id=c and id=(p_data->>'id')::uuid and created_by=me for update;
  if e.id is null then raise exception 'Saved image not found';end if;
  if e.sealed_at is not null then return jsonb_build_object('saved',true);end if;
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=e.week_end and sealed_at is not null order by sealed_at desc limit 1;
  if latest is distinct from (e.request->>'previous_id')::uuid then raise exception 'Another winner was saved. Reload scores before saving';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-player-week' and name=e.image_path and (metadata->>'size')::bigint=e.image_bytes) then raise exception 'Upload not confirmed. Retry saving';end if;
  update club_selection_private.player_week_editions set sealed_at=clock_timestamp() where id=e.id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown Player of the Week action';
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_awards_api(c uuid, action text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); last_day date; cards jsonb; candidates jsonb; cfg club_selection_private.social_award_settings%rowtype;
 design club_selection_private.social_award_designs%rowtype; portrait club_selection_private.social_award_portraits%rowtype;
 edition club_selection_private.social_award_editions%rowtype; req club_selection_private.social_award_requests%rowtype;
 k text; x jsonb; f jsonb; value jsonb; chosen jsonb:='[]'; rid uuid; enabled_values text[];
begin
 if me is null then raise exception 'Sign in to manage social awards';end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>100000 then raise exception 'Invalid social awards request';end if;
 if action in ('admin_context','admin_update') then
  if not public.has_platform_role(array['owner','commercial_admin']) then raise exception 'Platform owner access required';end if;
  if action='admin_context' then return jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('club_name',cl.name) order by r.created_at desc) from club_selection_private.social_award_requests r join public.clubs cl on cl.id=r.club_id),'[]'));end if;
  if coalesce(data->>'status','') not in ('requested','in_progress','ready','closed') or length(coalesce(data->>'reply',''))>2000 then raise exception 'Check the request status and reply';end if;
  update club_selection_private.social_award_requests set status=data->>'status',reply=coalesce(data->>'reply',''),revision=revision+1,updated_at=now()
   where id=(data->>'id')::uuid and revision=(data->>'revision')::integer returning * into req;
  if req.id is null then raise exception 'Request changed. Refresh before saving';end if;
  return jsonb_build_object('saved',true,'revision',req.revision);
 end if;
 if c is null or not club_selection_private.social_allowed(c) then raise exception 'Club Admin or socials manager access required';end if;
 select * into cfg from club_selection_private.social_award_settings where club_id=c;
 if action='settings' then return jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0));end if;
 if action in ('context','save_photo','reserve_image') then
  last_day:=(data->>'week_end')::date;if last_day is null then raise exception 'Choose a week ending date';end if;
  cards:=club_selection_private.award_scorecards(c,club_selection_private.team_week_cards(c,last_day-6,last_day),coalesce((data->>'include_provisional')::boolean,false));candidates:=club_selection_private.social_award_candidates(cards);
 end if;
 if action='context' then return jsonb_build_object('provisional_available',exists(select 1 from jsonb_array_elements(cards) x where x->>'provisional_available'='true'),
  'settings',jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0)),
  'cards',coalesce((select jsonb_agg(jsonb_build_object('grade',entry#>>'{scorecard,grade}','status',entry#>>'{scorecard,status}','matched',entry->>'our_team' is not null)) from jsonb_array_elements(cards) entry),'[]'),
  'candidates',candidates,
  'designs',coalesce((select jsonb_object_agg(kind,jsonb_build_object('layout',layout,'revision',revision)) from club_selection_private.social_award_designs where club_id=c),'{}'),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'player_id',player_id,'photo',photo,'revision',revision)) from club_selection_private.social_award_portraits where club_id=c),'[]'),
  'editions',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('scores_current',club_selection_private.social_award_scores_current(c,e.id,cards),'sources',coalesce((select a.sources from club_selection_private.social_award_editions a where a.id=e.id),'[]'::jsonb),'performance_keys',coalesce((select jsonb_agg(entry->>'key') from club_selection_private.social_award_editions a cross join lateral jsonb_array_elements(a.sources) entry where a.id=e.id),'[]')) order by created_at) from club_selection_private.social_award_collection(c,last_day) e),'[]'),
  'requests',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from club_selection_private.social_award_requests r where club_id=c),'[]'));end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,17800));
 select * into cfg from club_selection_private.social_award_settings where club_id=c;
 if action='save_settings' then
  if coalesce(cfg.revision,0) is distinct from (data->>'revision')::integer then raise exception 'Award choices changed. Reload before saving';end if;
  if jsonb_typeof(data->'enabled') is distinct from 'array' or jsonb_array_length(data->'enabled')>5 or exists(select 1 from jsonb_array_elements_text(data->'enabled') e where e not in ('team_week','player_week','results','five_wickets','century')) then raise exception 'Choose awards from the list';end if;
  select coalesce(array_agg(distinct e),'{}'::text[]) into enabled_values from jsonb_array_elements_text(data->'enabled') e;
  insert into club_selection_private.social_award_settings values(c,enabled_values,1) on conflict(club_id) do update set enabled=excluded.enabled,revision=club_selection_private.social_award_settings.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(cfg.revision,0)+1,'enabled',enabled_values);
 elsif action='save_design' then
  k:=data->>'kind';if coalesce(k,'') not in ('results','five_wickets','century') then raise exception 'Choose a graphic type';end if;
  select * into design from club_selection_private.social_award_designs where club_id=c and kind=k;
  if design.layout=data->'layout' then return jsonb_build_object('saved',true,'revision',design.revision);end if;
  if coalesce(design.revision,0) is distinct from (data->>'revision')::integer then raise exception 'Artwork changed. Reload before saving';end if;
  value:=data->'layout';if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>30000 then raise exception 'Check the artwork settings';end if;
  foreach k in array array['background_path','logo_path','example_path'] loop
   if not club_selection_private.social_award_asset(c,nullif(value->>k,'')) then raise exception 'Upload artwork for this club first';end if;
  end loop;
  if value ? 'opponent_logos' then
   if jsonb_typeof(value->'opponent_logos') is distinct from 'object' or (select count(*) from jsonb_object_keys(value->'opponent_logos'))>50 then raise exception 'Check the opposition logos';end if;
   for k,x in select key,v from jsonb_each(value->'opponent_logos') as j(key,v) loop
    if k!~'^[0-9a-f-]{36}$' or jsonb_typeof(x) is distinct from 'object' or x->>'path' is null or not club_selection_private.social_award_asset(c,x->>'path') or length(coalesce(x->>'name',''))>255 then raise exception 'Upload opposition logos for this club first';end if;
   end loop;
  end if;
  for f in select * from jsonb_array_elements('[["title_y",0,100],["title_size",20,160],["name_y",0,100],["name_size",20,120],["figures_y",0,100],["figures_size",20,160],["grade_y",0,100],["week_y",0,100],["rows_top",15,65],["rows_bottom",70,98],["logo_x",0,100],["logo_y",0,100],["logo_size",3,40]]') loop
   if value ? (f->>0) and (jsonb_typeof(value->(f->>0)) is distinct from 'number' or (value->>(f->>0))::numeric not between (f->>1)::numeric and (f->>2)::numeric) then raise exception 'Check the text and logo positions';end if;
  end loop;
  foreach k in array array['includes_title','show_logo','text_panel'] loop
   if value ? k and jsonb_typeof(value->k) is distinct from 'boolean' then raise exception 'Check the artwork options';end if;
  end loop;
  if value ? 'text_colour' and coalesce(value->>'text_colour','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Choose a text colour';end if;
  insert into club_selection_private.social_award_designs values(c,data->>'kind',value,1) on conflict(club_id,kind) do update set layout=excluded.layout,revision=club_selection_private.social_award_designs.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(design.revision,0)+1);
 elsif action='save_photo' then
  k:=data->>'kind';if coalesce(k,'') not in ('five_wickets','century') or not exists(select 1 from jsonb_array_elements(candidates) entry where entry->>'kind'=k and entry->>'player_id'=data->>'player_id') then raise exception 'Choose a qualifying player from this week';end if;
  value:=data->'photo';if jsonb_typeof(value) is distinct from 'object' or not club_selection_private.social_award_asset(c,nullif(value->>'path','')) then raise exception 'Upload the player photo first';end if;
  for f in select * from jsonb_array_elements('[["x",0,100],["y",0,100],["size",10,100]]') loop
   if jsonb_typeof(value->(f->>0)) is distinct from 'number' or (value->>(f->>0))::numeric not between (f->>1)::numeric and (f->>2)::numeric then raise exception 'Check the photo position';end if;
  end loop;
  select * into portrait from club_selection_private.social_award_portraits where club_id=c and kind=k and player_id=data->>'player_id';
  if portrait.photo=value then return jsonb_build_object('saved',true,'revision',portrait.revision);end if;
  if coalesce(portrait.revision,0) is distinct from (data->>'revision')::integer then raise exception 'This player photo changed. Reload before saving';end if;
  insert into club_selection_private.social_award_portraits values(c,k,data->>'player_id',value,1) on conflict(club_id,kind,player_id) do update set photo=excluded.photo,revision=club_selection_private.social_award_portraits.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(portrait.revision,0)+1);
 elsif action='request' then
  rid:=(data->>'id')::uuid;if rid is null or length(btrim(coalesce(data->>'name',''))) not between 1 and 80 or length(btrim(coalesce(data->>'criteria',''))) not between 1 and 2000 or length(coalesce(data->>'artwork_notes',''))>2000 or jsonb_typeof(data->'files') is distinct from 'array' or jsonb_array_length(data->'files')>6 then raise exception 'Add the award name, criteria and up to six artwork examples';end if;
  for x in select * from jsonb_array_elements(data->'files') loop
   if x->>'path' is null or not club_selection_private.social_award_asset(c,x->>'path') or length(coalesce(x->>'name',''))>255 then raise exception 'Upload request artwork for this club first';end if;
  end loop;
  select * into req from club_selection_private.social_award_requests where id=rid;
  if req.id is not null then
   if req.club_id<>c or req.requested_by<>me or req.name<>btrim(data->>'name') or req.criteria<>btrim(data->>'criteria') or req.artwork_notes<>coalesce(data->>'artwork_notes','') or req.files<>data->'files' then raise exception 'This request already exists. Refresh to check it';end if;
  else
   insert into club_selection_private.social_award_requests(id,club_id,name,criteria,artwork_notes,files,requested_by) values(rid,c,btrim(data->>'name'),btrim(data->>'criteria'),coalesce(data->>'artwork_notes',''),data->'files',me);
  end if;
  return jsonb_build_object('saved',true,'id',rid);
 elsif action='reserve_image' then
  rid:=(data->>'id')::uuid;k:=data->>'kind';
  if rid is null or coalesce(k,'') not in ('results','five_wickets','century') or not k=any(coalesce(cfg.enabled,array['team_week','player_week'])) then raise exception 'Enable this graphic in Socials Awards first';end if;
  select * into edition from club_selection_private.social_award_editions where id=rid;
  if edition.id is not null then
   if edition.club_id<>c or edition.created_by<>me or edition.request<>data then raise exception 'This image identity was already used';end if;
   return jsonb_build_object('id',rid,'path',edition.image_path,'sealed',edition.sealed_at is not null);
  end if;
  if jsonb_typeof(data->'sources') is distinct from 'array' or jsonb_array_length(data->'sources') not between 1 and 4 or (k<>'results' and jsonb_array_length(data->'sources')<>1) then raise exception 'Choose the performances for this graphic';end if;
  if (select count(distinct entry->>'key') from jsonb_array_elements(data->'sources') entry)<>jsonb_array_length(data->'sources') then raise exception 'A performance was selected twice';end if;
  for x in select * from jsonb_array_elements(data->'sources') loop
   select p into value from jsonb_array_elements(candidates) p where p->>'key'=x->>'key' and p->>'kind'=k and p->>'signature'=x->>'signature';
   if value is null then raise exception 'Scores changed. Reload and review the graphic';end if;
   chosen:=chosen||jsonb_build_array(value);
  end loop;
  if k<>'results' and exists(select 1 from club_selection_private.social_award_editions e cross join lateral jsonb_array_elements(e.sources) src where e.club_id=c and e.kind=k and e.week_end=last_day and e.sealed_at is not null and src->>'key'=chosen->0->>'key' and src->>'signature'=chosen->0->>'signature' and e.id in (select id from club_selection_private.social_award_collection(c,last_day))) then raise exception 'This graphic is already created. Reload to see it in the post collection';end if;
  if length(btrim(coalesce(data->>'label',''))) not between 1 and 160 or coalesce(data->>'sha256','')!~'^[a-f0-9]{64}$' or coalesce(data->>'bytes','')!~'^[0-9]{1,8}$' or (data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Check the graphic before saving';end if;
  insert into club_selection_private.social_award_editions(id,club_id,kind,week_end,label,sources,image_path,image_sha,image_bytes,request,created_by)
   values(rid,c,k,last_day,data->>'label',chosen,c::text||'/editions/'||rid::text||'.png',data->>'sha256',(data->>'bytes')::integer,data,me) returning * into edition;
  return jsonb_build_object('id',rid,'path',edition.image_path,'sealed',false);
 elsif action='finish_image' then
  select * into edition from club_selection_private.social_award_editions where id=(data->>'id')::uuid and club_id=c and created_by=me for update;
  if edition.id is null then raise exception 'Saved image not found';end if;
  if edition.sealed_at is not null then return jsonb_build_object('saved',true,'id',edition.id);end if;
  candidates:=club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,club_selection_private.team_week_cards(c,edition.week_end-6,edition.week_end),coalesce((edition.request->>'include_provisional')::boolean,false)));
  if exists(select 1 from jsonb_array_elements(edition.sources) src where not exists(select 1 from jsonb_array_elements(candidates) p where p->>'key'=src->>'key' and p->>'signature'=src->>'signature')) then raise exception 'Scores changed. Reload and review the graphic';end if;
  if edition.kind<>'results' and exists(select 1 from club_selection_private.social_award_editions e cross join lateral jsonb_array_elements(e.sources) src where e.club_id=c and e.kind=edition.kind and e.sealed_at is not null and src->>'key'=edition.sources->0->>'key' and src->>'signature'=edition.sources->0->>'signature' and e.id in (select id from club_selection_private.social_award_collection(c,edition.week_end))) then raise exception 'This graphic is already created. Reload to see it in the post collection';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-social-awards' and name=edition.image_path and (metadata->>'size')::bigint=edition.image_bytes) then raise exception 'Image upload not confirmed. Retry saving';end if;
  update club_selection_private.social_award_editions set sealed_at=coalesce(sealed_at,clock_timestamp()) where id=edition.id;
  return jsonb_build_object('saved',true,'id',edition.id);
 end if;
 raise exception 'Unknown social awards action';
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_award_scores_current(c uuid, eid uuid, cards jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare e record; saved jsonb; current_rows jsonb;
begin
 select * into e from club_selection_private.social_award_sources(c) where id=eid;
 if not found then return false;end if;
 cards:=coalesce(cards,club_selection_private.team_week_cards(c,e.week_end-6,e.week_end));
 if e.kind in ('results','century','five_wickets') then
  select sources into saved from club_selection_private.social_award_editions where id=eid and club_id=c;
  current_rows:=club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,cards,exists(select 1 from jsonb_array_elements(saved) x where x->>'provisional'='true')));
  return coalesce(jsonb_array_length(saved)>0 and not exists(
   select 1 from jsonb_array_elements(saved) src where not exists(
    select 1 from jsonb_array_elements(current_rows) p where p->>'kind'=e.kind
     and p->>'key'=src->>'key' and p->>'signature'=src->>'signature')),false);
 end if;
 if e.kind='team_week' then
  select rows into saved from club_selection_private.team_week_editions where id=eid and club_id=c;
 else
  select jsonb_build_array(winner) into saved from club_selection_private.player_week_editions where id=eid and club_id=c;
 end if;
 current_rows:=club_selection_private.player_week_performances(club_selection_private.award_scorecards(c,cards,exists(select 1 from jsonb_array_elements(saved) x where x->>'provisional'='true')));
 return coalesce(jsonb_array_length(saved)>0 and not exists(
  select 1 from jsonb_array_elements(saved) src where not exists(
   select 1 from jsonb_array_elements(current_rows) p
   where coalesce(p->>'provisional','false')=coalesce(src->>'provisional','false') and club_selection_private.social_award_facts(p)=club_selection_private.social_award_facts(src))),false);
end $function$;
