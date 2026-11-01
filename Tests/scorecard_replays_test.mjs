import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {scorecardReplayUrl,scorecardReplayThumbnail,renderDismissalReplay,bindReplayThumbnails} from '../scorecard-replays.js';
import {renderFixtureScorecard} from '../fixture-results.js';
const match='00000000-0000-4000-8000-000000000001',highlight='00000000-0000-4000-8000-000000000002',url=`https://play.cricket.com.au/match/${match}?tab=scorecard&highlightId=${highlight}`;
test('replay links reject unsafe destinations and missing or malformed clip identities',()=>{
 assert.equal(scorecardReplayUrl(url,true),url);
 for(const bad of [url.replace('https:','http:'),url.replace('play.cricket.com.au','play.cricket.com.au.evil.example'),url.replace('https://','https://user@'),url.replace(highlight,'invalid'),url+'&redirect=https://evil.example','javascript:alert(1)',url+'#fragment'])assert.equal(scorecardReplayUrl(bad,true),null,bad);
 assert.equal(scorecardReplayUrl(`https://play.cricket.com.au/match/${match}?tab=highlights`,true),null);
});
test('a safe match thumbnail opens this batter’s exact dismissal with an accessible play control',()=>{
 const poster='https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',batter={name:'Example Batter',status:'played',not_out:false,dismissal_video_url:url,dismissal_video_thumbnail_url:poster};
 const doc=new JSDOM(renderDismissalReplay(batter,{thumbnail:true})).window.document;
 assert.equal(doc.querySelector('a').href,url);assert.equal(doc.querySelector('img').src,poster);assert.equal(doc.querySelector('img').getAttribute('loading'),'lazy');assert.match(doc.querySelector('a').getAttribute('aria-label'),/Example Batter/);assert.equal(doc.querySelector('a').target,'_blank');assert.equal(doc.querySelector('iframe,video'),null,'Provider access is not bypassed through an embedded stream');
 for(const bad of [poster.replace('https:','http:'),poster+'?token=secret',poster.replace('i.ytimg.com','evil.example'),'javascript:alert(1)'])assert.equal(scorecardReplayThumbnail(bad),null);
 assert.equal(new JSDOM(renderDismissalReplay({...batter,dismissal_video_thumbnail_url:'https://evil.example/pixel'},{thumbnail:true})).window.document.querySelector('img'),null);
 const image=doc.querySelector('img');bindReplayThumbnails(doc);image.dispatchEvent(new doc.defaultView.Event('error'));
 assert.equal(doc.querySelector('img'),null);assert.equal(doc.querySelector('a').href,url);assert.equal(doc.querySelector('a').textContent,'Watch dismissal ↗','A failed image keeps a working dismissal control');
});
test('scorecard keeps order and shows replay actions only for identified dismissals',()=>{
 const batter={name:'Alex <Lane>',status:'played',runs:12,not_out:false,dismissal_video_url:url};
 const card={replay_url:`https://play.cricket.com.au/match/${match}?tab=highlights`,teams:[{id:'ours',name:'Example club'}],innings:[{team_id:'ours',number:1,complete:true,batters:[batter,{name:'Second',runs:44},{...batter,name:'Not out',not_out:true},{...batter,name:null}],bowlers:[]}]};
 const doc=new JSDOM(renderFixtureScorecard({our_team:'ours',scorecard:card})).window.document;
 const links=[...doc.querySelectorAll('a')];assert.equal(links.length,2);assert.equal(links[0].textContent,'Watch match replays ↗');assert.equal(links[1].href,url);assert.equal(links[1].target,'_blank');assert.match(links[1].rel,/noopener/);assert.equal(doc.querySelector('lane'),null);
 assert.deepEqual([...doc.querySelectorAll('tbody tr th')].map(x=>x.textContent.replace('Watch dismissal ↗','')),['Alex <Lane>','Second','Not out','Name withheld']);
});
test('Match Review exposes the replay for the same mapped batter without changing score confirmation',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8'),start=source.indexOf('function matchReviewScoreDetails('),end=source.indexOf('\nfunction renderMatchReviewImporter',start+1),batter={player_id:'source',name:'Alex Lane',runs:12,not_out:false,dismissal_video_url:url,importable:true};
 const c=vm.createContext({matchReviewImportState:()=>({mapping:{source:'player'},dirty:true,selected:{}}),matchReviewSourceInnings:()=>({complete:true,batters:[batter]}),teamReviewControlsLocked:()=>false,ensureTeamReviewState:()=>({}),esc:String,renderDismissalReplay});vm.runInContext(source.slice(start,end),c);
 const detail=new JSDOM(c.matchReviewDismissalDetails({player_id:'player',name:'Alex Lane'})).window.document;assert.equal(detail.querySelector('a'),null);
 const doc=new JSDOM('<table><tbody><tr>'+c.matchReviewScoreCell({player_id:'player',can_record_score:true})+'</tr></tbody></table>').window.document;
 assert.equal(doc.querySelector('.match-review-figures+a').href,url,'The individual dismissal sits directly below this batter’s figures');assert.equal(doc.querySelectorAll('a').length,1);assert.equal(doc.querySelector('[data-import-score]').dataset.importScore,'source');assert.equal(doc.querySelector('[data-import-score]').checked,false);
 c.matchReviewImportState=()=>({mapping:{source:'player'},dirty:false,selected:{}});
 for(const scorecard of [{status:'played',not_out:true,runs:12},{status:'did_not_bat',not_out:false}]){
  const corrected=new JSDOM('<table><tbody><tr>'+c.matchReviewScoreCell({player_id:'player',scorecard})+'</tr></tbody></table>').window.document;
  assert.equal(corrected.querySelector('a'),null,'A saved not-out/DNB correction cannot show a source dismissal');
 }
});
