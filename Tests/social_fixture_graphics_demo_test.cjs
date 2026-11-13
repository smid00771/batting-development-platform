const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
test('a club heading adjustment persists through save, other teams and a fresh workspace',async t=>{
 const h=await openDemo({product:'select',role:'socials',journey:'socials'});t.after(h.close);h.window.scrollBy=()=>{};
 const before=plain(h.window.eval('socialState.design'));
 const input=h.document.querySelector('[data-st-setting="heading_scale"]');assert.ok(input);assert.equal(input.value,'100');
 input.value='80';input.dispatchEvent(new h.window.Event('input',{bubbles:true}));await h.settle();await h.click('#stSaveLayout');
 assert.equal(h.window.eval('demoSocial.settings.heading_scale'),80);
 assert.deepEqual(plain(h.window.eval('socialState.design')),{...before,heading_scale:80});
 await h.click('[data-st-step="photos"]');await h.choose('#stGrade','third-upcoming');assert.equal(h.window.eval('socialState.design.heading_scale'),80);
 await h.click('#socialRefresh');await h.click('[data-st-step="artwork"]');assert.equal(h.document.querySelector('[data-st-setting="heading_scale"]').value,'80');
 assert.deepEqual(h.errors,[]);assert.deepEqual(h.requests,[]);
});

test('the delivered socials workflow keeps every bracket partner in one preview, download and post',async t=>{
 const h=await openDemo({product:'select',role:'socials',journey:'socials'});t.after(h.close);h.window.scrollBy=()=>{};
 const before=h.window.eval("JSON.stringify(demoSelections.fixtures.find(f=>f.id==='third-upcoming').published)");
 await h.click('[data-st-step="photos"]');await h.choose('#stGrade','third-upcoming');
 assert.equal(h.document.querySelectorAll('[data-social-canvas="third-upcoming:0"]').length,1);
 assert.equal(h.document.querySelector('#stDay'),null);
 const options=[...h.document.querySelector('[data-social-person]').options].map(o=>o.value);
 for(let i=0;i<3;i++)assert.ok(options.includes('third-week-two-'+i));
 await h.choose('[data-social-person]','third-week-two-0');
 const features=plain(h.window.eval("demoSocial.features['third-upcoming']"));
 assert.equal(features.length,2);assert.ok(features.every(f=>f.roster_id==='third-week-two-0'));
 assert.equal(h.window.eval("socialState.data.fixtures.find(f=>f.id==='third-upcoming').feature_valid"),true);
 await h.click('[data-st-step="review"]');
 assert.equal(h.document.querySelectorAll('[data-social-canvas^="third-upcoming:"]').length,1);
 assert.equal(h.document.querySelector('[data-social-canvas="third-upcoming:0"]').dataset.bracketPairs,'3');
 for(const box of [...h.document.querySelectorAll('[data-social-fixture]')])if(box.checked&&box.dataset.socialFixture!=='third-upcoming')await h.click('[data-social-fixture="'+box.dataset.socialFixture+'"]');
 const caption=h.document.querySelector('#socialCaptions').value;
 assert.match(caption,/Aiden Archer \(C\) \(W1\) \/ Morgan Lawson \(C\) \(W2\)/);assert.equal((caption.match(/^\d+\. /gm)||[]).length,11);
 // Read the generated ZIP rather than only asserting which export function was called.
 const blobs=new Map(),downloads=[];h.window.URL.createObjectURL=blob=>{const key='blob:test-'+blobs.size;blobs.set(key,blob);return key;};
 h.window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,url:this.href});};
 await h.click('#socialPack');for(let i=0;i<5&&!downloads.length;i++)await h.settle();
 assert.equal(downloads.length,1);assert.match(downloads[0].name,/\.zip$/);
 const zip=Buffer.from(await blobs.get(downloads[0].url).arrayBuffer()),files=[];let at=0;
 while(zip.readUInt32LE(at)===0x04034b50){const size=zip.readUInt32LE(at+18),n=zip.readUInt16LE(at+26),extra=zip.readUInt16LE(at+28),start=at+30+n+extra;files.push({name:zip.subarray(at+30,at+30+n).toString(),body:zip.subarray(start,start+size)});at=start+size;}
 assert.equal(files.filter(f=>f.name.endsWith('.png')).length,1);assert.ok(files.every(f=>!/-Day-\d/.test(f.name)));
 assert.equal(files.find(f=>f.name==='Captions.txt').body.toString(),caption);
 assert.match(h.document.querySelector('#spReview').textContent,/1 image/);await h.click('#spReview');
 for(let i=0;i<8&&!h.document.querySelector('#spCaption');i++)await h.settle();
 assert.equal(h.document.querySelectorAll('.sp-preview figure').length,1);assert.match(h.document.querySelector('.sp-preview').textContent,/3rd Grade/);
 assert.doesNotMatch(h.document.querySelector('.sp-preview').textContent,/Day [12]/);
 assert.equal(h.window.eval("JSON.stringify(demoSelections.fixtures.find(f=>f.id==='third-upcoming').published)"),before);
 assert.deepEqual(h.requests,[]);assert.deepEqual(h.errors,[]);assert.deepEqual(h.alerts,[]);
});
