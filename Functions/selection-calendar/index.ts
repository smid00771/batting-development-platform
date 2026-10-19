import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { createCalendarHandler } from './calendar.mjs';
// Calendar apps cannot present a Supabase login. The revocable 256-bit URL token
// authenticates this one read-only feed; the service key stays inside the function.
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
 auth:{persistSession:false,autoRefreshToken:false}
});
Deno.serve(createCalendarHandler({feed:async(token:string)=>{
 const {data,error}=await client.rpc('selection_calendar_feed',{p_token:token});
 if(error)throw new Error('Calendar lookup failed');
 return data;
}}));
