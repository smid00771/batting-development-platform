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
