-- Selection Group permissions; requires the .245 participation/write guards.

-- Group access is opt-in on the first permissions save. Existing access remains
-- unchanged until the club confirms its groups and publishing responsibility.
create table club_selection_private.selection_access_settings (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table club_selection_private.selection_group_heads (
 club_id uuid not null, selection_group_id uuid primary key, user_id uuid not null references auth.users(id),
 foreign key(club_id,selection_group_id) references club_selection_private.selection_groups(club_id,id) on delete cascade
);
create table club_selection_private.selection_group_access (
 club_id uuid not null, selection_group_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 access text not null check(access in ('view','edit')),
 primary key(club_id,selection_group_id,user_id),
 foreign key(club_id,selection_group_id) references club_selection_private.selection_groups(club_id,id) on delete cascade
);
create index selection_group_access_user on club_selection_private.selection_group_access(club_id,user_id,selection_group_id);
create table club_selection_private.selection_group_invites (
 id uuid primary key default gen_random_uuid(),club_id uuid not null,selection_group_id uuid not null,
 invited_name text not null check(length(invited_name) between 1 and 100),invited_email text not null check(length(invited_email) between 3 and 254),
 access text not null check(access in ('view','edit')),as_head boolean not null default false,previous_head uuid,
 token_hash bytea not null unique,status text not null default 'pending' check(status in ('pending','accepted','revoked')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',
 accepted_by uuid references auth.users(id),accepted_at timestamptz,
 foreign key(club_id,selection_group_id) references club_selection_private.selection_groups(club_id,id) on delete cascade,
 check(not as_head or access='edit')
);
create unique index selection_group_invites_pending on club_selection_private.selection_group_invites(club_id,selection_group_id,lower(invited_email)) where status='pending';
alter table club_selection_private.selection_access_settings enable row level security;
alter table club_selection_private.selection_group_heads enable row level security;
alter table club_selection_private.selection_group_access enable row level security;
alter table club_selection_private.selection_group_invites enable row level security;
revoke all on club_selection_private.selection_access_settings,club_selection_private.selection_group_heads,club_selection_private.selection_group_access,club_selection_private.selection_group_invites from public,anon,authenticated,service_role;

create function club_selection_private.scoped_selections(c uuid) returns boolean
language sql stable set search_path='' as $$select exists(select 1 from club_selection_private.selection_access_settings where club_id=c)$$;
create function club_selection_private.legacy_selector(c uuid,u uuid) returns boolean
language sql stable set search_path='' as $$select club_selection_private.member(c,u) and (exists(select 1 from club_selection_private.selectors where club_id=c and user_id=u) or exists(select 1 from club_selection_private.access where club_id=c and head_selector_id=u))$$;
create function club_selection_private.selection_group_head(c uuid,g uuid) returns uuid
language sql stable set search_path='' as $$
 select coalesce((select user_id from club_selection_private.selection_group_heads where club_id=c and selection_group_id=g),(select head_selector_id from club_selection_private.access where club_id=c))
$$;
create function club_selection_private.selection_group_level(c uuid,g uuid,u uuid) returns integer
language sql stable set search_path='' as $$
 select case when not club_selection_private.member(c,u) then 0
 when not club_selection_private.scoped_selections(c) then case when club_selection_private.legacy_selector(c,u) then 2 else 0 end
 when g is null or not exists(select 1 from club_selection_private.selection_groups where club_id=c and id=g) then 0
 when club_selection_private.selection_group_head(c,g)=u then 2
 else coalesce((select case access when 'edit' then 2 else 1 end from club_selection_private.selection_group_access where club_id=c and selection_group_id=g and user_id=u),0) end
$$;
-- Preserve the old club-wide mutator contract for endpoints not migrated to group
-- scope. A partial-group or view-only selector must not inherit global writes.
create or replace function club_selection_private.selector(c uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when not club_selection_private.scoped_selections(c) then club_selection_private.legacy_selector(c,u)
 else club_selection_private.member(c,u)
 and exists(select 1 from club_selection_private.selection_groups g where g.club_id=c)
 and not exists(select 1 from club_selection_private.selection_groups g where g.club_id=c and club_selection_private.selection_group_level(c,g.id,u)<2) end
$$;
create function club_selection_private.selection_viewer(c uuid,u uuid) returns boolean
language sql stable set search_path='' as $$
 select case when not club_selection_private.scoped_selections(c) then club_selection_private.legacy_selector(c,u)
 else exists(select 1 from club_selection_private.selection_groups g where g.club_id=c and club_selection_private.selection_group_level(c,g.id,u)>0) end
$$;
revoke all on function club_selection_private.selection_viewer(uuid,uuid) from public,anon,authenticated,service_role;
create function club_selection_private.selection_editor(c uuid,u uuid) returns boolean
language sql stable set search_path='' as $$
 select case when not club_selection_private.scoped_selections(c) then club_selection_private.legacy_selector(c,u)
 else exists(select 1 from club_selection_private.selection_groups g where g.club_id=c and club_selection_private.selection_group_level(c,g.id,u)=2) end
$$;
create function club_selection_private.selection_view(c uuid,d jsonb,u uuid) returns boolean
language sql stable set search_path='' as $$select club_selection_private.selection_group_level(c,club_selection_private.fixture_selection_group(c,d),u)>0$$;
create function club_selection_private.selection_edit(c uuid,d jsonb,u uuid) returns boolean
language sql stable set search_path='' as $$select club_selection_private.selection_group_level(c,club_selection_private.fixture_selection_group(c,d),u)=2$$;
create function club_selection_private.selection_group_publisher(c uuid,gid uuid) returns uuid
language sql stable set search_path='' as $$
 select case when not club_selection_private.scoped_selections(c) then club_selection_private.publication_head(c)
 when g.id is null then null
 when club_selection_private.selection_group_head(c,g.id)=a.head_selector_id and club_selection_private.delegation_active(a,now())
  and club_selection_private.selection_group_level(c,g.id,a.publication_delegate_id)=2 then a.publication_delegate_id
 when club_selection_private.member(c,club_selection_private.selection_group_head(c,g.id)) then club_selection_private.selection_group_head(c,g.id) end
 from club_selection_private.access a left join club_selection_private.selection_groups g on g.club_id=a.club_id and g.id=gid where a.club_id=c
$$;
create function club_selection_private.fixture_publisher(c uuid,d jsonb) returns uuid
language sql stable set search_path='' as $$select club_selection_private.selection_group_publisher(c,club_selection_private.fixture_selection_group(c,d))$$;
create function club_selection_private.fixture_captain(c uuid,d jsonb,u uuid) returns boolean
language sql stable set search_path='' as $$
 select club_selection_private.member(c,u) and (u=any(club_selection_private.season_captains(c,club_selection_private.fixture_group_id(c,d)))
 or (now()<club_selection_private.captain_expires(c,d) and u=any(club_selection_private.match_captain_users(c,d))))
$$;
create function club_selection_private.fixture_view(c uuid,d jsonb,u uuid) returns boolean
language sql stable set search_path='' as $$select club_selection_private.selection_view(c,d,u) or club_selection_private.fixture_captain(c,d,u)$$;
create function club_selection_private.fixture_ids_allowed(c uuid,rows jsonb,u uuid,mode text) returns boolean
language sql stable set search_path='' as $$
 select jsonb_typeof(rows)='array' and jsonb_array_length(rows)>0 and not exists(
 select 1 from jsonb_array_elements(rows) r left join club_selection_private.fixtures f on f.club_id=c and f.id=(r->>'id')::uuid
 where f.id is null or not coalesce(case mode when 'publish' then club_selection_private.fixture_publisher(c,f.details)=u when 'edit' then club_selection_private.selection_edit(c,f.details,u) else club_selection_private.fixture_view(c,f.details,u) end,false))
$$;
create function club_selection_private.result_editor(fid uuid,u uuid) returns boolean
language sql stable set search_path='' as $$
 select coalesce((select club_selection_private.selection_edit(f.club_id,f.details,u) or
  (u=auth.uid() and club_selection_private.fixture_completed(f.details,a.timezone) and
   (club_selection_private.fixture_captain(f.club_id,f.details,u) or club_batting_private.team_review_staff(f.club_id) or club_selection_private.social_allowed_at(f.club_id,u,now()) or public.is_club_admin(f.club_id)))
 from club_selection_private.fixtures f join club_selection_private.access a on a.club_id=f.club_id where f.id=fid),false)
$$;
create function club_selection_private.filter_result_cards(c uuid,cards jsonb,u uuid) returns jsonb
language sql stable set search_path='' as $$
 select case when not club_selection_private.scoped_selections(c) then cards else coalesce((select jsonb_agg(x) from jsonb_array_elements(cards) x
 where exists(select 1 from club_selection_private.fixtures f where f.club_id=c and f.id::text=x->>'fixture_id' and club_selection_private.fixture_view(c,f.details,u))
 or (nullif(x->>'fixture_id','') is null and club_selection_private.selection_view(c,jsonb_build_object('grade',coalesce(x->>'grade_hint',x#>>'{scorecard,grade}')),u))),'[]') end
$$;
create function club_selection_private.selection_permissions_context(c uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('revision',concat(coalesce(s.revision,0),':',a.revision,':',coalesce(t.revision,0)),
 'enabled',s.club_id is not null,'club_head_id',a.head_selector_id,
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'head_id',club_selection_private.selection_group_head(c,g.id),
  'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'access',case club_selection_private.selection_group_level(c,g.id,m.user_id) when 2 then 'edit' when 1 then 'view' else 'none' end) order by m.user_id)
   from public.club_memberships m where m.club_id=c and club_selection_private.selection_group_level(c,g.id,m.user_id)>0),'[]')) order by g.name,g.id) from club_selection_private.selection_groups g where g.club_id=c),'[]'),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.display_name,'Club member')) order by p.display_name,m.user_id) from public.club_memberships m left join public.user_profiles p on p.user_id=m.user_id where m.club_id=c),'[]'),
 'invites',coalesce((select jsonb_agg(to_jsonb(i)-'token_hash'-'previous_head'-'created_by'-'accepted_by' order by i.created_at desc) from club_selection_private.selection_group_invites i where i.club_id=c and i.status='pending' and i.expires_at>now()),'[]'),
 'unassigned_grades',(select count(*) from public.playing_groups g where g.club_id=c and g.active and not exists(select 1 from club_selection_private.selection_group_grades m where m.club_id=c and m.grade_id=g.id)))
 from club_selection_private.access a left join club_selection_private.selection_access_settings s on s.club_id=a.club_id left join club_selection_private.team_settings t on t.club_id=a.club_id where a.club_id=c
$$;

-- Seed other groups from the existing permissions exactly once; saving one group
-- must not silently remove access to the rest of the club.
create function club_selection_private.enable_scoped_selections(c uuid) returns void
language plpgsql set search_path='' as $$
begin
 if club_selection_private.scoped_selections(c) then return;end if;
 if not exists(select 1 from club_selection_private.selection_groups where club_id=c) then raise exception 'Create a Selection Group first';end if;
 if not exists(select 1 from club_selection_private.access where club_id=c and club_selection_private.member(c,head_selector_id)) then raise exception 'Assign the club Head of Selections first';end if;
 if exists(select 1 from public.playing_groups g where g.club_id=c and g.active and not exists(select 1 from club_selection_private.selection_group_grades m where m.grade_id=g.id and m.club_id=c)) then raise exception 'Assign existing grades to Selection Groups first';end if;
 insert into club_selection_private.selection_group_access(club_id,selection_group_id,user_id,access)
 select c,g.id,m.user_id,'edit' from club_selection_private.selection_groups g join public.club_memberships m on m.club_id=g.club_id where g.club_id=c and club_selection_private.legacy_selector(c,m.user_id);
 insert into club_selection_private.selection_access_settings(club_id) values(c);
end $$;

