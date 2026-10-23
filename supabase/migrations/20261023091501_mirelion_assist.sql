-- Private, two-way club support. No email or other outbound delivery is queued.
create schema if not exists mirelion_assist_private;
revoke all on schema mirelion_assist_private from public, anon, authenticated;

create table mirelion_assist_private.threads (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete cascade,
 requester_id uuid not null references auth.users(id) on delete cascade,
 subject text not null check (char_length(subject) between 1 and 120),
 category text not null check (category in ('help','enquiry','idea')),
 status text not null default 'open' check (status in ('open','resolved')),
 last_side text not null default 'club' check (last_side in ('club','team')),
 version bigint not null default 1,
 guide_context jsonb not null default '[]',
 legacy_thread_id uuid unique references public.club_batting_guide_threads(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index assist_requester_club on mirelion_assist_private.threads(requester_id,club_id,status,updated_at desc,id);
create index assist_inbox on mirelion_assist_private.threads(status,updated_at desc,id);
create index assist_club on mirelion_assist_private.threads(club_id);
create table mirelion_assist_private.messages (
 id bigint generated always as identity primary key,
 thread_id uuid not null references mirelion_assist_private.threads(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 side text not null check(side in ('club','team')),
 body text not null check(char_length(body) between 1 and 6000),
 created_at timestamptz not null default now()
);
create index assist_message_thread on mirelion_assist_private.messages(thread_id,id);
create index assist_message_author on mirelion_assist_private.messages(author_id,created_at desc);
create table mirelion_assist_private.reads (
 thread_id uuid not null references mirelion_assist_private.threads(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 last_message_id bigint not null default 0,
 primary key(thread_id,user_id)
);
create index assist_reads_user on mirelion_assist_private.reads(user_id);
create table mirelion_assist_private.commands (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 action text not null,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
-- These tables are accessed only through the checked API below.
alter table mirelion_assist_private.threads enable row level security;
alter table mirelion_assist_private.messages enable row level security;
alter table mirelion_assist_private.reads enable row level security;
alter table mirelion_assist_private.commands enable row level security;
revoke all on all tables in schema mirelion_assist_private from public, anon, authenticated;
revoke all on all sequences in schema mirelion_assist_private from public, anon, authenticated;

create function mirelion_assist_private.api(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); c uuid:=nullif(p_data->>'club_id','')::uuid;
 team boolean:=coalesce((p_data->>'platform')::boolean,false);
 staff boolean; t mirelion_assist_private.threads%rowtype;
 cmd mirelion_assist_private.commands%rowtype;
 rid uuid; tid uuid:=nullif(p_data->>'thread_id','')::uuid;
 body text:=btrim(coalesce(p_data->>'body','')); subj text:=btrim(coalesce(p_data->>'subject',''));
 cat text:=coalesce(p_data->>'category','help'); result jsonb; mid bigint; ctx jsonb:='[]';
 before_id bigint:=nullif(p_data->>'before','')::bigint;
 cutoff bigint; skip integer:=greatest(0,least(10000,coalesce((p_data->>'offset')::integer,0)));
 filter_status text:=coalesce(p_data->>'status','open'); search_term text:=left(btrim(coalesce(p_data->>'search','')),120);
begin
 if u is null then raise exception 'Sign in to use Mirelion Assist.' using errcode='42501'; end if;
 staff:=public.has_platform_role(array['owner','commercial_admin','support_admin','technical_admin']);
 if team then
  if not staff then raise exception 'Mirelion team access required.' using errcode='42501'; end if;
 else
  if c is null or not public.is_club_member(c) then raise exception 'Your club access has changed. Sign in again.' using errcode='42501'; end if;
 end if;
 if p_action not in ('summary','list','thread','read','create','send','status','legacy','legacy_close') then raise exception 'Unknown Assist action.'; end if;
 if p_action in ('legacy','legacy_close') then
  if not team then raise exception 'Mirelion team access required.' using errcode='42501'; end if;
  if p_action='legacy_close' then
   if exists(select 1 from mirelion_assist_private.threads where legacy_thread_id=tid) then raise exception 'Resolve this conversation in Assist.'; end if;
   perform public.platform_close_guide_request(tid);return jsonb_build_object('resolved',true);
  end if;
  return coalesce((select jsonb_agg(item) from jsonb_array_elements(public.platform_get_guide_requests()) item
   where not exists(select 1 from mirelion_assist_private.threads where legacy_thread_id=(item->>'id')::uuid)),'[]');
 end if;
 if p_action in ('create','send','status') then
  rid:=nullif(p_data->>'request_id','')::uuid;
  if rid is null then raise exception 'A request reference is required.'; end if;
  -- Serialize retries from one user, including requests from multiple browser tabs.
  perform pg_advisory_xact_lock(hashtextextended(u::text,754));
  select * into cmd from mirelion_assist_private.commands where user_id=u and request_id=rid;
  if found then
   if cmd.action<>p_action or cmd.payload<>p_data then raise exception 'This request reference was already used. Reopen the message.'; end if;
   -- Re-check current access before returning even an old receipt.
   select * into t from mirelion_assist_private.threads where id=(cmd.result->>'thread_id')::uuid;
   if not found or (not team and (t.club_id<>c or t.requester_id<>u)) then raise exception 'Message unavailable.' using errcode='42501'; end if;
   return cmd.result;
  end if;
 end if;
 if p_action in ('thread','read','send','status') then
  select * into t from mirelion_assist_private.threads where id=tid for update;
  if not found or (not team and (t.club_id<>c or t.requester_id<>u)) then raise exception 'Message unavailable.' using errcode='42501'; end if;
 end if;
 if p_action='summary' then
  return jsonb_build_object('unread',(select count(*) from mirelion_assist_private.messages m
   join mirelion_assist_private.threads th on th.id=m.thread_id
   left join mirelion_assist_private.reads r on r.thread_id=th.id and r.user_id=u
   where (team or (th.club_id=c and th.requester_id=u))
   and m.side=case when team then 'club' else 'team' end and m.id>coalesce(r.last_message_id,0)));
 elsif p_action='list' then
  if filter_status not in ('open','resolved') then raise exception 'Choose open or resolved messages.'; end if;
  select coalesce(jsonb_agg(item order by updated_at desc,id),'[]') into result from (
   select th.id,th.updated_at,jsonb_build_object('id',th.id,'subject',th.subject,'category',th.category,'status',th.status,
    'version',th.version,'last_side',th.last_side,'updated_at',th.updated_at,'club_name',cl.name,
    'requester_name',coalesce(nullif(pr.display_name,''),'Club member'),
    'preview',(select left(m.body,160) from mirelion_assist_private.messages m where m.thread_id=th.id order by m.id desc limit 1),
    'unread',(select count(*) from mirelion_assist_private.messages m where m.thread_id=th.id
     and m.side=case when team then 'club' else 'team' end and m.id>coalesce(r.last_message_id,0))) item
   from mirelion_assist_private.threads th join public.clubs cl on cl.id=th.club_id
   left join public.user_profiles pr on pr.user_id=th.requester_id
   left join mirelion_assist_private.reads r on r.thread_id=th.id and r.user_id=u
   where (team or (th.club_id=c and th.requester_id=u)) and th.status=filter_status
    and (search_term='' or strpos(lower(th.subject||' '||cl.name||' '||coalesce(pr.display_name,'')),lower(search_term))>0)
   order by th.updated_at desc,th.id limit 51 offset skip
  ) items;
  return jsonb_build_object('threads',case when jsonb_array_length(result)>50 then result-50 else result end,'has_more',jsonb_array_length(result)>50);
 elsif p_action='thread' then
  select coalesce(jsonb_agg(item order by id),'[]') into result from (
   select m.id,jsonb_build_object('id',m.id,'side',m.side,'body',m.body,'created_at',m.created_at) item
   from mirelion_assist_private.messages m where m.thread_id=tid and (before_id is null or m.id<before_id) order by m.id desc limit 100
  ) page;
  cutoff:=nullif(result->0->>'id','')::bigint;
  return jsonb_build_object('thread',jsonb_build_object('id',t.id,'subject',t.subject,'category',t.category,'status',t.status,'version',t.version,
   'last_side',t.last_side,'club_name',(select name from public.clubs where id=t.club_id),
   'requester_name',(select display_name from public.user_profiles where user_id=t.requester_id),'guide_context',t.guide_context),
   'messages',result,'has_older',exists(select 1 from mirelion_assist_private.messages where thread_id=tid and id<cutoff));
 elsif p_action='read' then
  mid:=coalesce((p_data->>'through')::bigint,0);
  if not exists(select 1 from mirelion_assist_private.messages where thread_id=tid and id=mid) then raise exception 'Read reference unavailable.'; end if;
  insert into mirelion_assist_private.reads(thread_id,user_id,last_message_id) values(tid,u,mid)
   on conflict(thread_id,user_id) do update set last_message_id=greatest(mirelion_assist_private.reads.last_message_id,excluded.last_message_id);
  return jsonb_build_object('read',true);
 elsif p_action in ('create','send') then
  if char_length(body) not between 1 and 6000 then raise exception 'Enter a message of 1–6,000 characters.'; end if;
  if (select count(*) from mirelion_assist_private.messages where author_id=u and created_at>now()-interval '1 minute')>=20 then raise exception 'Please wait a moment before sending another message.'; end if;
  if p_action='create' then
   if team then raise exception 'Open a club message to reply.'; end if;
   if char_length(subj) not between 1 and 120 then raise exception 'Add a subject of 1–120 characters.'; end if;
   if cat not in ('help','enquiry','idea') then raise exception 'Choose help, enquiry or a suggested change.'; end if;
   if coalesce((p_data->>'include_guide')::boolean,false) then
    select coalesce(jsonb_agg(jsonb_build_object('role',g.role,'content',left(g.content,6000),'created_at',g.created_at) order by g.created_at),'[]') into ctx
     from (select m.* from public.club_batting_guide_messages m where m.thread_id=(select id from public.club_batting_guide_threads where club_id=c and user_id=u order by updated_at desc limit 1) order by m.created_at desc limit 40) g;
   end if;
   insert into mirelion_assist_private.threads(club_id,requester_id,subject,category,guide_context) values(c,u,subj,cat,ctx) returning * into t;
   tid:=t.id;
  else
   update mirelion_assist_private.threads set status='open',last_side=case when team then 'team' else 'club' end,version=version+1,updated_at=now() where id=tid returning * into t;
  end if;
  insert into mirelion_assist_private.messages(thread_id,author_id,side,body) values(tid,u,case when team then 'team' else 'club' end,body) returning id into mid;
  result:=jsonb_build_object('thread_id',tid,'message_id',mid,'version',t.version);
 elsif p_action='status' then
  if p_data->>'status' not in ('open','resolved') or p_data->>'status' is null then raise exception 'Choose open or resolved.'; end if;
  if coalesce((p_data->>'version')::bigint,-1)<>t.version then raise exception 'This conversation changed. Read the latest messages and try again.'; end if;
  update mirelion_assist_private.threads set status=p_data->>'status',version=version+1,updated_at=now() where id=tid returning * into t;
  if t.status='resolved' and t.legacy_thread_id is not null then
   update public.club_batting_guide_threads set status='closed',updated_at=now() where id=t.legacy_thread_id;
  end if;
  result:=jsonb_build_object('thread_id',tid,'version',t.version,'status',t.status);
 end if;
 insert into mirelion_assist_private.commands(user_id,request_id,action,payload,result) values(u,rid,p_action,p_data,result);
 insert into public.platform_audit_events(actor_user_id,club_id,event_type,details)
 values(u,t.club_id,'mirelion_assist_'||p_action,jsonb_build_object('thread_id',tid,'message_id',mid,'status',t.status));
 return result;
end;
$$;
revoke all on function mirelion_assist_private.api(text,jsonb) from public, anon;
grant usage on schema mirelion_assist_private to authenticated;
grant execute on function mirelion_assist_private.api(text,jsonb) to authenticated;
create function public.mirelion_assist(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mirelion_assist_private.api(p_action,p_data) $$;
revoke all on function public.mirelion_assist(text,jsonb) from public, anon;
grant execute on function public.mirelion_assist(text,jsonb) to authenticated;

-- Preserve pending requests from older browsers, with their shared Guide context.
create function mirelion_assist_private.import_handoff() returns trigger
language plpgsql security definer set search_path='' as $$
declare tid uuid; ctx jsonb; body text;
begin
 if new.status<>'handoff_requested' or new.club_id is null or new.user_id is null then return new; end if;
 if tg_op='UPDATE' and old.status=new.status and old.human_handoff_reason=new.human_handoff_reason then return new; end if;
 select coalesce(jsonb_agg(jsonb_build_object('role',g.role,'content',left(g.content,6000),'created_at',g.created_at) order by g.created_at),'[]') into ctx
 from (select * from public.club_batting_guide_messages where thread_id=new.id order by created_at desc limit 40) g;
 body:=coalesce(nullif(btrim(new.human_handoff_reason),''),'Help requested from the Guide.');
 insert into mirelion_assist_private.threads(club_id,requester_id,subject,category,legacy_thread_id,guide_context)
 values(new.club_id,new.user_id,left(body,120),'help',new.id,ctx)
 on conflict(legacy_thread_id) do update set status='open',last_side='club',updated_at=now(),version=mirelion_assist_private.threads.version+1,guide_context=excluded.guide_context
 returning id into tid;
 insert into mirelion_assist_private.messages(thread_id,author_id,side,body) values(tid,new.user_id,'club',left(body,6000));
 return new;
end;
$$;
revoke all on function mirelion_assist_private.import_handoff() from public,anon,authenticated;
create trigger mirelion_assist_legacy_handoff after insert or update of status,human_handoff_reason
 on public.club_batting_guide_threads for each row execute function mirelion_assist_private.import_handoff();
insert into mirelion_assist_private.threads(club_id,requester_id,subject,category,legacy_thread_id,guide_context,created_at,updated_at)
select t.club_id,t.user_id,left(coalesce(nullif(btrim(t.human_handoff_reason),''),'Help requested from the Guide.'),120),'help',t.id,
 coalesce((select jsonb_agg(jsonb_build_object('role',g.role,'content',left(g.content,6000),'created_at',g.created_at) order by g.created_at) from (select * from public.club_batting_guide_messages where thread_id=t.id order by created_at desc limit 40) g),'[]'),t.created_at,t.updated_at
from public.club_batting_guide_threads t where t.status='handoff_requested' and t.club_id is not null and t.user_id is not null;
insert into mirelion_assist_private.messages(thread_id,author_id,side,body,created_at)
select th.id,th.requester_id,'club',coalesce(nullif(btrim(t.human_handoff_reason),''),'Help requested from the Guide.'),t.updated_at
from mirelion_assist_private.threads th join public.club_batting_guide_threads t on t.id=th.legacy_thread_id;
notify pgrst,'reload schema';
