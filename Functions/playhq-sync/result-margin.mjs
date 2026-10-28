// A margin follows the provider's declared winner; it never determines a winner.
// Calculate only an ordinary, completed, two-innings limited-overs result.
export function summaryMargin(game,summary){
 if(!summary?.complete||!Array.isArray(summary.periods)||!Array.isArray(game?.teams)||!Array.isArray(game.appearances)||!['t20','twenty20','oneday','limitedovers'].includes(String(game.type||'').toLowerCase().replace(/[^a-z0-9]/g,'')))return '';
 const winner=game.teams.filter(t=>t.outcome==='WON'),loser=game.teams.filter(t=>t.outcome==='LOST');
 if(winner.length!==1||loser.length!==1||winner[0].id===loser[0].id)return '';
 const sensitive=/DLS|DUCKWORTH|VJD|REVISED|ADJUSTED|TARGET|FORFEIT|SUPER.?OVER/i;
 // Unknown adjusted targets and special results must not become arithmetic margins.
 const special=value=>value&&typeof value==='object'&&Object.entries(value).some(([key,v])=>
  /target|adjust/i.test(key)&&v!=null||/result|method|condition|notes/i.test(key)&&sensitive.test(JSON.stringify(v))||special(v));
 if(special(game))return '';
 const periods=[...summary.periods].sort((a,b)=>a.sequence-b.sequence);
 if(periods.length!==2||!Number.isInteger(periods[0].sequence)||!Number.isInteger(periods[1].sequence)||periods[0].sequence===periods[1].sequence)return '';
 if(periods.some(p=>!Array.isArray(p.teams)))return '';
 const bats=periods.map(p=>p.teams.filter(t=>t.discipline==='BATTING'));
 if(bats.some(a=>a.length!==1))return '';
 const [first,last]=bats.map(a=>a[0]),a=first.statistics,b=last.statistics;
 if(first.team_id===last.team_id||![winner[0].id,loser[0].id].includes(first.team_id)||![winner[0].id,loser[0].id].includes(last.team_id))return '';
 if([a,b].some(s=>!s||Object.keys(s).some(k=>sensitive.test(k))||!Number.isInteger(s.TOTAL_SCORE)||s.TOTAL_SCORE<0||!Number.isInteger(s.TOTAL_OUTS)||s.TOTAL_OUTS<0||s.TOTAL_OUTS>10||!Number.isFinite(s.OVER_LIMIT)||s.OVER_LIMIT<=0)||a.OVER_LIMIT!==b.OVER_LIMIT)return '';
 if([a,b].some(s=>Object.entries(s).some(([k,v])=>/PENALTY/.test(k)&&v!==0)))return '';
 const ended=t=>['ALL_OUT','COMPULSORY_CLOSE','END_OF_INNINGS'].includes(t.status)||t.statistics.TOTAL_OVERS===t.statistics.OVER_LIMIT;
 if(!ended(first))return '';
 if(first.team_id===winner[0].id){
  const runs=a.TOTAL_SCORE-b.TOTAL_SCORE;
  return ended(last)&&runs>0?`${runs} run${runs===1?'':'s'}`:'';
 }
 if(b.TOTAL_SCORE<=a.TOTAL_SCORE||last.status==='ALL_OUT')return '';
 // Extra registered players may be substitutes; an ordinary innings has at most ten wickets.
 const players=game.appearances.filter(p=>p.teamId===last.team_id&&p.roleType==='Player');
 if(players.length<2||players.some(p=>!p.id)||new Set(players.map(p=>p.id)).size!==players.length)return '';
 const wickets=Math.min(10,players.length-1)-b.TOTAL_OUTS;
 return wickets>0?`${wickets} wicket${wickets===1?'':'s'}`:'';
}