create function public.selection_group_permissions(p_club_id uuid,p_action text default 'context',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare c uuid:=p_club_id;me uuid:=auth.uid();ctx jsonb;result jsonb;g uuid:=nullif(p_data->>'group_id','')::uuid;head uuid;row jsonb;rid uuid;rr club_selection_private.requests%rowtype;v_email text;token text;invite_id uuid;
begin
 if me is null or not club_selection_private.member(c,me) or not public.is_club_admin(c) or not club_selection_private.enabled(c) then raise exception 'Club Admin manages selection permissions';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>100000 then raise exception 'Invalid permissions request';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 ctx:=club_selection_private.selection_permissions_context(c);
 if p_action='context' then return ctx;end if;
 rid:=nullif(p_data->>'request_id','')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into rr from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if rr.action<>'group_permissions:'||p_action or rr.payload<>p_data-'token' then raise exception 'Request ID already used';end if;return rr.result;end if;
 if p_data->>'revision' is distinct from ctx->>'revision' then raise exception 'Permissions changed. Reload before saving';end if;
 if p_action='club_head' then
  head:=nullif(p_data->>'user_id','')::uuid;perform 1 from public.club_memberships where club_id=c and user_id=head for key share;if head is null or not found then raise exception 'Choose a current club member as Head of Selections';end if;
  update club_selection_private.access set head_selector_id=head,publication_delegate_id=null,publication_delegate_from=null,publication_delegate_until=null,revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
 elsif p_action in ('save_group','invite') then
  if not exists(select 1 from club_selection_private.selection_groups where id=g and club_id=c) then raise exception 'Choose a Selection Group';end if;
  perform club_selection_private.enable_scoped_selections(c);
  if p_action='save_group' then
   head:=nullif(p_data->>'head_id','')::uuid;perform 1 from public.club_memberships where club_id=c and user_id=head for key share;if head is null or not found then raise exception 'Appoint a Head Selector before handing over this group';end if;
   if jsonb_typeof(p_data->'members') is distinct from 'array' or jsonb_array_length(p_data->'members')>1000 then raise exception 'Invalid selector list';end if;
   if exists(select 1 from jsonb_array_elements(p_data->'members') x group by x->>'user_id' having count(*)>1) then raise exception 'Use one permission per selector';end if;
   delete from club_selection_private.selection_group_access where club_id=c and selection_group_id=g;
   for row in select value from jsonb_array_elements(p_data->'members') loop
    if not club_selection_private.member(c,(row->>'user_id')::uuid) or coalesce(row->>'access','') not in ('none','view','edit') then raise exception 'Choose current members and valid permissions';end if;
    if row->>'user_id'=head::text and row->>'access'<>'edit' then raise exception 'The Head Selector needs edit and publish rights. Appoint a replacement before removing them';end if;
    if row->>'access'<>'none' then insert into club_selection_private.selection_group_access values(c,g,(row->>'user_id')::uuid,row->>'access');end if;
   end loop;
   if head=(select head_selector_id from club_selection_private.access where club_id=c) then delete from club_selection_private.selection_group_heads where club_id=c and selection_group_id=g;
   else insert into club_selection_private.selection_group_heads values(c,g,head) on conflict(selection_group_id) do update set user_id=excluded.user_id;end if;
  else
   v_email:=lower(btrim(p_data->>'email'));token:=p_data->>'token';
   if v_email is null or v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 or length(btrim(coalesce(p_data->>'name',''))) not between 1 and 100 then raise exception 'Enter a name and email address';end if;
   if coalesce(token,'')!~'^[0-9a-f]{64}$' or coalesce(p_data->>'access','') not in ('view','edit') then raise exception 'Choose invitation permissions';end if;
   if coalesce((p_data->>'as_head')::boolean,false) and p_data->>'access'<>'edit' then raise exception 'A Head Selector needs edit and publish rights';end if;
   if exists(select 1 from public.club_memberships m join auth.users u on u.id=m.user_id where m.club_id=c and lower(u.email)=v_email) then raise exception 'That person is already a club member. Add them to this group directly';end if;
   update club_selection_private.selection_group_invites set status='revoked' where club_id=c and selection_group_id=g and lower(invited_email)=v_email and status='pending';
   insert into club_selection_private.selection_group_invites(club_id,selection_group_id,invited_name,invited_email,access,as_head,previous_head,token_hash,created_by)
   values(c,g,btrim(p_data->>'name'),v_email,p_data->>'access',coalesce((p_data->>'as_head')::boolean,false),club_selection_private.selection_group_head(c,g),extensions.digest(token,'sha256'),me) returning id into invite_id;
  end if;
 elsif p_action='revoke_invite' then
  update club_selection_private.selection_group_invites set status='revoked' where club_id=c and id=(p_data->>'invite_id')::uuid and status='pending';if not found then raise exception 'Invitation is no longer pending';end if;
 else raise exception 'Unknown permissions action';end if;
 update club_selection_private.selection_access_settings set revision=revision+1,updated_at=now() where club_id=c;
 result:=club_selection_private.selection_permissions_context(c)||jsonb_build_object('saved',true,'invite_id',invite_id);
 insert into club_selection_private.requests values(c,me,rid,'group_permissions:'||p_action,p_data-'token',result,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'group_permissions:'||p_action,p_data-'token');
 return result;
end $$;
revoke all on function public.selection_group_permissions(uuid,text,jsonb) from public,anon;
grant execute on function public.selection_group_permissions(uuid,text,jsonb) to authenticated;

create function public.selection_group_invitation(p_token text,p_action text default 'info') returns jsonb
language plpgsql security definer set search_path='' as $$
declare i club_selection_private.selection_group_invites%rowtype;me uuid:=auth.uid();email text;result jsonb;
begin
 if coalesce(p_token,'')!~'^[0-9a-f]{64}$' then raise exception 'Invitation unavailable';end if;
 select * into i from club_selection_private.selection_group_invites where token_hash=extensions.digest(p_token,'sha256');
 if i.id is null or i.status='revoked' or i.expires_at<=now() then raise exception 'Invitation expired or withdrawn. Ask Club Admin for a new link';end if;
 if p_action='info' then return jsonb_build_object('club_name',(select name from public.clubs where id=i.club_id),'group_name',(select name from club_selection_private.selection_groups where id=i.selection_group_id),'access',i.access,'as_head',i.as_head,'accepted',i.status='accepted');end if;
 if p_action<>'accept' or me is null then raise exception 'Sign in to accept this invitation';end if;
 perform pg_advisory_xact_lock(hashtextextended(i.club_id::text,9200));
 select * into i from club_selection_private.selection_group_invites where id=i.id for update;
 select lower(u.email) into email from auth.users u where u.id=me and u.email_confirmed_at is not null;
 if email is distinct from lower(i.invited_email) then raise exception 'Sign in with the verified email address this invitation was created for';end if;
 if i.status='accepted' then if i.accepted_by<>me then raise exception 'Invitation already accepted';end if;return jsonb_build_object('club_id',i.club_id,'saved',true);end if;
 if i.status<>'pending' or i.expires_at<=now() then raise exception 'Invitation is no longer active';end if;
 if not club_selection_private.enabled(i.club_id) then raise exception 'Club Selections is not active';end if;
 if i.as_head and club_selection_private.selection_group_head(i.club_id,i.selection_group_id) is distinct from i.previous_head then raise exception 'This group has a different Head Selector now. Ask Club Admin to review the invitation';end if;
 insert into public.user_profiles(user_id,display_name) values(me,i.invited_name) on conflict(user_id) do nothing;
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(i.club_id,me,'player','none') on conflict(club_id,user_id) do nothing;
 insert into club_selection_private.selection_group_access values(i.club_id,i.selection_group_id,me,i.access)
 on conflict(club_id,selection_group_id,user_id) do update set access=excluded.access;
 if i.as_head then insert into club_selection_private.selection_group_heads values(i.club_id,i.selection_group_id,me) on conflict(selection_group_id) do update set user_id=excluded.user_id;end if;
 update club_selection_private.selection_group_invites set status='accepted',accepted_by=me,accepted_at=now() where id=i.id;
 update club_selection_private.selection_access_settings set revision=revision+1,updated_at=now() where club_id=i.club_id;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(i.club_id,me,'group_invite_accepted',jsonb_build_object('invite_id',i.id,'selection_group_id',i.selection_group_id,'access',i.access,'as_head',i.as_head));
 return jsonb_build_object('club_id',i.club_id,'saved',true);
end $$;
revoke all on function public.selection_group_invitation(text,text) from public;
grant execute on function public.selection_group_invitation(text,text) to anon,authenticated;

revoke all on function club_selection_private.scoped_selections(uuid),club_selection_private.legacy_selector(uuid,uuid),club_selection_private.selection_group_head(uuid,uuid),club_selection_private.selection_group_level(uuid,uuid,uuid),club_selection_private.selection_editor(uuid,uuid),club_selection_private.selection_view(uuid,jsonb,uuid),club_selection_private.selection_edit(uuid,jsonb,uuid),club_selection_private.fixture_publisher(uuid,jsonb),club_selection_private.fixture_captain(uuid,jsonb,uuid),club_selection_private.fixture_view(uuid,jsonb,uuid),club_selection_private.fixture_ids_allowed(uuid,jsonb,uuid,text),club_selection_private.selection_permissions_context(uuid),club_selection_private.enable_scoped_selections(uuid) from public,anon,authenticated,service_role;
revoke all on function club_selection_private.result_editor(uuid,uuid),club_selection_private.filter_result_cards(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function club_selection_private.selection_group_publisher(uuid,uuid) from public,anon,authenticated,service_role;

-- Match-day participants retain their separate rights when selector access is view-only.
create function club_selection_private.match_contributor(fid uuid,u uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from club_selection_private.fixtures m where m.id=fid and m.published is not null
 and club_selection_private.enabled(m.club_id) and club_selection_private.member(m.club_id,u) and (
 club_selection_private.selection_edit(m.club_id,m.details,u)
 or u=any(club_selection_private.season_captains(m.club_id,club_selection_private.fixture_group_id(m.club_id,m.published->'details')))
 or exists(select 1 from club_selection_private.temporary_captain_days(m.club_id,u) d where d.fixture_id=m.id)
 or (m.published#>'{details,staff}') ? u::text
 or exists(select 1 from club_selection_private.roster p,jsonb_array_elements(m.published->'slots') slot
 where p.club_id=m.club_id and p.active and p.user_id=u and (slot->>'d1'=p.id::text or slot->>'d2'=p.id::text))))
$$;
revoke all on function club_selection_private.match_contributor(uuid,uuid) from public,anon,authenticated,service_role;

-- A membership removal must not leave any group without its publishing Head.
create function club_selection_private.keep_group_head() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.club_id=old.club_id and new.user_id=old.user_id then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(old.club_id::text,9200));
 if club_selection_private.scoped_selections(old.club_id) and exists(select 1 from public.clubs where id=old.club_id)
 and exists(select 1 from club_selection_private.selection_groups g where g.club_id=old.club_id and club_selection_private.selection_group_head(old.club_id,g.id)=old.user_id) then
  raise exception 'Appoint replacement Head Selectors before removing this club member';
 end if;
 if tg_op='UPDATE' then return new;end if;return old;
end $$;
revoke all on function club_selection_private.keep_group_head() from public,anon,authenticated,service_role;
create trigger keep_selection_group_head before delete or update of club_id,user_id on public.club_memberships for each row execute function club_selection_private.keep_group_head();

create or replace function club_selection_private.sync_republication_alerts(c uuid) returns integer
language plpgsql set search_path='' as $$
declare f club_selection_private.fixtures%rowtype;a club_selection_private.access%rowtype;
 responsible uuid;existing club_selection_private.republication_alerts%rowtype;mid uuid;n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into a from club_selection_private.access where club_id=c;
 for f in select * from club_selection_private.fixtures where club_id=c and published is not null order by id loop
  responsible:=club_selection_private.fixture_publisher(c,f.details);
  select * into existing from club_selection_private.republication_alerts where fixture_id=f.id;
  if responsible is null or not club_selection_private.needs_republication(f)
    or (club_selection_private.fixture_completed(f.details,a.timezone) and coalesce(f.selection_unlocked_until,now())<=now()) then
   delete from club_selection_private.republication_alerts where fixture_id=f.id;continue;
  end if;
  if existing.publisher_id=responsible and existing.publication=f.publication then continue;end if;
  delete from club_selection_private.republication_alerts where fixture_id=f.id;
  insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
  values(c,null,gen_random_uuid(),'Team changes need republication',club_selection_private.publication_fixture_label(f.details)||E'\n\nA selector has saved changes to this published team. Open the Selection Board, review the changes and republish.','teams',true,'selection:'||f.id::text||':republication:'||gen_random_uuid()::text) returning id into mid;
  insert into club_selection_private.notifications(message_id,fixture_id,kind) values(mid,f.id,'republication');
  insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy) values(mid,responsible,false);
  insert into club_selection_private.republication_alerts values(f.id,responsible,f.publication,mid);n:=n+1;
 end loop;
 return n;
end $$;


-- Server guards for per-group selection visibility, editing and publication.

CREATE OR REPLACE FUNCTION club_selection_private.api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid();c uuid:=p_club_id;adm boolean;sel boolean;cap boolean;acc club_selection_private.access%rowtype;
 rr club_selection_private.requests%rowtype;rid uuid;res jsonb;row jsonb;x jsonb;s jsonb;v text;pid uuid;uid uuid;fid uuid;
 r club_selection_private.roster%rowtype;a club_selection_private.availability%rowtype;m club_selection_private.fixtures%rowtype;
 ids uuid[];old jsonb;notes jsonb;body text;changed int:=0;expected int;posted uuid;data_limit int;publication_changes jsonb:='[]'::jsonb;
begin
 if length(p_data::text)>1000000 then raise exception 'Request too large';end if;
 if me is null then raise exception 'Sign in to use Selections';end if;
 if p_action in ('access','set_access') then
  if not club_selection_private.member(c,me) and not public.has_platform_role(array['owner','commercial_admin','support_admin']) then raise exception 'Club access required';end if;
 else
  if not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 end if;
 if p_action not in ('access','context','posts','history','review_posts') then perform pg_advisory_xact_lock(hashtextextended(c::text,9200));end if;
 if p_action not in ('access','set_access') and not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 select * into acc from club_selection_private.access where club_id=c;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 sel:=club_selection_private.selection_viewer(c,me);cap:=club_selection_private.captain(c,me);
 if p_action not in ('access','set_access') and not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if p_action in ('save_board','publish','send_review','history') and not sel then raise exception 'Selector access required';end if;
 if p_action='publish' and not club_selection_private.scoped_selections(c) and club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
 if p_action in ('save_fixture','import_roster','save_roster','availability_batch','fixture_lock') and not (adm or sel) then raise exception 'Club Admin or selector access required';end if;
 if p_action in ('selectors','group_links','fixture_defaults') and not adm then raise exception 'Club Admin permission required';end if;
 if p_action not in ('access','context','posts','history','review_posts') then
  rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
  select * into rr from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
  if found then if rr.action<>p_action or rr.payload<>p_data then raise exception 'This request ID was already used for a different change';end if;return rr.result;end if;
 end if;
 -- Check stored fixtures before any selection change, including old browser versions.
 -- Club advisory lock above and ordered row locks serialize unlock/save races.
 if p_action in ('save_board','save_fixture','publish','send_review') then
  if p_action='save_board' then
   ids:=array(select nullif(value->>'id','')::uuid from jsonb_array_elements(coalesce(p_data->'fixtures','[]')));
  elsif p_action='save_fixture' then ids:=array[nullif(p_data->>'id','')::uuid];
  else ids:=array(select jsonb_array_elements_text(coalesce(p_data->'ids','[]'))::uuid);
  end if;
  for m in select f.* from club_selection_private.fixtures f where f.club_id=c and f.id=any(ids) order by f.id for update loop
   if club_selection_private.scoped_selections(c) and (not club_selection_private.selection_edit(c,m.details,me) or (p_action='publish' and club_selection_private.fixture_publisher(c,m.details) is distinct from me)) then raise exception 'This Selection Group requires its editor or publishing Head Selector';end if;
   perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);
   if m.published is not null and not coalesce(m.selection_unlocked_until>now(),false) then
    raise exception 'Published team is locked. The Head of Selections must unlock it before changes';
   end if;
  end loop;
 end if;
 -- Existing members are matched automatically when their Selections access/context loads.
 if p_action in ('access','context') and club_selection_private.member(c,me) and club_selection_private.enabled(c) then
  perform club_selection_private.sync_players(c,case when adm or sel then null else me end);
  if p_action='context' and (adm or sel) then perform club_selection_private.sync_republication_alerts(c);end if;
  select * into acc from club_selection_private.access where club_id=c;
 end if;
 if p_action='access' then return jsonb_build_object('enabled',club_selection_private.enabled(c),'mode',coalesce(acc.mode,'bundle'),'status',coalesce(acc.status,'disabled'),'valid_until',acc.valid_until,'timezone',coalesce(acc.timezone,'Australia/Sydney'),'revision',coalesce(acc.revision,0),'selector',sel,'admin',adm,'batting_participant',exists(select 1 from public.players bp where bp.club_id=c and bp.user_id=me and club_batting_private.player_uses_batting(c,bp.id)),'batting_captain',club_selection_private.batting_captain(c,me));end if;
 if p_action='set_access' then
  if not public.has_platform_role(array['owner','commercial_admin']) then raise exception 'Platform commercial permission required';end if;
  if coalesce(acc.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Access changed. Reload before saving';end if;
  if not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Active club required';end if;
  if not exists(select 1 from pg_timezone_names where name=coalesce(p_data->>'timezone','Australia/Sydney')) then raise exception 'Choose a valid time zone';end if;
  insert into club_selection_private.access(club_id,mode,status,valid_until,timezone,updated_by) values(c,p_data->>'mode',p_data->>'status',nullif(p_data->>'valid_until','')::date,coalesce(p_data->>'timezone','Australia/Sydney'),me)
  on conflict(club_id) do update set mode=excluded.mode,status=excluded.status,valid_until=excluded.valid_until,timezone=excluded.timezone,revision=club_selection_private.access.revision+1,updated_by=me,updated_at=now();
  res:=jsonb_build_object('saved',true);
 else
 if not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if p_action='context' then
  return jsonb_build_object('access',to_jsonb(acc),'selector',sel,'admin',adm,'captain',cap,'can_view_board',sel or cap,'roster_revision',acc.roster_revision,'availability_mode','opt_in','can_view_club_availability',adm or sel or cap,'head_selector',exists(select 1 from club_selection_private.selection_groups sg where sg.club_id=c and club_selection_private.selection_group_head(c,sg.id)=me) or (sel and club_selection_private.publication_head(c)=me),'selection_editor',club_selection_private.selection_editor(c,me),'group_permissions_enabled',club_selection_private.scoped_selections(c),
  'availability_dates',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('date',ds.match_date,'bulk_saved_at',ds.bulk_saved_at,'updated_at',ds.updated_at) order by ds.match_date desc) from club_selection_private.availability_date_setups ds where ds.club_id=c),'[]') else '[]'::jsonb end,
  'publication_head_id',club_selection_private.publication_head(c),
  'conversations',club_selection_private.conversation_context(c,me),
  'can_delegate',adm or acc.head_selector_id=me,
  'can_hand_back',adm or acc.head_selector_id=me or acc.publication_delegate_id=me,
  'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'snapshot',club_selection_private.draft_snapshot(f.id)||jsonb_build_object('draft_revision',f.revision),'sent_at',coalesce(f.review_requested_at,f.updated_at),
   'draft_changed',false,
   'captain_name',club_selection_private.match_captain_names(c,f.details)) order by f.review->'details'->'days'->0->>'date',f.review->'details'->>'grade')
   from club_selection_private.fixtures f where f.club_id=c and club_selection_private.review_audience(f.id,me)),'[]'::jsonb),
  'group_links',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(to_jsonb(g)) from club_selection_private.group_links g where club_id=c),'[]') else '[]'::jsonb end,
  'groups',case when (adm or sel) then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'captain_user_ids',club_selection_private.season_captains(c,g.id),'captain_roster_ids',club_selection_private.season_captain_roster_ids(c,g.id),'captain_name',club_selection_private.season_captain_name(c,g.id))) from public.playing_groups g where club_id=c and active),'[]') else '[]'::jsonb end,
  'batting_users',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(p.user_id) from public.players p where club_id=c and active),'[]') else '[]'::jsonb end,
  'roster',coalesce((select jsonb_agg((case when adm or sel then to_jsonb(p) when p.user_id=me then to_jsonb(p)-'account_email'-'auto_link_disabled' else jsonb_build_object('id',p.id,'name',p.name,'grade',p.grade,'active',p.active,'user_id',null,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'keeper',p.keeper) end)||jsonb_build_object('availability',coalesce(to_jsonb(av)-'checked_by',jsonb_build_object('revision',0,'usual_available',false,'blocks','[]'::jsonb,'available_dates','[]'::jsonb)))) from club_selection_private.roster p left join club_selection_private.availability av on av.roster_id=p.id where p.club_id=c and (adm or sel or cap or p.user_id=me)),'[]'::jsonb),
  'members',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'name',coalesce(up.display_name,'Club member'),'email',u.email,'selector',club_selection_private.selection_viewer(c,cm.user_id),'is_admin',cm.permission_role='admin','explicit_selector',exists(select 1 from club_selection_private.selectors sx where sx.club_id=c and sx.user_id=cm.user_id))) from public.club_memberships cm left join public.user_profiles up on up.user_id=cm.user_id left join auth.users u on u.id=cm.user_id where cm.club_id=c),'[]') else '[]'::jsonb end,
  'fixtures',coalesce((select jsonb_agg((case when club_selection_private.selection_view(c,f.details,me) then to_jsonb(f)||jsonb_build_object('can_comment',club_selection_private.review_audience(f.id,me),'comment_count',(select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id),'issues',club_selection_private.issues(f.id),'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp())) else jsonb_build_object('id',f.id,'published',f.published,'publication',f.publication,'published_at',f.published_at,'can_comment',club_selection_private.review_audience(f.id,me),'comment_count',case when club_selection_private.review_audience(f.id,me) then (select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id) else 0 end,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp()))||case when (not club_selection_private.scoped_selections(c) and (adm or cap)) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('details',f.details,'revision',f.revision,'selection_unlocked_until',f.selection_unlocked_until) else '{}'::jsonb end||case when (not club_selection_private.scoped_selections(c) and cap) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('slots',f.slots,'scorecard_sync',f.scorecard_sync) else '{}'::jsonb end end)||jsonb_build_object('can_edit',club_selection_private.selection_edit(c,f.details,me),'can_publish',club_selection_private.fixture_publisher(c,f.details)=me,'can_unlock',case when club_selection_private.scoped_selections(c) then club_selection_private.fixture_publisher(c,f.details)=me else acc.head_selector_id=me or club_selection_private.publication_head(c)=me end,'can_post_match',club_selection_private.match_contributor(f.id,me),'can_post_comment',club_selection_private.selection_edit(c,f.details,me) or club_selection_private.fixture_captain(c,f.details,me),'group_head_id',club_selection_private.fixture_publisher(c,f.details)) order by f.details->'days'->0->>'date',f.details->>'grade') from club_selection_private.fixtures f where f.club_id=c and ((not club_selection_private.scoped_selections(c) and (adm or sel or cap)) or club_selection_private.fixture_view(c,f.details,me) or f.published is not null)),'[]'::jsonb));
 elsif p_action in ('posts','post','history') then
  fid:=(p_data->>'id')::uuid;select * into m from club_selection_private.fixtures where id=fid and club_id=c;
  if not found or not club_selection_private.audience(fid,me) then raise exception 'This match conversation is only for its current team and staff';end if;
  if p_action='history' then
   if not club_selection_private.selection_view(c,m.details,me) then raise exception 'View access to this Selection Group is required';end if;
   return coalesce((select jsonb_agg(to_jsonb(p) order by version desc) from club_selection_private.publications p where fixture_id=fid),'[]');
  end if;
  if p_action='posts' then return coalesce((select jsonb_agg(to_jsonb(p) order by created_at) from club_selection_private.posts p where fixture_id=fid),'[]');end if;
  if club_selection_private.fixture_completed(m.published->'details',acc.timezone,clock_timestamp()) then
   raise exception 'This match conversation is closed. The final playing day has ended.';
  end if;
  if not club_selection_private.match_contributor(fid,me) then raise exception 'View-only selectors can read this conversation but cannot post';end if;
  insert into club_selection_private.posts(fixture_id,author_id,author_name,body) values(fid,me,coalesce((select display_name from public.user_profiles where user_id=me),'Club member'),btrim(p_data->>'body')) returning id into posted;
  changed:=club_selection_private.notify(fid,'post');res:=jsonb_build_object('id',posted,'recipients',changed);
 elsif p_action in ('review_posts','review_post') then
  fid:=(p_data->>'id')::uuid;select * into m from club_selection_private.fixtures where id=fid and club_id=c;
  if not found or not club_selection_private.review_audience(fid,me) then raise exception 'Team comments are private to assigned captains and selectors';end if;
  if p_action='review_posts' then return coalesce((select jsonb_agg(to_jsonb(p) order by created_at,id) from club_selection_private.review_posts p where fixture_id=fid),'[]');end if;
  if not (club_selection_private.selection_edit(c,m.details,me) or club_selection_private.fixture_captain(c,m.details,me)) then raise exception 'View-only selectors can read comments but cannot post';end if;
  if m.revision<>coalesce((p_data->>'review_revision')::int,-1) then raise exception 'The team changed. Refresh before commenting';end if;
  if length(btrim(coalesce(p_data->>'body',''))) not between 1 and 1500 then raise exception 'Write a comment of up to 1500 characters';end if;
   insert into club_selection_private.review_posts(fixture_id,author_id,author_name,body,review_revision)
   values(fid,me,coalesce((select display_name from public.user_profiles where user_id=me),'Club member'),btrim(p_data->>'body'),m.revision) returning id into posted;
  changed:=club_selection_private.notify_review(fid,false);res:=jsonb_build_object('saved',true,'id',posted,'recipients',changed);
 elsif p_action='publication_delegate' then
  if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Selection responsibilities changed. Refresh before saving';end if;
  if p_data->>'operation'='hand_back' then
   if not coalesce(adm or acc.head_selector_id=me or acc.publication_delegate_id=me,false) then raise exception 'Only the Head of Selections, their delegate or Club Admin can hand back';end if;
   update club_selection_private.access set publication_delegate_id=null,publication_delegate_from=null,publication_delegate_until=null,
    revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  elsif p_data->>'operation'='delegate' then
   if not coalesce(adm or acc.head_selector_id=me,false) then raise exception 'Only the Head of Selections or Club Admin can delegate publishing';end if;
   if acc.head_selector_id is null or not club_selection_private.member(c,acc.head_selector_id) then raise exception 'Assign a Head of Selections first';end if;
   uid:=nullif(p_data->>'user_id','')::uuid;
   if uid is null or uid=acc.head_selector_id or not club_selection_private.selection_editor(c,uid) then raise exception 'Choose another assigned selector from this club';end if;
   if coalesce(p_data->>'from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p_data->>'until','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (p_data->>'from')::date::text<>p_data->>'from' or (p_data->>'until')::date::text<>p_data->>'until'
    or (p_data->>'until')::date<(p_data->>'from')::date
    or (p_data->>'until')::date<(now() at time zone acc.timezone)::date then raise exception 'Choose a valid delegation period ending today or later';end if;
   update club_selection_private.access set publication_delegate_id=uid,publication_delegate_from=(p_data->>'from')::date,publication_delegate_until=(p_data->>'until')::date,
    revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  else raise exception 'Choose Delegate or Hand back';end if;
  res:=jsonb_build_object('saved',true,'operation',p_data->>'operation');
 elsif p_action='conversation' then
  fid:=nullif(p_data->>'fixture_id','')::uuid;pid:=nullif(p_data->>'roster_id','')::uuid;
  select item into x from jsonb_array_elements(club_selection_private.conversation_context(c,me)) item
   where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';
  if x is null then raise exception 'This selection conversation is no longer available to you';end if;
  if x->>'can_update'='false' then raise exception 'Edit access is required to update this selection conversation';end if;
  if (x->>'revision')::integer<>coalesce((p_data->>'revision')::integer,-1) then raise exception 'Conversation status changed. Refresh before updating';end if;
  if jsonb_typeof(p_data->'spoken') is distinct from 'boolean' then raise exception 'Choose whether the player has been spoken to';end if;
  if x->>'kind'='left_out' then
   select pc.fixture_id into uid from club_selection_private.player_conversations pc join club_selection_private.fixtures sf on sf.id=pc.fixture_id and sf.club_id=c where pc.roster_id=pid and pc.movement_key=x->>'movement_key' order by pc.revision desc,pc.fixture_id limit 1;
   fid:=coalesce(uid,fid);
  end if;
  insert into club_selection_private.player_conversations(fixture_id,roster_id,movement_key,spoken_at,spoken_by)
   values(fid,pid,x->>'movement_key',case when (p_data->>'spoken')::boolean then now() end,case when (p_data->>'spoken')::boolean then me end)
   on conflict(fixture_id,roster_id,movement_key) do update set spoken_at=excluded.spoken_at,spoken_by=excluded.spoken_by,revision=club_selection_private.player_conversations.revision+1;
  res:=jsonb_build_object('saved',true,'spoken',(p_data->>'spoken')::boolean);
 elsif p_action='grade_levels' then
  if not adm then raise exception 'Club Admin permission required';end if;
  if acc.revision<>coalesce((p_data->>'revision')::integer,-1) then raise exception 'Settings changed. Refresh before saving';end if;
  if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')>100 then raise exception 'Save up to 100 grade levels';end if;
  for x in select * from jsonb_array_elements(p_data->'rows') loop
   if length(btrim(coalesce(x->>'competition',''))) not between 1 and 120 or length(btrim(coalesce(x->>'grade',''))) not between 1 and 120
    or coalesce(x->>'level','')!~'^[1-9][0-9]?$' then raise exception 'Use a competition, grade and level from 1 to 99';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_data->'rows') x group by lower(btrim(x->>'competition')),lower(btrim(x->>'grade')) having count(*)>1) then raise exception 'Use one level per grade and competition';end if;
  update club_selection_private.access set grade_levels=p_data->'rows',revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  res:=jsonb_build_object('saved',true);
 elsif p_action='fixture_lock' then
  fid:=nullif(p_data->>'id','')::uuid;
  select * into m from club_selection_private.fixtures where club_id=c and id=fid for update;
  if not found then raise exception 'Unknown fixture';end if;
  if m.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture changed. Reload before changing its lock';end if;
  if jsonb_typeof(p_data->'unlock') is distinct from 'boolean' then raise exception 'Choose whether to unlock or lock the fixture';end if;
  if club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,m.details,me) then raise exception 'Edit access to this Selection Group is required';end if;
  if m.published is not null and ((club_selection_private.scoped_selections(c) and club_selection_private.fixture_publisher(c,m.details) is distinct from me) or (not club_selection_private.scoped_selections(c) and me is distinct from acc.head_selector_id and me is distinct from club_selection_private.publication_head(c))) then
   raise exception 'Only the current Head of Selections or Acting Head can unlock a published team';end if;
  if (p_data->>'unlock')::boolean and m.published is null and not club_selection_private.fixture_completed(m.details,acc.timezone) then raise exception 'This fixture is still open';end if;
  update club_selection_private.fixtures
   set selection_unlocked_until=case when (p_data->>'unlock')::boolean then now()+interval '30 minutes' end,
       selection_unlocked_by=case when (p_data->>'unlock')::boolean then me end,
       revision=revision+1,updated_at=now(),updated_by=me
   where club_id=c and id=fid returning * into m;
  res:=jsonb_build_object('saved',true,'id',fid,'revision',m.revision,'selection_unlocked_until',m.selection_unlocked_until);
 elsif p_action='availability' then
  pid:=(p_data->>'id')::uuid;select * into r from club_selection_private.roster where id=pid and club_id=c and active;
  if not found or not (adm or club_selection_private.selection_editor(c,me) or coalesce(r.user_id=me,false)) then raise exception 'Edit only your own availability';end if;
  select * into a from club_selection_private.availability where roster_id=pid;
  if coalesce(a.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Availability changed. Reload before saving';end if;
  if p_data->>'calendar_mode' is distinct from 'opt_in' then raise exception 'Reload the updated app to mark available dates';end if;
  if coalesce((p_data->>'usual_available')::boolean,false) or coalesce(p_data->'blocks','[]'::jsonb)<>'[]'::jsonb then raise exception 'Mark individual available dates; automatic availability and blackouts are no longer used';end if;
  if jsonb_typeof(p_data->'available_dates') is distinct from 'array' or jsonb_array_length(p_data->'available_dates')>1500 then raise exception 'Invalid availability calendar';end if;
  for x in select * from jsonb_array_elements(p_data->'available_dates') loop
   v:=x#>>'{}';
   if jsonb_typeof(x)<>'string' or coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Invalid available date';end if;
  end loop;
  select coalesce(jsonb_agg(value order by value),'[]') into notes from (select distinct value from jsonb_array_elements_text(p_data->'available_dates')) dates;
  if p_data ? 'unavailable_dates' then
   if jsonb_typeof(p_data->'unavailable_dates') is distinct from 'array' or jsonb_array_length(p_data->'unavailable_dates')>1500 then raise exception 'Invalid unavailability calendar';end if;
   for x in select * from jsonb_array_elements(p_data->'unavailable_dates') loop
    v:=x#>>'{}';
    if jsonb_typeof(x)<>'string' or coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Invalid unavailable date';end if;
    if notes ? v then raise exception 'A date cannot be both available and unavailable';end if;
   end loop;
   select coalesce(jsonb_agg(value order by value),'[]') into old from (select distinct value from jsonb_array_elements_text(p_data->'unavailable_dates')) dates;
  else
   -- Older app versions still remember removed availability as unavailable.
   select coalesce(jsonb_agg(d order by d),'[]') into old from (
    select value d from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) where not notes ? value
    union select value from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where not notes ? value
   ) dates;
  end if;
  insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,unavailable_dates,checked_by) values(pid,false,'[]',notes,old,me)
  on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
  update club_selection_private.availability_date_setups ds set updated_at=now()
   where ds.club_id=c and ((coalesce(a.available_dates,'[]') ? ds.match_date::text) is distinct from (notes ? ds.match_date::text)
    or (coalesce(a.unavailable_dates,'[]') ? ds.match_date::text) is distinct from (old ? ds.match_date::text));
  -- One private selector alert per affected future fixture, including published lists.
  for fid in select unnest(club_selection_private.availability_affected(c,pid,a.available_dates,notes)) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'alert_recipients',changed);
 elsif p_action='availability_batch' then
  if not (adm or club_selection_private.selection_editor(c,me)) then raise exception 'Selector access required';end if;
  if not coalesce((p_data->>'make_all_available')::boolean,false) then raise exception 'Confirm Make all players available for this date';end if;
  v:=p_data->>'date';
  if coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Choose a valid date';end if;
  if acc.roster_revision<>coalesce((p_data->>'roster_revision')::int,-1) then raise exception 'Playing list changed. Reload before setting this date';end if;
  if jsonb_typeof(p_data->'unavailable_ids') is distinct from 'array' or jsonb_typeof(p_data->'revisions') is distinct from 'object' then raise exception 'Review the playing list before setting this date';end if;
  if jsonb_typeof(coalesce(p_data->'available_ids','[]')) is distinct from 'array' then raise exception 'Review the players being marked available';end if;
  if p_data ? 'reset_unavailable' and jsonb_typeof(p_data->'reset_unavailable') is distinct from 'boolean' then raise exception 'Choose whether to clear saved unavailability';end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'available_ids','[]')) p where p_data->'unavailable_ids' ? p.value) then raise exception 'A player cannot be both available and unavailable';end if;
  for uid in select jsonb_array_elements_text((p_data->'unavailable_ids')||coalesce(p_data->'available_ids','[]'))::uuid loop
   if uid is null or not exists(select 1 from club_selection_private.roster where id=uid and club_id=c and active) then raise exception 'Choose unavailable players from this club playing list';end if;
  end loop;
  ids:='{}';data_limit:=0;
  for r in select * from club_selection_private.roster where club_id=c and active order by id loop
   select * into a from club_selection_private.availability where roster_id=r.id;
   if coalesce(a.revision,0)<>coalesce((p_data->'revisions'->>r.id::text)::int,-1) then raise exception 'A player updated their calendar. Reload before setting this date';end if;
   select coalesce(jsonb_agg(d order by d),'[]') into old from (
    select value d from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) where value<>v
    union select v where (p_data->'unavailable_ids') ? r.id::text
     or (coalesce(a.unavailable_dates,'[]') ? v and not coalesce((p_data->>'reset_unavailable')::boolean,false)
         and not coalesce(p_data->'available_ids','[]') ? r.id::text)
   ) dates;
   select coalesce(jsonb_agg(d order by d),'[]') into notes from (
    select distinct value as d from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where value<>v
    union select v where not old ? v
   ) dates;
   ids:=ids||club_selection_private.availability_affected(c,r.id,a.available_dates,notes);
   insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,unavailable_dates,checked_by) values(r.id,false,'[]',notes,old,me)
   on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
   data_limit:=data_limit+1;
  end loop;
  if data_limit=0 then raise exception 'Add players before setting availability';end if;
  insert into club_selection_private.availability_date_setups(club_id,match_date,bulk_saved_at,updated_at) values(c,v::date,now(),now())
  on conflict(club_id,match_date) do update set bulk_saved_at=excluded.bulk_saved_at,updated_at=excluded.updated_at;
  for fid in select distinct unnest(ids) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'date',v,'players',data_limit,'saved_at',now(),'alert_recipients',changed);
 elsif p_action in ('import_roster','save_roster','save_board','publish','selectors','group_links','fixture_defaults','send_review','save_fixture') then
  if not (adm or sel) then raise exception 'Selector access required';end if;
  if p_action='fixture_defaults' then
   if not adm then raise exception 'Club Admin permission required';end if;
   if (acc.fixture_defaults->>'revision')::int<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture defaults changed. Reload before saving';end if;
   if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')>100 then raise exception 'Save up to 100 grade and format defaults';end if;
   notes:='[]';
   for x in select * from jsonb_array_elements(p_data->'rows') loop
    if length(btrim(coalesce(x->>'grade',''))) not between 1 and 120 or coalesce(x->>'format','') not in ('t20','limited_overs','long_form') then raise exception 'Choose a grade and format for each default';end if;
    if x->>'overs' is not null and (x->>'overs' !~ '^[0-9]{1,3}$' or (x->>'overs')::int not between 1 and 999) then raise exception 'Overs must be a whole number between 1 and 999';end if;
    uid:=nullif(x->>'grade_group_id','')::uuid;
    if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
    v:=case when uid is null then btrim(x->>'grade') else (select name from public.playing_groups where id=uid) end;
    if exists(select 1 from jsonb_array_elements(notes) n where lower(n->>'grade')=lower(v) and n->>'format'=x->>'format') then raise exception 'Use one default per grade and format';end if;
    notes:=notes||jsonb_build_array(jsonb_build_object('grade',v,'grade_group_id',uid,'format',x->>'format','overs',nullif(x->>'overs','')::int));
   end loop;
   update club_selection_private.access set fixture_defaults=jsonb_build_object('revision',(acc.fixture_defaults->>'revision')::int+1,'rows',notes),updated_by=me,updated_at=now() where club_id=c;
   perform club_selection_private.sync_default_fixture_overs(c,acc.fixture_defaults->'rows',notes,me);
   res:=jsonb_build_object('saved',true);
  elsif p_action='send_review' then
   ids:=array(select distinct jsonb_array_elements_text(p_data->'ids')::uuid);
   if coalesce(array_length(ids,1),0) not between 1 and 30 then raise exception 'Choose teams to send to captains';end if;
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;
    if not found then raise exception 'Unknown fixture';end if;
    if m.revision<>coalesce((p_data->'revisions'->>fid::text)::int,-1) then raise exception 'Draft changed. Reload before sending';end if;
    if not coalesce((m.details->>'cancelled')::boolean,false) then
     notes:=club_selection_private.issues(fid);
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code' in ('over_team','over_slots')) then
      raise exception 'Fit the team into 11 slots before sending to captains' using detail=notes::text;
     end if;
    end if;
    if cardinality(club_selection_private.match_captain_users(c,m.details)||club_selection_private.season_captains(c,club_selection_private.fixture_group_id(c,m.details)))=0 then raise exception 'The match captain needs a linked club account to receive a private check';end if;
    if club_selection_private.review_current(fid) then continue;end if;
    update club_selection_private.fixtures set review=club_selection_private.draft_snapshot(fid)||jsonb_build_object('draft_revision',m.revision),review_requested_at=now() where id=fid;
    changed:=changed+club_selection_private.notify_review(fid,true);
   end loop;
   res:=jsonb_build_object('sent',true,'recipients',changed);
  elsif p_action='group_links' then
   if not adm or acc.mode<>'bundle' then raise exception 'Club Admin and both products are required';end if;
   if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Settings changed. Reload before saving';end if;
   delete from club_selection_private.group_links where club_id=c;
   for x in select * from jsonb_array_elements(p_data->'links') loop
    if not exists(select 1 from public.playing_groups where id=(x->>'group_id')::uuid and club_id=c and active) then raise exception 'Choose an active Playing Group from this club';end if;
    if length(btrim(coalesce(x->>'grade','')))=0 then raise exception 'A grade is required';end if;
    insert into club_selection_private.group_links(club_id,competition,grade,group_id) values(c,coalesce(x->>'competition',''),btrim(x->>'grade'),(x->>'group_id')::uuid);
   end loop;
   update club_selection_private.access set revision=revision+1 where club_id=c;
   res:=jsonb_build_object('saved',true);
  elsif p_action='selectors' then
   if club_selection_private.scoped_selections(c) then raise exception 'Manage selectors separately for each Selection Group in the updated app';end if;
   if not adm then raise exception 'Club Admin permission required';end if;
   if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Settings changed. Reload before saving';end if;
   if p_data ? 'head_selector_id' then
    uid:=nullif(p_data->>'head_selector_id','')::uuid;
    if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose the Head of Selections from current club members';end if;
    update club_selection_private.access set head_selector_id=uid,
     publication_delegate_id=case when head_selector_id is distinct from uid then null else publication_delegate_id end,
     publication_delegate_from=case when head_selector_id is distinct from uid then null else publication_delegate_from end,
     publication_delegate_until=case when head_selector_id is distinct from uid then null else publication_delegate_until end where club_id=c;
   end if;
   delete from club_selection_private.selectors where club_id=c;
   for v in select jsonb_array_elements_text(p_data->'users') loop
    if not club_selection_private.member(c,v::uuid) then raise exception 'Choose current club members';end if;
    insert into club_selection_private.selectors values(c,v::uuid) on conflict do nothing;
   end loop;
   update club_selection_private.access set publication_delegate_id=null,publication_delegate_from=null,publication_delegate_until=null
    where club_id=c and publication_delegate_id is not null and not club_selection_private.selection_editor(c,publication_delegate_id);
   update club_selection_private.access set revision=revision+1 where club_id=c;res:=jsonb_build_object('saved',true);
  elsif p_action in ('import_roster','save_roster') then
   if not (adm or club_selection_private.selection_editor(c,me)) then raise exception 'View-only selectors cannot change the playing list';end if;
   if acc.roster_revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Playing list changed. Reload before saving';end if;
   if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows') not between 1 and 1000 then raise exception 'Choose 1 to 1000 playing-list rows';end if;
   ids:='{}';
   for row in select * from jsonb_array_elements(p_data->'rows') loop
    if p_action='import_roster' then
     pid:=club_selection_private.import_player(c,row);
    else
     pid:=coalesce(nullif(row->>'id','')::uuid,gen_random_uuid());uid:=nullif(row->>'user_id','')::uuid;
     select * into r from club_selection_private.roster where id=pid and club_id=c;
     -- Do not create or rename another entry to the same normalized player name.
     -- Existing legacy duplicates can still be edited/deactivated without a merge.
     if (r.id is null or club_selection_private.account_name_key(row->>'name')<>club_selection_private.account_name_key(r.name))
      and exists(select 1 from club_selection_private.roster other where other.club_id=c
       and other.id is distinct from r.id
       and club_selection_private.account_name_key(other.name)=club_selection_private.account_name_key(row->>'name')) then
      raise exception '% is already on the playing list. Edit the existing entry.',btrim(row->>'name');
     end if;
     if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Link only a verified club member';end if;
     if exists(select 1 from club_selection_private.roster where id=pid and club_id<>c) then raise exception 'Player belongs to another club';end if;
     insert into club_selection_private.roster(id,club_id,external_id,name,grade,batting,bowling,bowling_load,keeper,active,user_id)
     values(pid,c,nullif(btrim(row->>'external_id'),''),btrim(row->>'name'),coalesce(row->>'grade',''),coalesce(row->>'batting','unknown'),coalesce(row->>'bowling','unknown'),coalesce(row->>'bowling_load','unknown'),coalesce((row->>'keeper')::boolean,false),coalesce((row->>'active')::boolean,true),uid)
     on conflict(id) do update set external_id=excluded.external_id,name=excluded.name,grade=excluded.grade,batting=excluded.batting,bowling=excluded.bowling,bowling_load=excluded.bowling_load,keeper=excluded.keeper,active=excluded.active,user_id=excluded.user_id,updated_at=now();
     -- A deliberate unlink is never silently undone by automatic matching.
     update club_selection_private.roster set auto_link_disabled=case
      when r.user_id is not null and uid is null then true
      when uid is not null then false else auto_link_disabled end where id=pid;
    end if;
    if row ? 'account_email' then
     v:=nullif(lower(btrim(row->>'account_email')),'');
     -- Imports with missing email preserve previous account-matching details.
     if p_action='save_roster' or v is not null then
      update club_selection_private.roster set account_email=v where id=pid;
     end if;
    end if;
    if pid=any(ids) then raise exception 'Duplicate player in import or update';end if;ids:=array_append(ids,pid);changed:=changed+1;
   end loop;
   update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;
   res:=jsonb_build_object('saved',changed);
  elsif p_action='save_fixture' then
   if p_data ?| array['slots','published','review','fixtures'] then raise exception 'Fixture setup cannot change team selections';end if;
   fid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
   select * into m from club_selection_private.fixtures where id=fid;
   if found and m.club_id<>c then raise exception 'Fixture belongs to another club';end if;
   if coalesce(m.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture changed. Reload before saving';end if;
   if club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,p_data->'details',me) then raise exception 'Edit access to the target Selection Group is required';end if;
   perform club_selection_private.validate_details(p_data->'details');
   if (p_data->'details'->'match_roles') is distinct from (m.details->'match_roles') then raise exception 'A selector must change the match captain or keeper on the selection board';end if;
   uid:=nullif(p_data->'details'->>'captain_id','')::uuid;
   if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose a captain from this club';end if;
   uid:=nullif(p_data->'details'->>'grade_group_id','')::uuid;
   if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
   for v in select jsonb_array_elements_text(coalesce(p_data->'details'->'staff','[]')) loop
    if not club_selection_private.member(c,v::uuid) then raise exception 'Choose staff from this club';end if;
   end loop;
   -- Preserve existing picks, captain snapshots and publications byte for byte.
   -- A selector must resolve a format change that would invalidate existing picks.
   if m.id is not null and exists(select 1 from jsonb_array_elements(m.slots) slot where
    (jsonb_array_length(p_data->'details'->'days')=1 and nullif(slot->>'d2','') is not null)
    or (jsonb_array_length(p_data->'details'->'days')=2 and not coalesce((p_data->'details'->>'brackets')::boolean,false) and (slot->>'d1') is distinct from (slot->>'d2'))
   ) then raise exception 'A selector must adjust the Day 2 selections before this format change';end if;
   if m.id is null then
    insert into club_selection_private.fixtures(id,club_id,details,slots,updated_by)
    values(fid,c,p_data->'details',(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,11)),me);
   else
    update club_selection_private.fixtures set details=p_data->'details',revision=revision+1,updated_by=me,updated_at=now() where id=fid;
   end if;
   res:=jsonb_build_object('saved',true,'id',fid,'revision',(select revision from club_selection_private.fixtures where id=fid));
  elsif p_action='save_board' then
   if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or jsonb_array_length(p_data->'fixtures') not between 1 and 30 then raise exception 'Save 1 to 30 teams together';end if;
   ids:='{}';
   for row in select * from jsonb_array_elements(p_data->'fixtures') loop
    fid:=coalesce(nullif(row->>'id','')::uuid,gen_random_uuid());
    if fid=any(ids) then raise exception 'Duplicate fixture';end if;ids:=array_append(ids,fid);
    select * into m from club_selection_private.fixtures where id=fid;
    if found and m.club_id<>c then raise exception 'Fixture belongs to another club';end if;
    if coalesce(m.revision,0)<>coalesce((row->>'revision')::int,-1) then raise exception 'A team changed in another session. Reload before saving';end if;
    if not club_selection_private.selection_edit(c,row->'details',me) then raise exception 'Edit access to the target Selection Group is required';end if;
    perform club_selection_private.validate_details(row->'details');
    uid:=nullif(row->'details'->>'captain_id','')::uuid;
    if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose a captain from this club';end if;
    uid:=nullif(row->'details'->>'grade_group_id','')::uuid;
    if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
    for v in select jsonb_array_elements_text(coalesce(row->'details'->'staff','[]')) loop if not club_selection_private.member(c,v::uuid) then raise exception 'Choose staff from this club';end if;end loop;
    if jsonb_typeof(row->'slots') is distinct from 'array' or jsonb_array_length(row->'slots') not between 11 and 100 then raise exception 'Draft teams need 11 to 100 selection slots';end if;
    for s in select * from jsonb_array_elements(row->'slots') loop
     if jsonb_typeof(s) is distinct from 'object' then raise exception 'Invalid selection slot';end if;
     for v in select unnest(array[nullif(s->>'d1',''),nullif(s->>'d2','')]) loop
      if v is not null and not exists(select 1 from club_selection_private.roster where id=v::uuid and club_id=c and active) then raise exception 'Choose an active player from this club playing list';end if;
     end loop;
     if jsonb_array_length(row->'details'->'days')=1 and nullif(s->>'d2','') is not null then raise exception 'One-day fixtures have no Day 2 player';end if;
     if jsonb_array_length(row->'details'->'days')=2 and not coalesce((row->'details'->>'brackets')::boolean,false) and (s->>'d1') is distinct from (s->>'d2') then raise exception 'Enable bracketing for this grade before splitting a slot';end if;
    end loop;
    -- Keep existing drafts reviewable after a withdrawal; every new assignment requires a marked date.
    if not coalesce((row->'details'->>'cancelled')::boolean,false) then
     for x in select jsonb_build_object('day',day,'player',slot->>('d'||idx::text))
      from jsonb_array_elements(row->'details'->'days') with ordinality days(day,idx),jsonb_array_elements(row->'slots') slot
      where nullif(slot->>('d'||idx::text),'') is not null loop
      pid:=(x->>'player')::uuid;
      if club_selection_private.day_status(pid,x->'day')<>'available' and not exists(
       select 1 from jsonb_array_elements(m.details->'days') with ordinality days(day,idx),jsonb_array_elements(m.slots) slot
       where day->>'date'=x->'day'->>'date' and slot->>('d'||idx::text)=pid::text
      ) then raise exception 'Mark availability before selecting % on %',(select name from club_selection_private.roster where id=pid),x->'day'->>'date';end if;
     end loop;
    end if;
    if m.details ? 'match_roles' and not (row->'details' ? 'match_roles') then raise exception 'Reload the updated app before changing match appointments';end if;
    if row->'details' ? 'match_roles' then row:=jsonb_set(row,'{details}',club_selection_private.match_details(c,row->'details',row->'slots'));end if;
    insert into club_selection_private.fixtures(id,club_id,details,slots,updated_by) values(fid,c,row->'details',row->'slots',me)
    on conflict(id) do update set details=excluded.details,slots=excluded.slots,revision=club_selection_private.fixtures.revision+1,updated_by=me,updated_at=now();
   end loop;
   -- Check the final batch, so a confirmed transfer/swap can vacate the old place atomically.
   -- Compare actual dates, including Day 2, and normalized names for legacy duplicate records.
   for x in
    select jsonb_build_object('name',min(rp.name),'date',ad.day->>'date')
    from club_selection_private.fixtures fx
    cross join lateral jsonb_array_elements(fx.details->'days') with ordinality ad(day,n)
    cross join lateral jsonb_array_elements(fx.slots) ps(slot)
    join club_selection_private.roster rp on rp.club_id=c and rp.id=nullif(ps.slot->>('d'||ad.n::text),'')::uuid
    where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)
    group by club_selection_private.account_name_key(rp.name),ad.day->>'date'
    having count(*)>1 and bool_or(fx.id=any(ids))
   loop
    raise exception '% is already selected on %. Choose one place per player per date.',x->>'name',x->>'date';
   end loop;
   res:=jsonb_build_object('saved',true,'ids',ids,'revisions',(select jsonb_object_agg(f.id::text,f.revision) from club_selection_private.fixtures f where f.id=any(ids)));
  else
   if not club_selection_private.scoped_selections(c) and club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
   ids:=array(select distinct jsonb_array_elements_text(p_data->'ids')::uuid);
   if coalesce(array_length(ids,1),0) not between 1 and 30 then raise exception 'Choose teams to publish';end if;
   -- Check the final batch, so a confirmed transfer/swap can vacate the old place atomically.
   -- Compare actual dates, including Day 2, and normalized names for legacy duplicate records.
   for x in
    select jsonb_build_object('name',min(rp.name),'date',ad.day->>'date')
    from club_selection_private.fixtures fx
    cross join lateral jsonb_array_elements(fx.details->'days') with ordinality ad(day,n)
    cross join lateral jsonb_array_elements(fx.slots) ps(slot)
    join club_selection_private.roster rp on rp.club_id=c and rp.id=nullif(ps.slot->>('d'||ad.n::text),'')::uuid
    where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)
    group by club_selection_private.account_name_key(rp.name),ad.day->>'date'
    having count(*)>1 and bool_or(fx.id=any(ids))
   loop
    raise exception '% is already selected on %. Choose one place per player per date.',x->>'name',x->>'date';
   end loop;
   -- Every changed team is checked first. Cross-grade moves publish atomically.
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;
    if not found then raise exception 'Unknown fixture';end if;
    if m.revision<>coalesce((p_data->'revisions'->>fid::text)::int,-1) then raise exception 'Draft changed. Review the latest team before publishing';end if;
    if not coalesce((m.details->>'cancelled')::boolean,false) then
     notes:=club_selection_private.issues(fid);
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='error') then raise exception 'Fix selection or availability issues before publishing' using detail=notes::text;end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='short_team')
      and not coalesce(p_data->'acknowledge_short' ? fid::text,false) then raise exception 'Confirm publishing this team with vacant places';end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='warning' and n->>'code' is distinct from 'short_team') and not coalesce((p_data->>'acknowledge_balance')::boolean,false) then raise exception 'Review and acknowledge the balance warnings before publishing';end if;
     if exists(select 1 from club_selection_private.fixtures other,jsonb_array_elements(other.published->'details'->'days') with ordinality od(day,j),jsonb_array_elements(other.published->'slots') os,jsonb_array_elements(m.details->'days') with ordinality md(day,j),jsonb_array_elements(m.slots) ms
       where other.club_id=c and other.id<>all(ids) and not coalesce((other.published->'details'->>'cancelled')::boolean,false) and md.day->>'date'=od.day->>'date' and nullif(ms->>('d'||md.j::text),'')=os->>('d'||od.j::text)
       and (coalesce(md.day->>'start','')='' or coalesce(od.day->>'start','')='' or coalesce(md.day->>'end','')='' or coalesce(od.day->>'end','')='' or ((md.day->>'start')<(od.day->>'end') and (md.day->>'end')>(od.day->>'start')))) then raise exception 'A player is still published in another team. Include both changed teams in this publication';end if;
    end if;
   end loop;
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;old:=m.published;
    res:=club_selection_private.draft_snapshot(fid);
    if res=old then continue;end if;
    update club_selection_private.fixtures set published=res,publication=publication+1,published_at=now(),selection_unlocked_until=null,selection_unlocked_by=null where id=fid;
    insert into club_selection_private.publications values(fid,m.publication+1,res,now(),me);
    publication_changes:=publication_changes||jsonb_build_array(jsonb_build_object('fixture_id',fid,'old_snapshot',old));
   end loop;
   changed:=changed+club_selection_private.notify_publication_batch(c,publication_changes);
   res:=jsonb_build_object('published',true,'recipients',changed,'groups',club_selection_private.sync_publication_groups(c,ids));
  end if;
 else raise exception 'Unknown Selections action';end if;
 end if;
 if p_action in ('save_board','save_fixture','fixture_defaults','publish','selectors','publication_delegate','fixture_lock') then
  changed:=club_selection_private.sync_republication_alerts(c);
  res:=res||jsonb_build_object('republication_alerts',changed);
 end if;
 insert into club_selection_private.requests values(c,me,rid,p_action,p_data,res,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,p_action,jsonb_build_object('request_id',rid,'result',res));
 return res;
