-- One club preference and one display label per awards week, shared by all five awards.
create table club_selection_private.social_award_label_preferences (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 mode text not null default 'week' check(mode in ('week','week_number','round')),
 anchor_week date, anchor_number integer check(anchor_number between 1 and 999),
 revision integer not null default 1 check(revision>0),
 last_request_id uuid, last_request jsonb,
 updated_at timestamptz not null default now()
);
create table club_selection_private.social_award_week_labels (
 club_id uuid not null references public.clubs(id) on delete cascade,
 week_end date not null,
 label text not null check(length(btrim(label)) between 1 and 60 and label !~ '[<>[:cntrl:]]'),
 updated_at timestamptz not null default now(),
 primary key(club_id,week_end)
);
alter table club_selection_private.social_award_label_preferences enable row level security;
alter table club_selection_private.social_award_week_labels enable row level security;
revoke all on club_selection_private.social_award_label_preferences,club_selection_private.social_award_week_labels from public,anon,authenticated;

create function club_selection_private.award_label_context(c uuid,last_day date) returns jsonb
language plpgsql stable set search_path='' as $$
declare cfg club_selection_private.social_award_label_preferences%rowtype; chosen text; rounds jsonb; missing integer; common text; total integer; week_number integer; numbered_week text; resolved text;
begin
 select * into cfg from club_selection_private.social_award_label_preferences where club_id=c;
 select label into chosen from club_selection_private.social_award_week_labels where club_id=c and week_end=last_day;
 with cards as (
  select x from jsonb_array_elements(club_selection_private.team_week_cards(c,last_day-6,last_day)) x where nullif(x->>'our_team','') is not null
 ), source_rounds as (
  select btrim(coalesce(nullif(x#>>'{scorecard,round}',''),l.source_fixture->>'round','')) value
  from cards left join club_selection_private.playhq_links l on l.club_id=c and
   (l.fixture_id::text=x->>'fixture_id' or l.match_id::text=x#>>'{scorecard,match_id}')
 ), labels as (
  select case when length(value) not between 1 and 60 or value ~ '[<>[:cntrl:]]' then null
   when value ~* '^(round[[:space:]]*)?[0-9]+$' then 'Round '||regexp_replace(value,'^(round[[:space:]]*)?0*([0-9]+)$','\2','i')
   else value end label from source_rounds
 ) select coalesce(jsonb_agg(distinct label) filter(where label is not null),'[]'),count(*) filter(where label is null),count(*) into rounds,missing,total from labels;
 if jsonb_array_length(rounds)=1 and missing=0 and total>0 then common:=rounds->>0;end if;
 if cfg.anchor_week is not null and mod(last_day-cfg.anchor_week,7)=0 then week_number:=cfg.anchor_number+(last_day-cfg.anchor_week)/7;if week_number>0 then numbered_week:='Week '||week_number;end if;end if;
 resolved:=coalesce(chosen,case when cfg.mode='round' then common when cfg.mode='week_number' then numbered_week else 'WEEK ENDING '||to_char(last_day,'DD/MM/YYYY') end);
 return jsonb_build_object('week_end',last_day,'mode',coalesce(cfg.mode,'week'),'revision',coalesce(cfg.revision,0),
  'label',resolved,'anchor_week',cfg.anchor_week,'anchor_number',cfg.anchor_number,'suggested_week',numbered_week,
  'override',chosen,'suggested_round',common,'rounds',rounds,
  'needs_label',resolved is null,
  'reason',case when cfg.mode='week_number' and resolved is null then 'Enter the week number for all awards, for example Week 2.' when cfg.mode='week_number' then '' when jsonb_array_length(rounds)>1 then 'Teams have different round numbers. Choose one label for all awards.' when common is null then 'Enter the round label for all awards this week.' else '' end);
end;
$$;
revoke all on function club_selection_private.award_label_context(uuid,date) from public,anon,authenticated;

create function public.club_social_award_label_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg club_selection_private.social_award_label_preferences%rowtype; last_day date; label text; mode text; request_id uuid; anchor_week date; anchor_number integer;
begin
 if auth.uid() is null then raise exception 'Sign in to manage award labels';end if;
 if p_club_id is null or not club_selection_private.social_allowed(p_club_id) then raise exception 'Club Admin or socials manager access required';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>2000 then raise exception 'Invalid award label request';end if;
 if p_action='team_rounds' then return coalesce((select jsonb_object_agg(f.id::text,btrim(coalesce(nullif(f.published#>>'{details,round}',''),l.source_fixture->>'round'))) from club_selection_private.fixtures f left join club_selection_private.playhq_links l on l.fixture_id=f.id and l.club_id=f.club_id where f.club_id=p_club_id and f.published is not null and nullif(btrim(coalesce(nullif(f.published#>>'{details,round}',''),l.source_fixture->>'round')),'') is not null),'{}'::jsonb);end if;
 if coalesce(p_data->>'week_end','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose the awards week';end if;
 last_day:=(p_data->>'week_end')::date;
 if p_action='context' then return club_selection_private.award_label_context(p_club_id,last_day);end if;
 if p_action<>'save' then raise exception 'Unknown award label action';end if;
 mode:=p_data->>'mode';label:=nullif(btrim(p_data->>'label'),'');request_id:=(p_data->>'request_id')::uuid;
 if request_id is null or mode is null or mode not in ('week','week_number','round') or coalesce(p_data->>'revision','')!~'^[0-9]+$'
  or (p_data->'label' is not null and p_data->'label'<>'null'::jsonb and (jsonb_typeof(p_data->'label')<>'string' or label is null or length(label)>60 or label ~ '[<>[:cntrl:]]')) then raise exception 'Use an award label of 1–60 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text,24801));
 select * into cfg from club_selection_private.social_award_label_preferences where club_id=p_club_id;
 if cfg.last_request_id=request_id then
  if cfg.last_request is distinct from p_data then raise exception 'Retry the original label change';end if;
  return club_selection_private.award_label_context(p_club_id,last_day);
 end if;
 if coalesce(cfg.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'Award labels changed. Reload before saving';end if;
 anchor_week:=cfg.anchor_week;anchor_number:=cfg.anchor_number;
 if mode='week_number' and label ~* '^week[[:space:]]+[0-9]{1,3}$' then anchor_week:=last_day;anchor_number:=regexp_replace(label,'^week[[:space:]]+','','i')::integer;if anchor_number<1 then raise exception 'Use Week 1 or a later week';end if;label:='Week '||anchor_number;end if;
 if mode='week_number' and anchor_week is null then raise exception 'Enter a week number, for example Week 2';end if;
 insert into club_selection_private.social_award_label_preferences(club_id,mode,anchor_week,anchor_number,revision,last_request_id,last_request)
 values(p_club_id,mode,anchor_week,anchor_number,1,request_id,p_data)
 on conflict(club_id) do update set mode=excluded.mode,anchor_week=excluded.anchor_week,anchor_number=excluded.anchor_number,revision=club_selection_private.social_award_label_preferences.revision+1,last_request_id=excluded.last_request_id,last_request=excluded.last_request,updated_at=now();
 if label is null then delete from club_selection_private.social_award_week_labels where club_id=p_club_id and week_end=last_day;
 else insert into club_selection_private.social_award_week_labels(club_id,week_end,label) values(p_club_id,last_day,label)
  on conflict(club_id,week_end) do update set label=excluded.label,updated_at=now();end if;
 return club_selection_private.award_label_context(p_club_id,last_day);
end;
$$;
revoke all on function public.club_social_award_label_api(uuid,text,jsonb) from public,anon;
grant execute on function public.club_social_award_label_api(uuid,text,jsonb) to authenticated;
