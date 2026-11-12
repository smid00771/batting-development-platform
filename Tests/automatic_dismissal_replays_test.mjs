import test from 'node:test';import assert from 'node:assert/strict';
import {createDismissalEnricher,replayMetadataCache,replayBinding} from '../Functions/playhq-sync/dismissal-replays.mjs';
import {fixture,provider,id} from './helpers/dismissal_fixture.mjs';
const clips=card=>card.innings.flatMap(i=>i.batters).filter(b=>b.dismissal_video_url);
const strip=card=>{const c=structuredClone(card);delete c.replay_url;for(const i of c.innings)for(const b of i.batters)for(const k of ['dismissal_video_url','dismissal_video_thumbnail_url','dismissal_replay_source'])delete b[k];return c;};
test('normal fixture checks discover verified clips automatically without changing scores or any identities',async()=>{
 const f=fixture(),p=provider(f),before=structuredClone(f.card),enrich=createDismissalEnricher({request:p.request});
 const result=await enrich(f.card,f.options);
 assert.equal(clips(result).length,2);assert.deepEqual(strip(result),before);assert.deepEqual(f.card,before);
 assert.equal(result.innings[0].batters[0].dismissal_replay_source.player_id,f.raw.teams[0].players[0].participantId);
 assert.equal(result.innings[0].batters[0].dismissal_video_thumbnail_url,'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
 for(const {url,options}of p.calls){assert.equal(new URL(url).origin,'https://grassrootsapiproxy.cricket.com.au');assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(options.redirect,'error');assert.ok(options.signal);assert.doesNotMatch(url,/\.m3u8|youtube|highlightId/);}
 assert.deepEqual(await enrich(f.card,f.options),result);
 assert.equal(p.calls.filter(c=>c.url.includes('/organisation/search')).length,1,'Metadata is reused across checks');
 assert.equal(p.calls.filter(c=>new URL(c.url).pathname==='/scores/matches/'+f.raw.id).length,2,'Actual clip availability is checked again');
});
test('each later fixture gets its own links using the same automatic path',async()=>{
 let now=0;const f=fixture(),p=provider(f),enrich=createDismissalEnricher({request:p.request,cache:replayMetadataCache({now:()=>now})});
 const first=await enrich(f.card,f.options);assert.equal(clips(first).length,2);
 const next=structuredClone(f);next.raw.id=id(2);next.raw.matchSchedule[0].startDateTime='2099-11-07T10:00:00+11:00';next.raw.round.name='Round 2';
 next.card.dates=['2099-11-07'];next.card.upstream_match_id=id(94);next.options.sourceFixture={round:'Round 2',days:[{date:'2099-11-07',start_at:'2099-11-06T23:00:00Z'}]};
 p.state.matches.push(next.raw);now+=7*86400000;const second=await enrich(next.card,next.options);
 assert.equal(clips(second).length,2);assert.ok(clips(second).every(b=>b.dismissal_video_url.includes('/'+id(2)+'?')));assert.deepEqual(strip(second),next.card);
});
test('identical club names with a different official PlayHQ organisation ID do not link',async()=>{
 const f=fixture(),p=provider(f);p.state.orgId=id(999);
 assert.deepEqual(await createDismissalEnricher({request:p.request})(f.card,f.options),f.card);assert.equal(p.calls.length,1);
});
test('wrong player, order, figures, grade, innings totals, playing times or opponent IDs never attach clips',async()=>{
 const changes=[f=>f.raw.innings[0].batting[0].runsScored++,f=>f.raw.innings[0].batting[0].ballsFaced++,f=>f.raw.teams[0].players[0].name='Wrong Person',f=>f.raw.innings[0].batting[0].batOrder=10,f=>f.raw.grade.name='Other Grade',f=>f.raw.innings[0].runsScored++,f=>f.raw.matchSchedule[0].startDateTime='2099-10-31T15:00:00+11:00',f=>f.raw.teams[1].owningOrganisation.id=id(900)];
 for(const change of changes){const f=fixture(),p=provider(f);change(f);
  // Keep the verified source organisation lookup independent of a changed candidate.
  const request=async(u,o)=>u.includes('/organisation/'+id(900))?Response.json({organisationGuid:id(900),playHQId:id(901)}):p.request(u,o);
  assert.deepEqual(await createDismissalEnricher({request})(f.card,f.options),f.card);
 }
});
test('duplicate complete matches and repeated batter names are treated as ambiguous',async()=>{
 const f=fixture(),p=provider(f);p.state.matches.push({...structuredClone(f.raw),id:id(2)});
 assert.deepEqual(await createDismissalEnricher({request:p.request})(f.card,f.options),f.card);
 const g=fixture();g.card.innings[0].batters[1].name=g.card.innings[0].batters[0].name;
 assert.throws(()=>replayBinding(g.card,g.raw,{[id(200)]:id(300),[id(201)]:id(301)},g.options.gradeName),/Ambiguous/);
});
test('clips arriving after the first result are collected on a later normal check',async()=>{
 const f=fixture(),p=provider(f),enrich=createDismissalEnricher({request:p.request}),highlight=f.raw.innings.map(i=>i.batting[0].highlight);
 for(const i of f.raw.innings)delete i.batting[0].highlight;
 assert.deepEqual(await enrich(f.card,f.options),f.card);
 for(const [i,inn]of f.raw.innings.entries())inn.batting[0].highlight=highlight[i];
 assert.equal(clips(await enrich(f.card,f.options)).length,2);
});
test('provider outages leave scores intact and failed metadata can be retried',async()=>{
 const f=fixture(),p=provider(f),errors=[],enrich=createDismissalEnricher({request:p.request,onUnavailable:e=>errors.push(e)});p.state.fail=true;
 assert.deepEqual(await enrich(f.card,f.options),f.card);assert.equal(errors.length,1);p.state.fail=false;
 assert.equal(clips(await enrich(f.card,f.options)).length,2);
});
test('in-progress, native and missing-grade cards add no provider requests',async()=>{
 const f=fixture(),p=provider(f),enrich=createDismissalEnricher({request:p.request});
 for(const card of [{...f.card,status:'in_progress'},{...f.card,provider:'playcricket_au'}])assert.deepEqual(await enrich(card,f.options),card);
 assert.deepEqual(await enrich(f.card,{gradeName:''}),f.card);assert.equal(p.calls.length,0);
});
test('a completed two-day fixture verifies both dates and reuses the normal per-innings binding',async()=>{
 const f=fixture();f.card.format_key='long_form';f.card.dates.push('2099-11-07');f.raw.matchType='Two Day';f.raw.matchSchedule.push({startDateTime:'2099-11-07T10:00:00+11:00'});f.options.sourceFixture.days.push({date:'2099-11-07',start_at:'2099-11-06T23:00:00Z'});
 const p=provider(f);assert.equal(clips(await createDismissalEnricher({request:p.request})(f.card,f.options)).length,2);
});
