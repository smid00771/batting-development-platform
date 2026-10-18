// Fictional records for UI and browser checks; never production player data.
export function selectionEvidenceFixture() {
  const names=['Alex Rowan','Jamie Quinn','Morgan Lee','Taylor Blake','Riley Hart','Casey Reid','Jordan Cole','Sam Ellis','Charlie Park','Drew Lane','Hayden West'];
  const roster=[],teams=[],cards=[],identities=[],fixtures=[];
  for(let grade=1;grade<=2;grade++){
    const id='team-'+grade,label=grade===1?'1st Grade':'2nd Grade';
    const team={id,grade:label,competition:'NDCA',format:'long_form',level:grade,days:[{date:'2026-10-24'}],slots:[]};
    names.forEach((name,index)=>{
      const player={id:`g${grade}p${index}`,name:grade===1?name:'Pat '+name.split(' ')[1],active:true,batting:index<3?'top':index<7?'middle':'lower',bowling:index>=4&&index!==6?(index===5||index===9?'spin':'pace'):'none',bowling_load:index>=4&&index!==6?'frontline':'unknown',keeper:index===3,availability:{available_dates:['2026-10-24']}};
      roster.push(player);team.slots.push({d1:player.id});identities.push({source_id:'source-'+player.id,roster_id:player.id,name:player.name});
    });
    team.lineupPublished=true;team.published={details:{grade:team.grade,competition:team.competition,format:team.format,days:structuredClone(team.days)},slots:structuredClone(team.slots)};teams.push(team);
    for(let game=0;game<4;game++){
      const match=`match-${grade}-${game}`,day=['2026-10-03','2026-10-10','2026-10-17','2026-10-24'][game],players=roster.filter(p=>p.id.startsWith('g'+grade));
      const batters=players.map((p,index)=>({player_id:'source-'+p.id,name:p.name,status:index===2&&game>0?'did_not_bat':'played',runs:index===2&&game>0?0:grade===1?[10,20,40,12,8,13,16,4,3,9,5][index]:[38,40,30,38,35,25,36,15,17,8,12][index],not_out:false,balls:40,importable:true}));
      const bowlers=players.filter(p=>p.bowling!=='none').map(p=>{const index=Number(p.id.split('p')[1]);return {player_id:'source-'+p.id,name:p.name,team_id:'us',wickets:grade===1?(index===4?0:2):3,runs:grade===1?(index===4?45:30):24,balls:48,maidens:0,importable:true};});
      cards.push({snapshot_id:match,fixture_id:match,our_team:'us',scorecard:{match_id:match,status:'completed',dates:[day],grade:label,competition:'NDCA',format_key:'long_form',teams:[{id:'us',players:players.map(p=>({player_id:'source-'+p.id,name:p.name})),lineup_available:true},{id:'them',name:'Example visitors'}],innings:[{id:match+'bat',team_id:'us',number:1,complete:true,batters},{id:match+'bowl',team_id:'them',number:1,complete:true,bowling_available:true,bowlers}]}});
      fixtures.push({id:match,grade:label,competition:'NDCA',format:'long_form',days:[{date:day}],match_id:match});
    }
  }
  return {roster,teams,context:{season:{start:'2026-07-01',end:'2027-06-30',label:'2026/27'},today:'2026-10-25',can_set_season:false,fixtures,cards,identities}};
}
