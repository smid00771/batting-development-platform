const assistUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assistLaunchFromSearch(search){
 const params=new URLSearchParams(search);
 const platform=params.get('platform')==='1';
 if(params.get('tab')!=='assist'&&!(platform&&params.has('assist_thread')))return null;
 const raw=params.get('assist_thread');
 return {platform,threadId:assistUuid.test(raw||'')?raw:null};
}
