// Password entry is a one-page action, never an account/session requirement.
// Capture the callback before the auth SDK consumes its URL. Auth events are
// broadcast across tabs, so PASSWORD_RECOVERY alone must not open this screen.
export function createPasswordFlow(href){
  const url=new URL(href),hash=new URLSearchParams(url.hash.slice(1));
  const param=key=>hash.get(key)||url.searchParams.get(key);
  const setup=url.searchParams.has('password_setup');
  const recovery=param('type')==='recovery';
  const callback=(recovery&&!!param('access_token')&&!!param('refresh_token'))
    ||(setup&&!!url.searchParams.get('code'));
  const failedLink=(setup||recovery)&&!!(param('error')||param('error_code'));
  let accountId=null,notice='';
  return {
    isPasswordEntry:setup||recovery,
    initialise(session,error){
      if(callback&&!error&&session?.user?.id)accountId=session.user.id;
      else if(callback||failedLink)notice='This password link has expired or could not be opened. Sign in with your existing password, or choose “Forgot password?” if you need a new link.';
    },
    activeFor(session){return !!accountId&&accountId===session?.user?.id;},
    begin(session){accountId=session?.user?.id||null;notice='';},
    finish(){accountId=null;notice='';},
    authChanged(session){if(accountId!==session?.user?.id){accountId=null;}},
    takeNotice(){const message=notice;notice='';return message;}
  };
}

export function cleanPasswordUrl(href){
  const url=new URL(href);
  const keys=['password_setup','code','access_token','refresh_token','token','token_hash',
    'provider_token','provider_refresh_token','id_token','expires_at','expires_in',
    'token_type','type','error','error_code','error_description','state','client_secret'];
  for(const key of keys)url.searchParams.delete(key);
  const hash=new URLSearchParams(url.hash.slice(1));
  if(!url.hash||keys.some(key=>hash.has(key)))url.hash='';
  return url;
}