end$function$;

CREATE OR REPLACE FUNCTION club_selection_private.review_audience(f uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from club_selection_private.fixtures m where m.id=f
 and club_selection_private.enabled(m.club_id) and club_selection_private.member(m.club_id,u)
 and (club_selection_private.selection_view(m.club_id,m.details,u) or u=any(club_selection_private.season_captains(m.club_id,club_selection_private.fixture_group_id(m.club_id,m.details))) or (now()<club_selection_private.captain_expires(m.club_id,m.details) and u=any(club_selection_private.match_captain_users(m.club_id,m.details)))))
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.audience(f uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from club_selection_private.fixtures m where m.id=f and m.published is not null and club_selection_private.enabled(m.club_id) and club_selection_private.member(m.club_id,u) and (
 club_selection_private.selection_view(m.club_id,m.details,u) or u=any(club_selection_private.season_captains(m.club_id,club_selection_private.fixture_group_id(m.club_id,m.published->'details'))) or exists(select 1 from club_selection_private.temporary_captain_days(m.club_id,u) d where d.fixture_id=m.id) or (m.published->'details'->'staff') ? u::text or exists(
 select 1 from club_selection_private.roster p,jsonb_array_elements(m.published->'slots') s where p.club_id=m.club_id and p.active and p.user_id=u and (s->>'d1'=p.id::text or s->>'d2'=p.id::text))))
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.conversation_context(c uuid, u uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
  'fixture_id',m.fixture_id,'roster_id',m.roster_id,'name',r.name,'previous_grade',m.previous_grade,'grade',m.grade,
  'competition',m.competition,'format',m.format,'date',m.start_date,'movement_key',m.movement_key,'kind',m.kind,'availability',m.availability,
  'spoken_at',s.spoken_at,'spoken_by',case when s.spoken_at is not null then coalesce(up.display_name,'Club staff') end,
  'can_update',club_selection_private.selection_edit(c,f.details,u) or u=any(m.previous_captains) or exists(select 1 from public.club_memberships cm where cm.club_id=c and cm.user_id=u and cm.permission_role in ('coach','head_coach')),'revision',coalesce(s.revision,0)) order by m.start_date desc,m.grade,r.name),'[]'::jsonb)
 from club_selection_private.selection_followups(c) m
 join club_selection_private.fixtures f on f.id=m.fixture_id and f.club_id=c
 join club_selection_private.roster r on r.id=m.roster_id and r.club_id=c
 left join lateral (select pc.* from club_selection_private.player_conversations pc join club_selection_private.fixtures sf on sf.id=pc.fixture_id and sf.club_id=c where pc.roster_id=m.roster_id and pc.movement_key=m.movement_key and (pc.fixture_id=m.fixture_id or m.kind='left_out') order by pc.revision desc,pc.fixture_id limit 1) s on true
 left join public.user_profiles up on up.user_id=s.spoken_by
 where club_selection_private.enabled(c) and club_selection_private.member(c,u) and (
  club_selection_private.selection_view(c,f.details,u)
  or exists(select 1 from public.club_memberships cm where cm.club_id=c and cm.user_id=u and cm.permission_role in ('coach','head_coach'))
  or u=any(m.previous_captains))
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.week_context(c uuid, u uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare settings jsonb;sel boolean:=club_selection_private.selection_viewer(c,u);adm boolean;
begin
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role='admin');
 select to_jsonb(s)-'club_id' into settings from club_selection_private.week_settings s where club_id=c;
 return jsonb_build_object('settings',coalesce(settings,jsonb_build_object('reminders_enabled',false,'deadline_weekday',4,'deadline_time','18:00','acknowledgement_enabled',false,'revision',0)),
  'can_manage',adm or club_selection_private.publication_head(c)=u,
  'calendar_active',exists(select 1 from club_selection_private.calendar_subscriptions where club_id=c and user_id=u),
  'plans',case when sel then coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('can_publish',club_selection_private.fixture_ids_allowed(c,p.fixtures,u,'publish'),'can_dismiss',p.created_by=u or club_selection_private.fixture_ids_allowed(c,p.fixtures,u,'publish')) order by created_at desc) from club_selection_private.withdrawal_plans p
   where p.club_id=c and club_selection_private.fixture_ids_allowed(c,p.fixtures,u,'view') and p.state='proposed' and p.created_at>now()-interval '30 days'),'[]') else '[]'::jsonb end,
  'acknowledgements',coalesce((select jsonb_agg(jsonb_build_object('fixture_id',f.id,'roster_id',r.id,'publication',f.publication,'seen_at',a.seen_at,'linked',r.user_id is not null))
   from club_selection_private.fixtures f cross join jsonb_array_elements(coalesce(f.published->'players','[]')) p
   join club_selection_private.roster r on r.id::text=p->>'id' and r.club_id=c
   left join club_selection_private.team_acknowledgements a on a.fixture_id=f.id and a.user_id=r.user_id and a.publication=f.publication
   where f.club_id=c and f.published is not null and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
    and (r.user_id=u or club_selection_private.review_audience(f.id,u))),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.week_api(c uuid, action text, d jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid();sel boolean;adm boolean;settings club_selection_private.week_settings%rowtype;
 plan club_selection_private.withdrawal_plans%rowtype;f club_selection_private.fixtures%rowtype;a club_selection_private.availability%rowtype;
 rr club_selection_private.requests%rowtype;rid uuid;res jsonb;x jsonb;y jsonb;payload jsonb:='[]';tmp jsonb;pid uuid;token text;fid uuid;pub integer;
begin
 if me is null or not club_selection_private.member(c,me) or not club_selection_private.enabled(c) then raise exception 'Active club membership required';end if;
 if length(d::text)>1000000 then raise exception 'Request too large';end if;
 sel:=club_selection_private.selection_viewer(c,me);
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 if action='context' then return club_selection_private.week_context(c,me);end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 -- Tokens are returned once and never stored in request receipts.
 if action in('calendar_create','calendar_revoke') then
  if action='calendar_revoke' then delete from club_selection_private.calendar_subscriptions where club_id=c and user_id=me;return jsonb_build_object('saved',true);end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into club_selection_private.calendar_subscriptions(club_id,user_id,token_hash)
   values(c,me,extensions.digest(token,'sha256')) on conflict(club_id,user_id) do update set token_hash=excluded.token_hash,created_at=now();
  -- Populate only on explicit subscription; publication triggers keep it current.
  for fid in select id from club_selection_private.fixtures where club_id=c and published is not null loop perform club_selection_private.refresh_calendar_events(fid);end loop;
  return jsonb_build_object('token',token);
 end if;
 rid:=(d->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into rr from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if rr.action<>'week:'||action or rr.payload<>d then raise exception 'Request ID already used';end if;return rr.result;end if;
 if action='settings' then
  if not(adm or club_selection_private.publication_head(c)=me) then raise exception 'Club Admin or current Head of Selections required';end if;
  select * into settings from club_selection_private.week_settings where club_id=c;
  if coalesce(settings.revision,0)<>coalesce((d->>'revision')::integer,-1) then raise exception 'Settings changed. Reload before saving';end if;
  if jsonb_typeof(d->'reminders_enabled') is distinct from 'boolean' or jsonb_typeof(d->'acknowledgement_enabled') is distinct from 'boolean'
   or coalesce(d->>'deadline_time','')!~'^[0-2][0-9]:[0-5][0-9](:00)?$' then raise exception 'Choose the reminder and acknowledgement settings';end if;
  insert into club_selection_private.week_settings(club_id,reminders_enabled,deadline_weekday,deadline_time,acknowledgement_enabled)
   values(c,(d->>'reminders_enabled')::boolean,(d->>'deadline_weekday')::integer,(d->>'deadline_time')::time,(d->>'acknowledgement_enabled')::boolean)
   on conflict(club_id) do update set reminders_enabled=excluded.reminders_enabled,deadline_weekday=excluded.deadline_weekday,
    deadline_time=excluded.deadline_time,acknowledgement_enabled=excluded.acknowledgement_enabled,revision=club_selection_private.week_settings.revision+1,updated_at=now();
  res:=jsonb_build_object('saved',true);
 elsif action='acknowledge' then
  if not coalesce((select acknowledgement_enabled from club_selection_private.week_settings where club_id=c),false) then raise exception 'Team acknowledgements are not enabled';end if;
  fid:=(d->>'fixture_id')::uuid;pub:=(d->>'publication')::integer;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.published is null or f.publication is distinct from pub or coalesce((f.published->'details'->>'cancelled')::boolean,false) then raise exception 'The published team changed. Read the current team before acknowledging';end if;
  if not exists(select 1 from club_selection_private.roster r,jsonb_array_elements(f.published->'slots') s
   where r.club_id=c and r.user_id=me and r.active and (s->>'d1'=r.id::text or s->>'d2'=r.id::text)) then raise exception 'Acknowledge only your own published selection';end if;
  insert into club_selection_private.team_acknowledgements(fixture_id,user_id,publication) values(fid,me,pub) on conflict do nothing;
  res:=jsonb_build_object('saved',true);
 elsif action='plan_save' then
  if not sel then raise exception 'Selector access required';end if;
  if not club_selection_private.fixture_ids_allowed(c,d->'fixtures',me,'edit') then raise exception 'Edit access to every affected Selection Group is required';end if;
  perform club_selection_private.validate_withdrawal_plan(c,d->'fixtures',d->'withdrawn');
  insert into club_selection_private.withdrawal_plans(club_id,created_by,fixtures,withdrawn) values(c,me,d->'fixtures',d->'withdrawn') returning id into pid;
  perform club_selection_private.week_message(c,array(select distinct club_selection_private.fixture_publisher(c,fx.details) from club_selection_private.fixtures fx join jsonb_array_elements(d->'fixtures') x on x->>'id'=fx.id::text where fx.club_id=c),'Replacement proposal ready',
   'A selector has prepared changes after a withdrawal. Review the affected teams before applying and republishing.'
   ||E'\nhttps://clubbatting.com/app.html?club='||c||'&tab=teams&team_view=board&replacement='||pid,'withdrawal-plan:'||pid);
  res:=jsonb_build_object('saved',true,'id',pid);
 elsif action in('plan_apply','plan_dismiss') then
  if not sel then raise exception 'Selector access required';end if;
  select * into plan from club_selection_private.withdrawal_plans where club_id=c and id=(d->>'id')::uuid for update;
  if not found or plan.state<>'proposed' then raise exception 'This proposal is no longer awaiting review';end if;
  if not club_selection_private.fixture_ids_allowed(c,plan.fixtures,me,'edit') then raise exception 'Edit access to every affected Selection Group is required';end if;
  if action='plan_dismiss' then
   if plan.created_by<>me and not club_selection_private.fixture_ids_allowed(c,plan.fixtures,me,'publish') then raise exception 'Only the proposer or current Head can dismiss this proposal';end if;
   update club_selection_private.withdrawal_plans set state='dismissed',revision=revision+1 where id=plan.id;
   res:=jsonb_build_object('saved',true);
  else
   if not club_selection_private.fixture_ids_allowed(c,plan.fixtures,me,'publish') then raise exception 'Only the current Head of Selections or Acting Head can apply and unlock';end if;
   perform club_selection_private.validate_withdrawal_plan(c,plan.fixtures,plan.withdrawn);
   for x in select * from jsonb_array_elements(plan.fixtures) loop
    select * into f from club_selection_private.fixtures where club_id=c and id=(x->>'id')::uuid for update;
    if f.published is not null or club_selection_private.fixture_completed(f.details,(select timezone from club_selection_private.access where club_id=c)) then
     perform club_selection_private.api(c,'fixture_lock',jsonb_build_object('id',f.id,'revision',f.revision,'unlock',true,'request_id',gen_random_uuid()));
    end if;
    select revision into pub from club_selection_private.fixtures where id=f.id;
    payload:=payload||jsonb_build_array(x||jsonb_build_object('revision',pub));
   end loop;
   for x in select * from jsonb_array_elements(plan.withdrawn) loop
    pid:=(x->>'roster_id')::uuid;select * into a from club_selection_private.availability where roster_id=pid;
    select coalesce(jsonb_agg(v),'[]') into tmp from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) v where not x->'dates' ? v;
    select coalesce(jsonb_agg(distinct v),'[]') into y from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')||(x->'dates')) v;
    perform club_selection_private.api(c,'availability',jsonb_build_object('id',pid,'revision',coalesce(a.revision,0),'calendar_mode','opt_in',
     'available_dates',tmp,'unavailable_dates',y,'usual_available',false,'blocks','[]'::jsonb,'request_id',gen_random_uuid()));
   end loop;
   perform club_selection_private.api(c,'save_board',jsonb_build_object('fixtures',payload,'request_id',gen_random_uuid()));
   update club_selection_private.withdrawal_plans set state='applied',applied_by=me,applied_at=now(),revision=revision+1 where id=plan.id;
   res:=jsonb_build_object('saved',true,'fixture_ids',(select jsonb_agg(entry.value->>'id') from jsonb_array_elements(payload) entry(value)));
  end if;
 else raise exception 'Unknown club-week action';
 end if;
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,me,rid,'week:'||action,d,res);
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'week:'||action,jsonb_build_object('request_id',rid,'result',res));
 return res;
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.notify_availability(f uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid;mid uuid;u uuid;n int:=0;
begin
 select club_id into c from club_selection_private.fixtures where id=f;
 insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
 values(c,null,gen_random_uuid(),'Selected player availability changed','A selected player has changed their availability. Open Teams & availability to review the change.','teams',true,'selection:'||f::text||':availability:'||gen_random_uuid()::text) returning id into mid;
 insert into club_selection_private.notifications values(mid,f,'availability');
 for u in select cm.user_id from public.club_memberships cm where cm.club_id=c and (cm.permission_role='admin' or exists(select 1 from club_selection_private.fixtures fx where fx.id=f and club_selection_private.selection_view(c,fx.details,cm.user_id))) and cm.user_id<>auth.uid() loop
  insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy) values(mid,u,false);n:=n+1;
 end loop;
 return n;
