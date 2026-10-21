import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevocationHandler} from '../Functions/selection-video-revoke/handler.mjs';

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const capability = {run_id: id(900), token: 'a'.repeat(64)};
const job = (n = 1, entries = [id(100 + n)]) => ({
  call_id: id(n), room_name: 'cb-' + id(n).replaceAll('-', ''),
  expires_at: '2099-01-01T01:30:00Z', entry_ids: entries
});
const json = (value, status = 200) => new Response(JSON.stringify(value), {status});
const request = (value = capability) => new Request('https://worker.test/revoke', {
  method: 'POST', body: JSON.stringify(value)
});
function harness({jobs = [job()], claim, daily, complete, defer, missingEnv} = {}) {
  const calls = [];
  const handler = createRevocationHandler({
    env: name => name === missingEnv ? undefined : ({
      SUPABASE_URL: 'https://database.test', SUPABASE_SERVICE_ROLE_KEY: 'private-service', DAILY_API_KEY: 'private-daily'
    })[name],
    fetcher: async (url, options) => {
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      const body = JSON.parse(options.body);
      calls.push({url, body});
      if (url === 'https://database.test/rest/v1/rpc/selection_video_revocation_worker') {
        assert.equal(options.headers.Authorization, 'Bearer private-service');
        assert.equal(options.headers.apikey, 'private-service');
        if (body.p_action === 'claim') return claim ? claim(body.p_data) : json(jobs);
        assert.deepEqual(Object.keys(body.p_data).sort(),
          (body.p_action === 'defer' ? ['run_id', 'call_id', 'entry_ids', 'code'] : ['run_id', 'call_id', 'entry_ids']).sort());
        assert.equal(body.p_data.run_id, capability.run_id);
        if (body.p_action === 'complete') return complete ? complete(body.p_data) : json({completed: true});
        assert.equal(body.p_action, 'defer', 'No accounting or unrelated RPC action is permitted');
        return defer ? defer(body.p_data) : json({deferred: true});
      }
      assert.match(url, /^https:\/\/api\.daily\.co\/v1\/rooms\/cb-[0-9a-f]{32}\/eject$/);
      assert.equal(options.headers.Authorization, 'Bearer private-daily');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(Object.keys(body).sort(), ['ban', 'user_ids']);
      assert.equal(body.ban, true);
      return daily ? daily(body, url) : json({ejectedIds: ['participant-session-id']});
    }
  });
  return {handler, calls, actions: action => calls.filter(c => c.body.p_action === action),
    providerCalls: () => calls.filter(c => c.url.startsWith('https://api.daily.co/'))};
}

test('only a valid capability shape reaches the service-only claim; callers cannot choose a room or user', async () => {
  for (const input of [null, [], {}, {...capability, token: 'A'.repeat(64)}, {...capability, run_id: '../room'},
    {...capability, entry_ids: [id(200)]}, {...capability, room_name: job().room_name}]) {
    const h = harness(), response = await h.handler(request(input));
    assert.equal(response.status, 401);
    assert.equal(h.calls.length, 0);
  }
});

test('invalid methods, JSON and oversized payloads make no outbound request', async () => {
  const h = harness();
  assert.equal((await h.handler(new Request('https://worker.test'))).status, 405);
  assert.equal((await h.handler(new Request('https://worker.test', {method: 'POST', body: '{'}))).status, 400);
  assert.equal((await h.handler(new Request('https://worker.test', {method: 'POST', body: 'x'.repeat(1001)}))).status, 400);
  assert.equal(h.calls.length, 0);
});

test('missing configuration or rejected/used capability cannot contact Daily', async () => {
  const missing = harness({missingEnv: 'DAILY_API_KEY'});
  assert.equal((await missing.handler(request())).status, 503);
  assert.equal(missing.calls.length, 0);
  const rejected = harness({claim: () => json({error: 'secret database text'}, 403)});
  const response = await rejected.handler(request());
  assert.equal(response.status, 401);
  assert.equal(rejected.providerCalls().length, 0);
  assert.equal(JSON.stringify(await response.json()).includes('secret'), false);
});

test('the whole claimed list is validated before a provider mutation, including room and identity scope', async () => {
  const badLists = [{}, [null], [job(), {...job(2), room_name: job(1).room_name}],
    [{...job(), call_id: 'invalid'}], [{...job(), expires_at: 'invalid'}],
    [{...job(), entry_ids: []}], [{...job(), entry_ids: ['invalid']}],
    [job(), job()], [job(), job(2, job().entry_ids)],
    [job(1, [id(101), id(101)])], [job(1, Array.from({length: 101}, (_, n) => id(n + 100)))],
    Array.from({length: 6}, (_, n) => job(n + 1))];
  for (const jobs of badLists) {
    const h = harness({jobs}), response = await h.handler(request());
    assert.equal(response.status, 500);
    assert.equal(h.providerCalls().length, 0);
    assert.equal(h.actions('complete').length, 0);
  }
});

