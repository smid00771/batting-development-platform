import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awardFontsReady,awardFont} from '../social-award-fonts.js';
test('optional fonts load only on request, share pending loads, and retry a failed face',async()=>{
 const loaded=[],added=[];let fail=true;
 globalThis.document={fonts:{add:face=>added.push(face.family)}};
 globalThis.FontFace=class{constructor(family,data,options){this.family=family;assert.ok(data.byteLength>100000);assert.ok(['400','600'].includes(options.weight));}async load(){loaded.push(this.family);if(this.family==='Club Brush'&&fail){fail=false;throw Error('temporary font load failure');}return this;}};
 try{
  await awardFontsReady({font:'sporting'});assert.deepEqual(loaded,[]);
  await Promise.all([awardFontsReady({title_font:'condensed'}),awardFontsReady({grade_font:'condensed'})]);assert.deepEqual(loaded,['Club Display']);
  await assert.rejects(awardFontsReady({badge_font:'script'}),/font could not load/);assert.ok(!added.includes('Club Brush'));
  await awardFontsReady({badge_font:'script',player_font:'sans'});assert.deepEqual(new Set(added),new Set(['Club Display','Club Brush','Club Sans']));
  assert.equal(awardFont({font:'classic',badge_font:'script'},'badge'),'script');assert.equal(awardFont({font:'classic',badge_font:'inherit'},'badge'),'classic');
 }finally{delete globalThis.FontFace;delete globalThis.document;}
});
