// Run with NODE_PATH pointing at the existing PGlite installation.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
(async()=>{
 const db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;
 create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table public.user_profiles(user_id uuid primary key,display_name text);
 create table public.clubs(id uuid primary key,name text,slug text,created_by uuid);
 create table public.club_memberships(club_id uuid,user_id uuid,role text,permission_role text,primary key(club_id,user_id));
 create table public.platform_admins(user_id uuid primary key,role text);
 create table public.platform_audit_events(actor_user_id uuid,club_id uuid,event_type text,details jsonb);
 create table public.club_batting_guide_threads(id uuid primary key default gen_random_uuid(),club_id uuid,user_id uuid,status text default 'open',human_handoff_reason text default '',created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.club_batting_guide_messages(id uuid primary key default gen_random_uuid(),thread_id uuid,role text,content text,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.is_club_member(c uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid())$$;
 create function public.has_platform_role(roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.platform_admins where user_id=auth.uid() and role=any(roles))$$;
 create function public.platform_get_guide_requests() returns jsonb language sql as $$select '[]'::jsonb$$;
 create function public.platform_close_guide_request(t uuid) returns void language sql as $$update public.club_batting_guide_threads set status='closed' where id=t$$;
 `);
 await db.exec(fs.readFileSync('Database/mirelion_assist.sql','utf8'));
 await db.exec(fs.readFileSync('Tests/mirelion_assist_database_test.sql','utf8'));
 console.log('Assist database: privacy, permissions, retries, unread cursors, status, history and legacy handoff assertions passed.');
 await db.close();
})().catch(e=>{console.error(e.message,e.detail||'',e.where||'');process.exitCode=1;});
