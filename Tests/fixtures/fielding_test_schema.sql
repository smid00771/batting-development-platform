-- Minimal local schema; unrelated services use explicit stand-ins.

create schema auth;create schema club_selection_private;create schema club_batting_private;
create table auth.users(id uuid primary key,email text);
create table public.user_profiles(user_id uuid primary key,display_name text);
create table public.clubs(id uuid primary key,name text,slug text,created_by uuid,archived_at timestamptz);
create table public.club_memberships(club_id uuid,user_id uuid,role text,permission_role text,involvement text);
create table public.playing_groups(id uuid,club_id uuid,name text,active boolean,created_by uuid);
create table club_selection_private.access(club_id uuid primary key,mode text default 'bundle',status text default 'disabled',valid_until date,timezone text default 'Australia/Sydney',revision int default 1,roster_revision int default 0,updated_at timestamptz default now(),updated_by uuid,active_from date,fixture_defaults jsonb default '{}',head_selector_id uuid,publication_delegate_id uuid,publication_delegate_from date,publication_delegate_until date,grade_levels jsonb default '[]');
create table club_selection_private.roster(id uuid primary key,club_id uuid,external_id text,name text,grade text default '',batting text default 'unknown',bowling text default 'unknown',bowling_load text default 'unknown',keeper boolean default false,active boolean default true,user_id uuid,updated_at timestamptz default now(),account_email text,auto_link_disabled boolean default false);
create table club_selection_private.availability(roster_id uuid primary key,usual_available boolean default false,available_dates jsonb default '[]',blocks jsonb default '[]',revision int default 1,checked_at timestamptz default now(),checked_by uuid,unavailable_dates jsonb default '[]');
create table club_selection_private.fixtures(id uuid primary key,club_id uuid,details jsonb,slots jsonb default '[]',revision int default 1,published jsonb,publication int default 0,published_at timestamptz,updated_at timestamptz default now(),updated_by uuid,review jsonb,review_requested_at timestamptz,selection_unlocked_until timestamptz,selection_unlocked_by uuid);
create table club_selection_private.requests(club_id uuid,user_id uuid,request_id uuid,action text,payload jsonb,result jsonb,created_at timestamptz,primary key(club_id,user_id,request_id));
create table club_selection_private.audit(club_id uuid,actor_id uuid,action text,detail jsonb);
create table club_selection_private.publications(fixture_id uuid,version int,snapshot jsonb,created_at timestamptz,created_by uuid);
create table club_selection_private.group_links(club_id uuid,competition text,grade text,group_id uuid);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.has_platform_role(text[]) returns boolean language sql stable as $$select false$$;
create function club_selection_private.member(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=u)$$;
create function club_selection_private.selector(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from club_selection_private.access where club_id=c and head_selector_id=u)$$;
create function club_selection_private.captain(uuid,uuid) returns boolean language sql stable as $$select false$$;
create function club_selection_private.enabled(c uuid) returns boolean language sql stable as $$select exists(select 1 from club_selection_private.access where club_id=c and status='active')$$;
create function club_selection_private.publication_head(c uuid) returns uuid language sql stable as $$select head_selector_id from club_selection_private.access where club_id=c$$;
create function club_selection_private.assert_selection_open(jsonb,text,timestamptz) returns void language plpgsql as $$begin return;end$$;
create function club_selection_private.sync_republication_alerts(uuid) returns int language sql as $$select 0$$;
create function club_selection_private.account_name_key(text) returns text language sql immutable as $$select lower(btrim($1))$$;
create function club_selection_private.day_status(p uuid,d jsonb) returns text language sql stable as $$select case when exists(select 1 from club_selection_private.availability where roster_id=p and available_dates ? (d->>'date')) then 'available' else 'unavailable' end$$;
create function club_selection_private.match_captain_users(uuid,d jsonb) returns uuid[] language sql stable as $$select array[nullif(d->>'captain_id','')::uuid]$$;
create function club_selection_private.season_captains(uuid,uuid) returns uuid[] language sql stable as $$select '{}'::uuid[]$$;
create function club_selection_private.fixture_group_id(uuid,jsonb) returns uuid language sql stable as $$select null::uuid$$;
create function club_selection_private.notify_review(uuid,boolean) returns int language sql as $$select 0$$;
create function club_selection_private.notify_publication_batch(uuid,jsonb) returns int language sql as $$select 0$$;
create function club_selection_private.sync_publication_groups(uuid,uuid[]) returns jsonb language sql as $$select '{}'::jsonb$$;

create role anon; create role authenticated;
create function club_selection_private.selection_viewer(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role in ('selector','viewer','admin'))$$;
create function club_selection_private.selection_editor(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role in ('selector','admin'))$$;
create function club_selection_private.scoped_selections(uuid) returns boolean language sql stable as $$select true$$;
create function club_selection_private.import_player(c uuid,r jsonb) returns uuid language plpgsql as $$begin update club_selection_private.roster set name=r->>'name' where club_id=c and id=(r->>'id')::uuid; return (r->>'id')::uuid;end$$;
