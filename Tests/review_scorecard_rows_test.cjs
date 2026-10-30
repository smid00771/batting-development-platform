const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
test('completed-scorecard rows use confirmed identities and do not pretend to be published selections',()=>{
 const selection={status:'scorecard',players:[{player_id:'p1',roster_id:'r1',name:'One',can_edit:true,account_pending:true},{player_id:'p2',roster_id:'r2',name:'Two',can_edit:false}]};
 const state={fixtureId:'f',fixtures:[{id:'f',selection}],loaded:{},group:'g'};
 const c=vm.createContext({ensureTeamReviewState:()=>state});
 const get=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
 vm.runInContext(get('function teamReviewSelection(','function teamReviewSignupIcon')+get('function teamReviewPlayerMeta(','function teamReviewSelectionHelp')+get('function teamReviewCanChoosePlayers(','function teamReviewRosterIds'),c);
 const rows=c.teamReviewSelectedRows(state,[{player_id:'p1',can_edit:true},{player_id:'p2',can_edit:false}]);
 assert.equal(rows.length,2);assert.equal(rows[0].from_scorecard,true);assert.equal(rows[0].selected_in_teams,false);assert.equal(rows[0].account_pending,true);
 assert.equal(rows[1].selection_only,true);assert.equal(rows[1].can_edit,false);
 assert.equal(c.teamReviewPlayerMeta(rows[0]),'Played · confirmed scorecard');assert.equal(c.teamReviewCanChoosePlayers(state),false);
 selection.status='unpublished';assert.equal(c.teamReviewSelectedRows(state,[{player_id:'p1'}]).length,0);
});
