import test from 'node:test';
import assert from 'node:assert/strict';
import {hasAuthenticationCallback,legacyAppRedirect,mirelionAppUrl} from '../domain-routing.js';
test('old ordinary app links preserve invitation and Assist destinations',()=>{
 for(const query of ['?club=123&tab=teams&team_view=board','?selection_invite=a%2Bb%2Fc','?assist_thread=thread-id&club=123','?trial_product=both']){
  assert.equal(legacyAppRedirect('https://clubbatting.com/app.html'+query),'https://mirelionhq.com/app.html'+query);
 }
});
test('every auth callback stays on its original origin, including root callbacks',()=>{
 for(const suffix of ['?code=private','?password_setup=1','#access_token=private&refresh_token=secret','#type=recovery','?token_hash=private','?error=access_denied','?provider_token=private']){
  const url='https://clubbatting.com/'+suffix;assert.ok(hasAuthenticationCallback(url));assert.equal(legacyAppRedirect(url),null);
 }
});
test('post-callback continuation drops credentials and retains the intended route',()=>{
 const u=mirelionAppUrl('https://clubbatting.com/app.html?code=secret&club=123&tab=teams&password_setup=1&legacy=1&refresh_token=secret#access_token=secret');
 assert.equal(u,'https://mirelionhq.com/app.html?club=123&tab=teams');assert.ok(!u.includes('secret'));
});
test('canonical, local previews and explicit legacy Meta access never bounce',()=>{
 for(const u of ['https://mirelionhq.com/app.html','http://localhost:8000/app.html','https://clubbatting.com/app.html?legacy=1'])assert.equal(legacyAppRedirect(u),null);
});
