const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=new URL('../','file://'+__filename);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const routing=read('index.html').match(/<script id="legacy-app-routing">([\s\S]*?)<\/script>/)[1];
function route(suffix){
  const url=new URL('https://clubbatting.com/'+suffix);let redirected;
  vm.runInNewContext(routing,{URL,URLSearchParams,location:{href:url.href,search:url.search,hash:url.hash,replace:value=>{redirected=value;}}});
  return redirected;
}
test('legacy root invitations preserve opaque query and fragment strings',()=>{
  for(const key of ['selection_invite','admin_invite','philosophy_invite','player_join','join','lead_handover','close_invitation']){
    const tail=`?${key}=token%2B%2F%3D%26x+plus&club=sample&tab=teams#state=a%26b%3D`;
    assert.equal(route(tail),'https://clubbatting.com/app.html'+tail);
  }
});
test('authentication callbacks and existing trial links keep their destinations',()=>{
  for(const tail of ['?code=opaque%2Bcode&continue_trial=1','#access_token=fake%2Btoken&refresh_token=fake%2Ftoken','?trial_product=selections&continue_trial=1','?error=access_denied#error_description=declined']){
    assert.equal(route(tail),'https://clubbatting.com/app.html'+tail);
  }
  for(const tail of ['', '#products', '?utm_source=club', '?product=selections'])assert.equal(route(tail),undefined);
});
test('each product entrance reaches the shared trial flow with its stored product key',()=>{
  const script=new JSDOM(read('enquire.html')).window.document.querySelector('script').textContent;
  for(const [page,key] of [['teams.html','selections'],['batting.html','batting'],['index.html','both']]){
    const doc=new JSDOM(read(page),{url:'https://clubbatting.com/'+page}).window.document;
    const link=doc.querySelector(`a[href="./enquire.html?product=${key}"]`);assert.ok(link);
    let onReady,target;const fallback={};const location=new URL(link.href);location.replace=value=>target=value;
    vm.runInNewContext(script,{URL,URLSearchParams,location,document:{addEventListener:(event,fn)=>onReady=fn,getElementById:()=>fallback}});
    onReady();assert.equal(target,`https://clubbatting.com/app.html?trial_product=${key}`);assert.equal(fallback.href,target);
  }
});
test('all public page assets and local navigation targets resolve',()=>{
  for(const name of ['index.html','teams.html','batting.html','privacy.html','enquire.html']){
    const document=new JSDOM(read(name),{url:'https://clubbatting.com/'+name}).window.document;
    assert.equal(document.querySelectorAll('h1').length,1);
    for(const node of document.querySelectorAll('a[href],link[href],script[src]')){
      const raw=node.getAttribute('href')||node.getAttribute('src');if(!raw.startsWith('./')&&!raw.startsWith('#'))continue;
      const url=new URL(raw,'https://clubbatting.com/'+name);
      assert.ok(fs.existsSync(new URL(url.pathname==='/'?'index.html':url.pathname.slice(1),root)),`${name}: ${raw}`);
      if(url.hash&&url.pathname==='/'+name)assert.ok(document.getElementById(url.hash.slice(1)),`${name}: ${raw}`);
    }
  }
});