end$function$;

CREATE OR REPLACE FUNCTION club_selection_private.season_stats_api(c uuid, action text DEFAULT 'context'::text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
 me uuid:=auth.uid(); adm boolean; timezone text; today date; starts date; ends date; base_year integer; shift integer;
 settings club_selection_private.season_stats_settings%rowtype; cards jsonb; fixtures jsonb; identities jsonb;
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id and cl.archived_at is null where m.club_id=c and m.user_id=me) then
  raise exception 'Current club membership is required';
 end if;
 adm:=public.is_club_admin(c);
 if not club_selection_private.enabled(c) or not (adm or club_selection_private.selection_viewer(c,me) or club_selection_private.captain(c,me)) then
  raise exception 'Current Teams selection or captain access is required';
 end if;
 if action not in ('context','set_season') or action is null then raise exception 'Unknown season stats action';end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>1500 then raise exception 'Invalid season stats request';end if;
 if action='set_season' then
  if not adm then raise exception 'Club Admin can change season dates';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,20500));
 end if;
 select * into settings from club_selection_private.season_stats_settings where club_id=c;
 if action='set_season' then
  if coalesce((data->>'expected_revision')::integer,-1)<>coalesce(settings.revision,0) then raise exception 'Season dates changed. Update totals before saving again';end if;
  if coalesce(data->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(data->>'end','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose both season dates';end if;
  starts:=(data->>'start')::date;ends:=(data->>'end')::date;
  if ends<starts or ends-starts>366 then raise exception 'Choose season dates in order, up to one year apart';end if;
  insert into club_selection_private.season_stats_settings(club_id,starts,ends,updated_by)
   values(c,starts,ends,me)
   on conflict(club_id) do update set starts=excluded.starts,ends=excluded.ends,revision=season_stats_settings.revision+1,updated_by=me,updated_at=now()
   returning * into settings;
 end if;
 select a.timezone into timezone from club_selection_private.access a where a.club_id=c;
 timezone:=coalesce(timezone,'Australia/Sydney');today:=(now() at time zone timezone)::date;
 if settings.club_id is not null then
  -- The saved season window repeats annually; the completed season remains visible
  -- through the off-season, until the next season's start date.
  shift:=greatest(0,extract(year from today)::integer-extract(year from settings.starts)::integer);
  if (settings.starts + make_interval(years=>shift))::date>today then shift:=greatest(0,shift-1);end if;
  starts:=(settings.starts + make_interval(years=>shift))::date;
  ends:=(settings.ends + make_interval(years=>shift))::date;
 else
  -- Defaults are visible and editable in-place; billing dates are never repurposed.
  base_year:=extract(year from today)::integer;
  if timezone ~ '^(Australia|Pacific)/' then
   if extract(month from today)<7 then base_year:=base_year-1;end if;
   starts:=make_date(base_year,7,1);ends:=make_date(base_year+1,6,30);
  else starts:=make_date(base_year,1,1);ends:=make_date(base_year,12,31);
  end if;
 end if;
 cards:=club_selection_private.filter_result_cards(c,club_selection_private.shared_result_cards(c,starts,ends),me);
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'grade',d->>'grade','competition',d->>'competition','format',d->>'format','opposition',d->>'opposition','days',d->'days',
  'cancelled',coalesce((d->>'cancelled')::boolean,false),'match_id',coalesce(l.source_match_id::text,f.scorecard_sync->>'match_id'),'no_play',l.no_play
 ) order by d->'days'->0->>'date',f.id),'[]') into fixtures
 from club_selection_private.fixtures f
 cross join lateral(select coalesce(f.published->'details',f.details) d) details
 left join club_selection_private.fixture_result_sources l on l.fixture_id=f.id and l.club_id=c
 where f.club_id=c and (not club_selection_private.scoped_selections(c) or club_selection_private.fixture_view(c,d,me)) and d->'days'->0->>'date' between starts::text and ends::text;

 -- Return only source identity mappings needed by these scorecards, never contact,
 -- availability, coaching, account or unpublished-selection details.
 with source_people as (
  select distinct person->>'player_id' source_id
  from jsonb_array_elements(cards) wrapped,
   lateral (select p person from jsonb_array_elements(wrapped#>'{scorecard,teams}') t,jsonb_array_elements(t->'players') p
    union all select p from jsonb_array_elements(wrapped#>'{scorecard,innings}') i,jsonb_array_elements(i->'batters') p
    union all select p from jsonb_array_elements(wrapped#>'{scorecard,innings}') i,jsonb_array_elements(i->'bowlers') p) people
  where person->>'player_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ), mapped as (
  select s.source_id,r.id direct_roster,pr.id player_id,pr.display_name player_name,
   r.name roster_name,bridge.ids bridge_ids,bridge.roster_id bridge_roster,bridge.name bridge_name
  from source_people s
  left join club_selection_private.scorecard_roster_links sr on sr.club_id=c and sr.source_player_id=s.source_id::uuid
  left join club_selection_private.roster r on r.club_id=c and r.id=sr.roster_id
  left join public.match_review_player_links pl on pl.club_id=c and pl.source_player_id=s.source_id::uuid
  left join public.players pr on pr.club_id=c and pr.id=pl.player_id
  left join lateral (
   select count(distinct rp.roster_id) ids,min(rp.roster_id::text) roster_id,min(br.name) name
   from club_batting_private.roster_players rp join club_selection_private.roster br on br.id=rp.roster_id and br.club_id=c
   where rp.club_id=c and rp.player_id=pr.id
  ) bridge on true
 )
 select coalesce(jsonb_agg(jsonb_build_object('source_id',source_id,'roster_id',coalesce(direct_roster::text,case when bridge_ids=1 then bridge_roster end),
  'player_id',player_id,'name',coalesce(roster_name,case when bridge_ids=1 then bridge_name end,player_name),
  'conflict',bridge_ids>1 or (direct_roster is not null and bridge_roster is not null and direct_roster::text<>bridge_roster))),'[]') into identities from mapped;

 return jsonb_build_object('season',jsonb_build_object('start',starts,'end',ends,'revision',coalesce(settings.revision,0),
  'label',case when extract(year from starts)=extract(year from ends) then to_char(starts,'YYYY') else to_char(starts,'YYYY')||'/'||to_char(ends,'YY') end),
  'today',today,'can_set_season',adm,'cards',cards,'fixtures',fixtures,'identities',identities);
end $function$;

-- A caller's access to one fixture must not expose a different group's scorecard.
-- Confirmed source links are authoritative. Unlinked imports fall back only to
-- a uniquely resolved club grade, never merely the same date and format.
create function club_selection_private.selection_scorecard_view(c uuid,card jsonb,u uuid) returns boolean
language sql stable set search_path='' as $$
 select case when not club_selection_private.scoped_selections(c) then true
 when exists(select 1 from club_selection_private.fixtures f left join club_selection_private.fixture_result_sources src on src.fixture_id=f.id and src.club_id=c
  where f.club_id=c and (src.source_match_id::text=card->>'match_id' or f.scorecard_sync->>'match_id'=card->>'match_id')) then
  exists(select 1 from club_selection_private.fixtures f left join club_selection_private.fixture_result_sources src on src.fixture_id=f.id and src.club_id=c
   where f.club_id=c and (src.source_match_id::text=card->>'match_id' or f.scorecard_sync->>'match_id'=card->>'match_id')
   and (club_selection_private.fixture_view(c,f.details,u) or club_selection_private.result_editor(f.id,u)))
 else club_selection_private.selection_view(c,jsonb_build_object('grade',card->>'grade'),u) end
$$;
revoke all on function club_selection_private.selection_scorecard_view(uuid,jsonb,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION club_selection_private.scorecard_team_api(c uuid, action text, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare card jsonb;sid uuid:=(data->>'snapshot_id')::uuid;fid uuid;tid text;plan jsonb;result jsonb;item jsonb;r jsonb;
 f club_selection_private.fixtures%rowtype;receipt club_selection_private.requests%rowtype;rid uuid;v_details jsonb;v_published jsonb;meta jsonb;
begin
 if auth.uid() is null or not club_selection_private.member(c,auth.uid()) or not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Current club membership is required';end if;
 if not (club_batting_private.team_review_staff(c) or club_selection_private.selection_viewer(c,auth.uid()) or club_selection_private.social_allowed_at(c,auth.uid(),now()) or public.is_club_admin(c)) then raise exception 'Coaching, selection or socials access is required';end if;
 if length(data::text)>100000 then raise exception 'Team request is too large';end if;
 if not club_selection_private.enabled(c) then return jsonb_build_object('enabled',false);end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 if action='apply' then
  rid:=(data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
  select * into receipt from club_selection_private.requests where club_id=c and user_id=auth.uid() and request_id=rid;
  if found then if receipt.action<>'playcricket_team' or receipt.payload<>data then raise exception 'Request ID already used';end if;return receipt.result;end if;
 end if;
 select scorecard into card from public.match_review_scorecards where id=sid and club_id=c;
 if card is null then raise exception 'Scorecard unavailable in this club';end if;
 if not (club_batting_private.team_review_staff(c) or club_selection_private.social_allowed_at(c,auth.uid(),now()) or public.is_club_admin(c) or club_selection_private.selection_scorecard_view(c,card,auth.uid())) then raise exception 'View access to this scorecard’s Selection Group is required';end if;
 if action='context' then
  return jsonb_build_object('enabled',true,'card',card,'our_team',club_batting_private.scorecard_club_team(c,card),
   'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',fx.id,'grade',fx.details->>'grade','opposition',fx.details->>'opposition','days',fx.details->'days','brackets',fx.details->'brackets','slots',fx.slots,'sync',fx.scorecard_sync) order by fx.details->>'grade',fx.id)
    from club_selection_private.fixtures fx where fx.club_id=c and (not club_selection_private.scoped_selections(c) or club_selection_private.fixture_view(c,fx.details,auth.uid()) or club_selection_private.result_editor(fx.id,auth.uid())) and not coalesce((fx.details->>'cancelled')::boolean,false)
    and (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(fx.details->'days') day)=card->'dates'),'[]'),
   'roster',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'external_id',r.external_id,'active',r.active,'identity_unlinked',r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id),'imported_stub',r.id=md5('playcricket-roster:'||c::text||lower(r.external_id))::uuid and r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id)) order by r.name,r.id) from club_selection_private.roster r where r.club_id=c),'[]'),
   'links',coalesce((select jsonb_agg(jsonb_build_object('source_id',links.source_player_id,'roster_id',links.roster_id)) from (
    select l.source_player_id,l.roster_id from club_selection_private.scorecard_roster_links l where l.club_id=c
    union all select l.source_player_id,rp.roster_id from public.match_review_player_links l join club_batting_private.roster_players rp on rp.club_id=c and rp.player_id=l.player_id
    where l.club_id=c and not exists(select 1 from club_selection_private.scorecard_roster_links saved where saved.club_id=c and saved.source_player_id=l.source_player_id)
   ) links),'[]'));
 end if;
 if action not in ('preview','apply') then raise exception 'Unknown team action';end if;
 fid:=(data->>'fixture_id')::uuid;tid:=data->>'team_id';
 plan:=club_selection_private.scorecard_team_plan(c,sid,tid,fid,data->'mapping');
 if club_selection_private.scoped_selections(c) and exists(select 1 from jsonb_array_elements(plan->'fixtures') x where not club_selection_private.result_editor((x->>'id')::uuid,auth.uid())) then raise exception 'Edit access to each affected Selection Group is required';end if;
 if action='preview' then return plan||jsonb_build_object('expected',md5(plan::text));end if;
 if data->>'expected' is distinct from md5(plan::text) then raise exception 'A team or player match changed. Review the updated changes before confirming';end if;
 for r in select * from jsonb_array_elements(plan->'new_players') loop
  insert into club_selection_private.roster(id,club_id,external_id,name) values((r->>'id')::uuid,c,r->>'external_id',r->>'name');
 end loop;
 if jsonb_array_length(plan->'new_players')>0 then update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;end if;
 for item in select * from jsonb_array_elements(plan->'fixtures') loop
  select * into f from club_selection_private.fixtures where id=(item->>'id')::uuid and club_id=c for update;
  meta:=(item->'sync')||jsonb_build_object('updated_at',now(),'updated_by',auth.uid());
  v_details:=club_selection_private.scorecard_team_details(c,item->'details',item->'slots');
  v_published:=f.published;
  if v_published is not null then
   v_published:=v_published||jsonb_build_object('details',club_selection_private.scorecard_team_details(c,item->'published_details',item->'published_slots'),'slots',item->'published_slots','scorecard_sync',meta,
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'keeper',p.keeper) order by p.id) from club_selection_private.roster p where p.club_id=c and exists(select 1 from jsonb_array_elements(item->'published_slots') s where s->>'d1'=p.id::text or s->>'d2'=p.id::text)),'[]'));
   insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) values(f.id,f.publication+1,v_published,auth.uid());
  end if;
  update club_selection_private.fixtures set details=v_details,slots=item->'slots',scorecard_sync=meta,published=v_published,
   publication=publication+case when v_published is null then 0 else 1 end,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=f.id;
  -- Existing manual review lists must not retain the displaced selection.
  update club_batting_private.fixture_review_rosters m set player_ids=coalesce((select array_agg(distinct rp.player_id) from club_batting_private.roster_players rp where rp.club_id=c and exists(select 1 from jsonb_array_elements(item->'slots') s where s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)),'{}'),
   captain_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(item->'slots') s where rp.club_id=c and rp.player_id=m.captain_player_id and (s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)) then m.captain_player_id end,
   keeper_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(item->'slots') s where rp.club_id=c and rp.player_id=m.keeper_player_id and (s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)) then m.keeper_player_id end,
   revision=revision+1,updated_at=now(),updated_by=auth.uid() where m.fixture_id=f.id and m.club_id=c;
 end loop;
 for r in select * from jsonb_array_elements(plan->'mapping') loop
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,(r->>'source_id')::uuid,(r->>'roster_id')::uuid,auth.uid())
   on conflict(club_id,source_player_id) do update set roster_id=excluded.roster_id,confirmed_by=excluded.confirmed_by,updated_at=now();
 end loop;
 result:=jsonb_build_object('saved',true,'fixture_id',fid,'affected',plan->'fixtures');
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'playcricket_team',plan);
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,auth.uid(),rid,'playcricket_team',data,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.match_results_api(c uuid, action text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare me uuid:=auth.uid();social boolean;coach boolean;selecting boolean;last_day date;first_day date;cards jsonb;card jsonb;choices jsonb;
 f club_selection_private.fixtures%rowtype;src club_selection_private.fixture_result_sources%rowtype;
 snapshot public.match_review_scorecards%rowtype;d jsonb;team text;match_id uuid;sid uuid;fid uuid;grade text;preview jsonb;
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id and cl.archived_at is null where m.club_id=c and m.user_id=me) then raise exception 'Current club membership is required';end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>5000 then raise exception 'Invalid results request';end if;
 social:=club_selection_private.social_allowed(c);coach:=club_batting_private.team_review_staff(c);selecting:=club_selection_private.enabled(c) and club_selection_private.selection_viewer(c,me);
 if not social and not coach and not selecting then raise exception 'Selection, coaching or socials access is required';end if;
 if action in ('fixture','fixture_access') then
  fid:=nullif(data->>'fixture_id','')::uuid;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null then raise exception 'Choose a fixture in this club';end if;
  selecting:=club_selection_private.selection_view(c,f.details,me);
  if not social and not selecting and not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
  if action='fixture_access' then return jsonb_build_object('allowed',true);end if;
  d:=coalesce(f.published->'details',f.details);
  first_day:=(d->'days'->0->>'date')::date;
  select max((day->>'date')::date) into last_day from jsonb_array_elements(d->'days') day;
  select * into src from club_selection_private.fixture_result_sources where fixture_id=fid and club_id=c;
  match_id:=coalesce(src.source_match_id,nullif(f.scorecard_sync->>'match_id','')::uuid);
  cards:=club_selection_private.shared_result_cards(c,first_day,last_day);
  return jsonb_build_object('can_review',coach and exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text),'playhq',(select jsonb_build_object('linked',true,'can_check',club_selection_private.selection_edit(c,f.details,me) or public.is_club_admin(c),'pending_change',l.pending_fixture is not null,'error',l.result_error,'checked_at',l.summary_checked_at) from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=fid),'week_end',last_day,'fixtures',jsonb_build_array(jsonb_build_object('id',f.id,'grade',d->>'grade','opposition',d->>'opposition','format',d->>'format','days',d->'days','cancelled',coalesce((d->>'cancelled')::boolean,false),'match_id',match_id,'no_play',src.no_play)),
   'cards',coalesce((select jsonb_agg(x) from jsonb_array_elements(cards) x where x#>>'{scorecard,dates,0}'=first_day::text and x#>>'{scorecard,format_key}'=d->>'format' and (nullif(x->>'fixture_id','') is null or x->>'fixture_id'=fid::text or x#>>'{scorecard,match_id}'=match_id::text) and (social or coach or club_selection_private.selection_scorecard_view(c,x->'scorecard',me))),'[]'));
 end if;
 if action='context' then
  if not social then raise exception 'Club socials access is required';end if;
  last_day:=(data->>'week_end')::date;if last_day is null then raise exception 'Choose a week';end if;first_day:=last_day-6;
  cards:=club_selection_private.shared_result_cards(c,first_day,last_day);
  return jsonb_build_object('week_end',last_day,'cards',cards,'fixtures',coalesce((
   select jsonb_agg(jsonb_build_object('id',f.id,'grade',d->>'grade','opposition',d->>'opposition','format',d->>'format','days',d->'days',
    'cancelled',coalesce((d->>'cancelled')::boolean,false),'match_id',coalesce(l.source_match_id::text,f.scorecard_sync->>'match_id'),'no_play',l.no_play) order by d->'days'->0->>'date',d->>'grade',f.id)
   from club_selection_private.fixtures f cross join lateral(select coalesce(f.published->'details',f.details) d) v
   left join club_selection_private.fixture_result_sources l on l.club_id=c and l.fixture_id=f.id
   where f.club_id=c and exists(select 1 from jsonb_array_elements(d->'days') day where day->>'date' between first_day::text and last_day::text)
  ),'[]'));
 elsif action='review' then
  if not coach then raise exception 'Current club coaching access is required';end if;
  first_day:=(data->>'match_date')::date;if first_day is null then raise exception 'Choose a match date';end if;
  fid:=nullif(data->>'fixture_id','')::uuid;
  if fid is not null then
   if not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
   select * into f from club_selection_private.fixtures where id=fid and club_id=c;
   select * into src from club_selection_private.fixture_result_sources where fixture_id=fid and club_id=c;
   match_id:=coalesce(src.source_match_id,nullif(f.scorecard_sync->>'match_id','')::uuid);grade:=f.details->>'grade';
  elsif nullif(data->>'group_id','') is not null then
   select g.name into grade from public.playing_groups g where g.club_id=c and g.id=(data->>'group_id')::uuid and g.active and g.batting_enabled;
   if grade is null then raise exception 'Choose a team that uses Club Batting';end if;
  end if;
  match_id:=coalesce(match_id,nullif(data->>'existing_match_id','')::uuid);
  cards:=club_selection_private.shared_result_cards(c,first_day,first_day);
  select coalesce(jsonb_agg(x),'[]') into choices from jsonb_array_elements(cards) x
   where x#>>'{scorecard,dates,0}'=first_day::text and (nullif(data->>'format_key','') is null or x#>>'{scorecard,format_key}'=data->>'format_key')
   and (nullif(x->>'fixture_id','') is null or exists(select 1 from club_selection_private.fixtures available where available.club_id=c and available.id=(x->>'fixture_id')::uuid and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,available.details))));
  sid:=nullif(data->>'snapshot_id','')::uuid;
  if sid is not null then
   select x into card from jsonb_array_elements(choices) x where x->>'snapshot_id'=sid::text;
   if card is null then raise exception 'Choose a scorecard for this match date and format';end if;
  elsif match_id is not null then
   select x into card from jsonb_array_elements(choices) x where x#>>'{scorecard,match_id}'=match_id::text;
  else
   select case when count(*)=1 then jsonb_agg(x)->0 end into card from jsonb_array_elements(choices) x
    where grade is not null and regexp_replace(lower(coalesce(x->>'grade_hint',x#>>'{scorecard,grade}')),'[^a-z0-9]','','g')=regexp_replace(lower(grade),'[^a-z0-9]','','g');
  end if;
  if card is not null then
   preview:=club_batting_private.get_match_review_scorecard(c,(card->>'snapshot_id')::uuid)||jsonb_build_object('our_team_id',card->'our_team');
  end if;
  return jsonb_build_object('preview',preview,'choices',coalesce((select jsonb_agg(jsonb_build_object('snapshot_id',x->'snapshot_id','grade',x#>'{scorecard,grade}','teams',x#>'{scorecard,teams}','match_id',x#>'{scorecard,match_id}')) from jsonb_array_elements(choices) x),'[]'));
 end if;
 if action not in ('link','identify','no_play') then raise exception 'Unknown results action';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,19900));
 fid:=nullif(data->>'fixture_id','')::uuid;
 if selecting and not social and not coach and fid is null then raise exception 'Choose a club fixture';end if;
 if fid is not null then
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null then raise exception 'Choose a fixture in this club';end if;
  selecting:=club_selection_private.selection_view(c,f.details,me);
  if not social and not selecting and not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
  if club_selection_private.scoped_selections(c) and not club_selection_private.result_editor(fid,me) then raise exception 'Edit access to this Selection Group is required';end if;
  select * into src from club_selection_private.fixture_result_sources where fixture_id=fid;
  d:=coalesce(f.published->'details',f.details);
 end if;
 if action='no_play' then
  if fid is null then raise exception 'Choose a club fixture';end if;
  if src.source_match_id is not null or f.scorecard_sync->>'match_id' is not null then raise exception 'A scorecard is already linked. Check the PlayCricket result';end if;
  if coalesce(data->>'reason','')='' then delete from club_selection_private.fixture_result_sources where fixture_id=fid and no_play is not null;
  else
   if data->>'reason' not in ('washed_out','bye','cancelled') then raise exception 'Choose why the match did not take place';end if;
   insert into club_selection_private.fixture_result_sources(fixture_id,club_id,no_play,updated_by) values(fid,c,data->>'reason',me)
    on conflict(fixture_id) do update set no_play=excluded.no_play,updated_by=me,updated_at=now();
  end if;
 else
  sid:=(data->>'snapshot_id')::uuid;
  select * into snapshot from public.match_review_scorecards where id=sid and club_id=c;
  if snapshot.id is null then raise exception 'Choose a scorecard imported for this club';end if;
  -- Use the latest version even if another volunteer refreshed during this request.
  select * into snapshot from public.match_review_scorecards where club_id=c and source_match_id=snapshot.source_match_id order by created_at desc,id desc limit 1;
  card:=snapshot.scorecard;team:=coalesce(nullif(data->>'team_id',''),(select t.team_id::text from club_selection_private.team_week_sources t where t.club_id=c and t.source_match_id=snapshot.source_match_id),club_batting_private.scorecard_club_team(c,card));
  if team is not null and not exists(select 1 from jsonb_array_elements(card->'teams') x where x->>'id'=team) then raise exception 'Choose our team from this scorecard';end if;
  if action='identify' and team is null then raise exception 'Choose our team';end if;
  if action='link' then
   if fid is null then raise exception 'Choose a club fixture';end if;
   if d->'days'->0->>'date' is distinct from card->'dates'->>0 or d->>'format' is distinct from card->>'format_key' then raise exception 'This scorecard has a different match date or format';end if;
   if src.source_match_id is not null and src.source_match_id<>snapshot.source_match_id and src.source_match_id is distinct from nullif(data->>'expected_match_id','')::uuid then raise exception 'The match link changed. Refresh results before replacing it';end if;
   if f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>snapshot.source_match_id::text then raise exception 'This team is confirmed against a different PlayCricket match';end if;
   insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(fid,c,snapshot.source_match_id,team::uuid,me)
    on conflict(fixture_id) do update set source_match_id=excluded.source_match_id,team_id=excluded.team_id,no_play=null,updated_by=me,updated_at=now();
  end if;
  if team is not null then
   if club_selection_private.scoped_selections(c) and exists(select 1 from club_selection_private.fixture_result_sources linked where linked.club_id=c and linked.source_match_id=snapshot.source_match_id and not club_selection_private.result_editor(linked.fixture_id,me)) then raise exception 'Edit access to each linked Selection Group is required';end if;
   insert into club_selection_private.team_week_sources(club_id,source_match_id,team_id,updated_by) values(c,snapshot.source_match_id,team::uuid,me)
    on conflict(club_id,source_match_id) do update set team_id=excluded.team_id,updated_by=me;
   update club_selection_private.fixture_result_sources set team_id=team::uuid,updated_by=me,updated_at=now() where club_id=c and source_match_id=snapshot.source_match_id;
  end if;
 end if;
 if action in ('link','identify') and fid is not null and team is not null then
  perform club_selection_private.link_selected_scorecard_players(c,snapshot.id,fid,team::uuid,me);
 end if;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'shared_result_'||action,jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',team,'reason',data->>'reason'));
 return jsonb_build_object('saved',true);
end $function$;

CREATE OR REPLACE FUNCTION public.club_selections_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if p_action='set_access' then raise exception 'Use the Selections subscription controls';end if;
 if p_action in ('subscription_context','preview_subscription','set_selection_pricing','save_subscription') then return club_selection_private.billing_api(p_club_id,p_action,p_data);end if;
 result:=club_selection_private.api(p_club_id,p_action,p_data);
 if p_action='context' and (coalesce((result->>'admin')::boolean,false) or coalesce((result->>'can_view_board')::boolean,false)) then
  result:=result||jsonb_build_object('selection_group_access',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'level',club_selection_private.selection_group_level(p_club_id,g.id,auth.uid()),'head_id',club_selection_private.selection_group_publisher(p_club_id,g.id),'can_view',club_selection_private.selection_group_level(p_club_id,g.id,auth.uid())>0 or exists(select 1 from club_selection_private.fixtures fx where fx.club_id=p_club_id and club_selection_private.fixture_selection_group(p_club_id,fx.details)=g.id and club_selection_private.fixture_captain(p_club_id,fx.details,auth.uid())))) from club_selection_private.selection_groups g where g.club_id=p_club_id),'[]'),'selection_setup',public.club_selection_groups(p_club_id,'context'),'fixtures',coalesce((select jsonb_agg(f||case when f->'details' is null and f->'published' is not null then jsonb_build_object('details',f#>'{published,details}','slots',f#>'{published,slots}','draft_visible',false) else jsonb_build_object('draft_visible',true) end||jsonb_build_object('selection_group_id',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->'details',f#>'{published,details}')))) from jsonb_array_elements(result->'fixtures') f),'[]'));
 end if;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.playhq_sync_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid();adm boolean;conn club_selection_private.playhq_connections%rowtype;
 preview club_selection_private.playhq_previews%rowtype;row jsonb;choice jsonb;d jsonb;f club_selection_private.fixtures%rowtype;
 sid uuid;fid uuid;gid uuid;group_name text;created jsonb:='[]';result jsonb;src jsonb;
begin
 if me is null or not club_selection_private.member(p_club_id,me) or not club_selection_private.enabled(p_club_id) then raise exception 'Current club access required';end if;
 adm:=exists(select 1 from public.club_memberships where club_id=p_club_id and user_id=me and permission_role='admin');
 if not adm and not club_selection_private.selection_viewer(p_club_id,me) then raise exception 'Club Admin or selector access required';end if;
 if octet_length(p_data::text)>100000 then raise exception 'Request too large';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text,9200));
 select * into conn from club_selection_private.playhq_connections where club_id=p_club_id for update;
 if p_action='status' then
  return jsonb_build_object('configured',conn.club_id is not null,'active_season_id',conn.active_season_id,
   'fixture_count',(select count(*) from club_selection_private.playhq_links where club_id=p_club_id and season_id=conn.active_season_id),
   'fixture_through',(select max(day->>'date') from club_selection_private.playhq_links l join club_selection_private.fixtures fx on fx.id=l.fixture_id cross join lateral jsonb_array_elements(fx.details->'days') day where l.club_id=p_club_id and l.season_id=conn.active_season_id),
   'last_checked_at',(select max(checked_at) from club_selection_private.playhq_jobs where club_id=p_club_id and kind='fixtures'),
   'fixture_reports',coalesce((select jsonb_agg(jsonb_build_object('grade',g.name,'deferred',j.last_result->'deferred','error',j.last_error)) from club_selection_private.playhq_jobs j
     join club_selection_private.playhq_grade_mappings m on m.club_id=j.club_id and m.source_grade_id=j.source_id and m.team_id=j.team_id and m.season_id=conn.active_season_id
     join public.playing_groups g on g.id=m.grade_id and g.club_id=p_club_id where j.club_id=p_club_id and j.kind='fixtures' and (j.last_error is not null or jsonb_array_length(coalesce(j.last_result->'deferred','[]'))>0)),'[]'),
   'admin',adm,'organisation_id',conn.organisation_id,'association_id',conn.association_id,'verified',conn.verified_at is not null,'polling_enabled',coalesce(conn.polling_enabled,false),'error',conn.last_error,'pending_changes',(select count(*) from club_selection_private.playhq_links where club_id=p_club_id and pending_fixture is not null));
 elsif p_action='configure' then
  if not adm then raise exception 'Club Admin must configure the API connection';end if;
  if length(btrim(coalesce(p_data->>'api_key',''))) not between 16 and 500 then raise exception 'Enter the club API key';end if;
  -- A fresh secret/version prevents an in-flight response using old credentials from committing.
  sid:=vault.create_secret(p_data->>'api_key');
  insert into club_selection_private.playhq_connections(club_id,organisation_id,association_id,secret_id,updated_by)
   values(p_club_id,(p_data->>'organisation_id')::uuid,(p_data->>'association_id')::uuid,sid,me)
   on conflict(club_id) do update set organisation_id=excluded.organisation_id,association_id=excluded.association_id,secret_id=excluded.secret_id,generation=gen_random_uuid(),verified_at=null,polling_enabled=false,last_error=null,updated_by=me,updated_at=now();
  if conn.secret_id is not null then delete from vault.secrets where id=conn.secret_id;end if;
  return jsonb_build_object('saved',true);
 elsif p_action='pause' then
  if not adm then raise exception 'Club Admin manages automatic fixture checks';end if;
  update club_selection_private.playhq_connections set polling_enabled=false where club_id=p_club_id;
  return jsonb_build_object('saved',true);
 elsif p_action='enable' then
  if not adm then raise exception 'Club Admin manages automatic fixture checks';end if;
  if conn.verified_at is null then raise exception 'Verify the PlayHQ connection first';end if;
  -- Activation remains a deliberate action after provider access and live coverage checks.
  update club_selection_private.playhq_connections set polling_enabled=true where club_id=p_club_id;
  return jsonb_build_object('saved',true);
 elsif p_action='fixture_status' then
  if not adm and not exists(select 1 from club_selection_private.fixtures fx where fx.club_id=p_club_id and fx.id=(p_data->>'fixture_id')::uuid and club_selection_private.fixture_view(p_club_id,fx.details,me)) then raise exception 'View access to this Selection Group is required';end if;
  select to_jsonb(l)-'club_id' into result from club_selection_private.playhq_links l where l.club_id=p_club_id and l.fixture_id=(p_data->>'fixture_id')::uuid;
  return coalesce(result,'{}');
 elsif p_action='import_all' then
  select * into preview from club_selection_private.playhq_previews where id=(p_data->>'preview_id')::uuid and club_id=p_club_id and generation=conn.generation and created_at>now()-interval '30 minutes';
  if preview.id is null then raise exception 'Season download expired. Check fixtures again';end if;
  if not adm and not exists(select 1 from club_selection_private.playhq_grade_mappings gm join club_selection_private.selection_group_grades sg on sg.club_id=gm.club_id and sg.grade_id=gm.grade_id where gm.club_id=p_club_id and gm.season_id=preview.season_id and gm.team_id=preview.team_id and club_selection_private.selection_group_level(p_club_id,sg.selection_group_id,me)=2) then raise exception 'Edit access to this Selection Group is required';end if;
  update club_selection_private.playhq_grade_mappings set source_grade_id=preview.grade_id where club_id=p_club_id and season_id=preview.season_id and team_id=preview.team_id and source_grade_id is distinct from preview.grade_id;
  insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id) values(p_club_id,'fixtures',preview.grade_id,preview.team_id) on conflict do nothing;
  result:=club_selection_private.playhq_import_all(p_club_id,preview.season_id,preview.grade_id,preview.team_id,preview.fixtures);
  update club_selection_private.playhq_jobs set last_result=result,checked_at=now(),last_error=null,due_at=now()+interval '4 hours' where club_id=p_club_id and kind='fixtures' and source_id=preview.grade_id and team_id=preview.team_id;
  return result;
 elsif p_action='import' then
  select * into preview from club_selection_private.playhq_previews where id=(p_data->>'preview_id')::uuid and club_id=p_club_id and generation=conn.generation and created_at>now()-interval '30 minutes';
  if preview.id is null then raise exception 'Preview expired. Load the fixtures again';end if;
  if jsonb_typeof(p_data->'choices') is distinct from 'array' or jsonb_array_length(p_data->'choices') not between 1 and 100 then raise exception 'Choose 1 to 100 fixtures';end if;
  gid:=(p_data->>'group_id')::uuid;
  select name into group_name from public.playing_groups where id=gid and club_id=p_club_id and active;
  if group_name is null then raise exception 'Choose an active club grade';end if;
  if club_selection_private.scoped_selections(p_club_id) and not club_selection_private.selection_edit(p_club_id,jsonb_build_object('grade_group_id',gid,'grade',group_name),me) then raise exception 'Edit access to this Selection Group is required';end if;
  for choice in select * from jsonb_array_elements(p_data->'choices') loop
   select value into row from jsonb_array_elements(preview.fixtures) where value->>'source_match_id'=choice->>'match_id';
   if row is null or coalesce((row->>'requires_review')::boolean,true) then raise exception 'Check this fixture before importing';end if;
   select fixture_id into fid from club_selection_private.playhq_links where club_id=p_club_id and match_id=(choice->>'match_id')::uuid and team_id=preview.team_id;
   if fid is not null then created:=created||jsonb_build_array(fid);continue;end if;
   fid:=coalesce(nullif(choice->>'fixture_id','')::uuid,gen_random_uuid());
   select * into f from club_selection_private.fixtures where id=fid;
   if f.id is not null then
    if f.club_id<>p_club_id or f.revision<>coalesce((choice->>'revision')::int,-1) then raise exception 'Fixture changed. Refresh before linking';end if;
    if f.details->>'grade_group_id' is distinct from gid::text or f.details->>'format' is distinct from row->>'format' or f.details->'days'->0->>'date' is distinct from row->'days'->0->>'date' then raise exception 'Existing fixture grade, format or date differs';end if;
    if exists(select 1 from club_selection_private.playhq_links where fixture_id=fid) then raise exception 'Fixture already linked to another match';end if;
   else
    d:=jsonb_build_object('grade',group_name,'grade_group_id',gid,'competition',coalesce(p_data->>'competition',''),'opposition',row->>'opposition','format',row->>'format','ground',coalesce(row->'days'->0->>'ground',''),'days',(select jsonb_agg(jsonb_build_object('date',x->>'date','start',x->>'time','ground',x->>'ground') order by ord) from jsonb_array_elements(row->'days') with ordinality a(x,ord)), 'brackets',false,'overs',null,'overs_source','default','min_quicks',3,'min_batters',5,'staff','[]'::jsonb,'meeting','','cancelled',coalesce((row->>'cancelled')::boolean,false));
    result:=club_selection_private.api(p_club_id,'save_fixture',jsonb_build_object('id',fid,'revision',0,'details',d,'request_id',gen_random_uuid()));
   end if;
   insert into club_selection_private.playhq_links(fixture_id,club_id,match_id,season_id,grade_id,team_id,source_fixture,pending_fixture) values(fid,p_club_id,(row->>'source_match_id')::uuid,preview.season_id,preview.grade_id,preview.team_id,
    case when f.id is null then row else row||jsonb_build_object('opposition',f.details->>'opposition','cancelled',coalesce((f.details->>'cancelled')::boolean,false),
     'days',(select jsonb_agg(x||jsonb_build_object('date',fd->>'date','time',fd->>'start','ground',coalesce(fd->>'ground',f.details->>'ground')) order by ord) from jsonb_array_elements(row->'days') with ordinality a(x,ord) cross join lateral (select f.details->'days'->(ord::int-1) fd) saved_day)) end,
    case when f.id is not null and (f.details->>'opposition' is distinct from row->>'opposition' or coalesce((f.details->>'cancelled')::boolean,false) is distinct from coalesce((row->>'cancelled')::boolean,false)
     or f.details->'days' is distinct from (select jsonb_agg(jsonb_build_object('date',x->>'date','start',x->>'time','ground',x->>'ground') order by ord) from jsonb_array_elements(row->'days') with ordinality a(x,ord))) then row end);
   insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id) values(p_club_id,'fixtures',preview.grade_id,preview.team_id) on conflict do nothing;
   insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at) values(p_club_id,'results',(row->>'source_match_id')::uuid,preview.team_id,greatest(now(),(row#>>'{days,0,start_at}')::timestamptz+interval '8 hours')) on conflict do nothing;
   created:=created||jsonb_build_array(fid);
  end loop;
  return jsonb_build_object('saved',true,'fixture_ids',created);
 end if;
 raise exception 'Unknown PlayHQ action';
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.playhq_fixture_review(c uuid, action text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare f club_selection_private.fixtures%rowtype;l club_selection_private.playhq_links%rowtype;
 d jsonb;token text;blocks jsonb:='[]';warnings jsonb:='[]';result jsonb;tz text;
begin
 -- Reuse current membership and selector/admin authorisation, without key access.
 perform public.playhq_sync_api(c,'status');
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>2000 then raise exception 'Invalid fixture review request';end if;
 if action='list' then
  return jsonb_build_object('changes',coalesce((select jsonb_agg(jsonb_build_object('fixture_id',l.fixture_id,'grade',f.details->>'grade','opposition',f.details->>'opposition','days',f.details->'days','result_error',l.result_error,'pending',l.pending_fixture is not null) order by f.details->'days'->0->>'date') from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c where l.club_id=c and (public.is_club_admin(c) or club_selection_private.fixture_view(c,f.details,auth.uid())) and (l.pending_fixture is not null or l.result_error is not null)),'[]'));
 end if;
 if action not in ('preview','apply') then raise exception 'Unknown fixture review action';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into f from club_selection_private.fixtures where club_id=c and id=(data->>'fixture_id')::uuid for update;
 select * into l from club_selection_private.playhq_links where club_id=c and fixture_id=f.id for update;
 if l.fixture_id is null then raise exception 'Choose a linked club fixture';end if;
 if not (public.is_club_admin(c) or club_selection_private.fixture_view(c,f.details,auth.uid())) then raise exception 'View access to this Selection Group is required';end if;
 if action='apply' and club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,f.details,auth.uid()) then raise exception 'Edit access to this Selection Group is required';end if;
 if action='apply' and data->>'token'=l.last_change_token then return jsonb_build_object('saved',true,'already_saved',true);end if;
 if l.pending_fixture is null then raise exception 'No fixture change is waiting';end if;
 token:=md5(l.pending_fixture::text||f.details::text||f.revision::text);
 d:=f.details||jsonb_build_object('opposition',l.pending_fixture->>'opposition','format',l.pending_fixture->>'format','ground',coalesce(l.pending_fixture#>>'{days,0,ground}',''),'cancelled',coalesce((l.pending_fixture->>'cancelled')::boolean,false),
  'days',(select jsonb_agg(jsonb_build_object('date',x->>'date','start',x->>'time','ground',x->>'ground') order by ord) from jsonb_array_elements(l.pending_fixture->'days') with ordinality a(x,ord)));
 if coalesce((l.pending_fixture->>'requires_review')::boolean,true) then blocks:=blocks||jsonb_build_array('PlayHQ returned an unsupported format or status. Check the fixture manually.');end if;
 if f.published is not null and not coalesce(f.selection_unlocked_until>now(),false) then blocks:=blocks||jsonb_build_array('The Head of Selections must unlock this published team first.');end if;
 select timezone into tz from club_selection_private.access where club_id=c;
 begin perform club_selection_private.assert_selection_open(f.details,tz,f.selection_unlocked_until);exception when others then blocks:=blocks||jsonb_build_array(sqlerrm);end;
 begin perform club_selection_private.validate_details(d);exception when others then blocks:=blocks||jsonb_build_array(sqlerrm);end;
 if f.published is not null then warnings:=warnings||jsonb_build_array('The Head of Selections must review and republish the changed arrangements.');end if;
 if f.details->'days' is distinct from d->'days' then warnings:=warnings||jsonb_build_array('Check availability against the updated playing dates before publishing.');end if;
 if action='preview' then return jsonb_build_object('fixture_id',f.id,'revision',f.revision,'token',token,'before',f.details,'after',d,'can_apply',jsonb_array_length(blocks)=0,'blockers',blocks,'warnings',warnings);end if;
 if token is distinct from data->>'token' or f.revision is distinct from (data->>'revision')::integer then raise exception 'Fixture or source changed. Review a fresh preview';end if;
 if jsonb_array_length(blocks)>0 then raise exception '%',blocks->>0;end if;
 -- Existing save guards protect linked match records, duplicate dates and bracketing.
 result:=club_selection_private.api(c,'save_fixture',jsonb_build_object('id',f.id,'revision',f.revision,'details',d,'request_id',gen_random_uuid()));
 update club_selection_private.playhq_links set source_fixture=pending_fixture,pending_fixture=null,last_change_token=token where fixture_id=f.id;
 update club_selection_private.playhq_jobs set due_at=greatest(now(),(l.pending_fixture#>>'{days,0,start_at}')::timestamptz+interval '8 hours') where club_id=c and kind='results' and source_id=l.match_id and team_id=l.team_id;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'playhq_fixture_change',jsonb_build_object('fixture_id',f.id,'before',f.details,'after',d));
 return result||jsonb_build_object('requires_republish',f.published is not null);
end $function$;


-- Calls and temporary chat use the same Selection Group boundaries as drafts.
alter table club_selection_private.selection_room_messages add column scope_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table club_selection_private.selection_video_calls add column scope_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table club_selection_private.selection_room_settings add column scope_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table club_selection_private.selection_room_settings drop constraint selection_room_settings_pkey;
alter table club_selection_private.selection_room_settings add primary key(club_id,scope_id);
create index selection_room_messages_scope on club_selection_private.selection_room_messages(club_id,scope_id,id);
create index selection_video_calls_scope on club_selection_private.selection_video_calls(club_id,scope_id,expires_at);

create function club_selection_private.selection_room_scope(c uuid,data jsonb) returns uuid
language plpgsql stable set search_path='' as $$
declare g uuid;
begin
 if not club_selection_private.scoped_selections(c) then return '00000000-0000-0000-0000-000000000000'::uuid;end if;
 g:=nullif(data->>'selection_group_id','')::uuid;
 if g is null or club_selection_private.selection_group_level(c,g,auth.uid())=0 then raise exception using errcode='42501',message='Choose a Selection Group you can view for this call';end if;
 return g;
end $$;
revoke all on function club_selection_private.selection_room_scope(uuid,jsonb) from public,anon,authenticated,service_role;

create function club_selection_private.selection_chat_window(p_club_id uuid,p_scope_id uuid) returns jsonb
language plpgsql set search_path='' as $$
declare latest club_selection_private.selection_video_calls%rowtype;
begin
 select * into latest from club_selection_private.selection_video_calls where club_id=p_club_id and scope_id=p_scope_id order by expires_at desc,created_at desc limit 1;
 return jsonb_build_object('key',case when latest.id is null then 'waiting:'||p_scope_id when latest.expires_at>now() then 'call:'||latest.id else 'after:'||latest.id end,
  'starts_at',case when latest.expires_at>now() then latest.created_at else latest.expires_at end);
end $$;
revoke all on function club_selection_private.selection_chat_window(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION club_selection_private.selection_room_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;room_scope uuid:=club_selection_private.selection_room_scope(c,p_data);me uuid:=auth.uid();balance jsonb;result jsonb;rid uuid;chat jsonb;
 entry club_selection_private.selection_video_entries%rowtype;call_row club_selection_private.selection_video_calls%rowtype;
 available bigint;cost integer;duration integer;planned integer;period uuid;
begin
 if me is null or not coalesce(club_selection_private.enabled(c),false) or not coalesce(club_selection_private.selection_viewer(c,me),false) then
  raise exception using errcode='42501',message='Selection Room is private to this club’s assigned selectors';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid Selection Room request';end if;
 if p_action='reserve_video' and p_data ? 'use_video' and jsonb_typeof(p_data->'use_video')<>'boolean' then raise exception 'Choose audio or video before starting the call';end if;
 -- Message resets share the admission lock: a post cannot straddle a new call.
 if p_action in ('context','post') then
  perform pg_advisory_xact_lock_shared(16700,16700);
  perform pg_advisory_xact_lock(hashtextextended(c::text,16701));
  chat:=club_selection_private.selection_chat_window(c,room_scope);
  if p_action='post' and p_data ? 'chat_session' and (p_data->>'chat_session') is distinct from (chat->>'key') then
   raise exception using errcode='P0230',message='That selection chat has ended. Write a new message';
  end if;
  perform club_selection_private.purge_selection_chat_messages(c);
  if p_action='post' then
   return club_selection_private.selection_room_api_before_credits(c,p_action,p_data)||jsonb_build_object('chat_session',chat->>'key');
  end if;
 end if;
 if p_action in ('access','context') then
  result:=club_selection_private.selection_room_api_before_credits(c,p_action,p_data);
  balance:=club_selection_private.video_credit_balance(c);
  select * into call_row from club_selection_private.selection_video_calls where club_id=c and scope_id=room_scope and expires_at>now() order by expires_at desc limit 1;
  return result||jsonb_build_object('video_enabled',(balance->>'enabled')::boolean,'video_credit',balance-'period_id','chat_session',chat->>'key',
   'active_call',case when call_row.id is not null then jsonb_build_object('mode',call_row.call_mode,'expires_at',call_row.expires_at) else null end);
 elsif p_action<>'reserve_video' or exists(select 1 from club_selection_private.selection_video_policy where club_id=c and enabled) then
  return club_selection_private.selection_room_api_before_credits(c,p_action,p_data);
 end if;
 -- Match the usage worker lock so settlement and admission cannot race.
 perform pg_advisory_xact_lock(16700,16700);
 balance:=club_selection_private.video_credit_balance(c);
 if not (balance->>'enabled')::boolean then raise exception 'Video is not enabled for this club';end if;
 rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Video request required';end if;
 select * into entry from club_selection_private.selection_video_entries where id=rid;
 if found then
  if entry.club_id<>c or entry.user_id<>me then raise exception 'Video request belongs to another session';end if;
  select * into call_row from club_selection_private.selection_video_calls where id=entry.call_id;
  if call_row.scope_id<>room_scope then raise exception using errcode='42501',message='This call belongs to another Selection Group';end if;
  if call_row.expires_at<=now() then raise exception 'This call has ended. Join a new call';end if;
 else
  available:=(balance->>'available_seconds')::bigint;period:=(balance->>'period_id')::uuid;
  if available<120 or period is null then raise exception 'Video time is used or held for recent calls. Club Admin can add time. Selection chat stays available';end if;
  select * into call_row from club_selection_private.selection_video_calls where club_id=c and scope_id=room_scope and expires_at>now()+interval '5 seconds' order by expires_at desc limit 1;
  if not found then
   -- Fit a four-person call into the remaining credit. The one-minute margin is returned after verification.
   planned:=least(4,available/120);duration:=least(5400,((available/(planned*60))-1)*60);
   insert into club_selection_private.selection_video_calls(club_id,expires_at,call_mode,scope_id)
    values(c,least(now()+make_interval(secs=>duration),(balance->>'renews_at')::timestamptz),case when p_data->>'use_video'='true' then 'video' else 'audio' end,room_scope) returning * into call_row;
  end if;
  cost:=least(91,ceil(extract(epoch from (call_row.expires_at-now()))/60)::integer+1);
  if cost*60>available then raise exception 'Remaining video time is reserved for this call. Club Admin can add time. Selection chat stays available';end if;
  insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes,credit_period_id,included_reserved_seconds)
   values(rid,call_row.id,c,me,cost,period,least(cost::bigint*60,greatest(0,(balance->>'included_remaining_seconds')::bigint-(balance->>'debt_seconds')::bigint))) returning * into entry;
 end if;
 return jsonb_build_object('room_name','cb-'||replace(call_row.id::text,'-',''),'expires_at',call_row.expires_at,'call_mode',call_row.call_mode,
  'entry_id',entry.id,'user_name',left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100));
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.selection_room_api_before_credits(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;room_scope uuid:=club_selection_private.selection_room_scope(c,p_data);me uuid:=auth.uid();cfg club_selection_private.selection_room_settings%rowtype;
 msg club_selection_private.selection_room_messages%rowtype;call_row club_selection_private.selection_video_calls%rowtype;
 entry club_selection_private.selection_video_entries%rowtype;policy club_selection_private.selection_video_policy%rowtype;
 rid uuid;body_text text;v text;posts jsonb;can_manage boolean;cursor_id bigint;oldest bigint;
 month_start timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 cost integer;club_used bigint;total_used bigint;
begin
 if me is null or not coalesce(club_selection_private.enabled(c),false)
  or not coalesce(club_selection_private.selection_viewer(c,me),false) then
  raise exception using errcode='42501',message='Selection Room is private to this club’s assigned selectors';
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid Selection Room request';end if;
 can_manage:=coalesce(club_selection_private.selection_group_publisher(c,room_scope)=me,false);
 select * into cfg from club_selection_private.selection_room_settings where club_id=c and scope_id=room_scope;
 select * into policy from club_selection_private.selection_video_policy where club_id=c;
 if p_action='access' then
  return jsonb_build_object('allowed',true,'video_enabled',coalesce(policy.enabled,false));
 elsif p_action='context' then
  if p_data ? 'after' and p_data ? 'before' then raise exception 'Choose one message cursor';end if;
  v:=coalesce(p_data->>'after',p_data->>'before');
  if v is not null then
   if v !~ '^[0-9]{1,18}$' then raise exception 'Invalid message cursor';end if;cursor_id:=v::bigint;
  end if;
  if p_data ? 'after' then
   select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('id',m.id::text) order by m.id),'[]') into posts from
    (select id,author_id,author_name,body,created_at from club_selection_private.selection_room_messages
     where club_id=c and scope_id=room_scope and id>cursor_id order by id limit 100) m;
  else
   select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('id',m.id::text) order by m.id),'[]'),min(m.id) into posts,oldest from
    (select id,author_id,author_name,body,created_at from club_selection_private.selection_room_messages
     where club_id=c and scope_id=room_scope and (cursor_id is null or id<cursor_id) order by id desc limit 100) m;
  end if;
  return jsonb_build_object('messages',posts,'can_post',club_selection_private.selection_group_level(c,room_scope,me)=2,'has_older',exists(select 1 from club_selection_private.selection_room_messages where club_id=c and scope_id=room_scope and id<oldest),
   'backup_url',coalesce(cfg.backup_url,''),'revision',coalesce(cfg.revision,0),'can_manage',can_manage,
   'video_enabled',coalesce(policy.enabled,false),'call_active',exists(select 1 from club_selection_private.selection_video_calls where club_id=c and scope_id=room_scope and expires_at>now()));
 elsif p_action='post' then
  if club_selection_private.selection_group_level(c,room_scope,me)<2 then raise exception using errcode='42501',message='View-only selectors can read this chat but cannot post';end if;
  body_text:=btrim(p_data->>'body');rid:=(p_data->>'request_id')::uuid;
  if rid is null or body_text is null or length(body_text) not between 1 and 1500 then raise exception 'Write a message of up to 1,500 characters';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,16701));
  select * into msg from club_selection_private.selection_room_messages where club_id=c and author_id=me and request_id=rid;
  if found then
   if msg.scope_id<>room_scope then raise exception using errcode='42501',message='This message belongs to another Selection Group';end if;
   if msg.body<>body_text then raise exception 'This message request was already used';end if;
  else
   insert into club_selection_private.selection_room_messages(club_id,author_id,author_name,body,request_id,scope_id)
    values(c,me,left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100),body_text,rid,room_scope) returning * into msg;
  end if;
  return jsonb_build_object('message',jsonb_build_object('id',msg.id::text,'author_id',msg.author_id,'author_name',msg.author_name,'body',msg.body,'created_at',msg.created_at));
 elsif p_action='save_backup' then
  if not can_manage then raise exception using errcode='42501',message='The Head of Selections can change the backup call';end if;
  v:=btrim(coalesce(p_data->>'url',''));
  if length(v)>2048 or (v<>'' and (v !~* '^https://(teams[.]microsoft[.]com|teams[.]live[.]com|teams[.]cloud[.]microsoft|meet[.]google[.]com|([a-z0-9-]+[.])*zoom[.]us|([a-z0-9-]+[.])*zoom[.]com)/.+'
   or v ~ '[[:space:]]' or position(chr(92) in v)>0)) then raise exception 'Paste a Teams, Google Meet or Zoom meeting link';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,16701));
  select * into cfg from club_selection_private.selection_room_settings where club_id=c and scope_id=room_scope;
  if coalesce(cfg.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'The backup call changed. Refresh it before saving';end if;
  insert into club_selection_private.selection_room_settings(club_id,backup_url,updated_by,scope_id) values(c,v,me,room_scope)
   on conflict(club_id,scope_id) do update set backup_url=excluded.backup_url,revision=club_selection_private.selection_room_settings.revision+1,updated_by=me,updated_at=now()
   returning * into cfg;
  return jsonb_build_object('backup_url',cfg.backup_url,'revision',cfg.revision,'saved',true);
 elsif p_action='reserve_video' then
  -- Reserve an upper bound before issuing a token. Retries reuse the same entry.
  -- Confirmed usage replaces expired reservations. Active holds retain the spending cap.
  if not coalesce(policy.enabled,false) then raise exception 'Video is not enabled for this club yet';end if;
  rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Video request required';end if;
  perform pg_advisory_xact_lock(16700,16700);
  select * into entry from club_selection_private.selection_video_entries where id=rid;
  if found then
   if entry.club_id<>c or entry.user_id<>me then raise exception 'Video request belongs to another session';end if;
   select * into call_row from club_selection_private.selection_video_calls where id=entry.call_id;
   if call_row.scope_id<>room_scope then raise exception using errcode='42501',message='This call belongs to another Selection Group';end if;
  if call_row.expires_at<=now() then raise exception 'This call has ended. Join a new call';end if;
  else
   select * into call_row from club_selection_private.selection_video_calls where club_id=c and scope_id=room_scope and expires_at>now()+interval '1 minute' order by expires_at desc limit 1;
   if not found then
    insert into club_selection_private.selection_video_calls(club_id,expires_at,call_mode,scope_id)
     values(c,least(now()+interval '90 minutes',month_start+interval '1 month'),case when p_data->>'use_video'='true' then 'video' else 'audio' end,room_scope) returning * into call_row;
   end if;
   cost:=least(91,ceil(extract(epoch from (call_row.expires_at-now()))/60)::integer+1);
   select coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)) filter(where club_id=c),0),coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)),0) into club_used,total_used
    from club_selection_private.selection_video_entries where created_at>=month_start and credit_period_id is null;
   if club_used+cost::bigint*60>policy.monthly_minutes::bigint*60 or total_used+cost::bigint*60>9000::bigint*60 then raise exception 'This month’s video allowance is used. Use the backup call';end if;
   insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes)
    values(rid,call_row.id,c,me,cost) returning * into entry;
  end if;
  return jsonb_build_object('room_name','cb-'||replace(call_row.id::text,'-',''),'expires_at',call_row.expires_at,'call_mode',call_row.call_mode,
   'entry_id',entry.id,'user_name',left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100));
 end if;
 raise exception 'Unknown Selection Room action';
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.purge_selection_chat_messages(p_club_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock_shared(16700,16700);
 delete from club_selection_private.selection_room_messages m using (
  select distinct on (club_id,scope_id) club_id,scope_id,case when expires_at>now() then created_at else expires_at end as cutoff
  from club_selection_private.selection_video_calls where p_club_id is null or club_id=p_club_id
  order by club_id,scope_id,expires_at desc,created_at desc
 ) latest where m.club_id=latest.club_id and m.scope_id=latest.scope_id and m.created_at<latest.cutoff;
end $function$;


-- Scoped read access must not rely on the legacy club-wide mutator predicate.
do $patch$
declare s text;old text:='club_selection_private.selector(c,me)';begin
 select pg_get_functiondef('public.club_selection_groups(uuid,text,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,old,''))<>length(old) then raise exception 'Unexpected group context authorization definition';end if;
 execute replace(s,old,'club_selection_private.selection_viewer(c,me)');
end $patch$;

-- Manual scorecard staging is permitted only for the editor's own group.
-- Canonical links outrank display names, and a shared snapshot spanning groups
-- requires edit access to each linked fixture. Other established staff roles retain access.
create function club_selection_private.selection_scorecard_edit(c uuid,card jsonb,u uuid) returns boolean
language sql stable set search_path='' as $$
 select case when not club_selection_private.scoped_selections(c) then club_selection_private.selector(c,u)
 when exists(select 1 from club_selection_private.fixtures f left join club_selection_private.fixture_result_sources src on src.fixture_id=f.id and src.club_id=c
  where f.club_id=c and (src.source_match_id::text=card->>'match_id' or f.scorecard_sync->>'match_id'=card->>'match_id')) then
  not exists(select 1 from club_selection_private.fixtures f left join club_selection_private.fixture_result_sources src on src.fixture_id=f.id and src.club_id=c
   where f.club_id=c and (src.source_match_id::text=card->>'match_id' or f.scorecard_sync->>'match_id'=card->>'match_id') and not club_selection_private.selection_edit(c,f.details,u))
 else club_selection_private.selection_edit(c,jsonb_build_object('grade',card->>'grade'),u) end
$$;
revoke all on function club_selection_private.selection_scorecard_edit(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
do $patch$
declare s text;old text:='club_selection_private.selector(p_club_id,p_actor_id)';begin
 select pg_get_functiondef('club_batting_private.stage_match_review_scorecard(uuid,uuid,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,old,''))<>length(old) then raise exception 'Unexpected scorecard staging authorization definition';end if;
 execute replace(s,old,'club_selection_private.selection_scorecard_edit(p_club_id,p_scorecard,p_actor_id)');
end $patch$;

-- Viewing shared call credit does not grant checkout; that branch still requires
-- Club Admin. Keep scoped selectors' publication summaries worded as staff updates.
do $patch$
declare s text;old text:='club_selection_private.selector(c,me)';begin
 select pg_get_functiondef('club_selection_private.video_credit_api(uuid,text,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,old,''))<>length(old) then raise exception 'Unexpected video-credit entry authorization definition';end if;
 execute replace(s,old,'club_selection_private.selection_viewer(c,me)');
 old:='club_selection_private.selector(p_club_id,cm.user_id)';
 select pg_get_functiondef('club_selection_private.notify_publication_batch(uuid,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,old,''))<>length(old) then raise exception 'Unexpected publication audience description';end if;
 execute replace(s,old,'club_selection_private.selection_viewer(p_club_id,cm.user_id)');
end $patch$;