test('a grouped ban targets only the leased entry identities and completes that exact lease', async () => {
  const work = job(1, [id(101), id(102)]), h = harness({jobs: [work]});
  const response = await h.handler(request());
  assert.deepEqual(await response.json(), {completed: 1, deferred: 0});
  assert.deepEqual(h.actions('claim')[0].body.p_data, capability);
  assert.deepEqual(h.providerCalls()[0].body, {user_ids: work.entry_ids, ban: true});
  assert.deepEqual(h.actions('complete')[0].body.p_data,
    {run_id: capability.run_id, call_id: work.call_id, entry_ids: work.entry_ids});
  assert.equal(h.actions('defer').length, 0);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('an empty ejected participant list is accepted for a disconnected banned identity', async () => {
  const h = harness({daily: () => json({ejectedIds: []})});
  assert.deepEqual(await (await h.handler(request())).json(), {completed: 1, deferred: 0});
});

test('an empty server queue needs no provider request', async () => {
  const h = harness({jobs: []});
  assert.deepEqual(await (await h.handler(request())).json(), {completed: 0, deferred: 0});
  assert.equal(h.providerCalls().length, 0);
});

test('provider errors, including missing rooms, defer rather than declaring tokens revoked', async () => {
  for (const status of [400, 401, 404, 429, 500, 503]) {
    const h = harness({daily: () => json({error: 'private provider details'}, status)});
    const response = await h.handler(request());
    assert.deepEqual(await response.json(), {completed: 0, deferred: 1});
    assert.equal(h.actions('complete').length, 0);
    assert.equal(h.actions('defer')[0].body.p_data.code, 'daily_http_' + status);
    assert.equal(JSON.stringify(h.actions('defer')).includes('private provider details'), false);
  }
});

test('malformed success responses are retried without marking any lease complete', async () => {
  for (const result of [{}, null, {ejectedIds: 'all'}, {ejectedIds: [7]}, {ejectedIds: ['']}]) {
    const h = harness({daily: () => json(result)});
    assert.deepEqual(await (await h.handler(request())).json(), {completed: 0, deferred: 1});
    assert.equal(h.actions('complete').length, 0);
    assert.equal(h.actions('defer')[0].body.p_data.code, 'daily_invalid_response');
  }
  const h = harness({daily: () => new Response('not JSON')});
  await h.handler(request());
  assert.equal(h.actions('defer')[0].body.p_data.code, 'daily_invalid_response');
});

test('transport failures do not disclose error text, and defer uses the exact original lease', async () => {
  const h = harness({daily: () => { throw Error('request failed with private-daily and personal data'); }});
  const response = await h.handler(request());
  assert.deepEqual(await response.json(), {completed: 0, deferred: 1});
  assert.deepEqual(h.actions('defer')[0].body.p_data, {
    run_id: capability.run_id, call_id: job().call_id, entry_ids: job().entry_ids, code: 'provider_or_database_error'
  });
});

test('failed or unacknowledged completion defers the ban for an idempotent retry', async () => {
  for (const complete of [() => json({}, 503), () => json({completed: false}), () => new Response('invalid')]) {
    const h = harness({complete});
    assert.deepEqual(await (await h.handler(request())).json(), {completed: 0, deferred: 1});
    assert.equal(h.actions('complete').length, 1);
    assert.equal(h.actions('defer')[0].body.p_data.code, 'worker_database_error');
  }
});

test('a failed defer remains reported as deferred for database lease recovery', async () => {
  const h = harness({daily: () => json({}, 503), defer: () => { throw Error('database unavailable'); }});
  assert.deepEqual(await (await h.handler(request())).json(), {completed: 0, deferred: 1});
  assert.equal(h.actions('complete').length, 0);
});

test('up to five independent room jobs run concurrently and isolate provider failures', {timeout: 1000}, async () => {
  const work = Array.from({length: 5}, (_, n) => job(n + 1));
  let started = 0, release;
  const allStarted = new Promise(resolve => { release = resolve; });
  const h = harness({jobs: work, daily: async (_body, url) => {
    if (++started === 5) release();
    await allStarted;
    return url.includes(work[2].room_name) ? json({}, 503) : json({ejectedIds: []});
  }});
  assert.deepEqual(await (await h.handler(request())).json(), {completed: 4, deferred: 1});
  assert.equal(h.providerCalls().length, 5);
  assert.equal(h.actions('defer')[0].body.p_data.call_id, work[2].call_id);
  assert.deepEqual(h.actions('complete').map(call => call.body.p_data.call_id).sort(),
    work.filter((_, index) => index !== 2).map(item => item.call_id).sort());
});

test('one room can ban the full documented batch of 100 identities', async () => {
  const work = job(1, Array.from({length: 100}, (_, n) => id(n + 1000))), h = harness({jobs: [work]});
  assert.deepEqual(await (await h.handler(request())).json(), {completed: 1, deferred: 0});
  assert.deepEqual(h.providerCalls()[0].body.user_ids, work.entry_ids);
});
