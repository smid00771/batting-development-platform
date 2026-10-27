import test from 'node:test';
import assert from 'node:assert/strict';
import {createPasswordFlow,cleanPasswordUrl} from '../password-flow.js';

const user={user:{id:'sample-user',email:'player@example.test'}};
const callback='https://example.test/app.html?player_join=club-link&password_setup=1#access_token=example&refresh_token=example&type=recovery';

test('a saved setup URL never requires a password change, signed in or signed out',()=>{
  for(const session of [user,null]){
    const flow=createPasswordFlow('https://example.test/app.html?password_setup=1');
    flow.initialise(session,null);
    assert.equal(flow.activeFor(session),false);
    assert.equal(flow.takeNotice(),'');
  }
});

test('ordinary signup, email confirmation and magic links do not request another password',()=>{
  for(const type of ['signup','magiclink','invite']){
    const flow=createPasswordFlow(callback.replace('type=recovery','type='+type));
    flow.initialise(user,null);
    assert.equal(flow.activeFor(user),false);
  }
});

test('successful implicit and PKCE recovery callbacks open setup only for that account',()=>{
  for(const href of [callback,'https://example.test/app.html?password_setup=1&code=example-code']){
    const flow=createPasswordFlow(href);flow.initialise(user,null);
    assert.equal(flow.activeFor(user),true);
    assert.equal(flow.activeFor(null),false);
    assert.equal(flow.activeFor({user:{id:'other-user'}}),false);
    flow.finish();flow.authChanged(user);
    assert.equal(flow.activeFor(user),false);
  }
});

test('invalid and expired callbacks offer ordinary sign-in and never force recovery',()=>{
  for(const href of [callback,'https://example.test/app.html?password_setup=1#error=access_denied&error_code=otp_expired']){
    const flow=createPasswordFlow(href);flow.initialise(user,{message:'Link expired'});
    assert.equal(flow.activeFor(user),false);
    assert.match(flow.takeNotice(),/existing password/);
    assert.equal(flow.takeNotice(),'');
  }
  const flow=createPasswordFlow(callback);flow.initialise(null,null);
  assert.equal(flow.activeFor(null),false);assert.match(flow.takeNotice(),/existing password/);
});

test('account changes and sign-out clear explicit password editing',()=>{
  const flow=createPasswordFlow('https://example.test/app.html');
  flow.begin(user);flow.authChanged(user);assert.equal(flow.activeFor(user),true);
  flow.authChanged(null);assert.equal(flow.activeFor(user),false);
  flow.begin(user);flow.authChanged({user:{id:'other-user'}});assert.equal(flow.activeFor(user),false);
});

test('cleanup retains club and invitation destinations without retaining credentials',()=>{
  assert.equal(cleanPasswordUrl(callback).href,'https://example.test/app.html?player_join=club-link');
  assert.equal(cleanPasswordUrl('https://example.test/app.html?password_setup=1#').href,'https://example.test/app.html');
  assert.equal(cleanPasswordUrl('https://example.test/app.html?club=club-a&tab=teams&code=example&password_setup=1&error=denied').href,'https://example.test/app.html?club=club-a&tab=teams');
  assert.equal(cleanPasswordUrl('https://example.test/app.html?club=club-a#help').hash,'#help');
  assert.equal(cleanPasswordUrl(callback.replace('example.test','clubbatting.com')).origin,'https://clubbatting.com');
});
