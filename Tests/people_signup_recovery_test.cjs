const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');

function between(source,start,end){
  const from=source.indexOf(start);assert.ok(from>=0,`Missing ${start}`);
  const to=source.indexOf(end,from+start.length);assert.ok(to>from,`Missing ${end}`);
  return source.slice(from,to);
}
function page(html){return new JSDOM(html,{url:'https://example.test/app.html'}).window.document;}

for(const file of ['app.js','demo.html']){
  const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
  test(`${file}: blocked clipboard exposes the exact text, then clears recovery after a successful copy`,async()=>{
    const document=page('<div id="playerShareStatus"></div><div id="staffJoinStatus"></div>');
    let denied=true,copied='';
    const c=vm.createContext({document,navigator:{clipboard:{writeText:async text=>{if(denied)throw Error('Clipboard denied');copied=text;}}}});
    vm.runInContext(between(source,'  const copyText=async(text,label,statusId)=>{','  const copyPlayerShare=')+'\nglobalThis.copyText=copyText;',c);
    const message='Join our club\nhttps://example.test/app.html?player_join=a&b=<script>alert(1)</script>';
    await c.copyText(message,'WhatsApp message','playerShareStatus');
    const field=document.querySelector('#playerShareStatus textarea');
    assert.ok(field,'The user has actual content available to copy');assert.equal(field.value,message);
    assert.equal(field.readOnly,true);assert.equal(field.getAttribute('aria-label'),'WhatsApp message');
    assert.equal(document.activeElement,field);assert.equal(field.selectionStart,0);assert.equal(field.selectionEnd,message.length);
    assert.equal(document.querySelector('script'),null,'Shared text is never inserted as HTML');
    await c.copyText('https://example.test/staff?join=123','Non-playing staff sign-up link','staffJoinStatus');
    assert.equal(document.querySelector('#staffJoinStatus textarea').value,'https://example.test/staff?join=123');
    denied=false;await c.copyText(message,'WhatsApp message','playerShareStatus');
    assert.equal(copied,message);assert.equal(document.querySelector('#playerShareStatus textarea'),null);
    assert.equal(document.getElementById('playerShareStatus').textContent,'WhatsApp message copied ✓');
  });

  test(`${file}: Edit roles focuses the permission control without opening coaching duties`,()=>{
    const document=page('<div id="results"><button data-find-assigned="member">Edit roles</button><button data-find-assigned="lead">Edit roles</button></div><div id="assignedRole-member" tabindex="-1"><select data-role-user="member"><option>Coach</option></select></div><div id="assignedRole-lead" tabindex="-1">Lead Admin · Full club access</div>');
    let scrolled=0,openedCoaching=0;
    for(const id of ['member','lead'])document.getElementById('assignedRole-'+id).scrollIntoView=()=>scrolled++;
    const c=vm.createContext({document,wrap:document.getElementById('results'),editPersonCoachingDuties:()=>openedCoaching++});
    const binding=source.split('\n').find(line=>line.includes("wrap.querySelectorAll('[data-find-assigned]')"));assert.ok(binding);
    vm.runInContext(binding,c);document.querySelector('[data-find-assigned="member"]').click();
    assert.equal(document.activeElement,document.querySelector('[data-role-user="member"]'));assert.equal(openedCoaching,0);assert.equal(scrolled,1);
    document.querySelector('[data-find-assigned="lead"]').click();
    assert.equal(document.activeElement,document.getElementById('assignedRole-lead'),'Protected lead role opens its summary rather than an unrelated editor');assert.equal(openedCoaching,0);
  });

  test(`${file}: failed sign-up changes leave the original action available for retry`,async()=>{
    for(const signupOpen of [true,false]){
      const document=page('<button id="togglePlayerSignup"></button>'),button=document.getElementById('togglePlayerSignup');
      const initial=signupOpen?'Close sign-up':'Open sign-up';button.textContent=initial;
      let refreshed=0,reported='',request;
      const c=vm.createContext({document,signupOpen,signupSettingsLoaded:true,targetClub:'club',stillCurrent:()=>true,alert:message=>reported=message,loadContext:async()=>refreshed++,supabase:{rpc:async(name,data)=>{request={name,data};return {error:{message:'Connection lost'}};}}});
      vm.runInContext(between(source,"  document.getElementById('togglePlayerSignup').onclick=async()=>{","  document.getElementById('regeneratePlayerLink').onclick="),c);
      await button.onclick();
      assert.equal(button.disabled,false);assert.equal(button.textContent,initial);assert.equal(reported,'Connection lost');assert.equal(refreshed,0);
      assert.equal(request.name,'set_player_signup_open');assert.equal(request.data.p_open,!signupOpen);
    }
  });
}
