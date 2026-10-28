// Svix's documented HMAC format, verified with Web Crypto (including constant-
// time signature verification). Persisted provider IDs make accepted retries safe.
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
export async function verifyEmailWebhook(raw,headers,secret,now=Date.now()){
 const id=headers.get('svix-id'),stamp=headers.get('svix-timestamp'),signatures=headers.get('svix-signature');
 if(!secret?.startsWith('whsec_')||!id||id.length>200||!/^\d{9,12}$/.test(stamp||'')||Math.abs(now/1000-Number(stamp))>300||!signatures||signatures.length>2000)throw Error('Invalid email webhook');
 const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',decode(secret.slice(6)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const data=new TextEncoder().encode(`${id}.${stamp}.${raw}`);
 for(const item of signatures.split(' ')){
  if(!item.startsWith('v1,'))continue;
  try{if(await crypto.subtle.verify('HMAC',key,decode(item.slice(3)),data))return JSON.parse(raw);}catch{}
 }
 throw Error('Invalid email webhook');
}
export function mailbox(value){
 if(typeof value!=='string'||/[\r\n\x00]/.test(value))return null;
 const address=(value.match(/<([^<>]+)>\s*$/)?.[1]||value).trim().toLowerCase();
 return address.length<=254&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address)?address:null;
}
const headerId=value=>typeof value==='string'&&/^<[^\s<>]{1,296}>$/.test(value)?value:null;
export function incomingSupportEmail(email,{providerId,allowedRecipients=[]}={}){
 if(!uuid(providerId)||email?.id!==providerId)throw Error('Invalid received email');
 const recipients=[...(email.to||[]),...(email.received_for||[])].map(mailbox).filter(Boolean);
 const allowed=allowedRecipients.map(mailbox).filter(Boolean);
 if(!allowed.length||!recipients.some(r=>allowed.includes(r)))return null;
 const sender=mailbox(email.from);if(!sender)return null;
 if(/@(mirelionhq\.com|clubbatting\.com)$/i.test(sender)||/^(mailer-daemon|postmaster|no-?reply|bounce)[+@-]/i.test(sender))return null;
 const headers=Object.fromEntries(Object.entries(email.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
 if(headers['list-id']||/^(bulk|junk|list)$/i.test(headers.precedence||'')||headers['auto-submitted']&&String(headers['auto-submitted']).toLowerCase()!=='no')return null;
 const internetId=headerId(email.message_id);if(!internetId)return null;
 const text=typeof email.text==='string'?email.text.trim():'';
 const attachments=!!email.attachments?.length||!text||text.length>6000;
 // No HTML rendering, attachment downloads, remote images, or account lookup.
 return {provider_id:providerId,sender_email:sender,sender_name:String(email.from).replace(/<[^<>]*>\s*$/,'').replace(/^"|"$/g,'').trim().slice(0,120)||sender,
  subject:String(email.subject||'Support email').replace(/[\r\n\x00]/g,' ').slice(0,120),
  body:(text||'This email has no plain-text body. Please review the original message in the support mailbox.').slice(0,6000),
  internet_id:internetId,in_reply_to:headerId(headers['in-reply-to']),attachments,
  authenticated:email.authentication?.dmarc==='pass'};
}

export function supportEmailPayload(delivery,from){
 if(!mailbox(from)||!mailbox(delivery.recipient)||!headerId(delivery.in_reply_to))throw Error('Invalid support delivery');
 return {from,to:[delivery.recipient],reply_to:'support@mirelionhq.com',
  subject:'Re: '+String(delivery.subject||'Mirelion support').replace(/^Re:\s*/i,'').replace(/[\r\n\x00]/g,' ').slice(0,120),
  text:(delivery.automated?'Mirelion Assist — automated reply\n\n':'')+delivery.body+'\n\nMirelion support\nsupport@mirelionhq.com',
  headers:{'In-Reply-To':delivery.in_reply_to,'References':delivery.in_reply_to,'Auto-Submitted':'auto-replied','X-Auto-Response-Suppress':'All'}};
}
