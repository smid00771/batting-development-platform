// The old host remains available for account callbacks and the existing Meta callback.
// Session credentials must be consumed on their original origin, never forwarded.
export const MIRELION_ORIGIN='https://mirelionhq.com';
const legacyOrigins=new Set(['https://clubbatting.com','https://www.clubbatting.com','https://clubbatting.com.au','https://www.clubbatting.com.au']);
const authKeys=new Set(['code','access_token','refresh_token','token','token_hash','provider_token','provider_refresh_token','id_token','expires_at','expires_in','token_type','type','error','error_code','error_description','state','client_secret']);
export function isLegacyOrigin(href){try{return legacyOrigins.has(new URL(href).origin);}catch{return false;}}
export function hasAuthenticationCallback(href){
 try{const u=new URL(href);return u.searchParams.has('password_setup')||[u.searchParams,new URLSearchParams(u.hash.slice(1))].some(p=>[...p.keys()].some(k=>authKeys.has(k)));}catch{return false;}
}
export function mirelionAppUrl(href){
 const source=new URL(href),target=new URL('/app.html',MIRELION_ORIGIN);
 for(const [key,value] of source.searchParams)if(!authKeys.has(key)&&!['password_setup','legacy'].includes(key))target.searchParams.append(key,value);
 // App routes live in the query. Fragments can contain bearer credentials.
 return target.href;
}
export function legacyAppRedirect(href){
 const u=new URL(href);
 return isLegacyOrigin(href)&&u.searchParams.get('legacy')!=='1'&&!hasAuthenticationCallback(href)?mirelionAppUrl(href):null;
}
