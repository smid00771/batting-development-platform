import socialSource from './helpers/social-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {createTeamOfWeek,teamWeekLayout} from '../team-of-week.js';
import {createPlayerOfWeek,playerWeekLayout} from '../player-of-week.js';

const fn=socialSource.functionSource;
for(const file of ['app.js','demo.html']){
 const source=socialSource(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 test(file+': weekly award navigation restores before social settings load',()=>{
  const social={scope:'selector:club',data:null};
  const c=vm.createContext({console,Date,Intl,Set,Map,createTeamOfWeek,teamWeekLayout,createPlayerOfWeek,playerWeekLayout,socialEnsure:()=>social,socialPublishing:undefined});
  vm.runInContext("const socialWeek=createTeamOfWeek({escape:String}),socialPlayerWeek=createPlayerOfWeek({escape:String}),socialAwards={state:s=>s.awards||(s.awards={})};",c);
  vm.runInContext(fn(source,'restoreSocialNavigation'),c);
  for(const [view,key] of [['team_week','week'],['player_week','playerWeek']]){
   social.data=null;
   c.socialPublishing=undefined;c.restoreSocialNavigation({view,[key]:{end:'2026-10-11'}});
   assert.equal(social.deferredNavigation[key].end,'2026-10-11');c.socialPublishing={};c.restoreSocialNavigation(social.deferredNavigation);delete social.deferredNavigation;
   assert.equal(social.view,view);
   assert.equal(social[key].end,'2026-10-11','The saved week survives a cold reload');
   assert.equal(social[key].context,null,'Restoration does not pretend settings have loaded');
   social.data={timezone:'Pacific/Auckland'};
   const saved=social[key];
   c.restoreSocialNavigation({view,[key]:{end:'2026-10-11'}});
   assert.equal(social[key],saved,'Loading club settings does not replace restored state');
  }
 });
}

test('weekly state respects the configured club timezone',()=>{
 for(const factory of [createTeamOfWeek,createPlayerOfWeek]){
  const s={scope:'selector:club',data:{timezone:'Pacific/Honolulu'}};
  const today=new Date().toLocaleDateString('en-CA',{timeZone:s.data.timezone});
  const end=new Date(today+'T12:00:00Z'),day=end.getUTCDay();
  end.setUTCDate(end.getUTCDate()+(day>=5?7-day:-day));
  assert.equal(factory({escape:String}).state(s).end,end.toISOString().slice(0,10));
 }
});
