const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function renderAssistNotification(data,base){
 if(!uuid.test(data?.thread_id||'')||!['club','team'].includes(data?.side))throw Error('Invalid Assist notification.');
 const url=new URL('./app.html',base);
 if(url.protocol!=='https:')throw Error('Assist email needs an HTTPS app address.');
 if(data.side==='club')url.searchParams.set('platform','1');
 else{
  if(!uuid.test(data.club_id||''))throw Error('Invalid Assist club.');
  url.searchParams.set('club',data.club_id);url.searchParams.set('tab','assist');
 }
 url.searchParams.set('assist_thread',data.thread_id);
 const subject=data.side==='club'?'New message in Mirelion Assist':'Mirelion replied to your support conversation';
 const body=data.side==='club'?'A new club message is waiting for the Mirelion team.':'You have an unread reply from Mirelion.';
 const footer='Open the conversation and reply in Mirelion Assist to keep the history together.';
 const help=data.side==='team'?'If you cannot access Assist, email support@mirelionhq.com. Direct email replies go to our support inbox.':'';
 return {subject,text:`${subject}\n\n${body}\n\nOpen conversation: ${url.href}\n\n${footer}${help?'\n\n'+help:''}`,
  html:`<!doctype html><html lang="en"><body style="margin:0;background:#f7f7ef;font-family:Arial,sans-serif;color:#173d32"><main style="max-width:580px;margin:auto;padding:24px"><p style="font-weight:bold">Mirelion Assist</p><h1 style="font-size:24px">${esc(subject)}</h1><p>${esc(body)}</p><p style="margin:24px 0"><a href="${esc(url.href)}" style="display:inline-block;background:#173d32;color:#fff;border-radius:8px;padding:14px 20px;text-decoration:none;font-weight:bold">Open conversation</a></p><p>${esc(footer)}</p>${help?`<p style="font-size:13px">${esc(help)}</p>`:''}</main></body></html>`};
}
