import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
const params=new URLSearchParams(location.search),code=params.get('code'),state=params.get('state'),error=params.get('error'),deletion=params.get('deletion');
history.replaceState(null,'',location.pathname);
const status=document.getElementById('status'),form=document.getElementById('pages'),choices=document.getElementById('choices');
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
async function call(action,body){const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Sign in to Club Batting in the main window, then start Connect accounts again.');const r=await supabase.functions.invoke('club-social-publish',{body:{action,...body}});if(r.error||r.data?.error){let message=r.data?.error;try{message||=(await r.error.context?.clone().json())?.error;}catch{}throw Error(message||'The connection could not finish. Start Connect accounts again.');}return r.data;}
async function start(){
 if(deletion){try{const r=await supabase.functions.invoke('club-social-publish',{body:{action:'deletion_status',receipt:deletion}});if(r.error||!r.data?.completed)throw Error('This deletion confirmation could not be verified.');status.textContent='The Meta connection data for this request has been removed. Confirmation: '+r.data.confirmation_code;}catch(e){status.textContent=e.message;}return;}
 if(error){status.textContent='Meta sign-in was cancelled or access was not granted. You can close this window and try again.';return;}
 if(!code||!state){status.textContent='Open Social graphics → Social accounts in Club Batting to start connecting.';return;}
 try{
  const result=await call('oauth_complete',{code,state});status.textContent='Choose your club. We found these Facebook Pages and their linked Instagram accounts. Nothing will be posted while you connect.';
  for(const page of result.pages){const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='page';radio.value=page.id;radio.required=true;if(result.pages.length===1)radio.checked=true;label.append(radio,document.createTextNode(page.name));const note=document.createElement('small');note.textContent=page.instagram_name?'Instagram: @'+page.instagram_name:'Facebook only. You can connect Instagram later.';label.append(note);choices.append(label);}
  form.hidden=false;
  const button=form.querySelector('button'),selection=()=>{const selected=form.querySelector('[name=page]:checked'),page=result.pages.find(p=>p.id===selected?.value);button.disabled=!page;button.textContent=page?.instagram_name?'Connect Facebook & Instagram':page?'Connect Facebook only':'Choose a club above';};form.onchange=selection;selection();
  form.onsubmit=async e=>{
   e.preventDefault();const selected=form.querySelector('[name=page]:checked');if(!selected||button.disabled)return;button.disabled=true;status.textContent='Saving the club connection…';
   try{
    const saved=await call('choose_page',{id:result.id,page_id:selected.value}),page=result.pages.find(p=>p.id===selected.value);form.hidden=true;
    status.textContent='Saved: '+page.name+(page.instagram_name?' and @'+page.instagram_name:'. You can add Instagram later')+'. Return to Club Batting for the automatic connection check.';
    const u=new URL(saved.return_url);if(u.origin===location.origin){document.getElementById('back').href=u.href;if(window.opener)window.opener.postMessage({type:'club-social-connected',club_id:saved.club_id},u.origin);}
    const done=document.createElement('button');done.textContent='Return to Club Batting';done.onclick=()=>{if(window.opener){window.opener.focus();window.close();}else location.href=document.getElementById('back').href;};status.after(done);
   }catch(e){status.textContent=e.message+' You can return to Club Batting and choose Check connection.';button.disabled=false;}
  };
 }catch(e){status.textContent=e.message;}
}
void start();
