const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isUuid = value => typeof value === 'string' && uuid.test(value);
const fail = code => { throw new Error(code); };
const safeCode = error => {
  const code = error?.message;
  return ['worker_database_error', 'daily_invalid_response'].includes(code) || /^daily_http_[0-9]{3}$/.test(code || '')
    ? code : 'provider_or_database_error';
};

// Validate the entire leased batch before any provider mutation. Identities and
// room names are supplied only by the service-only queue RPC, never the caller.
function validWorkList(jobs) {
  if (!Array.isArray(jobs) || jobs.length > 5) return false;
  const calls = new Set(), entries = new Set();
  for (const job of jobs) {
    if (!job || !isUuid(job.call_id) || calls.has(job.call_id)
      || job.room_name !== 'cb-' + job.call_id.replaceAll('-', '')
      || typeof job.expires_at !== 'string' || !Number.isFinite(Date.parse(job.expires_at))
      || !Array.isArray(job.entry_ids) || !job.entry_ids.length || job.entry_ids.length > 100) return false;
    calls.add(job.call_id);
    for (const id of job.entry_ids) {
      if (!isUuid(id) || entries.has(id)) return false;
      entries.add(id);
    }
  }
  return true;
}

export function createRevocationHandler({env, fetcher = fetch}) {
  return async req => {
    const reply = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
    });
    if (req.method !== 'POST') return reply({error: 'POST required'}, 405);
    let input;
    try {
      const raw = await req.text();
      if (raw.length > 1000) return reply({error: 'Invalid worker request'}, 400);
      input = JSON.parse(raw);
      if (!input || Array.isArray(input) || !isUuid(input.run_id)
        || typeof input.token !== 'string' || !/^[0-9a-f]{64}$/.test(input.token)
        || Object.keys(input).some(key => !['run_id', 'token'].includes(key))) {
        return reply({error: 'Worker authorization required'}, 401);
      }
    } catch { return reply({error: 'Invalid worker request'}, 400); }

    const base = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY'), key = env('DAILY_API_KEY');
    if (!base || !service || !key) return reply({error: 'Worker unavailable'}, 503);
    const rpc = async (action, data) => {
      const response = await fetcher(base + '/rest/v1/rpc/selection_video_revocation_worker', {
        method: 'POST', redirect: 'error',
        headers: {apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json'},
        body: JSON.stringify({p_action: action, p_data: data}), signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) fail('worker_database_error');
      try { return await response.json(); } catch { fail('worker_database_error'); }
    };
    let jobs;
    try { jobs = await rpc('claim', {run_id: input.run_id, token: input.token}); }
    catch { return reply({error: 'Worker authorization failed'}, 401); }
    if (!validWorkList(jobs)) return reply({error: 'Invalid work list'}, 500);

    // Five independent room requests run concurrently. Each network operation
    // has an eight-second deadline; even complete-then-defer failure stays
    // below 32 seconds of network waits including the initial claim.
    const outcomes = await Promise.all(jobs.map(async job => {
      const lease = {run_id: input.run_id, call_id: job.call_id, entry_ids: job.entry_ids};
      try {
        const response = await fetcher('https://api.daily.co/v1/rooms/' + job.room_name + '/eject', {
          method: 'POST', redirect: 'error',
          headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
          body: JSON.stringify({user_ids: job.entry_ids, ban: true}), signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) fail('daily_http_' + response.status);
        let result;
        try { result = await response.json(); } catch { fail('daily_invalid_response'); }
        if (!result || !Array.isArray(result.ejectedIds)
          || result.ejectedIds.some(id => typeof id !== 'string' || !id.length)) fail('daily_invalid_response');
        // Daily documents ban by user_id, including rejoin prevention. An
        // empty list can mean no active participant was ejected; it does not
        // identify a different entry or authorise cancelling its reservation.
        const completed = await rpc('complete', lease);
        if (completed?.completed !== true) fail('worker_database_error');
        return 'completed';
      } catch (error) {
        try { await rpc('defer', {...lease, code: safeCode(error)}); }
        catch { /* The lease expires and the scheduled worker retries. */ }
        return 'deferred';
      }
    }));
    return reply({completed: outcomes.filter(value => value === 'completed').length,
      deferred: outcomes.filter(value => value === 'deferred').length});
  };
}
