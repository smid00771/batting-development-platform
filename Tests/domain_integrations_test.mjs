import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {renderCalendar} from '../Functions/selection-calendar/calendar.mjs';
import {createSelectionVideoHandler} from '../Functions/selection-video/handler.mjs';
import {seasonLogoCache} from '../Functions/playhq-sync/team-logos.mjs';
const root='https://mirelionhq.com';
test('new phone installs accept existing notification links without leaving their origin',()=>{
 const source=fs.readFileSync('sw.js','utf8'),fn=source.slice(source.indexOf('function appUrl('),source.indexOf("self.addEventListener('message'"));
 for(const origin of [root,'https://clubbatting.com']){
  const context=vm.createContext({URL,Set,ROOT:new URL(origin+'/')});vm.runInContext(fn,context);
  for(const from of [root,'https://clubbatting.com'])assert.equal(context.appUrl(from+'/app.html?club=c&tab=messages').href,origin+'/app.html?club=c&tab=messages');
  for(const url of ['https://evil.invalid/app.html','https://mirelionhq.com.evil.invalid/app.html',root+'/privacy.html','https://user:pass@mirelionhq.com/app.html'])assert.equal(context.appUrl(url),null);
 }
});
test('calendar feeds include both trusted app domains and reject foreign event URLs',()=>{
 const event=url=>({event:{date:'2026-10-26',title:'Match',url},uid:'stable-event-id',updated_at:'2026-10-26',sequence:2});
 const text=renderCalendar({name:'My matches',events:[event(root+'/app.html?club=c'),event('https://clubbatting.com/app.html?club=c'),event('https://evil.invalid/app.html')]});
 assert.ok(text.includes('URL:'+root+'/app.html?club=c'));assert.ok(text.includes('URL:https://clubbatting.com/app.html?club=c'));assert.ok(!text.includes('evil.invalid'));assert.ok(text.includes('UID:stable-event-id'));
});
test('scorecard and PlayHQ preflight accept Mirelion without expanding to foreign origins',async()=>{
 for(const name of ['playhq-sync','playcricket-scorecard']){
  let handler;
  const source=stripTypeScriptTypes(fs.readFileSync('Functions/'+name+'/index.ts','utf8').replace(/^import .*$/gm,''));
  vm.runInNewContext(source,{Deno:{serve:fn=>handler=fn,env:{get:()=>undefined}},Request,Response,URL,Set,seasonLogoCache});
  for(const origin of [root,'https://www.mirelionhq.com','https://clubbatting.com']){
   const response=await handler(new Request('https://example.invalid',{method:'OPTIONS',headers:{origin}}));assert.equal(response.headers.get('access-control-allow-origin'),origin);
  }
  const response=await handler(new Request('https://example.invalid',{method:'OPTIONS',headers:{origin:'https://evil.invalid'}}));assert.notEqual(response.headers.get('access-control-allow-origin'),'https://evil.invalid');
 }
});
test('selection calls accept Mirelion preflight without contacting providers',async()=>{
 const handler=createSelectionVideoHandler({env:()=>undefined,fetcher:()=>{throw Error('No provider call expected');}});
 const response=await handler(new Request('https://example.invalid',{method:'OPTIONS',headers:{origin:root}}));assert.equal(response.headers.get('access-control-allow-origin'),root);
});
