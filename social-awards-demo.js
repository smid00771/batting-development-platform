/* The public demo uses the live award UI with fictional, in-memory records. */
export function createSocialAwardsDemo(getState, getResults, getSocial, getMember, getUser) {
  const copy = value => structuredClone(value), records = new WeakMap();
  const kinds = ['team_week', 'player_week', 'results', 'five_wickets', 'century'];
  function state() {
    const club = getState();
    if (!records.has(club)) records.set(club, {
      settings: {enabled: [...kinds], revision: 0, milestone_alerts: false},
      designs: {}, photos: [], requests: [], editions: []
    });
    return records.get(club);
  }
  function performances(end) {
    const result = getResults().context(end), candidates = [], cards = [];
    for (const saved of result.cards) {
      const card = saved.scorecard;
      if ([...card.dates].sort().at(-1) > end) continue;
      cards.push({...saved, matched: true, status: card.status});
      if (card.status !== 'completed') continue;
      const other = card.teams.find(t => t.id !== saved.our_team);
      const common = {snapshot_id: saved.snapshot_id, match_id: card.match_id,
        our_team: saved.our_team, team_id: saved.our_team, grade: card.grade,
        opposition: other?.name || '', teams: copy(card.teams), dates: copy(card.dates)};
      const add = item => candidates.push({...common, ...item,
        signature: JSON.stringify([card.match_id, item.key, item.stat || card.innings, card.result])});
      add({kind: 'results', key: card.match_id + ':results',
        innings: copy(card.innings), result: card.result, format: card.format_key});
      for (const innings of card.innings) {
        const batting = innings.team_id === saved.our_team;
        for (const player of batting ? innings.batters || [] : innings.bowlers || []) {
          const qualifies = batting ? player.status !== 'did_not_bat' && player.runs >= 100 : player.wickets >= 5;
          if (!qualifies) continue;
          const kind = batting ? 'century' : 'five_wickets';
          add({kind, key: [card.match_id, innings.id, kind, player.player_id].join(':'),
            player_id: player.player_id, name: player.name, innings_number: innings.number,
            stat: copy(player)});
        }
      }
    }
    return {cards, candidates};
  }
  return {
    async rpc(name, args = {}) {
      if (name !== 'club_social_awards_api') return {error: {message: 'Unknown demo awards API'}};
      try {
        if (getMember()?.permission_role !== 'admin' && !getSocial().managers.includes(getUser())) {
          throw Error('Club Admin or Socials Manager access required');
        }
        const s = state(), d = args.p_data || {}, action = args.p_action;
        let result;
        if (action === 'settings') result = s.settings;
        else if (action === 'context') {
          const scores = performances(d.week_end);
          result = {timezone: getState().access.timezone, settings: s.settings, ...scores,
            designs: s.designs, photos: s.photos.filter(p => p.week_end === d.week_end), requests: s.requests,
            editions: s.editions.filter(e => e.sealed && e.week_end === d.week_end).map(e => ({...e,
              scores_current: e.sources.every(source => scores.candidates.some(p => p.key === source.key && p.signature === source.signature))}))};
        } else if (action === 'save_settings') {
          if (d.revision !== s.settings.revision) throw Error('Award choices changed. Reload before saving.');
          if (!Array.isArray(d.enabled) || d.enabled.some(k => !kinds.includes(k))) throw Error('Choose awards from the list.');
          s.settings = {enabled: [...new Set([...d.enabled,...(d.milestone_alerts?['century','five_wickets']:[])])], revision: d.revision + 1, milestone_alerts: d.milestone_alerts??s.settings.milestone_alerts??false};
          result = {saved: true, ...s.settings};
        } else if (action === 'request') {
          if (!d.id || !d.name?.trim() || !d.criteria?.trim()) throw Error('Enter an award name and criteria.');
          if (!s.requests.some(r => r.id === d.id)) s.requests.unshift({...copy(d),
            status: 'requested', updated_at: new Date().toISOString(),
            reply: 'Demo request saved. No request has been sent to Club Batting.'});
          result = {saved: true, id: d.id};
        } else if (action === 'save_design') {
          if (!['results', 'five_wickets', 'century'].includes(d.kind)) throw Error('Choose an award type.');
          const old = s.designs[d.kind];
          if (d.revision !== (old?.revision || 0)) throw Error('Layout changed. Reload before saving.');
          s.designs[d.kind] = {layout: copy(d.layout), revision: d.revision + 1};
          result = {saved: true, revision: d.revision + 1};
        } else if (action === 'save_photo') {
          const old = s.photos.find(p => p.week_end === d.week_end && p.kind === d.kind && p.player_id === d.player_id);
          if (d.revision !== (old?.revision || 0)) throw Error('Photo changed. Reload before saving.');
          const value = {...copy(d), revision: d.revision + 1};
          if (old) Object.assign(old, value); else s.photos.push(value);
          result = {saved: true, revision: value.revision};
        } else if (action === 'reserve_image') {
          let edition = s.editions.find(e => e.id === d.id);
          if (!edition) {
            if (!s.settings.enabled.includes(d.kind)) throw Error('Enable this graphic in Socials Awards first.');
            const pool = performances(d.week_end).candidates;
            if (!d.sources?.length || d.sources.some(source => !pool.some(p => p.kind === d.kind && p.key === source.key && p.signature === source.signature))) throw Error('Scores changed. Review the current figures.');
            edition = {...copy(d), bucket: 'club-social-awards', image_path: args.p_club_id + '/editions/' + d.id + '.png',
              performance_keys: d.sources.map(p => p.key), created_at: new Date().toISOString(), sealed: false};
            s.editions.push(edition);
          }
          result = {id: edition.id, path: edition.image_path, sealed: edition.sealed};
        } else if (action === 'finish_image') {
          const edition = s.editions.find(e => e.id === d.id);
          if (!edition || !getSocial().files.has(edition.image_path)) throw Error('Upload the image first.');
          edition.sealed = true; result = {saved: true};
        } else throw Error('Unknown demo awards action.');
        return {data: copy(result), error: null};
      } catch (error) {return {data: null, error: {message: error.message}};}
    }
  };
}
