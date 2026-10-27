// Fictional local data only. Share the demo's saved scorecards with other features.
export function createSeasonStatsDemo(getState, getCards, getLinks, getMember, getClub, getToday) {
  const copy = value => structuredClone(value);
  function seed(state, cards) {
    if (state.stats_seeded) return;
    state.stats_seeded = true;
    for (const [teamIndex,fixture] of state.fixtures.entries()) {
      const d = fixture.published?.details || fixture.details;
      for (let round = 0; round < 3; round++) {
        const played = new Date(d.days[0].date + 'T12:00:00Z'); played.setUTCDate(played.getUTCDate() - 21 + round * 7);
        const day = played.toISOString().slice(0,10), matchId = `eeeeeeee-0000-4000-8000-${String(teamIndex * 10 + round + 1).padStart(12,'0')}`;
        const players = [...new Set(fixture.slots.map(slot => slot.d1).filter(Boolean))].map(id => ({player_id:'demo-' + id, name:state.roster.find(p => p.id === id)?.name || 'Demo player'}));
        const our = 'example-home-' + teamIndex, away = 'example-away';
        cards['example-stats-' + matchId] = {provider:'playcricket_au', schema_version:2, match_id:matchId, url:null,
          dates:[day], status:'completed', format_key:d.format, grade:d.grade, competition:d.competition,
          teams:[{id:our, name:'Example club', lineup_available:true, players}, {id:away, name:['Bay Example CC','Hill Example CC','River Example CC'][round]}],
          innings:[{id:matchId + '-bat', team_id:our, number:1, complete:true, batters:players.map((p,i) => ({...p,
            status:i > 8 ? 'did_not_bat' : 'played', runs:i > 8 ? null : (13 + i * 9 + round * 17 + teamIndex * 6) % 81,
            not_out:i === 8, balls:24 + i * 7 + round * 3, fours:i % 4, sixes:0, importable:true}))},
          {id:matchId + '-bowl', team_id:away, number:1, complete:true, bowling_available:true, bowlers:players.slice(6).map((p,i) => ({...p,
            team_id:our, wickets:(i + round) % 4, runs:15 + i * 6 + round, balls:36 + i * 5, maidens:1, importable:true}))}]
        };
      }
    }
  }
  return function rpc(args) {
    const state = getState(), member = getMember(), today = getToday(), cards = getCards();
    if (!state || args.p_club_id !== getClub() || !member?.user_id) throw Error('Current club membership is required');
    const admin = member.permission_role === 'admin';
    if (state.access.status === 'disabled' || !(admin || member.permission_role === 'captain' || state.selectors.includes(member.user_id) || state.access.head_selector_id === member.user_id)) throw Error('Current Teams selection or captain access is required');
    if (!['context','set_season'].includes(args.p_action || 'context')) throw Error('Unknown season stats action');
    if ((args.p_action||'context')==='context'&&args.p_data?.on_demand!==true) throw Error('Analysis runs on request. Use Show form indicators or Compare returning players to calculate once.');
    let year = Number(today.slice(0,4)); if (today.slice(5,7) < '07') year--;
    state.stats_season ||= {start:year + '-07-01', end:(year+1) + '-06-30', revision:0};
    if (args.p_action === 'set_season') {
      if (!admin) throw Error('Club Admin can change season dates');
      const d = args.p_data;
      if (d.expected_revision !== state.stats_season.revision) throw Error('Season dates changed. Update totals before saving again');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.start) || !/^\d{4}-\d{2}-\d{2}$/.test(d.end) || d.end < d.start || (Date.parse(d.end)-Date.parse(d.start))/86400000 > 366) throw Error('Choose season dates in order, up to one year apart');
      state.stats_season = {start:d.start, end:d.end, revision:state.stats_season.revision+1};
    }
    seed(state, cards);
    const season = state.stats_season, fixtures = state.fixtures.map(f => ({id:f.id,...(f.published?.details || f.details),
      match_id:state.result_sources?.[f.id]?.match_id || f.scorecard_sync?.match_id || null, no_play:state.result_sources?.[f.id]?.no_play || false}));
    const wrapped = Object.entries(cards).map(([snapshot_id,scorecard], index) => {
      const fixture = fixtures.find(f => f.match_id === scorecard.match_id);
      return {snapshot_id, scorecard, our_team:state.result_sources?.[fixture?.id]?.team_id || scorecard.teams[0]?.id, fixture_id:fixture?.id || null,
        fetched_at:new Date(Date.UTC(2026,0,1,0,0,index)).toISOString()};
    });
    const identities = state.roster.map(p => ({source_id:'demo-' + p.id, roster_id:p.id, name:p.name}));
    for (const item of state.scorecard_links || []) identities.push({source_id:item.source_id,roster_id:item.roster_id,name:state.roster.find(p => p.id === item.roster_id)?.name});
    for (const item of getLinks()) if (!identities.some(x => x.source_id === item.source_player_id)) identities.push({source_id:item.source_player_id,player_id:item.player_id});
    return copy({season:{...season,label:season.start.slice(0,4) === season.end.slice(0,4) ? season.start.slice(0,4) : season.start.slice(0,4) + '/' + season.end.slice(2,4)}, today, can_set_season:admin, cards:wrapped, fixtures, identities});
  };
}
