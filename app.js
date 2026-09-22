// Club Batting v0.8.58.1 — Newcastle City player journey; video parked
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const app=document.getElementById('app');
const APP_UI_VERSION='0.8.60';

function upgradeLegacyHowWeBatWording(draft){
  if(!draft || typeof draft!=='object')return draft;
  const formats=draft.formats||{};
  for(const f of Object.values(formats)){
    if(!f || !Array.isArray(f.banners))continue;
    for(const b of f.banners){
      // Only upgrade the platform's old default. Genuine club-written wording is untouched.
      if(b?.key==='use_phase' && b.title==='USE THE PHASE')b.title='KNOW WHEN TO GO';
    }
  }
  if(typeof draft.closing_strapline==='string' && draft.closing_strapline.includes('USE THE PHASE')){
    draft.closing_strapline=draft.closing_strapline.replaceAll('USE THE PHASE','KNOW WHEN TO GO');
  }
  return draft;
}

let session=null;
let allMemberships=[];
let platformRole=null;
let platformAccessError=false;
let canBootstrapPlatform=false;
let platformView='market';
let platformSelectedProspectId=null;
let platformSelectedOnboardingId=null;
let platformOnboardingSeed=null;
let platformDiscoveryResults=[];
let platformMarketAssociationId='';
let platformMarketAssociationSearch='';
let platformMarketFitFilter='likely';
let platformMarketSelectedClubIds=new Set();
let platformMarketReviewFilter='ready';
let platformMarketClubSearch='';
let platformMarketAssociationFilter='';
let platformMarketActionMessage='';
let platformMarketRenderVersion=0;
let platformMarketResearchDraft={associationId:'',targetCount:'25',budgetUsd:''};
let platformMarketResearchStartRequest=null;
let platformMarketResearchStartBusy=false;
let platformMarketResearchJobFilter='';
let platformMarketResearchMessage='';
const PLATFORM_MARKET_SCROLL_KEY='bdp-platform-market-scroll-y-v0851';
let platformMarketScrollY=Number(sessionStorage.getItem(PLATFORM_MARKET_SCROLL_KEY)||0);
let platformMarketRestoreTimer=null;
let platformMarketScrollSuppressed=false;
let club=null;
let membership=null;
let userProfile=null;
let clubProfile={};                 // my working philosophy response
let selectedDims=new Map();          // my working response
let weights=new Map();               // my working response

let publishedProfile={};             // current published/live club philosophy
let publishedSelectedDims=new Map();
let publishedWeights=new Map();

let workshop=null;
let myContributor=null;
let myContribution=null;
let philosophyVersions=[];
let dimensions=[];
let myPlayer=null;
let workflow=null;
let currentTab='workshop';
let previewFormat='limited_overs';
let builderSection='core';
let howWeBatDraft=null;
let howWeBatVersions=[];
let howWeBatBuilderFormat='limited_overs';
let howWeBatBuilderDirty=false;
let howWeBatBuilderSaving=false;
let publishedHowWeBatFormat='limited_overs';
let playerPlanStructureDraft=null;
let playerPlanStructureVersions=[];
let playerPlanStructureSection='core';
let playerPlanStructureWorking=null;
let playerPlanStructureDirty=false;
let playerPlanStructureManualEdit=false;
let philosophyScenarioSelectedIds=new Set();
let philosophyScenarioStateKey='';
let philosophyScenarioFormat='limited_overs';

let playersWorkspaceClubId=null;
let playersWorkspaceData=null;
let playersWorkspaceSelectedId=null;
let playersWorkspaceSection='summary';
let playersWorkspaceLocalRaw=null;
let playersWorkspaceAutosaveTimer=null;
let playersWorkspaceSearch='';
let playersWorkspaceGroupFilter='';
let playersWorkspaceDevelopmentMode=null;
let playersWorkspaceDevelopmentMatchId=null;
let playersWorkspaceFeedbackData=null;
let playersWorkspaceReminderData=null;
let playersWorkspaceDiscussionKey=null;

let howWeTrainSelectedFormats=new Set(['limited_overs']);
let howWeTrainReflectionEditId=null;
let myDevelopmentFeedback=null;

let feedbackWorkspaceClubId=null;
let feedbackWorkspaceData=null;
let feedbackWorkspaceSection='discussion';
let feedbackWorkspacePlayerFilter='all';
let feedbackWorkspaceSelectedPlayerId=null;
let feedbackWorkspaceEntryMode=null;
let feedbackWorkspaceMatchId=null;
let feedbackWorkspaceDiscussionKey=null;

let guideSelectedCapabilityKey='whole_process';
let guideChatBusy=false;

let clubBrandingDraftClubId=null;
let clubBrandingDraft=null;
let clubBrandingLogoSuggestions=[];
let clubBrandingWebsiteSuggestion=null;
let clubBrandingLogoPaletteSource='';
let clubBrandingLogoPaletteLoading=false;

const FORMATS=[
  ['t20','T20'],
  ['limited_overs','Limited Overs'],
  ['long_form','Long Form']
];

const WEIGHT_LABELS=['Not used','Low','Medium','High','Very High'];

const IDENTITY_OPTIONS=[
 ['strong_decisions','Make strong decisions','Judge each situation well rather than chasing outcomes.'],
 ['play_strengths','Play to their strengths','Build a method around what the individual batter genuinely owns.'],
 ['adapt','Adapt to conditions','Change method when pitch, bowling, field or match situation changes.'],
 ['commit','Commit to decisions','Once the decision is made, execute it positively.'],
 ['partnerships','Build partnerships','Understand that batting is a shared problem between two players.'],
 ['pressure','Put bowlers under pressure','Look for ways to make the bowler and captain keep solving problems.'],
 ['smart_risk','Manage risk intelligently','Understand when risk is justified rather than treating all aggression equally.'],
 ['composure','Stay composed','Recognise emotional drift and reset quickly.'],
 ['wicket_value','Value their wicket','Treat dismissal as a significant team cost while still looking to score.'],
 ['intent','Bat with intent','Have a clear purpose rather than simply surviving deliveries.']
];

const DEFAULT_WEIGHTS={
 wicket_preservation:{t20:2,limited_overs:3,long_form:4},
 leaving_defending:{t20:0,limited_overs:1,long_form:4},
 strike_rotation:{t20:2,limited_overs:4,long_form:4},
 boundary_access:{t20:4,limited_overs:3,long_form:2},
 running:{t20:3,limited_overs:4,long_form:2},
 scoring_areas:{t20:4,limited_overs:3,long_form:3},
 tempo:{t20:4,limited_overs:4,long_form:2},
 matchups:{t20:4,limited_overs:3,long_form:1},
 spin_method:{t20:3,limited_overs:3,long_form:3},
 pace_method:{t20:3,limited_overs:3,long_form:3},
 risk_management:{t20:4,limited_overs:4,long_form:4},
 reset_routines:{t20:3,limited_overs:3,long_form:3},
 dot_ball_management:{t20:4,limited_overs:3,long_form:1},
 powerplay:{t20:4,limited_overs:3,long_form:0},
 death_overs:{t20:4,limited_overs:3,long_form:0},
 innovation:{t20:3,limited_overs:2,long_form:1},
 patience:{t20:1,limited_overs:2,long_form:4},
 partnerships:{t20:2,limited_overs:4,long_form:4}
};

const HOW_WE_BAT_BANNERS={
  value_wicket:{
    title:'VALUE YOUR WICKET',
    dimensions:{
      wicket_preservation:1,
      leaving_defending:.9,
      patience:.8,
      risk_management:.55,
      reset_routines:.25,
      partnerships:.2
    },
    identity:{wicket_value:1,smart_risk:.45,composure:.2},
    messages:{
      t20:'Protect the wicket without becoming passive. Choose risk deliberately and keep your strongest scoring options available.',
      limited_overs:'Make the bowler earn your wicket. Build the innings, manage risk and give the team the chance to use its overs.',
      long_form:'Make the bowler earn your wicket. Leave and defend with conviction, stay patient and expand only when the game gives you the opportunity.'
    }
  },
  keep_moving:{
    title:'KEEP THE INNINGS MOVING',
    dimensions:{
      strike_rotation:1,
      running:.85,
      dot_ball_management:.7,
      partnerships:.45,
      scoring_areas:.3,
      tempo:.25
    },
    identity:{partnerships:.6,pressure:.45,intent:.25},
    messages:{
      t20:'When the boundary is not there, keep solving the over. Find safe singles, run hard and stop dot balls becoming emotional pressure.',
      limited_overs:'Know your get-off-strike options against pace and spin. Keep partnerships moving and make the bowler continually adjust.',
      long_form:'Rotate strike without widening your risk. A controlled single changes the bowler’s problem and keeps the partnership active.'
    }
  },
  scoring_game:{
    title:'KNOW WHERE YOU SCORE',
    dimensions:{
      scoring_areas:1,
      boundary_access:.9,
      pace_method:.7,
      spin_method:.7,
      matchups:.4,
      innovation:.2
    },
    identity:{play_strengths:.8,commit:.55,intent:.25},
    messages:{
      t20:'Know the deliveries and areas you can access with conviction. Expand the scoring game deliberately rather than manufacturing shots under pressure.',
      limited_overs:'Build the innings around the scoring options you genuinely own. When the bowler misses into your areas, commit.',
      long_form:'Be clear about the balls you want to score from. Let the bowler come into your strengths rather than searching for runs from good bowling.'
    }
  },
  control_tempo:{
    title:'CONTROL THE TEMPO',
    dimensions:{
      tempo:1,
      risk_management:.6,
      dot_ball_management:.55,
      partnerships:.45,
      reset_routines:.4,
      boundary_access:.25
    },
    identity:{strong_decisions:.5,smart_risk:.6,composure:.45,intent:.3},
    messages:{
      t20:'Know when the game needs acceleration and when it needs control. Change tempo because the match demands it, not because frustration does.',
      limited_overs:'Move through the innings deliberately. Build, rotate and accelerate with the match situation rather than drifting between gears.',
      long_form:'Control the rhythm of the innings. Stay patient through strong bowling and recognise when the game has shifted in your favour.'
    }
  },
  pressure_bowler:{
    title:'MAKE THE BOWLER SOLVE PROBLEMS',
    dimensions:{
      matchups:.8,
      strike_rotation:.55,
      running:.45,
      scoring_areas:.4,
      innovation:.35,
      powerplay:.4,
      death_overs:.4
    },
    identity:{pressure:1,adapt:.35,commit:.25},
    messages:{
      t20:'Use matchups, movement, running and scoring access to stop the bowler settling into one problem for six balls.',
      limited_overs:'Change strike, expose different strengths and use the field. Make the bowler and captain continually adjust to the partnership.',
      long_form:'Pressure does not have to mean boundary hitting. Change strike, own your scoring areas and stop the bowler controlling every ball on their terms.'
    }
  },
  read_game:{
    title:'READ THE GAME',
    dimensions:{
      matchups:.7,
      pace_method:.55,
      spin_method:.55,
      tempo:.5,
      risk_management:.45,
      reset_routines:.4,
      partnerships:.25
    },
    identity:{adapt:1,strong_decisions:.7,composure:.35},
    messages:{
      t20:'Read the bowler, field and match phase. Use your game differently when the problem in front of you changes.',
      limited_overs:'Your plan gives you a core game; the match tells you how to use it. Read the bowler, field, score and partnership before changing method.',
      long_form:'Conditions, bowling plans and fields change. Keep your core method, but adapt how you access runs and defend your wicket.'
    }
  },
  use_phase:{
    title:'KNOW WHEN TO GO',
    dimensions:{
      powerplay:1,
      death_overs:1,
      tempo:.55,
      boundary_access:.45,
      matchups:.35,
      risk_management:.3
    },
    identity:{strong_decisions:.35,pressure:.35,smart_risk:.35},
    messages:{
      t20:'Field restrictions, middle overs and the death ask different questions. Know which scoring options and risks belong in each phase.',
      limited_overs:'Use field restrictions and late-innings opportunities deliberately. The right option changes as the innings moves through its phases.',
      long_form:'Different periods of the day create different opportunities. Recognise when to absorb pressure, rebuild or expand.'
    }
  }
};

const HOW_WE_BAT_FORMAT_COPY={
  t20:{
    intro:'T20 demands clarity under time pressure. Keep the core of the club philosophy, then widen the scoring game when the match requires it.',
    callout:'Create pressure without turning every ball into a boundary attempt.'
  },
  limited_overs:{
    intro:'Limited-overs batting is about using the available balls well: protect the wicket, keep the innings moving and commit when the scoring ball arrives.',
    callout:'Score from more balls without needlessly increasing the risk of dismissal.'
  },
  long_form:{
    intro:'Long-form batting rewards discipline. Make the bowler earn the wicket, keep the partnership alive and expand only when the game gives you the right opportunity.',
    callout:'Be hard to dismiss without becoming easy to contain.'
  }
};


const HOW_WE_BAT_REFERENCE={
  value_wicket:{
    t20:[
      'Protecting your wicket does not mean becoming passive. Keep looking for low-risk ways to score.',
      'Choose extra risk because the match situation justifies it — not because a few dot balls have made you impatient.',
      'A good ball can earn a dot. Your job is to make the bowler produce enough good balls to control you.',
      'When the ball suits one of the shots you have practised, trust that work and commit fully.'
    ],
    limited_overs:[
      'Your wicket gives the team access to more of its available deliveries. Make the bowler earn it.',
      'Build the innings without becoming stuck: defend the good ball, rotate when the safe single is available and punish genuine scoring balls.',
      'Choose risk according to wickets in hand, the score, the partnership and the stage of the innings.',
      'Review the choice of shot against the ball and situation, then look at execution separately. A dismissal alone does not make either wrong; use what you learn to shape practice, without judgement.'
    ],
    long_form:[
      'Leave and defend with conviction. You do not need to manufacture a scoring option from a ball that has not earned one.',
      'Patience is active: keep reading the bowler, field and conditions while waiting for the contest to move into your strengths.',
      'Make the bowler repeatedly execute their plan. The longer you occupy the crease, the more often they must solve you again.',
      'Expand your scoring game when you are established or the bowling gives you the opportunity — not simply because time has passed.'
    ]
  },
  keep_moving:{
    t20:[
      'When the boundary is not there, identify the safest way to turn the ball into one or two.',
      'Read the field before the ball. Know where the low-risk single is likely to be and what delivery lets you access it.',
      'Run hard enough that fielders feel pressure even when you are not hitting boundaries.',
      'Do not let dot-ball pressure trick you into manufacturing a boundary option that is not part of your game.'
    ],
    limited_overs:[
      'A single should not be something you discover after playing the ball. Read the field and know your get-off-strike zones before the delivery.',
      'Have reliable ways of getting off strike against both pace and spin. Different batters will use different options.',
      'Every time you change strike, the bowler has a new batter, a new set of strengths and often a new plan to solve.',
      'Strong running turns safe scoring options into partnership pressure without requiring more boundary risk.'
    ],
    long_form:[
      'Strike rotation can keep the partnership active without widening your scoring envelope.',
      'Use soft hands, field awareness and trusted scoring areas to take singles when the bowler gives you access.',
      'A controlled single changes the bowler’s problem and can stop one bowler settling into a long sequence against the same batter.',
      'Do not force the single from a ball that does not allow it. A good dot remains a good result when the bowling has earned it.'
    ]
  },
  scoring_game:{
    t20:[
      'Know the shots, balls and target areas you genuinely own before the pressure of the match arrives.',
      'Widen your scoring game deliberately. Adding options is useful; inventing unfamiliar shots because the required rate rises is not.',
      'Understand which options work against pace and which work against spin — they do not have to be the same.',
      'When the bowler enters one of your strong scoring zones, commit fully to the option you have chosen.'
    ],
    limited_overs:[
      'Build your innings around the small number of scoring options you genuinely trust, not every shot you are technically capable of playing.',
      'For each trusted shot, know the delivery that brings it into play and the area you are trying to access.',
      'If it is not your boundary ball but can be scored from safely, look for the get-off-strike option instead.',
      'When the ball suits your chosen shot, trust your preparation and commit. If execution falls short, keep backing the option and practise the detail that needs work.'
    ],
    long_form:[
      'Be clear about which deliveries you want to score from and let the bowler come into those areas.',
      'A long innings can include attacking batting. Use the shots you trust when the ball and match situation suit them.',
      'Revisit your scoring options as the bowling and field change. Use your strengths at the tempo the match needs.',
      'The aim is to make your strengths repeatable over a long innings, not to demonstrate how many shots you possess.'
    ]
  },
  control_tempo:{
    t20:[
      'Tempo should change because the match demands it, not because emotion demands it.',
      'Know when a partnership needs control, when one batter can take more responsibility and when acceleration is required.',
      'Use singles and twos to stop a quiet period becoming panic.',
      'When you accelerate, expand from trusted options first before reaching for lower-percentage choices.'
    ],
    limited_overs:[
      'Move through the innings deliberately: settle, build, rotate and accelerate rather than drifting between gears.',
      'Required rate, wickets in hand and partnership strength should influence how wide your scoring game becomes.',
      'A few dot balls do not automatically mean the next ball must be attacked.',
      'Recognise when the match has shifted and be prepared to change gear without abandoning your core game.'
    ],
    long_form:[
      'Control the rhythm of your innings rather than allowing the previous ball or over to dictate your emotions.',
      'Absorb periods of strong bowling without feeling that something must happen immediately.',
      'Recognise when conditions, fatigue, field changes or bowling changes create a period you can use.',
      'Tempo in long-form cricket can change through strike rotation and control as well as boundary hitting.'
    ]
  },
  pressure_bowler:{
    t20:[
      'Pressure the bowler with more than boundary hitting: move the strike, run hard, use the field and exploit favourable matchups.',
      'Make it difficult for a bowler to execute the same plan for six balls against the same batter.',
      'Use movement or innovation only when it connects to an option you genuinely practise.',
      'A partnership that keeps changing the problem can force the field and bowling plan to change.'
    ],
    limited_overs:[
      'Change strike often enough that the bowler and captain must continually reset their plan.',
      'Use your different strengths as a partnership. The safest scoring option may change when the other batter is on strike.',
      'Notice fielders who are being protected, gaps the captain is conceding and areas the bowler is trying to deny.',
      'Pressure is created by making the opposition solve repeated problems, not simply by swinging harder.'
    ],
    long_form:[
      'Pressure can be quiet: occupying the crease, changing strike and scoring in trusted areas all make the bowler work.',
      'Do not let a bowler settle into endless deliveries to one batter when safe rotation is available.',
      'Use the partnership to expose different strengths and make field settings harder to maintain.',
      'The goal is to stop the bowler controlling every ball on their terms without widening your risk unnecessarily.'
    ]
  },
  read_game:{
    t20:[
      'Read the bowler: what line, length, pace or variation are they trying to use?',
      'Read the field: where is the safe run and which area is the captain trying hardest to protect?',
      'Read the match: required rate, wickets in hand, matchup and phase all affect the best option.',
      'Then use your own plan. Adapt how you use your game rather than becoming a different batter.'
    ],
    limited_overs:[
      'Your Player Plan tells you what your game is; the match tells you how to use it.',
      'Read the bowler, field, score, wickets, overs and partnership before deciding that your method needs to change.',
      'Look for the lowest-risk scoring option the field and bowling plan are already giving you.',
      'Adapt within your strengths first. Do not abandon your plan simply because the opposition has created pressure.'
    ],
    long_form:[
      'Conditions, bowling plans and fields will change across a long innings. Keep updating the problem you are solving.',
      'Know when the bowler is attacking your wicket and when they are trying to make you chase a scoring option.',
      'Use changes in field and bowling to find safe access to runs without losing the discipline of your core method.',
      'Adaptation means applying your game intelligently — not replacing it every time the contest changes.'
    ]
  },
  use_phase:{
    t20:[
      'Powerplay, middle overs and the death create different fields and different scoring opportunities.',
      'Know which of your options become more valuable when fielders are inside the circle and which remain reliable when the boundary is protected.',
      'Middle overs still need intent: rotate, use matchups and prevent the innings from becoming dependent on late boundaries.',
      'At the death, choose the high-intent options you have actually practised and keep a safe scoring fallback.'
    ],
    limited_overs:[
      'Field restrictions can create opportunities, but they do not require every ball to be attacked.',
      'Middle overs are often where strong rotation and partnerships create the platform for later acceleration.',
      'As the innings moves toward its final phase, widen the scoring envelope according to wickets in hand and the match requirement.',
      'Know when the game is giving you an opportunity to expand — and use the options you have already practised rather than inventing a completely new game.'
    ],
    long_form:[
      'Different periods of a long match create different levels of risk and opportunity.',
      'Recognise when new-ball bowling, a difficult spell or conditions demand a narrower scoring game.',
      'Use tiring bowlers, softer balls, changing fields or favourable match periods when they genuinely shift the contest.',
      'The phase may change your emphasis, but your core batting identity should remain recognisable.'
    ]
  }
};

function generatedBannerReference(key,format){
  return [...(HOW_WE_BAT_REFERENCE[key]?.[format]||[])];
}

const HOW_WE_TRAIN_REFERENCE={
  value_wicket:{
    title:'Train the judgement that protects your wicket',
    t20:[
      'Use mixed-ball scenarios where some deliveries are genuine scoring balls and others are not. The batter must earn the aggressive option rather than premeditating it.',
      'Create short pressure blocks after dot balls so the batter practises staying active without manufacturing risk.'
    ],
    limited_overs:[
      'Run innings-building scenarios: defend the good ball, identify the safe single and punish the genuine scoring ball.',
      'Change wickets in hand, score and overs remaining so risk choices are practised in context rather than as a fixed rule.'
    ],
    long_form:[
      'Use long mixed spells that reward leaving, defending and waiting for the ball that enters the player’s scoring envelope.',
      'Practise off-stump awareness and patience under realistic fields so occupying the crease remains active rather than passive.'
    ]
  },
  keep_moving:{
    title:'Train the single before you need it',
    t20:[
      'Put a realistic field out and ask the batter to identify the safest single before the ball is delivered.',
      'Mix boundary balls with good balls so the batter practises moving the innings when the boundary option is not there.'
    ],
    limited_overs:[
      'Use cones or fielders to create real get-off-strike zones against both pace and spin, then move the field regularly.',
      'Score the drill so dots, singles and twos matter. Make the batter solve the field rather than simply hit the ball.'
    ],
    long_form:[
      'Practise low-risk rotation without widening the scoring envelope: soft hands, clips, drops and controlled pushes.',
      'Change strike within longer spells so both batters must repeatedly reset to a new bowler, field and problem.'
    ]
  },
  scoring_game:{
    title:'Train your shots and recognise when to commit',
    t20:[
      'Rehearse the player’s trusted scoring options, then mix line and length so they must recognise when to commit to each shot.',
      'Recognise the preparation and commitment when the player attacks the right ball. If execution falls short, identify one detail to practise and keep backing the chosen shot.'
    ],
    limited_overs:[
      'Target the player’s strongest scoring areas and mix deliveries so recognition is trained alongside execution.',
      'Use boundary targets and single zones, then recognise good choices and full commitment as well as runs scored. Discuss decision and execution separately.'
    ],
    long_form:[
      'Practise the player’s trusted scoring shots through longer mixed spells. Include opportunities to attack and deliveries that call for another response.',
      'Change the field and match situation so the player practises when to expand their options. Keep backing a well-chosen shot while working on its execution.'
    ]
  },
  control_tempo:{
    title:'Train changes of tempo deliberately',
    t20:[
      'Use short scenarios with different required rates, wickets in hand and overs remaining. The batter must state the intended tempo before starting.',
      'Include recovery scenarios after a quiet over so acceleration comes from a plan, not frustration.'
    ],
    limited_overs:[
      'Practise build → rotate → accelerate phases within the same net, changing the scoring target without changing the player’s core game.',
      'Pause between blocks and ask what changed in the match situation before the batter changes gear.'
    ],
    long_form:[
      'Use extended spells with deliberately quiet periods followed by opportunities to score, training patience and recognition of momentum shifts.',
      'Practise changing tempo through strike rotation and control as well as boundary hitting.'
    ]
  },
  pressure_bowler:{
    title:'Train ways to keep changing the bowler’s problem',
    t20:[
      'Combine strike rotation, running, movement and trusted boundary options so the bowler cannot repeat one plan for six balls.',
      'Change the field or bowling matchup mid-drill and make the batter identify the new safest scoring option.'
    ],
    limited_overs:[
      'Train as a partnership: alternate strike and use the different strengths of the two batters to make the field keep changing.',
      'Reward runs created by pressure, misfields and placement — not only boundaries.'
    ],
    long_form:[
      'Practise quiet pressure: occupy the crease, change strike and score in trusted areas without widening risk.',
      'Use longer partnership scenarios where the objective is to stop the bowler settling into one repeated plan.'
    ]
  },
  read_game:{
    title:'Train the problem before the shot',
    t20:[
      'Before each block, identify the bowler’s likely plan, the protected field area and the safest available scoring option.',
      'Change pace, angle, field or phase during the drill so adaptation happens inside the player’s own game.'
    ],
    limited_overs:[
      'Build scenarios around score, wickets, overs and partnership state. Ask the batter to explain what the game is asking before starting.',
      'Move the field during the drill and make the batter update their scoring picture rather than repeating a preset shot.'
    ],
    long_form:[
      'Change bowling plans and fields across a longer spell so the batter repeatedly reassesses what the bowler is trying to make them do.',
      'Practise adapting access to runs while keeping the same core method and dismissal discipline.'
    ]
  },
  use_phase:{
    title:'Train the phase, not a generic net',
    t20:[
      'Run separate powerplay, middle-over and death-over blocks with realistic fields and scoring demands.',
      'Require the batter to identify which options widen in each phase and which safe fallback remains available.'
    ],
    limited_overs:[
      'Use field-restriction, middle-over and late-innings scenarios so scoring choices change with the phase rather than with emotion.',
      'Practise the transition between phases, especially how the scoring envelope widens when wickets in hand and match need allow it.'
    ],
    long_form:[
      'Recreate new-ball periods, pressure spells and more favourable periods so the player trains when to narrow and when to expand.',
      'Change ball condition, field or bowler type between blocks to represent the shifting phases of a long innings.'
    ]
  }
};

const DIMENSION_TRAINING_CUES={
  wicket_preservation:'Use mixed deliveries and realistic consequence. Practise choosing when not to expand the scoring game.',
  leaving_defending:'Mark off stump and mix line and length so leaving and defending are decisions, not repetitive motions.',
  strike_rotation:'Put a field out, identify the safest single before the ball and then practise the delivery that accesses it.',
  boundary_access:'Rehearse your boundary shots, then mix lengths and lines so you recognise the right delivery and commit fully.',
  running:'Train calls, first-run speed, turning and pressure on fielders as part of the batting drill.',
  scoring_areas:'Use target zones and mixed deliveries so the player recognises when their strongest areas are genuinely available.',
  tempo:'Change the score, wickets or phase between blocks and make the player state the intended tempo before starting.',
  matchups:'Change bowler type, angle or field and practise how the player’s own strengths solve each matchup.',
  spin_method:'Vary line, length, pace and field against spin so the player trains recognition as well as execution.',
  pace_method:'Vary line, length and pace so trusted options are connected to the ball that actually earns them.',
  risk_management:'Use scenario scoring and consequence so risk changes because the match changes, not because frustration does.',
  reset_routines:'Deliberately create a pressure trigger, then rehearse the player’s reset cue before the next ball.',
  dot_ball_management:'Start blocks with deliberate dots and train the next decision without allowing the previous balls to force it.',
  powerplay:'Use a realistic powerplay field and practise the scoring options that field restrictions genuinely create.',
  death_overs:'Use late-innings fields and targets. Practise high-intent options the player owns plus a safe fallback.',
  innovation:'Only rehearse innovative options that are genuinely in the plan, with a clear ball and field that activates them.',
  patience:'Use longer spells where success is measured by decision quality and control, not by how many shots are played.',
  partnerships:'Train in pairs where strike changes, communication and the other batter’s strengths affect the next decision.'
};

const PLAN_ALIGNMENT_LABELS={yes:'Yes',mostly:'Mostly',no:'No'};
const DISMISSAL_CLASSIFICATION_LABELS={
  plan_execution:'Within plan · execution to improve',
  outside_plan:'Decision outside plan',
  not_applicable:'Not really a Player Plan issue'
};
const DEVELOPMENT_ISSUE_LABELS={
  execution:'Execution',
  decision:'Decision',
  pressure:'Pressure response',
  strike_rotation:'Strike rotation',
  other:'Other / not sure'
};
const TRAINING_OBSERVATION_LABELS={
  right_shots_right_balls:'Right shots · right balls',
  shot_without_decision:'Shot practice without decision practice',
  good_strike_rotation:'Good strike-rotation work',
  drifting_outside_plan:'Drifting outside the Player Plan',
  good_pressure_reset:'Good pressure / reset work',
  other:'Other observation'
};

const QUESTION_LIBRARY={
  core_strengths:{
    label:'My trusted scoring options',
    why:'Choose the options that genuinely feel like part of your game. This is not a wish list.',
    options:['Straight drive','Cover drive','On drive','Clip / flick','Cut','Pull','Hook','Sweep','Reverse sweep','Use feet to spin','Loft straight','Loft leg side','Ramp / scoop','Run hard into gaps']
  },
  core_danger:{
    label:'What most often takes you away from your plan?',
    why:'Pick the danger signs you recognise in your own batting.',
    options:['Driving too early','Chasing width','Forcing after dot balls','Getting stuck defending','Playing across the straight ball','Trying to hit too hard','Predetermining the shot','Losing concentration','Getting too passive','Getting too aggressive']
  },
  core_reset:{
    label:'What helps you reset?',
    why:'Choose cues you could genuinely use in the middle, not what sounds good on paper.',
    options:['Take guard again','Slow breath + cue word','Step away and restart routine','Re-check the field','Re-state my scoring plan','Talk to my partner','Focus only on the next ball','Relax grip / shoulders','Watch the ball earlier','Return to one trusted option']
  },
  core_focus:{
    label:'What are you working on right now?',
    why:'Choose one or two development priorities. The coach can refine these with you.',
    options:['Decision making','Get off strike / rotate strike','Scoring against pace','Scoring against spin','Short-ball scoring','Full-ball scoring','Leaving','Defence','Running between wickets','Boundary options','Tempo','Mental routine','Footwork','Balance / shape']
  },

  wicket_preservation:{
    label:'How should you protect your wicket in this format?',
    options:['Make the bowler earn the wicket','Avoid low-percentage options','Build before expanding','Accept good dot balls','Choose risk by match situation','Trust defence when needed','Value partnership stability']
  },
  leaving_defending:{
    label:'What does good leaving / defending look like for you?',
    options:['Leave confidently outside off','Defend late under the eyes','Use soft hands','Play straight','Trust the ball to go past','Keep hands close to body','Defend with balance','Accept the dot when the ball earns it']
  },
  strike_rotation:{
    label:'How do you get off strike / rotate strike?',
    options:['Clip into leg side','Drop into cover','Push to mid-on / mid-off','Use soft hands into point','Use feet to spin for one','Sweep for one','Run hard on misfields','Turn ones into twos','Look for the single before the ball']
  },
  boundary_access:{
    label:'Which boundary options do you genuinely trust?',
    options:['Straight','Through cover','Behind point','Square leg','Mid-wicket','Fine leg','Pull / hook','Sweep','Use feet and loft straight','Loft over mid-wicket','Ramp / scoop','Hit over extra cover']
  },
  running:{
    label:'How do you create pressure with running?',
    options:['Sharp first run','Call early and loudly','Turn ones into twos','Pressure fielders','Back up hard','Look for overthrows','Run hard even when boundary is possible','Use partner communication']
  },
  scoring_areas:{
    label:'Where are your strongest scoring areas?',
    options:['Straight V','Cover','Extra cover','Point','Behind point','Square leg','Mid-wicket','Fine leg','Long-on / long-off','Behind square leg']
  },
  tempo:{
    label:'How do you want to manage tempo?',
    options:['Settle before expanding','Keep strike rotating','Increase intent after getting in','Respond to required rate','Use wickets in hand','Target particular overs','Reset after wickets','Build in partnerships','Accelerate deliberately rather than emotionally']
  },
  matchups:{
    label:'Which matchups suit you best?',
    options:['Fast pace','Medium pace','Left-arm pace','Right-arm pace','Off-spin','Leg-spin','Left-arm orthodox','Short-pitched bowling','Full bowling','Bowling into the pads']
  },
  spin_method:{
    label:'Which methods against spin are genuinely yours?',
    options:['Use feet','Sweep','Reverse sweep','Play from crease','Go deep in crease','Rotate into leg side','Rotate into off side','Hit straight','Use lofted option','Wait for bad ball','Manipulate field']
  },
  pace_method:{
    label:'Which methods against pace are genuinely yours?',
    options:['Score from width','Clip the pads','Drive only when full enough','Pull the short ball','Leave outside off','Defend good length','Use pace behind square','Hit straight','Rotate into gaps','Get inside the line']
  },
  risk_management:{
    label:'When is extra risk justified for you?',
    options:['When the ball is in my strength area','When the field gives me access','When required rate demands it','When matchup strongly favours me','When wickets in hand allow it','Late in the innings','After I am established','Only when a safer option is not enough']
  },
  reset_routines:{
    label:'What is your format-specific reset?',
    options:['Slow breath','Re-check field','Talk to partner','Return to trusted scoring option','Accept the previous ball','Re-state match situation','Reset guard / routine','Focus on next ball only']
  },
  dot_ball_management:{
    label:'When dot-ball pressure builds, what can you do safely?',
    options:['Accept it if bowling is good','Look for a safer single','Change crease position','Use feet to spin','Open another scoring area','Run harder','Target the next genuine scoring ball','Talk to partner and reset','Avoid forcing a boundary']
  },
  powerplay:{
    label:'How can you use the field restrictions?',
    options:['Hit straight','Use gaps through cover / point','Attack pads','Pull short bowling','Loft over infield','Run hard while ring is up','Choose one bowler to pressure','Keep a safe single available','Use conventional strengths first']
  },
  death_overs:{
    label:'Which late-innings options do you trust?',
    options:['Hit straight','Access mid-wicket','Access cover','Use pace behind square','Pull / hook','Ramp / scoop','Use feet to change length','Run twos','Keep a single fallback','Target full ball','Target short ball']
  },
  innovation:{
    label:'Which created / premeditated options are actually part of your game?',
    options:['Move across crease','Open stance / access off side','Use feet early','Sweep','Reverse sweep','Ramp','Scoop','Back away for room','Change depth in crease','None — react conventionally']
  },
  patience:{
    label:'What helps you occupy the crease well?',
    options:['Leave ego out of the contest','Trust defence','Wait for my ball','Reset each over','Break innings into small blocks','Stay patient after dots','Keep routine consistent','Talk to partner','Let bowler get bored first']
  },
  partnerships:{
    label:'How do you contribute to a partnership?',
    options:['Communicate plans','Rotate strike','Protect partner when needed','Take pressure off with boundaries','Rebuild after wickets','Share matchup information','Run hard together','Stay calm when partner struggles']
  }
};

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const val=id=>document.getElementById(id)?.value.trim()||'';
const slug=s=>String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const naturalList=a=>a.length===1?a[0]:a.length===2?`${a[0]} and ${a[1]}`:`${a.slice(0,-1).join(', ')}, and ${a[a.length-1]}`;

const PLATFORM_PRIMARY='#202F78';
const PLATFORM_ACCENT='#D8232A';
function validHex(value){return /^#[0-9a-f]{6}$/i.test(String(value||''));}
function normaliseHex(value,fallback){return validHex(value)?String(value).toUpperCase():fallback;}
function hexRgb(hex){
  const v=normaliseHex(hex,'#000000');
  return [parseInt(v.slice(1,3),16),parseInt(v.slice(3,5),16),parseInt(v.slice(5,7),16)];
}
function rgbHex(r,g,b){
  const c=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
function mixHex(a,b,amount=.5){
  const aa=hexRgb(a),bb=hexRgb(b),t=Math.max(0,Math.min(1,amount));
  return rgbHex(...aa.map((v,i)=>v+(bb[i]-v)*t));
}
// Lighten a club colour while preserving its hue and enough saturation to read as
// a genuine colour tint rather than drifting towards grey.
function toneHex(hex,targetLightness,minSaturation=.64){
  let [r,g,b]=hexRgb(hex).map(v=>v/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;
  const l=(max+min)/2;
  let sat=d===0?0:d/(1-Math.abs(2*l-1));
  if(d!==0){
    if(max===r)h=((g-b)/d)%6;
    else if(max===g)h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60;if(h<0)h+=360;
  }
  sat=Math.max(sat,minSaturation);
  const light=Math.max(0,Math.min(1,targetLightness));
  const c=(1-Math.abs(2*light-1))*sat;
  const x=c*(1-Math.abs((h/60)%2-1));
  const m=light-c/2;
  let rr=0,gg=0,bb=0;
  if(h<60){rr=c;gg=x;}else if(h<120){rr=x;gg=c;}else if(h<180){gg=c;bb=x;}
  else if(h<240){gg=x;bb=c;}else if(h<300){rr=x;bb=c;}else{rr=c;bb=x;}
  return rgbHex((rr+m)*255,(gg+m)*255,(bb+m)*255);
}
// Lighten only the existing colour's HSL lightness. Hue and saturation are preserved,
// so priority cards stay in exactly the same colour family as the club primary.
function lightenSameHue(hex,amount=.35){
  let [r,g,b]=hexRgb(hex).map(v=>v/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;
  const l=(max+min)/2;
  const sat=d===0?0:d/(1-Math.abs(2*l-1));
  if(d!==0){
    if(max===r)h=((g-b)/d)%6;
    else if(max===g)h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60;if(h<0)h+=360;
  }
  const light=l+(1-l)*Math.max(0,Math.min(1,amount));
  const c=(1-Math.abs(2*light-1))*sat;
  const x=c*(1-Math.abs((h/60)%2-1));
  const m=light-c/2;
  let rr=0,gg=0,bb=0;
  if(h<60){rr=c;gg=x;}else if(h<120){rr=x;gg=c;}else if(h<180){gg=c;bb=x;}
  else if(h<240){gg=x;bb=c;}else if(h<300){rr=x;bb=c;}else{rr=c;gg=x;}
  return rgbHex((rr+m)*255,(gg+m)*255,(bb+m)*255);
}
function contrastFor(hex){
  const [r,g,b]=hexRgb(hex).map(v=>v/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);
  const lum=.2126*r+.7152*g+.0722*b;
  return lum>.48?'#111827':'#FFFFFF';
}
function applyClubTheme(primary=club?.primary_colour,accent=club?.accent_colour){
  const p=normaliseHex(primary,PLATFORM_PRIMARY);
  const a=normaliseHex(accent,PLATFORM_ACCENT);
  const root=document.documentElement.style;
  root.setProperty('--navy',p);
  root.setProperty('--navy2',mixHex(p,'#000000',.34));
  root.setProperty('--red',a);
  root.setProperty('--navy-contrast',contrastFor(p));
  root.setProperty('--accent-contrast',contrastFor(a));
  root.setProperty('--club-soft',mixHex(p,'#FFFFFF',.92));
  root.setProperty('--club-accent-soft',mixHex(a,'#FFFFFF',.91));
}
function normaliseWebsiteUrl(raw){
  const v=String(raw||'').trim();
  if(!v)return '';
  try{return new URL(/^https?:\/\//i.test(v)?v:`https://${v}`).toString();}
  catch{return v;}
}
function ensureBrandingDraft(){
  if(clubBrandingDraftClubId!==club?.id || !clubBrandingDraft){
    clubBrandingDraftClubId=club?.id||null;
    clubBrandingDraft={
      logo_data_url:club?.logo_data_url||'',
      website_url:club?.website_url||'',
      primary_colour:normaliseHex(club?.primary_colour,PLATFORM_PRIMARY),
      accent_colour:normaliseHex(club?.accent_colour,PLATFORM_ACCENT)
    };
    clubBrandingLogoSuggestions=[];
    clubBrandingWebsiteSuggestion=null;
    clubBrandingLogoPaletteSource='';
    clubBrandingLogoPaletteLoading=false;
  }
  return clubBrandingDraft;
}
function colourDistance(a,b){
  const x=hexRgb(a),y=hexRgb(b);
  return Math.sqrt(x.reduce((sum,v,i)=>sum+(v-y[i])**2,0));
}
function perceivedLightness(hex){
  const [r,g,b]=hexRgb(hex);
  return (.299*r+.587*g+.114*b)/255;
}
function logoBrandSuggestion(colours=[]){
  const unique=[];
  for(const raw of colours){
    const c=normaliseHex(raw,'');
    if(!validHex(c))continue;
    if(unique.some(x=>colourDistance(x,c)<28))continue;
    unique.push(c);
  }
  const useful=unique.filter(c=>perceivedLightness(c)<.92);
  const pool=(useful.length>=2?useful:unique).slice(0,6);
  if(pool.length<2)return null;
  let a=pool[0],b=pool[1];
  // A darker colour generally works better as the dominant/background colour.
  if(perceivedLightness(b)<perceivedLightness(a)){const t=a;a=b;b=t;}
  return {primary:a,accent:b};
}
function saturationForRgb(r,g,b){
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  return max===0?0:(max-min)/max;
}
function paletteFromCanvas(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  const bins=new Map();
  for(let i=0;i<data.length;i+=16){
    const a=data[i+3]; if(a<150)continue;
    let r=data[i],g=data[i+1],b=data[i+2];
    const lum=(.2126*r+.7152*g+.0722*b)/255;
    if(lum>.96||lum<.035)continue;
    r=Math.round(r/24)*24;g=Math.round(g/24)*24;b=Math.round(b/24)*24;
    r=Math.min(r,255);g=Math.min(g,255);b=Math.min(b,255);
    const key=rgbHex(r,g,b);
    const sat=saturationForRgb(r,g,b);
    bins.set(key,(bins.get(key)||0)+(sat<.08?.25:1));
  }
  const ranked=[...bins.entries()].sort((a,b)=>b[1]-a[1]).map(([k])=>k);
  const out=[];
  for(const hex of ranked){
    if(out.every(c=>colourDistance(c,hex)>52))out.push(hex);
    if(out.length===6)break;
  }
  return out;
}
async function processClubLogoFile(file){
  if(!file || !['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use a PNG, JPEG or WebP image.');
  if(file.size>8*1024*1024)throw new Error('That image is too large. Use an image under 8 MB.');
  const objectUrl=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error('Could not read that image.'));x.src=objectUrl;});
    const max=520;
    const scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
    canvas.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let dataUrl=canvas.toDataURL('image/webp',.9);
    if(!dataUrl.startsWith('data:image/webp'))dataUrl=canvas.toDataURL('image/png');
    if(dataUrl.length>1150000)throw new Error('The logo is still too large after resizing. Try a tighter snip around the logo.');
    const paletteCanvas=document.createElement('canvas');
    const pScale=Math.min(1,120/Math.max(canvas.width,canvas.height));
    paletteCanvas.width=Math.max(1,Math.round(canvas.width*pScale));
    paletteCanvas.height=Math.max(1,Math.round(canvas.height*pScale));
    paletteCanvas.getContext('2d').drawImage(canvas,0,0,paletteCanvas.width,paletteCanvas.height);
    return {dataUrl,palette:paletteFromCanvas(paletteCanvas)};
  }finally{URL.revokeObjectURL(objectUrl);}
}

async function paletteFromLogoDataUrl(dataUrl){
  if(!dataUrl)return [];
  const img=await new Promise((resolve,reject)=>{
    const x=new Image();
    x.onload=()=>resolve(x);
    x.onerror=()=>reject(new Error('Could not read the saved club logo.'));
    x.src=dataUrl;
  });
  const max=120;
  const scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
  canvas.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return paletteFromCanvas(canvas);
}

function savePlatformMarketScroll(){
  if(platformView!=='market' || platformMarketScrollSuppressed)return;
  const y=Math.max(0,Math.round(window.scrollY||document.documentElement.scrollTop||0));
  platformMarketScrollY=y;
  try{sessionStorage.setItem(PLATFORM_MARKET_SCROLL_KEY,String(y));}catch{/* storage unavailable */}
}

function restorePlatformMarketScroll(){
  if(platformView!=='market' || !document.getElementById('marketClubInventory'))return;
  const y=Number(platformMarketScrollY||sessionStorage.getItem(PLATFORM_MARKET_SCROLL_KEY)||0);
  if(!Number.isFinite(y) || y<=0)return;
  if(platformMarketRestoreTimer)cancelAnimationFrame(platformMarketRestoreTimer);
  platformMarketRestoreTimer=requestAnimationFrame(()=>{
    requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:'auto'}));
  });
}

let authActionInFlight=false;
let passwordRecoveryRequired=new URLSearchParams(location.search).has('password_setup') || new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';

async function boot(){
  document.title='Club Batting';
  const {data:{session:s}}=await supabase.auth.getSession();
  session=s;
  supabase.auth.onAuthStateChange((event,s2)=>{
    const previousUserId=session?.user?.id||null;
    const nextUserId=s2?.user?.id||null;
    session=s2;

    // Supabase can emit SIGNED_IN again when an already-signed-in browser tab regains focus.
    // Rebuilding the SPA for that same-user event destroys the user's scroll position. Only a
    // genuine identity/session change should route the app again.
    const meaningfulAuthChange=
      previousUserId!==nextUserId ||
      ['SIGNED_OUT','USER_UPDATED','PASSWORD_RECOVERY'].includes(event);
    if(event==='PASSWORD_RECOVERY')passwordRecoveryRequired=true;
    if(meaningfulAuthChange&&!authActionInFlight)setTimeout(()=>routeAuth(),0);
  });

  // Preserve Market Discovery position when the user opens a club/source in another tab and
  // comes back. This is independent of browser back/forward restoration and survives a redraw.
  window.addEventListener('pagehide',savePlatformMarketScroll);
  window.addEventListener('pageshow',()=>restorePlatformMarketScroll());
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')savePlatformMarketScroll();
    else if(document.visibilityState==='visible')restorePlatformMarketScroll();
  });
  window.addEventListener('scroll',()=>{
    if(platformView!=='market')return;
    if(window.__bdpMarketScrollRaf)return;
    window.__bdpMarketScrollRaf=requestAnimationFrame(()=>{
      window.__bdpMarketScrollRaf=null;
      savePlatformMarketScroll();
    });
  },{passive:true});

  await routeAuth();
}

function redirectUrl(){
  return location.origin+location.pathname+location.search;
}

async function kickLiveEmailDelivery(){
  // Normal club workflow emails are delivered by the Supabase Database Webhook
  // on outbound_messages. Only Platform Admin pages manually flush the global queue.
  if(!platformRole)return;
  try{
    await supabase.functions.invoke('dispatch-outbox',{
      body:{action:'dispatch',limit:20,public_base_url:`${location.origin}${location.pathname}`}
    });
  }catch(err){
    console.warn('Email dispatch could not be started',err);
  }
}

function outboundMessageAgeMinutes(message){
  const started=message?.processing_at||message?.created_at;
  if(!started)return 0;
  return Math.max(0,(Date.now()-new Date(started).getTime())/60000);
}

async function loadAllPlatformRows(makeQuery){
  const rows=[];
  const pageSize=500;
  try{
    for(let offset=0;;offset+=pageSize){
      const {data,error}=await makeQuery().range(offset,offset+pageSize-1);
      if(error)return {data:null,error};
      rows.push(...(data||[]));
      if(!data||data.length<pageSize)return {data:rows,error:null};
    }
  }catch(error){return {data:null,error};}
}

function safePublicSourceUrl(value){
  try{const url=new URL(String(value||'').trim());return ['https:','http:'].includes(url.protocol)?url.href:'';}
  catch{return '';}
}

async function retryPlatformDelivery(message,settings){
  if(settings?.email_mode!=='live')throw new Error('Email delivery is not in Live mode. Check provider setup in Platform Settings.');
  if(!settings.email_live_from||new Date(message.created_at)<new Date(settings.email_live_from))throw new Error('This message is outside the live delivery window and cannot be retried.');
  if(message.failed_at&&!message.sent_at){
    const {error}=await supabase.rpc('platform_retry_outbound_message',{p_message_id:message.id});
    if(error)throw error;
  }
  // Keep the existing dispatcher unchanged. It processes the queue in date order.
  // Check this exact message afterwards; a successful request does not prove it sent.
  const {data,error}=await supabase.functions.invoke('dispatch-outbox',{body:{action:'dispatch',limit:25,public_base_url:`${location.origin}${location.pathname}`}});
  if(error||data?.error)throw new Error(data?.error||error?.message||'Delivery retry could not start.');
  if(data?.skipped)throw new Error(data.reason||'Delivery was skipped.');
  const {data:current,error:readError}=await supabase.from('outbound_messages').select('sent_at,failed_at,last_error,processing_at').eq('id',message.id).single();
  if(readError)throw new Error(`Retry requested, but the result could not be checked: ${readError.message}`);
  if(current?.failed_at&&!current.sent_at)throw new Error(current.last_error||'Email delivery failed again.');
  return current?.sent_at?'Email recorded as sent.':'Retry requested. This email is still waiting in the delivery queue.';
}

function outboundMessageState(message,settings){
  if(message?.sent_at)return 'sent';
  if(message?.failed_at)return 'failed';
  const live=settings?.email_mode==='live';
  const liveFrom=settings?.email_live_from?new Date(settings.email_live_from).getTime():null;
  const createdAt=message?.created_at?new Date(message.created_at).getTime():null;
  if(!live || (liveFrom&&createdAt&&createdAt<liveFrom))return 'prototype-only';
  if(message?.processing_at)return 'sending';
  return 'queued';
}

function outboundMessageNeedsAttention(message,settings){
  if(message?.hidden_from_platform_queue)return false;
  if(settings?.email_mode!=='live'||!settings.email_live_from)return false;
  if(new Date(message?.created_at)<new Date(settings.email_live_from))return false;
  const state=outboundMessageState(message,settings);
  return state==='failed'||(['queued','sending'].includes(state)&&outboundMessageAgeMinutes(message)>=10);
}

function outboundMessageLabel(message,settings){
  const state=outboundMessageState(message,settings);
  if(state==='sent')return `Sent ${new Date(message.sent_at).toLocaleString()}`;
  if(state==='failed')return 'Delivery failed';
  if(state==='prototype-only')return 'Prototype history';
  if(outboundMessageAgeMinutes(message)>=10)return state==='sending'?'Sending is delayed':'Queued for more than 10 minutes';
  return state==='sending'?'Sending':'Queued';
}

function outboundTemplateLabel(templateKey){
  return ({
    prospect_intro:'Prospect invitation',
    prospect_follow_up:'Prospect follow-up',
    club_trial_invitation:'Club Trial invitation',
    club_admin_invitation:'Club Admin invitation',
    philosophy_lead_invitation:'Philosophy Lead invitation'
  }[templateKey]||String(templateKey||'Email').replaceAll('_',' '));
}

async function loadPlatformContext(){
  if(!session){platformRole=null;platformAccessError=false;canBootstrapPlatform=false;return;}
  const userId=session.user.id;
  const [roleResult,bootstrapResult]=await Promise.allSettled([
    supabase.rpc('get_my_platform_role'),
    supabase.rpc('can_bootstrap_platform_owner')
  ]);
  if(session?.user?.id!==userId)return;
  platformAccessError=roleResult.status==='rejected'||!!roleResult.value?.error;
  platformRole=platformAccessError?null:roleResult.value?.data||null;
  canBootstrapPlatform=!platformAccessError&&bootstrapResult.status==='fulfilled'&&!bootstrapResult.value?.error&&!!bootstrapResult.value?.data;
}

async function routeAuth(){
  const params=new URLSearchParams(location.search);
  if(passwordRecoveryRequired || params.has('password_setup')){renderPasswordSetup();return;}
  if(!session && params.has('signin')){renderLogin();return;}
  if(params.has('trial')){await renderPublicTrialEntry();return;}
  const leadToken=params.get('lead');
  const prospectToken=params.get('prospect');
  const paymentToken=params.get('payment');
  const adminInviteToken=params.get('admin_invite');
  const philosophyInviteToken=params.get('philosophy_invite');
  const leadHandoverToken=params.get('lead_handover');
  const playerJoinToken=params.get('player_join');
  const joinCodeToken=params.get('join');

  if(leadToken){await renderSalesProspectRoute(leadToken);return;}
  if(prospectToken){await renderProspectRoute(prospectToken);return;}
  if(paymentToken){await renderPaymentRoute(paymentToken);return;}
  if(adminInviteToken){await renderAdminInviteRoute(adminInviteToken);return;}
  if(philosophyInviteToken){await renderPhilosophyInviteRoute(philosophyInviteToken);return;}
  if(leadHandoverToken){await renderLeadAdminHandoverRoute(leadHandoverToken);return;}
  if(playerJoinToken){await renderPlayerJoinRoute(playerJoinToken);return;}

  if(joinCodeToken){
    if(!session){
      renderLogin('Sign in to continue joining the club. Your invitation link will still be here after sign-in.');
      return;
    }
    await loadPlatformContext();
    await renderJoinByCode(joinCodeToken);
    return;
  }

  if(!session){renderLogin();return;}
  await loadPlatformContext();
  await loadContext();
}

function authEntryLinks(){
  return '<p class="help"><a href="./">Club Batting home</a> · <a href="./demo.html?stage=help">Explore the tutorials</a></p>';
}

function renderLogin(msg=''){
  const platform=new URLSearchParams(location.search).has('platform');
  app.innerHTML=`<div class="login">
    <div class="section-label">Club Batting${platform?' · Platform Admin':''}</div>
    <h1>${platform?'Platform Admin sign-in':'Welcome back.'}</h1>
    <p>Sign in with your email and password. Your club and access stay with your account.</p>
    ${msg?`<div class="notice">${esc(msg)}</div>`:''}
    <form id="passwordSignIn">
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn secondary" type="submit" id="signInButton">Sign in</button>
    </form>
    <p><button class="guide-inline-link" type="button" id="resetPassword">Set or reset your password</button></p>
    <p class="help">Previously used an email link? Set a password once, then sign in here whenever you return.</p>
    <div id="authStatus" class="help" role="status" aria-live="polite"></div>
    <p class="help">New club? <a href="./app.html?trial=1">Try it free with your club</a>.</p>
    ${!platform?'<p class="help"><a href="./app.html?platform=1">Platform Admin sign-in</a></p>':''}
    ${authEntryLinks()}
  </div>`;
  document.getElementById('passwordSignIn').onsubmit=async event=>{
    event.preventDefault();
    const button=document.getElementById('signInButton'),status=document.getElementById('authStatus');
    button.disabled=true;status.textContent='Signing in…';authActionInFlight=true;
    try{
      const {data,error}=await supabase.auth.signInWithPassword({email:val('email'),password:document.getElementById('password').value});
      if(error)throw error;
      session=data.session;
      const url=new URL(location.href);url.searchParams.delete('signin');history.replaceState({},'',url);
      authActionInFlight=false;await routeAuth();
    }catch(error){status.textContent=error.message||'Sign-in could not complete. Please try again.';}
    finally{authActionInFlight=false;button.disabled=false;}
  };
  document.getElementById('resetPassword').onclick=()=>renderPasswordReset(val('email'));
}

function renderPasswordReset(email=''){
  app.innerHTML=`<div class="login"><div class="section-label">Your account</div><h1>Set or reset your password.</h1>
    <p>Use your existing account email. We’ll send one secure link so you can choose a password.</p>
    <form id="passwordResetForm"><div class="field"><label for="resetEmail">Email</label><input id="resetEmail" type="email" autocomplete="email" value="${esc(email)}" required></div>
    <button class="btn secondary" id="requestReset" type="submit">Send password setup link</button></form>
    <div id="resetStatus" class="help" role="status" aria-live="polite"></div>
    <p><button class="guide-inline-link" id="backToSignIn">Back to sign-in</button></p>${authEntryLinks()}</div>`;
  document.getElementById('backToSignIn').onclick=()=>{
    passwordRecoveryRequired=false;const target=new URL(location.href);target.hash='';target.searchParams.delete('password_setup');
    history.replaceState({},'',target);renderLogin();
  };
  document.getElementById('passwordResetForm').onsubmit=async event=>{
    event.preventDefault();const button=document.getElementById('requestReset'),status=document.getElementById('resetStatus');
    button.disabled=true;status.textContent='Sending…';
    const target=new URL(location.href);target.hash='';target.searchParams.delete('code');target.searchParams.set('password_setup','1');
    try{
      const {error}=await supabase.auth.resetPasswordForEmail(val('resetEmail'),{redirectTo:target.href});
      if(error)throw error;
      status.textContent='If an account exists for that email, a password setup link is on its way. Check your inbox and junk folder.';
    }catch(error){status.textContent=error.message||'The link could not be requested. Please try again.';}
    finally{button.disabled=false;}
  };
}

function renderPasswordSetup(){
  if(!session){
    renderPasswordReset();
    document.getElementById('resetStatus').textContent='Open the link from your email to choose a password. If it has expired, request a new one here.';
    return;
  }
  app.innerHTML=`<div class="login"><div class="section-label">Your account</div><h1>Choose your password.</h1>
    <p>Set a password for ${esc(session.user.email||'your account')} so you can sign in directly next time.</p>
    <form id="savePasswordForm"><div class="field"><label for="newPassword">New password</label><input id="newPassword" type="password" autocomplete="new-password" minlength="10" required></div>
    <div class="field"><label for="confirmPassword">Confirm password</label><input id="confirmPassword" type="password" autocomplete="new-password" minlength="10" required></div>
    <p class="help">Use at least 10 characters.</p><button class="btn secondary" id="savePassword" type="submit">Save password & continue</button></form>
    <div id="passwordStatus" class="help" role="status" aria-live="polite"></div>${authEntryLinks()}</div>`;
  document.getElementById('savePasswordForm').onsubmit=async event=>{
    event.preventDefault();const password=document.getElementById('newPassword').value;
    const status=document.getElementById('passwordStatus'),button=document.getElementById('savePassword');
    if(password.length<10){status.textContent='Use at least 10 characters.';return;}
    if(password!==document.getElementById('confirmPassword').value){status.textContent='The passwords do not match.';return;}
    button.disabled=true;authActionInFlight=true;status.textContent='Saving…';
    try{
      const {error}=await supabase.auth.updateUser({password});if(error)throw error;
      passwordRecoveryRequired=false;
      const target=new URL(location.href);target.hash='';target.searchParams.delete('password_setup');target.searchParams.delete('code');
      history.replaceState({},'',target);authActionInFlight=false;await routeAuth();
    }catch(error){status.textContent=error.message||'The password could not be saved. Please try again.';}
    finally{authActionInFlight=false;button.disabled=false;}
  };
}

async function openAccountPassword(){
  if(club&&!await saveClubEditsBeforeNavigation())return;
  const target=new URL(location.href);target.searchParams.set('password_setup','1');history.replaceState({},'',target);
  renderPasswordSetup();
}

async function continueWebsiteTrial(clubName,contactName){
  const {data,error}=await supabase.rpc('begin_public_club_trial',{p_club_name:clubName,p_contact_name:contactName});
  if(error)throw error;
  if(!data?.public_token&&!data?.existing_club_id)throw new Error('The trial could not be prepared. Please try again.');
  const target=new URL(location.href);target.hash='';target.search='';
  if(data.existing_club_id){target.searchParams.set('club',data.existing_club_id);localStorage.setItem('bdp-context','club');}
  else target.searchParams.set('prospect',data.public_token);
  history.replaceState({},'',target);
  await routeAuth();
}

async function renderPublicTrialEntry(){
  const saved=session?.user?.user_metadata?.club_trial_request||{};
  const continuation=new URLSearchParams(location.search).get('continue_trial')==='1';
  if(session&&continuation&&saved.club_name&&saved.contact_name){
    app.innerHTML='<div class="login"><h1>Preparing your club’s trial…</h1><p>Your trial starts only when you activate it on the next screen.</p></div>';
    try{await continueWebsiteTrial(saved.club_name,saved.contact_name);return;}
    catch(error){renderPublicTrialForm(saved,error.message);return;}
  }
  renderPublicTrialForm(saved);
}

function renderPublicTrialForm(saved={},message=''){
  const signedIn=!!session;
  app.innerHTML=`<style>.public-trial-entry .prospect-card>p,.public-trial-entry .help,.public-trial-entry .notice{font-size:14px;line-height:1.55}.public-trial-entry .field label{font-size:13px}.public-trial-entry .field input{font-size:16px;min-height:46px}.public-trial-entry .btn{font-size:14px;min-height:44px}.public-trial-entry .prospect-card h2{font-size:27px;margin-top:6px}</style><div class="prospect-shell public-trial-entry">${prospectIntro({is_club_trial:true,entry_phase:'signup',club_name:saved.club_name||'your club'})}<section class="card prospect-card"><div class="section-label">Your full Club Trial</div>
    <h2>Try it free with your club.</h2><p>Bring your club’s philosophy, Player Plans and training together. Your full 60-day trial starts when you activate it.</p>
    <div class="notice">No upfront payment. No automatic charge. You choose whether to continue after the trial.</div>
    <p>${signedIn?`Signed in as ${esc(session.user.email||'')}. <a href="./app.html">Open your existing club</a>.`:'Already registered? <a href="./app.html?trial=1&signin=1">Sign in to your existing account</a>.'}</p>
    <form id="trialEntryForm">
      <div class="field"><label for="trialClubName">Club name</label><input id="trialClubName" autocomplete="organization" maxlength="160" minlength="3" required value="${esc(saved.club_name||'')}"></div>
      <div class="field"><label for="trialContactName">Your name</label><input id="trialContactName" autocomplete="name" maxlength="120" minlength="2" required value="${esc(saved.contact_name||session?.user?.user_metadata?.display_name||'')}"></div>
      ${signedIn?'':`<div class="field"><label for="trialEmail">Your email</label><input id="trialEmail" type="email" autocomplete="username" required></div>
      <div class="field"><label for="trialPassword">Choose a password</label><input id="trialPassword" type="password" minlength="10" autocomplete="new-password" required></div>
      <p class="help">Use at least 10 characters. Confirm your email once, then use your password for future visits.</p>`}
      <button class="btn secondary" type="submit" id="trialContinue">${signedIn?'Continue to our free trial':'Create account & continue'}</button>
    </form><div id="trialEntryStatus" class="help" role="status" aria-live="polite">${esc(message)}</div>
    <p class="help">Already invited by Club Batting? Use your invitation to continue the trial already prepared for you.</p>
    <p><a class="btn ghost" href="./demo.html?stage=help">Explore the tutorials</a></p>${authEntryLinks()}</section></div>`;
  document.getElementById('trialEntryForm').onsubmit=async event=>{
    event.preventDefault();const button=document.getElementById('trialContinue'),status=document.getElementById('trialEntryStatus');
    const clubName=val('trialClubName'),contactName=val('trialContactName');
    button.disabled=true;status.textContent='Preparing your next step…';authActionInFlight=true;
    try{
      if(!session){
        const target=new URL('./app.html?trial=1&continue_trial=1',location.href);
        const {data,error}=await supabase.auth.signUp({email:val('trialEmail'),password:document.getElementById('trialPassword').value,
          options:{emailRedirectTo:target.href,data:{display_name:contactName,club_trial_request:{club_name:clubName,contact_name:contactName}}}});
        if(error)throw error;
        if(!data.session){
          document.getElementById('trialPassword').value='';
          status.textContent='Check your email to confirm your new account and continue. Your trial has not started. If you already have an account, use Sign in above instead.';
          return;
        }
        session=data.session;
      }
      await continueWebsiteTrial(clubName,contactName);
    }catch(error){status.textContent=error.message||'We couldn’t prepare the next step. Please try again.';}
    finally{authActionInFlight=false;button.disabled=false;}
  };
}

async function loadContext(){
  app.innerHTML='<div class="splash">Loading…</div>';

  const {data:memberships,error}=await supabase
    .from('club_memberships')
    .select('club_id,role,involvement,permission_role,clubs(id,name,slug,join_code,player_join_token,player_signup_open,lead_admin_user_id,primary_colour,accent_colour,logo_data_url,website_url,branding_updated_at,subscription_calendar,season_start,season_end,archived_at)')
    .eq('user_id',session.user.id);

  if(error){
    app.innerHTML=`<div class="splash">${esc(error.message)}</div>`;
    return;
  }

  allMemberships=(memberships||[]).filter(m=>!m.clubs?.archived_at);

  const launchParams=new URLSearchParams(location.search);
  const routeClub=launchParams.get('club');
  const routeTab=launchParams.get('tab');
  if(routeClub && !allMemberships.some(m=>m.club_id===routeClub)){
    app.innerHTML=`<div class="login"><div class="section-label">Club Batting</div><h1>This club link is for a different account.</h1><p>Sign in with the email address that received the invitation. If you already use that address, ask your club to check your registration.</p><div class="btnrow"><button class="btn secondary" id="launchSignOut">Sign out</button><button class="btn ghost" id="launchMyClubs">Open my clubs</button></div></div>`;
    document.getElementById('launchSignOut').onclick=()=>supabase.auth.signOut();
    document.getElementById('launchMyClubs').onclick=()=>{
      clearClubLaunchRoute();
      localStorage.setItem('bdp-context','club');
      loadContext();
    };
    return;
  }

  if(!routeClub && platformRole && (launchParams.has('platform') || localStorage.getItem('bdp-context')==='platform')){
    if(launchParams.has('platform')){const target=new URL(location.href);target.searchParams.delete('platform');history.replaceState({},'',target);}
    renderPlatformConsole();
    return;
  }

  if(!allMemberships.length){
    if(platformRole){renderPlatformConsole();return;}
    renderNoClub();
    return;
  }

  const savedClub=routeClub||localStorage.getItem('bdp-club-id');
  membership=allMemberships.find(m=>m.club_id===savedClub)||allMemberships[0];
  club=membership.clubs;
  localStorage.setItem('bdp-club-id',club.id);
  localStorage.setItem('bdp-context','club');

  const savedTab=localStorage.getItem(`bdp-tab-${club.id}`);
  if(savedTab)currentTab=savedTab;

  const {data:profileData}=await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id',session.user.id)
    .maybeSingle();

  userProfile=profileData||null;

  if(!userProfile || !membership.involvement){
    renderFirstIdentitySetup();
    return;
  }

  try{await loadData();}
  catch(error){
    app.innerHTML=`<div class="login"><h1>Your club’s plans could not be loaded.</h1><p>${esc(error.message||'Check your connection and try again.')}</p><button class="btn secondary" id="retryClubLoad">Try again</button></div>`;
    document.getElementById('retryClubLoad').onclick=loadContext;
    return;
  }
  // Return visits start with the next useful action. Explicit email links
  // still open the area promised in the message.
  currentTab=canUseClubHome()?'dashboard':isPlayerUser()?'playerhome':savedTab||'howwetrain';
  if(routeClub===club.id){
    if(['playerhome','myplan','howwebat','howwetrain','guide'].includes(routeTab) && canOpenClubTab(routeTab)){
      currentTab=routeTab;
      if(routeTab==='myplan')builderSection='core';
    }
    clearClubLaunchRoute();
  }
  renderShell();
}

function clearClubLaunchRoute(){
  const url=new URL(location.href||`${location.origin}${location.pathname}${location.search}`);
  url.searchParams.delete('club');
  url.searchParams.delete('tab');
  history.replaceState({},'',url.pathname+url.search+url.hash);
}

function roleCards(prefix,selected=''){
  const roles=[
    ['player','Player','I want to build and use my own Player Plan.'],
    ['coach_captain','Non-playing staff','I do not need a Player Plan. The Club Admin will assign my role and any access to players.'],
    ['both','Player who also coaches or captains','I need my own Player Plan. The Club Admin will assign my club role and any access to other players.']
  ];
  return `<div class="role-grid">${roles.map(([k,t,d])=>`
    <label class="role-card ${selected===k?'on':''}">
      <input type="radio" name="${prefix}" value="${k}" ${selected===k?'checked':''}>
      <strong>${t}</strong><p>${d}</p>
    </label>`).join('')}</div>`;
}

function wireRoleCards(){
  document.querySelectorAll('.role-card input').forEach(r=>r.onchange=()=>{
    document.querySelectorAll(`input[name="${r.name}"]`).forEach(x=>x.closest('.role-card').classList.toggle('on',x.checked));
  });
}

function renderNoClub(){
  app.innerHTML=`<div class="login" style="max-width:760px">
    <h1>Join your club.</h1>
    <p>If your club already uses the platform, enter its join code. If your club is being set up for the first time, use the activation or Admin invitation link sent by the platform.</p>
    <section class="card">
      <h2>Join an existing club</h2>
      <div class="field"><label>Your name</label><input id="joinName" placeholder="Full name"></div>
      <div class="field"><label>Club join code</label><input id="joinCode" placeholder="e.g. A1B2C3D4"></div>
      <div class="section-label">How are you involved?</div>
      ${roleCards('joinRole','player')}
      <button class="btn secondary" id="joinClub">Join club</button>
      <div id="joinStatus" class="help"></div>
    </section>
    <div class="notice" style="margin-top:14px"><strong>Setting up a new club?</strong><br>New clubs are created through a subscription or Beta invitation, so the Secretary / trial lead can hand the system to the right Club Admin without becoming the day-to-day operator.</div>
  </div>`;

  wireRoleCards();

  document.getElementById('joinClub').onclick=async()=>{
    const involvement=document.querySelector('input[name="joinRole"]:checked')?.value;
    const status=document.getElementById('joinStatus');
    status.textContent='Joining…';
    const {error}=await supabase.rpc('join_club_by_code',{
      p_join_code:val('joinCode'),
      p_display_name:val('joinName'),
      p_involvement:involvement
    });
    if(error){status.textContent=error.message;return;}
    await loadContext();
  };
}

function renderFirstIdentitySetup(){
  app.innerHTML=`<div class="login" style="max-width:720px">
    <div class="section-label">${esc(club.name)}</div>
    <h1>How are you involved?</h1>
    <p>This only determines whether you need your own Player Plan. It does <strong>not</strong> give coaching access — the Club Admin controls that separately.</p>
    <div class="field"><label>Your name</label><input id="myName" value="${esc(userProfile?.display_name||'')}"></div>
    ${roleCards('myRole',membership.involvement||'player')}
    <button class="btn secondary" id="saveIdentity">Continue</button>
    <div id="identitySetupStatus" class="help"></div>
  </div>`;
  wireRoleCards();

  document.getElementById('saveIdentity').onclick=async()=>{
    const status=document.getElementById('identitySetupStatus');
    const involvement=document.querySelector('input[name="myRole"]:checked')?.value;
    status.textContent='Saving…';
    const {error}=await supabase.rpc('setup_my_club_identity',{
      p_club_id:club.id,
      p_display_name:val('myName'),
      p_involvement:involvement
    });
    if(error){status.textContent=error.message;return;}
    await loadContext();
  };
}


async function loadData(){
  const [pRes,dRes,sdRes,wRes,playerRes,workshopRes,myContributorRes,versionsRes,hwbDraftRes,hwbVersionsRes,planDraftRes,planVersionsRes]=await Promise.all([
    supabase.from('philosophy_profiles').select('*').eq('club_id',club.id).single(),
    supabase.from('philosophy_dimension_catalogue').select('*').order('sort_order'),
    supabase.from('club_philosophy_dimensions').select('*').eq('club_id',club.id),
    supabase.from('club_format_weights').select('*').eq('club_id',club.id),
    supabase.from('players').select('*').eq('club_id',club.id).eq('user_id',session.user.id).maybeSingle(),
    supabase.from('philosophy_workshops').select('*').eq('club_id',club.id).maybeSingle(),
    supabase.from('philosophy_contributors').select('*').eq('club_id',club.id).eq('user_id',session.user.id).maybeSingle(),
    supabase.from('philosophy_versions').select('*').eq('club_id',club.id).order('version_number',{ascending:false}),
    supabase.from('how_we_bat_drafts').select('*').eq('club_id',club.id).maybeSingle(),
    supabase.from('how_we_bat_versions').select('*').eq('club_id',club.id).order('philosophy_version',{ascending:false}),
    supabase.from('player_plan_structure_drafts').select('*').eq('club_id',club.id).maybeSingle(),
    supabase.from('player_plan_structure_versions').select('*').eq('club_id',club.id).order('philosophy_version',{ascending:false})
  ]);

  // A failed read is not an empty draft. Keep the current work intact so the
  // interface cannot replace saved wording with generated defaults on a retry.
  const draftLoadError=workshopRes.error||versionsRes.error||hwbDraftRes.error||hwbVersionsRes.error||planDraftRes.error||planVersionsRes.error;
  if(draftLoadError)throw new Error(`The club’s saved plans could not be loaded. ${draftLoadError.message}`);

  publishedProfile=pRes.data||{};
  publishedProfile.identity_values=Array.isArray(publishedProfile.identity_values)?publishedProfile.identity_values:[];
  publishedProfile.formats_enabled=publishedProfile.formats_enabled||{t20:true,limited_overs:true,long_form:true};
  dimensions=dRes.data||[];
  publishedSelectedDims=new Map((sdRes.data||[]).map(x=>[x.dimension_key,x]));
  publishedWeights=new Map((wRes.data||[]).map(x=>[`${x.dimension_key}:${x.format_key}`,Number(x.weight)]));

  workshop=workshopRes.data||null;
  myContributor=myContributorRes.data||null;
  philosophyVersions=versionsRes.data||[];
  howWeBatDraft=upgradeLegacyHowWeBatWording(hwbDraftRes.data||null);
  howWeBatBuilderDirty=false;
  howWeBatVersions=hwbVersionsRes.data||[];
  playerPlanStructureDraft=planDraftRes.data||null;
  playerPlanStructureVersions=planVersionsRes.data||[];
  playerPlanStructureWorking=null;
  playerPlanStructureDirty=false;
  playerPlanStructureManualEdit=false;
  myContribution=null;

  if(myContributor){
    const {data:c}=await supabase
      .from('philosophy_contributions')
      .select('*')
      .eq('club_id',club.id)
      .eq('user_id',session.user.id)
      .maybeSingle();
    myContribution=c||null;
  }

  if(myContribution){
    clubProfile={
      identity_values:Array.isArray(myContribution.identity_values)?myContribution.identity_values:[],
      identity_note:myContribution.identity_note||'',
      formats_enabled:myContribution.formats_enabled||{t20:true,limited_overs:true,long_form:true}
    };

    const noteObj=myContribution.dimension_notes||{};
    selectedDims=new Map((myContribution.selected_dimensions||[]).map(k=>[
      k,
      {club_id:club.id,dimension_key:k,enabled:true,club_note:noteObj[k]||''}
    ]));
    weights=new Map(Object.entries(myContribution.format_weights||{}).map(([k,v])=>[k,Number(v)]));
  }else{
    clubProfile=structuredClone(publishedProfile);
    selectedDims=new Map([...publishedSelectedDims.entries()].map(([k,v])=>[k,{...v}]));
    weights=new Map(publishedWeights);
  }

  myPlayer=playerRes.data||null;

  if(myPlayer){
    const {data:w}=await supabase
      .from('player_plan_workflows')
      .select('*')
      .eq('player_id',myPlayer.id)
      .maybeSingle();
    workflow=w||null;
  }else{
    workflow=null;
  }
}

function isAdmin(){
  return membership.permission_role==='admin';
}
function isCoachCaptain(){
  return ['coach_captain','both'].includes(membership.involvement);
}
function isPlayerUser(){
  return ['player','both'].includes(membership.involvement);
}
function canUsePlayersWorkspace(){
  return isAdmin() || ['captain','coach','head_coach'].includes(membership.permission_role);
}
function isPhilosophyLead(){
  return !!workshop && workshop.philosophy_lead_user_id===session.user.id;
}
function canContributePhilosophy(){
  return !!myContributor;
}
function hasLockedHowWeBatForCurrentRound(){
  if(howWeBatDraft)return howWeBatDraft.status==='ready';
  if(workshop && workshop.status!=='published')return false;
  return howWeBatVersions.length>0;
}
// One persisted-state model drives the landing page, overview and route guards.
// A new workshop never borrows completion from the system players are still using.
function clubSetupProgress(state={club,workshop,howWeBatDraft,playerPlanStructureDraft,philosophyVersions,howWeBatVersions,playerPlanStructureVersions}){
  const c=state.club||{};
  const round=state.workshop||null;
  const hwbDraft=state.howWeBatDraft||null;
  const planDraft=state.playerPlanStructureDraft||null;
  const systemLive=publishedPlayerSystemReady(state);
  const published=systemLive&&(!round||round.status==='published');
  // Existing saved appearances and live systems retain their progress. Cricket
  // drafts alone never count as a confirmed club look for a first publication.
  const detailsReady=!!(c.branding_updated_at||c.logo_data_url||c.website_url||systemLive);
  // Older clubs can have a saved draft without a workshop row. An unfinished
  // current workshop cannot inherit a leftover draft from an earlier round.
  const workshopReady=published||!!round?.final_draft_ready||(!round&&!!hwbDraft);
  const howWeBatReady=workshopReady&&(published||hwbDraft?.status==='ready');
  const structureReady=howWeBatReady&&(published||planDraft?.status==='ready');
  const steps=[
    {key:'workshop',title:'Batting Philosophy Workshop',shortTitle:'Workshop',tab:'workshop',complete:workshopReady,owner:'Philosophy Lead and contributors',action:'Continue Batting Philosophy Workshop',description:'Choose a Philosophy Lead, gather the contributions you want and agree the approach your club will use.'},
    {key:'howwebat',title:'How We Bat',shortTitle:'How We Bat',tab:'howwebat',complete:howWeBatReady,owner:'Philosophy Lead',action:'Review How We Bat',description:'Review the club’s batting approach, check each format and confirm it for the season.'},
    {key:'structure',title:'Player Plan Structure',shortTitle:'Plan questions',tab:'plan',complete:structureReady,owner:'Philosophy Lead',action:'Review Player Plan questions',description:'Review the questions generated from How We Bat and confirm what players will complete.'},
    {key:'details',title:'Club look',shortTitle:'Club look',tab:'dashboard',complete:detailsReady,owner:'Club Admin',action:'Review club look',description:'Your batting work is ready. Add your club logo and colours, or keep the current look, before the final publication step. You can change the look later.'},
    {key:'publish',title:'Publish club setup',shortTitle:'Publish',tab:'plan',complete:published,owner:'Philosophy Lead',action:'Publish club setup',description:'Publish How We Bat and the Player Plan questions together. This opens Player Plans for registered players and queues their ready-to-start email.'}
  ];
  const firstIncomplete=steps.findIndex(step=>!step.complete);
  return {detailsReady,workshopReady,howWeBatReady,structureReady,published,systemLive,currentIndex:firstIncomplete<0?steps.length:firstIncomplete,steps};
}

function canUseClubHome(){
  return isAdmin()||isPhilosophyLead()||canContributePhilosophy()||canUsePlayersWorkspace();
}

function clubSetupUnavailableReason(tab){
  const p=clubSetupProgress();
  // Published reading remains available while a replacement round is prepared.
  if(tab==='howwebat'&&howWeBatVersions.length)return '';
  if(['howwebat','plan'].includes(tab)&&!p.workshopReady)return 'Complete Batting Philosophy Workshop first. The Philosophy Lead chooses the approach used to create How We Bat.';
  if(tab==='plan'&&!p.howWeBatReady)return 'Confirm How We Bat first. The Player Plan questions are built from that approach.';
  return '';
}

function canOpenClubTab(tab){
  if(tab==='dashboard')return canUseClubHome();
  if(tab==='playerhome')return isPlayerUser();
  if(['permissions','groups'].includes(tab))return isAdmin();
  if(['players','feedback'].includes(tab))return canUsePlayersWorkspace();
  if(tab==='workshop')return !clubSetupUnavailableReason(tab)&&(isAdmin()||isPhilosophyLead()||canContributePhilosophy());
  if(['identity','dimensions','formats','preview'].includes(tab))return !clubSetupUnavailableReason(tab)&&(isPhilosophyLead()||canContributePhilosophy());
  if(tab==='plan')return !clubSetupUnavailableReason(tab)&&(isAdmin()||isPhilosophyLead());
  if(tab==='howwebat')return howWeBatVersions.length>0||(!clubSetupUnavailableReason(tab)&&(isAdmin()||isPhilosophyLead()));
  if(tab==='myplan')return isPlayerUser();
  if(tab==='howwetrain')return true;
  return tab==='guide';
}

function canActOnClubSetupStep(step){
  if(!step)return false;
  if(step.key==='details')return isAdmin();
  if(step.key==='workshop')return isAdmin()||isPhilosophyLead()||canContributePhilosophy();
  return isPhilosophyLead();
}

let clubHomeExpandedStage=null;
let clubHomeStageClubId=null;
let clubHomeNextPreparationKey=null;

function clubSetupContentPage(tab){
  const selectedTab={workshop:'workshop',howwebat:'howwebat',structure:'plan',publish:'plan'}[clubHomeExpandedStage];
  if(currentTab==='dashboard'&&clubHomeStageClubId===club?.id&&selectedTab===tab){
    const content=document.getElementById('clubHomePhaseContent');
    if(content)return content;
  }
  return document.getElementById('page');
}

function clubSetupStyles(){
  return `<style>
    .club-home-intro{margin:0 0 22px;max-width:820px;line-height:1.6;color:#56627a;font-size:15px}
    .club-progress-title{font-size:clamp(26px,3vw,32px);line-height:1.2;margin:8px 0 12px}
    .club-preparation{padding:22px;border:1px solid #dce2ee;border-radius:13px;background:#fff}
    .club-preparation-heading{display:flex;gap:16px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px}
    .club-preparation-heading h2{font-size:21px;margin:0 0 7px}.club-preparation-heading p{margin:0;max-width:740px;font-size:15px;line-height:1.6;color:#56627a}
    .club-preparation-count{font-size:13px;font-weight:750;color:#285d50}
    .club-setup-progress{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;list-style:none;padding:0;margin:0}
    .club-setup-progress li{min-width:0}.club-setup-progress button{display:flex;gap:10px;width:100%;height:100%;text-align:left;background:#fff;border:1px solid #dce2ee;border-radius:9px;padding:14px 10px;color:#263857;cursor:pointer;font:inherit;min-height:82px}
    .club-setup-progress button[aria-expanded="true"]{background:#eef2ff;border-color:var(--navy,#242e72);box-shadow:inset 0 -2px 0 var(--navy,#242e72)}
    .club-setup-progress .is-current button{border-color:var(--navy,#242e72)}
    .club-setup-marker{display:grid;place-items:center;flex:0 0 24px;width:24px;height:24px;border-radius:50%;background:#edf0f5;font-size:12px;font-weight:800}
    .is-current .club-setup-marker{background:var(--navy,#242e72);color:var(--navy-contrast,#fff)}.is-complete .club-setup-marker{background:#dceee8;color:#285d50}
    .club-setup-progress strong{display:block;font-size:14px;line-height:1.4;overflow-wrap:anywhere}.club-setup-progress small{display:block;font-size:12px;line-height:1.5;margin-top:5px}
    .club-stage-panel{border-top:1px solid #dce2ee;margin-top:20px;padding-top:20px}.club-stage-panel[hidden],.club-branding-card[hidden]{display:none}
    .club-stage-heading{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.club-stage-heading h3{font-size:22px;margin:0}.club-stage-heading p{font-size:14px;color:#56627a;line-height:1.6;max-width:760px;margin:8px 0}
    .club-stage-heading small{display:block;font-size:13px;color:#56627a;margin:8px 0 14px}.club-stage-content{margin-top:14px}.club-stage-content:empty{display:none}
    .club-home-next{margin-top:18px;padding:22px;border-left:4px solid var(--navy,#242e72)}.club-home-next h2{font-size:23px;line-height:1.3;margin:8px 0 12px}.club-home-next p{max-width:820px;line-height:1.6;font-size:15px}.club-home-next .btn:disabled{opacity:.7;cursor:not-allowed}
    .club-home-owner{font-size:13px;color:#59657c;margin-top:14px}.club-home-round-note{margin:0 0 16px}.club-help-feature{margin-top:22px}
    @media(max-width:760px){.club-preparation{padding:16px}.club-setup-progress{gap:6px}.club-setup-progress button{padding:12px 8px;gap:6px;flex-wrap:wrap}}
    @media(max-width:540px){.club-setup-progress{grid-template-columns:1fr}.club-setup-progress button{min-height:58px;flex-wrap:nowrap;align-items:center}.club-setup-progress button>span:last-child{display:flex;flex:1;justify-content:space-between;gap:12px;align-items:center}.club-setup-progress small{margin:0}.club-home-next{padding:18px}}
  </style>`;
}

function clubSetupProgressHtml(progress){
  return `<ol class="club-setup-progress" aria-label="Five preparation steps before players build their plans">${progress.steps.map((step,index)=>{
    const current=index===progress.currentIndex;
    return `<li class="${step.complete?'is-complete':current?'is-current':'is-future'}"><button type="button" data-club-stage="${step.key}" aria-expanded="false" aria-controls="clubHomeStagePanel" ${current?'aria-current="step"':''}><span class="club-setup-marker" aria-hidden="true">${step.complete?'✓':index+1}</span><span><strong>${esc(step.shortTitle)}</strong><small>${step.complete?'Complete':`Not complete${current?' · Next step':''}`}</small></span></button></li>`;
  }).join('')}</ol>`;
}

async function expandClubHomeStage(key,progress){
  const page=document.getElementById('page');
  const panel=document.getElementById('clubHomeStagePanel');
  const content=document.getElementById('clubHomePhaseContent');
  if(!panel||!content||currentTab!=='dashboard')return;
  clubHomeExpandedStage=key;
  page.querySelectorAll('[data-club-stage]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.clubStage===key)));
  const branding=page.querySelector('.club-branding-card');
  if(branding)branding.hidden=true;
  panel.hidden=!key;
  content.innerHTML='';
  if(!key)return;
  const step=progress.steps.find(item=>item.key===key);
  if(!step)return;
  const index=progress.steps.indexOf(step);
  const current=index===progress.currentIndex;
  const waiting=step.key==='workshop'&&canContributePhilosophy()&&!isPhilosophyLead()&&!isAdmin()&&myContributor?.status==='submitted';
  const canAct=current&&canActOnClubSetupStep(step)&&!waiting;
  const canView=step.complete&&canOpenClubTab(step.tab)&&(key!=='details'||isAdmin());
  const description=step.complete
    ?(key==='publish'?'The club’s batting approach and Player Plan questions are published. Registered players can now build their Player Plans, train, and learn through feedback. People can continue to register.':`View the saved ${step.title}. The full phase information is shown below.`)
    :current?(waiting?'Your contribution is submitted. Your Philosophy Lead will choose the club’s approach.':step.description)
    :`Complete ${progress.steps.slice(0,index).filter(item=>!item.complete).map(item=>item.shortTitle).join(', ')} first. This stage is not complete yet.`;
  document.getElementById('clubHomeStageHeading').innerHTML=`<div><div class="section-label">Step ${index+1} · ${step.complete?'Complete':'Not complete'}</div><h3>${step.complete?'View ':''}${esc(step.title)}</h3><p>${esc(description)}</p><small>${step.complete?'Saved stage':canAct?'Led by':'Waiting for'} ${step.complete?'':esc(step.owner)}${waiting?' · Your response is complete':''}</small></div><button class="btn ghost compact-btn" type="button" id="closeClubHomeStage">Close details</button>`;
  document.getElementById('closeClubHomeStage').onclick=()=>{
    expandClubHomeStage(null,progress);
    page.querySelector(`[data-club-stage="${key}"]`)?.focus({preventScroll:true});
  };
  if(key==='details'&&(canAct||canView)&&branding){branding.hidden=false;return;}
  if(canView&&key!=='details'){
    try{
      if(key==='workshop')await renderWorkshop();
      else if(key==='howwebat')renderPublishedHowWeBat();
      else await renderPlanStructure();
    }catch(error){
      if(clubHomeExpandedStage===key&&currentTab==='dashboard')content.innerHTML=`<div class="notice">${esc(error.message||String(error))}</div>`;
    }
    return;
  }
  if(current){
    const label=key==='workshop'&&!workshop?.philosophy_lead_user_id&&isAdmin()?'Choose a Philosophy Lead':step.action;
    content.innerHTML=`${!canAct&&!waiting?`<p class="help">${key==='details'?'Your Club Admin':'Your Philosophy Lead'} needs to complete this step.</p>`:''}<button class="btn secondary" id="continueClubHomeStage" type="button" ${canAct?'':'disabled'}>${esc(label)}</button>`;
    document.getElementById('continueClubHomeStage').onclick=async()=>{
      if(!canAct||!canOpenClubTab(step.tab)||!await saveClubEditsBeforeNavigation())return;
      currentTab=step.tab;localStorage.setItem(`bdp-tab-${club.id}`,currentTab);await renderTab();
    };
  }else if(step.complete){content.innerHTML='<p class="help">Your club’s authorised setup team can view the details of this phase.</p>';}
}


async function saveClubEditsBeforeNavigation(){
  if(!await savePhilosophyResponseBeforeNavigation())return false;
  if(!await saveClubPlanBeforeNavigation())return false;
  if(!await savePlayerPlanStructureBeforeNavigation())return false;
  if(!await saveHowWeBatBeforeNavigation())return false;
  if(!confirmLeaveWorkshopSetup())return false;
  return confirmLeaveFeedbackEntry();
}
function contributionLocked(){
  return myContributor?.status==='submitted';
}

let philosophyResponseNavigationSaving=false;
let workshopSetupSavedSnapshot=null;

function workshopSetupSnapshotOnPage(){
  if(!document.getElementById('saveWorkshopSetup')||!document.getElementById('leadUser'))return null;
  return JSON.stringify({
    mode:document.querySelector('input[name="workshopMode"]:checked')?.value||'solo',
    lead:document.getElementById('leadUser').value,
    contributors:[...document.querySelectorAll('[data-contributor-user]:checked')].map(input=>input.dataset.contributorUser).sort(),
    invitees:[...document.querySelectorAll('[data-new-contributor-row]')].map(row=>({
      name:row.querySelector('[data-new-name]')?.value.trim()||'',
      email:row.querySelector('[data-new-email]')?.value.trim()||''
    })).filter(person=>person.name||person.email)
  });
}

function rememberWorkshopSetupSnapshot(snapshot=workshopSetupSnapshotOnPage()){
  workshopSetupSavedSnapshot={clubId:club.id,snapshot};
}

function confirmLeaveWorkshopSetup(){
  if(currentTab!=='workshop'||workshopSetupSavedSnapshot?.clubId!==club?.id)return true;
  const current=workshopSetupSnapshotOnPage();
  if(current===null||current===workshopSetupSavedSnapshot.snapshot)return true;
  return confirm('You have unsaved changes to the workshop setup. Leave this page and discard those changes? Choose Cancel to keep editing or save your selections first.');
}

function philosophyResponseFieldsOnPage(){
  if(currentTab==='identity'&&document.getElementById('identityNote')){
    return {
      identity_values:[...document.querySelectorAll('[data-identity]:checked')].map(x=>x.dataset.identity),
      identity_note:val('identityNote'),
      formats_enabled:Object.fromEntries(FORMATS.map(([key])=>[key,!!document.querySelector(`[data-format="${key}"]`)?.checked]))
    };
  }
  if(currentTab==='dimensions'&&document.getElementById('dimensionNotes')){
    const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
    const formatWeights=new Map(weights);
    for(const key of keys)for(const [format] of FORMATS){
      const weightKey=`${key}:${format}`;
      if(!formatWeights.has(weightKey))formatWeights.set(weightKey,DEFAULT_WEIGHTS[key]?.[format]??2);
    }
    return {
      selected_dimensions:keys,
      dimension_notes:Object.fromEntries(keys.map(key=>[key,document.querySelector(`[data-dim-note="${key}"]`)?.value.trim()||''])),
      format_weights:Object.fromEntries(formatWeights)
    };
  }
  if(currentTab==='formats'&&document.getElementById('saveWeights')){
    const formatWeights=new Map(weights);
    document.querySelectorAll('[data-weight-key]').forEach(x=>formatWeights.set(x.dataset.weightKey,Number(x.value)));
    return {format_weights:Object.fromEntries(formatWeights)};
  }
  return null;
}

function samePhilosophyResponseFields(fields,response){
  // JSONB does not retain object-key order. Compare content rather than the
  // original serialisation so merely opening Help never creates another save.
  const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'
    ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
  return !!fields&&Object.keys(fields).every(key=>JSON.stringify(ordered(fields[key]))===JSON.stringify(ordered(response?.[key])));
}

async function savePhilosophyResponseBeforeNavigation(){
  if(philosophyResponseNavigationSaving)return false;
  if(!['identity','dimensions','formats'].includes(currentTab)||!myContribution||contributionLocked())return true;
  const fields=philosophyResponseFieldsOnPage();
  if(!fields||samePhilosophyResponseFields(fields,myContribution))return true;
  const targetClubId=club.id;
  const targetUserId=session.user.id;
  const targetTab=currentTab;
  const statusId=({identity:'identityStatus',dimensions:'dimStatus',formats:'weightStatus'})[targetTab];
  const status=document.getElementById(statusId);
  if(status)status.textContent='Saving your response…';
  philosophyResponseNavigationSaving=true;
  try{
    const {data,error}=await supabase.from('philosophy_contributions')
      .update({...fields,updated_at:new Date().toISOString()})
      .eq('club_id',targetClubId).eq('user_id',targetUserId).select('*').single();
    if(error)throw error;
    if(club?.id!==targetClubId||session?.user?.id!==targetUserId||currentTab!==targetTab)return false;
    myContribution=data||{...myContribution,...fields};
    if(targetTab==='identity')clubProfile={...clubProfile,...fields};
    if(targetTab==='dimensions')selectedDims=new Map(fields.selected_dimensions.map(key=>[key,{club_id:targetClubId,dimension_key:key,enabled:true,club_note:fields.dimension_notes[key]||''}]));
    if(fields.format_weights)weights=new Map(Object.entries(fields.format_weights).map(([key,value])=>[key,Number(value)]));
    if(workshop?.final_draft_ready&&isPhilosophyLead()&&howWeBatDraft)howWeBatDraft.status='draft';
    if(!samePhilosophyResponseFields(philosophyResponseFieldsOnPage(),fields)){
      if(status)status.textContent='Earlier edits saved. Your latest changes are still here; save again before leaving.';
      return false;
    }
    if(status)status.textContent='Saved ✓';
    return true;
  }catch(error){
    const message=`Couldn’t save your response. Your changes are still here. ${error?.message||'Please try again.'}`;
    if(club?.id===targetClubId&&currentTab===targetTab){
      if(status)status.textContent=message;
      else alert(message);
    }
    return false;
  }finally{
    philosophyResponseNavigationSaving=false;
  }
}


function accountMenuStyles(){
  return `<style>
    .shell .nav{flex-wrap:wrap}
    .shell .nav button[data-tab="guide"]{font-size:14px;min-height:44px;border:2px solid var(--navy);margin-left:auto}
    .club-help-feature{display:flex;align-items:center;justify-content:space-between;gap:22px;padding:22px 24px;margin:18px 0 22px;background:#f0f5ff;border:2px solid #ccd8f3;border-left:5px solid var(--navy);border-radius:14px}
    .club-help-feature h2{font-size:23px;line-height:1.25;margin:4px 0 8px;color:var(--navy)}
    .club-help-feature p{font-size:15px;line-height:1.5;margin:0;max-width:620px;color:#334464}
    .club-help-feature .btnrow{margin:0;flex-shrink:0}
    .club-help-feature .btn{font-size:14px;min-height:44px}
    @media(max-width:700px){.club-help-feature{align-items:stretch;flex-direction:column;padding:20px}.club-help-feature .btnrow{display:grid;grid-template-columns:1fr 1fr}.shell .nav button[data-tab="guide"]{margin-left:0}}
    .account-controls{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto}
    .platform-admin-link{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:inherit;padding:4px 3px;font:inherit;font-size:12px;font-weight:700;line-height:1.4;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
    .platform-admin-link:hover{text-decoration-thickness:2px}
    .platform-admin-link:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:4px}
    .account-access-status{padding:8px 9px;font-size:12px;line-height:1.5;color:#667085}
    .account-menu{position:relative;display:inline-block}
    .account-menu>summary{list-style:none;cursor:pointer;display:inline-flex!important;align-items:center;gap:7px;white-space:nowrap;user-select:none}
    .account-menu>summary::-webkit-details-marker{display:none}
    .account-menu>summary::marker{content:''}
    .account-menu-chevron{font-size:11px;line-height:1;opacity:.8;transition:transform .15s ease}
    .account-menu[open] .account-menu-chevron{transform:rotate(180deg)}
    .account-menu-popover{position:absolute;right:0;top:calc(100% + 8px);z-index:250;min-width:245px;padding:10px;border:1px solid #dfe4ef;border-radius:14px;background:#fff;color:#101a4f;box-shadow:0 14px 34px rgba(16,26,79,.18)}
    .account-menu-identity{padding:7px 8px 11px;border-bottom:1px solid #edf0f6;margin-bottom:6px;display:grid;gap:2px}
    .account-menu-identity strong{font-size:13px;color:#101a4f}
    .account-menu-identity span{font-size:11px;color:#667085;overflow-wrap:anywhere}
    .account-menu-action{width:100%;border:0;background:transparent;color:#101a4f;text-align:left;padding:10px 9px;border-radius:9px;font:inherit;font-weight:700;cursor:pointer}
    .account-menu-action:hover{background:#f3f5fa}
    .account-menu-action.danger{color:#9f1d24}
    .account-menu-version{display:block;padding:8px 9px 2px;border-top:1px solid #edf0f6;font-size:11px;color:#667085}
    @media(max-width:700px){.account-menu-popover{min-width:220px;max-width:min(280px,88vw)}}
  </style>`;
}

function accountMenuHtml({allowJoin=true,outId='out',joinId='joinAnother',showPlatform=false,platformId='accountPlatform'}={}){
  const email=session?.user?.email||'';
  const name=userProfile?.display_name||session?.user?.user_metadata?.display_name||'Your account';
  return `<div class="account-controls"><details class="account-menu">
    <summary class="btn ghost" aria-label="Account menu">Account <span class="account-menu-chevron" aria-hidden="true">⌄</span></summary>
    <div class="account-menu-popover">
      <div class="account-menu-identity"><strong>${esc(name)}</strong>${email?`<span>${esc(email)}</span>`:''}</div>
      ${showPlatform&&platformAccessError?'<div class="account-access-status" role="status">We couldn’t check your account access.<button class="account-menu-action" id="retryAccountAccess" type="button">Try again</button></div>':''}
      ${allowJoin?`<button class="account-menu-action" id="${joinId}" type="button">Join another club</button>`:''}
      <button class="account-menu-action" id="accountPassword" type="button">Set / change password</button>
      <button class="account-menu-action danger" id="${outId}" type="button">Sign out</button>
      <small class="account-menu-version">Club Batting v${APP_UI_VERSION}</small>
    </div>
  </details>${showPlatform&&platformRole?`<button class="platform-admin-link" id="${platformId}" type="button">Platform Admin</button>`:''}</div>`;
}

function renderShell(){
  document.title=club?.name?`${club.name} · Club Batting`:'Club Batting';
  applyClubTheme();

  const nav=[];
  if(canUseClubHome())nav.push(['dashboard','Club Home','club']);
  if(canUsePlayersWorkspace())nav.push(['players','Players','club']);

  // Keep daily player tools easy to reach, including for playing club staff.
  if(isPlayerUser()){
    nav.push(['playerhome','Player Home','player']);
    if(howWeBatVersions.length)nav.push(['howwebat','How We Bat','player']);
    nav.push(['myplan','My Player Plan','player']);
    nav.push(['howwetrain','How We Train','player']);
  }else if(!canUseClubHome()){
    if(howWeBatVersions.length)nav.push(['howwebat','How We Bat','player']);
    nav.push(['howwetrain','How We Train','player']);
  }

  // Workflow screens stay available internally when their prerequisites and
  // permissions are met. They do not each become another menu choice.
  if(!canOpenClubTab(currentTab)){
    currentTab=canUseClubHome()?'dashboard':isPlayerUser()?'playerhome':nav[0]?.[0]||'howwetrain';
  }

  localStorage.setItem(`bdp-tab-${club.id}`,currentTab);

  nav.push(['guide','Help & Tutorials','help']);

  const contextOptions=[...allMemberships.map(m=>`<option value="club:${m.club_id}" ${m.club_id===club.id?'selected':''}>${esc(m.clubs?.name||'Club')}</option>`),platformRole?`<option value="platform">Platform Admin</option>`:''].join('');

  app.innerHTML=`${accountMenuStyles()}<div class="shell">
    <header class="hero">
      <div class="topline">
        <div class="shell-brand-lockup">
          ${club.logo_data_url?`<div class="shell-club-logo"><img src="${esc(club.logo_data_url)}" alt="${esc(club.name)} logo"></div>`:''}
          <div>
            <div class="k">${esc(club.name)}</div>
            <h1>Club Batting</h1>
            <p>${isAdmin()?'Build how your club bats, turn it into Player Plans, and connect those plans to training.':'Your club’s How We Bat becomes the framework for your Player Plan and How We Train.'}</p>
          </div>
        </div>
        <div class="header-actions">
          ${(allMemberships.length>1||platformRole)?`<select id="contextSwitch" class="context-switch" aria-label="Switch club or platform">${contextOptions}</select>`:''}
          ${canBootstrapPlatform&&!platformRole?'<button class="btn ghost" id="claimPlatform">Set up Platform Owner</button>':''}
          <button class="btn secondary" id="openClubHelp" type="button" aria-label="Ask the Club Batting Guide and explore tutorials">Ask the Guide</button>
          ${accountMenuHtml({allowJoin:true,outId:'out',joinId:'joinAnother',showPlatform:true,platformId:'accountPlatform'})}
        </div>
      </div>
    </header>
    <nav class="nav">${(()=>{let previousGroup=null;return nav.map(([k,l,g])=>{const startsNewGroup=previousGroup!==null&&previousGroup!==g;previousGroup=g;return `<button data-tab="${k}" class="${startsNewGroup?'nav-group-start':''}" data-nav-group="${g||''}">${l}</button>`;}).join('');})()}</nav>
    <main class="page" id="page"></main>
  </div>`;

  document.getElementById('out').onclick=async()=>{if(await saveClubEditsBeforeNavigation())await supabase.auth.signOut();};
  document.getElementById('accountPassword').onclick=openAccountPassword;
  document.getElementById('openClubHelp').onclick=()=>openClubBattingGuideTopic('whole_process',{focus:'chat'});
  document.getElementById('joinAnother').onclick=async()=>{if(await saveClubEditsBeforeNavigation())renderJoinAnotherClub();};
  document.getElementById('accountPlatform')?.addEventListener('click',async()=>{if(!await saveClubEditsBeforeNavigation())return;await renderPlatformConsole();});
  document.getElementById('retryAccountAccess')?.addEventListener('click',async()=>{
    if(!await saveClubEditsBeforeNavigation())return;
    await loadPlatformContext();
    renderShell();
  });

  if(document.getElementById('contextSwitch')){
    document.getElementById('contextSwitch').onchange=async e=>{
      if(!await saveClubEditsBeforeNavigation()){e.target.value=`club:${club.id}`;return;}
      if(e.target.value==='platform'){
        localStorage.setItem('bdp-context','platform');
        renderPlatformConsole();
        return;
      }
      const id=e.target.value.replace('club:','');
      localStorage.setItem('bdp-context','club');
      localStorage.setItem('bdp-club-id',id);
      await loadContext();
    };
  }

  if(document.getElementById('claimPlatform')){
    document.getElementById('claimPlatform').onclick=async()=>{
      const {error}=await supabase.rpc('bootstrap_platform_owner');
      if(error){restoreUnsavedButton();alert(error.message);return;}
      await loadPlatformContext();
      renderShell();
    };
  }

  document.querySelectorAll('.nav button').forEach(b=>b.onclick=async()=>{
    const nextTab=b.dataset.tab;
    if(!canOpenClubTab(nextTab))return;
    if(!await saveClubEditsBeforeNavigation())return;

    // If a player is open inside the Players workspace, clicking the main
    // Players navigation button should behave like the on-page ← Players
    // control and return to the Players landing screen.
    if(nextTab==='players' && currentTab==='players' && playersWorkspaceSelectedId){
      await returnToPlayersWorkspaceList();
      return;
    }

    currentTab=nextTab;
    localStorage.setItem(`bdp-tab-${club.id}`,currentTab);
    if(nextTab==='guide')guideSelectedCapabilityKey='whole_process';
    await renderTab();
    if(nextTab==='guide')focusClubGuideArea('tutorials');
  });
  renderTab();
}



async function renderPlayerJoinRoute(token){
  const {data:info,error}=await supabase.rpc('get_public_player_join',{p_token:token});

  if(error || !info){
    app.innerHTML=`<div class="login">
      <div class="section-label">Player sign-up</div>
      <h1>This player link is no longer valid.</h1>
      <p>Ask your club for its current Player Sign-up link or QR code.</p>
    </div>`;
    return;
  }

  if(!info.open){
    app.innerHTML=`<div class="login" style="max-width:650px">
      <div class="section-label">${esc(info.club_name)}</div>
      <h1>Player sign-up is currently closed.</h1>
      <p>Your club has temporarily closed player registration. Ask your Club Admin when sign-up will reopen.</p>
      <p>Already registered? <a href="./app.html?signin=1">Sign in to your account</a>.</p>
    </div>`;
    return;
  }

  if(!session){
    app.innerHTML=`<div class="login" style="max-width:650px">
      <div class="section-label">Player sign-up</div>
      <h1>Join ${esc(info.club_name)}</h1>
      <p>This link registers you as a <strong>Player</strong>. If you are also a captain or coach, the Club Admin can add those permissions afterwards.</p>
      ${info.plans_ready===false?'<div class="notice">You can register now. Your club is preparing its setup; we’ll email you when Player Plans are ready. Assigned workshop and setup roles can take part before then.</div>':''}
      <p>Already have an account? <a href="./app.html?player_join=${encodeURIComponent(token)}&signin=1">Sign in with your password</a>.</p>
      <div class="field"><label>Your email</label><input id="playerJoinEmail" type="email" placeholder="you@example.com"></div>
      <button class="btn secondary" id="playerJoinSignIn">Send secure sign-in link</button>
      <div id="playerJoinStatus" class="help"></div>
    </div>`;

    document.getElementById('playerJoinSignIn').onclick=async()=>{
      const email=val('playerJoinEmail');
      const st=document.getElementById('playerJoinStatus');
      if(!email){st.textContent='Enter your email address.';return;}
      st.textContent='Sending…';
      const {error:e}=await supabase.auth.signInWithOtp({
        email,
        options:{emailRedirectTo:redirectUrl()}
      });
      st.textContent=e?e.message:'Check your email and tap the secure sign-in link. It will bring you straight back here.';
    };
    return;
  }

  const {data:profileData}=await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id',session.user.id)
    .maybeSingle();

  app.innerHTML=`<div class="login" style="max-width:650px">
    <div class="section-label">Player sign-up</div>
    <h1>Join ${esc(info.club_name)}</h1>
    <p>You’re joining as a <strong>Player</strong>. Captain/coach access and workshop participation are assigned separately by the club.</p>
    ${info.plans_ready===false?'<div class="notice">Registration is available now. Player Plans open after the club publishes its setup. If you have been assigned a setup role, you can start that work now.</div>':''}
    <div class="field"><label>Your name</label><input id="playerJoinName" value="${esc(profileData?.display_name||'')}" placeholder="Full name"></div>
    <button class="btn secondary" id="completePlayerJoin">Join ${esc(info.club_name)}</button>
    <div id="completePlayerJoinStatus" class="help"></div>
  </div>`;

  document.getElementById('completePlayerJoin').onclick=async()=>{
    const st=document.getElementById('completePlayerJoinStatus');
    st.textContent='Joining…';

    const {data:clubId,error:jErr}=await supabase.rpc('join_club_as_player',{
      p_token:token,
      p_display_name:val('playerJoinName')
    });

    if(jErr){st.textContent=jErr.message;return;}

    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',clubId);
    history.replaceState({},'',location.pathname);
    currentTab='myplan';
    await loadPlatformContext();
    await loadContext();
  };
}

async function renderPlayerQRCode(link){
  const img=document.getElementById('playerSignupQR');
  const dl=document.getElementById('downloadPlayerQR');
  const fallback=document.getElementById('qrFallback');
  if(!img)return;

  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const QRCode=mod.default||mod;
    const dataUrl=await QRCode.toDataURL(link,{
      width:260,
      margin:2,
      errorCorrectionLevel:'M'
    });
    img.src=dataUrl;
    img.style.display='block';
    if(dl){
      dl.href=dataUrl;
      dl.download=`${slug(club.name)||'club'}-player-signup-qr.png`;
      dl.style.display='inline-flex';
    }
    if(fallback)fallback.style.display='none';
  }catch(e){
    if(fallback){
      fallback.style.display='block';
      fallback.textContent='QR could not load on this device. The WhatsApp/link buttons still work normally.';
    }
  }
}

async function renderJoinByCode(joinCode){
  // The dedicated non-playing staff link selects the matching registration type.
  // This affects whether a Player Plan is needed; it never grants club permissions.
  const staffRoute=new URLSearchParams(location.search).get('involvement')==='coach_captain';
  const {data:profileData}=await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id',session.user.id)
    .maybeSingle();

  userProfile=profileData||null;

  app.innerHTML=`<div class="login" style="max-width:720px">
    <div class="section-label">${staffRoute?'Non-playing staff sign-up':'Club invitation'}</div>
    <h1>Join your club.</h1>
    <p>Your club invitation is ready. Confirm your name and how you are involved; the club assigns any club role and player access separately.</p>

    <div class="invite-code-confirm">
      <span>Club code</span>
      <strong>${esc(joinCode.toUpperCase())}</strong>
    </div>

    <div class="field"><label>Your name</label><input id="joinName" value="${esc(userProfile?.display_name||'')}" placeholder="Full name"></div>

    <div class="section-label">How are you involved?</div>
    ${roleCards('joinRole',staffRoute?'coach_captain':'player')}

    <div class="btnrow">
      <button class="btn secondary" id="joinClub">Join club</button>
      <button class="btn ghost" id="cancelJoinLink">Cancel</button>
      <span class="status" id="joinStatus"></span>
    </div>
  </div>`;

  wireRoleCards();

  document.getElementById('cancelJoinLink').onclick=async()=>{
    history.replaceState({},'',location.pathname);
    await loadContext();
  };

  document.getElementById('joinClub').onclick=async()=>{
    const involvement=document.querySelector('input[name="joinRole"]:checked')?.value;
    const st=document.getElementById('joinStatus');
    st.textContent='Joining…';

    const {data,error}=await supabase.rpc('join_club_by_code',{
      p_join_code:joinCode,
      p_display_name:val('joinName'),
      p_involvement:involvement
    });

    if(error){st.textContent=error.message;return;}

    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',data);
    history.replaceState({},'',location.pathname);
    await loadContext();
  };
}

function renderJoinAnotherClub(){
  app.innerHTML=`<div class="login" style="max-width:720px">
    <div class="section-label">Add another club to this login</div>
    <h1>Join another club.</h1>
    <p>The same email account can belong to multiple clubs. Each club controls its own permissions independently.</p>
    <div class="field"><label>Your name</label><input id="joinName" value="${esc(userProfile?.display_name||'')}"></div>
    <div class="field"><label>Club join code</label><input id="joinCode" placeholder="e.g. A1B2C3D4"></div>
    ${roleCards('joinRole','player')}
    <div class="btnrow"><button class="btn secondary" id="joinClub">Join club</button><button class="btn ghost" id="cancelJoin">Cancel</button><span class="status" id="joinStatus"></span></div>
  </div>`;
  wireRoleCards();
  document.getElementById('cancelJoin').onclick=renderShell;
  document.getElementById('joinClub').onclick=async()=>{
    const involvement=document.querySelector('input[name="joinRole"]:checked')?.value;
    const st=document.getElementById('joinStatus');
    st.textContent='Joining…';
    const {data,error}=await supabase.rpc('join_club_by_code',{
      p_join_code:val('joinCode'),p_display_name:val('joinName'),p_involvement:involvement
    });
    if(error){st.textContent=error.message;return;}
    localStorage.setItem('bdp-club-id',data);
    await loadContext();
  };
}

function renderTab(){
  if(!canOpenClubTab(currentTab)){
    currentTab=canUseClubHome()?'dashboard':isPlayerUser()?'playerhome':'howwetrain';
    localStorage.setItem(`bdp-tab-${club.id}`,currentTab);
  }
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===currentTab));
  const map={
    dashboard:renderClubDashboard,
    playerhome:renderPlayerHome,
    groups:renderPlayingGroups,
    players:renderPlayersWorkspace,
    feedback:renderFeedbackWorkspace,
    workshop:renderWorkshop,
    identity:renderIdentity,
    dimensions:renderDimensions,
    formats:renderFormats,
    preview:renderPreview,
    plan:renderPlanStructure,
    permissions:renderPermissions,
    howwebat:renderPublishedHowWeBat,
    myplan:renderMyPlan,
    howwetrain:renderHowWeTrain,
    guide:renderClubBattingGuide
  };
  try{
    const result=(map[currentTab]||renderMyPlan)();
    if(result && typeof result.then==='function'){
      return result.catch(err=>{
        console.error(err);
        const page=document.getElementById('page');
        if(page)page.innerHTML=`<section class="card"><div class="section-label">This page could not finish loading</div><h2>Something interrupted the page.</h2><div class="notice">${esc(err?.message||String(err))}</div><div class="help" style="margin-top:10px">Your saved data has not been deleted. Refresh once; if this returns, send us the wording above.</div></section>`;
      });
    }
  }catch(err){
    console.error(err);
    const page=document.getElementById('page');
    if(page)page.innerHTML=`<section class="card"><div class="section-label">This page could not finish loading</div><h2>Something interrupted the page.</h2><div class="notice">${esc(err?.message||String(err))}</div></section>`;
  }
}



/* ---------------- CLUB BATTING GUIDE ---------------- */

function guideAudienceKey(){
  const role=membership?.permission_role||'';
  if(['admin','head_coach','coach','captain'].includes(role))return role;
  return isPlayerUser()?'player':'member';
}

function focusClubGuideArea(area='tutorials'){
  requestAnimationFrame(()=>{
    if(currentTab!=='guide')return;
    const target=area==='chat'
      ?document.getElementById('demoGuideNote')||document.querySelector('.guide-chat-card')
      :guideSelectedCapabilityKey==='whole_process'?document.getElementById('guideProcessHeading'):document.querySelector('.guide-tutorial-card');
    if(!target)return;
    const nav=document.querySelector('.nav');
    const offset=(nav?.getBoundingClientRect().height||0)+(document.getElementById('demoToolbar')?.getBoundingClientRect().height||0)+18;
    target.style.scrollMarginTop=offset+'px';
    target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
    target.scrollIntoView({block:'start',behavior:'auto'});
  });
}

async function openClubBattingGuideTopic(capabilityKey='whole_process',{focus='tutorials'}={}){
  if(!await saveClubEditsBeforeNavigation())return;
  guideSelectedCapabilityKey=capabilityKey||'whole_process';
  currentTab='guide';
  localStorage.setItem(`bdp-tab-${club.id}`,currentTab);
  await renderTab();
  focusClubGuideArea(focus);
}

function guideTargetLabel(tab){
  return ({dashboard:'Club Home',permissions:'People & Sign-up',workshop:'Batting Philosophy Workshop',howwebat:'How We Bat',plan:'Player Plan Structure',players:'Players',playerhome:'Player Home',myplan:'My Player Plan',howwetrain:'How We Train'}[tab]||'Open area');
}

function guideTargetUnavailableReason(tab,focus=''){
  if(focus==='plan_dates'&&!isAdmin())return 'The Club Admin sets Player Plan dates.';
  if(focus==='plan_dates'&&!philosophyVersions.length)return 'Player Plan dates become available after the Philosophy Lead publishes the Club Batting System.';
  if(canOpenClubTab(tab))return '';
  const prerequisite=clubSetupUnavailableReason(tab);
  if(prerequisite)return prerequisite;
  if(['dashboard','permissions','groups'].includes(tab))return 'The Club Admin manages this step.';
  if(tab==='workshop')return 'The Philosophy Lead and invited contributors work on this step.';
  if(tab==='plan')return 'The Philosophy Lead finalises the Player Plan Structure.';
  if(tab==='players'||tab==='feedback')return 'This workspace is for club staff with assigned player access.';
  if(tab==='myplan'||tab==='playerhome')return 'This step is for registered players.';
  if(tab==='howwebat'||tab==='howwetrain')return 'This becomes available when the Philosophy Lead publishes the Club Batting System.';
  return 'This area is not available for your club role.';
}

async function guideGoToTarget(tab,focus=''){
  if(!tab||tab==='guide')return;
  const unavailable=guideTargetUnavailableReason(tab,focus);
  if(unavailable){alert(unavailable);return;}
  if(!await saveClubEditsBeforeNavigation())return;
  if(tab==='players'){
    playersWorkspaceSelectedId=null;
    playersWorkspaceSection='summary';
  }
  if(focus==='plan_dates'){
    currentTab='players';
    localStorage.setItem(`bdp-tab-${club.id}`,currentTab);
    renderTab();
    setTimeout(()=>openPlanDueDateDialog(),120);
    return;
  }
  if(focus==='coach_conversations')playersWorkspaceGroupFilter='__discussion__';
  currentTab=tab;
  localStorage.setItem(`bdp-tab-${club.id}`,currentTab);
  renderTab();
}

function guideVisibleMessages(messages=[]){
  return (messages||[]).filter(m=>['user','assistant'].includes(m.role));
}

const GUIDE_TOPIC_ORDER=['whole_process','philosophy_workshop','how_we_bat','player_plan_structure','plan_dates','player_plan','how_we_train','feedback_loop','coach_conversations'];

function guideTopicNumber(key){
  const index=GUIDE_TOPIC_ORDER.indexOf(key);
  return index>0?index:null;
}

function guideHelpStyles(){
  // Keep the reading order vertical even where the existing stylesheet uses two columns.
  return `<style>
    .guide-chat-card{margin-top:18px;border:2px solid var(--primary);background:#f4f7ff}
    .guide-chat-card h2{margin-top:4px}
    .guide-chat-card>p{font-size:1rem;line-height:1.55;color:var(--text)}
    .guide-chat-card .guide-chat-messages.is-empty{min-height:0}
    .guide-process-heading{margin:28px 0 12px}
    .guide-layout.guide-is-overview{grid-template-columns:minmax(0,1fr)}
    .guide-layout.guide-is-overview .guide-chat-card{grid-column:1}
    .guide-layout .guide-topic-list{display:flex;flex-direction:column;min-width:0;gap:8px}
    .guide-layout .guide-topic-list button{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;align-items:start;width:100%;min-height:48px;font:inherit}
    .guide-layout .guide-topic-list button.guide-topic-overview{grid-template-columns:minmax(0,1fr)}
    .guide-layout .guide-topic-list button:focus-visible{outline:3px solid var(--primary);outline-offset:3px}
    .guide-layout .guide-topic-list .guide-topic-number{display:grid;place-items:center;width:30px;height:30px;margin:0;border-radius:50%;background:var(--primary);color:#fff;font-size:.85rem;font-weight:800;line-height:1}
    .guide-layout .guide-topic-list .guide-topic-copy{margin:0;min-width:0}
    .guide-layout .guide-topic-list strong{color:var(--text);line-height:1.35}
    .guide-layout .guide-topic-list .guide-topic-description{margin-top:5px;font-size:.85rem;line-height:1.45}
    .guide-layout .guide-topic-list .guide-topic-complete{margin-top:7px;font-size:.75rem;font-weight:700;color:var(--primary)}
  </style>`;
}

function guideCapabilityForCurrentProduct(capability){
  const item={...capability};
  const staff=canUsePlayersWorkspace();
  const playerPlanTarget=!isPlayerUser()&&staff?'players':'myplan';
  const feedbackTarget=staff?'players':'howwetrain';
  // Keep database identities, audiences and progress; update the visible copy in app.js.
  // This also replaces legacy tutorial text without requiring a catalogue migration.
  const copy={
    whole_process:{
      title:'The whole Club Batting process',
      purpose:'One club approach. A plan for every batter.',
      short_explanation:'Agree how your club wants to bat. Turn that into How We Bat, individual Player Plans and personalised How We Train plans. Use innings and training feedback to keep improving.',
      target_tab:'guide',
      tutorial:[
        {title:'Register people and assign access',body:'People can sign up at any stage. Everyone who plays joins as a Player; non-playing staff use their own sign-up route. The Club Admin assigns club roles in People & Sign-up and selects workshop participants in the Workshop. Registration alone gives no access to other players or unfinished setup.',target_tab:isAdmin()?'permissions':'guide'},
        {title:'Agree the batting philosophy',body:'The Philosophy Lead and nominated coaches share their views in the Batting Philosophy Workshop, then settle the club’s approach.',target_tab:'workshop'},
        {title:'Create How We Bat',body:'Club Batting turns that philosophy into How We Bat: the club’s guide to its batting approach. The Philosophy Lead reviews and confirms it.',target_tab:'howwebat'},
        {title:'Set the Player Plan questions',body:'How We Bat generates the prompts for individual Player Plans. The Philosophy Lead refines and confirms them; the Club Admin checks the club look before the Lead publishes.',target_tab:'plan'},
        
        {title:'Publish, then start Player Plans',body:'The five preparation steps prepare the club’s approach and questions. Registered players see a waiting message until publication, when their ready-to-start email is queued. Player Plans, training and feedback are the continuing part of the process.',target_tab:playerPlanTarget},
        {title:'Set Player Plan dates',body:'The Club Admin sets due dates for the format plans each Playing Group needs. Other formats stay optional.',target_tab:'players',focus:'plan_dates'},
        {title:'Build a Player Plan',body:'Each batter chooses their shots, when to use them and how to build an innings. Complete Core, then the formats you play.',target_tab:playerPlanTarget},
        {title:'Train the plan',body:'The completed plan generates personalised How We Train suggestions. Practise your shots and decisions so you can commit when the right ball arrives.',target_tab:'howwetrain'},
        {title:'Learn from innings and training',body:'Players reflect on innings; coaches add match and training feedback. Compare the whole innings and the dismissal ball with the Player Plan, separating decision from execution.',target_tab:feedbackTarget},
        {title:'Agree what comes next',body:'Discuss what worked and what needs practice. Agree a useful action and review date, or keep the plan as it is.',target_tab:feedbackTarget,...(staff?{focus:'coach_conversations'}:{})}
      ]
    },
    philosophy_workshop:{
      title:'Run the Batting Philosophy Workshop',
      purpose:'Agree how your club wants to bat.',
      short_explanation:'The Philosophy Lead and nominated coaches shape the club’s batting philosophy together. Their decisions become the foundation for How We Bat.',
      target_tab:'workshop',
      tutorial:[
        {title:'Choose the Lead and contributors',body:'The Club Admin appoints the Philosophy Lead and invites coaches or other contributors. The Lead is responsible for the final philosophy.'},
        {title:'Start with independent views',body:'Each contributor answers the Workshop questions before comparing responses. Give different cricket perspectives room to be heard.'},
        {title:'Agree the club approach',body:'The Philosophy Lead reviews the contributions, resolves differences and chooses the final philosophy.'},
        {title:'Turn it into How We Bat',body:'Use the agreed philosophy to generate the club’s How We Bat guide.',target_tab:'howwebat'}
      ]
    },
    how_we_bat:{
      title:isPhilosophyLead()||isAdmin()?'Create How We Bat':'Understand How We Bat',
      purpose:'Make the club’s approach clear.',
      short_explanation:'Club Batting turns the agreed philosophy into How We Bat: a shared guide to the club’s batting approach. The Philosophy Lead reviews and confirms it.',
      target_tab:'howwebat',
      tutorial:[
        {title:'Build from the agreed philosophy',body:'Club Batting generates How We Bat from the final Workshop decisions.'},
        {title:'Make the messages useful',body:'The Philosophy Lead reviews the messages for each format and refines the wording. Keep them clear enough to use in a match.'},
        {title:'Confirm How We Bat',body:'Confirm the guide for this round. It will shape the questions each batter uses to build a Player Plan.'},
        {title:'Revisit when the club changes',body:'A new season or a change of direction can call for a new Workshop round. The club can review its approach and publish an updated system.'}
      ]
    },
    player_plan_structure:{
      title:'Set the Player Plan questions',
      purpose:'Help every batter make the plan their own.',
      short_explanation:'How We Bat generates the prompts players use to build their own Player Plans. The Philosophy Lead can edit the exact questions before confirming them.',
      target_tab:'plan',
      tutorial:[
        {title:'Generate the questions',body:'Club Batting uses How We Bat to create Core and format questions for each Player Plan.'},
        {title:'Refine the wording',body:'The Philosophy Lead checks that the prompts help batters describe their strengths, scoring options, risks and reset cues.'},
        {title:'Confirm the questions',body:'Confirm them for this round, then return to Club Home. This saves the questions; publishing opens them to players.',target_tab:'dashboard'},
        {title:'Check the club look',body:'The Club Admin checks the logo and colours, or chooses Keep this look & continue. This happens just before publication.',target_tab:'dashboard'},
        {title:'Publish and notify players',body:'Once the club look is confirmed, the Philosophy Lead selects Publish & notify players. Players can then build their plans and receive the readiness email.',target_tab:'plan'}
      ]
    },
    plan_dates:{
      title:'Set Player Plan dates',
      purpose:'Make the next step clear for each Playing Group.',
      short_explanation:'The Club Admin sets due dates for the format plans each Playing Group needs. Other formats stay optional.',
      target_tab:'players',
      tutorial:[
        {title:'Start after publication',body:'Once the club’s system is live, the Club Admin opens Player Plan dates from Players.',target_tab:'players',focus:'plan_dates'},
        {title:'Choose the group and formats',body:'Set a due date for each format the Playing Group should complete. T20, Limited Overs and Long Form remain available to everyone.'},
        {title:'Leave optional formats undated',body:'Players can still complete these plans if they choose.'},
        {title:'Check progress',body:'Use the incomplete and overdue views to see who needs a reminder.'}
      ]
    },
    player_plan:{
      title:'Build a Player Plan',
      purpose:'Choose your shots. Know when to commit.',
      short_explanation:'Turn the club’s approach into your own plan: your shots, when to use them and how you’ll build an innings.',
      target_tab:playerPlanTarget,
      tutorial:[
        {title:'Start with Core',body:'Choose the shots you trust, the balls you’ll leave or defend, and the cues that help you reset.',target_tab:playerPlanTarget},
        {title:'Plan for the formats you play',body:'Answer the format prompts using your strengths and likely match situations. Due dates show which plans your Playing Group needs; other formats are optional.'},
        {title:'Turn your plan into practice',body:'Complete Core and a format to unlock personalised How We Train suggestions for that format.',target_tab:'howwetrain'},
        {title:'Keep your plan useful',body:'Return to My Player Plan to review your choices. Player Home points you to your next plan, training or reflection task.',...(isPlayerUser()?{target_tab:'playerhome'}:{})}
      ]
    },
    how_we_train:{
      title:'Use How We Train',
      purpose:'Practise your plan. Commit when the ball is there.',
      short_explanation:'Your Player Plan generates personalised How We Train suggestions. Practise your chosen shots and decisions so you can trust them in a match.',
      target_tab:'howwetrain',
      tutorial:[
        {title:'Start with your Player Plan',body:'Complete Core and a format. How We Train then builds practice suggestions around your own game.',target_tab:playerPlanTarget},
        {title:'Choose a useful focus',body:'Use your plan and recent feedback to pick what needs practice: a scoring shot, leaving well, taking a single or recognising the right ball.'},
        {title:'Practise the decision and the skill',body:'Recreate the balls and situations you’ll face. Recognise the opportunity, commit to your choice and practise executing it.'},
        {title:'Recognise preparation and commitment',body:'A dismissal alone does not make the choice wrong. Support the commitment, discuss decision and execution separately, and choose useful practice.'},
        {title:'Review the next session',body:'Use feedback and any agreed coaching action to decide what to keep practising. Shared actions and their review history are in How We Train.',target_tab:'howwetrain'}
      ]
    },
    feedback_loop:{
      title:'Player and coach feedback',
      purpose:'Learn from the innings, not just the dismissal.',
      short_explanation:'Players reflect on innings; coaches add match and training feedback. Compare both views with the Player Plan to choose what to practise next.',
      target_tab:feedbackTarget,
      tutorial:[
        {title:'Record your own view first',body:'Players add their innings reflection in How We Train. Coaches and captains with assigned access add match feedback or training observations in Players.',target_tab:feedbackTarget},
        {title:'Look at the whole innings',body:'Where did the batter follow their plan? Where did they move outside it? Consider what the match situation called for.'},
        {title:'Look separately at the dismissal ball',body:'Did the choice fit the plan and the ball? Then consider how the shot was executed. One ball does not describe the whole innings.'},
        {title:'Learn without judgement',body:'Recognise practice and commitment, including when execution falls short. Compare perspectives without forcing agreement, then discuss the most useful next step.'}
      ]
    },
    coach_conversations:{
      title:'Coach Conversations',
      purpose:'Agree one useful next step.',
      short_explanation:'Use the feedback to agree what to practise or review next. Record a useful action and a date to check progress.',
      target_tab:feedbackTarget,
      tutorial:[
        {title:'Open the conversation',body:'Club Batting highlights feedback worth discussing. Use it to ask the player about their plan, decisions and preparation.',target_tab:feedbackTarget,...(staff?{focus:'coach_conversations'}:{})},
        {title:'Agree what will help',body:'Recognise commitment and discuss what the evidence suggests. Keep the plan, agree a training change or plan review, or choose no action.'},
        {title:'Record the action and review date',body:'For a training change or plan review, agree a specific action and when to check progress. The player and authorised coaching staff share it in How We Train.'},
        {title:'Follow up together',body:'Review what the player practised and what changed. Support confidence and enjoyment while following through on the agreed commitment.',target_tab:'howwetrain'}
      ]
    }
  };
  if(copy[item.capability_key])Object.assign(item,copy[item.capability_key]);
  else if(Array.isArray(item.tutorial))item.tutorial=item.tutorial.map(step=>({...step}));
  const currentLabel=value=>typeof value==='string'?value.replace(/\b(?:Batting )?Philosophy Workshop\b/g,'Batting Philosophy Workshop').replace(/\bMy Batting\b/g,'Player Home'):value;
  for(const field of ['title','purpose','short_explanation'])item[field]=currentLabel(item[field]);
  if(Array.isArray(item.tutorial))item.tutorial=item.tutorial.map(step=>({...step,title:currentLabel(step.title),body:currentLabel(step.body)}));
  return item;
}

function guideMessagesHtml(messages=[],emptyText='Ask anything about how Club Batting works at your club.'){
  const visible=guideVisibleMessages(messages);
  if(!visible.length)return `<div class="guide-chat-empty">${esc(emptyText)}</div>`;
  return visible.map(m=>`<div class="guide-chat-message ${m.role}"><span>${m.role==='assistant'?'Club Batting Guide':'You'}</span><p>${esc(m.content||'')}</p></div>`).join('');
}

function setGuideMessages(container,messages=[],emptyText){
  if(!container)return;
  const visible=guideVisibleMessages(messages);
  container.innerHTML=guideMessagesHtml(visible,emptyText);
  container.classList.toggle('is-empty',!visible.length);
  if(visible.length){
    const questions=container.querySelectorAll('.guide-chat-message.user');
    const latestQuestion=questions[questions.length-1];
    if(latestQuestion){
      const top=latestQuestion.getBoundingClientRect().top-container.getBoundingClientRect().top+container.scrollTop;
      container.scrollTop=Math.max(0,top-8);
    }else{
      container.scrollTop=container.scrollHeight;
    }
  }
}

async function edgeFunctionErrorMessage(error,data,fallback='The service could not respond just now.'){
  if(data?.error)return String(data.error);
  const response=error?.context;
  if(response&&typeof response.clone==='function'){
    try{
      const payload=await response.clone().json();
      if(payload?.error)return String(payload.error);
    }catch(_ignored){}
    try{
      const detail=(await response.clone().text()).trim();
      if(detail&&!/^\s*\{/.test(detail))return detail.slice(0,500);
    }catch(_ignored){}
  }
  return error?.message||fallback;
}

async function loadClubGuideHistory(){
  const {data,error}=await supabase.functions.invoke('club-batting-guide',{body:{action:'history',club_id:club.id}});
  if(error||data?.error)return [];
  return data?.messages||[];
}

async function askClubBattingGuide(question){
  const q=String(question||'').trim();
  if(!q||guideChatBusy)return null;
  guideChatBusy=true;
  try{
    const {data,error}=await supabase.functions.invoke('club-batting-guide',{body:{action:'ask',club_id:club.id,question:q,capability_key:guideSelectedCapabilityKey}});
    if(error||data?.error)throw new Error(await edgeFunctionErrorMessage(error,data,'The Guide could not answer just now.'));
    return data;
  }finally{
    guideChatBusy=false;
  }
}

async function renderGuideInterventionInto(slot){
  if(!slot||!canUsePlayersWorkspace())return;
  const {data,error}=await supabase.rpc('refresh_club_guide_interventions',{p_club_id:club.id});
  if(error||!Array.isArray(data)||!data.length){slot.innerHTML='';return;}
  const item=data[0];
  slot.innerHTML=`<section class="guide-intervention-card">
    <div><div class="section-label">Club Batting Guide</div><strong>${esc(item.title)}</strong><p>${esc(item.message)}</p></div>
    <div class="guide-intervention-actions"><button class="btn secondary compact-btn" data-guide-review>Review this →</button><button class="btn ghost compact-btn" data-guide-snooze>Not now</button><button class="btn ghost compact-btn" data-guide-dismiss>Not relevant</button></div>
  </section>`;
  await supabase.rpc('set_guide_intervention_state',{p_intervention_id:item.id,p_action:'shown'});
  slot.querySelector('[data-guide-review]').onclick=()=>openClubBattingGuideTopic(item.capability_key||'whole_process');
  slot.querySelector('[data-guide-snooze]').onclick=async()=>{await supabase.rpc('set_guide_intervention_state',{p_intervention_id:item.id,p_action:'snoozed'});slot.innerHTML='';};
  slot.querySelector('[data-guide-dismiss]').onclick=async()=>{await supabase.rpc('set_guide_intervention_state',{p_intervention_id:item.id,p_action:'dismissed'});slot.innerHTML='';};
}

async function renderClubBattingGuide({revealTutorial=false}={}){
  const page=document.getElementById('page');
  page.innerHTML='<div class="splash">Loading Club Batting Guide…</div>';
  const role=guideAudienceKey();
  const [{data:capabilities,error:capErr},{data:progress,error:progErr},{data:snapshot,error:snapshotErr},messages]=await Promise.all([
    supabase.from('club_batting_guide_capabilities').select('*').eq('active',true).order('sort_order'),
    supabase.from('club_batting_guide_progress').select('*').eq('club_id',club.id).eq('user_id',session.user.id),
    supabase.rpc('get_club_guide_snapshot',{p_club_id:club.id}),
    loadClubGuideHistory()
  ]);
  if(capErr||progErr){page.innerHTML=`<section class="card"><div class="notice">${esc((capErr||progErr).message)}</div></section>`;return;}

  const topicOrder=key=>{const index=GUIDE_TOPIC_ORDER.indexOf(key);return index<0?GUIDE_TOPIC_ORDER.length:index;};
  const all=(capabilities||[]).map(guideCapabilityForCurrentProduct).filter(c=>!c.audience?.length||c.audience.includes(role)||c.capability_key==='whole_process'||(isPhilosophyLead()&&['philosophy_workshop','how_we_bat','player_plan_structure'].includes(c.capability_key))).sort((a,b)=>topicOrder(a.capability_key)-topicOrder(b.capability_key));
  if(!all.length){page.innerHTML='<section class="card"><h2>Club Batting Guide</h2><p class="help">No Guide topics are available for this role yet.</p></section>';return;}
  if(!all.some(c=>c.capability_key===guideSelectedCapabilityKey))guideSelectedCapabilityKey='whole_process';
  const selected=all.find(c=>c.capability_key===guideSelectedCapabilityKey)||all[0];
  const isOverview=selected.capability_key==='whole_process';
  const selectedFocus=selected.capability_key==='plan_dates'?'plan_dates':selected.capability_key==='coach_conversations'&&selected.target_tab==='players'?'coach_conversations':'';
  const tutorial=Array.isArray(selected.tutorial)?selected.tutorial:[];
  const progressMap=new Map((progress||[]).map(x=>[x.capability_key,x]));
  const trial=snapshot?.trial||null;
  const daysLeft=trial?.ends_on?Math.ceil((new Date(`${trial.ends_on}T23:59:59`).getTime()-Date.now())/86400000):null;

  await supabase.rpc('set_guide_progress',{p_club_id:club.id,p_capability_key:selected.capability_key,p_action:'seen'});

  page.innerHTML=`${guideHelpStyles()}<section class="card guide-hero">
    <div><div class="section-label">Help & tutorials</div><h1>How Club Batting works</h1><p>Follow your club’s process below. Choose a guide to see how each stage works.</p></div>
  </section>
  ${trial?`<section class="guide-trial-strip"><strong>${esc(clubTrialStatusLabel(trial,daysLeft))}</strong><span>${esc(niceDate(trial.starts_on))} – ${esc(niceDate(trial.ends_on))} · Nothing is automatically charged.</span></section>`:''}
  <div id="guideInterventionSlot"></div>
    <section class="card guide-chat-card">
      <div class="section-label">Ask the Club Batting Guide</div><h2>A question? Ask it here.</h2><p>Get help with your next step, a feature or the whole process. The Guide replies here as you work.</p>
      <div id="guideChatMessages" class="guide-chat-messages${guideVisibleMessages(messages).length?'':' is-empty'}">${guideMessagesHtml(messages)}</div>
      <div class="guide-chat-compose"><textarea id="guideQuestion" aria-label="Your question for the Club Batting Guide" rows="3" placeholder="e.g. How should we use Player Plan dates with our grades?"></textarea><button class="btn secondary" id="guideAsk">Ask Guide</button></div>
      <div id="guideChatStatus" class="guide-chat-feedback" role="status" aria-live="polite"></div>
      <div class="guide-human-handoff"><button class="btn ghost" id="guideHumanHandoff" type="button">I’d rather speak to someone</button><p class="help">Request a conversation with the Club Batting team. Your question and Guide conversation go with it.</p><div id="guideHandoffBox" hidden><label for="guideHandoffReason">What would you like to discuss?</label><textarea id="guideHandoffReason" rows="2" placeholder="What would you like to discuss?"></textarea><div class="btnrow"><button class="btn ghost" id="guideSendHandoff">Request a conversation</button><button class="btn ghost" id="guideCancelHandoff">Cancel</button></div></div></div>
    </section>
  <h2 class="guide-process-heading" id="guideProcessHeading">Help & Tutorials · Explore the process</h2>
  <div class="guide-layout${isOverview?' guide-is-overview':''}">
    <nav class="guide-topic-list" aria-label="Help topics in process order">
      ${all.map(c=>{const number=guideTopicNumber(c.capability_key),active=c.capability_key===selected.capability_key;return `<button type="button" data-guide-topic="${esc(c.capability_key)}" aria-pressed="${active}" class="${active?'active ':''}${number===null?'guide-topic-overview':''}">${number===null?'':`<span class="guide-topic-number">${number}</span>`}<span class="guide-topic-copy"><strong>${c.capability_key==='whole_process'?'Overview · ':''}${esc(c.title)}</strong><span class="guide-topic-description">${esc(c.short_explanation)}</span>${c.capability_key!=='whole_process'&&progressMap.get(c.capability_key)?.state==='completed'?'<span class="guide-topic-complete">Tutorial read ✓</span>':''}</span></button>`;}).join('')}
    </nav>
    ${isOverview?'':`<section class="card guide-tutorial-card">
      <div class="section-label">${guideTopicNumber(selected.capability_key)===null?'':`Guide ${guideTopicNumber(selected.capability_key)} · `}${esc(selected.title)}</div>
      <h2>${esc(selected.purpose)}</h2>
      <p class="help guide-topic-explanation">${esc(selected.short_explanation)}</p>
      <div class="guide-steps">${tutorial.map((step,i)=>{const unavailable=step.target_tab?guideTargetUnavailableReason(step.target_tab,step.focus||''):'';return `<article><b>${i+1}</b><div><strong>${esc(step.title)}</strong><p>${esc(step.body)}</p>${step.target_tab?(unavailable?`<small class="help">${esc(unavailable)}</small>`:`<button class="guide-inline-link" data-guide-target="${esc(step.target_tab)}" data-guide-focus="${esc(step.focus||'')}">${esc(guideTargetLabel(step.target_tab))} →</button>`):''}</div></article>`;}).join('')}</div>
      <div class="btnrow"><button class="btn ghost" id="guideMarkComplete">Mark this tutorial complete</button>${selected.target_tab&&selected.target_tab!=='guide'&&!guideTargetUnavailableReason(selected.target_tab,selectedFocus)?`<button class="btn secondary" id="guideOpenArea">Open ${esc(guideTargetLabel(selected.target_tab))} →</button>`:''}<button type="button" class="btn ghost" data-guide-topic="whole_process">Back to overview</button></div>
      ${selected.target_tab&&selected.target_tab!=='guide'&&guideTargetUnavailableReason(selected.target_tab,selectedFocus)?`<p class="help">${esc(guideTargetUnavailableReason(selected.target_tab,selectedFocus))}</p>`:''}
    </section>`}

  </div>`;

  await renderGuideInterventionInto(document.getElementById('guideInterventionSlot'));
  document.querySelectorAll('[data-guide-topic]').forEach(b=>b.onclick=()=>{guideSelectedCapabilityKey=b.dataset.guideTopic;return renderClubBattingGuide({revealTutorial:true});});
  document.querySelectorAll('[data-guide-target]').forEach(b=>b.onclick=()=>guideGoToTarget(b.dataset.guideTarget,b.dataset.guideFocus||''));
  document.getElementById('guideOpenArea')?.addEventListener('click',()=>guideGoToTarget(selected.target_tab,selectedFocus));
  document.getElementById('guideMarkComplete')?.addEventListener('click',async()=>{await supabase.rpc('set_guide_progress',{p_club_id:club.id,p_capability_key:selected.capability_key,p_action:'completed'});return renderClubBattingGuide();});

  if(revealTutorial){
    requestAnimationFrame(()=>{
      const card=document.querySelector(isOverview?'.guide-topic-list':'.guide-tutorial-card');
      if(!card)return;
      const rect=card.getBoundingClientRect();
      const nav=document.querySelector('.nav');
      const navRect=nav?.getBoundingClientRect();
      const topOffset=navRect&&navRect.top<=1?navRect.height+14:14;
      const comfortablyVisible=rect.top>=topOffset&&rect.top<=Math.max(topOffset+220,window.innerHeight*.55);
      if(!comfortablyVisible){
        const targetTop=Math.max(0,window.scrollY+rect.top-topOffset);
        window.scrollTo({top:targetTop,left:0,behavior:'smooth'});
      }
    });
  }

  const submitQuestion=async()=>{
    const input=document.getElementById('guideQuestion');
    const st=document.getElementById('guideChatStatus');
    const q=input.value.trim();if(!q)return;
    const btn=document.getElementById('guideAsk');
    const messageBox=document.getElementById('guideChatMessages');
    btn.disabled=true;btn.textContent='Thinking…';st.textContent='';st.classList.remove('error','ok');
    messageBox.classList.remove('is-empty');
    if(messageBox.querySelector('.guide-chat-empty'))messageBox.innerHTML='';
    messageBox.insertAdjacentHTML('beforeend',`<div class="guide-chat-message user pending"><span>You</span><p>${esc(q)}</p></div>`);
    messageBox.scrollTop=messageBox.scrollHeight;
    try{
      const result=await askClubBattingGuide(q);input.value='';
      const history=result?.messages||await loadClubGuideHistory();
      setGuideMessages(messageBox,history);
    }catch(e){
      messageBox.querySelector('.pending:last-of-type')?.classList.remove('pending');
      st.textContent=e?.message||'The Guide could not answer just now.';
      st.classList.add('error');
    }finally{
      btn.disabled=false;btn.textContent='Ask Guide';
    }
  };
  document.getElementById('guideAsk').onclick=submitQuestion;
  document.getElementById('guideQuestion').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();submitQuestion();}});
  document.getElementById('guideHumanHandoff').onclick=()=>{document.getElementById('guideHandoffBox').hidden=false;document.getElementById('guideHumanHandoff').hidden=true;};
  document.getElementById('guideCancelHandoff').onclick=()=>{document.getElementById('guideHandoffBox').hidden=true;document.getElementById('guideHumanHandoff').hidden=false;};
  document.getElementById('guideSendHandoff').onclick=async()=>{
    const reason=val('guideHandoffReason');
    if(!reason){document.getElementById('guideHandoffReason').focus();return;}
    const button=document.getElementById('guideSendHandoff');button.disabled=true;
    const {error}=await supabase.rpc('request_club_batting_guide_handoff',{p_club_id:club.id,p_reason:reason});
    if(error){button.disabled=false;document.getElementById('guideChatStatus').textContent=error.message;return;}
    document.getElementById('guideHandoffBox').innerHTML='<div class="notice success compact"><strong>Request recorded for the Club Batting team.</strong><br>Your question and conversation are available to Platform Admin.</div>';
  };
}

/* Club Home: one next step, with the full setup available on demand. */
async function renderClubDashboard(){
  const page=document.getElementById('page');
  const targetClubId=club.id;
  page.innerHTML='<div class="splash">Loading Club Home…</div>';
  const [{data:entitlement},{data:players},{data:trial}]=await Promise.all([
    isAdmin()?supabase.rpc('get_club_entitlement',{p_club_id:targetClubId}):Promise.resolve({data:null}),
    canUsePlayersWorkspace()?supabase.from('players').select('id,active').eq('club_id',targetClubId).eq('active',true):Promise.resolve({data:[]}),
    isAdmin()?supabase.rpc('get_club_trial',{p_club_id:targetClubId}):Promise.resolve({data:null})
  ]);
  if(club.id!==targetClubId||currentTab!=='dashboard')return;
  const progress=clubSetupProgress();
  const step=progress.steps[progress.currentIndex]||null;
  const showRoundReview=(isAdmin()||isPhilosophyLead())&&!!(workshop||howWeBatDraft||playerPlanStructureDraft||progress.systemLive);
  const canReviewLook=isAdmin()&&(progress.structureReady||progress.systemLive);
  const showBranding=false;
  if(clubHomeStageClubId!==club.id){clubHomeExpandedStage=null;clubHomeStageClubId=club.id;clubHomeNextPreparationKey=null;}
  if(!progress.published&&(!clubHomeExpandedStage||clubHomeNextPreparationKey!==step?.key))clubHomeExpandedStage=step?.key||null;
  clubHomeNextPreparationKey=step?.key||null;
  const contributorWaiting=step?.key==='workshop'&&canContributePhilosophy()&&!isPhilosophyLead()&&!isAdmin()&&myContributor?.status==='submitted';
  const canAct=!!step&&canActOnClubSetupStep(step)&&!contributorWaiting;
  const registeredPlayerCount=(players||[]).length;
  const entitlementActive=entitlement?.active!==false;
  const trialDaysLeft=trial?.ends_on?Math.max(0,Math.ceil((new Date(`${trial.ends_on}T23:59:59`).getTime()-Date.now())/86400000)):null;
  const liveAction=canUsePlayersWorkspace()?{tab:'players',label:'Open Players'}:isPlayerUser()?{tab:'myplan',label:'Complete your Player Plan'}:{tab:'howwebat',label:'Read How We Bat'};
  const nextLabel=step?.key==='workshop'&&!workshop?.philosophy_lead_user_id&&isAdmin()?'Choose a Philosophy Lead':step?.action;
  const waitingCopy=contributorWaiting
    ?'Your contribution is submitted. Your Philosophy Lead will review the contributions and choose the club’s approach. You can come back here to check progress.'
    :step?.key==='details'
      ?'Your Club Admin needs to check the club look before publication. They can add the logo and colours or keep the current look.'
      :step?.key==='workshop'
        ?(!workshop?.philosophy_lead_user_id?'Your Club Admin needs to choose a Philosophy Lead before the club’s approach can be developed. You can check progress here.':'Your Philosophy Lead and invited contributors are preparing the club’s approach. This page will show the next stage when it is ready.')
        :'Your Philosophy Lead needs to complete this step. You can check progress here; players will receive an email when the system is published.';

  page.innerHTML=`${clubSetupStyles()}
    <div class="section-label">Club Home</div>
    <h1 class="club-progress-title">Your club’s progress</h1>
    <p class="club-home-intro">Build your club’s approach, bring players on board and keep connecting their plans, training and feedback.</p>
    ${progress.systemLive&&!progress.published?'<div class="notice compact club-home-round-note">You are preparing a new philosophy round. Existing players can keep using the published How We Bat and Player Plans. People can still register and use the published version while you prepare its replacement.</div>':''}
    <section class="club-preparation" aria-labelledby="clubPreparationTitle">
      <div class="club-preparation-heading"><div><h2 id="clubPreparationTitle">Before players build their plans</h2><p>These five steps prepare the club’s approach and Player Plan questions. People can sign up at any time, and the Club Admin can assign setup roles. After publication, players build their plans, put them into practice through How We Train, and keep learning through feedback and conversations.</p></div><span class="club-preparation-count">${progress.published?'Ready for Player Plans':`${progress.steps.filter(item=>item.complete).length} of 5 preparation steps complete`}</span></div>
      ${clubSetupProgressHtml(progress)}
      <section class="club-stage-panel" id="clubHomeStagePanel" hidden>
        <div class="club-stage-heading" id="clubHomeStageHeading"></div>
        <div class="club-stage-content" id="clubHomePhaseContent"></div>
    ${canReviewLook?`<section class="card club-branding-card" style="margin-top:16px" ${showBranding?'':'hidden'}>
      <div class="setup-collapsible-body">
        <h3>Club logo and colours</h3><p class="help setup-collapsible-intro">Your batting approach and Player Plan questions are ready. Personalise the look now, or keep the current look. You can change it after publication too.</p>
        <div class="btnrow"><button class="btn ghost" id="keepClubLook">${progress.detailsReady?'Keep the saved look':'Keep this look & continue'}</button></div>
        <div class="branding-steps"><span><b>1</b> Add logo</span><span><b>2</b> Find website colours</span><span><b>3</b> Use a suggestion or choose manually</span></div>

      <div class="club-branding-grid">
        <div class="club-branding-logo-column">
          <label class="branding-mini-label">Club logo</label>
          <div id="clubLogoPasteZone" class="club-logo-paste-zone" tabindex="0">
            <div id="clubLogoPreview" class="club-logo-preview"></div>
            <div class="club-logo-paste-copy"><strong>Paste a snip here</strong><span>Ctrl+V after using Snipping Tool, or drag an image onto this box.</span></div>
          </div>
          <input id="clubLogoFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <div class="btnrow compact branding-logo-actions">
            <button class="btn ghost" id="chooseClubLogo">Choose image</button>
            <button class="btn ghost" id="removeClubLogo">Remove logo</button>
          </div>
          <div id="clubLogoStatus" class="help branding-inline-status"></div>
          <div id="logoColourSuggestions" class="branding-source-panel"></div>
        </div>

        <div>
          <div class="field branding-website-field">
            <label>Club website</label>
            <div class="branding-url-row"><input id="clubWebsiteUrl" placeholder="https://yourclub.com.au"><button class="btn secondary" id="detectClubColours">Find club colours</button></div>
            <div class="help">This finds a suggested website theme. It will <strong>not</strong> replace your current colours until you choose to use it.</div>
          </div>
          <div id="brandingDetectionStatus" class="branding-detection-status"></div>
          <div id="websiteColourSuggestion" class="branding-source-panel"></div>

          <div class="branding-colour-heading">
            <div><span class="branding-mini-label">Manual colour override</span><p>Ignore either suggestion and choose any colours you want. Primary is the dominant club colour; Accent is used for highlights. Use the colour squares or type a HEX value.</p></div>
            <button class="btn ghost compact-btn" id="swapBrandColours" type="button">Swap primary ↔ accent</button>
          </div>
          <div class="branding-colour-grid branding-manual-grid">
            <div class="branding-manual-colour">
              <span class="branding-manual-title">Primary colour</span>
              <button type="button" class="btn ghost branding-pick-colour" id="choosePrimaryColour"><i id="primaryManualSwatch"></i><span>Choose any primary colour</span></button>
              <input type="color" id="clubPrimaryPicker" title="Choose primary colour" hidden>
              <div class="branding-hex-row"><input id="clubPrimaryHex" maxlength="7" aria-label="Primary colour HEX"><button type="button" class="btn ghost compact-btn" id="applyPrimaryHex">Use HEX</button></div>
            </div>
            <div class="branding-manual-colour">
              <span class="branding-manual-title">Accent colour</span>
              <button type="button" class="btn ghost branding-pick-colour" id="chooseAccentColour"><i id="accentManualSwatch"></i><span>Choose any accent colour</span></button>
              <input type="color" id="clubAccentPicker" title="Choose accent colour" hidden>
              <div class="branding-hex-row"><input id="clubAccentHex" maxlength="7" aria-label="Accent colour HEX"><button type="button" class="btn ghost compact-btn" id="applyAccentHex">Use HEX</button></div>
            </div>
          </div>
          <div class="branding-manual-actions"><button class="btn ghost branding-reset-colours" id="resetBrandColours">Reset colours to platform default</button></div>
        </div>
      </div>

      <div id="clubBrandPreview" class="club-brand-preview"></div>
      <div class="btnrow branding-save-row"><button class="btn secondary" id="saveClubBranding">${progress.detailsReady?'Save club look':'Save club look & continue'}</button><span id="clubBrandingSaveStatus" class="status" role="status" aria-live="polite"></span></div>
      </div>
    </section>`:''}

      </section>
    </section>
    <section class="card club-home-next" aria-labelledby="clubHomeNextTitle">
      <div class="section-label">${progress.systemLive?'Next · Put the plans into practice':'Available now · People & roles'}</div>
      <h2 id="clubHomeNextTitle">${progress.systemLive?'Get your players using their plans':'Bring your people on board'}</h2>
      <p>${progress.systemLive?'Invite anyone who has not registered, organise your Playing Groups and set plan due dates. Registered players can now build their Player Plans, use How We Train and keep learning through feedback.':'People can register now. Everyone who plays joins as a Player; non-playing staff use the staff sign-up link. The Club Admin assigns club roles in People & Sign-up, then chooses the Philosophy Lead and contributors in the Workshop.'}</p>
      ${progress.systemLive?'':'<div class="notice compact">Players without a setup role will see a clear waiting message until the club publishes. People with assigned workshop or setup access can begin their part now.</div>'}
      <div class="btnrow" style="margin-top:14px">${isAdmin()?'<button class="btn secondary" type="button" data-home-go="permissions">People & Sign-up</button>':''}${canUsePlayersWorkspace()?`<button class="btn ${isAdmin()?'ghost':'secondary'}" type="button" data-home-go="players">Open Players</button>`:progress.systemLive?`<button class="btn secondary" type="button" data-home-go="${liveAction.tab}">${liveAction.label}</button>`:''}</div>
      ${canUsePlayersWorkspace()?`<div class="club-home-owner">${registeredPlayerCount} registered player${registeredPlayerCount===1?'':'s'}${club.player_signup_open===false?' · Player sign-up is manually closed. Your Club Admin can reopen it in People & Sign-up.':' · Sign-up is open during club preparation too.'}</div>`:''}
    </section>
    ${showRoundReview?`<details class="card setup-collapsible club-round-review" style="margin-top:22px">
      <summary class="setup-collapsible-summary"><div class="setup-collapsible-title"><strong>Start a new club setup</strong></div><span class="setup-collapsible-toggle"></span></summary>
      <div class="setup-collapsible-body">
        <p>Revisit your club’s approach whenever you need to—for a new season, a change of leadership or a different direction. View the workshop, or deliberately start a new philosophy round.</p>
        <p class="help">Starting a new round archives the current workshop responses and clears the working drafts. Any published How We Bat and Player Plans stay available while you build a replacement. Your club details, players and Playing Groups do not need to be set up again.</p>
        <div class="btnrow">
          <button class="btn ghost" type="button" data-home-go="workshop">View Batting Philosophy Workshop</button>
          <button class="btn ghost" type="button" id="startNewPhilosophyRound">Start a new philosophy round</button>
        </div>
        <p class="help">Club Admin or Philosophy Lead · You’ll confirm before anything is reset.</p>
      </div>
    </details>`:''}

    ${isAdmin()?`<details class="card setup-collapsible setup-commercial" style="margin-top:22px">
      <summary class="setup-collapsible-summary"><div class="setup-collapsible-title"><strong>${trial?esc(clubTrialStatusLabel(trial,trialDaysLeft)):'Club access'}</strong></div><span class="setup-collapsible-toggle"></span></summary>
      <div class="setup-collapsible-body">
        ${trial?`<p>${esc(niceDate(trial.starts_on))} – ${esc(niceDate(trial.ends_on))}. Paid continuation is your club’s choice. Nothing is automatically charged.</p>${trial.status==='active'?'<div class="btnrow"><button class="btn ghost compact-btn" id="continueClubTrial">Review continuation options</button><button class="btn ghost compact-btn" id="endClubTrial">End after trial</button></div>':''}`
          :`<div class="help">${entitlement?entitlementActive?'Your club’s access is active.':'Your club’s access needs attention. Contact Club Batting for help.':'Access details are unavailable right now.'}</div>`}
      </div>
    </details>`:''}
    <section class="club-help-feature" aria-labelledby="clubHelpTitle">
      <div><div class="section-label">Help at every step</div><h2 id="clubHelpTitle">Your tutorials. Your Guide.</h2><p>See how each stage works, or ask a question about your next step.</p></div>
      <div class="btnrow"><button class="btn secondary" type="button" id="dashboardLearnClubBatting">Explore tutorials</button><button class="btn ghost" type="button" id="dashboardAskGuide">Ask the Guide</button></div>
    </section>`;

  document.getElementById('continueClubTrial')?.addEventListener('click',()=>openClubTrialContinuationDialog(trial));
  document.getElementById('startNewPhilosophyRound')?.addEventListener('click',startNewPhilosophyRound);
  document.getElementById('endClubTrial')?.addEventListener('click',async()=>{
    if(!confirm('End Club Batting when this Club Trial finishes? No payment will be taken.'))return;
    const {error}=await supabase.rpc('set_club_trial_decision',{p_club_id:club.id,p_decision:'end'});
    if(error){alert(error.message);return;}await renderClubDashboard();
  });
  if(canReviewLook)wireClubBrandingControls(page);
  page.querySelectorAll('[data-club-stage]').forEach(button=>button.onclick=()=>expandClubHomeStage(clubHomeExpandedStage===button.dataset.clubStage?null:button.dataset.clubStage,progress));
  await expandClubHomeStage(clubHomeExpandedStage,progress);
  document.getElementById('dashboardLearnClubBatting')?.addEventListener('click',()=>openClubBattingGuideTopic('whole_process'));
  document.getElementById('dashboardAskGuide')?.addEventListener('click',()=>openClubBattingGuideTopic('whole_process',{focus:'chat'}));
  page.querySelectorAll('[data-home-go]').forEach(b=>b.onclick=async()=>{
    const tab=b.dataset.homeGo;
    if(!canOpenClubTab(tab)||!await saveClubEditsBeforeNavigation())return;
    if(tab==='players')playersWorkspaceSelectedId=null;
    currentTab=tab;
    localStorage.setItem(`bdp-tab-${club.id}`,currentTab);
    renderTab();
  });
  page.querySelectorAll('[data-open-branding]').forEach(b=>b.addEventListener('click',()=>{
    const liveProgress=clubSetupProgress();
    if(!isAdmin()||!(liveProgress.structureReady||liveProgress.systemLive))return;
    const card=page.querySelector('.club-branding-card');
    if(card){card.hidden=false;requestAnimationFrame(()=>card.scrollIntoView({behavior:'smooth',block:'start'}));}
  }));
}

function clubTrialStatusLabel(trial,daysLeft){
  if(trial.status==='offered')return 'Club Trial · ready to activate';
  if(trial.status==='conversion_requested')return 'Club Trial · continuation requested';
  if(trial.status==='converted')return 'Club Trial · continued';
  if(trial.status==='ended')return 'Club Trial · ended';
  if(trial.status==='declined')return 'Club Trial · ending after the trial';
  const days=Math.max(0,Number(daysLeft)||0);
  return `Club Trial · ${days} day${days===1?'':'s'} remaining`;
}

function openClubTrialContinuationDialog(trial){
  if(!isAdmin()||trial?.status!=='active')return;
  document.getElementById('clubTrialContinuationDialog')?.remove();
  const targetClubId=club.id;
  const annualCents=Number(trial.annual_price_cents);
  const priceAvailable=trial.annual_price_cents!=null&&Number.isFinite(annualCents)&&annualCents>=0;
  const currency=trial.currency||'AUD';
  const dialog=document.createElement('dialog');
  dialog.id='clubTrialContinuationDialog';
  dialog.setAttribute('aria-labelledby','trialContinuationTitle');
  dialog.setAttribute('aria-describedby','trialContinuationExplanation');
  dialog.style.cssText='max-width:620px;width:calc(100% - 32px);border:0;border-radius:16px;padding:0;box-shadow:0 20px 60px rgba(20,32,80,.25)';
  dialog.innerHTML=`<div style="padding:24px">
    <div class="section-label">After your trial</div>
    <h2 id="trialContinuationTitle">Continue Club Batting at ${esc(club.name)}</h2>
    <p>Your trial runs through <strong>${esc(niceDate(trial.ends_on))}</strong>.</p>
    ${priceAvailable?`<p><strong>${esc(currency)} ${esc(money(annualCents,currency))} per year</strong> for your club’s paid continuation.</p>`:'<p class="notice">Your club’s continuation price is not available. Please ask Club Batting to confirm it before making a decision.</p>'}
    <p id="trialContinuationExplanation">Requesting paid continuation records your club’s interest in continuing at this price. Payment will be arranged separately; this button does not take payment or automatically charge your club. You can also choose End after trial from the club home screen.</p>
    <div class="btnrow"><button class="btn secondary" id="confirmTrialContinuation" ${priceAvailable?'':'disabled'}>Request paid continuation</button><button class="btn ghost" id="cancelTrialContinuation" autofocus>Cancel</button></div>
    <div id="trialContinuationStatus" class="help" role="status" aria-live="polite"></div>
  </div>`;
  document.body.appendChild(dialog);
  const button=dialog.querySelector('#confirmTrialContinuation');
  const cancel=dialog.querySelector('#cancelTrialContinuation');
  let saving=false;
  cancel.onclick=()=>dialog.close();
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  button.onclick=async()=>{
    if(saving||!priceAvailable)return;
    saving=true;button.disabled=true;cancel.disabled=true;
    const status=dialog.querySelector('#trialContinuationStatus');
    status.textContent='Recording your request…';
    try{
      const {error}=await supabase.rpc('set_club_trial_decision',{p_club_id:targetClubId,p_decision:'continue'});
      if(error)throw error;
    }catch(error){
      status.textContent=error?.message||'Your request could not be recorded. Please try again.';
      saving=false;button.disabled=false;cancel.disabled=false;return;
    }
    dialog.close();
    try{await renderClubDashboard();}catch(error){alert('Your continuation request was recorded. The club screen could not refresh; please reload it.');}
  };
  dialog.showModal();
}

function wireClubBrandingControls(page){
  const draft=ensureBrandingDraft();
  const zone=page.querySelector('#clubLogoPasteZone');
  const fileInput=page.querySelector('#clubLogoFile');
  const logoStatus=page.querySelector('#clubLogoStatus');
  const detectStatus=page.querySelector('#brandingDetectionStatus');
  const saveStatus=page.querySelector('#clubBrandingSaveStatus');

  const setStatus=(el,text,kind='')=>{if(!el)return;el.textContent=text||'';el.className=(el.id==='brandingDetectionStatus'?'branding-detection-status':'help branding-inline-status')+(kind?` ${kind}`:'');};

  const draw=()=>{
    const d=ensureBrandingDraft();
    const logo=page.querySelector('#clubLogoPreview');
    if(logo)logo.innerHTML=d.logo_data_url?`<img src="${esc(d.logo_data_url)}" alt="Club logo preview">`:'<div class="club-logo-empty">LOGO</div>';
    const remove=page.querySelector('#removeClubLogo'); if(remove)remove.disabled=!d.logo_data_url;
    const website=page.querySelector('#clubWebsiteUrl'); if(website && document.activeElement!==website)website.value=d.website_url||'';
    const pp=page.querySelector('#clubPrimaryPicker'),ph=page.querySelector('#clubPrimaryHex'),ap=page.querySelector('#clubAccentPicker'),ah=page.querySelector('#clubAccentHex');
    if(pp)pp.value=normaliseHex(d.primary_colour,PLATFORM_PRIMARY).toLowerCase();
    if(ph && document.activeElement!==ph)ph.value=normaliseHex(d.primary_colour,PLATFORM_PRIMARY);
    if(ap)ap.value=normaliseHex(d.accent_colour,PLATFORM_ACCENT).toLowerCase();
    if(ah && document.activeElement!==ah)ah.value=normaliseHex(d.accent_colour,PLATFORM_ACCENT);
    const primaryManualSwatch=page.querySelector('#primaryManualSwatch');
    const accentManualSwatch=page.querySelector('#accentManualSwatch');
    if(primaryManualSwatch)primaryManualSwatch.style.background=normaliseHex(d.primary_colour,PLATFORM_PRIMARY);
    if(accentManualSwatch)accentManualSwatch.style.background=normaliseHex(d.accent_colour,PLATFORM_ACCENT);

    const renderAssignableSwatches=colours=>colours.slice(0,6).map(c=>`<div class="branding-palette-choice" style="--swatch:${c}"><i></i><b>${c}</b><button type="button" data-set-primary="${c}">Primary</button><button type="button" data-set-accent="${c}">Accent</button></div>`).join('');

    const logoPanel=page.querySelector('#logoColourSuggestions');
    if(logoPanel){
      if(clubBrandingLogoSuggestions.length){
        const ls=logoBrandSuggestion(clubBrandingLogoSuggestions);
        logoPanel.innerHTML=`<div class="branding-source-title"><strong>Logo suggestion</strong><span>Suggested from the colours found in your logo. Nothing changes until you choose it.</span></div>${ls?`<div class="branding-theme-pair"><div style="--swatch:${ls.primary}"><i></i><span>Primary</span><b>${ls.primary}</b></div><div style="--swatch:${ls.accent}"><i></i><span>Accent</span><b>${ls.accent}</b></div><button type="button" class="btn ghost" id="useLogoBrandTheme">Use logo suggestion</button></div>`:''}<div class="branding-palette-list">${renderAssignableSwatches(clubBrandingLogoSuggestions)}</div>`;
      }else{
        logoPanel.innerHTML=d.logo_data_url
          ?`<div class="branding-source-title"><strong>Logo suggestion</strong><span>${clubBrandingLogoPaletteLoading?'Reading colours from the saved logo…':'Logo colours are being prepared. Your current theme has not changed.'}</span></div>`
          :`<div class="branding-source-title"><strong>No logo added</strong><span>That is fine — use the website suggestion or choose Primary and Accent colours manually.</span></div>`;
      }
    }

    const websitePanel=page.querySelector('#websiteColourSuggestion');
    if(websitePanel){
      if(clubBrandingWebsiteSuggestion){
        const ws=clubBrandingWebsiteSuggestion;
        websitePanel.innerHTML=`<div class="branding-source-title"><strong>Website suggestion</strong><span>${esc(ws.host||'Club website')} recommends this starting combination.</span></div><div class="branding-theme-pair"><div style="--swatch:${ws.primary}"><i></i><span>Primary</span><b>${ws.primary}</b></div><div style="--swatch:${ws.accent}"><i></i><span>Accent</span><b>${ws.accent}</b></div><button type="button" class="btn ghost" id="useWebsiteBrandTheme">Use website suggestion</button></div>${ws.candidates?.length?`<div class="branding-palette-list">${renderAssignableSwatches(ws.candidates)}</div>`:''}`;
      }else websitePanel.innerHTML='';
    }

    page.querySelectorAll('[data-set-primary]').forEach(b=>b.onclick=()=>{d.primary_colour=b.dataset.setPrimary;draw();});
    page.querySelectorAll('[data-set-accent]').forEach(b=>b.onclick=()=>{d.accent_colour=b.dataset.setAccent;draw();});
    page.querySelector('#useLogoBrandTheme')?.addEventListener('click',()=>{
      const ls=logoBrandSuggestion(clubBrandingLogoSuggestions);if(!ls)return;
      d.primary_colour=ls.primary;d.accent_colour=ls.accent;
      setStatus(logoStatus,'Logo suggestion applied to the preview. You can still swap the colours or override either one manually.','good');
      draw();
    });
    page.querySelector('#useWebsiteBrandTheme')?.addEventListener('click',()=>{
      const ws=clubBrandingWebsiteSuggestion;if(!ws)return;
      d.primary_colour=ws.primary;d.accent_colour=ws.accent;
      setStatus(detectStatus,'Website suggestion applied to the preview. Save branding when you are happy with it.','good');
      draw();
    });



    const preview=page.querySelector('#clubBrandPreview');
    if(preview){
      const primary=normaliseHex(d.primary_colour,PLATFORM_PRIMARY),accent=normaliseHex(d.accent_colour,PLATFORM_ACCENT);
      preview.style.setProperty('--preview-primary',primary);
      preview.style.setProperty('--preview-primary-dark',mixHex(primary,'#000000',.34));
      preview.style.setProperty('--preview-primary-contrast',contrastFor(primary));
      preview.style.setProperty('--preview-accent',accent);
      preview.style.setProperty('--preview-accent-contrast',contrastFor(accent));
      preview.innerHTML=`<div class="club-brand-preview-head">${d.logo_data_url?`<img src="${esc(d.logo_data_url)}" alt="">`:''}<div><span>${esc(club.name)}</span><strong>How We Bat</strong></div></div><div class="club-brand-preview-body"><span class="preview-brand-pill">Key Message</span><b>Player-facing preview</b><p>Your club colours and logo flow through the live system while the platform keeps the layout readable.</p><button type="button">Primary colour</button><em>Accent colour</em></div>`;
    }
  };

  const acceptLogo=async file=>{
    try{
      setStatus(logoStatus,'Reading image…');
      const result=await processClubLogoFile(file);
      draft.logo_data_url=result.dataUrl;
      clubBrandingLogoSuggestions=(result.palette||[]).filter(validHex).map(c=>c.toUpperCase());
      clubBrandingLogoPaletteSource=result.dataUrl;
      clubBrandingLogoPaletteLoading=false;
      if(clubBrandingLogoSuggestions.length){
        setStatus(logoStatus,'Logo ready. Use the logo suggestion, assign any detected colour as Primary or Accent, or choose colours manually. Your current theme has not changed.','good');
      }else setStatus(logoStatus,'Logo ready. Choose colours manually or analyse the club website.','good');
      draw();
    }catch(err){setStatus(logoStatus,err?.message||String(err),'bad');}
  };

  zone?.addEventListener('paste',e=>{
    const item=[...(e.clipboardData?.items||[])].find(x=>x.kind==='file'&&x.type.startsWith('image/'));
    if(!item){setStatus(logoStatus,'Clipboard does not contain an image. Copy a Snipping Tool capture, then paste here.','bad');return;}
    e.preventDefault();acceptLogo(item.getAsFile());
  });
  zone?.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragging');});
  zone?.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
  zone?.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');const file=[...(e.dataTransfer?.files||[])].find(f=>f.type.startsWith('image/'));if(file)acceptLogo(file);});
  zone?.addEventListener('click',()=>zone.focus());
  page.querySelector('#chooseClubLogo')?.addEventListener('click',()=>fileInput?.click());
  fileInput?.addEventListener('change',()=>{if(fileInput.files?.[0])acceptLogo(fileInput.files[0]);fileInput.value='';});
  page.querySelector('#removeClubLogo')?.addEventListener('click',()=>{draft.logo_data_url='';clubBrandingLogoSuggestions=[];clubBrandingLogoPaletteSource='';clubBrandingLogoPaletteLoading=false;setStatus(logoStatus,'Logo removed from this draft. Website and manual colour choices are still available. Save branding to apply.');draw();});

  const syncHex=(key,value)=>{
    const v=String(value||'').toUpperCase();
    if(validHex(v)){draft[key]=v;draw();}
  };
  page.querySelector('#choosePrimaryColour')?.addEventListener('click',()=>page.querySelector('#clubPrimaryPicker')?.click());
  page.querySelector('#chooseAccentColour')?.addEventListener('click',()=>page.querySelector('#clubAccentPicker')?.click());
  page.querySelector('#clubPrimaryPicker')?.addEventListener('input',e=>{syncHex('primary_colour',e.target.value);setStatus(detectStatus,'Manual primary colour applied to the preview. Save branding when you are happy with it.','good');});
  page.querySelector('#clubAccentPicker')?.addEventListener('input',e=>{syncHex('accent_colour',e.target.value);setStatus(detectStatus,'Manual accent colour applied to the preview. Save branding when you are happy with it.','good');});

  const applyManualHex=(key,inputId,label)=>{
    const input=page.querySelector(inputId);
    const value=String(input?.value||'').trim().toUpperCase();
    if(!validHex(value)){
      if(input)input.value=draft[key];
      setStatus(detectStatus,`${label} colour must look like #20347B.`,'bad');
      return;
    }
    syncHex(key,value);
    setStatus(detectStatus,`Manual ${label.toLowerCase()} colour applied to the preview. Save branding when you are happy with it.`,'good');
  };
  page.querySelector('#applyPrimaryHex')?.addEventListener('click',()=>applyManualHex('primary_colour','#clubPrimaryHex','Primary'));
  page.querySelector('#applyAccentHex')?.addEventListener('click',()=>applyManualHex('accent_colour','#clubAccentHex','Accent'));
  page.querySelector('#clubPrimaryHex')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyManualHex('primary_colour','#clubPrimaryHex','Primary');}});
  page.querySelector('#clubAccentHex')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyManualHex('accent_colour','#clubAccentHex','Accent');}});
  page.querySelector('#clubWebsiteUrl')?.addEventListener('input',e=>draft.website_url=e.target.value);

  page.querySelector('#swapBrandColours')?.addEventListener('click',()=>{
    const oldPrimary=draft.primary_colour;draft.primary_colour=draft.accent_colour;draft.accent_colour=oldPrimary;
    setStatus(detectStatus,'Primary and accent colours swapped in the preview. Save branding when you are happy with it.','good');
    draw();
  });

  page.querySelector('#resetBrandColours')?.addEventListener('click',()=>{
    draft.primary_colour=PLATFORM_PRIMARY;draft.accent_colour=PLATFORM_ACCENT;setStatus(detectStatus,'Platform colours restored in the preview. Save branding to apply.');draw();
  });

  page.querySelector('#detectClubColours')?.addEventListener('click',async()=>{
    const button=page.querySelector('#detectClubColours');
    const raw=page.querySelector('#clubWebsiteUrl')?.value||'';
    const url=normaliseWebsiteUrl(raw);
    if(!/^https?:\/\//i.test(url)){setStatus(detectStatus,'Enter a valid club website address.','bad');return;}
    draft.website_url=url;
    page.querySelector('#clubWebsiteUrl').value=url;
    button.disabled=true;button.textContent='Checking…';
    setStatus(detectStatus,'Looking for the website’s brand colours…');
    try{
      const {data,error}=await supabase.functions.invoke('detect-club-branding',{body:{club_id:club.id,url}});
      if(error)throw error;
      if(!data?.primary)throw new Error(data?.error||'No reliable colours were found.');
      const analysedHost=new URL(data.analysed_url||url).hostname;
      clubBrandingWebsiteSuggestion={
        primary:normaliseHex(data.primary,draft.primary_colour),
        accent:normaliseHex(data.accent,draft.accent_colour),
        candidates:(data.candidates||[]).filter(validHex).map(x=>x.toUpperCase()),
        host:analysedHost
      };
      setStatus(detectStatus,`Website colours found from ${analysedHost}. Use the website suggestion, assign any detected colour as Primary or Accent, or override the colours manually.`,'good');
      draw();
    }catch(err){
      setStatus(detectStatus,'Could not reliably read colours from that website. Your current theme has not changed. You can use colours detected from the logo or choose colours manually.','bad');
      console.warn('Brand website detection failed',err);
    }finally{button.disabled=false;button.textContent='Find club colours';}
  });

  let brandingSavePending=false;
  const saveLook=async keepSaved=>{
    const progress=clubSetupProgress();
    if(brandingSavePending||!isAdmin()||!(progress.structureReady||progress.systemLive))return;
    const targetClubId=club.id;
    const targetUserId=session?.user?.id;
    const saveButton=page.querySelector('#saveClubBranding');
    const button=page.querySelector(keepSaved?'#keepClubLook':'#saveClubBranding');
    const currentLook={
      logo_data_url:club.logo_data_url||'',website_url:club.website_url||'',
      primary_colour:normaliseHex(club.primary_colour,PLATFORM_PRIMARY),
      accent_colour:normaliseHex(club.accent_colour,PLATFORM_ACCENT)
    };
    draft.website_url=normaliseWebsiteUrl(page.querySelector('#clubWebsiteUrl')?.value||draft.website_url);
    if(keepSaved&&Object.keys(currentLook).some(key=>(draft[key]||'')!==(currentLook[key]||''))
      &&!confirm('Keep the saved club look and discard the appearance changes shown in this preview?'))return;
    const savedLook={...(keepSaved?currentLook:draft)};
    if(savedLook.website_url&&!/^https?:\/\//i.test(savedLook.website_url)){saveStatus.textContent='Check the website address.';return;}
    if(!validHex(savedLook.primary_colour)||!validHex(savedLook.accent_colour)){saveStatus.textContent='Check the two colour values.';return;}
    const controls=[...page.querySelectorAll('.club-branding-card button,.club-branding-card input')].map(el=>[el,el.disabled]);
    const oldLabel=button.textContent;
    brandingSavePending=true;
    controls.forEach(([el])=>el.disabled=true);
    button.textContent='Saving…';saveStatus.textContent='';
    const stillCurrent=()=>club?.id===targetClubId&&session?.user?.id===targetUserId&&document.getElementById('saveClubBranding')===saveButton;
    try{
      const {data,error}=await supabase.rpc('save_club_branding',{
        p_club_id:targetClubId,p_logo_data_url:savedLook.logo_data_url||null,
        p_website_url:savedLook.website_url||null,p_primary_colour:savedLook.primary_colour,p_accent_colour:savedLook.accent_colour
      });
      if(error)throw error;
      if(!stillCurrent())return;
      if(!data?.branding_updated_at)throw new Error('The save could not be confirmed. Refresh Club Home to check the saved look.');
      Object.assign(club,savedLook,data);
      if(membership?.clubs)Object.assign(membership.clubs,savedLook,data);
      clubBrandingDraft={...savedLook};clubBrandingDraftClubId=targetClubId;
      applyClubTheme();
      currentTab='dashboard';localStorage.setItem(`bdp-tab-${targetClubId}`,currentTab);
      saveStatus.textContent='Club look saved. Ready for the final publication step.';
      try{renderShell();}catch(error){saveStatus.textContent='Club look saved. Refresh Club Home to continue.';}
    }catch(error){
      if(stillCurrent())saveStatus.textContent=error?.message||'The club look could not be saved. Please try again.';
    }finally{
      brandingSavePending=false;
      controls.forEach(([el,disabled])=>el.disabled=disabled);
      button.textContent=oldLabel;
    }
  };
  page.querySelector('#saveClubBranding')?.addEventListener('click',()=>saveLook(false));
  page.querySelector('#keepClubLook')?.addEventListener('click',()=>saveLook(true));

  draw();

  // A saved logo should always offer the same explicit Logo suggestion as a newly added logo.
  // Rebuild its palette when Club Setup opens; never apply those colours automatically.
  if(draft.logo_data_url && clubBrandingLogoPaletteSource!==draft.logo_data_url && !clubBrandingLogoPaletteLoading){
    clubBrandingLogoPaletteLoading=true;
    draw();
    paletteFromLogoDataUrl(draft.logo_data_url)
      .then(palette=>{
        if(ensureBrandingDraft().logo_data_url!==draft.logo_data_url)return;
        clubBrandingLogoSuggestions=(palette||[]).filter(validHex).map(c=>c.toUpperCase());
        clubBrandingLogoPaletteSource=draft.logo_data_url;
        clubBrandingLogoPaletteLoading=false;
        setStatus(logoStatus,clubBrandingLogoSuggestions.length
          ?'Logo colours ready. Choose Use logo suggestion, assign individual colours, use the website suggestion, or choose colours manually.'
          :'Logo is saved, but no reliable colour pair was detected. Use the website suggestion or choose colours manually.',
          clubBrandingLogoSuggestions.length?'good':'');
        draw();
      })
      .catch(err=>{
        clubBrandingLogoPaletteSource=draft.logo_data_url;
        clubBrandingLogoPaletteLoading=false;
        setStatus(logoStatus,'Logo is saved, but its colours could not be read. Use the website suggestion or choose colours manually.','bad');
        console.warn('Saved logo palette detection failed',err);
        draw();
      });
  }
}


/* ---------------- PLAYING GROUPS ---------------- */

async function renderPlayingGroups(){
  const page=document.getElementById('page');
  page.innerHTML='<div class="splash">Loading Playing Groups…</div>';

  const [{data:groups,error:gErr},{data:players,error:pErr},{data:assignments,error:aErr}]=await Promise.all([
    supabase.from('playing_groups').select('*').eq('club_id',club.id).order('active',{ascending:false}).order('sort_order').order('name'),
    supabase.from('players').select('id,user_id,display_name,active').eq('club_id',club.id).eq('active',true).order('display_name'),
    supabase.from('player_playing_groups').select('*').eq('club_id',club.id)
  ]);

  if(gErr||pErr||aErr){
    page.innerHTML=`<div class="notice">${esc((gErr||pErr||aErr).message)}</div>`;
    return;
  }

  const activeGroups=(groups||[]).filter(g=>g.active);
  const inactiveGroups=(groups||[]).filter(g=>!g.active);
  const byPlayer=new Map();

  for(const a of assignments||[]){
    if(!byPlayer.has(a.player_id))byPlayer.set(a.player_id,[]);
    byPlayer.get(a.player_id).push(a.playing_group_id);
  }

  const groupMap=new Map((groups||[]).map(g=>[g.id,g]));
  const unassigned=(players||[]).filter(p=>(byPlayer.get(p.id)||[]).filter(id=>groupMap.get(id)?.active).length===0);

  const renderGroupRow=(g,i,list)=>`<div class="playing-group-row ${g.active?'':'inactive'}">
    <div class="playing-group-order">
      <button class="mini-icon-btn" data-move-group="${g.id}" data-direction="up" ${i===0?'disabled':''} title="Move up">↑</button>
      <button class="mini-icon-btn" data-move-group="${g.id}" data-direction="down" ${i===list.length-1?'disabled':''} title="Move down">↓</button>
    </div>
    <div class="playing-group-name">
      <input value="${esc(g.name)}" data-group-name="${g.id}" ${g.active?'':'disabled'}>
      <small>${g.active?'Stable coaching / eligibility group':'Inactive · historical assignments retained'}</small>
    </div>
    <div class="btnrow">
      ${g.active?`
        <button class="btn ghost" data-rename-group="${g.id}">Save name</button>
        <button class="btn ghost danger-lite" data-toggle-group="${g.id}" data-active="false">Deactivate</button>
      `:`<button class="btn ghost" data-toggle-group="${g.id}" data-active="true">Reactivate</button>`}
    </div>
  </div>`;

  page.innerHTML=`<div class="grid playing-groups-top">
    <section class="card">
      <div class="section-label">Players · Admin tool</div>
      <h2>Playing Groups</h2>
      <div class="help"><strong>Use the groups your club actually uses.</strong> This is roster administration and can be updated whenever players, grades or development groups change.</div>
      <div class="help">Playing Groups can be grades, junior sides, XI teams, development pools or competition eligibility groups. A player can belong to more than one.</div>
      <div class="btnrow compact" style="margin-top:10px"><button class="btn ghost" id="backToPlayersFromGroups">← Back to Players</button></div>

      <div class="notice" style="margin-top:14px">
        <strong>Playing Groups are not weekly team sheets.</strong><br>
        Use stable groups such as <em>U16</em>, <em>3rd Grade</em>, <em>Senior Lower Grades</em> or <em>Dennis Broad Cup — Eligible Pool</em>. Weekly selection can change without needing to update this system.
      </div>

      <div class="new-group-row">
        <input id="newPlayingGroupName" placeholder="e.g. U16, 3rd Grade, Sunday T20 Eligible Pool">
        <button class="btn secondary" id="addPlayingGroup">+ Add Playing Group</button>
      </div>
      <div id="playingGroupStatus" class="help"></div>

      <div class="playing-group-list">
        ${activeGroups.length
          ?activeGroups.map((g,i)=>renderGroupRow(g,i,activeGroups)).join('')
          :'<div class="notice compact">No Playing Groups yet. Add the groups your club needs — there is no predefined list.</div>'}
      </div>

      ${inactiveGroups.length?`<details class="inactive-groups">
        <summary>Inactive Playing Groups (${inactiveGroups.length})</summary>
        <div class="playing-group-list">${inactiveGroups.map((g,i)=>renderGroupRow(g,i,inactiveGroups)).join('')}</div>
      </details>`:''}
    </section>

    <section class="card">
      <div class="section-label">New players</div>
      <h2>Unassigned is a valid starting point.</h2>
      <div class="help">Players register themselves through the normal Player QR/link. They do <strong>not</strong> guess which grade they are in. The club assigns Playing Groups later, when it actually knows.</div>

      <div class="unassigned-summary">
        <strong>${unassigned.length}</strong>
        <span>active player${unassigned.length===1?'':'s'} currently unassigned</span>
      </div>

      ${unassigned.length&&activeGroups.length?`
        <div class="bulk-assignment-box">
          <div class="bulk-player-list">
            ${unassigned.map(p=>`<label><input type="checkbox" data-unassigned-player="${p.id}"><span>${esc(p.display_name)}</span></label>`).join('')}
          </div>
          <div class="bulk-assignment-actions">
            <select id="bulkPlayingGroup">
              <option value="">Choose Playing Group…</option>
              ${activeGroups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}
            </select>
            <button class="btn secondary" id="assignSelectedPlayers">Add selected players</button>
          </div>
          <div id="bulkAssignmentStatus" class="help"></div>
        </div>
      `:unassigned.length?'<div class="notice compact">Create at least one Playing Group before assigning players.</div>':'<div class="notice compact">Everyone currently belongs to at least one active Playing Group.</div>'}
    </section>
  </div>

  <section class="card" style="margin-top:16px">
    <div class="player-assignment-head">
      <div>
        <div class="section-label">Player assignments</div>
        <h2>One player can belong to several groups.</h2>
        <div class="help">Group membership controls rollout requirements, filtering and group-based coach/captain access. It never deletes or changes a player’s plan.</div>
      </div>
      <input id="groupPlayerSearch" class="player-search" placeholder="Search players…">
    </div>

    ${activeGroups.length?`<div class="group-bulk-tool">
      <div>
        <strong>Bulk add a pool of players</strong>
        <span>Useful for groups such as “Dennis Broad Cup — Eligible Pool”. Choose an existing group (or everyone/unassigned), then add that whole pool to another group.</span>
      </div>
      <select id="bulkSourceGroup">
        <option value="all">All active players</option>
        <option value="unassigned">Currently unassigned</option>
        ${activeGroups.map(g=>`<option value="${g.id}">Players in ${esc(g.name)}</option>`).join('')}
      </select>
      <span class="bulk-arrow">→</span>
      <select id="bulkTargetGroup">
        <option value="">Add to Playing Group…</option>
        ${activeGroups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}
      </select>
      <button class="btn ghost" id="bulkAddPool">Add pool</button>
      <span id="bulkPoolStatus" class="status"></span>
    </div>`:''}

    <div class="player-group-assignment-list">
      ${(players||[]).map(p=>{
        const assigned=(byPlayer.get(p.id)||[])
          .map(id=>groupMap.get(id))
          .filter(Boolean)
          .sort((a,b)=>(a.sort_order-b.sort_order)||a.name.localeCompare(b.name));
        const available=activeGroups.filter(g=>!assigned.some(a=>a.id===g.id));
        return `<div class="player-group-assignment-row" data-player-assignment-row data-player-name="${esc((p.display_name||'').toLowerCase())}">
          <div class="player-group-person">
            <strong>${esc(p.display_name)}</strong>
            <small>${assigned.filter(g=>g.active).length?'Assigned':'Unassigned'}</small>
          </div>
          <div class="player-group-chips">
            ${assigned.length?assigned.map(g=>`<span class="group-chip ${g.active?'':'inactive'}">
              ${esc(g.name)}
              ${g.active?`<button title="Remove from ${esc(g.name)}" data-remove-player-group="${p.id}" data-group-id="${g.id}">×</button>`:''}
            </span>`).join(''):'<span class="unassigned-chip">Unassigned</span>'}
          </div>
          <div class="player-group-add">
            <select data-add-group-player="${p.id}" ${!available.length?'disabled':''}>
              <option value="">${available.length?'Add to group…':'No more active groups'}</option>
              ${available.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}
            </select>
            <button class="btn ghost" data-add-player-group="${p.id}" ${!available.length?'disabled':''}>Add</button>
          </div>
        </div>`;
      }).join('')||'<div class="notice">No active players have registered yet.</div>'}
    </div>
  </section>
`;

  document.getElementById('backToPlayersFromGroups')?.addEventListener('click',()=>{currentTab='players';localStorage.setItem(`bdp-tab-${club.id}`,currentTab);renderTab();});

  document.getElementById('addPlayingGroup').onclick=async()=>{
    const name=val('newPlayingGroupName');
    const st=document.getElementById('playingGroupStatus');
    if(!name){st.textContent='Enter a group name first.';return;}
    st.textContent='Adding…';
    const {error}=await supabase.rpc('create_playing_group',{p_club_id:club.id,p_name:name});
    if(error){st.textContent=error.message;return;}
    await renderPlayingGroups();
  };

  document.querySelectorAll('[data-rename-group]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.renameGroup;
    const input=document.querySelector(`[data-group-name="${id}"]`);
    const {error}=await supabase.rpc('rename_playing_group',{p_group_id:id,p_name:input.value.trim()});
    if(error){alert(error.message);return;}
    await renderPlayingGroups();
  });

  document.querySelectorAll('[data-toggle-group]').forEach(b=>b.onclick=async()=>{
    const becomingActive=b.dataset.active==='true';
    if(!becomingActive){
      const ok=confirm('Deactivate this Playing Group? Existing player assignments are kept for history, but active Player Plan requirements for this group will be switched off.');
      if(!ok)return;
    }
    const {error}=await supabase.rpc('set_playing_group_active',{p_group_id:b.dataset.toggleGroup,p_active:becomingActive});
    if(error){alert(error.message);return;}
    await renderPlayingGroups();
  });

  document.querySelectorAll('[data-move-group]').forEach(b=>b.onclick=async()=>{
    const {error}=await supabase.rpc('move_playing_group',{
      p_group_id:b.dataset.moveGroup,
      p_direction:b.dataset.direction
    });
    if(error){alert(error.message);return;}
    await renderPlayingGroups();
  });

  if(document.getElementById('assignSelectedPlayers')){
    document.getElementById('assignSelectedPlayers').onclick=async()=>{
      const groupId=document.getElementById('bulkPlayingGroup').value;
      const ids=[...document.querySelectorAll('[data-unassigned-player]:checked')].map(x=>x.dataset.unassignedPlayer);
      const st=document.getElementById('bulkAssignmentStatus');
      if(!groupId){st.textContent='Choose a Playing Group.';return;}
      if(!ids.length){st.textContent='Select at least one player.';return;}
      st.textContent='Assigning…';
      const {error}=await supabase.rpc('assign_players_to_playing_group',{
        p_group_id:groupId,
        p_player_ids:ids
      });
      if(error){st.textContent=error.message;return;}
      await renderPlayingGroups();
    };
  }

  if(document.getElementById('bulkAddPool')){
    document.getElementById('bulkAddPool').onclick=async()=>{
      const source=document.getElementById('bulkSourceGroup').value;
      const target=document.getElementById('bulkTargetGroup').value;
      const st=document.getElementById('bulkPoolStatus');

      if(!target){st.textContent='Choose the group to add players to.';return;}
      if(source===target){st.textContent='Choose a different target group.';return;}

      let ids=[];
      if(source==='all'){
        ids=(players||[]).map(p=>p.id);
      }else if(source==='unassigned'){
        ids=unassigned.map(p=>p.id);
      }else{
        ids=(players||[])
          .filter(p=>(byPlayer.get(p.id)||[]).includes(source))
          .map(p=>p.id);
      }

      if(!ids.length){st.textContent='No players match that source group.';return;}

      st.textContent='Adding…';
      const {data:count,error}=await supabase.rpc('assign_players_to_playing_group',{
        p_group_id:target,
        p_player_ids:ids
      });

      if(error){st.textContent=error.message;return;}
      st.textContent=`${count||0} new assignment${Number(count)===1?'':'s'} added.`;
      await renderPlayingGroups();
    };
  }

  document.querySelectorAll('[data-add-player-group]').forEach(b=>b.onclick=async()=>{
    const playerId=b.dataset.addPlayerGroup;
    const groupId=document.querySelector(`[data-add-group-player="${playerId}"]`)?.value;
    if(!groupId)return;
    const {error}=await supabase.rpc('assign_players_to_playing_group',{
      p_group_id:groupId,
      p_player_ids:[playerId]
    });
    if(error){alert(error.message);return;}
    await renderPlayingGroups();
  });

  document.querySelectorAll('[data-remove-player-group]').forEach(b=>b.onclick=async()=>{
    const {error}=await supabase.rpc('remove_player_from_playing_group',{
      p_player_id:b.dataset.removePlayerGroup,
      p_group_id:b.dataset.groupId
    });
    if(error){alert(error.message);return;}
    await renderPlayingGroups();
  });


  document.getElementById('groupPlayerSearch').oninput=e=>{
    const q=e.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-player-assignment-row]').forEach(row=>{
      row.style.display=!q||row.dataset.playerName.includes(q)?'grid':'none';
    });
  };
}


/* ---------------- PHILOSOPHY WORKSHOP ---------------- */
/* v0.8.13: outcome-first Philosophy Scenario Explorer; detailed agreement data is secondary */

function workshopModeLabel(){
  return workshop?.mode==='collaborative'?'Collaborative':'Solo';
}

function contributorStatusLabel(status){
  return status==='submitted'?'Submitted':status==='in_progress'?'In progress':'Invited';
}

function buildWorkspaceAudienceNotice(){
  return `<div class="build-audience-notice">
    <div class="build-audience-icon">BUILD</div>
    <div><strong>This is a club-building workspace — ordinary players do not see it.</strong>
    <span>Your response helps the Philosophy Lead build the finished Club Batting System. Players see the published <strong>How We Bat</strong>, their own <strong>Player Plan</strong> and <strong>How We Train</strong>. Workshop access does not give access to player plans or coaching feedback unless you have been given that permission separately.</span></div>
  </div>`;
}

function workshopNextStep({me,setupSaved,leadName,outstandingNames,canCompare,loadError}){
  const lead=leadName||'your Philosophy Lead';
  const waiting=outstandingNames.length?`Still to submit: ${naturalList(outstandingNames)}.`:'';
  if(!setupSaved)return isAdmin()
    ?{title:'Choose who will shape your club’s approach.',body:'Select a Philosophy Lead and save the contributors for this round. Each person then answers independently.',action:'setup',label:'Choose contributors'}
    :{title:'Your workshop is being prepared.',body:'Your Club Admin needs to choose a Philosophy Lead and save the contributors before this round can begin.'};
  if(workshop?.status==='published')return {title:'Your club’s approach is in use.',body:'Players can use the published How We Bat, build their Player Plans and put them into practice. This round’s original responses remain available below.',action:'dashboard',label:'Return to Club Home'};
  if(isPhilosophyLead()&&(workshop?.final_draft_ready||howWeBatDraft))return howWeBatDraft?.status==='ready'
    ?{title:'How We Bat is confirmed.',body:'Return to Club Home for the next setup step. The original contributions and this round’s decisions are preserved below.',action:'dashboard',label:'Continue club setup'}
    :{title:'Review and confirm How We Bat.',body:'Your chosen contributions have become the club’s draft. Check the messages players will use, make any final edits and confirm the approach.',action:'howwebat',label:'Review How We Bat'};
  if(me&&me.status!=='submitted')return {
    title:me.status==='in_progress'?'Finish your independent response.':'Add your batting perspective.',
    body:me.status==='in_progress'?'Your saved answers are waiting. Continue through the remaining steps, then review and submit your response.':'Choose what matters to your club, explain where useful and set the emphasis for each format. Other responses stay hidden until you submit your own.',
    action:'response',label:me.status==='in_progress'?'Continue my response':'Start my response'
  };
  if(isPhilosophyLead()&&canCompare&&!loadError)return {title:'Choose the approach your club will use.',body:`Compare the submitted contributions and preview how they shape How We Bat. ${waiting||'The invited contributors have submitted their responses.'} You decide when to move forward with the responses available.`,action:'compare',label:'Compare contributions'};
  if(loadError)return {title:'The submitted contributions could not be loaded.',body:'Your saved responses are still recorded. Open the contribution details for the error and try again before choosing your club’s approach.',action:'status',label:'View contribution details'};
  return {title:`${lead} is bringing the club approach together.`,body:`${me?.status==='submitted'?'Your response is submitted and preserved. ':''}${waiting||'The next step is for the Philosophy Lead to compare the submitted responses and choose the approach used for How We Bat.'}`,action:me?.status==='submitted'?'response':'status',label:me?.status==='submitted'?'Review my response':'View contribution progress'};
}

let workshopRenderSequence=0;
async function renderWorkshop(){
  const page=clubSetupContentPage('workshop');
  const targetClubId=club.id;
  const targetTab=currentTab;
  const renderSequence=++workshopRenderSequence;
  const stillCurrent=()=>renderSequence===workshopRenderSequence&&club?.id===targetClubId&&currentTab===targetTab&&clubSetupContentPage('workshop')===page;
  page.innerHTML='<div class="splash">Loading Batting Philosophy Workshop…</div>';

  const [
    {data:contribRows,error:cErr},
    {data:externalInvites,error:iErr},
    {data:draftSnapshot,error:snapErr},
    {data:lateActions,error:lateErr},
    {data:workshopStatus,error:statusErr}
  ]=await Promise.all([
    supabase.from('philosophy_contributors').select('*').eq('club_id',club.id),
    (isAdmin() || isPhilosophyLead())
      ?supabase.from('philosophy_contributor_invites').select('*').eq('club_id',club.id).order('created_at',{ascending:true})
      :Promise.resolve({data:[],error:null}),
    workshop?.final_draft_ready
      ?supabase.from('philosophy_final_draft_snapshots').select('*').eq('club_id',club.id).maybeSingle()
      :Promise.resolve({data:null,error:null}),
    workshop?.final_draft_ready
      ?supabase.from('philosophy_late_response_actions').select('*').eq('club_id',club.id).order('submitted_at',{ascending:false})
      :Promise.resolve({data:[],error:null}),
    (isAdmin() || isPhilosophyLead())
      ?supabase.rpc('get_philosophy_workshop_status',{p_club_id:club.id})
      :Promise.resolve({data:null,error:null})
  ]);

  if(!stillCurrent())return;
  if(cErr || iErr || snapErr || lateErr || statusErr){
    clubSetupContentPage('workshop').innerHTML=`<div class="notice">${esc((cErr||iErr||snapErr||lateErr||statusErr).message)}</div>`;
    return;
  }

  let members=[];
  let profiles=[];
  if(isAdmin() || isPhilosophyLead()){
    const {data:m}=await supabase
      .from('club_memberships')
      .select('club_id,user_id,involvement,permission_role')
      .eq('club_id',club.id);
    members=m||[];
  }
  if(!stillCurrent())return;

  // External Philosophy Contributors do not have to be ordinary club members. Always include
  // contributor user IDs when resolving display names, otherwise accepted email invitees can
  // appear as anonymous "Contributor" rows even though their response exists.
  const profileIds=[...new Set([
    ...(members||[]).map(x=>x.user_id),
    ...(contribRows||[]).map(x=>x.user_id),
    workshop?.philosophy_lead_user_id
  ].filter(Boolean))];
  if(profileIds.length){
    const {data:p}=await supabase.from('user_profiles').select('*').in('user_id',profileIds);
    profiles=p||[];
  }
  if(!stillCurrent())return;

  const pMap=new Map(profiles.map(x=>[x.user_id,x]));
  const elevatedCricketRoles=new Set(['captain','coach','head_coach','admin']);
  const staffMembers=(members||[]).filter(m=>elevatedCricketRoles.has(m.permission_role));
  const leadCandidates=(members||[]).filter(m=>
    elevatedCricketRoles.has(m.permission_role) || m.user_id===workshop?.philosophy_lead_user_id
  );
  const submittedCount=(contribRows||[]).filter(x=>x.status==='submitted').length;
  const totalCount=(contribRows||[]).length;
  const pendingExternal=(externalInvites||[]).filter(x=>x.status==='pending');
  const invitedTotal=totalCount+pendingExternal.length;
  const outstandingCount=Math.max(invitedTotal-submittedCount,0);
  const me=(contribRows||[]).find(x=>x.user_id===session.user.id)||myContributor;
  const postSubmissionStage=!!workshop?.final_draft_ready || ['review','published'].includes(workshop?.status);
  const canSeeSynthesis=(!!me && me.status==='submitted') || ((isPhilosophyLead() || isAdmin()) && postSubmissionStage);
  const allSubmitted=invitedTotal>0 && submittedCount===invitedTotal;
  const collaborative=workshop?.mode==='collaborative';
  const snapshotResponses=Array.isArray(draftSnapshot?.responses)?draftSnapshot.responses:[];
  const snapshotCount=Number(draftSnapshot?.response_count||snapshotResponses.length||0);
  const snapshotInvitedCount=Number(draftSnapshot?.source_invited_count||snapshotCount||0);
  const pendingLate=(lateActions||[]).filter(x=>x.status==='pending');
  const myLateAction=(lateActions||[]).find(x=>x.user_id===session.user.id && x.status==='pending')||null;
  const workshopStateRows=Array.isArray(workshopStatus?.contributors)?workshopStatus.contributors:[];
  const workshopStateByUser=new Map(workshopStateRows.map(x=>[x.user_id,x]));
  const workshopMismatchCount=Number(workshopStatus?.mismatch_count||0);
  const recordedSynthesisResponses=Number(workshopStatus?.synthesis_response_count||0);

  // Resolve the response set once, before rendering the page. The same response set is then
  // used for Contributions received and the Scenario Explorer so the workflow reads
  // from top to bottom without changing its definition of who has contributed.
  let visibleResponses=[];
  let synthesisMeta=null;
  let synthesisLoadError=null;
  if(canSeeSynthesis){
    if(workshop?.final_draft_ready && snapshotResponses.length){
      visibleResponses=snapshotResponses;
      synthesisMeta={
        snapshot:true,
        responseCount:snapshotCount,
        invitedCount:snapshotInvitedCount,
        createdAt:draftSnapshot?.created_at||workshop?.final_draft_started_at,
        mismatchCount:0
      };
    }else{
      const {data:source,error:sourceErr}=await supabase.rpc('get_philosophy_synthesis_source',{p_club_id:club.id});
      if(sourceErr){
        synthesisLoadError=sourceErr;
      }else{
        visibleResponses=Array.isArray(source?.responses)?source.responses:[];
        synthesisMeta={
          snapshot:false,
          responseCount:Number(source?.response_count||visibleResponses.length||0),
          invitedCount:invitedTotal,
          submittedContributorCount:Number(source?.submitted_contributor_count||submittedCount||0),
          mismatchCount:Number(source?.mismatch_count||0)
        };
      }
    }
  }

  if(!stillCurrent())return;
  const scenarioResponses=scenarioResponsePool(visibleResponses,lateActions||[],pMap);
  const defaultScenarioIds=workshop?.final_draft_ready && snapshotResponses.length
    ?snapshotResponses.map(r=>r.user_id)
    :visibleResponses.map(r=>r.user_id);
  if(canSeeSynthesis && scenarioResponses.length){
    ensurePhilosophyScenarioSelection(scenarioResponses,defaultScenarioIds);
  }

  // Choosing the club approach closes contributor setup for this round. Returning
  // here is a review, not an implicit reset of the work that follows it.
  const setupComplete=!!workshop?.final_draft_ready || !!howWeBatDraft || workshop?.status==='published';
  const setupSaved=setupComplete||!!(workshop?.philosophy_lead_user_id&&(contribRows||[]).some(c=>c.user_id===workshop.philosophy_lead_user_id));
  const leadName=pMap.get(workshop?.philosophy_lead_user_id)?.display_name||'';
  const outstandingNames=[...(contribRows||[]).filter(c=>c.status!=='submitted').map(c=>pMap.get(c.user_id)?.display_name||'a contributor'),...pendingExternal.map(i=>i.invited_name||i.invited_email)];
  const nextStep=workshopNextStep({me,setupSaved,leadName,outstandingNames,canCompare:canSeeSynthesis&&scenarioResponses.length>0,loadError:synthesisLoadError});
  let html=`<div class="guide-context-bar"><span><strong>Batting Philosophy Workshop</strong></span><button type="button" class="btn ghost compact-btn" id="workshopGuideLink">Workshop help</button></div><div class="workshop-flow-stack">
    <section class="card workshop-next-step" id="workshopNextStep" style="border-left:4px solid var(--navy,#242e72)">
      <div class="section-label">Your next step</div><h2>${esc(nextStep.title)}</h2><p class="help">${esc(nextStep.body)}</p>
      ${nextStep.action?`<div class="btnrow"><button type="button" class="btn secondary" id="workshopNextAction" data-workshop-next="${nextStep.action}">${esc(nextStep.label)}</button></div>`:''}
      ${leadName?`<p class="help" style="margin-top:12px">Philosophy Lead: ${esc(leadName)}</p>`:''}
    </section>`;

  if(isAdmin() && !setupComplete){
    html+=`<details class="card workshop-setup workshop-stage-card" id="workshopContributors" ${setupSaved?'':'open'}>
      <summary style="cursor:pointer;font-weight:700">${setupSaved?'Contributors and invitations · saved':'Choose contributors'}</summary>
      <div style="margin-top:16px">
      <div class="section-label">1 · Contributors</div>
      <h2>Who is contributing?</h2>
      <div class="help">Choose the Philosophy Lead and the people whose independent batting perspective should feed this workshop. You can add or invite contributors here without jumping ahead to the draft.</div>

      <div class="mode-choice">
        <label class="mode-card ${!collaborative?'on':''}">
          <input type="radio" name="workshopMode" value="solo" ${!collaborative?'checked':''}>
          <strong>Solo</strong>
          <span>One nominated Philosophy Lead completes and publishes the club philosophy.</span>
        </label>
        <label class="mode-card ${collaborative?'on':''}">
          <input type="radio" name="workshopMode" value="collaborative" ${collaborative?'checked':''}>
          <strong>Collaborative</strong>
          <span>Selected people respond independently, then the system shows consensus and discussion points.</span>
        </label>
      </div>

      <div id="modeFeedback" class="mode-feedback ${collaborative?'show':''}">
        ${collaborative?'<strong>Collaborative selected.</strong> Choose the people whose batting perspective you want below.':''}
      </div>

      <div class="field">
        <label>Philosophy Lead — final approval and publishing</label>
        <select id="leadUser">
          ${leadCandidates.length?'':'<option value="">Add an eligible club member first</option>'}
          ${leadCandidates.map(m=>{
            const name=pMap.get(m.user_id)?.display_name||'Profile not completed';
            const roleLabel=m.permission_role==='head_coach'?'Head Coach':m.permission_role==='admin'?'Club Admin':m.permission_role==='captain'?'Captain':m.permission_role==='coach'?'Coach':labelInvolvement(m.involvement);
            return `<option value="${m.user_id}" ${workshop?.philosophy_lead_user_id===m.user_id?'selected':''}>${esc(name)} · ${esc(roleLabel)}</option>`;
          }).join('')}
        </select>
        <div class="help" style="margin-top:8px">Can’t find your Philosophy Lead? Add them or assign their club role in People &amp; Sign-up, then return here.</div>
        <button type="button" class="btn ghost" id="workshopManagePeople" style="margin-top:8px">Open People &amp; Sign-up</button>
      </div>

      <div id="contributorPicker" class="collaborative-panel ${collaborative?'show':''}">
        <div class="collab-intro">
          <div>
            <div class="section-label">Contributors</div>
            <h3>Who should have a say?</h3>
            <p>They answer privately first. They do not see everyone else's answers until they have submitted their own.</p>
          </div>
        </div>

        <div class="workshop-flow-step">
          <div class="workshop-step-num">1</div>
          <div>
            <label class="field-label">Choose coaches / captains already in this club</label>
            <div class="help">Only people who have already been given an elevated cricket role appear here. Ordinary players are not listed.</div>
          </div>
        </div>
        <div class="contributor-picker">
          ${staffMembers.length?staffMembers.map(m=>{
            const name=pMap.get(m.user_id)?.display_name||'Profile not completed';
            const selected=(contribRows||[]).some(c=>c.user_id===m.user_id);
            const isLead=m.user_id===workshop?.philosophy_lead_user_id;
            const roleLabel=m.permission_role==='head_coach'?'Head Coach':m.permission_role==='admin'?'Club Admin':m.permission_role==='captain'?'Captain':'Coach';
            return `<label class="contributor-check ${isLead?'lead-person':''}">
              <input type="checkbox" data-contributor-user="${m.user_id}" ${selected||isLead?'checked':''} ${isLead?'disabled':''}>
              <span><strong>${esc(name)}${isLead?' · Philosophy Lead':''}</strong><small>${esc(roleLabel)}</small></span>
            </label>`;
          }).join(''):'<div class="notice compact">No other coaches or captains have elevated club permissions yet.</div>'}
        </div>

        <div class="external-invite-box">
          <div class="workshop-flow-step">
            <div class="workshop-step-num">2</div>
            <div>
              <div class="section-label">Additional contributors</div>
              <h3>Invite someone else by email</h3>
              <p class="help">Use this only for someone who is not already available above. They join as <strong>Philosophy Contributor only</strong> unless the Admin later gives them another club role.</p>
            </div>
          </div>

          <div id="newContributorRows" class="new-contributor-rows">
            <div class="new-contributor-row" data-new-contributor-row>
              <div class="field"><label>Name</label><input data-new-name placeholder="e.g. Sam Brown"></div>
              <div class="field"><label>Email</label><input data-new-email type="email" placeholder="sam@example.com"></div>
              <button class="btn ghost remove-new-contributor" type="button" data-remove-new-contributor style="visibility:hidden">Remove</button>
            </div>
          </div>

          <button class="btn ghost add-person-btn" id="addContributorRow" type="button">+ Add another person</button>
          <div id="externalInviteStatus" class="help"></div>
          <div class="help">New email invitations are queued when you save. You can manage existing invitations below.</div>
        </div>

        <div class="notice compact"><strong>No committee meeting required.</strong><br>Invite people now; they complete their response independently when it suits them.</div>
      </div>

      <div class="workshop-save-block">
        <div class="workshop-flow-step">
          <div class="workshop-step-num">3</div>
          <div>
            <strong class="workshop-step-title">Save this workshop setup</strong>
            <div class="help">In Collaborative mode, this sends invitations only to new email addresses entered above. People already invited are not sent another invitation.</div>
          </div>
        </div>
        <div class="btnrow workshop-save-row">
          <button class="btn secondary" id="saveWorkshopSetup" ${leadCandidates.length?'':'disabled'}>${collaborative?'Save selections & send new invitations':'Save Solo Workshop'}</button>
          <span class="status" id="workshopSetupStatus"></span>
        </div>
      </div>

      ${externalInvites?.length?`<div class="collaborative-invite-history ${collaborative?'show':''}" id="collaborativeInviteHistory">
        <div class="invite-history-head">
          <div>
            <div class="section-label">Existing invitations</div>
            <h3>Manage existing invitations</h3>
            <p class="help">Saving the selections above <strong>does not create another invitation for these people</strong>. Use Resend if someone needs a fresh invitation email.</p>
          </div>
        </div>
        <div class="pending-invites">
          ${externalInvites.map(i=>`<div class="pending-invite-row">
            <div><strong>${esc(i.invited_name||i.invited_email)}</strong><small>${esc(i.invited_email)} · ${esc(i.status)}</small></div>
            <div class="member-controls">
              ${i.status==='pending'?`<button class="btn ghost" data-resend-philosophy-invite="${i.id}">Resend</button><button class="btn ghost" data-cancel-philosophy-invite="${i.id}">Cancel</button>`:''}
            </div>
          </div>`).join('')}
        </div>
      </div>`:''}
    </div></details>`;
  }else if(isAdmin()){
    html+=`<details class="card workshop-stage-card workshop-setup-review" id="workshopContributors"><summary style="cursor:pointer;font-weight:700">Contributors and invitations · this round</summary><div style="margin-top:16px">
      <div class="section-label">Workshop setup complete</div>
      <h2>Review this round’s contributions.</h2>
      <p class="help">The Philosophy Lead and contributor choices are fixed for this round. You can review the responses below. To change the workshop setup, use <strong>Start new philosophy round</strong> in Workshop settings; the current work will not be reset by revisiting this page.</p>
      ${externalInvites?.length?`<details class="workshop-existing-invitations"><summary>Existing contributor invitations</summary><div class="pending-invites">${externalInvites.map(i=>`<div class="pending-invite-row"><div><strong>${esc(i.invited_name||i.invited_email)}</strong><small>${esc(i.invited_email)} · ${esc(i.status)}</small></div><div class="member-controls">${i.status==='pending'?`<button class="btn ghost" data-resend-philosophy-invite="${i.id}">Resend</button><button class="btn ghost" data-cancel-philosophy-invite="${i.id}">Cancel</button>`:''}</div></div>`).join('')}</div></details>`:''}
    </div></details>`;
  }

  html+=`<details class="workshop-contribution-details" id="workshopContributionDetails" ${workshopMismatchCount||synthesisLoadError?'open':''}><summary style="cursor:pointer;font-weight:700;padding:14px 0">Contributions · ${submittedCount} submitted · ${outstandingCount} outstanding</summary>
    ${synthesisLoadError?`<div class="notice">${esc(synthesisLoadError.message)}</div>`:''}
    <section class="card workshop-stage-card">
    <div class="section-label">2 · Contributions received</div>
    <h2>What has come back?</h2>
    <div class="help">Each person completes their response independently. After submitting your own response, you can compare the contributions below. The Philosophy Lead chooses the combination used to create How We Bat.</div>
    <div class="workshop-progress">
      ${workshop?.final_draft_ready && draftSnapshot
        ?`<div><strong>${snapshotCount}</strong><span>included in current synthesis</span></div>
          <div><strong>${pendingLate.length}</strong><span>new submitted voice${pendingLate.length===1?'':'s'} available to explore</span></div>
          <div><strong>${Math.max(snapshotInvitedCount-snapshotCount-pendingLate.length,0)}</strong><span>still outstanding</span></div>`
        :`<div><strong>${submittedCount}</strong><span>submitted</span></div>
          <div><strong>${outstandingCount}</strong><span>still outstanding</span></div>
          <div><strong>${pendingExternal.length}</strong><span>email invitations pending</span></div>`}
    </div>`;

  if(me){
    const leadDrafting=isPhilosophyLead() && workshop?.final_draft_ready;
    const leadOriginalIncluded=leadDrafting && snapshotResponses.some(r=>r.user_id===session.user.id);
    html+=`<div class="my-response-card">
      <div>
        <div class="section-label">${leadDrafting?'Your original response':'Your contribution'}</div>
        <strong>${esc(leadDrafting
          ?(leadOriginalIncluded?'Included in current synthesis':'Original response preserved')
          :contributorStatusLabel(me.status))}</strong>
        <p>${leadDrafting
          ?'Your independent response is preserved in the response set below. Explore the submitted voices, choose the combination that feels right, then create How We Bat directly from it.'
          :me.status==='submitted'
            ?(myLateAction
              ?'Your response was submitted after the final-draft snapshot. It is locked and the Philosophy Lead will decide whether to incorporate it.'
              :'Your independent response is locked. You can now review the responses and synthesis when they are available.')
            :me.status==='in_progress'
              ?'Your work is saved, but it is not submitted yet. Continue through Club Identity → What We Value → Format Emphasis, then use the final Submit response step.'
              :'You have been invited to contribute independently.'}</p>
      </div>
      ${leadDrafting
        ?''
        :`<button class="btn secondary" id="myResponseAction">${me.status==='invited'?'Start my response':me.status==='in_progress'?'Continue & submit response':'Review my response'}</button>`}
    </div>`;
  }else if(isAdmin()){
    html+=`<div class="notice compact">You can manage contributors and check their progress here. ${postSubmissionStage?'The submitted responses are available to review below.':'Individual responses stay private until contributors have submitted their own response or the workshop reaches the review stage.'} The Philosophy Lead creates and finalises How We Bat.</div>`;
  }else{
    html+=`<div class="notice">You have not been invited to contribute to this philosophy round.</div>`;
  }

  html+=`</section>`;

  if(isAdmin() || isPhilosophyLead()){
    html+=`<section class="card response-status-card" style="margin-top:16px">
      <div class="section-label">Response status</div>
      <h2>Who has submitted?</h2>
      <div class="help">A saved response is still in progress. Submitted responses are ready for comparison once you have submitted your own response or the workshop reaches the review stage.</div>
      ${workshopMismatchCount?`<div class="notice workshop-data-warning"><strong>Workshop data needs attention.</strong><br>${workshopMismatchCount} contributor record${workshopMismatchCount===1?' is':'s are'} out of sync with the stored response. Club Batting will not silently include or exclude those responses.</div>`:''}
      <div class="member-list">
        ${(contribRows||[]).map(c=>{
          const state=workshopStateByUser.get(c.user_id)||null;
          const name=state?.display_name||pMap.get(c.user_id)?.display_name||'Contributor';
          let statusText='';
          let responseState='';
          let responseClass='waiting';

          if(workshop?.final_draft_ready){
            const included=snapshotResponses.some(r=>r.user_id===c.user_id);
            const late=(lateActions||[]).find(a=>a.user_id===c.user_id);
            if(included){
              statusText='Submitted';
              responseState=c.user_id===workshop?.philosophy_lead_user_id
                ?'Original response included in current synthesis ✓'
                :'Included in current synthesis ✓';
              responseClass='ready';
            }else if(late?.status==='pending'){
              statusText='Submitted after draft started';
              responseState='Available to compare below';
              responseClass='problem';
            }else if(late?.status==='ignored'){
              statusText='Submitted after draft started';
              responseState='Available to compare below';
              responseClass='waiting';
            }else if(c.status==='submitted'){
              statusText='Submitted';
              responseState='Submitted response is not in the current synthesis';
              responseClass='problem';
            }else if(c.status==='in_progress'){
              statusText=c.user_id===workshop?.philosophy_lead_user_id?'Drafting final philosophy':'In progress';
              responseState=c.user_id===workshop?.philosophy_lead_user_id?'Original response preserved in synthesis':'Saved response · not submitted yet';
              responseClass=c.user_id===workshop?.philosophy_lead_user_id?'ready':'waiting';
            }else{
              statusText='Invited';
              responseState='Not started / not submitted';
              responseClass='waiting';
            }
          }else if(c.status==='submitted'){
            statusText='Submitted';
            if(state?.response_ready){
              const when=state.response_submitted_at?new Date(state.response_submitted_at).toLocaleString():'';
              responseState=`Response recorded ✓${when?` · ${when}`:''}`;
              responseClass='ready';
            }else{
              responseState='Submitted status, but response is not available to synthesis';
              responseClass='problem';
            }
          }else if(c.status==='in_progress'){
            statusText='In progress';
            responseState=state?.response_exists?'Saved response · not submitted yet':'No submitted response yet';
            responseClass='waiting';
          }else{
            statusText='Invited';
            responseState='Not started / not submitted';
            responseClass='waiting';
          }

          return `<div class="member">
            <div><strong>${esc(name)}${c.user_id===workshop?.philosophy_lead_user_id?' · Philosophy Lead':''}</strong>
            <small>${esc(statusText)}</small>
            <span class="workshop-response-state ${responseClass}">${esc(responseState)}</span></div>
            <div class="member-controls">
              ${c.status==='submitted' && isAdmin() && !setupComplete?`<button class="btn ghost" data-reopen-contributor="${c.user_id}">Allow changes</button>`:''}
            </div>
          </div>`;
        }).join('')||'<div class="notice">No accepted contributors selected yet.</div>'}
        ${pendingExternal.map(i=>`<div class="member">
          <div><strong>${esc(i.invited_name||i.invited_email)}</strong><small>Waiting to accept invitation</small><span class="workshop-response-state waiting">Response not started</span></div>
        </div>`).join('')}
      </div>
      ${!workshopMismatchCount && submittedCount!==recordedSynthesisResponses && !workshop?.final_draft_ready
        ?`<div class="notice workshop-data-warning"><strong>Response count check:</strong> ${submittedCount} contributor${submittedCount===1?' is':'s are'} marked submitted, while ${recordedSynthesisResponses} response${recordedSynthesisResponses===1?' is':'s are'} currently available to synthesis.</div>`
        :''}
    </section>`;
  }

  html+='</details><div id="workshopComparison">';
  if(canSeeSynthesis){
    if(synthesisLoadError){
      html+=`<section class="card workshop-stage-card" style="margin-top:16px"><div class="section-label">3 · Compare How We Bat options</div><h2>The submitted responses could not be loaded.</h2><div class="notice">${esc(synthesisLoadError.message)}</div></section>`;
    }else if(scenarioResponses.length){
      html+=renderSynthesis(scenarioResponses,pMap,allSubmitted,synthesisMeta);
    }else{
      html+=`<section class="card workshop-stage-card" style="margin-top:16px"><div class="section-label">3 · Compare How We Bat options</div><h2>Submitted responses will appear here.</h2><div class="help">Once a response is available, you can preview the How We Bat options. The Philosophy Lead chooses which option to use.</div></section>`;
    }

  }else if(totalCount>1 && me){
    html+=`<section class="card synthesis-locked workshop-stage-card" style="margin-top:16px">
      <div class="section-label">3 · Compare How We Bat options</div>
      <h2>Submit first, then explore the options.</h2>
      <div class="help">Responses stay independent while people are completing them.</div>
    </section>`;
  }

  html+='</div>';
  if(isAdmin() || isPhilosophyLead()){
    html+=`<details class="card workshop-maintenance" style="margin-top:16px">
      <summary style="cursor:pointer;font-weight:700">Workshop settings</summary>
      <div class="help" style="margin-top:10px">Rare maintenance actions live here so they do not compete with the normal workshop flow.</div>
      <div style="display:grid;gap:10px;margin-top:12px">
        ${isPhilosophyLead() && workshop?.final_draft_ready && howWeBatDraft?.status!=='ready'?`<div class="notice compact"><strong>Reset How We Bat draft</strong><br>Before How We Bat is locked, you can regenerate the editable draft from the current working philosophy. Any manual edits in the current draft will be replaced.<div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="resetHowWeBatDraft">Reset How We Bat draft</button></div></div>`:''}
        <div class="notice compact"><strong>Start a new philosophy round</strong><br>Revisit your club’s approach for a new season, a change of leadership or whenever you want to change direction. The current round is archived and any published How We Bat and Player Plans stay available until a replacement is published.<div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="startNewPhilosophyRound">Start a new philosophy round</button></div></div>
      </div>
    </details>`;
  }

  if(philosophyVersions.length){
    html+=`<section class="card" style="margin-top:16px">
      <div class="section-label">Published history</div>
      <h2>Club philosophy versions</h2>
      <div class="version-list">${philosophyVersions.map(v=>`
        <div class="version-row"><strong>Version ${v.version_number}</strong><span>${new Date(v.published_at).toLocaleDateString()}</span></div>`).join('')}</div>
    </section>`;
  }

  html+=`<details class="workshop-about"><summary style="cursor:pointer;font-weight:700;padding:14px 0">About this workshop</summary>${buildWorkspaceAudienceNotice()}</details></div>`;
  clubSetupContentPage('workshop').innerHTML=html;
  if(document.getElementById('workshopGuideLink'))document.getElementById('workshopGuideLink').onclick=()=>openClubBattingGuideTopic('philosophy_workshop');
  if(document.getElementById('workshopNextAction'))document.getElementById('workshopNextAction').onclick=async()=>{
    if(nextStep.action==='response'){await document.getElementById('myResponseAction')?.onclick?.();return;}
    const sectionId=({setup:'workshopContributors',compare:'workshopComparison',status:'workshopContributionDetails'})[nextStep.action];
    if(sectionId){
      const section=document.getElementById(sectionId);
      if(section){section.open=true;section.scrollIntoView?.({behavior:'smooth',block:'start'});}
      return;
    }
    if(!canOpenClubTab(nextStep.action)||!await saveClubEditsBeforeNavigation())return;
    currentTab=nextStep.action;renderShell();
  };
  if(document.getElementById('workshopManagePeople'))document.getElementById('workshopManagePeople').onclick=async()=>{
    if(!isAdmin()||!await saveClubEditsBeforeNavigation())return;
    currentTab='permissions';renderShell();
  };

  const applyModeUI=()=>{
    const mode=document.querySelector('input[name="workshopMode"]:checked')?.value||'solo';
    const panel=document.getElementById('contributorPicker');
    const feedback=document.getElementById('modeFeedback');
    const save=document.getElementById('saveWorkshopSetup');
    const collaborativeNow=mode==='collaborative';

    if(panel)panel.classList.toggle('show',collaborativeNow);
    document.getElementById('collaborativeInviteHistory')?.classList.toggle('show',collaborativeNow);
    if(feedback){
      feedback.classList.toggle('show',collaborativeNow);
      feedback.innerHTML=collaborativeNow
        ?'<strong>Collaborative selected.</strong> Choose the people whose batting perspective you want below.'
        :'';
    }
    if(save)save.textContent=collaborativeNow?'Save selections & send new invitations':'Save Solo Workshop';
  };

  document.querySelectorAll('.mode-card input').forEach(r=>r.onchange=()=>{
    document.querySelectorAll('.mode-card').forEach(x=>x.classList.toggle('on',x.querySelector('input').checked));
    applyModeUI();
  });

  if(document.getElementById('leadUser')){
    document.getElementById('leadUser').onchange=()=>{
      const lead=document.getElementById('leadUser').value;
      document.querySelectorAll('[data-contributor-user]').forEach(x=>{
        const isLead=x.dataset.contributorUser===lead;
        x.disabled=isLead;
        if(isLead)x.checked=true;
        x.closest('.contributor-check')?.classList.toggle('lead-person',isLead);
      });
    };
  }

  if(document.getElementById('saveWorkshopSetup')){
    document.getElementById('saveWorkshopSetup').onclick=()=>saveWorkshopSetup(contribRows||[],externalInvites||[]);
  }

  const refreshNewContributorRemoveButtons=()=>{
    const rows=[...document.querySelectorAll('[data-new-contributor-row]')];
    rows.forEach((row,i)=>{
      const remove=row.querySelector('[data-remove-new-contributor]');
      if(remove)remove.style.visibility=rows.length===1?'hidden':'visible';
    });
  };

  const wireNewContributorRows=()=>{
    document.querySelectorAll('[data-remove-new-contributor]').forEach(b=>{
      b.onclick=()=>{
        b.closest('[data-new-contributor-row]')?.remove();
        refreshNewContributorRemoveButtons();
      };
    });
    refreshNewContributorRemoveButtons();
  };

  if(document.getElementById('addContributorRow')){
    document.getElementById('addContributorRow').onclick=()=>{
      const wrap=document.getElementById('newContributorRows');
      const row=document.createElement('div');
      row.className='new-contributor-row';
      row.setAttribute('data-new-contributor-row','');
      row.innerHTML=`
        <div class="field"><label>Name</label><input data-new-name placeholder="e.g. Sam Brown"></div>
        <div class="field"><label>Email</label><input data-new-email type="email" placeholder="sam@example.com"></div>
        <button class="btn ghost remove-new-contributor" type="button" data-remove-new-contributor>Remove</button>`;
      wrap.appendChild(row);
      wireNewContributorRows();
      row.querySelector('[data-new-name]')?.focus();
    };
  }

  wireNewContributorRows();

  document.querySelectorAll('[data-resend-philosophy-invite]').forEach(b=>b.onclick=async()=>{
    b.textContent='Sending…';
    const {error}=await supabase.rpc('resend_philosophy_contributor_invite',{p_invite_id:b.dataset.resendPhilosophyInvite});
    if(error){alert(error.message);b.textContent='Resend';return;}
    b.textContent='Queued ✓';
    await kickLiveEmailDelivery();
  });

  document.querySelectorAll('[data-cancel-philosophy-invite]').forEach(b=>b.onclick=async()=>{
    if(!confirmLeaveWorkshopSetup())return;
    const {error}=await supabase.rpc('cancel_philosophy_contributor_invite',{p_invite_id:b.dataset.cancelPhilosophyInvite});
    if(error){alert(error.message);return;}
    await renderWorkshop();
  });

  if(document.getElementById('myResponseAction')){
    document.getElementById('myResponseAction').onclick=async()=>{
      if(!confirmLeaveWorkshopSetup())return;
      if(me.status==='submitted'){
        renderMySubmittedPhilosophyResponse(myContribution);
        return;
      }
      if(me.status==='invited'){
        const {error}=await supabase.rpc('start_my_philosophy_response',{p_club_id:club.id});
        if(error){alert(error.message);return;}
        await loadData();
      }
      currentTab='identity';
      renderShell();
    };
  }

  document.querySelectorAll('[data-reopen-contributor]').forEach(b=>b.onclick=async()=>{
    if(!confirmLeaveWorkshopSetup())return;
    if(workshop?.final_draft_ready || howWeBatDraft || workshop?.status==='published'){
      alert('This response is already part of the current synthesis and can no longer be reopened.');
      return;
    }
    const ok=confirm('Allow this contributor to change their submitted response? Their response will be removed from the live synthesis until they submit it again.');
    if(!ok)return;
    const {error}=await supabase.rpc('reopen_philosophy_contributor',{
      p_club_id:club.id,
      p_user_id:b.dataset.reopenContributor
    });
    if(error){alert(error.message);return;}
    await loadData();
    renderShell();
  });

  document.querySelectorAll('[data-scenario-preset]').forEach(b=>b.onclick=async()=>{
    if(!confirmLeaveWorkshopSetup())return;
    philosophyScenarioSelectedIds=new Set((b.dataset.scenarioPreset||'').split(',').filter(Boolean));
    if(workshop?.philosophy_lead_user_id)philosophyScenarioSelectedIds.add(workshop.philosophy_lead_user_id);
    await rerenderWorkshopKeepScroll();
  });

  if(document.getElementById('openScenarioHwbPreview')){
    document.getElementById('openScenarioHwbPreview').onclick=()=>openScenarioHowWeBatPreview(scenarioResponses,pMap);
  }
  if(document.getElementById('showScenarioChanges')){
    document.getElementById('showScenarioChanges').onclick=()=>document.getElementById('scenarioChangesDialog')?.showModal();
  }
  if(document.getElementById('closeScenarioChanges')){
    document.getElementById('closeScenarioChanges').onclick=()=>document.getElementById('scenarioChangesDialog')?.close();
  }
  if(document.getElementById('scenarioChangesDialog')){
    document.getElementById('scenarioChangesDialog').onclick=e=>{
      if(e.target===e.currentTarget)e.currentTarget.close();
    };
  }

  if(document.getElementById('useVoiceScenario')){
    document.getElementById('useVoiceScenario').onclick=()=>applySelectedVoiceScenario(scenarioResponses,pMap);
  }

  if(document.getElementById('buildFinalDraft')){
    document.getElementById('buildFinalDraft').onclick=()=>beginFinalDraftFromSynthesis();
  }

  if(document.getElementById('resetHowWeBatDraft')){
    document.getElementById('resetHowWeBatDraft').onclick=resetHowWeBatDraftFromCurrentPhilosophy;
  }
  if(document.getElementById('startNewPhilosophyRound')){
    document.getElementById('startNewPhilosophyRound').onclick=startNewPhilosophyRound;
  }

  document.querySelectorAll('[data-review-late]').forEach(b=>b.onclick=async()=>{
    const actionId=b.dataset.reviewLate;
    const detail=document.getElementById(`late-detail-${actionId}`);
    const opening=detail?.style.display==='none';
    if(detail)detail.style.display=opening?'block':'none';
    b.textContent=opening?'Hide contribution':'Review contribution';

    if(opening){
      const {error}=await supabase.rpc('review_late_philosophy_response',{p_action_id:actionId});
      if(error)alert(error.message);
    }
  });

  document.querySelectorAll('[data-ignore-late]').forEach(b=>b.onclick=async()=>{
    const action=(lateActions||[]).find(x=>x.id===b.dataset.ignoreLate);
    const name=pMap.get(action?.user_id)?.display_name||'this contributor';
    const ok=confirm(`Ignore the late response from ${name}? It will remain in the audit history but will not affect the final draft.`);
    if(!ok)return;

    b.disabled=true;
    const {error}=await supabase.rpc('ignore_late_philosophy_response',{p_action_id:b.dataset.ignoreLate});
    if(error){alert(error.message);b.disabled=false;return;}

    await loadData();
    renderShell();
  });

  document.querySelectorAll('[data-incorporate-late]').forEach(b=>b.onclick=async()=>{
    const action=(lateActions||[]).find(x=>x.id===b.dataset.incorporateLate);
    if(!action)return;

    const name=pMap.get(action.user_id)?.display_name||'this contributor';
    const currentSnapshot=Array.isArray(draftSnapshot?.responses)?draftSnapshot.responses:[];
    const expanded=[
      ...currentSnapshot.filter(r=>r.user_id!==action.user_id),
      action.response_snapshot
    ];

    const draft=buildConsensusDraft(expanded);
    const ok=confirm(
      `Include the new response from ${name} in the current synthesis?\n\n`+
      `This will rebuild the current working draft from the revised ${expanded.length}-response synthesis. `+
      `Any edits you have already made to the unpublished final draft will be replaced. Nothing happens unless you confirm.`
    );
    if(!ok)return;

    b.disabled=true;
    b.textContent='Incorporating…';

    const {error}=await supabase.rpc('incorporate_late_philosophy_response',{
      p_action_id:action.id,
      p_identity_values:draft.identity_values,
      p_identity_note:draft.identity_note,
      p_formats_enabled:draft.formats_enabled,
      p_selected_dimensions:draft.selected_dimensions,
      p_dimension_notes:draft.dimension_notes,
      p_format_weights:draft.format_weights
    });

    if(error){
      alert(error.message);
      b.disabled=false;
      b.textContent='Include in synthesis + rebuild draft';
      return;
    }

    await loadData();
    renderShell();
  });

  if(document.getElementById('openHwbBuilder')){
    document.getElementById('openHwbBuilder').onclick=()=>{currentTab='preview';renderTab();};
  }
  if(document.getElementById('continueToPlanStructure')){
    document.getElementById('continueToPlanStructure').onclick=()=>{
      currentTab='plan';
      renderTab();
    };
  }
  rememberWorkshopSetupSnapshot();
}

async function saveWorkshopSetup(existingRows,externalInvites=[]){
  if(!isAdmin())return;
  if(workshop?.final_draft_ready || howWeBatDraft || workshop?.status==='published'){
    alert('This workshop setup is complete. Review the existing contributions, or use Start new philosophy round in Workshop settings to change the setup. Your current work has not been changed.');
    return;
  }
  const s=document.getElementById('workshopSetupStatus');
  const btn=document.getElementById('saveWorkshopSetup');
  const externalStatus=document.getElementById('externalInviteStatus');
  if(!document.getElementById('leadUser')?.value){
    if(s)s.textContent='Choose a Philosophy Lead first. Use People & Sign-up if they are not listed yet.';
    return;
  }

  const newPeople=[...document.querySelectorAll('[data-new-contributor-row]')]
    .map(row=>({
      name:row.querySelector('[data-new-name]')?.value.trim()||'',
      email:row.querySelector('[data-new-email]')?.value.trim()||''
    }))
    .filter(x=>x.name||x.email);

  if(newPeople.some(x=>!x.email || !x.email.includes('@'))){
    if(externalStatus)externalStatus.textContent='Each new person needs a valid email address.';
    return;
  }

  const emailSet=new Set();
  for(const person of newPeople){
    const e=person.email.toLowerCase();
    if(emailSet.has(e)){
      if(externalStatus)externalStatus.textContent=`${person.email} has been entered more than once.`;
      return;
    }
    emailSet.add(e);
  }

  s.textContent='Saving…';
  btn.disabled=true;

  const savedSetupSnapshot=workshopSetupSnapshotOnPage();
  const mode=document.querySelector('input[name="workshopMode"]:checked')?.value||'solo';
  const lead=document.getElementById('leadUser').value;
  let selected=mode==='solo'
    ?[lead]
    :[...document.querySelectorAll('[data-contributor-user]:checked')].map(x=>x.dataset.contributorUser);
  if(!selected.includes(lead))selected.push(lead);

  const {error:wErr}=await supabase
    .from('philosophy_workshops')
    .update({
      mode,
      philosophy_lead_user_id:lead,
      status:'collecting',
      final_draft_ready:false,
      updated_at:new Date().toISOString()
    })
    .eq('club_id',club.id);

  if(wErr){s.textContent=wErr.message;btn.disabled=false;return;}

  const existingMap=new Map(existingRows.map(x=>[x.user_id,x]));

  for(const userId of selected){
    if(!existingMap.has(userId)){
      const {error}=await supabase.rpc('invite_existing_philosophy_contributor',{
        p_club_id:club.id,p_user_id:userId
      });
      if(error){s.textContent=error.message;btn.disabled=false;return;}
    }
  }

  const pickerUserIds=new Set(
    [...document.querySelectorAll('[data-contributor-user]')].map(x=>x.dataset.contributorUser)
  );

  for(const row of existingRows){
    const shouldRemove=mode==='solo'
      ?row.user_id!==lead
      :pickerUserIds.has(row.user_id) && !selected.includes(row.user_id);

    if(shouldRemove){
      const {error}=await supabase
        .from('philosophy_contributors')
        .delete()
        .eq('club_id',club.id)
        .eq('user_id',row.user_id);
      if(error){s.textContent=error.message;btn.disabled=false;return;}
    }
  }

  if(mode==='collaborative' && newPeople.length){
    if(externalStatus)externalStatus.textContent=`Queuing ${newPeople.length} invitation${newPeople.length===1?'':'s'}…`;

    for(const person of newPeople){
      const {error}=await supabase.rpc('invite_philosophy_contributor_by_email',{
        p_club_id:club.id,
        p_name:person.name,
        p_email:person.email
      });
      if(error){
        if(externalStatus)externalStatus.textContent=error.message;
        s.textContent='Some invitations were not sent.';
        btn.disabled=false;
        return;
      }
    }

    if(externalStatus)externalStatus.textContent=`${newPeople.length} invitation${newPeople.length===1?'':'s'} queued ✓`;
    await kickLiveEmailDelivery();
  }

  if(mode==='solo'){
    for(const invite of externalInvites.filter(x=>x.status==='pending')){
      await supabase.rpc('cancel_philosophy_contributor_invite',{p_invite_id:invite.id});
    }
  }

  s.textContent=mode==='collaborative'?'Saved — new invitations queued ✓':'Solo workshop saved ✓';
  rememberWorkshopSetupSnapshot(savedSetupSnapshot);
  await loadData();
  if(workshopSetupSnapshotOnPage()!==savedSetupSnapshot){
    s.textContent='Earlier selections saved. Your latest changes are still here; save them before leaving.';
    btn.disabled=false;
    return;
  }
  setTimeout(()=>renderShell(),350);
}

function consensusClass(ratio,responseCount=2){
  if(responseCount<2)return {consensusLabel:'One response',cls:'single'};
  if(ratio>=.8 || ratio<=.2)return {consensusLabel:'Strong agreement',cls:'strong'};
  if(ratio>=.65 || ratio<=.35)return {consensusLabel:'General agreement',cls:'general'};
  return {consensusLabel:'Needs discussion',cls:'discussion'};
}

function median(nums){
  if(!nums.length)return 2;
  const a=[...nums].sort((x,y)=>x-y);
  const mid=Math.floor(a.length/2);
  return a.length%2?a[mid]:Math.round((a[mid-1]+a[mid])/2);
}

function buildSynthesis(responses){
  const n=responses.length;
  const identity=[];
  for(const [key,itemLabel] of IDENTITY_OPTIONS){
    const count=responses.filter(r=>(r.identity_values||[]).includes(key)).length;
    identity.push({key,itemLabel,count,ratio:count/n,...consensusClass(count/n,n)});
  }

  const dims=dimensions.map(d=>{
    const count=responses.filter(r=>(r.selected_dimensions||[]).includes(d.dimension_key)).length;
    return {key:d.dimension_key,itemLabel:d.label,count,ratio:count/n,...consensusClass(count/n,n)};
  });

  const weightRows=[];
  for(const d of dimensions){
    for(const [f,flabel] of FORMATS){
      const vals=responses
        .filter(r=>(r.selected_dimensions||[]).includes(d.dimension_key) && r.formats_enabled?.[f]!==false)
        .map(r=>Number(r.format_weights?.[`${d.dimension_key}:${f}`]))
        .filter(v=>Number.isFinite(v));
      if(!vals.length)continue;
      const min=Math.min(...vals),max=Math.max(...vals),spread=max-min;
      const oneResponse=vals.length<2;
      weightRows.push({
        key:d.dimension_key,dimension:d.label,format:f,formatLabel:flabel,
        values:vals,median:median(vals),min,max,spread,
        consensusLabel:oneResponse?'One response':spread<=1?'Strong agreement':spread===2?'Some variation':'Needs discussion',
        cls:oneResponse?'single':spread<=1?'strong':spread===2?'general':'discussion'
      });
    }
  }

  const flags=n<2?[]:[
    ...identity.filter(x=>x.cls==='discussion').map(x=>`${x.itemLabel}: contributors are split on whether this belongs in the core identity.`),
    ...dims.filter(x=>x.cls==='discussion').map(x=>`${x.itemLabel}: contributors are split on whether this belongs in the batting system.`),
    ...weightRows.filter(x=>x.cls==='discussion').map(x=>`${x.dimension} · ${x.formatLabel}: emphasis ranges from ${WEIGHT_LABELS[x.min]} to ${WEIGHT_LABELS[x.max]}.`)
  ];

  return {n,identity,dims,weightRows,flags};
}

function buildScenarioDraft(responses){
  const safeResponses=(responses||[]).filter(Boolean);
  const n=Math.max(safeResponses.length,1);
  const s=buildSynthesis(safeResponses);

  // Ties are retained rather than discarded. A 1-of-2 idea is a legitimate
  // signal, not a failed vote. Minority-only dimensions remain available but
  // are softened by how broadly they are supported so the overall club "vibe"
  // stays coherent rather than becoming a shopping list of every suggestion.
  const identityValues=s.identity.filter(x=>x.ratio>=.5).map(x=>x.key);

  const formatsEnabled={};
  for(const [f] of FORMATS){
    const enabled=safeResponses.filter(r=>r.formats_enabled?.[f]!==false).length;
    formatsEnabled[f]=(enabled/n)>=.5;
  }

  const selectedDimensions=[];
  const dimensionNotes={};
  const formatWeights={};

  for(const d of dimensions){
    const supporters=safeResponses.filter(r=>(r.selected_dimensions||[]).includes(d.dimension_key));
    if(!supporters.length)continue;

    selectedDimensions.push(d.dimension_key);
    const supportRatio=supporters.length/n;
    const notes=[...new Set(supporters.map(r=>(r.dimension_notes?.[d.dimension_key]||'').trim()).filter(Boolean))];
    if(notes.length)dimensionNotes[d.dimension_key]=notes.join(' / ');

    for(const [f] of FORMATS){
      if(formatsEnabled[f]===false)continue;
      const vals=supporters
        .filter(r=>r.formats_enabled?.[f]!==false)
        .map(r=>Number(r.format_weights?.[`${d.dimension_key}:${f}`]))
        .filter(v=>Number.isFinite(v));
      if(!vals.length)continue;

      const raw=median(vals);
      const supportFactor=.35+(.65*supportRatio);
      let effective=Math.round(raw*supportFactor);
      if(raw>0 && effective===0)effective=1;
      formatWeights[`${d.dimension_key}:${f}`]=Math.max(0,Math.min(4,effective));
    }
  }

  return {
    identity_values:identityValues,
    identity_note:'',
    formats_enabled:formatsEnabled,
    selected_dimensions:selectedDimensions,
    dimension_notes:dimensionNotes,
    format_weights:formatWeights
  };
}

function buildConsensusDraft(responses){
  return buildScenarioDraft(responses);
}


function philosophyIdentityLabel(key){
  return IDENTITY_OPTIONS.find(([k])=>k===key)?.[1]||key;
}

function philosophyDimensionLabel(key){
  return dimensions.find(d=>d.dimension_key===key)?.label||key;
}

function responseDifferenceRows(base,target,baseLabel='Philosophy Lead',targetLabel='Contributor'){
  if(!base || !target)return [];
  const rows=[];
  const baseIdentity=new Set(base.identity_values||[]);
  const targetIdentity=new Set(target.identity_values||[]);
  const identityAdded=[...targetIdentity].filter(k=>!baseIdentity.has(k)).map(philosophyIdentityLabel);
  const identityMissing=[...baseIdentity].filter(k=>!targetIdentity.has(k)).map(philosophyIdentityLabel);
  if(identityAdded.length)rows.push(`${targetLabel} adds to Club Identity: ${naturalList(identityAdded)}.`);
  if(identityMissing.length)rows.push(`${targetLabel} does not select: ${naturalList(identityMissing)}.`);

  const baseFormats=new Set(FORMATS.filter(([f])=>base.formats_enabled?.[f]!==false).map(([f])=>f));
  const targetFormats=new Set(FORMATS.filter(([f])=>target.formats_enabled?.[f]!==false).map(([f])=>f));
  const formatsAdded=[...targetFormats].filter(f=>!baseFormats.has(f)).map(f=>FORMATS.find(([k])=>k===f)?.[1]||f);
  const formatsMissing=[...baseFormats].filter(f=>!targetFormats.has(f)).map(f=>FORMATS.find(([k])=>k===f)?.[1]||f);
  if(formatsAdded.length)rows.push(`${targetLabel} includes additional format${formatsAdded.length===1?'':'s'}: ${naturalList(formatsAdded)}.`);
  if(formatsMissing.length)rows.push(`${targetLabel} does not include: ${naturalList(formatsMissing)}.`);

  const baseDims=new Set(base.selected_dimensions||[]);
  const targetDims=new Set(target.selected_dimensions||[]);
  const dimsAdded=[...targetDims].filter(k=>!baseDims.has(k)).map(philosophyDimensionLabel);
  const dimsMissing=[...baseDims].filter(k=>!targetDims.has(k)).map(philosophyDimensionLabel);
  if(dimsAdded.length)rows.push(`${targetLabel} adds to the batting system: ${naturalList(dimsAdded)}.`);
  if(dimsMissing.length)rows.push(`${targetLabel} does not select: ${naturalList(dimsMissing)}.`);

  const baseIdentityNote=(base.identity_note||'').trim();
  const targetIdentityNote=(target.identity_note||'').trim();
  if(targetIdentityNote && targetIdentityNote!==baseIdentityNote)rows.push(`${targetLabel} adds a Club Identity comment.`);
  const baseNotes=base.dimension_notes||{};
  const targetNotes=target.dimension_notes||{};
  for(const [k,note] of Object.entries(targetNotes)){
    const text=(note||'').trim();
    if(text && text!==(baseNotes?.[k]||'').trim())rows.push(`${targetLabel} adds a written note for ${philosophyDimensionLabel(k)}.`);
  }

  for(const d of dimensions){
    if(!baseDims.has(d.dimension_key) || !targetDims.has(d.dimension_key))continue;
    for(const [f,formatLabel] of FORMATS){
      if(base.formats_enabled?.[f]===false || target.formats_enabled?.[f]===false)continue;
      const a=Number(base.format_weights?.[`${d.dimension_key}:${f}`]);
      const b=Number(target.format_weights?.[`${d.dimension_key}:${f}`]);
      if(!Number.isFinite(a) || !Number.isFinite(b) || a===b)continue;
      rows.push(`${d.label} · ${formatLabel}: ${baseLabel} ${WEIGHT_LABELS[a]||a} → ${targetLabel} ${WEIGHT_LABELS[b]||b}.`);
    }
  }
  return rows;
}

function renderDifferenceSummary(rows,emptyText){
  if(!rows.length)return `<div class="response-difference no-difference"><strong>No material selection or emphasis differences.</strong><span>${esc(emptyText||'The two responses line up on the structured choices.')}</span></div>`;
  return `<div class="response-difference">
    <strong>How this differs from the Philosophy Lead's original response</strong>
    <ul>${rows.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
  </div>`;
}

function renderSubmittedContributionReview(responses,pMap){
  const leadId=workshop?.philosophy_lead_user_id;
  const leadResponse=(responses||[]).find(r=>r.user_id===leadId)||null;
  const ordered=[
    ...(leadResponse?[leadResponse]:[]),
    ...(responses||[]).filter(r=>r.user_id!==leadId)
  ];

  return `<section class="card submitted-contributions-card" style="margin-top:16px">
    <div class="section-label">Submitted responses</div>
    <h2>What did each person say?</h2>
    <div class="help">These are the submitted responses used in this How We Bat comparison. Open a full response to see that person's selections, notes and format priorities.</div>
    <div class="submitted-contribution-list">${ordered.map(r=>{
      const name=r.display_name||pMap.get(r.user_id)?.display_name||'Contributor';
      const isLead=r.user_id===leadId;
      const when=r.submitted_at?new Date(r.submitted_at).toLocaleString():'';
      const diffs=!isLead && leadResponse
        ?responseDifferenceRows(leadResponse,r,isPhilosophyLead()?'Your original':"Philosophy Lead's original",name)
        :[];
      return `<article class="submitted-contribution-card ${isLead?'lead-source':''}">
        <div class="submitted-contribution-head">
          <div><strong>${esc(name)}${isLead?' · Philosophy Lead':''}</strong><span>${isLead?'Original response / comparison baseline':'Independent response'}${when?` · ${esc(when)}`:''}</span></div>
          <span class="response-included-pill">Included</span>
        </div>
        ${isLead
          ?'<div class="response-difference baseline"><strong>Comparison baseline</strong><span>Other contributors are compared with this original independent response — not with the editable final draft.</span></div>'
          :renderDifferenceSummary(diffs,`${name}'s structured selections and emphasis match the Philosophy Lead's original response.`)}
        <details class="submitted-response-detail">
          <summary>View full response</summary>
          ${renderLateResponseDetail(r)}
        </details>
      </article>`;
    }).join('')}</div>
  </section>`;
}

function currentWorkingPhilosophyResponse(){
  return {
    identity_values:clubProfile.identity_values||[],
    identity_note:clubProfile.identity_note||'',
    formats_enabled:clubProfile.formats_enabled||{},
    selected_dimensions:[...selectedDims.keys()],
    dimension_notes:Object.fromEntries([...selectedDims.entries()].map(([k,v])=>[k,v?.club_note||''])),
    format_weights:Object.fromEntries(weights)
  };
}


function scenarioResponsePool(baseResponses,lateActions,pMap){
  const byUser=new Map();
  for(const r of baseResponses||[]){
    if(r?.user_id)byUser.set(r.user_id,{...r,display_name:r.display_name||pMap.get(r.user_id)?.display_name||'Contributor'});
  }
  const orderedLate=[...(lateActions||[])].sort((a,b)=>new Date(a.submitted_at||0)-new Date(b.submitted_at||0));
  for(const a of orderedLate){
    if(!a?.user_id || !a?.response_snapshot)continue;
    byUser.set(a.user_id,{
      ...a.response_snapshot,
      user_id:a.user_id,
      submitted_at:a.submitted_at||a.response_snapshot.submitted_at,
      display_name:pMap.get(a.user_id)?.display_name||a.response_snapshot.display_name||'Contributor'
    });
  }
  return [...byUser.values()];
}

function ensurePhilosophyScenarioSelection(responses,defaultIds=[]){
  const validIds=(responses||[]).map(r=>r.user_id).filter(Boolean);
  const leadId=workshop?.philosophy_lead_user_id;
  const stateKey=`${club?.id||''}:${validIds.slice().sort().join(',')}:${workshop?.final_draft_started_at||'live'}`;
  if(philosophyScenarioStateKey!==stateKey){
    philosophyScenarioStateKey=stateKey;
    let persisted=[];
    if(workshop?.final_draft_ready){
      try{persisted=JSON.parse(sessionStorage.getItem(`bdp-philosophy-working-voices:${club?.id||''}`)||'[]');}catch(e){persisted=[];}
    }
    const seed=(Array.isArray(persisted)&&persisted.length)?persisted:(defaultIds||[]);
    philosophyScenarioSelectedIds=new Set(seed.filter(id=>validIds.includes(id)));
    if(!philosophyScenarioSelectedIds.size && leadId && validIds.includes(leadId))philosophyScenarioSelectedIds.add(leadId);
    if(!philosophyScenarioSelectedIds.size && validIds[0])philosophyScenarioSelectedIds.add(validIds[0]);
  }
  for(const id of [...philosophyScenarioSelectedIds])if(!validIds.includes(id))philosophyScenarioSelectedIds.delete(id);
  if(leadId && validIds.includes(leadId))philosophyScenarioSelectedIds.add(leadId);
}

function selectedScenarioResponses(responses){
  return (responses||[]).filter(r=>philosophyScenarioSelectedIds.has(r.user_id));
}

function scenarioHowWeBatChanges(baseDraft,scenarioDraft){
  const rows=[];
  if((baseDraft?.identity_statement||'')!==(scenarioDraft?.identity_statement||'')){
    rows.push('The club-wide identity statement changes.');
  }
  for(const [format,label] of FORMATS){
    const base=(baseDraft?.formats?.[format]?.banners||[]).map(x=>x.key);
    const next=(scenarioDraft?.formats?.[format]?.banners||[]).map(x=>x.key);
    if(!base.length && !next.length)continue;
    if(base.join('|')===next.join('|'))continue;
    const added=next.filter(k=>!base.includes(k)).map(k=>HOW_WE_BAT_BANNERS[k]?.title||k);
    const removed=base.filter(k=>!next.includes(k)).map(k=>HOW_WE_BAT_BANNERS[k]?.title||k);
    if(added.length && removed.length)rows.push(`${label}: ${naturalList(added)} replaces ${naturalList(removed)} in the Key Messages.`);
    else if(added.length)rows.push(`${label}: ${naturalList(added)} enters the Key Messages.`);
    else if(removed.length)rows.push(`${label}: ${naturalList(removed)} drops out of the Key Messages.`);
    else rows.push(`${label}: the same Key Messages remain, but their order changes.`);
  }
  return rows;
}

async function rerenderWorkshopKeepScroll(){
  const y=window.scrollY;
  await renderWorkshop();
  requestAnimationFrame(()=>window.scrollTo(0,y));
}

async function resetHowWeBatDraftFromCurrentPhilosophy(){
  if(!isPhilosophyLead() || !workshop?.final_draft_ready){
    alert('A Philosophy Lead working philosophy is required before How We Bat can be reset.');
    return;
  }

  const ok=confirm(
    `Reset the editable How We Bat draft?\n\n`+
    `This will regenerate How We Bat from the current working philosophy.\n\n`+
    `• Published How We Bat versions stay live and unchanged.\n`+
    `• Contributor responses and the selected synthesis stay unchanged.\n`+
    `• Manual edits in the current How We Bat draft will be replaced.\n`+
    `• Player Plan Structure will need review again.`
  );
  if(!ok)return;

  const fresh=generatedHowWeBatDraftFromPhilosophy(currentWorkingPhilosophyResponse());
  const btn=document.getElementById('resetHowWeBatDraft');
  if(btn){btn.disabled=true;btn.textContent='Resetting…';}

  const {error}=await supabase.rpc('save_how_we_bat_draft',{
    p_club_id:club.id,
    p_identity_statement:fresh.identity_statement||'',
    p_closing_strapline:fresh.closing_strapline||'',
    p_formats:fresh.formats||{},
    p_status:'draft'
  });
  if(error){
    alert(error.message);
    if(btn){btn.disabled=false;btn.textContent='Reset How We Bat draft';}
    return;
  }

  await loadData();
  currentTab='howwebat';
  renderShell();
}

async function startNewPhilosophyRound(){
  if(!isAdmin()&&!isPhilosophyLead())return;
  const targetClubId=club.id;
  if(!await saveClubEditsBeforeNavigation())return;
  if(club?.id!==targetClubId||(!isAdmin()&&!isPhilosophyLead()))return;
  const btn=document.getElementById('startNewPhilosophyRound');
  if(btn?.disabled)return;
  const publishedNote=philosophyVersions.length
    ?`The currently published Club Batting System will stay live until you deliberately publish a replacement.\n\n`
    :'';
  const ok=confirm(
    `Start a completely new Batting Philosophy Workshop round?\n\n`+
    publishedNote+
    `This will:\n`+
    `• archive the current workshop responses and working state\n`+
    `• clear the current editable Philosophy / How We Bat / Player Plan Structure drafts\n`+
    `• keep all published versions unchanged\n`+
    `• return the current contributor list to a fresh invited state so you can keep, remove or add people before they respond again\n\n`+
    `Your club details, players and Playing Groups stay in place. You can choose a new Philosophy Lead and contributors, then work through How We Bat and Player Plan Structure in order before publishing the replacement.`
  );
  if(!ok)return;

  if(btn){btn.disabled=true;btn.textContent='Starting new round…';}

  let newRoundStarted=false;
  let resetResponseReceived=false;
  try{
    const {error}=await supabase.rpc('start_new_philosophy_round',{p_club_id:targetClubId});
    resetResponseReceived=true;
    if(error)throw error;
    newRoundStarted=true;
    sessionStorage.removeItem(`bdp-philosophy-working-voices:${targetClubId}`);
    if(club?.id!==targetClubId)return;
    philosophyScenarioSelectedIds=new Set();
    philosophyScenarioStateKey='';
    await loadData();
    currentTab='workshop';
    renderShell();
  }catch(error){
    if(!resetResponseReceived){
      if(btn)btn.textContent='Refresh to check the workshop';
      alert('We couldn’t confirm whether the new round started. Refresh the page to check the workshop before trying again.');
    }else if(newRoundStarted){
      if(btn)btn.textContent='New round started — refresh to continue';
      alert('Your new philosophy round was started, but its details could not be loaded. Refresh the page to continue; you do not need to start another round.');
    }else{
      alert(error.message||'The new philosophy round could not be started. Please try again.');
      if(btn){btn.disabled=false;btn.textContent='Start a new philosophy round';}
    }
  }
}

function openScenarioHowWeBatPreview(responses,pMap){
  const selected=selectedScenarioResponses(responses);
  const leadId=workshop?.philosophy_lead_user_id;
  const leadResponse=(responses||[]).find(r=>r.user_id===leadId)||(responses||[])[0]||null;
  const safeSelected=selected.length?selected:(leadResponse?[leadResponse]:[]);
  if(!safeSelected.length){alert('There is no submitted response available to preview yet.');return;}

  const draft=generatedHowWeBatDraftFromPhilosophy(buildScenarioDraft(safeSelected));
  const formats=FORMATS.filter(([f])=>draft.formats?.[f]);
  if(!formats.length){alert('This combination does not currently produce a How We Bat preview.');return;}

  const names=safeSelected.map(r=>r.display_name||pMap.get(r.user_id)?.display_name||'Contributor');
  const shortNames=names.map(name=>(name||'Contributor').trim().split(/\s+/)[0]||'Contributor');
  const scenarioLabel=shortNames.join(' + ');
  const title=`How We Bat — ${scenarioLabel}`;
  const styleAssets=[...document.head.querySelectorAll('link[rel="stylesheet"],style')].map(n=>n.outerHTML).join('\n');
  const tabButtons=formats.map(([f,label],i)=>`<button type="button" data-clean-hwb-tab="${esc(f)}" class="${i===0?'active':''}">${esc(label)}</button>`).join('');
  const panels=formats.map(([f],i)=>`<div data-clean-hwb-panel="${esc(f)}" style="${i===0?'':'display:none'}">${renderHowWeBatLivePreview(draft,f,false)}</div>`).join('');

  const win=window.open('','_blank');
  if(!win){alert('Your browser blocked the preview tab. Allow pop-ups for this site, then try again.');return;}

  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${styleAssets}<style>
    html,body{margin:0;padding:0;background:#f7f8fb;}
    body{min-height:100vh;}
    .clean-hwb-shell{max-width:980px;margin:0 auto;padding:18px 16px 48px;}
    .clean-hwb-preview-head{position:sticky;top:0;z-index:20;padding:10px 0 12px;background:#f7f8fb;}
    .clean-hwb-scenario-label{display:inline-flex;align-items:center;gap:6px;margin:0 0 8px;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid #dfe4ef;color:#59627a;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;box-shadow:0 1px 2px rgba(20,32,80,.04);}
    .clean-hwb-scenario-label strong{color:#18245f;letter-spacing:0;text-transform:none;font-size:13px;}
    .clean-hwb-format-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0;}
    .clean-hwb-format-tabs button{border:0;border-radius:999px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer;background:#e9edf7;color:#18245f;}
    .clean-hwb-format-tabs button.active{background:#203588;color:#fff;}
    .clean-hwb-shell .hwb-publication-preview .hwb-public-tabs{display:none!important;}
    .clean-hwb-shell .hwb-publication-preview{margin:0;}
    @media(max-width:700px){.clean-hwb-shell{padding:8px 8px 32px}.clean-hwb-preview-head{padding-top:8px}}
  </style></head><body><main class="clean-hwb-shell"><div class="clean-hwb-preview-head"><div class="clean-hwb-scenario-label">Comparison preview <span>·</span> <strong>${esc(scenarioLabel)}</strong></div><div class="clean-hwb-format-tabs">${tabButtons}</div></div>${panels}</main><script>
    document.querySelectorAll('[data-clean-hwb-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      const format=btn.dataset.cleanHwbTab;
      document.querySelectorAll('[data-clean-hwb-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      document.querySelectorAll('[data-clean-hwb-panel]').forEach(panel=>panel.style.display=panel.dataset.cleanHwbPanel===format?'':'none');
      window.scrollTo({top:0,left:0,behavior:'instant'});
    }));
  <\/script></body></html>`);
  win.document.close();
}

function renderDetailedSynthesisBody(responses,pMap){
  const syn=buildSynthesis(responses);
  return `<div class="scenario-detail-body">
    <div class="help">This is the underlying response analysis. It is here for anyone who wants to inspect the mechanics; it is not intended to be the main decision-making view.</div>
    <h3>Club identity</h3>
    <div class="consensus-grid">${syn.identity.filter(x=>x.ratio>=.35).map(x=>`
      <div class="consensus-item ${x.cls}"><div><strong>${esc(x.itemLabel)}</strong><small>${x.count} of ${syn.n} selected this</small></div><span>${esc(x.consensusLabel)}</span></div>`).join('')}</div>
    <h3>What belongs in the batting system</h3>
    <div class="consensus-grid">${syn.dims.filter(x=>x.ratio>=.35).map(x=>`
      <div class="consensus-item ${x.cls}"><div><strong>${esc(x.itemLabel)}</strong><small>${x.count} of ${syn.n} selected this</small></div><span>${esc(x.consensusLabel)}</span></div>`).join('')}</div>
    <h3>Format emphasis</h3>
    <div class="synthesis-table-wrap"><table class="synthesis-table"><thead><tr><th>Dimension</th><th>Format</th><th>Typical emphasis</th><th>Spread</th><th></th></tr></thead><tbody>${syn.weightRows.map(x=>`
      <tr class="${x.cls}"><td>${esc(x.dimension)}</td><td>${esc(x.formatLabel)}</td><td>${esc(WEIGHT_LABELS[x.median])}</td><td>${esc(WEIGHT_LABELS[x.min])}${x.min!==x.max?` → ${esc(WEIGHT_LABELS[x.max])}`:''}</td><td><span class="consensus-badge ${x.cls}">${esc(x.consensusLabel)}</span></td></tr>`).join('')}</tbody></table></div>
    ${syn.flags.length?`<h3>Discussion prompts</h3><div class="discussion-list">${syn.flags.map(x=>`<div class="discussion-flag">⚑ ${esc(x)}</div>`).join('')}</div>`:''}
    ${renderSourceComments(responses,pMap)}
  </div>`;
}

function renderVoiceScenarioExplorer(responses,pMap,allSubmitted,meta=null){
  const leadId=workshop?.philosophy_lead_user_id;
  const leadResponse=(responses||[]).find(r=>r.user_id===leadId)||(responses||[])[0]||null;
  if(!leadResponse)return `<section class="card workshop-stage-card" style="margin-top:16px"><div class="section-label">3 · Compare How We Bat options</div><h2>The Philosophy Lead needs to submit their response.</h2><div class="help">The submitted response provides the starting point for How We Bat.</div></section>`;

  const selected=selectedScenarioResponses(responses);
  const safeSelected=selected.length?selected:[leadResponse];
  const scenarioPhilosophy=buildScenarioDraft(safeSelected);
  const baselinePhilosophy=buildScenarioDraft([leadResponse]);
  const scenarioHwb=generatedHowWeBatDraftFromPhilosophy(scenarioPhilosophy);
  const baselineHwb=generatedHowWeBatDraftFromPhilosophy(baselinePhilosophy);
  const changes=scenarioHowWeBatChanges(baselineHwb,scenarioHwb);
  const otherResponses=(responses||[]).filter(r=>r.user_id!==leadResponse.user_id);
  const displayName=r=>r.display_name||pMap.get(r.user_id)?.display_name||'Contributor';
  const shortName=r=>(displayName(r)||'Contributor').trim().split(/\s+/)[0]||'Contributor';
  const leadShort=shortName(leadResponse);

  // Scenario buttons replace the old duplicate checkbox + preset controls.
  // With a small contributor group, show every combination so the Lead can
  // visually compare David, David + Bryce, David + Mitch, David + Bryce + Mitch, etc.
  const presets=[{label:`${leadShort} only`,ids:[leadResponse.user_id]}];
  if(otherResponses.length<=3){
    const count=1<<otherResponses.length;
    for(let mask=1;mask<count;mask++){
      const chosen=otherResponses.filter((_,i)=>mask&(1<<i));
      presets.push({
        label:[leadShort,...chosen.map(shortName)].join(' + '),
        ids:[leadResponse.user_id,...chosen.map(r=>r.user_id)]
      });
    }
  }else{
    for(const r of otherResponses){
      presets.push({label:`${leadShort} + ${shortName(r)}`,ids:[leadResponse.user_id,r.user_id]});
    }
    presets.push({label:`${leadShort} + all voices`,ids:[leadResponse.user_id,...otherResponses.map(r=>r.user_id)]});
  }

  const selectedIds=new Set(safeSelected.map(r=>r.user_id));
  const sameIds=ids=>ids.length===selectedIds.size&&ids.every(id=>selectedIds.has(id));
  const currentLabel=(presets.find(p=>sameIds(p.ids))?.label)||safeSelected.map(shortName).join(' + ');
  const baselineOnly=safeSelected.length===1;
  const hwbLocked=howWeBatDraft?.status==='ready';

  return `<section class="card synthesis workshop-stage-card" style="margin-top:16px">
    <div class="section-label">3 · Compare How We Bat options</div>
    <h2>Which How We Bat feels most like the club?</h2>
    <div class="help">Choose a combination, then open its How We Bat preview in a new tab. ${hwbLocked?'These previews do not change the locked How We Bat.':isPhilosophyLead()?'Compare the options, then choose “Use this to create How We Bat” when you are ready.':'The Philosophy Lead chooses which option to use for the club.'}</div>

    <div class="btnrow" style="margin-top:16px">
      ${presets.map(p=>`<button class="btn ${sameIds(p.ids)?'secondary':'ghost'}" data-scenario-preset="${esc(p.ids.join(','))}">${esc(p.label)}</button>`).join('')}
    </div>

    ${hwbLocked?`<div class="help" style="margin-top:10px">🔒 How We Bat is locked. These comparisons remain available for reference.</div>`:(meta?.snapshot?`<div class="help" style="margin-top:10px">A How We Bat draft exists. The Philosophy Lead can choose another combination until it is locked.</div>`:'')}

    <div class="btnrow" style="margin-top:18px">
      <button class="btn ghost" id="openScenarioHwbPreview">Open ${esc(currentLabel)} How We Bat ↗</button>
      ${!baselineOnly?`<button class="btn ghost" id="showScenarioChanges">What changed?</button>`:''}
      ${isPhilosophyLead()&&!hwbLocked?`<button class="btn secondary" id="useVoiceScenario">Use this to create How We Bat</button>`:''}
    </div>

    ${!baselineOnly?`<dialog id="scenarioChangesDialog" style="max-width:620px;width:calc(100% - 32px);border:0;border-radius:16px;padding:0;box-shadow:0 20px 60px rgba(20,32,80,.25)">
      <div style="padding:22px 24px">
        <div class="section-label">Optional detail</div>
        <h2 style="margin:4px 0 10px">What changed from ${esc(leadShort)} only?</h2>
        ${changes.length
          ?`<ul style="margin:0;padding-left:22px">${changes.slice(0,6).map(x=>`<li style="margin:7px 0">${esc(x)}</li>`).join('')}</ul>`
          :'<div class="help">The player-facing How We Bat stays visually the same. These voices reinforce the existing message rather than redirecting it.</div>'}
        <div class="btnrow" style="margin-top:18px"><button class="btn secondary" id="closeScenarioChanges">Close</button></div>
      </div>
    </dialog>`:''}

    <details class="source-responses" style="margin-top:18px">
      <summary>Detailed response data</summary>
      ${renderDetailedSynthesisBody(safeSelected,pMap)}
      ${renderSubmittedContributionReview(safeSelected,pMap)}
    </details>
  </section>`;
}

async function applySelectedVoiceScenario(responses,pMap){
  if(!confirmLeaveWorkshopSetup())return;
  const selected=selectedScenarioResponses(responses);
  if(!selected.length){alert('Select at least the Philosophy Lead response.');return;}
  const leadId=workshop?.philosophy_lead_user_id;
  if(!selected.some(r=>r.user_id===leadId)){alert('The Philosophy Lead baseline must remain part of the scenario.');return;}

  const names=selected.map(r=>r.display_name||pMap.get(r.user_id)?.display_name||'Contributor');
  const draft=buildScenarioDraft(selected);
  const hwb=generatedHowWeBatDraftFromPhilosophy(draft);

  if(howWeBatDraft?.status==='ready'){
    alert('How We Bat is locked for this season. To replace it, start a new philosophy round from Workshop settings.');
    return;
  }

  // Before the season lock, a different scenario can replace the current working draft.
  if(workshop?.final_draft_ready && howWeBatDraft){
    const ok=confirm(
      `Replace the current How We Bat draft using ${naturalList(names)}?\n\n`+
      `This keeps every submitted response unchanged, but it will regenerate the editable How We Bat draft from this combination of voices.`
    );
    if(!ok)return;
  }

  if(!workshop?.final_draft_ready){
    const {error}=await supabase.rpc('begin_final_philosophy_draft',{
      p_club_id:club.id,
      p_identity_values:draft.identity_values,
      p_identity_note:draft.identity_note,
      p_formats_enabled:draft.formats_enabled,
      p_selected_dimensions:draft.selected_dimensions,
      p_dimension_notes:draft.dimension_notes,
      p_format_weights:draft.format_weights
    });
    if(error){alert(error.message);return;}
  }else{
    const {error}=await supabase
      .from('philosophy_contributions')
      .update({
        identity_values:draft.identity_values,
        identity_note:draft.identity_note,
        formats_enabled:draft.formats_enabled,
        selected_dimensions:draft.selected_dimensions,
        dimension_notes:draft.dimension_notes,
        format_weights:draft.format_weights,
        submitted_at:null,
        updated_at:new Date().toISOString()
      })
      .eq('club_id',club.id)
      .eq('user_id',leadId);
    if(error){alert(error.message);return;}
  }

  sessionStorage.setItem(`bdp-philosophy-working-voices:${club.id}`,JSON.stringify(selected.map(r=>r.user_id)));

  const {error:hErr}=await supabase.rpc('save_how_we_bat_draft',{
    p_club_id:club.id,
    p_identity_statement:hwb.identity_statement||'',
    p_closing_strapline:hwb.closing_strapline||'',
    p_formats:hwb.formats||{},
    p_status:'draft'
  });
  if(hErr){alert(hErr.message);return;}

  await loadData();
  currentTab='howwebat';
  renderShell();
}

function renderSynthesis(responses,pMap,allSubmitted,meta=null){
  return renderVoiceScenarioExplorer(responses,pMap,allSubmitted,meta);
}


function renderSourceComments(responses,pMap){
  const items=[];
  for(const r of responses){
    const name=r.display_name||pMap.get(r.user_id)?.display_name||'Contributor';
    if(r.identity_note)items.push(`<div class="source-comment"><strong>${esc(name)} · Club Identity</strong><p>${esc(r.identity_note)}</p></div>`);
    const notes=r.dimension_notes||{};
    for(const [k,note] of Object.entries(notes)){
      if(!note)continue;
      const label=dimensions.find(d=>d.dimension_key===k)?.label||k;
      items.push(`<div class="source-comment"><strong>${esc(name)} · ${esc(label)}</strong><p>${esc(note)}</p></div>`);
    }
  }
  if(!items.length)return '';
  return `<details class="source-responses"><summary>View source comments</summary><div class="source-comments">${items.join('')}</div></details>`;
}

function renderLateResponseDetail(response){
  const r=response||{};
  const identities=(r.identity_values||[])
    .map(k=>IDENTITY_OPTIONS.find(([key])=>key===k)?.[1]||k);

  const dims=(r.selected_dimensions||[]).map(k=>{
    const label=dimensions.find(d=>d.dimension_key===k)?.label||k;
    const weights=FORMATS
      .filter(([f])=>r.formats_enabled?.[f]!==false)
      .map(([f,fl])=>{
        const raw=Number(r.format_weights?.[`${k}:${f}`]);
        return Number.isFinite(raw)?`${fl}: ${WEIGHT_LABELS[raw]||raw}`:null;
      })
      .filter(Boolean)
      .join(' · ');
    const note=r.dimension_notes?.[k];
    return `<div class="late-detail-dimension">
      <strong>${esc(label)}</strong>
      ${weights?`<span>${esc(weights)}</span>`:''}
      ${note?`<p>${esc(note)}</p>`:''}
    </div>`;
  }).join('');

  const formats=FORMATS
    .filter(([f])=>r.formats_enabled?.[f]!==false)
    .map(([,fl])=>fl);

  return `<div class="late-response-detail-grid">
    <div>
      <div class="section-label">Club identity</div>
      <p>${identities.length?esc(identities.join(' · ')):'No identity options selected.'}</p>
      ${r.identity_note?`<div class="source-comment"><p>${esc(r.identity_note)}</p></div>`:''}
    </div>
    <div>
      <div class="section-label">Formats</div>
      <p>${formats.length?esc(formats.join(' · ')):'No formats enabled.'}</p>
    </div>
  </div>
  <div class="section-label" style="margin-top:12px">Dimensions + emphasis</div>
  <div class="late-detail-dimensions">${dims||'<div class="help">No dimensions selected.</div>'}</div>`;
}

function renderMySubmittedPhilosophyResponse(response){
  document.getElementById('page').innerHTML=`${buildWorkspaceAudienceNotice()}<section class="card">
    <div class="section-label">Your submitted response</div>
    <h2>Review your philosophy contribution</h2>
    ${response
      ?`<div class="help">Your response is submitted and locked. Here are your identity choices, notes and priorities for each format.</div>${renderLateResponseDetail(response)}`
      :'<div class="notice">Your response could not be loaded. Return to Batting Philosophy Workshop and refresh the page to try again.</div>'}
    <div class="btnrow" style="margin-top:16px"><button class="btn secondary" id="backWorkshop">Return to Batting Philosophy Workshop</button></div>
  </section>`;
  document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
}

function renderLatePhilosophyResponses(actions,pMap){
  const pending=(actions||[]).filter(a=>a.status==='pending');
  const actioned=(actions||[]).filter(a=>a.status!=='pending');

  if(!pending.length){
    if(!actioned.length)return '';
    return `<details class="card late-history-card" style="margin-top:16px">
      <summary>Late-response history</summary>
      <div class="late-contribution-list">${actioned.map(a=>{
        const name=pMap.get(a.user_id)?.display_name||'Contributor';
        return `<div class="late-contribution actioned">
          <div><strong>${esc(name)}</strong><span>${a.status==='incorporated'?'Incorporated into the current synthesis and working draft':'Reviewed · not incorporated'} · ${new Date(a.submitted_at).toLocaleString()}</span></div>
        </div>`;
      }).join('')}</div>
    </details>`;
  }

  return `<section class="card late-contributions-card" style="margin-top:16px">
    <div class="section-label">New contribution</div>
    <h2>Response received after the draft started</h2>
    <div class="help">Review it here, before the synthesis below. It does not alter the current synthesis or working draft unless you explicitly incorporate it.</div>

    <div class="late-contribution-list">${pending.map(a=>{
      const name=pMap.get(a.user_id)?.display_name||'Contributor';
      return `<div class="late-contribution pending">
        <div class="late-contribution-head">
          <div>
            <strong>${esc(name)}</strong>
            <span>Submitted ${new Date(a.submitted_at).toLocaleString()}${a.reviewed_at?' · reviewed':''}</span>
          </div>
          <span class="pending">NEW RESPONSE</span>
        </div>
        <div class="late-contribution-actions">
          <button class="btn ghost" data-review-late="${a.id}">Review contribution</button>
          <button class="btn secondary" data-incorporate-late="${a.id}">Include in synthesis + rebuild draft</button>
          <button class="btn ghost" data-ignore-late="${a.id}">Do not incorporate</button>
        </div>
        <div class="late-response-detail" id="late-detail-${a.id}" style="display:none">
          ${renderLateResponseDetail(a.response_snapshot)}
        </div>
      </div>`;
    }).join('')}</div>

    ${actioned.length?`<details class="late-history">
      <summary>Previously actioned late responses</summary>
      <div class="late-contribution-list">${actioned.map(a=>{
        const name=pMap.get(a.user_id)?.display_name||'Contributor';
        return `<div class="late-contribution actioned">
          <div><strong>${esc(name)}</strong><span>${a.status==='incorporated'?'Incorporated into the current synthesis and working draft':'Reviewed · not incorporated'} · ${new Date(a.submitted_at).toLocaleString()}</span></div>
        </div>`;
      }).join('')}</div>
    </details>`:''}
  </section>`;
}


async function discardFinalDraftAndRestart(){
  const ok=confirm(
    `Discard the current UNPUBLISHED final philosophy draft and How We Bat draft?\n\n`+
    `What WILL be discarded:\n`+
    `• edits made to the current final philosophy draft\n`+
    `• the current unpublished How We Bat draft\n\n`+
    `What WILL be kept:\n`+
    `• every contributor's submitted workshop response\n`+
    `• late responses already submitted\n`+
    `• every published Philosophy / How We Bat version\n\n`+
    `Your own original independent response will be restored from the frozen snapshot. `+
    `You can then create a fresh synthesis using all responses currently submitted.\n\n`+
    `This cannot restore manual edits made only in the discarded draft.`
  );
  if(!ok)return;

  const btn=document.getElementById('discardFinalDraft');
  if(btn){
    btn.disabled=true;
    btn.textContent='Discarding…';
  }

  const {error}=await supabase.rpc('discard_unpublished_philosophy_draft',{
    p_club_id:club.id
  });

  if(error){
    alert(error.message);
    if(btn){
      btn.disabled=false;
      btn.textContent='Discard draft & restart synthesis';
    }
    return;
  }

  await loadData();
  currentTab='workshop';
  renderShell();
}

async function beginFinalDraftFromSynthesis(){
  // Use the same authoritative server-side response set that powers the visible synthesis.
  // This avoids a final draft being built from a different set of rows because of client RLS.
  const {data:source,error}=await supabase.rpc('get_philosophy_synthesis_source',{
    p_club_id:club.id
  });

  if(error){alert(error.message);return;}
  const responses=Array.isArray(source?.responses)?source.responses:[];
  const mismatchCount=Number(source?.mismatch_count||0);

  if(mismatchCount>0){
    alert(
      `The workshop has ${mismatchCount} contributor record${mismatchCount===1?'':'s'} whose submission status does not match the stored response.\n\n`+
      `Club Batting will not create a final draft until that inconsistency is resolved, because doing so could silently leave out a contributor.`
    );
    return;
  }

  if(!responses.length){alert('No submitted responses are available to the synthesis yet.');return;}

  const draft=buildConsensusDraft(responses);
  const ok=confirm(
    `Create the final working draft using the ${responses.length} response${responses.length===1?'':'s'} submitted right now?\n\n`+
    `This creates a snapshot. Any response submitted later will NOT change the draft unless you explicitly choose to incorporate it.`
  );
  if(!ok)return;

  const {error:e}=await supabase.rpc('begin_final_philosophy_draft',{
    p_club_id:club.id,
    p_identity_values:draft.identity_values,
    p_identity_note:draft.identity_note,
    p_formats_enabled:draft.formats_enabled,
    p_selected_dimensions:draft.selected_dimensions,
    p_dimension_notes:draft.dimension_notes,
    p_format_weights:draft.format_weights
  });
  if(e){alert(e.message);return;}

  await loadData();
  currentTab='identity';
  renderShell();
}

async function publishPhilosophy(){
  if(!isPhilosophyLead())return;
  const progress=clubSetupProgress();
  if(!progress.workshopReady||!progress.howWeBatReady||!progress.structureReady||playerPlanStructureDirty){
    alert('Complete the Batting Philosophy Workshop, How We Bat and Player Plan questions before publication.');return;
  }
  if(!progress.detailsReady){
    alert('Ask your Club Admin to review the club look from Club Home before publication. They can keep the current look.');return;
  }
  const firstPublish=philosophyVersions.length===0;

  const ok=confirm(firstPublish
    ?`Publish How We Bat and open Player Plans for ${club.name}?\n\n`+
      `Players will be able to read How We Bat and start answering their Player Plan questions. An email will be queued automatically for everyone already registered as a player, including those who also coach or captain.\n\n`+
      `Publish and notify players?`
    :`Publish the updated How We Bat and Player Plan questions for ${club.name}?\n\n`+
      `This replaces the currently published club system. An email will be queued automatically for everyone already registered as a player, including those who also coach or captain.\n\n`+
      `Publish and notify players?`);
  if(!ok)return;

  const publishButton=document.getElementById('publishClubSystem');
  const publishStatus=document.getElementById('publishClubSystemStatus');

  if(publishButton){
    publishButton.disabled=true;
    publishButton.textContent='Publishing…';
  }
  if(publishStatus)publishStatus.textContent='Finalising the release…';

  // The Lead's independent response was converted into the editable final draft
  // when synthesis began. If that working draft has not yet been re-submitted,
  // finalise it here rather than forcing the Lead backwards through earlier pages.
  if(myContributor?.status!=='submitted'){
    const {error:submitError}=await supabase.rpc('submit_my_philosophy_response',{
      p_club_id:club.id
    });

    if(submitError){
      if(publishButton){
        publishButton.disabled=false;
        publishButton.textContent='Publish & notify players';
      }
      if(publishStatus)publishStatus.textContent=submitError.message;
      return;
    }
  }

  const {data,error}=await supabase.rpc('publish_philosophy',{
    p_club_id:club.id,
    p_notify_players:true
  });

  if(error){
    if(publishButton){
      publishButton.disabled=false;
      publishButton.textContent='Publish & notify players';
    }
    if(publishStatus)publishStatus.textContent=error.message;
    return;
  }

  alert(`Club Batting System v${data} is live. Players can read How We Bat and open My Player Plan. Notification emails are queued for registered players.`);

  await loadData();
  currentTab='howwebat';
  renderShell();
}

/* ---------------- CLUB PHILOSOPHY RESPONSE ---------------- */

/* ---------------- CLUB PHILOSOPHY ---------------- */


function identitySummary(){
  const chosen=IDENTITY_OPTIONS.filter(([k])=>(clubProfile.identity_values||[]).includes(k)).map(([,l])=>l.toLowerCase());
  if(!chosen.length)return 'Choose the ideas that should remain true regardless of format.';
  return `Across formats, ${club.name} wants batters who ${naturalList(chosen)}.`;
}

async function goBackInPhilosophyResponse(target){
  const previous=({identity:'workshop',dimensions:'identity',formats:'dimensions',preview:'formats'})[currentTab];
  if(target!==previous)return;
  const fromTab=currentTab;
  const fromClub=club.id;
  const fromUser=session.user.id;
  if(!await saveClubEditsBeforeNavigation())return;
  if(currentTab!==fromTab||club?.id!==fromClub||session?.user?.id!==fromUser)return;
  currentTab=target;
  renderTab();
}

function renderIdentity(){
  if(!myContribution){
    document.getElementById('page').innerHTML=`<div class="card"><h2>Start your philosophy response first.</h2>
      <div class="help">Go to Batting Philosophy Workshop and choose “Start my response”.</div>
      <div class="btnrow"><button class="btn secondary" id="backWorkshop">Go to Batting Philosophy Workshop</button></div></div>`;
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
    return;
  }

  const locked=contributionLocked();
  document.getElementById('page').innerHTML=`${buildWorkspaceAudienceNotice()}${locked?'<div class="submitted-banner">✓ Independent response submitted. It is locked so the group synthesis cannot influence your original answers.</div>':''}
  <div class="grid">
    <section class="card">
      <div class="section-label">What should survive every format?</div>
      <h2>Club batting identity</h2>
      <div class="help">Choose everything that feels genuinely true of your club. Format-specific priorities come later.</div>
      <div class="choice-grid">${IDENTITY_OPTIONS.map(([k,l,d])=>`
        <label class="choice ${(clubProfile.identity_values||[]).includes(k)?'on':''}">
          <input type="checkbox" data-identity="${k}" ${(clubProfile.identity_values||[]).includes(k)?'checked':''} ${locked?'disabled':''}>
          <strong>${esc(l)}</strong><p>${esc(d)}</p>
        </label>`).join('')}</div>
      <div class="field"><label>Anything these choices don’t capture? (optional)</label>
        <textarea id="identityNote" placeholder="Add nuance in your own words…" ${locked?'disabled':''}>${esc(clubProfile.identity_note||'')}</textarea>
      </div>
    </section>
    <section class="card">
      <div class="section-label">Formats your club plays</div>
      <h2>Which versions of the game matter here?</h2>
      <div class="formats">${FORMATS.map(([k,l])=>`
        <label class="format-chip"><input type="checkbox" data-format="${k}" ${clubProfile.formats_enabled?.[k]!==false?'checked':''} ${locked?'disabled':''}>${l}</label>`).join('')}
      </div>
      <div class="identity-summary"><div class="title">What we’re hearing</div><p id="identitySummary">${esc(identitySummary())}</p></div>
      <div id="identityError" class="notice" style="display:none;background:#fff0f0;color:#9f1d1d;border:1px solid #efb8b8"></div>
      <div class="btnrow">
        ${locked
          ?'<button class="btn secondary" id="backWorkshop">Return to Batting Philosophy Workshop</button>'
          :'<button class="btn secondary" id="saveIdentity">Save & continue</button><button type="button" class="btn ghost" id="responseBack">Back to Workshop</button><span class="status" id="identityStatus"></span>'}
      </div>
    </section>
  </div>`;

  if(locked){
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
    return;
  }
  document.getElementById('responseBack').onclick=()=>goBackInPhilosophyResponse('workshop');

  document.querySelectorAll('[data-identity]').forEach(x=>x.onchange=()=>{
    x.closest('.choice').classList.toggle('on',x.checked);
    collectIdentity(false);
    document.getElementById('identitySummary').textContent=identitySummary();
  });

  document.getElementById('saveIdentity').onclick=async()=>{
    const btn=document.getElementById('saveIdentity');
    const err=document.getElementById('identityError');
    collectIdentity(true);
    btn.disabled=true;
    btn.textContent='Saving…';
    err.style.display='none';
    err.textContent='';
    const ok=await saveClubProfile('identityStatus');
    if(ok){
      btn.textContent='Saved ✓';
      setTimeout(()=>{currentTab='dimensions';renderTab();},300);
    }else{
      btn.disabled=false;
      btn.textContent='Save & continue';
    }
  };
}

function collectIdentity(withNote=true){
  clubProfile.identity_values=[...document.querySelectorAll('[data-identity]:checked')].map(x=>x.dataset.identity);
  clubProfile.formats_enabled=Object.fromEntries(FORMATS.map(([k])=>[k,!!document.querySelector(`[data-format="${k}"]`)?.checked]));
  if(withNote)clubProfile.identity_note=val('identityNote');
}

async function saveClubProfile(statusId){
  const s=document.getElementById(statusId);
  const errBox=document.getElementById('identityError');
  if(s)s.textContent='Saving…';

  const payload={
    identity_values:clubProfile.identity_values||[],
    identity_note:clubProfile.identity_note||'',
    formats_enabled:clubProfile.formats_enabled||{t20:true,limited_overs:true,long_form:true},
    updated_at:new Date().toISOString()
  };

  const {data,error}=await supabase
    .from('philosophy_contributions')
    .update(payload)
    .eq('club_id',club.id)
    .eq('user_id',session.user.id)
    .select('*')
    .single();

  if(error){
    if(s)s.textContent='';
    if(errBox){
      errBox.style.display='block';
      errBox.innerHTML=`<strong>Couldn’t save yet.</strong><br>${esc(error.message)}<br><br>Nothing has been lost.`;
    }
    return false;
  }

  myContribution=data;
  if(workshop?.final_draft_ready && isPhilosophyLead() && howWeBatDraft)howWeBatDraft.status='draft';
  if(s)s.textContent='Saved';
  return true;
}

function renderDimensions(){
  if(!myContribution){currentTab='workshop';renderTab();return;}
  const locked=contributionLocked();

  document.getElementById('page').innerHTML=`${buildWorkspaceAudienceNotice()}${locked?'<div class="submitted-banner">✓ Independent response submitted and locked.</div>':''}
  <div class="grid">
    <section class="card">
      <div class="section-label">Stimulus, not a prescription</div>
      <h2>Which ideas belong in your batting system?</h2>
      <div class="help">Select broadly. You are not ranking them here.</div>
      <div class="dimension-list">${dimensions.map(d=>{
        const on=selectedDims.has(d.dimension_key);
        return `<label class="dimension ${on?'on':''}">
          <input type="checkbox" data-dim="${d.dimension_key}" ${on?'checked':''} ${locked?'disabled':''}>
          <div><strong>${esc(d.label)}</strong><p>${esc(d.description)}</p>
          <div class="stimulus"><strong>Think about:</strong> ${esc(d.stimulus)}</div></div>
        </label>`;
      }).join('')}</div>
    </section>
    <section class="card">
      <div class="section-label">Optional nuance</div>
      <h2>React first. Explain only where useful.</h2>
      <div class="help">Only write where your club has something specific to add.</div>
      <div id="dimensionNotes"></div>
      <div class="btnrow">
        ${locked
          ?'<button class="btn secondary" id="backWorkshop">Return to Batting Philosophy Workshop</button>'
          :'<button class="btn secondary" id="saveDims">Save & set format emphasis</button><button type="button" class="btn ghost" id="responseBack">Back to Club Identity</button><span class="status" id="dimStatus"></span>'}
      </div>
    </section>
  </div>`;

  if(!locked){
    document.querySelectorAll('[data-dim]').forEach(x=>x.onchange=()=>{
      x.closest('.dimension').classList.toggle('on',x.checked);
      renderDimensionNotes();
    });
  }
  renderDimensionNotes();

  if(locked){
    document.querySelectorAll('[data-dim-note]').forEach(x=>x.disabled=true);
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
  }else{
    document.getElementById('saveDims').onclick=saveDimensions;
    document.getElementById('responseBack').onclick=()=>goBackInPhilosophyResponse('identity');
  }
}

function renderDimensionNotes(){
  // Keep typed notes while another idea is selected or deselected. The page is
  // rebuilt below; reading only saved values here would silently discard edits.
  document.querySelectorAll('[data-dim-note]').forEach(input=>{
    const key=input.dataset.dimNote;
    selectedDims.set(key,{...(selectedDims.get(key)||{}),club_note:input.value});
  });
  const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
  const locked=contributionLocked();
  document.getElementById('dimensionNotes').innerHTML=keys.length?keys.map(k=>{
    const d=dimensions.find(x=>x.dimension_key===k);
    const note=selectedDims.get(k)?.club_note||'';
    return `<div class="field"><label>${esc(d.label)} — anything specific? (optional)</label>
      <textarea data-dim-note="${k}" placeholder="Leave blank if the selections already say enough…" ${locked?'disabled':''}>${esc(note)}</textarea></div>`;
  }).join(''):'<div class="notice">Select an idea to add an optional note about it.</div>';
}

async function saveDimensions(){
  const s=document.getElementById('dimStatus');
  s.textContent='Saving…';
  const keys=[...document.querySelectorAll('[data-dim]:checked')].map(x=>x.dataset.dim);
  const notes={};
  for(const k of keys){
    notes[k]=document.querySelector(`[data-dim-note="${k}"]`)?.value.trim()||'';
  }

  selectedDims=new Map(keys.map(k=>[
    k,
    {club_id:club.id,dimension_key:k,enabled:true,club_note:notes[k]||''}
  ]));
  initialiseMissingWeights();

  const payload={
    selected_dimensions:keys,
    dimension_notes:notes,
    format_weights:Object.fromEntries(weights),
    updated_at:new Date().toISOString()
  };

  const {data,error}=await supabase
    .from('philosophy_contributions')
    .update(payload)
    .eq('club_id',club.id)
    .eq('user_id',session.user.id)
    .select('*')
    .single();

  if(error){s.textContent=error.message;return;}

  myContribution=data;
  if(workshop?.final_draft_ready && isPhilosophyLead() && howWeBatDraft)howWeBatDraft.status='draft';
  s.textContent='Saved';
  currentTab='formats';
  renderTab();
}

function initialiseMissingWeights(){
  for(const k of selectedDims.keys()){
    for(const [f] of FORMATS){
      const key=`${k}:${f}`;
      if(!weights.has(key))weights.set(key,DEFAULT_WEIGHTS[k]?.[f]??2);
    }
  }
}

function enabledFormats(){
  return FORMATS.filter(([k])=>clubProfile.formats_enabled?.[k]!==false);
}

function publishedEnabledFormats(){
  return FORMATS.filter(([k])=>publishedProfile.formats_enabled?.[k]!==false);
}

function renderFormats(){
  if(!myContribution){currentTab='workshop';renderTab();return;}
  initialiseMissingWeights();
  const formats=enabledFormats();
  const locked=contributionLocked();

  document.getElementById('page').innerHTML=`${buildWorkspaceAudienceNotice()}${locked?'<div class="submitted-banner">✓ Independent response submitted and locked.</div>':''}
  <div class="card">
    <div class="section-label">When does each thing matter most?</div>
    <h2>Format emphasis</h2>
    <div class="help">Nothing is globally ranked. Set the emphasis for each selected dimension in each format.</div>
    ${formats.length?`<div class="matrix-wrap"><table class="matrix"><thead><tr><th>Batting dimension</th>${formats.map(([,l])=>`<th>${l}</th>`).join('')}</tr></thead><tbody>
      ${[...selectedDims.keys()].map(k=>{
        const d=dimensions.find(x=>x.dimension_key===k);
        return `<tr><td class="dimname">${esc(d?.label||k)}</td>${formats.map(([f])=>`
          <td><select class="weight" data-weight-key="${k}:${f}" ${locked?'disabled':''}>
            ${WEIGHT_LABELS.map((l,i)=>`<option value="${i}" ${Number(weights.get(`${k}:${f}`)??2)===i?'selected':''}>${l}</option>`).join('')}
          </select></td>`).join('')}</tr>`;
      }).join('')}
    </tbody></table></div>`:'<div class="notice">No formats are enabled.</div>'}
    <div class="btnrow">
      ${locked
        ?'<button class="btn secondary" id="backWorkshop">Return to Batting Philosophy Workshop</button>'
        :'<button class="btn secondary" id="saveWeights">Save & review response</button><button type="button" class="btn ghost" id="responseBack">Back to What We Value</button><span class="status" id="weightStatus"></span>'}
    </div>
  </div>`;

  if(locked){
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
  }else{
    document.getElementById('responseBack').onclick=()=>goBackInPhilosophyResponse('dimensions');
    document.getElementById('saveWeights').onclick=async()=>{
      document.querySelectorAll('[data-weight-key]').forEach(x=>weights.set(x.dataset.weightKey,Number(x.value)));
      const ok=await saveWeights('weightStatus');
      if(ok){currentTab='preview';renderTab();}
    };
  }
}

async function saveWeights(statusId){
  const s=statusId?document.getElementById(statusId):null;
  if(s)s.textContent='Saving…';

  const payload={
    format_weights:Object.fromEntries(weights),
    updated_at:new Date().toISOString()
  };

  const {data,error}=await supabase
    .from('philosophy_contributions')
    .update(payload)
    .eq('club_id',club.id)
    .eq('user_id',session.user.id)
    .select('*')
    .single();

  if(error){if(s)s.textContent=error.message;return false;}
  myContribution=data;
  if(workshop?.final_draft_ready && isPhilosophyLead() && howWeBatDraft)howWeBatDraft.status='draft';
  if(s)s.textContent='Saved';
  return true;
}

function topEmphasisFrom(format,dimsMap,weightMap){
  return [...dimsMap.keys()]
    .map(k=>({
      key:k,
      weight:Number(weightMap.get(`${k}:${format}`)??0),
      d:dimensions.find(x=>x.dimension_key===k)
    }))
    .filter(x=>x.weight>0)
    .sort((a,b)=>b.weight-a.weight||(a.d?.sort_order||999)-(b.d?.sort_order||999));
}

function topEmphasis(format){
  return topEmphasisFrom(format,selectedDims,weights);
}

function publishedTopEmphasis(format){
  return topEmphasisFrom(format,publishedSelectedDims,publishedWeights);
}

function identitySummaryFor(profile){
  const chosen=IDENTITY_OPTIONS
    .filter(([k])=>(profile?.identity_values||[]).includes(k))
    .map(([,l])=>l.toLowerCase());
  if(!chosen.length)return `${club.name} wants batters to understand their game, read the situation and make strong decisions.`;
  return `Across formats, ${club.name} wants batters who ${naturalList(chosen)}.`;
}

function howWeBatBannerCandidates(format){
  const identityValues=new Set(clubProfile.identity_values||[]);
  const rows=[];

  for(const [key,spec] of Object.entries(HOW_WE_BAT_BANNERS)){
    let score=0;
    let highCount=0;
    let veryHighCount=0;
    const support=[];

    for(const [dimKey,coefficient] of Object.entries(spec.dimensions||{})){
      if(!selectedDims.has(dimKey))continue;
      const weight=Number(weights.get(`${dimKey}:${format}`)??0);
      if(weight<=0)continue;
      score+=weight*coefficient;
      if(coefficient>=.55 && weight>=3)highCount++;
      if(coefficient>=.55 && weight===4)veryHighCount++;
      if(weight>=2 && coefficient>=.3){
        support.push({
          key:dimKey,
          label:dimensions.find(d=>d.dimension_key===dimKey)?.label||dimKey,
          weight,
          coefficient
        });
      }
    }

    for(const [identityKey,boost] of Object.entries(spec.identity||{})){
      if(identityValues.has(identityKey))score+=boost;
    }

    // Reinforcement is deliberate: several related High / Very High dimensions
    // should beat one isolated Very High dimension.
    if(highCount>=2)score+=(highCount-1)*1.65;
    if(veryHighCount>=2)score+=(veryHighCount-1)*.8;

    // A banner supported by only one real dimension is possible, but it should
    // have to work much harder than a coherent cluster.
    if(support.length===1)score*=.72;

    // Phase language should not dominate long-form unless the club genuinely
    // weighted those phase dimensions strongly.
    if(key==='use_phase' && format==='long_form')score*=.72;

    if(score<=0)continue;
    support.sort((a,b)=>b.weight-a.weight||b.coefficient-a.coefficient||a.label.localeCompare(b.label));
    rows.push({
      key,
      title:spec.title,
      message:spec.messages?.[format]||'',
      score:Number(score.toFixed(2)),
      highCount,
      veryHighCount,
      support
    });
  }

  // Initial score order, then apply a modest overlap penalty so three banners
  // do not all win because of the same shared dimension.
  const remaining=rows.sort((a,b)=>b.score-a.score);
  const ordered=[];
  const alreadyUsed=new Set();
  while(remaining.length){
    let bestIndex=0;
    let bestAdjusted=-Infinity;
    for(let i=0;i<remaining.length;i++){
      const row=remaining[i];
      const overlap=row.support.filter(x=>x.coefficient>=.55 && alreadyUsed.has(x.key)).length;
      const adjusted=row.score-(overlap*1.15);
      if(adjusted>bestAdjusted){bestAdjusted=adjusted;bestIndex=i;}
    }
    const [chosen]=remaining.splice(bestIndex,1);
    chosen.adjustedScore=Number(bestAdjusted.toFixed(2));
    ordered.push(chosen);
    chosen.support.filter(x=>x.coefficient>=.55).forEach(x=>alreadyUsed.add(x.key));
  }
  return ordered;
}

function howWeBatStrength(row){
  if(row.highCount>=4 || row.adjustedScore>=15)return 'Very strongly reinforced';
  if(row.highCount>=3 || row.adjustedScore>=11)return 'Strongly reinforced';
  if(row.highCount>=2 || row.adjustedScore>=7)return 'Reinforced';
  return 'Single-theme signal';
}

function generatedHowWeBatFormat(format){
  const candidates=howWeBatBannerCandidates(format);
  const banners=candidates.slice(0,Math.min(3,candidates.length)).map(x=>({
    key:x.key,
    title:x.title,
    message:x.message,
    supporting_dimensions:x.support.map(y=>({key:y.key,label:y.label,weight:y.weight})),
    reference_points:generatedBannerReference(x.key,format),
    score:x.adjustedScore,
    strength:howWeBatStrength(x)
  }));
  const copy=HOW_WE_BAT_FORMAT_COPY[format]||HOW_WE_BAT_FORMAT_COPY.limited_overs;
  return {intro:copy.intro,callout:copy.callout,banners};
}

function generatedHowWeBatDraft(){
  const formats={};
  for(const [format] of enabledFormats())formats[format]=generatedHowWeBatFormat(format);
  const identity=identitySummaryFor(clubProfile)+(clubProfile.identity_note?` ${clubProfile.identity_note}`:'');

  const aggregate={};
  for(const [format] of enabledFormats()){
    for(const row of howWeBatBannerCandidates(format).slice(0,4)){
      aggregate[row.key]=(aggregate[row.key]||0)+row.adjustedScore;
    }
  }
  const strap=Object.entries(aggregate)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,3)
    .map(([k])=>HOW_WE_BAT_BANNERS[k]?.title)
    .filter(Boolean)
    .join(' · ');

  return {
    club_id:club.id,
    identity_statement:identity,
    closing_strapline:strap,
    formats,
    status:'draft'
  };
}

function enabledFormatsForProfile(profile){
  return FORMATS.filter(([k])=>profile?.formats_enabled?.[k]!==false);
}

function howWeBatBannerCandidatesFor(format,profile,dimsMap,weightMap){
  const identityValues=new Set(profile?.identity_values||[]);
  const rows=[];

  for(const [key,spec] of Object.entries(HOW_WE_BAT_BANNERS)){
    let score=0;
    let highCount=0;
    let veryHighCount=0;
    const support=[];

    for(const [dimKey,coefficient] of Object.entries(spec.dimensions||{})){
      if(!dimsMap.has(dimKey))continue;
      const weight=Number(weightMap.get(`${dimKey}:${format}`)??0);
      if(weight<=0)continue;
      score+=weight*coefficient;
      if(coefficient>=.55 && weight>=3)highCount++;
      if(coefficient>=.55 && weight===4)veryHighCount++;
      if(weight>=2 && coefficient>=.3){
        support.push({
          key:dimKey,
          label:dimensions.find(d=>d.dimension_key===dimKey)?.label||dimKey,
          weight,
          coefficient
        });
      }
    }

    for(const [identityKey,boost] of Object.entries(spec.identity||{})){
      if(identityValues.has(identityKey))score+=boost;
    }

    if(highCount>=2)score+=(highCount-1)*1.65;
    if(veryHighCount>=2)score+=(veryHighCount-1)*.8;
    if(support.length===1)score*=.72;
    if(key==='use_phase' && format==='long_form')score*=.72;
    if(score<=0)continue;

    support.sort((a,b)=>b.weight-a.weight||b.coefficient-a.coefficient||a.label.localeCompare(b.label));
    rows.push({
      key,title:spec.title,message:spec.messages?.[format]||'',
      score:Number(score.toFixed(2)),highCount,veryHighCount,support
    });
  }

  const remaining=rows.sort((a,b)=>b.score-a.score);
  const ordered=[];
  const alreadyUsed=new Set();
  while(remaining.length){
    let bestIndex=0;
    let bestAdjusted=-Infinity;
    for(let i=0;i<remaining.length;i++){
      const row=remaining[i];
      const overlap=row.support.filter(x=>x.coefficient>=.55 && alreadyUsed.has(x.key)).length;
      const adjusted=row.score-(overlap*1.15);
      if(adjusted>bestAdjusted){bestAdjusted=adjusted;bestIndex=i;}
    }
    const [chosen]=remaining.splice(bestIndex,1);
    chosen.adjustedScore=Number(bestAdjusted.toFixed(2));
    ordered.push(chosen);
    chosen.support.filter(x=>x.coefficient>=.55).forEach(x=>alreadyUsed.add(x.key));
  }
  return ordered;
}

function generatedHowWeBatDraftFromPhilosophy(profileDraft){
  const profile={
    identity_values:profileDraft?.identity_values||[],
    identity_note:profileDraft?.identity_note||'',
    formats_enabled:profileDraft?.formats_enabled||{}
  };
  const dimsMap=new Map((profileDraft?.selected_dimensions||[]).map(k=>[k,{dimension_key:k}]));
  const weightMap=new Map(Object.entries(profileDraft?.format_weights||{}));
  const formats={};

  for(const [format] of enabledFormatsForProfile(profile)){
    const candidates=howWeBatBannerCandidatesFor(format,profile,dimsMap,weightMap);
    const banners=candidates.slice(0,Math.min(3,candidates.length)).map(x=>({
      key:x.key,
      title:x.title,
      message:x.message,
      supporting_dimensions:x.support.map(y=>({key:y.key,label:y.label,weight:y.weight})),
      reference_points:generatedBannerReference(x.key,format),
      score:x.adjustedScore,
      strength:howWeBatStrength(x)
    }));
    const copy=HOW_WE_BAT_FORMAT_COPY[format]||HOW_WE_BAT_FORMAT_COPY.limited_overs;
    formats[format]={intro:copy.intro,callout:copy.callout,banners};
  }

  const identity=identitySummaryFor(profile)+(profile.identity_note?` ${profile.identity_note}`:'');
  const aggregate={};
  for(const [format] of enabledFormatsForProfile(profile)){
    for(const row of howWeBatBannerCandidatesFor(format,profile,dimsMap,weightMap).slice(0,4)){
      aggregate[row.key]=(aggregate[row.key]||0)+row.adjustedScore;
    }
  }
  const strap=Object.entries(aggregate)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,3)
    .map(([k])=>HOW_WE_BAT_BANNERS[k]?.title)
    .filter(Boolean)
    .join(' · ');

  return {club_id:club.id,identity_statement:identity,closing_strapline:strap,formats,status:'draft'};
}


function ensureHowWeBatWorkingDraft(){
  if(!howWeBatDraft){
    howWeBatDraft=generatedHowWeBatDraft();
  }else{
    howWeBatDraft.formats=howWeBatDraft.formats||{};
    for(const [format] of enabledFormats()){
      if(!howWeBatDraft.formats[format])howWeBatDraft.formats[format]=generatedHowWeBatFormat(format);
    }
  }
  return howWeBatDraft;
}

function howWeBatBannerEditorRows(format){
  const draft=ensureHowWeBatWorkingDraft();
  const saved=draft.formats?.[format]?.banners||[];
  const savedMap=new Map(saved.map((x,i)=>[x.key,{...x,order:i}]));
  const candidates=howWeBatBannerCandidates(format);
  const candidateKeys=new Set(candidates.map(x=>x.key));
  for(const existing of saved){
    if(candidateKeys.has(existing.key))continue;
    const spec=HOW_WE_BAT_BANNERS[existing.key]||{};
    candidates.push({
      key:existing.key,
      title:existing.title||spec.title||'CUSTOM BANNER',
      message:existing.message||spec.messages?.[format]||'',
      score:Number(existing.score||0),
      adjustedScore:Number(existing.score||0),
      highCount:0,
      veryHighCount:0,
      support:(existing.supporting_dimensions||[]).map(x=>({...x,coefficient:1}))
    });
  }

  return candidates.map((c,i)=>{
    const existing=savedMap.get(c.key);
    return {
      ...c,
      selected:!!existing,
      order:existing?.order??999+i,
      title:existing?.title||c.title,
      message:existing?.message||c.message,
      supporting_dimensions:existing?.supporting_dimensions||c.support.map(x=>({key:x.key,label:x.label,weight:x.weight})),
      reference_points:Array.isArray(existing?.reference_points)&&existing.reference_points.length
        ?existing.reference_points
        :generatedBannerReference(c.key,format),
      strength:existing?.strength||(existing?'Lead-selected banner':howWeBatStrength(c))
    };
  }).sort((a,b)=>a.order-b.order||b.adjustedScore-a.adjustedScore);
}

function renderHowWeBatBuilder(savedMessage=''){
  const draft=ensureHowWeBatWorkingDraft();
  if(draft.status==='ready'){
    currentTab='howwebat';
    renderPublishedHowWeBat();
    return;
  }
  const formats=enabledFormats();
  if(!formats.some(([k])=>k===howWeBatBuilderFormat))howWeBatBuilderFormat=formats[0]?.[0]||'limited_overs';
  const formatLabel=FORMATS.find(([k])=>k===howWeBatBuilderFormat)?.[1]||'Format';
  const formatDraft=draft.formats[howWeBatBuilderFormat]||generatedHowWeBatFormat(howWeBatBuilderFormat);
  const rows=howWeBatBannerEditorRows(howWeBatBuilderFormat);

  const builderIsReady=draft.status==='ready';

  document.getElementById('page').innerHTML=`<div class="hwb-builder-shell">
    <section class="card hwb-builder-intro">
      <div>
        <div class="section-label">Optional manual control</div>
        <h2>Edit the exact How We Bat wording</h2>
        <div class="help">Review the identity statement and the Key Messages for each format. Save your wording as a draft, or confirm and lock it when the club is ready to build Player Plan Structure.</div>
      </div>
      <div class="hwb-builder-state ${builderIsReady?'ready':'draft'}">
        <strong>${builderIsReady?'HOW WE BAT READY':'WORKING DRAFT'}</strong>
        <span>${builderIsReady?'Player Plan Structure is unlocked.':'2–4 memorable Key Messages per format.'}</span>
      </div>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="section-label">Club-wide identity · appears across your club’s formats</div>
      <div class="field"><label>Opening identity statement</label><textarea id="hwbIdentity" rows="3">${esc(draft.identity_statement||'')}</textarea></div>
      <div class="field"><label>Closing strapline</label><input id="hwbStrap" value="${esc(draft.closing_strapline||'')}" placeholder="e.g. VALUE YOUR WICKET · KEEP IT MOVING · KNOW WHERE YOU SCORE"></div>
    </section>

    <section class="card hwb-format-builder" style="margin-top:16px">
      <div class="format-tabs hwb-tabs">${formats.map(([k,l])=>`<button data-hwb-format="${k}" class="${k===howWeBatBuilderFormat?'active':''}">${esc(l)}</button>`).join('')}</div>
      <div class="hwb-format-heading">
        <div><div class="section-label">${esc(formatLabel)}</div><h2>Choose the banners that carry the message</h2></div>
        <button class="btn ghost" id="regenerateHwbFormat">Regenerate ${esc(formatLabel)} suggestions</button>
      </div>

      <div class="field"><label>Short opening for this format</label><textarea id="hwbFormatIntro" rows="3">${esc(formatDraft.intro||'')}</textarea></div>
      <div class="field"><label>One central callout</label><textarea id="hwbCallout" rows="2">${esc(formatDraft.callout||'')}</textarea></div>

      <div class="hwb-banner-list">
        ${rows.map((row,index)=>`<div class="hwb-banner-editor ${row.selected?'selected':''}" data-hwb-banner-row="${row.key}">
          <div class="hwb-banner-select">
            <label><input type="checkbox" data-hwb-use="${row.key}" ${row.selected?'checked':''}> <strong>Use this banner</strong></label>
            <span class="hwb-strength">${esc(row.strength)}</span>
          </div>
          <div class="field"><label>Banner</label><input data-hwb-title="${row.key}" value="${esc(row.title)}"></div>
          <div class="field"><label>Short player-facing message</label><textarea data-hwb-message="${row.key}" rows="3">${esc(row.message)}</textarea></div>
          <div class="field hwb-reference-editor">
            <label>When a player opens this Key Message</label>
            <div class="help">One useful coaching point per line. This becomes the richer reference layer inside How We Bat and the Player Plan.</div>
            <textarea data-hwb-reference="${row.key}" rows="6">${esc((row.reference_points||[]).join('\n'))}</textarea>
          </div>
          <div class="hwb-evidence">
            <strong>Why it is being prioritised</strong>
            <div>${row.support.map(x=>`<span>${esc(x.label)} · ${esc(WEIGHT_LABELS[x.weight])}</span>`).join('')||'<span>No strong supporting dimension in this format.</span>'}</div>
          </div>
          <div class="hwb-order-actions">
            <button class="btn tiny ghost" data-hwb-up="${row.key}" ${!row.selected?'disabled':''}>↑ Earlier</button>
            <button class="btn tiny ghost" data-hwb-down="${row.key}" ${!row.selected?'disabled':''}>↓ Later</button>
          </div>
        </div>`).join('')}
      </div>

      <div class="notice hwb-rule-note"><strong>Priority rule:</strong> several related High / Very High dimensions strengthen the shared banner. One isolated Very High dimension does not automatically become a headline.</div>

      <div class="btnrow hwb-builder-actions">
        <button class="btn ghost" id="backToHwbView">Save & return to How We Bat</button>
        <button class="btn secondary" id="saveHwbDraft">Save How We Bat draft</button><button class="btn secondary" id="readyHwbDraft">Confirm How We Bat</button>
        <span class="status" id="hwbStatus" aria-live="polite">${howWeBatBuilderDirty?'Unsaved changes':esc(savedMessage)}</span>
      </div>
    </section>

    ${renderHowWeBatLivePreview(draft,howWeBatBuilderFormat,true)}
  </div>`;

  document.querySelectorAll('[data-hwb-format]').forEach(b=>b.onclick=()=>{
    collectHowWeBatBuilderPage();
    howWeBatBuilderFormat=b.dataset.hwbFormat;
    renderHowWeBatBuilder();
  });

  document.querySelectorAll('[data-hwb-use]').forEach(cb=>cb.onchange=()=>{
    const checked=[...document.querySelectorAll('[data-hwb-use]:checked')];
    if(checked.length>4){cb.checked=false;alert('Keep How We Bat to a maximum of four banners in each format.');}
    collectHowWeBatBuilderPage();
    howWeBatBuilderDirty=true;
    renderHowWeBatBuilder();
  });

  document.querySelectorAll('[data-hwb-up]').forEach(b=>b.onclick=()=>moveHowWeBatBanner(b.dataset.hwbUp,-1));
  document.querySelectorAll('[data-hwb-down]').forEach(b=>b.onclick=()=>moveHowWeBatBanner(b.dataset.hwbDown,1));

  document.getElementById('regenerateHwbFormat').onclick=()=>{
    const ok=confirm(`Regenerate the ${formatLabel} suggestions from the current final philosophy? Any edits to this format's banners and wording will be replaced.`);
    if(!ok)return;
    collectHowWeBatBuilderPage();
    howWeBatDraft.formats[howWeBatBuilderFormat]=generatedHowWeBatFormat(howWeBatBuilderFormat);
    howWeBatDraft.status='draft';
    howWeBatBuilderDirty=true;
    renderHowWeBatBuilder();
  };

  const markHwbDirty=()=>{
    howWeBatBuilderDirty=true;
    const save=document.getElementById('saveHwbDraft');
    const st=document.getElementById('hwbStatus');
    if(save){
      save.disabled=false;
      save.textContent='Save How We Bat draft';
    }
    if(st && howWeBatDraft?.status!=='ready')st.textContent='Unsaved changes';
  };

  document.querySelectorAll('#hwbIdentity,#hwbStrap,#hwbFormatIntro,#hwbCallout,[data-hwb-title],[data-hwb-message],[data-hwb-reference]')
    .forEach(el=>el.addEventListener('input',markHwbDirty));

  if(document.getElementById('backToHwbView')){
    document.getElementById('backToHwbView').onclick=async()=>{
      if(!await saveHowWeBatBuilder('draft'))return;
      currentTab='howwebat';renderTab();
    };
  }
  if(document.getElementById('saveHwbDraft')){
    document.getElementById('saveHwbDraft').onclick=()=>saveHowWeBatBuilder('draft');
  }
  if(document.getElementById('readyHwbDraft')){
    document.getElementById('readyHwbDraft').onclick=()=>saveHowWeBatBuilder('ready');
  }
}

function collectHowWeBatBuilderPage(){
  const draft=ensureHowWeBatWorkingDraft();
  const identity=document.getElementById('hwbIdentity');
  const strap=document.getElementById('hwbStrap');
  if(identity)draft.identity_statement=identity.value.trim();
  if(strap)draft.closing_strapline=strap.value.trim();

  const intro=document.getElementById('hwbFormatIntro');
  const callout=document.getElementById('hwbCallout');
  if(!intro || !callout)return draft;

  const rows=howWeBatBannerEditorRows(howWeBatBuilderFormat);
  const rowMap=new Map(rows.map(x=>[x.key,x]));
  const selected=[...document.querySelectorAll('[data-hwb-use]:checked')].map(x=>x.dataset.hwbUse);
  const existingOrder=(draft.formats?.[howWeBatBuilderFormat]?.banners||[]).map(x=>x.key);
  selected.sort((a,b)=>{
    const ai=existingOrder.indexOf(a),bi=existingOrder.indexOf(b);
    if(ai>=0||bi>=0)return (ai<0?999:ai)-(bi<0?999:bi);
    return rows.findIndex(x=>x.key===a)-rows.findIndex(x=>x.key===b);
  });

  draft.formats[howWeBatBuilderFormat]={
    intro:intro.value.trim(),
    callout:callout.value.trim(),
    banners:selected.map(key=>{
      const base=rowMap.get(key);
      return {
        key,
        title:document.querySelector(`[data-hwb-title="${key}"]`)?.value.trim()||base?.title||'',
        message:document.querySelector(`[data-hwb-message="${key}"]`)?.value.trim()||base?.message||'',
        reference_points:(document.querySelector(`[data-hwb-reference="${key}"]`)?.value||'')
          .split(/\n+/).map(x=>x.trim()).filter(Boolean),
        supporting_dimensions:(base?.support||[]).map(x=>({key:x.key,label:x.label,weight:x.weight})),
        score:base?.adjustedScore??base?.score??0,
        strength:howWeBatStrength(base||{highCount:0,adjustedScore:0})
      };
    })
  };
  return draft;
}

function moveHowWeBatBanner(key,direction){
  collectHowWeBatBuilderPage();
  const banners=howWeBatDraft.formats[howWeBatBuilderFormat].banners||[];
  const i=banners.findIndex(x=>x.key===key);
  if(i<0)return;
  const j=i+direction;
  if(j<0||j>=banners.length)return;
  [banners[i],banners[j]]=[banners[j],banners[i]];
  howWeBatBuilderDirty=true;
  renderHowWeBatBuilder();
}

async function saveHowWeBatBeforeNavigation(){
  if(!document.getElementById('hwbIdentity'))return true;
  if(howWeBatBuilderSaving)return false;
  if(howWeBatDraft?.status==='ready')return true;
  return !howWeBatBuilderDirty || await saveHowWeBatBuilder('draft');
}

async function saveHowWeBatBuilder(status){
  if(!isPhilosophyLead() || howWeBatBuilderSaving || howWeBatDraft?.status==='ready')return false;
  const st=document.getElementById('hwbStatus');
  collectHowWeBatBuilderPage();
  const draft=ensureHowWeBatWorkingDraft();

  if(status==='ready'){
    for(const [format,label] of enabledFormats()){
      const f=draft.formats?.[format];
      if(!f || !f.intro || !f.callout || (f.banners||[]).length<2 || (f.banners||[]).length>4){
        st.textContent=`Review ${label}: it needs an opening, callout and 2–4 banners.`;
        return false;
      }
      if((f.banners||[]).some(x=>!x.title||!x.message)){
        st.textContent=`Review ${label}: every selected banner needs a title and message.`;
        return false;
      }
      if((f.banners||[]).some(x=>!Array.isArray(x.reference_points)||x.reference_points.length<2)){
        st.textContent=`Review ${label}: every Key Message needs at least two useful reference points.`;
        return false;
      }
    }
    if(!draft.identity_statement){st.textContent='Add the club-wide identity statement first.';return false;}

    const ok=confirm(
      `Lock How We Bat for the season?\n\n`+
      `This confirms the club's How We Bat and unlocks Player Plan Structure. Once locked, the wording cannot be reopened for routine editing.\n\n`+
      `Only a new Batting Philosophy Workshop round can replace it, because changing How We Bat changes the foundation used for Player Plans.\n\n`+
      `Lock How We Bat and continue?`
    );
    if(!ok)return false;
  }

  howWeBatBuilderSaving=true;
  const controls=[...document.querySelectorAll('.hwb-builder-shell input,.hwb-builder-shell textarea,.hwb-builder-shell button')].map(element=>({element,disabled:element.disabled}));
  controls.forEach(({element})=>element.disabled=true);
  let persisted=false;
  try{
  st.textContent=status==='ready'?'Saving How We Bat…':'Saving…';
  const {error}=await supabase.rpc('save_how_we_bat_draft',{
    p_club_id:club.id,
    p_identity_statement:draft.identity_statement||'',
    p_closing_strapline:draft.closing_strapline||'',
    p_formats:draft.formats||{},
    p_status:status
  });
  if(error){st.textContent=`Your changes could not be saved. ${error.message} Please try again before leaving.`;return false;}

  persisted=true;
  draft.status=status;
  await loadData();

  if(status==='ready'){
    currentTab='plan';
    renderShell();
  }else{
    renderHowWeBatBuilder('Draft saved ✓');
  }
  return true;
  }catch(error){
    if(persisted && status==='ready'){
      howWeBatBuilderDirty=false;
      currentTab='howwebat';
      renderPublishedHowWeBat();
      alert('How We Bat was locked successfully. The other club data could not refresh; refresh the page before continuing to Player Plan Structure.');
      return false;
    }
    if(st)st.textContent=persisted
      ?`Your changes were saved, but the page could not refresh. Your wording is still here. Please refresh to load the saved version. ${error.message||''}`
      :`Your changes could not be saved. ${error.message||'Check your connection and try again.'}`;
    return false;
  }finally{
    howWeBatBuilderSaving=false;
    controls.forEach(({element,disabled})=>element.disabled=disabled);
  }
}


function renderKeyMessageReferenceCard(b,index,context='hwb',format=null){
  const savedPoints=Array.isArray(b.reference_points)
    ?b.reference_points.filter(Boolean)
    :[];

  // Backwards compatibility for older published How We Bat versions that
  // pre-date the richer reference layer. Use the platform reference content
  // for the same Key Message and format without changing the stored snapshot.
  const fallbackPoints=(!savedPoints.length && b.key && format)
    ?generatedBannerReference(b.key,format)
    :[];

  const points=savedPoints.length?savedPoints:fallbackPoints;

  // Keep the player-facing palette disciplined: Key Message 1 uses THIS club's
  // saved primary brand colour; subsequent messages stay clean and white.
  // The CSS variables are populated by applyClubTheme(), so this is never tied to
  // Newcastle City's navy (and --navy-contrast keeps the feature card readable).
  const cardClass=`hwb-public-banner ${index===0?'feature':''} ${context==='plan'?'plan-reference':''}`;
  const cardStyle=index===0
    ?' style="background:var(--navy);border-color:var(--navy);color:var(--navy-contrast)"'
    :'';

  // A genuinely custom Key Message may have no deeper reference material.
  // In that case, render a normal card rather than an empty expandable panel.
  if(!points.length){
    return `<div class="${cardClass}"${cardStyle}>
      <div class="hwb-static-message">
        <span>Key message ${index+1}</span>
        <h3>${esc(b.title||'')}</h3>
        <p>${esc(b.message||'')}</p>
      </div>
    </div>`;
  }

  return `<details class="${cardClass}"${cardStyle}>
    <summary>
      <span>Key message ${index+1}</span>
      <h3>${esc(b.title||'')}</h3>
      <p>${esc(b.message||'')}</p>
      <em><span class="key-message-open">Open key message ↓</span><span class="key-message-close">Close key message ↑</span></em>
    </summary>
    <div class="hwb-banner-expanded">
      <div class="section-label">What this means in your batting</div>
      <ul>${points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>
    </div>
  </details>`;
}

function renderHowWeBatLivePreview(draft,format,isBuilder=false){
  const f=draft.formats?.[format];
  if(!f)return '';
  const label=FORMATS.find(([k])=>k===format)?.[1]||format;
  return `<section class="hwb-publication-preview ${isBuilder?'builder-preview':''}">
    <div class="hwb-public-hero" style="padding:24px 38px 22px;min-height:0">
      <div class="k" style="margin-bottom:6px">${esc(club.name)}</div>
      <h2 style="margin:0 0 8px;font-size:clamp(32px,4vw,42px);line-height:1.02">How We Bat</h2>
      <p style="margin:0;line-height:1.42;max-width:920px">${esc(draft.identity_statement||'')}</p>
    </div>
    <div class="hwb-public-tabs"><button class="active">${esc(label)}</button></div>
    <div class="hwb-public-body">
      <p class="hwb-public-intro">${esc(f.intro||'')}</p>
      <div class="hwb-public-banner-grid">${(f.banners||[]).map((b,i)=>renderKeyMessageReferenceCard(b,i,'hwb',format)).join('')}</div>
      <div class="hwb-public-callout">${esc(f.callout||'')}</div>
    </div>
    ${draft.closing_strapline?`<div class="hwb-public-footer"><strong>${esc(draft.closing_strapline)}</strong></div>`:''}
  </section>`;
}

async function lockCurrentHowWeBat(){
  if(!isPhilosophyLead() || !howWeBatDraft || howWeBatDraft.status==='ready')return;
  const draft=howWeBatDraft;

  for(const [format,label] of enabledFormats()){
    const f=draft.formats?.[format];
    if(!f || !f.intro || !f.callout || (f.banners||[]).length<2 || (f.banners||[]).length>4){
      alert(`Review ${label}: it needs an opening, callout and 2–4 banners before How We Bat can be locked.`);
      return;
    }
    if((f.banners||[]).some(x=>!x.title||!x.message)){
      alert(`Review ${label}: every selected banner needs a title and message before How We Bat can be locked.`);
      return;
    }
    if((f.banners||[]).some(x=>!Array.isArray(x.reference_points)||x.reference_points.length<2)){
      alert(`Review ${label}: every Key Message needs at least two useful reference points before How We Bat can be locked.`);
      return;
    }
  }
  if(!draft.identity_statement){alert('Add the club-wide identity statement before How We Bat can be locked.');return;}

  const ok=confirm(
    `Lock How We Bat for the season?\n\n`+
    `This confirms the club's position and unlocks Player Plan Structure. Once locked, How We Bat cannot be reopened for routine editing.\n\n`+
    `That is deliberate: Player Plan prompts flow from How We Bat. A different How We Bat requires a new Batting Philosophy Workshop round.\n\n`+
    `Lock How We Bat and continue?`
  );
  if(!ok)return;

  const btn=document.getElementById('lockHwbFromView');
  if(btn){btn.disabled=true;btn.textContent='Locking…';}

  const {error}=await supabase.rpc('save_how_we_bat_draft',{
    p_club_id:club.id,
    p_identity_statement:draft.identity_statement||'',
    p_closing_strapline:draft.closing_strapline||'',
    p_formats:draft.formats||{},
    p_status:'ready'
  });
  if(error){alert(error.message);if(btn){btn.disabled=false;btn.textContent='Confirm How We Bat';}return;}

  await loadData();
  currentTab='plan';
  renderShell();
}

function renderPublishedHowWeBat(){
  const canSeeWorking=(isPhilosophyLead() || isAdmin()) && !!howWeBatDraft && clubSetupProgress().workshopReady;
  const version=howWeBatVersions[0]||null;
  const snap=canSeeWorking ? howWeBatDraft : (version?.snapshot||null);

  if(!snap){
    const canOpenWorkshop=isPhilosophyLead() || isAdmin();
    const nextStep=isPhilosophyLead()
      ?(myContributor?.status==='submitted' || workshop?.final_draft_ready
        ?'Open Batting Philosophy Workshop to compare the submitted contributions. Choose a combination, then select “Use this to create How We Bat”.'
        :'Start with your own response in Batting Philosophy Workshop. Submit it, then compare the contributions and create the club’s How We Bat.')
      :isAdmin()
        ?(workshop?.philosophy_lead_user_id
          ?'Your Philosophy Lead creates and finalises How We Bat. Open Batting Philosophy Workshop to manage contributors and check progress.'
          :'Open Batting Philosophy Workshop to choose a Philosophy Lead and save the workshop setup. The lead will create and finalise the club’s How We Bat.')
        :'Your Philosophy Lead is preparing the club’s batting approach. It will appear here when the Club Batting System is published.';
    clubSetupContentPage('howwebat').innerHTML=`<section class="card player-gate">
      <div class="section-label">How We Bat</div>
      <h2 style="font-size:clamp(22px,3vw,28px);line-height:1.25">Your club has not finalised its How We Bat yet.</h2>
      <p>${nextStep}</p>
      ${canOpenWorkshop?'<div class="btnrow" style="margin-top:14px"><button class="btn secondary" id="openPhilosophyForHwb">Open Batting Philosophy Workshop</button><button class="btn ghost" id="emptyHowWeBatGuide">Show me how</button></div>':'<div class="btnrow" style="margin-top:14px"><button class="btn ghost" id="emptyHowWeBatGuide">What is How We Bat?</button></div>'}
    </section>`;
    if(document.getElementById('openPhilosophyForHwb'))document.getElementById('openPhilosophyForHwb').onclick=()=>{currentTab='workshop';renderTab();};
    if(document.getElementById('emptyHowWeBatGuide'))document.getElementById('emptyHowWeBatGuide').onclick=()=>openClubBattingGuideTopic('how_we_bat');
    return;
  }

  const formats=FORMATS.filter(([k])=>snap.formats?.[k]);
  if(!formats.some(([k])=>k===publishedHowWeBatFormat))publishedHowWeBatFormat=formats[0]?.[0]||'limited_overs';
  const f=snap.formats?.[publishedHowWeBatFormat];
  const formatLabel=FORMATS.find(([k])=>k===publishedHowWeBatFormat)?.[1]||'';
  const workingReady=canSeeWorking && snap.status==='ready';
  const publishedComparison=version?.snapshot?upgradeLegacyHowWeBatWording(structuredClone(version.snapshot)):null;
  const workingPublished=workingReady && workshop?.status==='published' && !!version
    && snap.identity_statement===publishedComparison?.identity_statement
    && snap.closing_strapline===publishedComparison?.closing_strapline
    && JSON.stringify(snap.formats||{})===JSON.stringify(publishedComparison?.formats||{});

  clubSetupContentPage('howwebat').innerHTML=`<div class="hwb-published-shell">
    <div class="guide-context-bar"><span><strong>How We Bat</strong> · The club framework players can actually use.</span><button type="button" class="btn ghost compact-btn" id="howWeBatGuideLink">${canSeeWorking?'Show me how':'How this fits together'}</button></div>
    ${canSeeWorking?`<div class="published-version-note">${workingPublished?'Published How We Bat · locked for the season':workingReady?'Locked draft · ready for Player Plan Structure':'Working draft · review before locking'}</div>`:''}
    <section class="hwb-publication-preview ${canSeeWorking?'working':'published'}">
      <div class="hwb-public-hero" style="padding:24px 38px 22px;min-height:0">
        <div class="k" style="margin-bottom:6px">${esc(club.name)}</div>
        <h2 style="margin:0 0 8px;font-size:clamp(32px,4vw,42px);line-height:1.02">How We Bat</h2>
        <p style="margin:0;line-height:1.42;max-width:920px">${esc(snap.identity_statement||'')}</p>
      </div>
      <div class="hwb-public-tabs">${formats.map(([k,l])=>`<button data-public-hwb-format="${k}" class="${k===publishedHowWeBatFormat?'active':''}">${esc(l)}</button>`).join('')}</div>
      <div class="hwb-public-body">
        <div class="section-label">${esc(formatLabel)}</div>
        <p class="hwb-public-intro">${esc(f?.intro||'')}</p>
        <div class="hwb-public-banner-grid">${(f?.banners||[]).map((b,i)=>renderKeyMessageReferenceCard(b,i,'hwb',publishedHowWeBatFormat)).join('')}</div>
        <div class="hwb-public-callout">${esc(f?.callout||'')}</div>
      </div>
      ${snap.closing_strapline?`<div class="hwb-public-footer"><strong>${esc(snap.closing_strapline)}</strong>${canSeeWorking?'':'<span>Know your game. Then read the moment.</span>'}</div>`:''}
    </section>
    ${canSeeWorking?(workingReady
      ?`<div class="notice compact" style="margin-top:14px"><strong>${workingPublished?'How We Bat is published for players.':'How We Bat is locked. Next: Player Plan Structure.'}</strong><br>${workingPublished?'This is the club’s batting approach for the season. Players can read it in How We Bat and use it while building their Player Plans.':`${isPhilosophyLead()?'Review and lock the Player Plan Structure, then select “Publish & notify players”. This opens Player Plans and queues an email for registered players.':'The Philosophy Lead will review and lock Player Plan Structure, then publish it and notify registered players.'} ${version?'Players continue to see the previously published version until then.':'This draft is not visible to players yet.'}`}</div><div class="btnrow" style="margin-top:10px"><button class="btn secondary" id="continueLockedHwb">${workingPublished?'View Player Plan Structure':'Open Player Plan Structure'}</button></div>`
      :isPhilosophyLead()
        ?`<div class="notice compact" style="margin-top:14px"><strong>Review and finalise How We Bat.</strong><br>Check each format and make any wording changes, then confirm the club’s approach for the season. Next, review the Player Plan questions and publish the Club Batting System for players.</div><div class="btnrow" style="margin-top:10px"><button class="btn ghost" id="openExactHwbEditor">Edit exact wording</button><button class="btn secondary" id="lockHwbFromView">Confirm How We Bat</button></div>`
        :`<div class="notice compact" style="margin-top:14px"><strong>Your Philosophy Lead will finalise this draft.</strong><br>You can review each format here. The lead will lock How We Bat, review Player Plan Structure and publish the Club Batting System for players.</div>`):''}
    ${!canSeeWorking && version?`<div class="published-version-note">Published with Club Philosophy v${esc(version.philosophy_version)} · ${new Date(version.published_at).toLocaleDateString()}</div>`:''}
  </div>`;

  if(document.getElementById('howWeBatGuideLink'))document.getElementById('howWeBatGuideLink').onclick=()=>openClubBattingGuideTopic('how_we_bat');
  document.querySelectorAll('[data-public-hwb-format]').forEach(b=>b.onclick=()=>{
    publishedHowWeBatFormat=b.dataset.publicHwbFormat;
    renderPublishedHowWeBat();
  });
  if(document.getElementById('openExactHwbEditor')){
    document.getElementById('openExactHwbEditor').onclick=()=>{
      currentTab='preview';
      renderTab();
    };
  }
  if(document.getElementById('lockHwbFromView')){
    document.getElementById('lockHwbFromView').onclick=lockCurrentHowWeBat;
  }
  if(document.getElementById('continueLockedHwb')){
    document.getElementById('continueLockedHwb').onclick=()=>{currentTab='plan';renderTab();};
  }
}

function formatNarrative(format){
  const top=topEmphasis(format);
  if(!top.length)return 'This format has not yet been given any specific emphasis.';
  const very=top.filter(x=>x.weight===4).map(x=>x.d.label.toLowerCase());
  const high=top.filter(x=>x.weight===3).map(x=>x.d.label.toLowerCase());
  const low=top.filter(x=>x.weight===1).map(x=>x.d.label.toLowerCase());
  let text='';
  if(very.length)text+=`In this format, ${naturalList(very)} ${very.length===1?'is':'are'} central to the way we want to bat. `;
  if(high.length)text+=`${naturalList(high)} ${high.length===1?'is':'are'} also strongly emphasised. `;
  if(low.length)text+=`${naturalList(low)} ${low.length===1?'remains':'remain'} part of the system, but with lower emphasis here.`;
  return text.trim();
}

function renderPreview(){
  if(isPhilosophyLead() && workshop?.final_draft_ready){
    renderHowWeBatBuilder();
    return;
  }
  if(!myContribution){currentTab='workshop';renderTab();return;}
  const formats=enabledFormats();
  if(!formats.some(([k])=>k===previewFormat))previewFormat=formats[0]?.[0]||'limited_overs';
  const identity=identitySummary()+(clubProfile.identity_note?` ${clubProfile.identity_note}`:'');
  const locked=contributionLocked();

  document.getElementById('page').innerHTML=`${buildWorkspaceAudienceNotice()}${locked?'<div class="submitted-banner">✓ This is your locked independent response.</div>':''}
  <div class="grid">
    <section><div class="preview">
      <div class="preview-head"><div class="k">${esc(club.name)}</div><h2>How We Bat</h2><div style="font-size:11px;line-height:1.5;opacity:.9">${esc(identity)}</div></div>
      <div class="preview-section"><h3>Our identity</h3><p>${esc(identity)}</p></div>
      <div class="preview-section">
        <div class="format-tabs">${formats.map(([k,l])=>`<button data-preview-format="${k}" class="${k===previewFormat?'active':''}">${l}</button>`).join('')}</div>
        <h3>${esc(FORMATS.find(([k])=>k===previewFormat)?.[1]||'Format')} expression</h3>
        <p>${esc(formatNarrative(previewFormat))}</p>
        <div class="emphasis">${topEmphasis(previewFormat).slice(0,8).map(x=>`
          <div class="emphasis-row"><strong>${esc(x.d.label)}</strong><span>${WEIGHT_LABELS[x.weight]}</span></div>`).join('')}</div>
      </div>
    </div></section>
    <section class="card philosophy-submit-card ${locked?'submitted':''}">
      <div class="section-label">${locked?'Response complete':'FINAL STEP'}</div>
      <h2>${locked?'Response submitted':'Submit your response'}</h2>
      ${locked
        ?'<div class="philosophy-submit-state submitted"><strong>Submitted ✓</strong><span>Your independent response is locked and is available to the workshop synthesis.</span></div>'
        :'<div class="philosophy-submit-state waiting"><strong>Saved — not submitted yet</strong><span>Your answers are stored, but they do not count in the Batting Philosophy Workshop until you submit them.</span></div>'}
      <div class="help">${locked
        ?'Return to Batting Philosophy Workshop to compare the contributions when they are available.'
        :'Review the response on the left. When you are happy with it, submit it below. Submission locks your response before you see what everyone else has said, keeping each contribution genuinely independent.'}</div>
      <div class="btnrow">
        ${locked
          ?'<button class="btn secondary" id="backWorkshop">Return to Batting Philosophy Workshop</button>'
          :'<button class="btn secondary philosophy-submit-primary" id="submitPhilosophy">Submit response</button><button class="btn ghost" id="backToFormats">Back to Format Emphasis</button>'}
        <span class="status" id="submitPhilosophyStatus"></span>
      </div>
    </section>
  </div>`;

  document.querySelectorAll('[data-preview-format]').forEach(b=>b.onclick=()=>{previewFormat=b.dataset.previewFormat;renderPreview();});
  if(locked){
    document.getElementById('backWorkshop').onclick=()=>{currentTab='workshop';renderTab();};
  }else{
    document.getElementById('submitPhilosophy').onclick=submitPhilosophyResponse;
    document.getElementById('backToFormats').onclick=()=>goBackInPhilosophyResponse('formats');
  }
}


function questionSpecFor(format,key){
  const base=QUESTION_LIBRARY[key]||{label:key,options:[]};

  if(key!=='strike_rotation')return base;

  const byFormat={
    t20:{
      label:'When the boundary option is not there, how do you keep the innings moving?',
      options:['Take the safe single','Use a gap to change strike','Run hard on misfields','Turn ones into twos','Manipulate the field','Use pace behind square','Use feet to spin for one','Keep the right batter on strike when the matchup matters','Avoid forcing a boundary after dots']
    },
    limited_overs:{
      label:'Where are your reliable get-off-strike options?',
      options:['Clip into leg side','Drop into cover','Push to mid-on / mid-off','Use soft hands into point','Use feet to spin for one','Sweep for one','Run hard on misfields','Turn ones into twos','Identify the single before the ball','Rotate after a boundary']
    },
    long_form:{
      label:'How can you deliberately get off strike without expanding your risk?',
      options:['Clip the pads for one','Drop the ball into a safe gap','Push straight for one','Use soft hands into point','Use feet safely to spin','Sweep for a controlled single','Wait for the field to offer a low-risk single','Run hard on the misfield','Change strike after pressure has built','Keep my scoring envelope narrow']
    }
  };

  return {...base,...(byFormat[format]||{})};
}


function hwbPlanSource(usePublished=false){
  if(!usePublished && howWeBatDraft?.formats)return howWeBatDraft;
  const snap=howWeBatVersions?.[0]?.snapshot;
  return snap||howWeBatDraft||null;
}

function planStructureFormats(usePublished=false){
  const source=hwbPlanSource(usePublished);
  if(source?.formats&&Object.keys(source.formats).length){
    return FORMATS.filter(([key])=>!!source.formats[key]);
  }
  return usePublished?publishedEnabledFormats():enabledFormats();
}

const HWB_PLAN_PROMPTS={
  value_wicket:{
    dimension:'wicket_preservation',
    label:'What does valuing your wicket look like in your game?'
  },
  keep_moving:{
    dimension:'strike_rotation'
  },
  scoring_game:{
    dimension:'scoring_areas',
    label:'Where do you score most reliably in this format?'
  },
  control_tempo:{
    dimension:'tempo'
  },
  pressure_bowler:{
    dimension:'matchups',
    label:'How can you keep changing the bowler’s problem?',
    options:['Change strike','Run hard and pressure the field','Use a favourable matchup','Use a trusted boundary option','Use the field that is being offered','Change depth or position at the crease','Use my partner’s different strengths','Make the bowler change line, length or plan']
  },
  read_game:{
    dimension:'risk_management',
    label:'What tells you that you need to adjust how you use your game?',
    options:['The bowler changes line or length','The bowler changes pace or variation','The field changes','The required rate changes','A wicket changes the match situation','The partnership changes','Conditions change','The matchup changes','A safe scoring option opens up','The game is asking for less risk, not more']
  },
  use_phase:{
    dimension:'risk_management',
    label:'When is it time for you to expand your scoring game?',
    options:['Field restrictions create access','I am established and reading the ball well','Wickets in hand allow more intent','The required rate demands it','A favourable matchup arrives','The field gives me a clear scoring option','The bowler is tiring or losing control','The innings has reached its late phase','Conditions have become easier','My trusted option is genuinely available']
  }
};

function hwbPromptSpec(format,banner){
  const map=HWB_PLAN_PROMPTS[banner?.key]||{};
  const supporting=Array.isArray(banner?.supporting_dimensions)?banner.supporting_dimensions:[];
  const fallbackKey=supporting.map(x=>x?.key).find(k=>QUESTION_LIBRARY[k]);
  const dimension=map.dimension||fallbackKey||null;
  const base=dimension?questionSpecFor(format,dimension):{label:'How will you apply this in your batting?',options:[]};
  return {
    dimension,
    label:map.label||base.label,
    options:[...(map.options||base.options||[])]
  };
}

function generatedCorePlanQuestion(key){
  const spec=QUESTION_LIBRARY[key]||{label:key,why:'',options:[]};
  const wording={
    core_strengths:'Which scoring options are genuinely yours?',
    core_danger:'What most often pulls you away from your plan?',
    core_reset:'What brings you back to your plan?'
  };
  return {
    id:key,
    source_type:'core',
    source_dimension:null,
    source_weight:null,
    source_hwb_key:null,
    source_hwb_title:'CLUB-WIDE FOUNDATION',
    source_hwb_message:'Your format plans work better when you are clear about your own game first.',
    label:wording[key]||spec.label,
    guidance:spec.why||'Choose what genuinely describes your game.',
    response_type:'choices',
    options:[...(spec.options||[])],
    required:true,
    active:true
  };
}

function generatedHwbPlanQuestion(format,banner,index){
  const spec=hwbPromptSpec(format,banner);
  const title=String(banner?.title||HOW_WE_BAT_BANNERS[banner?.key]?.title||`Key Message ${index+1}`);
  const message=String(banner?.message||HOW_WE_BAT_BANNERS[banner?.key]?.messages?.[format]||'');
  return {
    id:`hwb_${format}_${banner?.key||slug(title)||index+1}`,
    source_type:'hwb',
    source_dimension:spec.dimension,
    source_weight:null,
    source_hwb_key:banner?.key||null,
    source_hwb_title:title,
    source_hwb_message:message,
    label:spec.label,
    guidance:message?`This comes directly from ${title}: ${message}`:`This question supports ${title}.`,
    response_type:'choices',
    options:spec.options,
    required:true,
    active:true
  };
}

function generatedPlayerPlanStructure(usePublished=false){
  const hwb=hwbPlanSource(usePublished);
  const coreKeys=['core_strengths','core_danger','core_reset'];
  const structure={
    schema_version:2,
    generated_from:'locked_how_we_bat',
    core:coreKeys.map(generatedCorePlanQuestion),
    formats:{}
  };
  const formatList=planStructureFormats(usePublished);
  for(const [format] of formatList){
    const banners=(hwb?.formats?.[format]?.banners||[]).filter(Boolean).slice(0,4);
    structure.formats[format]=banners.map((b,i)=>generatedHwbPlanQuestion(format,b,i));
  }
  return structure;
}

function normalisePlayerPlanStructure(value,usePublished=false){
  const generated=generatedPlayerPlanStructure(usePublished);
  if(!value || typeof value!=='object')return generated;
  const out={
    schema_version:Number(value.schema_version||0),
    generated_from:value.generated_from||null,
    core:Array.isArray(value.core)?structuredClone(value.core):generated.core,
    formats:{}
  };
  for(const [format] of planStructureFormats(usePublished)){
    out.formats[format]=Array.isArray(value.formats?.[format])
      ?structuredClone(value.formats[format])
      :(generated.formats[format]||[]);
  }
  const clean=q=>({
    id:String(q?.id||`custom_${Date.now()}_${Math.random().toString(36).slice(2,7)}`),
    source_type:q?.source_type||'custom',
    source_dimension:q?.source_dimension||null,
    source_weight:q?.source_weight==null?null:Number(q.source_weight),
    source_hwb_key:q?.source_hwb_key||null,
    source_hwb_title:q?.source_hwb_title||null,
    source_hwb_message:q?.source_hwb_message||null,
    label:String(q?.label||'Untitled question'),
    guidance:String(q?.guidance||''),
    response_type:q?.response_type==='text'?'text':'choices',
    options:Array.isArray(q?.options)?q.options.map(String):[],
    required:q?.required!==false,
    active:q?.active!==false
  });
  out.core=out.core.map(clean);
  for(const k of Object.keys(out.formats))out.formats[k]=out.formats[k].map(clean);
  return out;
}

function planStructureArray(structure,section){
  return section==='core' ? structure.core : (structure.formats?.[section]||[]);
}

function publishedPlayerPlanStructure(){
  const snap=playerPlanStructureVersions?.[0]?.snapshot;
  return normalisePlayerPlanStructure(snap||generatedPlayerPlanStructure(true),true);
}

function playerPlanQuestionsFor(section){
  const structure=publishedPlayerPlanStructure();
  return planStructureArray(structure,section).filter(q=>q.active!==false);
}

function planQuestionSpec(section,key){
  return playerPlanQuestionsFor(section).find(q=>q.id===key)||null;
}

function planStructureSectionLabel(section){
  if(section==='core')return 'Club-wide foundation';
  return FORMATS.find(([k])=>k===section)?.[1]||section;
}

function collectPlanStructureEditor(){
  if(!playerPlanStructureWorking)return;
  const arr=planStructureArray(playerPlanStructureWorking,playerPlanStructureSection);
  document.querySelectorAll('[data-plan-question]').forEach(row=>{
    const q=arr.find(x=>x.id===row.dataset.planQuestion);
    if(!q)return;
    q.label=row.querySelector('[data-plan-label]')?.value.trim()||q.label;
    q.guidance=row.querySelector('[data-plan-guidance]')?.value.trim()||'';
    q.response_type=row.querySelector('[data-plan-response-type]')?.value==='text'?'text':'choices';
    q.required=!!row.querySelector('[data-plan-required]')?.checked;
    if(q.response_type==='choices'){
      q.options=(row.querySelector('[data-plan-options]')?.value||'')
        .split(/\n+/).map(x=>x.trim()).filter(Boolean);
    }
  });
}

function markPlanStructureDirty(){
  playerPlanStructureDirty=true;
  const save=document.getElementById('savePlanStructure');
  const st=document.getElementById('planStructureStatus');
  if(save){save.disabled=false;save.textContent='Save exact edits';}
  if(st)st.textContent='Unsaved changes';
}

function validatePlanStructure(structure){
  const problems=[];
  const sections=[['core','Club-wide foundation'],...planStructureFormats()];
  for(const [section,label] of sections){
    const active=planStructureArray(structure,section).filter(q=>q.active!==false);
    if(!active.length){problems.push(`${label}: keep at least one question.`);continue;}
    for(const q of active){
      if(!q.label?.trim())problems.push(`${label}: every question needs wording.`);
      if(q.response_type==='choices' && (!Array.isArray(q.options)||q.options.length<2)){
        problems.push(`${label}: “${q.label||'Untitled question'}” needs at least two answer options, or change it to Written response.`);
      }
    }
  }
  return problems;
}

function requiredQuestionGapSpecs(section,raw){
  return playerPlanQuestionsFor(section)
    .filter(q=>q.required)
    .filter(q=>{
      const a=section==='core'?raw.core?.[q.id]:raw.formats?.[section]?.[q.id];
      if(!a)return true;
      return !((a.choices||[]).length || String(a.comment||'').trim());
    });
}

function requiredQuestionGaps(section,raw){
  return requiredQuestionGapSpecs(section,raw).map(q=>q.label);
}

function renderPlanStructureQuestion(q,index,editable=true){
  const source=q.source_type==='hwb'
    ?`<span class="plan-source generated">HOW WE BAT · ${esc(q.source_hwb_title||'KEY MESSAGE')}</span>`
    :q.source_type==='custom'
      ?'<span class="plan-source custom">CLUB-SPECIFIC</span>'
      :q.source_type==='adapted'
        ?'<span class="plan-source adapted">MANUALLY ADAPTED</span>'
        :'<span class="plan-source core">CLUB-WIDE</span>';
  if(!q.active){
    return `<div class="plan-question-removed"><span>${esc(q.label)}</span>${editable?`<button class="btn ghost" data-plan-restore="${esc(q.id)}">Restore</button>`:''}</div>`;
  }
  return `<article class="plan-question-editor" data-plan-question="${esc(q.id)}">
    <div class="plan-question-editor-head">
      <div><span class="question-number">${String(index+1).padStart(2,'0')}</span>${source}</div>
      ${editable?`<div class="plan-order-controls"><button class="mini-icon-btn" data-plan-move="${esc(q.id)}" data-direction="up">↑</button><button class="mini-icon-btn" data-plan-move="${esc(q.id)}" data-direction="down">↓</button></div>`:''}
    </div>
    <div class="field"><label>Question</label><input data-plan-label value="${esc(q.label)}" ${editable?'':'disabled'}></div>
    <div class="field"><label>Guidance shown to the player</label><textarea data-plan-guidance rows="2" ${editable?'':'disabled'}>${esc(q.guidance||'')}</textarea></div>
    <div class="plan-question-settings">
      <div class="field"><label>Response style</label><select data-plan-response-type ${editable?'':'disabled'}><option value="choices" ${q.response_type!=='text'?'selected':''}>Choose from options</option><option value="text" ${q.response_type==='text'?'selected':''}>Written response</option></select></div>
      <label class="plan-required-toggle"><input type="checkbox" data-plan-required ${q.required?'checked':''} ${editable?'':'disabled'}><span>Required question</span></label>
    </div>
    <div class="field plan-options-field" style="display:${q.response_type==='text'?'none':'block'}"><label>Answer options · one per line</label><textarea data-plan-options rows="5" ${editable?'':'disabled'}>${esc((q.options||[]).join('\n'))}</textarea></div>
    ${editable?`<div class="btnrow plan-question-actions"><button class="btn ghost" data-plan-duplicate="${esc(q.id)}">Duplicate</button><button class="btn ghost danger-lite" data-plan-remove="${esc(q.id)}">Remove from plan</button></div>`:''}
  </article>`;
}

function renderPlanReviewQuestion(q,index,section){
  const sourceTitle=q.source_hwb_title||(section==='core'?'CLUB-WIDE FOUNDATION':'HOW WE BAT');
  const sourceMessage=q.source_hwb_message||'';
  return `<article class="plan-review-question" style="border:1px solid var(--line);border-radius:14px;padding:15px 17px;background:#fff;margin-top:10px">
    <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap"><span style="font-size:9px;font-weight:950;letter-spacing:.12em;color:var(--muted)">${String(index+1).padStart(2,'0')}</span><span style="font-size:9px;font-weight:950;letter-spacing:.08em;color:var(--navy)">${section==='core'?'CLUB-WIDE':`HOW WE BAT · ${esc(sourceTitle)}`}</span></div>
    <h3 style="margin:7px 0 5px">${esc(q.label)}</h3>
    ${sourceMessage?`<p class="help" style="margin:0"><strong>Why this is here:</strong> ${esc(sourceMessage)}</p>`:`<p class="help" style="margin:0">${esc(q.guidance||'')}</p>`}
  </article>`;
}

function renderPlanReviewSection(section,label,questions){
  const active=questions.filter(q=>q.active!==false);
  return `<section class="card" style="margin-top:14px">
    <div class="section-label">${section==='core'?'Start here':esc(label)}</div>
    <h2 style="margin-bottom:4px">${section==='core'?'The player’s core game':`${esc(label)} prompts`}</h2>
    <p class="help" style="margin-top:0">${section==='core'?'These three questions define the player before format-specific decisions are added.':`Each question exists because of a Key Message in the club’s locked ${esc(label)} How We Bat.`}</p>
    ${active.map((q,i)=>renderPlanReviewQuestion(q,i,section)).join('')||'<div class="notice compact">No questions generated for this section.</div>'}
  </section>`;
}

let playerPlanIdeaPlayersCache={clubId:null,players:null,error:''};

async function loadPlayerPlanIdeaPlayers(){
  if(!isAdmin())return {players:[],error:''};
  if(playerPlanIdeaPlayersCache.clubId===club?.id && Array.isArray(playerPlanIdeaPlayersCache.players))return playerPlanIdeaPlayersCache;
  const targetClubId=club.id;
  const {data,error}=await supabase.rpc('get_players_workspace',{p_club_id:targetClubId});
  const result={clubId:targetClubId,players:Array.isArray(data?.players)?data.players:[],error:error?.message||''};
  if(club?.id===targetClubId)playerPlanIdeaPlayersCache=result;
  return result;
}

function playerPlanAddedIdeas(players,structure){
  const groups=[];
  const sections=[['core','Club-wide',structure?.core||[]],...planStructureFormats().map(([format,label])=>[format,label,structure?.formats?.[format]||[]])];
  for(const [section,label,questions] of sections){
    for(const q of questions.filter(x=>x.active!==false&&x.response_type!=='text')){
      const counts=new Map();
      for(const player of players||[]){
        const raw=workspacePlayerRaw(player);
        const a=section==='core'?raw?.core?.[q.id]:raw?.formats?.[section]?.[q.id];
        const text=String(a?.comment||'').trim();
        if(!text)continue;
        const optionMatch=(q.options||[]).some(o=>String(o).trim().toLowerCase()===text.toLowerCase());
        if(optionMatch)continue;
        const norm=text.toLowerCase().replace(/\s+/g,' ').trim();
        const prev=counts.get(norm)||{text,count:0};
        prev.count+=1;
        counts.set(norm,prev);
      }
      const ideas=[...counts.values()].sort((a,b)=>b.count-a.count||a.text.localeCompare(b.text)).slice(0,8);
      if(ideas.length)groups.push({section,label,question:q.label,ideas});
    }
  }
  return groups;
}

function renderPlayerPlanAddedIdeas(groups,error=''){
  if(!isAdmin())return '';
  const count=groups.reduce((n,g)=>n+g.ideas.length,0);
  return `<details class="card plan-player-ideas" ${count?'':'open'}>
    <summary>
      <div><div class="section-label">Player-added answers</div><strong>${count?`${count} answer${count===1?'':'s'} outside the current option lists`:'Nothing new yet'}</strong><span>These come from the “Can’t see your answer?” fields. Player names are deliberately not shown.</span></div>
      <em>${count?'Review ↓':'No additions yet'}</em>
    </summary>
    <div class="plan-player-ideas-body">
      ${error?`<div class="notice compact">Player-added answers could not be loaded: ${esc(error)}</div>`:''}
      ${count?`<div class="notice compact"><strong>Use this as prompt feedback, not an automatic edit.</strong><br>Repeated or especially useful answers are evidence that a future option list may be missing something. The locked Player Plan Structure is not changed automatically.</div>`:'<p class="help">When players add something that is not in the listed choices, it will appear here for Club Admin review.</p>'}
      ${groups.map(g=>`<article class="plan-player-idea-group"><div class="section-label">${esc(g.label)}</div><h3>${esc(g.question)}</h3><div class="plan-player-idea-list">${g.ideas.map(x=>`<span><b>${esc(x.text)}</b>${x.count>1?`<em>${x.count} players</em>`:''}</span>`).join('')}</div></article>`).join('')}
    </div>
  </details>`;
}

function renderClubPublicationGate(title){
  const setupAccess=canUseClubHome();
  document.getElementById('page').innerHTML=`<section class="card player-gate">
    <div class="section-label">${esc(title)}</div>
    <h2>${isPlayerUser()?'You’re registered. Your club is preparing its setup.':'Your club is preparing its setup.'}</h2>
    <p>${esc(club.name)} is completing its batting approach and Player Plan questions. ${isPlayerUser()?'Your Player Plan will open when the club publishes. You do not need to register again.':'You are registered as non-playing staff and do not receive a Player Plan.'}</p>
    <div class="notice"><strong>What happens next?</strong><br>We’ll email registered players when they can start. Then you’ll build your Player Plan, use How We Train, and keep learning through feedback.</div>
    <p>${setupAccess?'You have assigned club access and can continue that work now.':'If your club needs you in the Workshop or another setup role, the Club Admin can assign that access to this account. Until then, you can explore the tutorials and ask the Guide.'}</p>
    <div class="btnrow">${setupAccess?'<button class="btn secondary" id="publicationSetupAccess">Open Club Home</button>':''}<button class="btn ${setupAccess?'ghost':'secondary'}" id="publicationHelp">Explore tutorials & Guide</button><button class="btn ghost" id="refreshPublication">Check for updates</button></div>
  </section>`;
  document.getElementById('publicationSetupAccess')?.addEventListener('click',()=>{currentTab='dashboard';renderTab();});
  document.getElementById('publicationHelp').onclick=()=>openClubBattingGuideTopic('whole_process');
  document.getElementById('refreshPublication').onclick=async()=>{
    const button=document.getElementById('refreshPublication');button.disabled=true;button.textContent='Checking…';
    await loadContext();
  };
}

let planStructureRenderSequence=0;
async function renderPlanStructure(){
  if(!isAdmin()&&!isPhilosophyLead()){
    currentTab='myplan';
    return renderMyPlan();
  }
  const formats=planStructureFormats();
  const page=clubSetupContentPage('plan');
  const targetClubId=club.id;
  const targetTab=currentTab;
  const renderSequence=++planStructureRenderSequence;
  const hwbLocked=hasLockedHowWeBatForCurrentRound();

  if(!hwbLocked){
    const lead=isPhilosophyLead();
    const hasHowWeBatDraft=!!howWeBatDraft;
    page.innerHTML=`<section class="card player-gate">
      <div class="gate-state locked">🔒</div>
      <div class="section-label">Player Plan Structure</div>
      <h2>${lead?'Finalise How We Bat to create the Player Plan questions.':'Your club is still preparing How We Bat.'}</h2>
      <p>${lead?'Your club’s How We Bat provides the questions each player will answer. Review and lock How We Bat first, then return here to check those questions.':'The Philosophy Lead needs to finalise How We Bat before the club’s Player Plan questions can be prepared.'}</p>
      <div class="btnrow" style="margin-top:14px">${lead||isAdmin()?`<button class="btn secondary" id="backToHowWeBat">${lead&&hasHowWeBatDraft?'Open How We Bat':'Open Batting Philosophy Workshop'}</button>`:''}<button class="btn ghost" id="lockedPlanStructureGuide">${lead?'Show me how':'What is Player Plan Structure?'}</button></div>
    </section>`;
    if(document.getElementById('backToHowWeBat'))document.getElementById('backToHowWeBat').onclick=()=>{currentTab=lead&&hasHowWeBatDraft?'howwebat':'workshop';renderTab();};
    if(document.getElementById('lockedPlanStructureGuide'))document.getElementById('lockedPlanStructureGuide').onclick=()=>openClubBattingGuideTopic('player_plan_structure');
    return;
  }

  const editable=isPhilosophyLead();
  const locked=playerPlanStructureDraft?.status==='ready'||(!playerPlanStructureDraft&&clubSetupProgress().published);
  const legacyDraft=!!playerPlanStructureDraft && Number(playerPlanStructureDraft?.structure?.schema_version||0)<2;

  if(!playerPlanStructureWorking){
    if(!playerPlanStructureDraft&&locked){
      playerPlanStructureWorking=normalisePlayerPlanStructure(playerPlanStructureVersions[0].snapshot,false);
      playerPlanStructureDirty=false;
    }else if(!playerPlanStructureDraft || (legacyDraft && !locked)){
      playerPlanStructureWorking=generatedPlayerPlanStructure(false);
      playerPlanStructureDirty=true;
    }else{
      playerPlanStructureWorking=normalisePlayerPlanStructure(playerPlanStructureDraft.structure,false);
      playerPlanStructureDirty=false;
    }
  }

  const validSections=['core',...formats.map(([k])=>k)];
  if(!validSections.includes(playerPlanStructureSection))playerPlanStructureSection='core';
  const structureReady=locked && !playerPlanStructureDirty;
  const lookReady=clubSetupProgress().detailsReady;
  const latestVersion=philosophyVersions?.[0]?.version_number||null;
  const latestPublishedStructure=playerPlanStructureVersions?.[0]?.snapshot||null;
  const latestHwb=howWeBatVersions?.[0]?.snapshot?upgradeLegacyHowWeBatWording(structuredClone(howWeBatVersions[0].snapshot)):null;
  const currentDraftPublished=(!playerPlanStructureDraft&&clubSetupProgress().published)||!!(workshop?.status==='published' && locked && latestPublishedStructure && playerPlanStructureDraft?.structure
    && howWeBatDraft?.status==='ready' && latestHwb
    && howWeBatDraft.identity_statement===latestHwb.identity_statement
    && howWeBatDraft.closing_strapline===latestHwb.closing_strapline
    && JSON.stringify(howWeBatDraft.formats||{})===JSON.stringify(latestHwb.formats||{})
    && JSON.stringify(latestPublishedStructure)===JSON.stringify(playerPlanStructureDraft.structure));
  let playerAddedIdeasHtml='';
  if(isAdmin()){
    const ideaData=await loadPlayerPlanIdeaPlayers();
    if(renderSequence!==planStructureRenderSequence||club?.id!==targetClubId||currentTab!==targetTab||clubSetupContentPage('plan')!==page)return;
    playerAddedIdeasHtml=renderPlayerPlanAddedIdeas(playerPlanAddedIdeas(ideaData.players,playerPlanStructureWorking),ideaData.error);
  }

  const reviewSections=[renderPlanReviewSection('core','Club-wide',playerPlanStructureWorking.core)];
  for(const [format,label] of formats){
    reviewSections.push(renderPlanReviewSection(format,label,playerPlanStructureWorking.formats?.[format]||[]));
  }

  let manualHtml='';
  if(playerPlanStructureManualEdit && editable && !structureReady){
    const sectionArray=planStructureArray(playerPlanStructureWorking,playerPlanStructureSection);
    const activeQuestions=sectionArray.filter(q=>q.active!==false);
    const removedQuestions=sectionArray.filter(q=>q.active===false);
    const sectionTabs=[['core','Core'],...formats].map(([k,l])=>`<button class="${playerPlanStructureSection===k?'active':''}" data-plan-section="${k}">${esc(l)}</button>`).join('');
    manualHtml=`<section class="card" style="margin-top:16px">
      <div class="plan-structure-builder-head"><div><div class="section-label">Optional manual control</div><h2>Edit the exact questions</h2><div class="help">Club Batting’s generated structure is the normal path. Use this only when the club genuinely needs different wording, options or an additional prompt.</div></div></div>
      <div class="plan-structure-tabs">${sectionTabs}</div>
      <div class="plan-section-head"><div><div class="section-label">${esc(planStructureSectionLabel(playerPlanStructureSection))}</div><h3>${activeQuestions.length} question${activeQuestions.length===1?'':'s'}</h3></div><button class="btn ghost" id="addPlanQuestion">+ Add question</button></div>
      <div class="plan-question-editor-list">${activeQuestions.map((q,i)=>renderPlanStructureQuestion(q,i,true)).join('')||'<div class="notice">No questions are currently included.</div>'}</div>
      ${removedQuestions.length?`<details class="plan-removed-list"><summary>Removed (${removedQuestions.length})</summary>${removedQuestions.map(q=>renderPlanStructureQuestion(q,0,true)).join('')}</details>`:''}
      <div class="btnrow plan-structure-actions"><button class="btn secondary" id="savePlanStructure">Save exact edits</button><button class="btn ghost" id="resetGeneratedPlan">Reset to generated questions</button><button class="btn ghost" id="closePlanEditor">Back to review</button><span class="status" id="planStructureStatus"></span></div>
    </section>`;
  }

  const statusHtml=structureReady
    ?`<div class="notice success"><strong>Player Plan questions confirmed for this season.</strong><br>${currentDraftPublished?'These questions are published and available to players.':lookReady?'The questions are ready for the final publication step.':'The questions are ready. Next, the Club Admin checks the club look before publication.'} They stay fixed for the season so Player Plans remain aligned with How We Bat.</div>`
    :`<div class="notice"><strong>Generated from locked How We Bat.</strong><br>Club Batting has kept this deliberately short: three club-wide questions, then one prompt for each How We Bat Key Message. The normal job here is simply to check that the questions make sense.</div>`;

  const actionHtml=structureReady&&!lookReady
    ?`<div class="btnrow"><button class="btn secondary" id="continueToClubLook">${isAdmin()?'Continue to club look':'Return to Club Home'}</button></div>${isAdmin()?'':'<p class="help">Your Club Admin can add the club logo and colours or keep the current look. Once saved, you can publish here.</p>'}`
    :!editable
    ?`<div class="help">${currentDraftPublished?'Players can now build their plans using these questions.':'The Philosophy Lead needs to '+(structureReady?'publish the Club Batting System to open Player Plans.':'review and lock these questions, then publish the Club Batting System.')}</div>`
    :structureReady
      ?(currentDraftPublished
        ?`<div class="btnrow"><span class="status">Club Batting System v${esc(latestVersion||'')} published ✓</span>${canUsePlayersWorkspace()?'<button class="btn secondary" id="openPublishedPlayers">Open Players</button>':isPlayerUser()?'<button class="btn secondary" id="openPublishedMyPlan">Open My Player Plan</button>':''}</div>`
        :`<div class="btnrow"><button class="btn secondary" id="publishClubSystem">Publish & notify players</button><span class="status" id="publishClubSystemStatus"></span></div>`)
      :`<div class="btnrow"><button class="btn secondary" id="lockPlanStructure">Confirm Player Plan questions</button><button class="btn ghost" id="editExactPlanQuestions">Edit exact questions</button><span class="status" id="planStructureStatus"></span></div>`;

  page.innerHTML=`<style>
    .plan-review-shell{max-width:980px;margin:0 auto}.plan-review-hero{padding:20px 22px}.plan-review-hero h1{margin:4px 0 7px}.plan-review-count{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.plan-review-count span{padding:6px 9px;border-radius:999px;background:var(--club-soft);font-size:9px;font-weight:900;color:var(--navy)}
  </style>
  <div class="plan-review-shell">
    <div class="guide-context-bar"><span><strong>Player Plan Structure</strong> · Turn How We Bat into the questions each player answers about their own game.</span><button type="button" class="btn ghost compact-btn" id="planStructureGuideLink">Show me how</button></div>
    <section class="card plan-review-hero">
      <div class="section-label">Player Plan Structure</div>
      <h1>The questions players will build their plans from.</h1>
      <p class="help">How We Bat sets the club position. These prompts help each batter turn that position into <strong>their own game</strong>.</p>
      <div class="plan-review-count"><span>${playerPlanStructureWorking.core.filter(q=>q.active!==false).length} club-wide</span>${formats.map(([f,l])=>`<span>${esc(l)} · ${(playerPlanStructureWorking.formats?.[f]||[]).filter(q=>q.active!==false).length}</span>`).join('')}</div>
    </section>
    ${statusHtml}
    ${reviewSections.join('')}
    ${playerAddedIdeasHtml}
    ${manualHtml}
    <section class="card" style="margin-top:16px">
      <div class="section-label">${structureReady?'Season structure':'Decision'}</div>
      <h2>${currentDraftPublished?'Player Plans are open.':structureReady?(lookReady?'Publish to open Player Plans.':'Next, check your club’s look.'):'Review and confirm the questions.'}</h2>
      <p class="help">${currentDraftPublished?'The structure is fixed for this season. A different structure requires a new Philosophy round so How We Bat and Player Plans can be rebuilt together.':structureReady?(lookReady?'Choose “Publish & notify players” to open How We Bat and Player Plans, and email players to let them know they can start.':'The batting work is ready. Check the club logo and colours, or keep the current look, before the Philosophy Lead publishes the system.'):'Review the questions above. If they fit your club, confirm them. Club look and publication are the final steps.'}</p>
      ${actionHtml}
    </section>
  </div>`;

  if(document.getElementById('planStructureGuideLink'))document.getElementById('planStructureGuideLink').onclick=()=>openClubBattingGuideTopic('player_plan_structure');
  document.getElementById('continueToClubLook')?.addEventListener('click',async()=>{
    if(!await saveClubEditsBeforeNavigation())return;
    currentTab='dashboard';localStorage.setItem(`bdp-tab-${club.id}`,currentTab);
    await renderTab();
  });
  if(document.getElementById('editExactPlanQuestions'))document.getElementById('editExactPlanQuestions').onclick=()=>{playerPlanStructureManualEdit=true;renderPlanStructure();};
  if(document.getElementById('closePlanEditor'))document.getElementById('closePlanEditor').onclick=()=>{collectPlanStructureEditor();playerPlanStructureManualEdit=false;renderPlanStructure();};
  document.querySelectorAll('[data-plan-section]').forEach(b=>b.onclick=()=>{collectPlanStructureEditor();playerPlanStructureSection=b.dataset.planSection;renderPlanStructure();});

  if(playerPlanStructureManualEdit && editable && !structureReady){
    document.querySelectorAll('[data-plan-question] input,[data-plan-question] textarea,[data-plan-question] select').forEach(el=>{
      el.addEventListener('input',()=>{const row=el.closest('[data-plan-question]');if(el.matches('[data-plan-response-type]')){const f=row.querySelector('.plan-options-field');if(f)f.style.display=el.value==='text'?'none':'block';}markPlanStructureDirty();});
      el.addEventListener('change',markPlanStructureDirty);
    });
    document.getElementById('addPlanQuestion').onclick=()=>{
      collectPlanStructureEditor();
      const arr=planStructureArray(playerPlanStructureWorking,playerPlanStructureSection);
      arr.push({id:`custom_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,source_type:'custom',source_dimension:null,source_weight:null,source_hwb_key:null,source_hwb_title:null,source_hwb_message:null,label:'New club-specific question',guidance:'What do you want the player to think about here?',response_type:'choices',options:['Option 1','Option 2'],required:false,active:true});
      playerPlanStructureDirty=true;renderPlanStructure();
    };
    document.querySelectorAll('[data-plan-duplicate]').forEach(b=>b.onclick=()=>{
      collectPlanStructureEditor();
      const arr=planStructureArray(playerPlanStructureWorking,playerPlanStructureSection);
      const i=arr.findIndex(q=>q.id===b.dataset.planDuplicate);if(i<0)return;
      const copy=structuredClone(arr[i]);copy.id=`adapted_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;copy.source_type='adapted';copy.label=`${copy.label} — new question`;arr.splice(i+1,0,copy);playerPlanStructureDirty=true;renderPlanStructure();
    });
    document.querySelectorAll('[data-plan-remove]').forEach(b=>b.onclick=()=>{collectPlanStructureEditor();const arr=planStructureArray(playerPlanStructureWorking,playerPlanStructureSection);const q=arr.find(x=>x.id===b.dataset.planRemove);if(q){q.active=false;playerPlanStructureDirty=true;renderPlanStructure();}});
    document.querySelectorAll('[data-plan-restore]').forEach(b=>b.onclick=()=>{const arr=planStructureArray(playerPlanStructureWorking,playerPlanStructureSection);const q=arr.find(x=>x.id===b.dataset.planRestore);if(q){q.active=true;playerPlanStructureDirty=true;renderPlanStructure();}});
    document.querySelectorAll('[data-plan-move]').forEach(b=>b.onclick=()=>{
      collectPlanStructureEditor();const arr=planStructureArray(playerPlanStructureWorking,playerPlanStructureSection);const activeIdx=arr.map((q,i)=>q.active!==false?i:null).filter(i=>i!==null);const pos=activeIdx.findIndex(i=>arr[i].id===b.dataset.planMove);if(pos<0)return;const otherPos=b.dataset.direction==='up'?pos-1:pos+1;if(otherPos<0||otherPos>=activeIdx.length)return;const a=activeIdx[pos],c=activeIdx[otherPos];[arr[a],arr[c]]=[arr[c],arr[a]];playerPlanStructureDirty=true;renderPlanStructure();
    });
    document.getElementById('savePlanStructure').onclick=()=>savePlayerPlanStructure('draft');
    document.getElementById('resetGeneratedPlan').onclick=()=>{const ok=confirm('Reset the working Player Plan Structure to the questions generated from the locked How We Bat? Any manual edits in this working draft will be discarded.');if(!ok)return;playerPlanStructureWorking=generatedPlayerPlanStructure(false);playerPlanStructureDirty=true;playerPlanStructureSection='core';renderPlanStructure();};
  }

  if(document.getElementById('lockPlanStructure'))document.getElementById('lockPlanStructure').onclick=()=>savePlayerPlanStructure('ready',document.getElementById('lockPlanStructure'));
  if(document.getElementById('publishClubSystem'))document.getElementById('publishClubSystem').onclick=publishPhilosophy;
  document.getElementById('openPublishedPlayers')?.addEventListener('click',()=>{currentTab='players';renderTab();});
  document.getElementById('openPublishedMyPlan')?.addEventListener('click',()=>{currentTab='myplan';renderTab();});
}

let playerPlanStructureSaving=false;

async function savePlayerPlanStructureBeforeNavigation(){
  if(currentTab!=='plan')return true;
  if(playerPlanStructureSaving)return false;
  if(!playerPlanStructureDirty)return true;
  if(!isPhilosophyLead())return true;
  return await savePlayerPlanStructure('draft');
}

async function savePlayerPlanStructure(status,triggerButton=null){
  const st=document.getElementById('planStructureStatus');
  const btn=triggerButton||(status==='ready'?document.getElementById('lockPlanStructure'):document.getElementById('savePlanStructure'));
  if(playerPlanStructureSaving)return false;
  if(playerPlanStructureDraft?.status==='ready'){
    if(playerPlanStructureDirty){if(st)st.textContent='This season’s structure is locked. Your changes have not been saved.';return false;}
    return true;
  }
  if(!isPhilosophyLead()||!playerPlanStructureWorking)return false;
  if(playerPlanStructureManualEdit)collectPlanStructureEditor();
  if(status==='ready'){
    const problems=validatePlanStructure(playerPlanStructureWorking);
    if(problems.length){alert(`Player Plan Structure still needs attention:\n\n${problems.slice(0,8).join('\n')}`);return false;}
    const ok=confirm(
      `Lock Player Plan Structure for the season?\n\n`+
      `These questions are generated from the locked How We Bat and will become the framework players use to build their plans.\n\n`+
      `Once locked, routine editing is disabled. A different structure requires a new Philosophy round so How We Bat and Player Plans stay aligned.\n\n`+
      `Lock this structure?`
    );
    if(!ok)return false;
  }
  const disabledControls=status==='ready'
    ?[...document.querySelectorAll('[data-plan-question] input, [data-plan-question] textarea, [data-plan-question] select, [data-plan-move], [data-plan-remove], [data-plan-duplicate], [data-plan-restore], [data-plan-section], #addPlanQuestion, #resetGeneratedPlan, #closePlanEditor, #savePlanStructure, #lockPlanStructure')].map(control=>({control,disabled:control.disabled}))
    :[];
  disabledControls.forEach(({control})=>{control.disabled=true;});
  playerPlanStructureSaving=true;
  if(btn){btn.disabled=true;btn.textContent=status==='ready'?'Locking…':'Saving…';}
  if(st)st.textContent=status==='ready'?'Locking…':'Saving…';
  playerPlanStructureWorking.schema_version=2;
  playerPlanStructureWorking.generated_from=playerPlanStructureWorking.generated_from||'locked_how_we_bat';
  const savedStructure=structuredClone(playerPlanStructureWorking);
  const wasManual=playerPlanStructureManualEdit;
  let persisted=false;
  try{
    const {error}=await supabase.rpc('save_player_plan_structure_draft',{p_club_id:club.id,p_structure:savedStructure,p_status:status});
    if(error)throw error;
    persisted=true;
    const savedDraft={...(playerPlanStructureDraft||{}),club_id:club.id,structure:savedStructure,status};
    playerPlanStructureDraft=savedDraft;
    // Keep edits made while the request was running; do not replace them with
    // the earlier snapshot just confirmed by the server.
    if(playerPlanStructureManualEdit)collectPlanStructureEditor();
    if(status==='draft'&&JSON.stringify(playerPlanStructureWorking)!==JSON.stringify(savedStructure)){
      playerPlanStructureDirty=true;
      if(st)st.textContent='Earlier edits saved. Save your latest changes before leaving.';
      if(btn){btn.disabled=false;btn.textContent='Save exact edits';}
      return false;
    }
    playerPlanStructureDirty=false;
    playerPlanStructureManualEdit=false;
    try{
      await loadData();
    }catch(error){
      // The write succeeded even if refreshing other club data failed. Preserve
      // the confirmed draft locally so a retry cannot regenerate old questions.
      playerPlanStructureDraft=savedDraft;
      playerPlanStructureWorking=structuredClone(savedStructure);
      playerPlanStructureDirty=false;
      playerPlanStructureManualEdit=status==='draft'&&wasManual;
      if(status==='ready')await renderPlanStructure();
      const message='Saved ✓. The page could not refresh; your changes are saved.';
      const currentStatus=document.getElementById('planStructureStatus');
      if(currentStatus)currentStatus.textContent=message;
      else alert(message);
      if(btn){btn.disabled=status==='ready';btn.textContent=status==='ready'?'Structure locked':'Save exact edits';}
      return true;
    }
    playerPlanStructureSection='core';
    await renderPlanStructure();
    return true;
  }catch(error){
    if(persisted){
      playerPlanStructureDraft={...(playerPlanStructureDraft||{}),club_id:club.id,structure:savedStructure,status};
      playerPlanStructureWorking=structuredClone(savedStructure);
      playerPlanStructureDirty=false;
      playerPlanStructureManualEdit=status==='draft'&&wasManual;
      if(st)st.textContent='Saved ✓. The page could not refresh; your changes are saved.';
      if(btn){btn.disabled=status==='ready';btn.textContent=status==='ready'?'Structure locked':'Save exact edits';}
      return true;
    }
    playerPlanStructureDirty=true;
    if(st)st.textContent=`Save problem: ${error?.message||String(error)}. Your edits are still here.`;
    if(btn){btn.disabled=false;btn.textContent=status==='ready'?'Confirm Player Plan questions':'Save exact edits';}
    return false;
  }finally{
    // Failed locking leaves the editor exactly as usable as it was before.
    // A successful lock keeps any still-mounted old editor controls disabled.
    if(!persisted||status!=='ready')disabledControls.forEach(({control,disabled})=>{control.disabled=disabled;});
    playerPlanStructureSaving=false;
  }
}

async function submitPhilosophyResponse(){
  const s=document.getElementById('submitPhilosophyStatus');
  const btn=document.getElementById('submitPhilosophy');
  if(s)s.textContent='Submitting…';
  if(btn){btn.disabled=true;btn.textContent='Submitting…';}

  const {error}=await supabase.rpc('submit_my_philosophy_response',{p_club_id:club.id});
  if(error){
    if(s)s.textContent=error.message;
    if(btn){btn.disabled=false;btn.textContent='Submit response';}
    return;
  }

  if(s)s.textContent='Submitted ✓';
  await loadData();
  currentTab='workshop';
  renderShell();
}


/* ---------------- PERMISSIONS ---------------- */

async function renderPermissions(){
  document.getElementById('page').innerHTML='<div class="splash">Loading people & sign-up…</div>';

  const {data:members,error}=await supabase
    .from('club_memberships')
    .select('club_id,user_id,involvement,permission_role')
    .eq('club_id',club.id);

  if(error){
    document.getElementById('page').innerHTML=`<div class="notice">${esc(error.message)}</div>`;
    return;
  }

  const userIds=(members||[]).map(m=>m.user_id);
  const [{data:profiles},{data:grants},{data:players},{data:playingGroups},{data:pendingHandovers}]=await Promise.all([
    userIds.length?supabase.from('user_profiles').select('*').in('user_id',userIds):Promise.resolve({data:[]}),
    supabase.from('club_access_grants').select('*').eq('club_id',club.id),
    supabase.from('players').select('id,user_id,display_name,active').eq('club_id',club.id),
    supabase.from('playing_groups').select('*').eq('club_id',club.id).eq('active',true).order('sort_order').order('name'),
    supabase.from('club_admin_handovers').select('*').eq('club_id',club.id).eq('status','pending').order('created_at',{ascending:false}).limit(1)
  ]);

  const pMap=new Map((profiles||[]).map(p=>[p.user_id,p]));
  const grantMap=new Map();
  for(const g of grants||[]){
    if(!grantMap.has(g.user_id))grantMap.set(g.user_id,[]);
    grantMap.get(g.user_id).push(g);
  }

  const activeGroups=playingGroups||[];
  const activePlayers=(players||[]).filter(p=>p.active!==false);
  const playerUserIds=new Set(activePlayers.map(p=>p.user_id).filter(Boolean));
  const activePlayerCount=activePlayers.length;
  const nonPlayingStaffCount=(members||[]).filter(m=>m.involvement==='coach_captain').length;
  const leadAdminId=club.lead_admin_user_id;
  const leadAdminName=pMap.get(leadAdminId)?.display_name||'Club Admin';
  const amLeadAdmin=leadAdminId===session.user.id;
  const pendingHandover=(pendingHandovers||[])[0]||null;
  const playerJoinLink=`${location.origin}${location.pathname}?player_join=${encodeURIComponent(club.player_join_token||'')}`;
  const staffJoinLink=`${location.origin}${location.pathname}?join=${encodeURIComponent(club.join_code||'')}&involvement=coach_captain`;
  const plansReady=workspacePlayerPlansPublished();
  const signupOpen=club.player_signup_open!==false;
  const clubRoleValues=new Set(['captain','coach','head_coach','admin']);
  const roleMembers=(members||[]).filter(m=>m.user_id===leadAdminId || clubRoleValues.has(m.permission_role));
  const roleMemberIds=new Set(roleMembers.map(m=>m.user_id));
  const roleCandidates=(members||[]).filter(m=>!roleMemberIds.has(m.user_id));
  const handoverCandidates=(members||[]).filter(m=>
    m.user_id!==session.user.id &&
    (playerUserIds.has(m.user_id) || m.involvement==='coach_captain' || m.involvement==='both' || clubRoleValues.has(m.permission_role))
  );

  const registrationLabel=m=>{
    if(playerUserIds.has(m.user_id) || ['player','both'].includes(m.involvement))return 'Registered player';
    if(m.involvement==='coach_captain')return 'Non-playing staff';
    return 'Registered member';
  };

  const accessStateFor=userId=>{
    const gs=grantMap.get(userId)||[];
    let access='pending';
    let selectedGroupIds=[];
    if(gs.some(g=>g.scope==='whole_club'&&g.can_edit))access='whole_edit';
    else if(gs.some(g=>g.scope==='whole_club'&&g.can_view))access='whole_view';
    else if(gs.some(g=>g.scope==='playing_group'&&g.can_edit)){
      access='groups_edit';
      selectedGroupIds=gs.filter(g=>g.scope==='playing_group'&&g.can_edit).map(g=>g.playing_group_id).filter(Boolean);
    }else if(gs.some(g=>g.scope==='playing_group'&&g.can_view)){
      access='groups_view';
      selectedGroupIds=gs.filter(g=>g.scope==='playing_group'&&g.can_view).map(g=>g.playing_group_id).filter(Boolean);
    }
    return {access,selectedGroupIds};
  };

  const roleMemberHtml=roleMembers.map(m=>{
    const name=pMap.get(m.user_id)?.display_name||'Profile not completed';
    const isLead=m.user_id===leadAdminId;
    const selfAdmin=m.user_id===session.user.id && m.permission_role==='admin';
    const {access,selectedGroupIds}=accessStateFor(m.user_id);

    if(isLead){
      return `<div class="member">
        <div>
          <strong>${esc(name)}${m.user_id===session.user.id?' · You':''}</strong>
          <small>${esc(registrationLabel(m))}</small>
        </div>
        <div class="primary-admin-summary lead">
          <strong>Lead Admin</strong>
          <span>Full club access · formal handover required</span>
        </div>
      </div>`;
    }

    if(selfAdmin){
      return `<div class="member">
        <div>
          <strong>${esc(name)} · You</strong>
          <small>${esc(registrationLabel(m))}</small>
        </div>
        <div class="primary-admin-summary">
          <strong>Club Admin</strong>
          <span>Full club access</span>
        </div>
      </div>`;
    }

    return `<div class="member">
      <div>
        <strong>${esc(name)}${m.user_id===session.user.id?' · You':''}</strong>
        <small>${esc(registrationLabel(m))}</small>
        ${m.permission_role!=='admin'&&access==='pending'?'<span class="pending">PLAYER ACCESS NOT SET</span>':''}
      </div>
      <div class="member-controls">
        <select data-role-user="${m.user_id}">
          ${[
            ['none','No club role'],
            ['captain','Captain'],
            ['coach','Coach'],
            ['head_coach','Head Coach'],
            ['admin','Admin']
          ].map(([v,l])=>`<option value="${v}" ${m.permission_role===v?'selected':''}>${l}</option>`).join('')}
        </select>
        ${m.permission_role==='admin'
          ?'<select disabled><option>Full club access</option></select>'
          :`<select data-access-user="${m.user_id}">
            <option value="pending" ${access==='pending'?'selected':''}>No assigned player access</option>
            <option value="whole_view" ${access==='whole_view'?'selected':''}>Whole club · view</option>
            <option value="whole_edit" ${access==='whole_edit'?'selected':''}>Whole club · view + edit</option>
            <option value="groups_view" ${access==='groups_view'?'selected':''}>Selected Playing Groups · view</option>
            <option value="groups_edit" ${access==='groups_edit'?'selected':''}>Selected Playing Groups · view + edit</option>
          </select>`}
        <div class="permission-group-picker" data-group-picker-user="${m.user_id}" style="display:${m.permission_role!=='admin'&&['groups_view','groups_edit'].includes(access)?'flex':'none'}">
          ${activeGroups.length?activeGroups.map(g=>`<label>
            <input type="checkbox" data-access-group-user="${m.user_id}" value="${g.id}" ${selectedGroupIds.includes(g.id)?'checked':''}>
            <span>${esc(g.name)}</span>
          </label>`).join(''):'<span class="help">No active Playing Groups yet.</span>'}
        </div>
        <button class="btn ghost" data-save-user="${m.user_id}" disabled>Saved ✓</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('page').innerHTML=`
  <style>.player-share-layout[hidden],.join-security-row[hidden]{display:none!important}</style>
  <section class="card">
    <div class="section-label">Players · Club people</div>
    <h2>People & Sign-up</h2>
    <div class="help"><strong>Get people into Club Batting first. Give responsibilities second.</strong></div>
    <div class="help">Players register as <strong>Players</strong>. Club roles such as Captain, Coach, Head Coach and Admin are assigned afterwards. Batting Philosophy Workshop invitations are separate again — contributing to the philosophy does <strong>not</strong> make somebody a coach, captain or Admin.</div>
  </section>

  <div class="grid permissions-top-grid" style="margin-top:16px">
    <section class="card player-signup-card">
      <div class="section-label">Player sign-up</div>
      <h2>Invite players to register</h2>
      ${plansReady?'':`<div class="notice"><strong>You can register people during preparation.</strong> ${signupOpen?'Players can join now.':'Reopen sign-up when you want to invite players.'} Assign any club roles below, then choose workshop participants in the Workshop. Players without an assigned setup role will see a waiting message until How We Bat and Player Plans are published.</div>`}
      <div class="help">Post the WhatsApp message in the players chat, or use the QR code at training / on a noticeboard. Everyone using this route joins as a <strong>Player</strong>. If they also captain or coach, assign that club role afterwards.</div>

      <div class="signup-status-row">
        <div>
          <span class="signup-pill ${signupOpen?'open':'closed'}">${signupOpen?'● SIGN-UP OPEN':'○ SIGN-UP CLOSED'}</span>
          <div class="signup-count"><strong>${activePlayerCount}</strong> players registered</div>
        </div>
        <button class="btn ghost" id="togglePlayerSignup">${signupOpen?'Close sign-up':'Open sign-up'}</button>
      </div>

      <div class="player-share-layout">
        <div class="qr-panel">
          <div class="qr-frame">
            <img id="playerSignupQR" alt="${esc(club.name)} player sign-up QR code" style="display:none">
            <div id="qrFallback" class="qr-loading">Generating QR…</div>
          </div>
          <a class="btn ghost" id="downloadPlayerQR" style="display:none">Download QR image</a>
        </div>

        <div class="share-actions">
          <h3>For the Players WhatsApp chat</h3>
          <p>Use the message button — the link is easier for players who are already reading it on their phone.</p>
          <button class="btn secondary" id="copyPlayerWhatsApp">Copy WhatsApp message</button>
          <button class="btn ghost" id="copyPlayerLink">Copy player sign-up link</button>
          <div id="playerShareStatus" class="help"></div>

          <div class="share-preview">
            <strong>What players experience</strong>
            <span>Open link → enter email → secure sign-in → confirm name → joined as Player.</span><span>${plansReady?'Player Plans are available after joining.':'Before publication: registration is complete, with a waiting message for Player Plans. Assigned setup roles are available now.'}</span>
          </div>
        </div>
      </div>

      <div class="join-security-row">
        <div>
          <strong>Need to replace the link?</strong>
          <span>Regenerating invalidates the old Player link and QR immediately.</span>
        </div>
        <button class="btn ghost" id="regeneratePlayerLink">Regenerate link & QR</button>
      </div>
    </section>

    <section class="card">
      <div class="section-label">Non-playing staff</div>
      <h2>Invite non-playing staff</h2>
      <div class="notice"><strong>Playing coach or captain?</strong><br>They still use the normal <strong>Player sign-up</strong>. Do not give them a second account.</div>
      <div class="help" style="margin-top:14px">Use the staff route for a genuinely non-playing coach or other staff member who needs to be in Club Batting but should not receive a Player Plan.</div>
      <div class="signup-count" style="margin-top:14px"><strong>${nonPlayingStaffCount}</strong> non-playing staff registered</div>
      <div class="btnrow"><button class="btn secondary" id="copyStaffJoinLink">Copy non-playing staff sign-up link</button></div>
      <div id="staffJoinStatus" class="help"></div>
      <div class="permission-explainer">
        <strong>Registration still does not grant player access.</strong>
        <span>After they join, find them under Club roles below, assign their role, then choose the Playing Groups or whole-club access they need.</span>
      </div>
    </section>
  </div>

  <section class="card" style="margin-top:16px">
    <div class="section-label">Club roles</div>
    <h2>Assign club roles and player access</h2>
    <div class="help">This list is intentionally <strong>not</strong> every person in Club Batting. It contains only people who have been assigned a club role. A Philosophy Contributor stays out of this list unless you separately make them a Captain, Coach, Head Coach or Admin.</div>

    <div class="field" style="margin-top:14px">
      <label>Find a registered person</label>
      <input id="clubPersonSearch" placeholder="Start typing a name…" autocomplete="off">
      <small>Search players and other registered people. Choose a club role to add them below.</small>
    </div>
    <div id="clubPersonSearchResults" class="member-list"></div>

    <div style="margin-top:18px">
      <div class="section-label">People with club roles</div>
      <div class="member-list">${roleMemberHtml||'<div class="notice">No Captain, Coach, Head Coach or additional Admin roles have been assigned yet.</div>'}</div>
    </div>
  </section>

  <section class="card admin-continuity-card" style="margin-top:16px">
    <div class="admin-continuity-head">
      <div>
        <div class="section-label">Admin continuity</div>
        <h2>Lead Admin</h2>
        <div class="help">A club can have several Club Admins. The <strong>Lead Admin</strong> is simply the current custodian responsible for formally handing the system to the next person when committee or coaching roles change.</div>
      </div>
      <div class="lead-admin-badge">
        <span>Current Lead Admin</span>
        <strong>${esc(leadAdminName)}</strong>
      </div>
    </div>

    ${pendingHandover?`
      <div class="handover-pending">
        <div>
          <strong>Handover pending</strong>
          <span>${esc(pendingHandover.invited_name||pendingHandover.invited_email)} has been nominated. Nothing changes until they accept.</span>
        </div>
        ${amLeadAdmin?`<button class="btn ghost" id="cancelLeadHandover">Cancel handover</button>`:''}
      </div>
    `:amLeadAdmin?`
      <div class="handover-start">
        <div>
          <strong>Leaving the role?</strong>
          <span>Use a formal handover rather than changing Admin permissions manually. Your successor accepts first, then they decide what access you retain.</span>
        </div>
        <button class="btn secondary" id="openLeadHandover">Hand over Lead Admin</button>
      </div>

      <div id="leadHandoverForm" class="lead-handover-form" style="display:none">
        <div class="section-label">Choose your successor</div>
        <div class="handover-successor-choice">
          <label class="handover-option on">
            <input type="radio" name="handoverSuccessorType" value="existing" checked>
            <strong>Someone already in this club</strong>
            <span>Choose a registered player, staff member or existing Admin.</span>
          </label>
          <label class="handover-option">
            <input type="radio" name="handoverSuccessorType" value="external">
            <strong>Someone not in the system yet</strong>
            <span>Send the handover directly to their email.</span>
          </label>
        </div>

        <div id="existingSuccessorBox">
          <div class="field">
            <label>Successor</label>
            <select id="handoverExistingUser">
              <option value="">Choose a person…</option>
              ${handoverCandidates.map(m=>{
                const nm=pMap.get(m.user_id)?.display_name||'Profile not completed';
                return `<option value="${m.user_id}">${esc(nm)} · ${esc(registrationLabel(m))}</option>`;
              }).join('')}
            </select>
          </div>
        </div>

        <div id="externalSuccessorBox" style="display:none">
          <div class="grid handover-external-grid">
            <div class="field"><label>Name</label><input id="handoverExternalName" placeholder="Full name"></div>
            <div class="field"><label>Email</label><input id="handoverExternalEmail" type="email" placeholder="name@example.com"></div>
          </div>
        </div>

        <div class="notice"><strong>Your access does not change when you send this.</strong><br>The nominated person must accept the handover. During acceptance, they set your new club role and access — including removing your club access entirely if you have left.</div>

        <div class="btnrow">
          <button class="btn secondary" id="sendLeadHandover">Send handover</button>
          <button class="btn ghost" id="closeLeadHandover">Cancel</button>
          <span class="status" id="leadHandoverFormStatus"></span>
        </div>

        <div id="leadHandoverTestLink" class="test-link-box" style="display:none"></div>
      </div>
    `:`
      <div class="notice"><strong>${esc(leadAdminName)} is responsible for the next formal handover.</strong><br>Other Club Admins still have full administration access, but the Lead Admin designation cannot be casually removed through the role controls above.</div>
    `}
  </section>
`;

  const playerWhatsAppMessage=`${club.name} players — Club Batting is ready for player registration.\n\nUse this link to join as a Player:\n${playerJoinLink}\n\nYou’ll sign in securely with your email and confirm your name. If you are also a captain or coach, still use this Player link — the club will add that role afterwards. ${plansReady?'Read How We Bat, build your Player Plan and use How We Train to put it into practice.':'The club is preparing How We Bat and the Player Plan questions. Register now; we’ll email you when your plan is ready to start. Anyone assigned a setup role can take part in preparation now.'}`;

  const copyText=async(text,label,statusId)=>{
    const st=document.getElementById(statusId);
    try{
      await navigator.clipboard.writeText(text);
      if(st)st.textContent=`${label} copied ✓`;
    }catch(e){
      if(st)st.textContent='Could not copy automatically — select and copy it manually.';
    }
  };

  document.getElementById('copyPlayerWhatsApp').onclick=()=>copyText(
    playerWhatsAppMessage,'WhatsApp message','playerShareStatus'
  );
  document.getElementById('copyPlayerLink').onclick=()=>copyText(
    playerJoinLink,'Player sign-up link','playerShareStatus'
  );
  document.getElementById('copyStaffJoinLink').onclick=()=>copyText(
    staffJoinLink,'Non-playing staff sign-up link','staffJoinStatus'
  );

  document.getElementById('togglePlayerSignup').onclick=async()=>{
    const button=document.getElementById('togglePlayerSignup');
    button.disabled=true;
    button.textContent=signupOpen?'Closing…':'Opening…';
    const {error}=await supabase.rpc('set_player_signup_open',{
      p_club_id:club.id,
      p_open:!signupOpen
    });
    if(error){alert(error.message);button.disabled=false;return;}
    await loadContext();
  };

  document.getElementById('regeneratePlayerLink').onclick=async()=>{
    const ok=confirm('Regenerate the Player Sign-up link and QR? The current link and QR will stop working immediately.');
    if(!ok)return;
    const button=document.getElementById('regeneratePlayerLink');
    button.disabled=true;
    button.textContent='Regenerating…';
    const {error}=await supabase.rpc('regenerate_player_join_token',{p_club_id:club.id});
    if(error){alert(error.message);button.disabled=false;button.textContent='Regenerate link & QR';return;}
    await loadContext();
  };


  renderPlayerQRCode(playerJoinLink);

  const renderPersonSearch=()=>{
    const wrap=document.getElementById('clubPersonSearchResults');
    const q=(document.getElementById('clubPersonSearch')?.value||'').trim().toLowerCase();
    if(!wrap)return;
    if(q.length<2){
      wrap.innerHTML='<div class="help" style="padding:8px 0">Type at least two letters to find someone who does not already have a club role.</div>';
      return;
    }
    const matches=roleCandidates
      .filter(m=>(pMap.get(m.user_id)?.display_name||'').toLowerCase().includes(q))
      .slice(0,12);
    wrap.innerHTML=matches.length?matches.map(m=>{
      const name=pMap.get(m.user_id)?.display_name||'Profile not completed';
      return `<div class="member">
        <div><strong>${esc(name)}</strong><small>${esc(registrationLabel(m))}</small></div>
        <div class="member-controls">
          <select data-new-club-role="${m.user_id}">
            <option value="captain">Captain</option>
            <option value="coach">Coach</option>
            <option value="head_coach">Head Coach</option>
            <option value="admin">Admin</option>
          </select>
          <button class="btn secondary" data-assign-club-role="${m.user_id}">Assign role</button>
        </div>
      </div>`;
    }).join(''):'<div class="notice">No matching person is waiting for a role. Check People with club roles below, or ask them to register using the player or staff link.</div>';

    wrap.querySelectorAll('[data-assign-club-role]').forEach(b=>b.onclick=async()=>{
      const userId=b.dataset.assignClubRole;
      const role=wrap.querySelector(`[data-new-club-role="${userId}"]`)?.value;
      if(!role)return;
      b.disabled=true;
      b.textContent='Assigning…';
      const {error}=await supabase
        .from('club_memberships')
        .update({permission_role:role})
        .eq('club_id',club.id)
        .eq('user_id',userId);
      if(error){alert(error.message);b.disabled=false;b.textContent='Assign role';return;}
      await loadContext();
    });
  };

  document.getElementById('clubPersonSearch').oninput=renderPersonSearch;
  renderPersonSearch();

  if(document.getElementById('openLeadHandover')){
    document.getElementById('openLeadHandover').onclick=()=>{
      document.getElementById('leadHandoverForm').style.display='block';
      document.getElementById('openLeadHandover').disabled=true;
    };
  }

  if(document.getElementById('closeLeadHandover')){
    document.getElementById('closeLeadHandover').onclick=()=>{
      document.getElementById('leadHandoverForm').style.display='none';
      document.getElementById('openLeadHandover').disabled=false;
    };
  }

  document.querySelectorAll('input[name="handoverSuccessorType"]').forEach(r=>r.onchange=()=>{
    document.querySelectorAll('.handover-option').forEach(x=>x.classList.toggle('on',x.querySelector('input').checked));
    const type=document.querySelector('input[name="handoverSuccessorType"]:checked')?.value||'existing';
    document.getElementById('existingSuccessorBox').style.display=type==='existing'?'block':'none';
    document.getElementById('externalSuccessorBox').style.display=type==='external'?'block':'none';
  });

  if(document.getElementById('sendLeadHandover')){
    document.getElementById('sendLeadHandover').onclick=async()=>{
      const st=document.getElementById('leadHandoverFormStatus');
      const btn=document.getElementById('sendLeadHandover');
      const type=document.querySelector('input[name="handoverSuccessorType"]:checked')?.value||'existing';

      let successorUserId=null;
      let successorName='';
      let successorEmail='';

      if(type==='existing'){
        successorUserId=document.getElementById('handoverExistingUser').value||null;
        if(!successorUserId){
          st.textContent='Choose the person who should take over.';
          return;
        }
      }else{
        successorName=val('handoverExternalName');
        successorEmail=val('handoverExternalEmail');
        if(!successorEmail || !successorEmail.includes('@')){
          st.textContent='Enter a valid successor email address.';
          return;
        }
      }

      btn.disabled=true;
      btn.textContent='Sending…';
      st.textContent='';

      const {data,error}=await supabase.rpc('initiate_lead_admin_handover',{
        p_club_id:club.id,
        p_successor_user_id:successorUserId,
        p_successor_name:successorName,
        p_successor_email:successorEmail
      });

      if(error){
        btn.disabled=false;
        btn.textContent='Send handover';
        st.textContent=error.message;
        return;
      }

      btn.textContent='Handover sent ✓';
      st.textContent='Nothing has changed yet. The nominated person must accept first.';

      const testLink=`${location.origin}${location.pathname}?lead_handover=${encodeURIComponent(data.handover_token)}`;
      const box=document.getElementById('leadHandoverTestLink');
      box.style.display='block';
      box.innerHTML=`<strong>Prototype test link</strong><span>Until live email delivery is connected, use this to test the acceptance flow.</span><button class="btn ghost" id="copyLeadHandoverTestLink">Copy test link</button>`;

      document.getElementById('copyLeadHandoverTestLink').onclick=()=>copyText(
        testLink,'Handover test link','leadHandoverFormStatus'
      );
    };
  }

  if(document.getElementById('cancelLeadHandover')){
    document.getElementById('cancelLeadHandover').onclick=async()=>{
      const ok=confirm('Cancel the pending Lead Admin handover? Nothing else will change.');
      if(!ok)return;
      const {error}=await supabase.rpc('cancel_lead_admin_handover',{
        p_handover_id:pendingHandover.id
      });
      if(error){alert(error.message);return;}
      await loadContext();
    };
  }

  const markPermissionDirty=userId=>{
    const button=document.querySelector(`[data-save-user="${userId}"]`);
    if(!button)return;
    button.disabled=false;
    button.textContent='Save changes';
  };

  document.querySelectorAll('[data-role-user]').forEach(s=>s.onchange=()=>{
    markPermissionDirty(s.dataset.roleUser);
  });

  document.querySelectorAll('[data-access-user]').forEach(s=>s.onchange=()=>{
    const picker=document.querySelector(`[data-group-picker-user="${s.dataset.accessUser}"]`);
    if(picker)picker.style.display=['groups_view','groups_edit'].includes(s.value)?'flex':'none';
    markPermissionDirty(s.dataset.accessUser);
  });

  document.querySelectorAll('[data-access-group-user]').forEach(x=>x.onchange=()=>{
    markPermissionDirty(x.dataset.accessGroupUser);
  });

  document.querySelectorAll('[data-save-user]').forEach(b=>b.onclick=()=>saveMemberPermission(b.dataset.saveUser));
}

function labelInvolvement(v){
  return v==='player'
    ?'Player'
    :v==='coach_captain'
      ?'Coach / Captain'
      :v==='both'
        ?'Player + Coach / Captain'
        :v==='philosophy_contributor'
          ?'Philosophy Contributor'
          :'Not set';
}

async function saveMemberPermission(userId){
  const button=document.querySelector(`[data-save-user="${userId}"]`);
  const role=document.querySelector(`[data-role-user="${userId}"]`).value;
  const access=role==='admin'?'whole_edit':(document.querySelector(`[data-access-user="${userId}"]`)?.value||'pending');
  const selectedGroupIds=[...document.querySelectorAll(`[data-access-group-user="${userId}"]:checked`)].map(x=>x.value);

  if(button){
    button.disabled=true;
    button.textContent='Saving…';
  }

  const restoreUnsavedButton=()=>{
    if(!button)return;
    button.disabled=false;
    button.textContent='Save changes';
  };

  const {error:roleError}=await supabase
    .from('club_memberships')
    .update({permission_role:role})
    .eq('club_id',club.id)
    .eq('user_id',userId);

  if(roleError){restoreUnsavedButton();alert(roleError.message);return;}

  const {error:deleteError}=await supabase
    .from('club_access_grants')
    .delete()
    .eq('club_id',club.id)
    .eq('user_id',userId);

  if(deleteError){restoreUnsavedButton();alert(deleteError.message);return;}

  let rows=[];
  if(access==='whole_view'){
    rows=[{club_id:club.id,user_id:userId,scope:'whole_club',can_view:true,can_edit:false}];
  }
  if(access==='whole_edit'){
    rows=[{club_id:club.id,user_id:userId,scope:'whole_club',can_view:true,can_edit:true}];
  }
  if(access==='groups_view' || access==='groups_edit'){
    if(!selectedGroupIds.length){
      restoreUnsavedButton();
      alert('Choose at least one Playing Group for this access level.');
      return;
    }
    rows=selectedGroupIds.map(groupId=>({
      club_id:club.id,
      user_id:userId,
      scope:'playing_group',
      playing_group_id:groupId,
      can_view:true,
      can_edit:access==='groups_edit'
    }));
  }

  if(rows.length){
    const {error}=await supabase.from('club_access_grants').insert(rows);
    if(error){alert(error.message);return;}
  }

  if(button)button.textContent='Saved ✓';
  await loadContext();
}


/* ---------------- HOW WE TRAIN + DEVELOPMENT FEEDBACK ---------------- */

function formatLabel(format){
  return FORMATS.find(([k])=>k===format)?.[1]||format;
}

function answerText(answer){
  if(!answer)return '';
  return [...(answer.choices||[]),String(answer.comment||'').trim()].filter(Boolean).join(' · ');
}

function formatDateShort(value){
  if(!value)return 'Date not recorded';
  const d=new Date(`${String(value).slice(0,10)}T00:00:00`);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
}

function todayIso(){
  const d=new Date();
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function radioChoiceHtml(name,options,selected=''){
  return `<div class="quick-choice-grid">${options.map(([value,label,detail])=>`<label class="quick-choice ${selected===value?'selected':''}">
    <input type="radio" name="${esc(name)}" value="${esc(value)}" ${selected===value?'checked':''}>
    <span><strong>${esc(label)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</span>
  </label>`).join('')}</div>`;
}

function wireQuickChoices(root=document){
  root.querySelectorAll('.quick-choice input').forEach(input=>input.onchange=()=>{
    const name=input.name;
    root.querySelectorAll(`.quick-choice input[name="${name}"]`).forEach(x=>x.closest('.quick-choice')?.classList.toggle('selected',x.checked));
  });
}

function howWeTrainPracticeForBanner(banner,format){
  const known=HOW_WE_TRAIN_REFERENCE[banner?.key];
  if(known){
    return {title:known.title,points:[...(known[format]||[])]};
  }
  const refs=(banner?.reference_points||[]).filter(Boolean).slice(0,2);
  return {
    title:`Train “${banner?.title||'this Key Message'}”`,
    points:refs.length
      ?refs.map(x=>`Create a realistic practice scenario that makes the player apply this decision: ${x}`)
      :[
        'Use a realistic field and mixed deliveries so the batter must make the decision described by this Key Message — not simply repeat a shot.',
        'Change the bowling or match situation during the drill so the player has to recognise when the message applies.'
      ]
  };
}

function trainingCueForQuestion(question){
  return DIMENSION_TRAINING_CUES[question?.source_dimension]
    ||'Turn this answer into a realistic scenario. Mix the deliveries so the player must recognise when the option belongs in their plan.';
}

function coreTrainingCards(raw){
  const core=raw?.core||{};
  const strengths=answerText(core.core_strengths);
  const danger=answerText(core.core_danger);
  const reset=answerText(core.core_reset);
  const focus=answerText(core.core_focus);
  const cards=[];

  if(strengths)cards.push({
    kind:'core_strengths',
    label:'MY TRUSTED OPTIONS',
    title:'Train the ball that earns your shot',
    value:strengths,
    cue:'Mix line and length. The shot only counts when the correct delivery activates one of these trusted options.'
  });
  if(danger)cards.push({
    kind:'core_danger',
    label:'MY DANGER',
    title:'Recreate the pressure that pulls you away from your plan',
    value:danger,
    cue:reset
      ?`Build the danger into the drill, then rehearse your reset: ${reset}.`
      :'Build this danger into the drill, then deliberately reset before the next ball.'
  });
  if(focus)cards.push({
    kind:'core_focus',
    label:'CURRENT DEVELOPMENT',
    title:'Keep the session specific',
    value:focus,
    cue:'Choose one or two of these priorities for the session rather than trying to train everything at once.'
  });
  return cards;
}

function formatTrainingCards(raw,format){
  return playerPlanQuestionsFor(format).map(q=>{
    const a=raw?.formats?.[format]?.[q.id];
    const value=answerText(a);
    if(!value)return null;
    return {
      kind:'format',
      label:q.label,
      value,
      cue:trainingCueForQuestion(q),
      dimension:q.source_dimension||null,
      hwbKey:q.source_hwb_key||null,
      hwbTitle:q.source_hwb_title||null
    };
  }).filter(Boolean).slice(0,6);
}

const TRAINING_SUCCESS_CHECKS={
  wicket_preservation:'Judge the decision before the outcome. A good ball respected is a successful rep, even when it scores nothing.',
  leaving_defending:'Track whether the batter identifies off stump and chooses the right response early rather than making a late survival decision.',
  strike_rotation:'Count how often the batter sees the single before the ball and accesses it without forcing a low-percentage shot.',
  boundary_access:'Recognise the right shot for the ball and full commitment, even when execution needs more practice. Review execution separately from whether the ball reached the boundary.',
  running:'Measure clear calls, first-run speed, turns and pressure created on the field — not just completed runs.',
  scoring_areas:'Look for recognition of the ball that suits a chosen scoring area and full commitment to the shot. Use execution details to shape the next practice block.',
  tempo:'The batter should be able to explain why the tempo changed. The match situation changes the intent; frustration does not.',
  matchups:'Look for the player to identify the matchup and choose an option they actually own, rather than inventing a new game.',
  spin_method:'Watch whether the player recognises length and field early enough to use feet, depth, sweep or rotation deliberately.',
  pace_method:'The player should connect line and length to a trusted response rather than deciding the shot before the ball.',
  risk_management:'Track whether risk changes for a cricket reason — score, wickets, field, phase or matchup — rather than emotion.',
  reset_routines:'The reset should be visible, repeatable and quick enough to use after a dot, mistake, appeal or pressure moment.',
  dot_ball_management:'The next ball should be played on its own merits. Success is avoiding the forced response that often follows several dots.',
  powerplay:'Look for deliberate use of field restrictions without turning every delivery into an attacking option.',
  death_overs:'The batter should recognise the high-intent option early and still retain a safe fallback when the ideal ball does not arrive.',
  innovation:'Only count the option when the right ball and field are present. Innovation should widen a plan, not replace one.',
  patience:'Measure decision quality across a longer block. The batter should stay mentally active even when scoring opportunities are scarce.',
  partnerships:'Look for strike changes, communication and choices that use both batters’ strengths rather than two isolated individual plans.'
};

function trainingDepthForCard(card,format){
  if(card.kind==='core_strengths')return {
    ideas:[
      'Start with repetitions of a shot you have chosen for your plan. Then mix deliveries and use a realistic field so you practise recognising when to play it.',
      'When the right ball arrives, commit fully. Give credit for the preparation, decision and commitment even if execution falls short; choose one useful detail to practise next.'
    ],
    success:'You recognise when your shot is on and trust it. Review how well you chose and executed it separately, without letting a single outcome decide whether the work was worthwhile.'
  };
  if(card.kind==='core_danger')return {
    ideas:[
      'Deliberately recreate the trigger: dots, a bowler tying you down, a field closing a favourite area, a previous mistake or a required-rate squeeze.',
      'Pause the drill when the trigger appears, use your reset, then restart with a mixed next ball so the reset has to lead back to a good decision.'
    ],
    success:'The danger can still appear, but it no longer automatically changes your next decision. Your reset gets you back to your plan.'
  };
  if(card.kind==='core_focus')return {
    ideas:[
      'Pick one development priority for a block of 12–18 balls. Give it a clear scoring or decision target rather than simply doing extra repetitions.',
      'Progress it once it is stable: change the field, bowler type, pace, angle or match situation so the skill has to survive a more realistic problem.'
    ],
    success:'You can describe exactly what improved during the block and what still breaks down when the practice becomes more match-like.'
  };
  const reference=card.hwbKey?HOW_WE_TRAIN_REFERENCE[card.hwbKey]:null;
  const ideas=reference?.[format]?.slice(0,2)||[
    card.cue,
    'Progress the drill by changing the field, bowler, score or match situation so the same decision has to be made under a different problem.'
  ];
  return {
    ideas,
    success:TRAINING_SUCCESS_CHECKS[card.dimension]||'Judge the quality of the decision first, then the execution. The drill is working when the player recognises the right option without being told.'
  };
}

function renderTrainingPlanCard(card,format){
  const depth=trainingDepthForCard(card,format);
  const danger=card.kind==='core_danger';
  const heading=card.kind==='format'
    ? `<div class="train-card-label">${esc(card.label)}</div><h3 class="train-card-player-choice">${esc(card.value)}</h3>`
    : `<div class="train-card-label ${danger?'danger':''}">${esc(card.label)}</div>${card.title?`<h3>${esc(card.title)}</h3>`:''}<div class="train-card-answer">${esc(card.value)}</div>`;
  return `<article class="train-plan-card ${card.kind==='format'?'format-question-card':'core-training-card'} ${danger?'danger-card':''}">
    ${heading}
    <p class="train-card-cue">${esc(card.cue)}</p>
    <details class="train-card-depth">
      <summary><span>Go deeper →</span><em>More detail</em></summary>
      <div class="train-card-depth-body">
        <div class="train-depth-block"><b>BUILD THE PRACTICE</b>${depth.ideas.map(x=>`<p>${esc(x)}</p>`).join('')}</div>
        <div class="train-depth-block success"><b>WHAT GOOD LOOKS LIKE</b><p>${esc(depth.success)}</p></div>
      </div>
    </details>
  </article>`;
}

function developmentFocusItems(data,raw){
  const items=[];
  for(const o of data?.training_observations||[]){
    if(!String(o.next_training_focus||'').trim())continue;
    items.push({
      text:o.next_training_focus.trim(),
      source:`Training observation · ${o.observer_name||'Coach / Captain'}`,
      date:o.observed_on||o.created_at||'',
      type:'feedback'
    });
  }
  for(const e of data?.external_training_evidence||[]){
    if(!String(e.next_training_focus||'').trim())continue;
    items.push({
      text:e.next_training_focus.trim(),
      source:`External evidence · ${e.source_label||e.source_key||'connected source'}`,
      date:e.recorded_at||e.created_at||'',
      type:'external'
    });
  }
  for(const m of data?.matches||[]){
    for(const f of m.coach_feedback||[]){
      if(!String(f.next_training_focus||'').trim())continue;
      items.push({
        text:f.next_training_focus.trim(),
        source:`Match feedback · ${f.author_name||'Coach / Captain'}`,
        date:f.created_at||m.match_date||'',
        type:'feedback'
      });
    }
    if(String(m.player_reflection?.next_training_focus||'').trim()){
      items.push({
        text:m.player_reflection.next_training_focus.trim(),
        source:'Your innings reflection',
        date:m.player_reflection.updated_at||m.match_date||'',
        type:'reflection'
      });
    }
  }

  items.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const unique=[];
  const seen=new Set();
  for(const item of items){
    const key=item.text.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    unique.push(item);
    if(unique.length===3)break;
  }
  if(unique.length)return unique;

  const coreFocus=raw?.core?.core_focus?.choices||[];
  if(coreFocus.length){
    return coreFocus.slice(0,3).map(x=>({text:x,source:'Your Player Plan',date:'',type:'plan'}));
  }
  const danger=raw?.core?.core_danger?.choices||[];
  if(danger.length){
    return [{text:`Recreate and control: ${danger[0]}`,source:'Your Player Plan · My Danger',date:'',type:'plan'}];
  }
  return [];
}

function developmentAlignment(reflection,coachFeedback){
  if(!reflection||!coachFeedback)return null;
  const samePlan=reflection.batting_to_plan===coachFeedback.batting_to_plan;
  const sameDismissal=reflection.dismissal_classification===coachFeedback.dismissal_classification;
  return samePlan&&sameDismissal
    ?{key:'aligned',label:'PLAYER + COACH ALIGNED'}
    :{key:'discuss',label:'WORTH DISCUSSING'};
}

function matchMetaLine(match){
  const bits=[formatDateShort(match.match_date),formatLabel(match.format_key)];
  if(match.opposition)bits.push(`v ${match.opposition}`);
  if(match.score_text)bits.push(match.score_text);
  return bits.filter(Boolean).join(' · ');
}

function developmentViewBlock(title,view,author=''){
  if(!view)return `<div class="development-view empty"><strong>${esc(title)}</strong><span>No entry yet.</span></div>`;
  return `<div class="development-view">
    <div class="development-view-title"><strong>${esc(title)}</strong>${author?`<span>${esc(author)}</span>`:''}</div>
    <div class="development-mini-grid">
      <span><small>INNINGS OVERALL · BATTED TO PLAN</small><strong>${esc(PLAN_ALIGNMENT_LABELS[view.batting_to_plan]||'—')}</strong></span>
      <span><small>DISMISSAL BALL</small><strong>${esc(DISMISSAL_CLASSIFICATION_LABELS[view.dismissal_classification]||'—')}</strong></span>
      ${view.main_issue?`<span><small>MAIN ISSUE</small><strong>${esc(DEVELOPMENT_ISSUE_LABELS[view.main_issue]||view.main_issue)}</strong></span>`:''}
    </div>
    ${view.next_training_focus?`<div class="development-next"><small>TRAIN NEXT</small><strong>${esc(view.next_training_focus)}</strong></div>`:''}
    ${view.note?`<p>${esc(view.note)}</p>`:''}
  </div>`;
}

function renderDevelopmentMatchCard(match,{playerMode=false,staffCanEdit=false}={}){
  const coaches=Array.isArray(match.coach_feedback)?match.coach_feedback:[];
  const latestCoach=coaches[0]||null;
  const alignment=developmentAlignment(match.player_reflection,latestCoach);
  const reflectionNeeded=playerMode && !match.player_reflection && coaches.length>0;

  return `<article class="development-match-card ${reflectionNeeded?'reflection-needed':''}">
    <div class="development-match-head">
      <div>
        <div class="section-label">${esc(matchMetaLine(match))}</div>
        <h3>${esc(match.dismissal_summary||'Innings reflection')}</h3>
      </div>
      ${reflectionNeeded
        ?'<span class="alignment-badge discuss">REFLECTION NEEDED</span>'
        :alignment?`<span class="alignment-badge ${alignment.key}">${esc(alignment.label)}</span>`:''}
    </div>
    ${reflectionNeeded?`
      <div class="reflection-needed-copy">
        <strong>A coach has added feedback about this innings.</strong>
        <span>Add your own reflection first. Their answers stay hidden until you have recorded your view, so the comparison is genuinely yours.</span>
      </div>
    `:`<div class="development-compare-grid">
      ${developmentViewBlock('PLAYER VIEW',match.player_reflection)}
      ${coaches.length
        ?coaches.slice(0,2).map(f=>developmentViewBlock('COACH VIEW',f,f.author_name||'Coach / Captain')).join('')
        :developmentViewBlock('COACH VIEW',null)}
    </div>`}
    <div class="development-actions">
      ${playerMode?`<button class="btn ${reflectionNeeded?'secondary':'ghost'}" data-edit-my-reflection="${match.id}">${match.player_reflection?'Edit my reflection':'Add my reflection'}</button>`:''}
      ${staffCanEdit?`<button class="btn ghost" data-add-coach-feedback="${match.id}">Add coaching feedback</button>`:''}
    </div>
  </article>`;
}

function renderTrainingObservationCard(o){
  const formats=(o.format_keys||[]).map(formatLabel).join(' + ')||'General / Core';
  return `<article class="training-observation-card">
    <div class="training-observation-head">
      <div><div class="section-label">${esc(formatDateShort(o.observed_on))} · ${esc(formats)}</div><h3>${esc(TRAINING_OBSERVATION_LABELS[o.observation_type]||'Training observation')}</h3></div>
      <span class="observation-plan-badge ${esc(o.training_to_plan)}">${esc(PLAN_ALIGNMENT_LABELS[o.training_to_plan]||'—')} · training to plan</span>
    </div>
    <div class="help">${esc(o.observer_name||'Coach / Captain')}</div>
    ${o.next_training_focus?`<div class="development-next"><small>TRAIN NEXT</small><strong>${esc(o.next_training_focus)}</strong></div>`:''}
    ${o.note?`<p>${esc(o.note)}</p>`:''}
  </article>`;
}

// Capture the actual rendered values (including selected options and existing
// reflections). These entries require an explicit Save; never autosave a
// partially completed observation when the user tries to leave.
const feedbackEntryBaselines=new WeakMap();
function feedbackEntryValues(form){
  return JSON.stringify([...form.querySelectorAll('input,textarea,select')].map(field=>[
    field.tagName,field.id||'',field.name||'',field.value,!!field.checked
  ]));
}
function captureFeedbackEntryBaseline(){
  for(const id of ['myReflectionForm','staffDevelopmentForm','coachingActionForm','coachingReviewForm']){
    const form=document.getElementById(id);
    if(form&&!feedbackEntryBaselines.has(form))feedbackEntryBaselines.set(form,feedbackEntryValues(form));
  }
}
function confirmLeaveFeedbackEntry(){
  if(typeof coachingActionSavePending!=='undefined'&&coachingActionSavePending){alert('Your agreed action is still saving. Please wait before leaving.');return false;}
  const dirty=['myReflectionForm','staffDevelopmentForm','coachingActionForm','coachingReviewForm'].some(id=>{
    const form=document.getElementById(id);
    return form&&feedbackEntryBaselines.has(form)&&feedbackEntryBaselines.get(form)!==feedbackEntryValues(form);
  });
  return !dirty||confirm('You have an unsaved reflection, observation or agreed action. Leave without saving it? Choose Cancel to keep editing.');
}

function renderMyReflectionForm(match=null){
  const r=match?.player_reflection||{};
  const format=match?.format_key||publishedEnabledFormats()[0]?.[0]||'limited_overs';
  return `<section class="card development-entry-form" id="myReflectionForm">
    <div class="development-form-head">
      <div><div class="section-label">Player reflection</div><h2>${match?'Update this innings':'Reflect on an innings'}</h2><div class="help">Give yourself credit for your preparation and commitment. Review the innings overall, then the dismissal ball: one choice need not describe the whole innings. Did that ball and situation suit your shot? How well did you execute it? Getting out alone does not make either wrong. Choose useful practice, without judgement.</div></div>
    </div>
    <div class="development-match-fields">
      <div class="field"><label>Date</label><input id="reflectionDate" type="date" value="${esc(match?.match_date||todayIso())}"></div>
      <div class="field"><label>Format</label><select id="reflectionFormat">${publishedEnabledFormats().map(([k,l])=>`<option value="${k}" ${format===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label>Opposition <span>optional</span></label><input id="reflectionOpposition" maxlength="160" value="${esc(match?.opposition||'')}" placeholder="e.g. Merewether"></div>
      <div class="field"><label>Score <span>optional</span></label><input id="reflectionScore" maxlength="80" value="${esc(match?.score_text||'')}" placeholder="e.g. 34 or 34*"></div>
    </div>
    <div class="field"><label>Dismissal / innings note <span>optional</span></label><input id="reflectionDismissal" maxlength="300" value="${esc(match?.dismissal_summary||'')}" placeholder="e.g. Pulled a short ball; caught on the boundary"></div>

    <div class="development-question"><label>In the innings overall, did I bat to my Player Plan?</label>${radioChoiceHtml('myBattingToPlan',[["yes","Yes","Overall, my approach matched my plan"],["mostly","Mostly","Some periods or choices moved outside it"],["no","No","My approach moved away from my plan"]],r.batting_to_plan||'')}</div>
    <div class="development-question"><label>On the dismissal ball, how did my choice fit my plan?</label>${radioChoiceHtml('myDismissalClass',[["plan_execution","Within plan · execution to improve","Right shot and ball; I identified an execution detail to practise"],["outside_plan","Decision outside plan","The option for this ball was outside my plan"],["not_applicable","Not really a Player Plan issue","Not dismissed / good bowling / run out / other"]],r.dismissal_classification||'')}</div>
    <div class="development-question"><label>Main issue <span>optional</span></label>
      <select id="reflectionMainIssue"><option value="">Choose only if useful</option>${Object.entries(DEVELOPMENT_ISSUE_LABELS).map(([k,l])=>`<option value="${k}" ${r.main_issue===k?'selected':''}>${esc(l)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>One thing to train next <span>optional</span></label><input id="reflectionNextFocus" maxlength="240" value="${esc(r.next_training_focus||'')}" placeholder="One useful focus is enough"></div>
    <div class="field"><label>Anything else? <span>optional</span></label><textarea id="reflectionNote" maxlength="500" rows="3" placeholder="Short note only if it adds something useful">${esc(r.note||'')}</textarea></div>
    <div class="btnrow"><button class="btn secondary" id="saveMyReflection">Save reflection</button><button class="btn ghost" id="cancelMyReflection">Cancel</button><span class="status" id="myReflectionStatus"></span></div>
  </section>`;
}

function renderHowWeTrainFormat(format,snapshot){
  const label=formatLabel(format);
  const formatData=snapshot?.formats?.[format];
  const banners=formatData?.banners||[];
  return `<section class="card train-format-section">
    <div class="train-format-head">
      <div><div class="section-label">${esc(label)} training</div><h2>Train the decisions this format demands.</h2><p>${esc(formatData?.intro||HOW_WE_BAT_FORMAT_COPY[format]?.intro||'')}</p></div>
      ${formatData?.callout?`<div class="train-format-callout">${esc(formatData.callout)}</div>`:''}
    </div>
    <div class="train-message-grid">
      ${banners.length?banners.map(b=>{
        const practice=howWeTrainPracticeForBanner(b,format);
        return `<article class="train-message-card">
          <div class="section-label">FROM HOW WE BAT</div>
          <h3>${esc(b.title||'Key Message')}</h3>
          <p class="train-message-summary">${esc(b.message||'')}</p>
          <div class="train-drill-title">${esc(practice.title)}</div>
          <ul>${practice.points.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        </article>`;
      }).join(''):'<div class="notice">No How We Bat Key Messages are published for this format yet.</div>'}
    </div>
  </section>`;
}

function renderTrainMyPlan(raw,formats){
  const coreCards=coreTrainingCards(raw);
  const coreProgress=sectionProgress('core',raw);
  const coreReady=coreProgress.complete;
  const formatBlocks=formats.map(format=>{
    const cards=formatTrainingCards(raw,format);
    const progress=sectionProgress(format,raw);
    const ready=coreReady&&progress.complete;
    return `<div class="train-my-format">
      <div class="train-my-format-head"><div><div class="section-label">${esc(formatLabel(format))}</div><h3>Train my ${esc(formatLabel(format))} plan</h3></div></div>
      ${ready
        ?(cards.length?`<div class="train-personal-grid">${cards.map(c=>`<article class="train-personal-card"><small>${esc(c.label)}</small><strong>${esc(c.value)}</strong><p>${esc(c.cue)}</p></article>`).join('')}</div>`:`<div class="notice">Your ${esc(formatLabel(format))} plan is complete, but there are no training cues to display yet.</div>`)
        :`<div class="train-plan-gate"><div><strong>Complete your ${esc(formatLabel(format))} Player Plan to unlock targeted ${esc(formatLabel(format))} training.</strong><span>How We Train uses your Core batting identity plus your ${esc(formatLabel(format))} answers. Until both are complete, this section stays general rather than pretending to be personalised.</span></div><button class="btn secondary" data-go="myplan">Complete My Player Plan</button></div>`}
    </div>`;
  }).join('');

  return `<section class="card train-my-plan">
    <div class="train-my-plan-head">
      <div><div class="section-label">Train My Plan</div><h2>Practise the game you have actually chosen.</h2><div class="help">Practise executing your chosen shots, then mix the deliveries so you must recognise the right ball and commit. Train the decision as well as the shot.</div></div>
      <button class="btn ghost" data-go="myplan">Open My Player Plan</button>
    </div>
    ${coreReady
      ?(coreCards.length?`<div class="train-personal-grid core">${coreCards.map(c=>`<article class="train-personal-card"><small>${esc(c.label)}</small><h3>${esc(c.title)}</h3><strong>${esc(c.value)}</strong><p>${esc(c.cue)}</p></article>`).join('')}</div>`:`<div class="notice">Your Core Player Plan is complete. Complete a format section below to unlock its targeted training plan.</div>`)
      :`<div class="train-plan-gate core"><div><strong>Start with your Core Player Plan.</strong><span>Your training plan needs your batting identity, trusted options, Danger and Reset before format-specific practice can be genuinely targeted.</span></div><button class="btn secondary" data-go="myplan">Complete My Player Plan</button></div>`}
    ${formatBlocks}
  </section>`;
}

function coachingReviewDateDefault(){
  const date=new Date();date.setDate(date.getDate()+7);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
let coachingActionSavePending=false;

function renderCoachingActions(feedback,{playerMode=true}={}){
  const actions=Array.isArray(feedback?.coaching_actions)?feedback.coaching_actions:[];
  const open=actions.filter(a=>a.status==='open').sort((a,b)=>String(a.review_on).localeCompare(String(b.review_on)));
  const closed=actions.filter(a=>a.status!=='open').sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
  const card=a=>{
    const due=a.status==='open'&&String(a.review_on)<=todayIso();
    return `<article class="training-observation-card" style="margin-top:12px">
      <div class="section-label">${esc(a.format_key?formatLabel(a.format_key):'All formats')} · ${a.status==='open'?(due?'Review due':'Agreed action'):a.status==='completed'?'Completed':'Stopped'}</div>
      <h3>${esc(a.task)}</h3>
      <p class="help">${playerMode?'Your next action':'Player’s next action'} · Recorded by ${esc(a.recorded_by_name||'Club coaching team')} · ${a.status==='open'?'Review':'Review date'} ${esc(formatDateShort(a.review_on))}</p>
      ${a.status==='open'&&a.can_review?`<button class="btn secondary" data-review-coaching-action="${esc(a.id)}">${due?'Review this action':'Record progress'}</button>`:''}
      <div data-coaching-review-slot="${esc(a.id)}"></div>
      ${a.reviews?.length?`<details style="margin-top:10px"><summary>Agreement and review history</summary>${a.reviews.map(r=>`<p><strong>${Number(r.revision)===1?'Agreed':r.outcome==='continue'?'Continue practising':r.outcome==='completed'?'Completed':'Stopped'} · ${esc(formatDateShort(r.reviewed_at))}</strong><br>${esc(r.note)}<br><small>${esc(r.reviewed_by_name||'Club member')}${r.next_review_on?` · Review ${esc(formatDateShort(r.next_review_on))}`:''}</small></p>`).join('')}</details>`:''}
    </article>`;
  };
  return `<section class="card" id="sharedCoachingActions"><div class="section-label">Agreed next actions</div><h2>${open.length?'Take your next step into training.':'Keep the useful part of each conversation.'}</h2><p>One agreed action and a date to check how it went. The player and authorised coaching team see the same action and updates.</p>${feedback?.coaching_actions_error?'<div class="notice">Shared actions could not load. Reload this page to try again; your other feedback is still available.</div>':''}${open.length?open.map(card).join(''):!feedback?.coaching_actions_error?'<p class="help">No open agreed actions. After a coaching conversation, record the next training focus and when to review it.</p>':''}${closed.length?`<details style="margin-top:14px"><summary>Previous actions (${closed.length})</summary>${closed.map(card).join('')}</details>`:''}</section>`;
}

function freezeCoachingForm(form){
  const fields=[...form.querySelectorAll('input,textarea,select,button')].map(field=>[field,field.disabled]);
  fields.forEach(([field])=>{field.disabled=true;});
  return ()=>fields.forEach(([field,disabled])=>{field.disabled=disabled;});
}

function openCoachingConversationForm(signal,outcome,host,onSaved){
  if(!host||coachingActionSavePending||!confirmLeaveFeedbackEntry())return;
  document.getElementById('coachingActionForm')?.remove();
  document.getElementById('coachingReviewForm')?.remove();
  const needsAction=['adjust_training','review_plan'].includes(outcome);
  const form=document.createElement('div');form.id='coachingActionForm';form.className='development-entry-form';
  form.innerHTML=`<h3>${needsAction?'What did you agree to do next?':'Record this conversation'}</h3><p class="help">${needsAction?`${esc(signal.player.display_name||'The player')} will see this in How We Train. Record an action you have discussed together. ${outcome==='review_plan'?'The Player Plan itself stays unchanged until you edit it.':''}`:outcome==='keep_plan'?'The plan stays as it is. Choose Training change agreed if there is something specific to practise.':'Record that this conversation needs no further action.'}</p>${needsAction?`<div class="field"><label for="coachingActionTask">One agreed ${outcome==='review_plan'?'plan review':'training'} action</label><textarea id="coachingActionTask" maxlength="500" rows="3" placeholder="Practise rotating strike against a packed off-side field."></textarea></div><div class="field"><label for="coachingActionReviewDate">When will you review it?</label><input type="date" id="coachingActionReviewDate" min="${todayIso()}" value="${coachingReviewDateDefault()}"></div>`:''}<div class="btnrow"><button class="btn secondary" id="saveCoachingAction">${needsAction?'Save shared action':'Save conversation'}</button><button class="btn ghost" id="cancelCoachingAction">Cancel</button><span id="coachingActionStatus" role="status"></span></div>`;
  host.appendChild(form);captureFeedbackEntryBaseline();
  document.getElementById('cancelCoachingAction').onclick=()=>{if(confirmLeaveFeedbackEntry())form.remove();};
  document.getElementById('saveCoachingAction').onclick=async()=>{
    if(coachingActionSavePending)return;
    const task=needsAction?document.getElementById('coachingActionTask').value.trim():'';
    const reviewOn=needsAction?document.getElementById('coachingActionReviewDate').value:null;
    const status=document.getElementById('coachingActionStatus');const button=document.getElementById('saveCoachingAction');
    if(needsAction&&(!task||!reviewOn||reviewOn<todayIso())){status.textContent='Add the agreed action and choose a review date from today onwards.';return;}
    coachingActionSavePending=true;const restoreForm=freezeCoachingForm(form);status.textContent='Saving…';
    try{
      const {error}=await supabase.rpc('save_coaching_conversation',{p_player_id:signal.player.id,p_signal_key:signal.key,p_source_at:signal.sourceAt,p_outcome:outcome,p_task:task,p_review_on:reviewOn,p_format_key:signal.formatKey||null});
      if(error)throw error;
      feedbackEntryBaselines.set(form,feedbackEntryValues(form));
      coachingActionSavePending=false;status.textContent='Saved.';
      try{await onSaved();}catch(refreshError){status.textContent='Saved successfully. Reload this page to see the latest shared action.';}
    }catch(error){status.textContent=error?.message||'Could not save the conversation. Your action is still here.';restoreForm();}
    finally{coachingActionSavePending=false;}
  };
}

function bindCoachingActionControls(feedback,onSaved){
  document.querySelectorAll('[data-review-coaching-action]').forEach(button=>button.onclick=()=>{
    if(coachingActionSavePending||!confirmLeaveFeedbackEntry())return;
    const action=(feedback?.coaching_actions||[]).find(a=>a.id===button.dataset.reviewCoachingAction&&a.can_review&&a.status==='open');
    if(!action)return;
    document.getElementById('coachingReviewForm')?.remove();
    document.getElementById('coachingActionForm')?.remove();
    const host=[...document.querySelectorAll('[data-coaching-review-slot]')].find(el=>el.dataset.coachingReviewSlot===action.id);if(!host)return;
    const form=document.createElement('div');form.id='coachingReviewForm';form.className='development-entry-form';
    form.innerHTML=`<div class="field"><label for="coachingReviewOutcome">What happens next?</label><select id="coachingReviewOutcome"><option value="continue">Keep practising — review again</option><option value="completed">Completed — the focus is now part of my game</option><option value="stopped">Stop this action — explain why below</option></select></div><div class="field"><label for="coachingReviewNote">What did you notice?</label><textarea id="coachingReviewNote" maxlength="1000" rows="3" placeholder="What changed in training or your innings? What still needs work?"></textarea></div><div class="field" id="coachingNextReviewField"><label for="coachingNextReviewDate">Next review</label><input type="date" id="coachingNextReviewDate" min="${todayIso()}" value="${coachingReviewDateDefault()}"></div><p class="help">Your update is shared with the player and authorised coaching team.</p><div class="btnrow"><button class="btn secondary" id="saveCoachingReview">Save review</button><button class="btn ghost" id="cancelCoachingReview">Cancel</button><span id="coachingReviewStatus" role="status"></span></div>`;
    host.appendChild(form);captureFeedbackEntryBaseline();
    const requestId=globalThis.crypto.randomUUID();
    document.getElementById('coachingReviewOutcome').onchange=()=>{document.getElementById('coachingNextReviewField').hidden=document.getElementById('coachingReviewOutcome').value!=='continue';};
    document.getElementById('cancelCoachingReview').onclick=()=>{if(confirmLeaveFeedbackEntry())form.remove();};
    document.getElementById('saveCoachingReview').onclick=async()=>{
      if(coachingActionSavePending)return;
      const outcome=document.getElementById('coachingReviewOutcome').value;
      const note=document.getElementById('coachingReviewNote').value.trim();
      const reviewOn=outcome==='continue'?document.getElementById('coachingNextReviewDate').value:null;
      const status=document.getElementById('coachingReviewStatus');const saveButton=document.getElementById('saveCoachingReview');
      if(!note||(outcome==='continue'&&(!reviewOn||reviewOn<todayIso()))){status.textContent='Add a short progress note and, if continuing, choose the next review date.';return;}
      coachingActionSavePending=true;const restoreForm=freezeCoachingForm(form);status.textContent='Saving…';
      try{
        const {error}=await supabase.rpc('review_coaching_action',{p_action_id:action.id,p_expected_revision:action.revision,p_request_id:requestId,p_outcome:outcome,p_note:note,p_review_on:reviewOn});
        if(error)throw error;
        feedbackEntryBaselines.set(form,feedbackEntryValues(form));
        coachingActionSavePending=false;status.textContent='Saved.';
        try{await onSaved();}catch(refreshError){status.textContent='Saved successfully. Reload this page to see the latest review.';}
      }catch(error){status.textContent=error?.message||'Could not save your review. Your note is still here.';restoreForm();}
      finally{coachingActionSavePending=false;}
    };
  });
}

async function loadDevelopmentFeedback(playerId){
  if(!playerId)return {matches:[],training_observations:[],external_training_evidence:[],coaching_actions:[]};
  const [feedbackResponse,actionResponse]=await Promise.all([
    Promise.resolve(supabase.rpc('get_development_feedback_for_player',{p_player_id:playerId})).catch(error=>({error})),
    Promise.resolve(supabase.rpc('get_player_coaching_actions',{p_player_id:playerId})).catch(error=>({error}))
  ]);
  const {data,error}=feedbackResponse;
  if(error){const failure=new Error(error.message||'Feedback could not load');failure.sharedActions={coaching_actions:Array.isArray(actionResponse.data?.actions)?actionResponse.data.actions:[],coaching_actions_error:actionResponse.error?.message||''};throw failure;}
  return {
    ...(data||{}),
    matches:Array.isArray(data?.matches)?data.matches:[],
    training_observations:Array.isArray(data?.training_observations)?data.training_observations:[],
    external_training_evidence:Array.isArray(data?.external_training_evidence)?data.external_training_evidence:[],
    coaching_actions:Array.isArray(actionResponse.data?.actions)?actionResponse.data.actions:[],
    coaching_actions_error:actionResponse.error?.message||''
  };
}

const EXTERNAL_EVIDENCE_METRIC_ALIASES={
  swing_speed:'swing_speed',
  bulk_bat_speed:'swing_speed',
  whole_swing_speed:'swing_speed',
  contact_window_speed:'contact_window_speed',
  timing_bat_speed:'contact_window_speed',
  impact_window_speed:'contact_window_speed',
  hotspot_contact_rate:'hotspot_contact_rate',
  hot_spot_contact_rate:'hotspot_contact_rate',
  sweet_spot_contact_rate:'hotspot_contact_rate',
  ball_speed:'ball_speed',
  exit_speed:'ball_speed',
  sample_size:'sample_size',
  rep_count:'sample_size'
};
const EXTERNAL_EVIDENCE_METRIC_LABELS={
  swing_speed:'Whole-swing speed',
  contact_window_speed:'Contact-window speed',
  hotspot_contact_rate:'Hot-spot contact',
  ball_speed:'Ball speed',
  sample_size:'Reps'
};
const EXTERNAL_EVIDENCE_METRIC_ORDER=['swing_speed','contact_window_speed','hotspot_contact_rate','ball_speed','sample_size'];

function externalEvidenceFormatApplies(evidence,format){
  const keys=Array.isArray(evidence?.format_keys)?evidence.format_keys:[];
  return !keys.length||keys.includes(format);
}

function evidenceMetricLabel(key){
  if(EXTERNAL_EVIDENCE_METRIC_LABELS[key])return EXTERNAL_EVIDENCE_METRIC_LABELS[key];
  return String(key||'').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

function evidenceMetricDisplay(raw){
  if(raw===null||raw===undefined||raw==='')return null;
  if(typeof raw==='number')return {value:Number.isInteger(raw)?String(raw):String(Math.round(raw*10)/10),unit:''};
  if(typeof raw==='string')return {value:raw,unit:''};
  if(Array.isArray(raw))return null;
  if(typeof raw==='object'){
    const candidate=raw.value??raw.mean??raw.average??raw.avg??null;
    if(candidate===null||candidate===undefined||candidate==='')return null;
    const value=typeof candidate==='number'
      ?(Number.isInteger(candidate)?String(candidate):String(Math.round(candidate*10)/10))
      :String(candidate);
    return {value,unit:String(raw.unit||'').trim()};
  }
  return null;
}

function externalEvidenceMetricEntries(evidence){
  const metrics=evidence?.metrics&&typeof evidence.metrics==='object'&&!Array.isArray(evidence.metrics)?evidence.metrics:{};
  const canonical=new Map();
  Object.entries(metrics).forEach(([rawKey,rawValue])=>{
    const key=EXTERNAL_EVIDENCE_METRIC_ALIASES[rawKey]||rawKey;
    if(canonical.has(key))return;
    const display=evidenceMetricDisplay(rawValue);
    if(display)canonical.set(key,{key,label:evidenceMetricLabel(key),...display});
  });
  return [...canonical.values()].sort((a,b)=>{
    const ai=EXTERNAL_EVIDENCE_METRIC_ORDER.indexOf(a.key);
    const bi=EXTERNAL_EVIDENCE_METRIC_ORDER.indexOf(b.key);
    return (ai<0?999:ai)-(bi<0?999:bi);
  }).slice(0,6);
}

function safeEvidenceMediaUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const u=new URL(raw);
    return ['http:','https:'].includes(u.protocol)?u.toString():'';
  }catch(e){return '';}
}

function renderExternalTrainingEvidenceCard(evidence){
  const formats=(evidence?.format_keys||[]).map(formatLabel).join(' + ')||'General / Core';
  const source=evidence?.source_label||evidence?.source_key||'External source';
  const meta=[formatDateShort(evidence?.recorded_at||evidence?.created_at),formats,evidence?.shot_type||''].filter(Boolean).join(' · ');
  const metrics=externalEvidenceMetricEntries(evidence);
  const metricKeys=new Set(metrics.map(x=>x.key));
  const separatesSpeed=metricKeys.has('swing_speed')&&metricKeys.has('contact_window_speed');
  const mediaUrl=safeEvidenceMediaUrl(evidence?.media_url);
  return `<article class="external-evidence-card">
    <div class="external-evidence-head">
      <div><div class="section-label">${esc(source)}</div><h3>${esc(evidence?.training_intent||evidence?.summary||'Training evidence')}</h3><span>${esc(meta)}</span></div>
      ${evidence?.evidence_level?`<b>${esc(String(evidence.evidence_level).replace(/_/g,' ').toUpperCase())}</b>`:''}
    </div>
    ${metrics.length?`<div class="external-evidence-metrics">${metrics.map(m=>`<div><span>${esc(m.label)}</span><strong>${esc(m.value)}${m.unit?` <small>${esc(m.unit)}</small>`:''}</strong></div>`).join('')}</div>`:''}
    ${separatesSpeed?'<div class="external-evidence-speed-note">Whole-swing speed and contact-window speed are kept separate. A compact, well-timed stroke is not treated as an inferior swing.</div>':''}
    ${evidence?.summary&&evidence?.training_intent?`<p class="external-evidence-summary">${esc(evidence.summary)}</p>`:''}
    ${evidence?.coaching_question?`<div class="external-evidence-question"><span>QUESTION TO EXPLORE</span><strong>${esc(evidence.coaching_question)}</strong></div>`:''}
    ${evidence?.next_training_focus?`<div class="development-next"><small>TRAIN NEXT</small><strong>${esc(evidence.next_training_focus)}</strong></div>`:''}
    ${mediaUrl?`<a class="external-evidence-link" href="${esc(mediaUrl)}" target="_blank" rel="noopener noreferrer">Open source evidence ↗</a>`:''}
  </article>`;
}

function renderExternalTrainingEvidenceSection(evidence,{showEmpty=false}={}){
  const rows=Array.isArray(evidence)?evidence:[];
  if(!rows.length&&!showEmpty)return '';
  return `<section class="external-evidence-section">
    <div class="external-evidence-title">
      <div><div class="section-label">External Training Evidence</div><h3>Measure the player against their intention — not a universal technique.</h3><p>Connected bat, video or sensor data sits beside player and coaching feedback. It can raise a useful question, but it should not overwrite a player’s effective method.</p></div>
      <span>${rows.length?`${rows.length} evidence record${rows.length===1?'':'s'}`:'No source connected yet'}</span>
    </div>
    ${rows.length?`<div class="external-evidence-list">${rows.slice(0,8).map(renderExternalTrainingEvidenceCard).join('')}</div>`:`<div class="external-evidence-empty"><strong>Ready for a future data source.</strong><span>Club Batting can store vendor-neutral training evidence when a bat-tracking, video or sensor provider is connected. Whole-swing speed, contact-window speed and contact quality remain distinct measures.</span></div>`}
  </section>`;
}

function trainingFocusForFormat(feedback,format,playerMode=true){
  const items=[];
  for(const o of feedback?.training_observations||[]){
    const keys=Array.isArray(o.format_keys)?o.format_keys:[];
    if(keys.length && !keys.includes(format))continue;
    if(!String(o.next_training_focus||'').trim())continue;
    items.push({
      text:o.next_training_focus.trim(),
      source:`Training observation · ${o.observer_name||'Coach / Captain'}`,
      date:o.observed_on||o.created_at||''
    });
  }
  for(const e of feedback?.external_training_evidence||[]){
    if(!externalEvidenceFormatApplies(e,format))continue;
    if(!String(e.next_training_focus||'').trim())continue;
    items.push({
      text:e.next_training_focus.trim(),
      source:`External evidence · ${e.source_label||e.source_key||'connected source'}`,
      date:e.recorded_at||e.created_at||''
    });
  }
  for(const m of feedback?.matches||[]){
    if(m.format_key!==format)continue;
    // Players record their own view before any part of a coach's match
    // feedback shapes their training. Staff can see the focus immediately.
    const coach=(!playerMode||m.player_reflection)?(m.coach_feedback||[])[0]:null;
    if(String(coach?.next_training_focus||'').trim())items.push({
      text:coach.next_training_focus.trim(),
      source:`Match feedback · ${coach.author_name||'Coach / Captain'}`,
      date:coach.updated_at||coach.created_at||m.match_date||''
    });
    if(String(m.player_reflection?.next_training_focus||'').trim())items.push({
      text:m.player_reflection.next_training_focus.trim(),
      source:'Your innings reflection',
      date:m.player_reflection.updated_at||m.match_date||''
    });
  }
  items.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const seen=new Set();
  return items.filter(x=>{
    const k=x.text.toLowerCase();
    if(seen.has(k))return false;
    seen.add(k);return true;
  }).slice(0,2);
}

function renderClubTrainingPrinciples(){
  return `<details class="card train-simple-accordion train-principles-accordion">
    <summary>
      <div><div class="section-label">Club Training Principles</div><strong>Train decisions, not just shots.</strong><span>Practice the game you want to take into the middle.</span></div>
      <em>Open ↓</em>
    </summary>
    <div class="train-simple-body">
      <div class="train-principle-lines">
        <p><strong>Recognition before repetition.</strong> Avoid knowing the ball or shot in advance. Make the batter read the delivery and choose.</p>
        <p><strong>Add the match context.</strong> Use a field, score, wickets, phase or matchup so the same skill has a cricket reason behind it.</p>
        <p><strong>Measure the decision, not just the outcome.</strong> A boundary from the wrong ball is not automatically a good rep; reward choices that match the plan.</p>
      </div>
    </div>
  </details>`;
}

function renderPlayerTrainingFormatAccordion(format,raw,feedback){
  const coreProgress=sectionProgress('core',raw);
  const formatProgress=sectionProgress(format,raw);
  const ready=coreProgress.complete&&formatProgress.complete;
  const label=formatLabel(format);
  const cards=ready?[...coreTrainingCards(raw),...formatTrainingCards(raw,format)].slice(0,7):[];
  const feedbackFocus=ready?trainingFocusForFormat(feedback,format):[];
  const nextSection=coreProgress.complete?format:'core';
  const nextLabel=coreProgress.complete?label:'Core';

  return `<details class="card train-format-accordion ${ready?'ready':'locked'}">
    <summary>
      <div><div class="section-label">${esc(label)}</div><strong>${ready?`My ${esc(label)} Training Plan`:`${esc(label)} Training Plan`}</strong><span>${ready?'Targeted from your completed Player Plan.':`Complete ${esc(nextLabel)} in My Player Plan to continue.`}</span></div>
      <div class="train-accordion-state"><b>${ready?'TRAINING PLAN READY':'PLAYER PLAN NOT COMPLETE'}</b><em>Open ↓</em></div>
    </summary>
    <div class="train-simple-body">
      ${ready?`
        <div class="train-plan-lines">
          ${cards.length?cards.map(c=>renderTrainingPlanCard(c,format)).join(''):'<div class="notice">Your Player Plan is complete, but there are no specific training cues to show yet.</div>'}
        </div>
        ${feedbackFocus.length?`<div class="train-feedback-focus"><div class="section-label">FROM RECENT FEEDBACK</div>${feedbackFocus.map(x=>`<p><strong>${esc(x.text)}</strong><span>${esc(x.source)}</span></p>`).join('')}</div>`:''}
      `:`<div class="train-format-empty"><strong>Your ${esc(label)} training plan starts with your Player Plan.</strong><span>${coreProgress.complete?`Finish the ${esc(label)} questions to create your training plan.`:formatProgress.complete?`Your ${esc(label)} answers are complete. Finish Core to create your training plan.`:`Start with Core, then complete the ${esc(label)} questions. Your training plan will use those answers.`}</span><div class="btnrow"><button class="btn secondary" data-go="myplan" data-plan-section="${esc(nextSection)}">Complete ${esc(nextLabel)}</button></div></div>`}
    </div>
  </details>`;
}

function renderClubTrainingFormatAccordion(format,snapshot){
  const formatData=snapshot?.formats?.[format];
  const banners=formatData?.banners||[];
  return `<details class="card train-format-accordion club-view">
    <summary>
      <div><div class="section-label">${esc(formatLabel(format))}</div><strong>${esc(formatLabel(format))} training</strong><span>How the club's batting philosophy should show up at training.</span></div>
      <div class="train-accordion-state"><em>Open ↓</em></div>
    </summary>
    <div class="train-simple-body">
      ${banners.length?`<div class="train-plan-lines">${banners.map(b=>{
        const p=howWeTrainPracticeForBanner(b,format);
        return `<article class="train-plan-card club-training-card"><small>${esc(b.title||'KEY MESSAGE')}</small><strong>${esc(p.title)}</strong><p class="train-card-cue">${esc(p.points[0]||'')}</p>${p.points.length>1?`<details class="train-card-depth"><summary><span>Go deeper</span><em>More training ideas ↓</em></summary><div class="train-card-depth-body"><div class="train-depth-block"><b>BUILD THE PRACTICE</b>${p.points.map(x=>`<p>${esc(x)}</p>`).join('')}</div></div></details>`:''}</article>`;
      }).join('')}</div>`:'<div class="notice">No format-specific training guidance is published yet.</div>'}
    </div>
  </details>`;
}

function playerReflectionNeededMatches(feedback){
  return (feedback?.matches||[]).filter(m=>(m.coach_feedback||[]).length&&!m.player_reflection);
}

let howWeTrainRenderSequence=0;
async function renderHowWeTrain(){
  const page=document.getElementById('page');
  const sequence=++howWeTrainRenderSequence,clubId=club?.id,playerId=myPlayer?.id,tabAtStart=currentTab;
  const isCurrent=()=>sequence===howWeTrainRenderSequence&&club?.id===clubId&&myPlayer?.id===playerId&&currentTab===tabAtStart;
  if(!workspacePlayerPlansPublished()){
    renderClubPublicationGate('How We Train');
    return;
  }

  page.innerHTML='<div class="splash">Loading How We Train…</div>';
  const enabled=publishedEnabledFormats();
  const raw=rawAnswers();
  const snapshot=howWeBatVersions?.[0]?.snapshot||null;

  let feedback={matches:[],training_observations:[],external_training_evidence:[]};
  let feedbackError='';
  if(myPlayer){
    try{
      feedback=await loadDevelopmentFeedback(playerId);
      if(!isCurrent())return;
      myDevelopmentFeedback=feedback;
    }catch(e){
      if(!isCurrent())return;
      feedbackError=e?.message||String(e);
      feedback={...feedback,...(e?.sharedActions||{coaching_actions:[],coaching_actions_error:'Shared actions could not load'})};
      myDevelopmentFeedback=null;
    }
  }

  if(!isCurrent())return;
  let rollout={};let rolloutError='';
  if(playerId){try{const result=await supabase.rpc('get_my_player_plan_rollout',{p_club_id:clubId});rollout=result.data||{};rolloutError=result.error?.message||'';}catch(error){rolloutError=error?.message||'Could not load';}if(!isCurrent())return;}
  if(howWeTrainReflectionEditId && howWeTrainReflectionEditId!=='new' && !feedback.matches.some(m=>m.id===howWeTrainReflectionEditId))howWeTrainReflectionEditId=null;
  const editMatch=howWeTrainReflectionEditId&&howWeTrainReflectionEditId!=='new'
    ?feedback.matches.find(m=>m.id===howWeTrainReflectionEditId)||null
    :null;

  let playerTop='';
  let formatAccordions='';
  let feedbackAccordion='';

  if(myPlayer){
    const planState=playerHomePlanState(raw,rollout);
    const coreProgress=planState.core;
    const statuses=planState.formats;
    const allReady=coreProgress.complete&&!planState.pendingRequired.length&&planState.ready.length>0;
    playerTop=`<section class="card train-plan-readiness compact ${allReady?'ready':'needs-plan'}">
      <div class="train-plan-readiness-copy">
        <div class="section-label">YOUR TRAINING PLAN STARTS WITH YOUR PLAYER PLAN</div>
        <h2>Train your plan until it becomes instinctive.</h2>
        <p>Practise the decisions you want to make in a match. Complete Core and a format in your Player Plan to create training suggestions based on your game. Update your answers as your game develops.</p>
      </div>
      <div class="train-plan-readiness-side">
        <div class="train-plan-status-list">
          <div class="train-plan-status ${coreProgress.complete?'ready':'missing'}"><span>${coreProgress.complete?'✓':'!'}</span><div><strong>Core Player Plan</strong><small>${coreProgress.complete?'Complete':'Not complete'}</small></div></div>
          ${statuses.map(x=>`<div class="train-plan-status ${coreProgress.complete&&x.progress.complete?'ready':x.required||x.progress.answeredAny?'missing':'optional'}"><span>${coreProgress.complete&&x.progress.complete?'✓':x.required||x.progress.answeredAny?'!':'○'}</span><div><strong>${esc(x.label)}</strong><small>${coreProgress.complete&&x.progress.complete?'Training plan ready':x.required?'Required plan not complete':x.progress.answeredAny?'Plan started':'Available when useful'}</small></div></div>`).join('')}
        </div>
        <button class="btn secondary" data-go="myplan">Open My Player Plan</button>
        ${rolloutError?'<p class="help">Required formats could not be checked. Your saved plan is still available.</p>':''}
      </div>
    </section>`;

    formatAccordions=enabled.map(([format])=>renderPlayerTrainingFormatAccordion(format,raw,feedback)).join('');
    const reflectionNeeded=playerReflectionNeededMatches(feedback);
    const historyCount=(feedback.matches?.length||0)+(feedback.training_observations?.length||0)+(feedback.external_training_evidence?.length||0);
    feedbackAccordion=`<details class="card train-simple-accordion feedback-reflection-accordion" id="trainingFeedbackLoop" ${howWeTrainReflectionEditId!==null?'open':''}>
      <summary>
        <div><div class="section-label">Feedback & Reflections</div><strong>Play → reflect → train again.</strong><span>${reflectionNeeded.length?`${reflectionNeeded.length} innings reflection${reflectionNeeded.length===1?'':'s'} waiting for you.`:historyCount?`${historyCount} recent development note${historyCount===1?'':'s'} available.`:'Add a short reflection when there is something useful to learn.'}</span></div>
        <div class="train-accordion-state">${reflectionNeeded.length?`<b class="attention">${reflectionNeeded.length} REFLECTION NEEDED${reflectionNeeded.length===1?'':'S'}</b>`:''}<em>Open ↓</em></div>
      </summary>
      <div class="train-simple-body">
        <div class="feedback-player-actions"><button class="btn secondary" id="newMyReflection">Reflect on an innings</button><span>Short reflection only — not homework.</span></div>
        ${howWeTrainReflectionEditId!==null?renderMyReflectionForm(editMatch):''}
        ${reflectionNeeded.length?`<div class="reflection-needed-list"><div class="section-label">YOUR REFLECTION IS NEEDED</div>${reflectionNeeded.map(m=>renderDevelopmentMatchCard(m,{playerMode:true})).join('')}</div>`:''}
        <div class="development-history-grid simple">
          <section>
            <div class="development-history-title"><strong>Innings reflections & coach feedback</strong><span>${feedback.matches.length} recorded</span></div>
            <div class="development-history-list">${feedback.matches.length?feedback.matches.filter(m=>!reflectionNeeded.some(x=>x.id===m.id)).slice(0,8).map(m=>renderDevelopmentMatchCard(m,{playerMode:true})).join(''):'<div class="notice">No innings reflections yet.</div>'}</div>
          </section>
          <section>
            <div class="development-history-title"><strong>Training observations</strong><span>${feedback.training_observations.length} recorded</span></div>
            <div class="development-history-list compact">${feedback.training_observations.length?feedback.training_observations.slice(0,8).map(renderTrainingObservationCard).join(''):'<div class="notice">Coach or captain training observations will appear here when there is something worth recording.</div>'}</div>
          </section>
        </div>
        ${renderExternalTrainingEvidenceSection(feedback.external_training_evidence)}
      </div>
    </details>`;
  }else{
    playerTop=`<section class="card train-staff-intro"><div class="section-label">Club-wide guide</div><h2>How the club trains its batting philosophy.</h2><p>Players with a Player Plan get a personalised version of these principles. Use the format sections below when planning or observing training.</p></section>`;
    formatAccordions=enabled.map(([format])=>renderClubTrainingFormatAccordion(format,snapshot)).join('');
  }

  page.innerHTML=`<div class="guide-context-bar"><span><strong>How We Train</strong> · Turn the Player Plan into deliberate practice, then let match and training feedback shape what comes next.</span><button type="button" class="btn ghost compact-btn" id="howWeTrainGuideLink">Show me how</button></div>
  <section class="card train-hero simple">
    <div class="section-label">How We Train</div>
    <h1>Train the game you want to take into the middle.</h1>
    <p>Choose the shots that suit your game. Practise executing them. When the right ball arrives in a match, commit fully to your shot.</p>
    <p class="help">Back the work you have put in. When a well-chosen shot does not come off, recognise the commitment and use what you learn to guide your next practice. The aim is to help you score runs, build confidence and enjoy your batting.</p>
  </section>

  ${feedbackError?'<section class="card notice" role="status"><strong>Feedback could not be loaded.</strong><p>Your saved Player Plan is still available. Try again to load your reflections and training observations.</p><button class="btn ghost" id="retryTrainingFeedback">Try again</button></section>':''}
  ${myPlayer?renderCoachingActions(feedback,{playerMode:true}):''}
  ${playerTop}
  ${renderClubTrainingPrinciples()}
  <div class="train-format-accordion-list">${formatAccordions}</div>
  ${feedbackAccordion}`;

  captureFeedbackEntryBaseline();
  bindCoachingActionControls(feedback,()=>renderHowWeTrain());
  document.getElementById('retryTrainingFeedback')?.addEventListener('click',async()=>{if(confirmLeaveFeedbackEntry())await renderHowWeTrain();});
  if(document.getElementById('howWeTrainGuideLink'))document.getElementById('howWeTrainGuideLink').onclick=()=>openClubBattingGuideTopic('how_we_train');
  page.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{if(!confirmLeaveFeedbackEntry())return;if(b.dataset.planSection)builderSection=b.dataset.planSection;currentTab=b.dataset.go;renderTab();});

  const rerenderHowWeTrainAt=async(targetId)=>{
    await renderHowWeTrain();
    requestAnimationFrame(()=>document.getElementById(targetId)?.scrollIntoView({behavior:'smooth',block:'start'}));
  };

  if(document.getElementById('newMyReflection'))document.getElementById('newMyReflection').onclick=async()=>{
    if(!confirmLeaveFeedbackEntry())return;
    howWeTrainReflectionEditId='new';
    await rerenderHowWeTrainAt('myReflectionForm');
  };
  page.querySelectorAll('[data-edit-my-reflection]').forEach(b=>b.onclick=async()=>{
    if(!confirmLeaveFeedbackEntry())return;
    howWeTrainReflectionEditId=b.dataset.editMyReflection;
    await rerenderHowWeTrainAt('myReflectionForm');
  });
  if(document.getElementById('cancelMyReflection'))document.getElementById('cancelMyReflection').onclick=async()=>{
    if(!confirmLeaveFeedbackEntry())return;
    howWeTrainReflectionEditId=null;
    await rerenderHowWeTrainAt('trainingFeedbackLoop');
  };

  wireQuickChoices(page);

  if(document.getElementById('saveMyReflection'))document.getElementById('saveMyReflection').onclick=async()=>{
    const st=document.getElementById('myReflectionStatus');
    const btn=document.getElementById('saveMyReflection');
    const batting=document.querySelector('input[name="myBattingToPlan"]:checked')?.value;
    const dismissal=document.querySelector('input[name="myDismissalClass"]:checked')?.value;
    if(!batting||!dismissal){st.textContent='Choose the two quick reflection answers first.';return;}
    btn.disabled=true;btn.textContent='Saving…';st.textContent='';
    const {error}=await supabase.rpc('save_my_match_reflection',{
      p_club_id:club.id,
      p_match_id:howWeTrainReflectionEditId==='new'?null:howWeTrainReflectionEditId,
      p_match_date:val('reflectionDate')||null,
      p_opposition:val('reflectionOpposition'),
      p_format_key:document.getElementById('reflectionFormat').value,
      p_score_text:val('reflectionScore'),
      p_dismissal_summary:val('reflectionDismissal'),
      p_batting_to_plan:batting,
      p_dismissal_classification:dismissal,
      p_main_issue:document.getElementById('reflectionMainIssue').value||null,
      p_next_training_focus:val('reflectionNextFocus'),
      p_note:val('reflectionNote')
    });
    if(error){btn.disabled=false;btn.textContent='Save reflection';st.textContent=error.message;return;}
    howWeTrainReflectionEditId=null;
    await rerenderHowWeTrainAt('trainingFeedbackLoop');
  };
}

function renderStaffTrainingObservationForm(player){
  const enabled=publishedEnabledFormats();
  return `<section class="card development-entry-form" id="staffDevelopmentForm">
    <div class="development-form-head"><div><div class="section-label">Training observation</div><h2>Record what you noticed.</h2><div class="help">Notice how the player recognises the right ball and commits to their chosen shot. Record decision and execution details that will help them practise. Leave the format unticked for general/Core practice.</div></div></div>
    <div class="field"><label>Date</label><input id="trainingObservationDate" type="date" value="${todayIso()}"></div>
    <div class="development-question"><label>Format focus <span>choose any that apply</span></label><div class="format-check-grid">${enabled.map(([k,l])=>`<label><input type="checkbox" data-training-format value="${k}"><span>${esc(l)}</span></label>`).join('')}</div></div>
    <div class="development-question"><label>Was ${esc(player.display_name||'the player')} training to their Player Plan?</label>${radioChoiceHtml('staffTrainingToPlan',[["yes","Yes","The work clearly matched the plan"],["mostly","Mostly","Useful work with some drift"],["no","No","The session moved away from the plan"]],'mostly')}</div>
    <div class="development-question"><label>What stood out?</label>${radioChoiceHtml('staffObservationType',Object.entries(TRAINING_OBSERVATION_LABELS).map(([k,l])=>[k,l,'']),'right_shots_right_balls')}</div>
    <div class="field"><label>One thing to train next <span>optional</span></label><input id="staffTrainingNextFocus" maxlength="240" placeholder="One useful focus is enough"></div>
    <div class="field"><label>Short note <span>optional</span></label><textarea id="staffTrainingNote" maxlength="500" rows="3" placeholder="Only add detail if it helps the player"></textarea></div>
    <div class="btnrow"><button class="btn secondary" id="saveTrainingObservation">Save observation</button><button class="btn ghost" id="cancelStaffDevelopment">Cancel</button><span class="status" id="staffDevelopmentStatus"></span></div>
  </section>`;
}

function renderStaffMatchFeedbackForm(player,data,matchId=playersWorkspaceDevelopmentMatchId){
  const match=matchId
    ?data?.matches?.find(m=>m.id===matchId)||null
    :null;
  const format=match?.format_key||publishedEnabledFormats()[0]?.[0]||'limited_overs';
  return `<section class="card development-entry-form" id="staffDevelopmentForm">
    <div class="development-form-head"><div><div class="section-label">Match observation</div><h2>${match?'Add your view to this innings':'Record what you noticed in the innings'}</h2><div class="help">Recognise the player’s preparation and full commitment, even when execution falls short. Review the innings overall and the dismissal ball separately: a player can follow their plan overall, then move outside it for one ball. Consider shot choice and execution separately too. Agree useful practice without judgement.</div></div></div>
    <div class="development-match-fields">
      <div class="field"><label>Date</label><input id="staffMatchDate" type="date" value="${esc(match?.match_date||todayIso())}"></div>
      <div class="field"><label>Format</label><select id="staffMatchFormat">${publishedEnabledFormats().map(([k,l])=>`<option value="${k}" ${format===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label>Opposition <span>optional</span></label><input id="staffMatchOpposition" maxlength="160" value="${esc(match?.opposition||'')}"></div>
      <div class="field"><label>Score <span>optional</span></label><input id="staffMatchScore" maxlength="80" value="${esc(match?.score_text||'')}"></div>
    </div>
    <div class="field"><label>Dismissal / innings note <span>optional</span></label><input id="staffMatchDismissal" maxlength="300" value="${esc(match?.dismissal_summary||'')}" placeholder="e.g. Pulled a short ball; caught on the boundary"></div>
    <div class="development-question"><label>In the innings overall, did the player bat to their Player Plan?</label>${radioChoiceHtml('staffBattingToPlan',[["yes","Yes","Overall, the approach matched the plan"],["mostly","Mostly","Some periods or choices moved outside it"],["no","No","The approach moved away from the plan"]],'mostly')}</div>
    <div class="development-question"><label>On the dismissal ball, how did the choice fit the plan?</label>${radioChoiceHtml('staffDismissalClass',[["plan_execution","Within plan · execution to improve","Right shot and ball; an execution detail to practise was identified"],["outside_plan","Decision outside plan","The option for this ball was outside the Player Plan"],["not_applicable","Not really a Player Plan issue","Not dismissed / good bowling / run out / other"]],'not_applicable')}</div>
    <div class="development-question"><label>Main issue <span>optional</span></label><select id="staffMatchMainIssue"><option value="">Choose only if useful</option>${Object.entries(DEVELOPMENT_ISSUE_LABELS).map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label>One thing to train next <span>optional</span></label><input id="staffMatchNextFocus" maxlength="240" placeholder="One useful focus is enough"></div>
    <div class="field"><label>Short coaching note <span>optional</span></label><textarea id="staffMatchNote" maxlength="500" rows="3" placeholder="No essay needed"></textarea></div>
    <div class="btnrow"><button class="btn secondary" id="saveStaffMatchFeedback">Save coaching feedback</button><button class="btn ghost" id="cancelStaffDevelopment">Cancel</button><span class="status" id="staffDevelopmentStatus"></span></div>
  </section>`;
}

function renderStaffDevelopmentBody(player,canEdit,data){
  return `<div class="staff-development-shell">
    <section class="card development-overview" id="developmentOverview">
      <div class="development-loop-head">
        <div><div class="section-label">Plan → train → play → learn</div><h2>Development feedback</h2><div class="help">Use the player’s own plan to review their preparation, choices and commitment. Compare their reflection with your observations, discuss execution separately and agree useful practice. Keep accountability supportive so the player can build confidence and enjoy their batting.</div></div>
        ${canEdit?`<div class="btnrow"><button class="btn secondary" id="addTrainingObservation">Add training observation</button><button class="btn ghost" id="addNewMatchFeedback">Add match observation</button></div>`:'<span class="workspace-access-badge view">VIEW ONLY</span>'}
      </div>
    </section>
    ${playersWorkspaceDevelopmentMode==='training'&&canEdit?renderStaffTrainingObservationForm(player):''}
    ${playersWorkspaceDevelopmentMode==='match'&&canEdit?renderStaffMatchFeedbackForm(player,data):''}
    <div class="development-history-grid">
      <section>
        <div class="development-history-title"><strong>Match reflections & coaching feedback</strong><span>${data.matches.length} recorded</span></div>
        <div class="development-history-list">${data.matches.length?data.matches.slice(0,10).map(m=>renderDevelopmentMatchCard(m,{staffCanEdit:canEdit})).join(''):'<div class="card notice">No match feedback yet.</div>'}</div>
      </section>
      <section>
        <div class="development-history-title"><strong>Training observations</strong><span>${data.training_observations.length} recorded</span></div>
        <div class="development-history-list compact">${data.training_observations.length?data.training_observations.slice(0,10).map(renderTrainingObservationCard).join(''):'<div class="card notice">No training observations yet.</div>'}</div>
      </section>
    </div>
    ${renderExternalTrainingEvidenceSection(data.external_training_evidence)}
  </div>`;
}

function wireStaffDevelopmentControls(player,canEdit,data){
  const page=document.getElementById('page');
  if(!page)return;
  wireQuickChoices(page);
  captureFeedbackEntryBaseline();
  if(!canEdit)return;

  const rerenderStaffDevelopmentAt=async(targetId)=>{
    await renderPlayersWorkspacePlayer();
    requestAnimationFrame(()=>document.getElementById(targetId)?.scrollIntoView({behavior:'smooth',block:'start'}));
  };

  if(document.getElementById('addTrainingObservation'))document.getElementById('addTrainingObservation').onclick=async()=>{
    if(!confirmLeaveFeedbackEntry())return;
    playersWorkspaceDevelopmentMode='training';
    playersWorkspaceDevelopmentMatchId=null;
    await rerenderStaffDevelopmentAt('staffDevelopmentForm');
  };
  if(document.getElementById('addNewMatchFeedback'))document.getElementById('addNewMatchFeedback').onclick=async()=>{
    if(!confirmLeaveFeedbackEntry())return;
    playersWorkspaceDevelopmentMode='match';
    playersWorkspaceDevelopmentMatchId=null;
    await rerenderStaffDevelopmentAt('staffDevelopmentForm');
  };
  page.querySelectorAll('[data-add-coach-feedback]').forEach(b=>b.onclick=async()=>{
    if(!confirmLeaveFeedbackEntry())return;
    playersWorkspaceDevelopmentMode='match';
    playersWorkspaceDevelopmentMatchId=b.dataset.addCoachFeedback;
    await rerenderStaffDevelopmentAt('staffDevelopmentForm');
  });
  if(document.getElementById('cancelStaffDevelopment'))document.getElementById('cancelStaffDevelopment').onclick=async()=>{
    if(!confirmLeaveFeedbackEntry())return;
    playersWorkspaceDevelopmentMode=null;
    playersWorkspaceDevelopmentMatchId=null;
    await refreshPlayersWorkspaceFeedback();
    await rerenderStaffDevelopmentAt('developmentOverview');
  };

  if(document.getElementById('saveTrainingObservation'))document.getElementById('saveTrainingObservation').onclick=async()=>{
    const btn=document.getElementById('saveTrainingObservation');
    const st=document.getElementById('staffDevelopmentStatus');
    const toPlan=document.querySelector('input[name="staffTrainingToPlan"]:checked')?.value;
    const type=document.querySelector('input[name="staffObservationType"]:checked')?.value;
    const formatKeys=[...document.querySelectorAll('[data-training-format]:checked')].map(x=>x.value);
    if(!toPlan||!type){st.textContent='Choose the two quick observation answers first.';return;}
    btn.disabled=true;btn.textContent='Saving…';st.textContent='';
    const {error}=await supabase.rpc('add_training_observation',{
      p_player_id:player.id,
      p_observed_on:val('trainingObservationDate')||null,
      p_format_keys:formatKeys,
      p_training_to_plan:toPlan,
      p_observation_type:type,
      p_next_training_focus:val('staffTrainingNextFocus'),
      p_note:val('staffTrainingNote')
    });
    if(error){btn.disabled=false;btn.textContent='Save observation';st.textContent=error.message;return;}
    playersWorkspaceDevelopmentMode=null;
    playersWorkspaceDevelopmentMatchId=null;
    await refreshPlayersWorkspaceFeedback();
    await rerenderStaffDevelopmentAt('developmentOverview');
  };

  if(document.getElementById('saveStaffMatchFeedback'))document.getElementById('saveStaffMatchFeedback').onclick=async()=>{
    const btn=document.getElementById('saveStaffMatchFeedback');
    const st=document.getElementById('staffDevelopmentStatus');
    const batting=document.querySelector('input[name="staffBattingToPlan"]:checked')?.value;
    const dismissal=document.querySelector('input[name="staffDismissalClass"]:checked')?.value;
    if(!batting||!dismissal){st.textContent='Choose the two quick coaching answers first.';return;}
    btn.disabled=true;btn.textContent='Saving…';st.textContent='';
    const {error}=await supabase.rpc('add_staff_match_feedback',{
      p_player_id:player.id,
      p_match_id:playersWorkspaceDevelopmentMatchId||null,
      p_match_date:val('staffMatchDate')||null,
      p_opposition:val('staffMatchOpposition'),
      p_format_key:document.getElementById('staffMatchFormat').value,
      p_score_text:val('staffMatchScore'),
      p_dismissal_summary:val('staffMatchDismissal'),
      p_batting_to_plan:batting,
      p_dismissal_classification:dismissal,
      p_main_issue:document.getElementById('staffMatchMainIssue').value||null,
      p_next_training_focus:val('staffMatchNextFocus'),
      p_note:val('staffMatchNote')
    });
    if(error){btn.disabled=false;btn.textContent='Save coaching feedback';st.textContent=error.message;return;}
    playersWorkspaceDevelopmentMode=null;
    playersWorkspaceDevelopmentMatchId=null;
    await refreshPlayersWorkspaceFeedback();
    await rerenderStaffDevelopmentAt('developmentOverview');
  };
}



/* ---------------- FEEDBACK WORKSPACE ---------------- */

function resetFeedbackWorkspaceForClub(){
  if(feedbackWorkspaceClubId===club.id)return;
  feedbackWorkspaceClubId=club.id;
  feedbackWorkspaceData=null;
  feedbackWorkspaceSection='discussion';
  feedbackWorkspacePlayerFilter='all';
  feedbackWorkspaceSelectedPlayerId=null;
  feedbackWorkspaceEntryMode=null;
  feedbackWorkspaceMatchId=null;
  feedbackWorkspaceDiscussionKey=null;
}

async function loadFeedbackWorkspaceData(){
  const {data,error}=await supabase.rpc('get_feedback_workspace',{p_club_id:club.id});
  if(error)throw error;
  const result=data||{};
  result.players=Array.isArray(result.players)?result.players:[];
  return result;
}

function scoreRuns(scoreText){
  const m=String(scoreText||'').match(/\d+/);
  return m?Number(m[0]):null;
}

function latestCoachFeedback(match){
  return Array.isArray(match?.coach_feedback)&&match.coach_feedback.length?match.coach_feedback[0]:null;
}

function newestIso(...values){
  return values.filter(Boolean).map(String).sort().at(-1)||new Date(0).toISOString();
}

function signalWasDiscussed(player,signal){
  const row=(player.discussions||[]).find(d=>d.signal_key===signal.key);
  if(!row)return false;
  return String(row.source_at||'')>=String(signal.sourceAt||'');
}

function discussionSignalIdentity(playerId,signalKey){
  return `${playerId}::${signalKey}`;
}

function feedbackDiscussionSignals(data){
  const signals=[];
  for(const player of data?.players||[]){
    const matches=Array.isArray(player.matches)?player.matches:[];
    const outsideByFormat=new Map();
    const executionByFormat=new Map();
    const inningsDriftByFormat=new Map();

    for(const match of matches){
      const reflection=match.player_reflection;
      const coach=latestCoachFeedback(match);
      if(!reflection||!coach)continue;
      const sourceAt=newestIso(reflection.updated_at,coach.updated_at,coach.created_at,match.created_at,match.match_date);
      const format=match.format_key||'limited_overs';

      if(reflection.batting_to_plan!==coach.batting_to_plan || reflection.dismissal_classification!==coach.dismissal_classification){
        signals.push({
          key:`view_mismatch:${match.id}`,player,formatKey:format,sourceAt,tone:'amber',priority:1,
          title:'Player and coach see this innings differently',
          summary:`The player and coach did not classify the innings the same way${match.opposition?` against ${match.opposition}`:''}.`,
          suggestion:'Compare the two views before deciding what should change in training.',
          match
        });
      }

      if(reflection.dismissal_classification==='outside_plan'&&coach.dismissal_classification==='outside_plan'){
        const arr=outsideByFormat.get(format)||[];arr.push({match,sourceAt});outsideByFormat.set(format,arr);
      }
      if(reflection.dismissal_classification==='plan_execution'&&coach.dismissal_classification==='plan_execution'){
        const arr=executionByFormat.get(format)||[];arr.push({match,sourceAt});executionByFormat.set(format,arr);
      }
      if(reflection.batting_to_plan===coach.batting_to_plan&&['no','mostly'].includes(reflection.batting_to_plan)){
        const arr=inningsDriftByFormat.get(format)||[];arr.push({match,sourceAt,alignment:reflection.batting_to_plan});inningsDriftByFormat.set(format,arr);
      }
    }

    for(const [format,items] of inningsDriftByFormat){
      // A clear overall drift, or a repeated partial drift, is useful to discuss.
      // This scope stays independent of the dismissal-ball classification.
      if(items.length<2&&!items.some(x=>x.alignment==='no'))continue;
      items.sort((a,b)=>String(b.sourceAt).localeCompare(String(a.sourceAt)));
      const overall=items.filter(x=>x.alignment==='no').length;
      const partial=items.length-overall;
      const evidence=[overall?`${overall} innings with an overall approach outside the plan`:'',partial?`${partial} innings partly outside the plan`:''].filter(Boolean).join(' and ');
      signals.push({
        key:`innings_plan_drift:${format}`,player,formatKey:format,sourceAt:items[0].sourceAt,tone:'amber',priority:1,
        title:items.length===1?'Talk through the innings approach':'Talk through the pattern across innings',
        summary:`Player and coach agreed on ${evidence} in ${formatLabel(format)}. The dismissal ball is considered separately.`,
        suggestion:'Explore what changed from the player’s own plan and why. Agree whether practice, match decisions or the plan itself needs attention, without judging the player by their score.',
        match:items[0].match
      });
    }

    for(const [format,items] of outsideByFormat){
      items.sort((a,b)=>String(b.sourceAt).localeCompare(String(a.sourceAt)));
      const latest=items[0];
      const century=items.find(x=>(scoreRuns(x.match.score_text)||0)>=100);
      if(century){
        signals.push({
          key:`review_plan:${century.match.id}`,player,formatKey:format,sourceAt:century.sourceAt,tone:'blue',priority:2,
          title:'Talk through the dismissal-ball choice',
          summary:'Player and coach agreed the dismissal-ball choice was outside the plan. Their overall-innings views are recorded separately.',
          suggestion:'Talk through why this option was chosen for that ball. Consider execution separately and agree useful practice; the score alone does not settle whether the plan should change.',
          match:century.match
        });
      }
      const nonCentury=items.filter(x=>(scoreRuns(x.match.score_text)||0)<100);
      if(nonCentury.length>=2){
        signals.push({
          key:`repeated_outside_plan:${format}`,player,formatKey:format,sourceAt:nonCentury[0].sourceAt,tone:'red',priority:0,
          title:'Repeated dismissals outside the Player Plan',
          summary:`Player and coach agreed that ${nonCentury.length} recent ${formatLabel(format)} dismissals came from decisions outside the plan.`,
          suggestion:'Talk through the ball, situation and intended shot in each case. Agree how practice can help the player recognise when their chosen option is available.',
          match:nonCentury[0].match
        });
      }else if(nonCentury.length===1){
        const x=nonCentury[0];
        signals.push({
          key:`outside_plan:${x.match.id}`,player,formatKey:format,sourceAt:x.sourceAt,tone:'red',priority:1,
          title:'Dismissal outside the Player Plan',
          summary:`Player and coach agreed this ${formatLabel(format)} dismissal came from a decision outside the plan.`,
          suggestion:'Check why the option appeared and whether training is rehearsing the right decisions.',
          match:x.match
        });
      }
    }

    for(const [format,items] of executionByFormat){
      if(items.length<3)continue;
      items.sort((a,b)=>String(b.sourceAt).localeCompare(String(a.sourceAt)));
      signals.push({
        key:`execution_pattern:${format}`,player,formatKey:format,sourceAt:items[0].sourceAt,tone:'green',priority:3,
        title:'Back the chosen shot and practise its execution',
        summary:`Player and coach identified execution to improve in ${items.length} recent ${formatLabel(format)} dismissals within the plan.`,
        suggestion:'Recognise the preparation and commitment. Agree one execution detail to practise, and keep backing the player to use the shot when the right ball arrives.',
        match:items[0].match
      });
    }

    const obs=(player.training_observations||[]).slice(0,4);
    const poorObs=obs.filter(o=>o.training_to_plan==='no'||['shot_without_decision','drifting_outside_plan'].includes(o.observation_type));
    if(poorObs.length>=2){
      signals.push({
        key:'training_mismatch:recent',player,formatKey:null,
        sourceAt:newestIso(...poorObs.map(o=>o.created_at||o.observed_on)),tone:'amber',priority:1,
        title:'Training is not consistently matching the Player Plan',
        summary:`${poorObs.length} recent observations suggest the player is rehearsing work that does not properly reflect their training plan.`,
        suggestion:'Reset the purpose of the session and make the drills match the Player Plan.',
        observation:poorObs[0]
      });
    }
  }

  return signals
    .filter(s=>!signalWasDiscussed(s.player,s))
    .sort((a,b)=>a.priority-b.priority||String(b.sourceAt).localeCompare(String(a.sourceAt)));
}

function feedbackPlayerNameOptions(players,selected,editableOnly=false){
  const list=editableOnly?players.filter(p=>p.can_edit):players;
  return `<option value="">Choose a player</option>${list.map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${esc(p.display_name||'Player')}</option>`).join('')}`;
}

function openPlayerPlanFromFeedback(playerId){
  playersWorkspaceSelectedId=playerId;
  playersWorkspaceSection='summary';
  playersWorkspaceLocalRaw=null;
  currentTab='players';
  renderTab();
}

function renderDiscussionSignalCard(signal){
  const isOpen=feedbackWorkspaceDiscussionKey===discussionSignalIdentity(signal.player.id,signal.key);
  const canEdit=!!signal.player.can_edit;
  return `<article class="feedback-signal-card ${signal.tone}">
    <div class="feedback-signal-main">
      <div class="feedback-signal-kicker"><span>${esc(signal.player.display_name||'Player')}</span>${signal.formatKey?`<span>${esc(formatLabel(signal.formatKey))}</span>`:''}</div>
      <h3>${esc(signal.title)}</h3>
      <p>${esc(signal.summary)}</p>
      <div class="feedback-signal-suggestion"><strong>Suggested discussion</strong><span>${esc(signal.suggestion)}</span></div>
    </div>
    <div class="feedback-signal-actions">
      <button class="btn ghost" data-view-feedback-player="${signal.player.id}">View evidence</button>
      <button class="btn ghost" data-open-plan-from-feedback="${signal.player.id}">Open Player Plan</button>
      ${canEdit?`<button class="btn secondary" data-toggle-discussion="${esc(signal.key)}" data-discussion-player="${esc(signal.player.id)}">Mark discussed</button>`:''}
    </div>
    ${isOpen&&canEdit?`<div class="discussion-outcome-picker">
      <span>What came from the conversation?</span>
      <p class="help">Record what you agreed. A training change or plan review creates a shared action with a review date.</p>
      <div>
        <button data-discussion-outcome="keep_plan" data-signal-key="${esc(signal.key)}" data-discussion-player="${esc(signal.player.id)}">Plan stays as it is</button>
        <button data-discussion-outcome="adjust_training" data-signal-key="${esc(signal.key)}" data-discussion-player="${esc(signal.player.id)}">Training change agreed</button>
        <button data-discussion-outcome="review_plan" data-signal-key="${esc(signal.key)}" data-discussion-player="${esc(signal.player.id)}">Plan review agreed</button>
        <button data-discussion-outcome="no_action" data-signal-key="${esc(signal.key)}" data-discussion-player="${esc(signal.player.id)}">No action needed</button>
      </div>
    </div>`:''}
  </article>`;
}

function flattenFeedbackItems(data){
  const items=[];
  for(const player of data?.players||[]){
    for(const m of player.matches||[]){
      items.push({type:'match',player,match:m,date:newestIso(m.player_reflection?.updated_at,latestCoachFeedback(m)?.updated_at,latestCoachFeedback(m)?.created_at,m.created_at,m.match_date)});
    }
    for(const o of player.training_observations||[]){
      items.push({type:'training',player,observation:o,date:newestIso(o.created_at,o.observed_on)});
    }
  }
  return items.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}

function renderFeedbackRecent(data){
  const players=data.players||[];
  const filtered=feedbackWorkspacePlayerFilter==='all'?players:players.filter(p=>p.id===feedbackWorkspacePlayerFilter);
  const subset={players:filtered};
  const items=flattenFeedbackItems(subset).slice(0,30);
  return `<section class="card feedback-filter-bar">
    <div class="field"><label>Player</label><select id="feedbackPlayerFilter"><option value="all">All players I can access</option>${players.map(p=>`<option value="${p.id}" ${feedbackWorkspacePlayerFilter===p.id?'selected':''}>${esc(p.display_name||'Player')}</option>`).join('')}</select></div>
    <div class="feedback-filter-count"><strong>${items.length}</strong><span>recent items</span></div>
  </section>
  <div class="feedback-recent-list">${items.length?items.map(item=>{
    if(item.type==='training'){
      const o=item.observation;
      return `<article class="card feedback-recent-card"><div class="feedback-recent-head"><div><div class="section-label">TRAINING OBSERVATION · ${esc(formatDateShort(o.observed_on))}</div><h3>${esc(item.player.display_name||'Player')}</h3></div><span class="observation-plan-badge ${esc(o.training_to_plan)}">${esc(PLAN_ALIGNMENT_LABELS[o.training_to_plan]||'—')} · to plan</span></div><strong>${esc(TRAINING_OBSERVATION_LABELS[o.observation_type]||'Training observation')}</strong>${o.next_training_focus?`<p><b>Train next:</b> ${esc(o.next_training_focus)}</p>`:''}</article>`;
    }
    const m=item.match,coach=latestCoachFeedback(m),alignment=developmentAlignment(m.player_reflection,coach);
    const waiting=coach&&!m.player_reflection;
    return `<article class="card feedback-recent-card"><div class="feedback-recent-head"><div><div class="section-label">MATCH · ${esc(matchMetaLine(m))}</div><h3>${esc(item.player.display_name||'Player')}</h3></div>${waiting?'<span class="alignment-badge discuss">PLAYER REFLECTION NEEDED</span>':alignment?`<span class="alignment-badge ${alignment.key}">${esc(alignment.label)}</span>`:''}</div><strong>${esc(m.dismissal_summary||'Innings feedback')}</strong><div class="feedback-recent-actions">${m.player_reflection&&!coach&&item.player.can_edit?`<button class="btn secondary" data-add-coach-view-player="${item.player.id}" data-add-coach-view-match="${m.id}">Add coach view</button>`:''}<button class="btn ghost" data-open-plan-from-feedback="${item.player.id}">Open Player Plan</button></div></article>`;
  }).join(''):'<section class="card workspace-empty"><h2>No feedback recorded yet.</h2><p>Training observations, player reflections and match coaching feedback will appear here.</p></section>'}</div>`;
}

function renderFeedbackAdd(data){
  const editable=(data.players||[]).filter(p=>p.can_edit);
  if(feedbackWorkspaceSelectedPlayerId&&!editable.some(p=>p.id===feedbackWorkspaceSelectedPlayerId))feedbackWorkspaceSelectedPlayerId=null;
  const player=editable.find(p=>p.id===feedbackWorkspaceSelectedPlayerId)||null;
  return `<section class="card feedback-add-start">
    <div><div class="section-label">Add feedback</div><h2>Capture the useful bit. Skip the homework.</h2><p>Choose a player, then add either a quick training observation or your view of an innings.</p></div>
    <div class="feedback-add-controls">
      <div class="field"><label>Player</label><select id="feedbackAddPlayer">${feedbackPlayerNameOptions(editable,feedbackWorkspaceSelectedPlayerId)}</select></div>
      <div class="btnrow"><button class="btn secondary" id="feedbackAddTraining" ${player?'':'disabled'}>Training observation</button><button class="btn ghost" id="feedbackAddMatch" ${player?'':'disabled'}>Match feedback</button></div>
    </div>
  </section>
  ${player&&feedbackWorkspaceEntryMode==='training'?renderStaffTrainingObservationForm(player):''}
  ${player&&feedbackWorkspaceEntryMode==='match'?renderStaffMatchFeedbackForm(player,{matches:player.matches||[]},feedbackWorkspaceMatchId):''}`;
}

async function renderFeedbackWorkspace(){
  resetFeedbackWorkspaceForClub();
  const page=document.getElementById('page');
  if(!canUsePlayersWorkspace()){
    page.innerHTML=`<section class="card player-gate"><div class="gate-state locked">🔒</div><div class="section-label">Feedback</div><h2>This workspace has not been assigned to you.</h2><p>Coach/Captain feedback follows the same Player and Playing Group permissions as the Players workspace.</p></section>`;
    return;
  }
  if(!howWeBatVersions.length){
    page.innerHTML=`<section class="card player-gate"><div class="gate-state locked">🔒</div><div class="section-label">Feedback</div><h2>The Club Batting System is not live yet.</h2><p>Feedback becomes useful once Player Plans are available.</p></section>`;
    return;
  }

  page.innerHTML='<div class="splash">Loading feedback…</div>';
  try{feedbackWorkspaceData=await loadFeedbackWorkspaceData();}
  catch(e){page.innerHTML=`<section class="card"><div class="section-label">Feedback</div><h2>This workspace could not load.</h2><div class="notice">${esc(e?.message||String(e))}</div><div class="help" style="margin-top:10px">If v0.7.1 has just been deployed, make sure its Supabase migration was run first.</div></section>`;return;}

  const data=feedbackWorkspaceData;
  const signals=feedbackDiscussionSignals(data);
  const discussionPlayerCount=new Set(signals.map(s=>s.player.id)).size;
  const awaiting=(data.players||[]).reduce((n,p)=>n+(p.matches||[]).filter(m=>(m.coach_feedback||[]).length&&!m.player_reflection).length,0);
  const tabs=[['discussion',`Needs Discussion${signals.length?` · ${signals.length}`:''}`],['recent',`Recent Feedback${awaiting?` · ${awaiting} waiting`:''}`],['add','Add Feedback']];
  let body='';
  if(feedbackWorkspaceSection==='discussion')body=`<section class="card feedback-discussion-intro"><div><div class="section-label">Coach / Captain overview</div><h2>${discussionPlayerCount?`${discussionPlayerCount} player${discussionPlayerCount===1?'':'s'} worth a conversation`:'Nothing currently needs a coaching conversation.'}</h2><p>The system only surfaces patterns that are useful to discuss — not every poor innings or imperfect net session.</p></div></section><div class="feedback-signal-list">${signals.length?signals.map(renderDiscussionSignalCard).join(''):`<section class="card feedback-all-clear"><strong>All clear ✓</strong><span>Keep collecting short reflections and observations. New patterns will appear here automatically when they become worth discussing.</span></section>`}</div>`;
  if(feedbackWorkspaceSection==='recent')body=renderFeedbackRecent(data);
  if(feedbackWorkspaceSection==='add')body=renderFeedbackAdd(data);

  page.innerHTML=`<section class="card feedback-hero"><div><div class="section-label">Feedback</div><h1>See what is worth talking about.</h1><p>Short player reflections and coach observations are compiled into useful conversations — then fed back into training.</p><button class="guide-inline-link" id="feedbackGuideLink">How Coach Conversations work →</button></div><div class="feedback-hero-count"><strong>${discussionPlayerCount}</strong><span>PLAYER${discussionPlayerCount===1?'':'S'} TO SPEAK TO</span></div></section><div class="feedback-tabs">${tabs.map(([k,l])=>`<button data-feedback-section="${k}" class="${feedbackWorkspaceSection===k?'active':''}">${esc(l)}</button>`).join('')}</div>${body}`;

  document.getElementById('feedbackGuideLink')?.addEventListener('click',()=>openClubBattingGuideTopic('coach_conversations'));
  document.querySelectorAll('[data-feedback-section]').forEach(b=>b.onclick=()=>{if(!confirmLeaveFeedbackEntry())return;feedbackWorkspaceSection=b.dataset.feedbackSection;feedbackWorkspaceEntryMode=null;feedbackWorkspaceMatchId=null;feedbackWorkspaceDiscussionKey=null;renderFeedbackWorkspace();});
  document.querySelectorAll('[data-open-plan-from-feedback]').forEach(b=>b.onclick=()=>{if(confirmLeaveFeedbackEntry())openPlayerPlanFromFeedback(b.dataset.openPlanFromFeedback);});
  document.querySelectorAll('[data-view-feedback-player]').forEach(b=>b.onclick=()=>{if(!confirmLeaveFeedbackEntry())return;feedbackWorkspacePlayerFilter=b.dataset.viewFeedbackPlayer;feedbackWorkspaceSection='recent';feedbackWorkspaceDiscussionKey=null;renderFeedbackWorkspace();});
  document.querySelectorAll('[data-toggle-discussion]').forEach(b=>b.onclick=()=>{if(!confirmLeaveFeedbackEntry())return;const identity=discussionSignalIdentity(b.dataset.discussionPlayer,b.dataset.toggleDiscussion);feedbackWorkspaceDiscussionKey=feedbackWorkspaceDiscussionKey===identity?null:identity;renderFeedbackWorkspace();});
  document.querySelectorAll('[data-discussion-outcome]').forEach(b=>b.onclick=()=>{
    const signal=signals.find(s=>s.key===b.dataset.signalKey&&s.player.id===b.dataset.discussionPlayer);if(!signal||!signal.player.can_edit)return;
    openCoachingConversationForm(signal,b.dataset.discussionOutcome,b.closest('.discussion-outcome-picker'),async()=>{
      feedbackWorkspaceDiscussionKey=null;await renderFeedbackWorkspace();
    });
  });

  const filter=document.getElementById('feedbackPlayerFilter');if(filter)filter.onchange=()=>{if(!confirmLeaveFeedbackEntry()){filter.value=feedbackWorkspacePlayerFilter;return;}feedbackWorkspacePlayerFilter=filter.value;renderFeedbackWorkspace();};
  document.querySelectorAll('[data-add-coach-view-player]').forEach(b=>b.onclick=()=>{feedbackWorkspaceSelectedPlayerId=b.dataset.addCoachViewPlayer;feedbackWorkspaceMatchId=b.dataset.addCoachViewMatch;feedbackWorkspaceEntryMode='match';feedbackWorkspaceSection='add';renderFeedbackWorkspace();});

  const addPlayer=document.getElementById('feedbackAddPlayer');if(addPlayer)addPlayer.onchange=()=>{if(!confirmLeaveFeedbackEntry()){addPlayer.value=feedbackWorkspaceSelectedPlayerId||'';return;}feedbackWorkspaceSelectedPlayerId=addPlayer.value||null;feedbackWorkspaceEntryMode=null;feedbackWorkspaceMatchId=null;renderFeedbackWorkspace();};
  const addTraining=document.getElementById('feedbackAddTraining');if(addTraining)addTraining.onclick=()=>{if(!confirmLeaveFeedbackEntry())return;feedbackWorkspaceEntryMode='training';feedbackWorkspaceMatchId=null;renderFeedbackWorkspace().then(()=>requestAnimationFrame(()=>document.getElementById('staffDevelopmentForm')?.scrollIntoView({behavior:'smooth',block:'start'})));};
  const addMatch=document.getElementById('feedbackAddMatch');if(addMatch)addMatch.onclick=()=>{if(!confirmLeaveFeedbackEntry())return;feedbackWorkspaceEntryMode='match';feedbackWorkspaceMatchId=null;renderFeedbackWorkspace().then(()=>requestAnimationFrame(()=>document.getElementById('staffDevelopmentForm')?.scrollIntoView({behavior:'smooth',block:'start'})));};

  wireQuickChoices(page);
  captureFeedbackEntryBaseline();
  const selected=(data.players||[]).find(p=>p.id===feedbackWorkspaceSelectedPlayerId)||null;
  if(document.getElementById('cancelStaffDevelopment'))document.getElementById('cancelStaffDevelopment').onclick=()=>{if(!confirmLeaveFeedbackEntry())return;feedbackWorkspaceEntryMode=null;feedbackWorkspaceMatchId=null;renderFeedbackWorkspace();};
  if(selected&&document.getElementById('saveTrainingObservation'))document.getElementById('saveTrainingObservation').onclick=async()=>{
    const btn=document.getElementById('saveTrainingObservation'),st=document.getElementById('staffDevelopmentStatus');
    const toPlan=document.querySelector('input[name="staffTrainingToPlan"]:checked')?.value;
    const type=document.querySelector('input[name="staffObservationType"]:checked')?.value;
    const formatKeys=[...document.querySelectorAll('[data-training-format]:checked')].map(x=>x.value);
    if(!toPlan||!type){st.textContent='Choose the two quick observation answers first.';return;}
    btn.disabled=true;btn.textContent='Saving…';
    const {error}=await supabase.rpc('add_training_observation',{p_player_id:selected.id,p_observed_on:val('trainingObservationDate')||null,p_format_keys:formatKeys,p_training_to_plan:toPlan,p_observation_type:type,p_next_training_focus:val('staffTrainingNextFocus'),p_note:val('staffTrainingNote')});
    if(error){btn.disabled=false;btn.textContent='Save observation';st.textContent=error.message;return;}
    feedbackWorkspaceEntryMode=null;await renderFeedbackWorkspace();
  };
  if(selected&&document.getElementById('saveStaffMatchFeedback'))document.getElementById('saveStaffMatchFeedback').onclick=async()=>{
    const btn=document.getElementById('saveStaffMatchFeedback'),st=document.getElementById('staffDevelopmentStatus');
    const batting=document.querySelector('input[name="staffBattingToPlan"]:checked')?.value;
    const dismissal=document.querySelector('input[name="staffDismissalClass"]:checked')?.value;
    if(!batting||!dismissal){st.textContent='Choose the two quick coaching answers first.';return;}
    btn.disabled=true;btn.textContent='Saving…';
    const {error}=await supabase.rpc('add_staff_match_feedback',{p_player_id:selected.id,p_match_id:feedbackWorkspaceMatchId||null,p_match_date:val('staffMatchDate')||null,p_opposition:val('staffMatchOpposition'),p_format_key:document.getElementById('staffMatchFormat').value,p_score_text:val('staffMatchScore'),p_dismissal_summary:val('staffMatchDismissal'),p_batting_to_plan:batting,p_dismissal_classification:dismissal,p_main_issue:document.getElementById('staffMatchMainIssue').value||null,p_next_training_focus:val('staffMatchNextFocus'),p_note:val('staffMatchNote')});
    if(error){btn.disabled=false;btn.textContent='Save coaching feedback';st.textContent=error.message;return;}
    feedbackWorkspaceEntryMode=null;feedbackWorkspaceMatchId=null;await renderFeedbackWorkspace();
  };
}

/* ---------------- PLAYERS WORKSPACE ---------------- */

function permissionRoleLabel(role){
  return role==='captain'
    ?'Captain'
    :role==='coach'
      ?'Coach'
      :role==='head_coach'
        ?'Head Coach'
        :role==='admin'
          ?'Club Admin'
          :'Club member';
}

function emptyPlayerPlanRaw(){
  return {core:{},formats:{}};
}

function workspacePlayerRaw(player){
  const raw=player?.workflow?.raw_answers;
  return raw&&typeof raw==='object'
    ?structuredClone(raw)
    :emptyPlayerPlanRaw();
}

function workspaceRequirements(player){
  const grouped=new Map();
  for(const r of player?.requirements||[]){
    if(!r?.format_key)continue;
    if(!grouped.has(r.format_key)){
      grouped.set(r.format_key,{
        format_key:r.format_key,
        required:true,
        due_date:r.due_date||null,
        sources:[]
      });
    }
    const x=grouped.get(r.format_key);
    if(r.due_date && (!x.due_date || String(r.due_date)<String(x.due_date)))x.due_date=r.due_date;
    if(r.source_label && !x.sources.includes(r.source_label))x.sources.push(r.source_label);
  }
  return grouped;
}

function workspaceRequiredSections(player){
  return ['core',...workspaceRequirements(player).keys()];
}

function workspaceSectionState(section,raw){
  const progress=sectionProgress(section,raw);
  if(progress.complete)return {key:'complete',label:'Complete',progress};
  if(progress.answeredAny)return {key:'started',label:'Started',progress};
  return {key:'not-started',label:'Not started',progress};
}

function workspacePlayerProgress(player){
  const raw=workspacePlayerRaw(player);
  const required=workspaceRequiredSections(player);
  const complete=required.filter(section=>sectionProgress(section,raw).complete).length;
  return {raw,required,complete,total:required.length};
}

function workspaceRequirementText(player,section){
  if(section==='core')return 'Required core section';
  const req=workspaceRequirements(player).get(section);
  if(!req)return 'Available anytime';
  const source=req.sources?.length?` · ${req.sources.join(' + ')}`:'';
  return req.due_date
    ?`Required by ${niceDate(req.due_date)}${source}`
    :`Required now${source}`;
}

function workspaceUpdatedLabel(player){
  const updated=player?.workflow?.updated_at;
  if(!updated)return 'No Player Plan work saved yet';
  const d=new Date(updated);
  return Number.isNaN(d.getTime())
    ?'Player Plan saved'
    :`Last saved ${d.toLocaleString('en-AU',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}`;
}


function playerPlanDeadlineState(player){
  const raw=workspacePlayerRaw(player);
  const requirements=workspaceRequirements(player);
  const requiredSections=['core',...requirements.keys()];
  const completeCount=requiredSections.filter(section=>sectionProgress(section,raw).complete).length;
  const today=new Date();
  today.setHours(0,0,0,0);
  const incomplete=[...requirements.values()]
    .filter(req=>!sectionProgress(req.format_key,raw).complete)
    .map(req=>{
      const due=req.due_date?new Date(String(req.due_date).slice(0,10)+'T00:00:00'):null;
      const overdue=!!(due && due<today);
      return {...req,due,overdue,label:formatLabel(req.format_key)};
    })
    .sort((a,b)=>String(a.due_date||'9999-12-31').localeCompare(String(b.due_date||'9999-12-31')));
  const overdue=incomplete.filter(x=>x.overdue);
  return {
    raw,requirements,requiredSections,completeCount,totalCount:requiredSections.length,
    allComplete:completeCount===requiredSections.length,
    incomplete,overdue,
    nextIncomplete:incomplete[0]||null,
    firstOverdue:overdue[0]||null
  };
}

async function refreshPlanDeadlineViews(){
  await loadData();
  if(currentTab==='myplan')await renderMyPlan();
  else if(currentTab==='players')await renderPlayersWorkspace();
}

async function openPlanDueDateDialog(defaultFormat=null){
  if(!isAdmin())return;
  const formats=publishedEnabledFormats();
  if(!formats.length){alert('Publish the Club Batting System before setting Player Plan dates.');return;}

  const [{data:groups,error:gErr},{data:reqs,error:rErr}]=await Promise.all([
    supabase.from('playing_groups').select('id,name,sort_order').eq('club_id',club.id).eq('active',true).order('sort_order').order('name'),
    supabase.from('player_plan_requirements').select('id,format_key,playing_group_id,due_date,target_type,active').eq('club_id',club.id).eq('active',true).eq('target_type','playing_group')
  ]);
  if(gErr||rErr){alert((gErr||rErr).message);return;}
  if(!(groups||[]).length){alert('Create a Playing Group first.');return;}

  document.getElementById('planDueDateDialog')?.remove();
  const dialog=document.createElement('dialog');
  dialog.id='planDueDateDialog';
  dialog.style.cssText='max-width:680px;width:calc(100% - 32px);border:0;border-radius:16px;padding:0;box-shadow:0 20px 60px rgba(20,32,80,.25)';
  document.body.appendChild(dialog);

  const initial=formats.some(([k])=>k===defaultFormat)?defaultFormat:formats[0][0];
  const renderBody=(formatKey)=>{
    const formatLabelText=FORMATS.find(([k])=>k===formatKey)?.[1]||formatKey;
    const existing=new Map((reqs||[]).filter(r=>r.format_key===formatKey&&r.playing_group_id).map(r=>[r.playing_group_id,r]));
    dialog.innerHTML=`<div style="padding:22px 24px">
      <div class="section-label">Player Plan dates</div>
      <h2 style="margin:4px 0 8px">Set a ${esc(formatLabelText)} due date</h2>
      <div class="help">Choose one or more Playing Groups. This makes the format required for those players by the date you set; it does not lock any other format.</div>
      <div class="field" style="margin-top:16px"><label>Format</label><select id="planDateFormat">${formats.map(([k,l])=>`<option value="${k}" ${k===formatKey?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
      <div style="display:grid;gap:7px;margin-top:14px;max-height:290px;overflow:auto">
        ${(groups||[]).map(g=>{const r=existing.get(g.id);return `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff"><input type="checkbox" data-plan-date-group value="${g.id}"><span style="flex:1"><strong>${esc(g.name)}</strong>${r?`<small style="display:block;margin-top:2px;color:var(--muted)">${r.due_date?`Currently due ${esc(niceDate(r.due_date))}`:'Currently required now'}</small>`:'<small style="display:block;margin-top:2px;color:var(--muted)">No due date set</small>'}</span></label>`}).join('')}
      </div>
      <div class="field" style="margin-top:14px"><label>Required by</label><input id="planDateValue" type="date"></div>
      <div class="btnrow" style="margin-top:16px"><button class="btn secondary" id="savePlanDates">Set / update date</button><button class="btn ghost" id="removePlanDates">Remove selected requirement</button><button class="btn ghost" id="planDatesGuide">Show me how</button><button class="btn ghost" id="closePlanDates">Close</button><span class="status" id="planDateStatus"></span></div>
    </div>`;

    dialog.querySelector('#planDateFormat').onchange=e=>renderBody(e.target.value);
    dialog.querySelector('#planDatesGuide').onclick=()=>{dialog.close();openClubBattingGuideTopic('plan_dates');};
    dialog.querySelector('#closePlanDates').onclick=()=>dialog.close();
    dialog.querySelector('#savePlanDates').onclick=async()=>{
      const selected=[...dialog.querySelectorAll('[data-plan-date-group]:checked')].map(x=>x.value);
      const due=dialog.querySelector('#planDateValue').value||null;
      const st=dialog.querySelector('#planDateStatus');
      if(!selected.length){st.textContent='Choose at least one Playing Group.';return;}
      if(!due){st.textContent='Choose a due date.';return;}
      st.textContent='Saving…';
      const {error}=await supabase.rpc('set_group_plan_due_date',{p_club_id:club.id,p_format_key:formatKey,p_playing_group_ids:selected,p_due_date:due});
      if(error){st.textContent=error.message;return;}
      dialog.close();dialog.remove();
      await refreshPlanDeadlineViews();
    };
    dialog.querySelector('#removePlanDates').onclick=async()=>{
      const selected=[...dialog.querySelectorAll('[data-plan-date-group]:checked')].map(x=>x.value);
      const st=dialog.querySelector('#planDateStatus');
      if(!selected.length){st.textContent='Choose at least one Playing Group.';return;}
      const matching=(reqs||[]).filter(r=>r.format_key===formatKey&&selected.includes(r.playing_group_id));
      if(!matching.length){st.textContent='None of those groups has a requirement to remove.';return;}
      const ok=confirm(`Remove the ${formatLabelText} requirement for ${matching.length} selected Playing Group${matching.length===1?'':'s'}?`);
      if(!ok)return;
      st.textContent='Removing…';
      for(const r of matching){
        const {error}=await supabase.rpc('deactivate_plan_requirement',{p_requirement_id:r.id});
        if(error){st.textContent=error.message;return;}
      }
      dialog.close();dialog.remove();
      await refreshPlanDeadlineViews();
    };
  };

  renderBody(initial);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
}

function resetPlayersWorkspaceForClub(){
  if(playersWorkspaceClubId===club.id)return;
  playersWorkspaceClubId=club.id;
  playersWorkspaceData=null;
  playersWorkspaceSelectedId=null;
  playersWorkspaceSection='summary';
  playersWorkspaceLocalRaw=null;
  playersWorkspaceSearch='';
  playersWorkspaceGroupFilter='';
  playersWorkspaceDevelopmentMode=null;
  playersWorkspaceDevelopmentMatchId=null;
  playersWorkspaceFeedbackData=null;
  playersWorkspaceReminderData=null;
  playersWorkspaceDiscussionKey=null;
  if(playersWorkspaceAutosaveTimer){
    clearTimeout(playersWorkspaceAutosaveTimer);
    playersWorkspaceAutosaveTimer=null;
  }
}

async function renderPlayersWorkspace(){
  resetPlayersWorkspaceForClub();
  const page=document.getElementById('page');

  if(!canUsePlayersWorkspace()){
    page.innerHTML=`<section class="card player-gate">
      <div class="gate-state locked">🔒</div>
      <div class="section-label">Player access</div>
      <h2>Ask your Club Admin for access to players.</h2>
      <p>Your Club Admin can assign a coaching role and the Playing Groups you need to work with.</p>
      ${isPlayerUser()?'<div class="btnrow"><button class="btn secondary" id="openOwnPlanFromPlayers">Open My Player Plan</button></div>':''}
    </section>`;
    document.getElementById('openOwnPlanFromPlayers')?.addEventListener('click',()=>{currentTab='myplan';renderTab();});
    return;
  }

  page.innerHTML='<div class="splash">Loading players…</div>';

  const reminderPromise=isAdmin()&&workspacePlayerPlansPublished()
    ?supabase.rpc('get_player_plan_reminder_overview',{p_club_id:club.id})
    :Promise.resolve({data:{reminders:[],cooldown_hours:48,email_mode:'unknown'},error:null});
  const [playersRes,feedbackRes,reminderRes]=await Promise.all([
    supabase.rpc('get_players_workspace',{p_club_id:club.id}),
    supabase.rpc('get_feedback_workspace',{p_club_id:club.id}),
    reminderPromise
  ]);

  if(playersRes.error){
    page.innerHTML=`<section class="card">
      <div class="section-label">Players</div>
      <h2>Player access could not load.</h2>
      <div class="notice">${esc(playersRes.error.message)}</div>
    </section>`;
    return;
  }

  playersWorkspaceData=playersRes.data||{role:membership.permission_role,groups:[],players:[]};
  playersWorkspaceData.players=Array.isArray(playersWorkspaceData.players)?playersWorkspaceData.players:[];
  playersWorkspaceData.groups=Array.isArray(playersWorkspaceData.groups)?playersWorkspaceData.groups:[];

  if(feedbackRes.error){
    playersWorkspaceFeedbackData={role:membership.permission_role,players:[],error:feedbackRes.error.message};
  }else{
    playersWorkspaceFeedbackData=feedbackRes.data||{role:membership.permission_role,players:[]};
    playersWorkspaceFeedbackData.players=Array.isArray(playersWorkspaceFeedbackData.players)?playersWorkspaceFeedbackData.players:[];
  }

  playersWorkspaceReminderData=reminderRes?.error
    ?{reminders:[],cooldown_hours:48,email_mode:'unknown',error:reminderRes.error.message}
    :(reminderRes?.data||{reminders:[],cooldown_hours:48,email_mode:'unknown'});
  playersWorkspaceReminderData.reminders=Array.isArray(playersWorkspaceReminderData.reminders)?playersWorkspaceReminderData.reminders:[];

  if(playersWorkspaceSelectedId && !playersWorkspaceData.players.some(p=>p.id===playersWorkspaceSelectedId)){
    playersWorkspaceSelectedId=null;
    playersWorkspaceSection='summary';
    playersWorkspaceLocalRaw=null;
  }

  if(playersWorkspaceSelectedId)await renderPlayersWorkspacePlayer();
  else renderPlayersWorkspaceList();
}

function workspaceFeedbackPlayer(playerId){
  return (playersWorkspaceFeedbackData?.players||[]).find(p=>p.id===playerId)||null;
}

function workspaceDiscussionSignals(){
  return feedbackDiscussionSignals(playersWorkspaceFeedbackData||{players:[]});
}

function workspaceSignalsForPlayer(playerId){
  return workspaceDiscussionSignals().filter(s=>s.player.id===playerId);
}

function workspaceOpenPlayer(playerId,section='summary',developmentMode=null){
  if(!confirmLeaveFeedbackEntry())return;
  playersWorkspaceSelectedId=playerId;
  playersWorkspaceSection=section;
  playersWorkspaceDevelopmentMode=developmentMode;
  playersWorkspaceDevelopmentMatchId=null;
  playersWorkspaceLocalRaw=null;
  renderPlayersWorkspacePlayer().then(()=>{
    if(developmentMode){
      requestAnimationFrame(()=>document.getElementById('staffDevelopmentForm')?.scrollIntoView({behavior:'smooth',block:'start'}));
    }
  });
}

function workspaceFeedbackCount(playerId){
  const p=workspaceFeedbackPlayer(playerId);
  if(!p)return 0;
  return (p.matches?.length||0)+(p.training_observations?.length||0);
}

function renderWorkspaceRosterDiscussion(player,signals){
  if(!signals.length)return '';
  const primary=signals[0];
  const isOpen=playersWorkspaceDiscussionKey===discussionSignalIdentity(player.id,primary.key);
  return `<div class="workspace-roster-discussion ${primary.tone}">
    <div class="workspace-roster-discussion-copy">
      <span class="workspace-discussion-badge">NEEDS DISCUSSION${signals.length>1?` · ${signals.length} ITEMS`:''}</span>
      <strong>${esc(primary.title)}</strong>
      <small>${esc(primary.summary)}</small>
    </div>
    ${player.can_edit?`<button class="workspace-text-link strong" data-toggle-roster-discussion="${esc(primary.key)}" data-discussion-player="${esc(player.id)}">${isOpen?'Close':'Mark discussed'}</button>`:''}
    ${isOpen&&player.can_edit?`<div class="workspace-discussion-outcomes">
      <span>${esc(primary.suggestion)}</span>
      <p class="help">Record what you agreed. A training change or plan review creates a shared action with a review date.</p>
      <div>
        <button data-roster-discussion-outcome="keep_plan" data-signal-key="${esc(primary.key)}" data-discussion-player="${esc(player.id)}">Plan stays as it is</button>
        <button data-roster-discussion-outcome="adjust_training" data-signal-key="${esc(primary.key)}" data-discussion-player="${esc(player.id)}">Training change agreed</button>
        <button data-roster-discussion-outcome="review_plan" data-signal-key="${esc(primary.key)}" data-discussion-player="${esc(player.id)}">Plan review agreed</button>
        <button data-roster-discussion-outcome="no_action" data-signal-key="${esc(primary.key)}" data-discussion-player="${esc(player.id)}">No action needed</button>
      </div>
    </div>`:''}
  </div>`;
}

function workspaceReminderHistory(playerId,formatKey=''){
  const all=playersWorkspaceReminderData?.reminders||[];
  return all
    .filter(r=>String(r.player_id||'')===String(playerId||'')&&String(r.format_key||'')===String(formatKey||''))
    .sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
}

function workspaceReminderState(playerId,formatKey=''){
  const history=workspaceReminderHistory(playerId,formatKey);
  const latest=history[0]||null;
  const cooldownHours=Number(playersWorkspaceReminderData?.cooldown_hours||48);
  const created=latest?.created_at?new Date(latest.created_at):null;
  const nextAllowed=created&&!Number.isNaN(created.getTime())?new Date(created.getTime()+cooldownHours*60*60*1000):null;
  const inCooldown=!!(nextAllowed&&nextAllowed.getTime()>Date.now());
  let delivery='';
  if(latest){
    if(latest.sent_at)delivery='sent';
    else if(latest.failed_at)delivery='failed';
    else if(latest.processing_at)delivery='sending';
    else delivery='queued';
  }
  return {history,latest,count:history.length,nextAllowed,inCooldown,delivery};
}

function reminderTimestamp(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return d.toLocaleString('en-AU',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
}

async function refreshPlayersWorkspaceReminders(){
  if(!isAdmin())return;
  const {data,error}=await supabase.rpc('get_player_plan_reminder_overview',{p_club_id:club.id});
  playersWorkspaceReminderData=error
    ?{reminders:[],cooldown_hours:48,email_mode:'unknown',error:error.message}
    :(data||{reminders:[],cooldown_hours:48,email_mode:'unknown'});
  playersWorkspaceReminderData.reminders=Array.isArray(playersWorkspaceReminderData.reminders)?playersWorkspaceReminderData.reminders:[];
}

function publishedPlayerSystemReady(state={philosophyVersions,howWeBatVersions,playerPlanStructureVersions}){
  const philosophy=state.philosophyVersions?.[0];
  const howWeBat=state.howWeBatVersions?.[0];
  const questions=state.playerPlanStructureVersions?.[0];
  return !!(philosophy&&howWeBat&&questions&&howWeBat.philosophy_version===philosophy.version_number&&questions.philosophy_version===philosophy.version_number);
}
function workspacePlayerPlansPublished(){
  return publishedPlayerSystemReady();
}

function renderWorkspaceRosterRow(player,{discussionMode=false,signals=[]}={}){
  const groups=(player.groups||[]).map(g=>`<span>${esc(g.name)}</span>`).join('');
  const feedbackCount=workspaceFeedbackCount(player.id);
  const plansPublished=workspacePlayerPlansPublished();
  const planState=plansPublished?playerPlanDeadlineState(player):{firstOverdue:null,nextIncomplete:null};
  const overdue=planState.firstOverdue;
  const next=planState.nextIncomplete;
  const reminder=overdue?workspaceReminderState(player.id,overdue.format_key):{history:[],count:0,inCooldown:false,latest:null,delivery:''};
  const planHeadline=!plansPublished
    ?'Player Plan questions are being prepared'
    :planState.allComplete
    ?'Player Plan up to date ✓'
    :`${planState.completeCount}/${planState.totalCount} required sections complete`;
  const planDetail=!plansPublished
    ?'Registration, club roles and Playing Groups are available now. Player Plans open after publication.'
    :overdue
    ?`${overdue.label} was due ${niceDate(overdue.due_date)}`
    :next?.due_date
      ?`${next.label} due ${niceDate(next.due_date)}`
      :next
        ?`${next.label} still to complete`
        :'Core still to complete';

  let reminderMeta='';
  let reminderAction='';
  if(isAdmin()&&overdue){
    if(reminder.latest){
      const stateLabel=reminder.delivery==='sent'?'sent':reminder.delivery==='failed'?'failed':reminder.delivery==='sending'?'sending':'queued';
      const at=reminderTimestamp(reminder.latest.sent_at||reminder.latest.failed_at||reminder.latest.created_at);
      const countLabel=`${reminder.count} reminder${reminder.count===1?'':'s'}`;
      const failure=reminder.delivery==='failed'&&reminder.latest.last_error?` · ${reminder.latest.last_error}`:'';
      const cooldown=reminder.inCooldown&&reminder.nextAllowed?` · next available ${reminderTimestamp(reminder.nextAllowed)}`:'';
      reminderMeta=`<span style="display:block;margin-top:3px;font-size:10.5px;color:var(--muted)">${esc(countLabel)} · ${esc(stateLabel)}${at?` ${esc(at)}`:''}${esc(failure)}${esc(cooldown)}</span>`;
    }
    if(reminder.inCooldown){
      reminderAction=`<button class="workspace-text-link strong" disabled title="A new reminder becomes available after the 48-hour cooldown.">${reminder.delivery==='sent'?'Reminder sent':'Reminder queued'}</button>`;
    }else{
      reminderAction=`<button class="workspace-text-link strong" data-send-plan-reminder="${player.id}" data-reminder-format="${overdue.format_key}">${reminder.count?'Send another reminder':'Send reminder'}</button>`;
    }
  }

  return `<article class="workspace-roster-row" ${overdue?'style="border-left:4px solid var(--accent,#D8232A)"':''}>
    <div class="workspace-roster-person">
      <div>
        <h3>${esc(player.display_name||'Player')}</h3>
        <div class="workspace-roster-groups">${groups||'<span>Unassigned</span>'}</div>
      </div>
      <span class="workspace-access-badge ${player.can_edit?'edit':'view'}">${player.can_edit?'VIEW + EDIT':'VIEW ONLY'}</span>
    </div>
    ${signals.length?renderWorkspaceRosterDiscussion(player,signals):''}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0 3px">
      <div><strong style="font-size:12px;color:${overdue?'var(--accent,#D8232A)':'var(--navy2)'}">${esc(planHeadline)}</strong><span style="display:block;margin-top:2px;font-size:11px;color:var(--muted)">${esc(planDetail)}</span>${reminderMeta}</div>
      ${reminderAction}
    </div>
    <div class="workspace-roster-actions">
      <button class="workspace-text-link" data-open-workspace-player="${player.id}">${plansPublished?'Player Plan':'View player'}</button>
      ${plansPublished?`<button class="workspace-text-link" data-open-training-plan="${player.id}">Training Plan</button>`:'<button class="workspace-text-link" disabled title="Training guidance will be available after Player Plans open and the player completes their plan.">Training Plan</button>'}
      <button class="workspace-text-link" data-open-player-feedback="${player.id}">Feedback${feedbackCount?` · ${feedbackCount}`:''}</button>
      ${player.can_edit?`<button class="workspace-text-link add" data-quick-match-observation="${player.id}">+ Match observation</button>
      <button class="workspace-text-link add" data-quick-training-observation="${player.id}">+ Training observation</button>`:''}
    </div>
  </article>`;
}

async function refreshPlayersWorkspaceFeedback(){
  try{
    playersWorkspaceFeedbackData=await loadFeedbackWorkspaceData();
  }catch(e){
    playersWorkspaceFeedbackData={role:membership.permission_role,players:[],error:e?.message||String(e)};
  }
}

function renderPlayersWorkspaceList(){
  const page=document.getElementById('page');
  const data=playersWorkspaceData||{players:[],groups:[]};
  const players=data.players||[];
  const role=permissionRoleLabel(data.role||membership.permission_role);
  const query=playersWorkspaceSearch.trim().toLowerCase();
  const allSignals=workspaceDiscussionSignals();
  const signalPlayerIds=new Set(allSignals.map(s=>s.player.id));
  const discussionMode=playersWorkspaceGroupFilter==='__discussion__';
  const plansPublished=workspacePlayerPlansPublished();

  let filtered=[];
  if(discussionMode){
    filtered=players.filter(player=>{
      const matchesName=!query || String(player.display_name||'').toLowerCase().includes(query);
      return matchesName&&signalPlayerIds.has(player.id);
    });
  }else if(playersWorkspaceGroupFilter){
    filtered=players.filter(player=>{
      const matchesName=!query || String(player.display_name||'').toLowerCase().includes(query);
      const matchesGroup=(player.groups||[]).some(g=>g.id===playersWorkspaceGroupFilter);
      return matchesName&&matchesGroup;
    });
  }else{
    filtered=players.filter(player=>!query||String(player.display_name||'').toLowerCase().includes(query));
  }

  const playerSignals=new Map();
  for(const signal of allSignals){
    if(!playerSignals.has(signal.player.id))playerSignals.set(signal.player.id,[]);
    playerSignals.get(signal.player.id).push(signal);
  }

  const roster=filtered.map(player=>renderWorkspaceRosterRow(player,{
    discussionMode,
    signals:playerSignals.get(player.id)||[]
  })).join('');

  const discussionPlayers=signalPlayerIds.size;
  const filteredPlanStates=plansPublished?filtered.map(player=>playerPlanDeadlineState(player)):[];
  const planCompleteCount=filteredPlanStates.filter(x=>x.allComplete).length;
  const planOverdueCount=filteredPlanStates.filter(x=>x.overdue.length).length;
  let emptyCopy='';
  if(!playersWorkspaceGroupFilter&&!query){
    emptyCopy=`<section class="card workspace-roster-empty"><strong>${isAdmin()?'Your player list is ready for sign-ups.':'There are no players in your access yet.'}</strong><span>${isAdmin()?'Use People & Sign-up to invite players, and Manage Playing Groups to prepare your groups.':'Your Club Admin can assign the players and Playing Groups you work with.'}</span></section>`;
  }else if(query&&!filtered.length){
    emptyCopy=`<section class="card workspace-roster-empty"><strong>Try another name or clear your search.</strong><span>Your search found no players in this view. Only players you have permission to access are included.</span><div class="btnrow"><button class="btn ghost" id="clearPlayerSearch">Clear search</button></div></section>`;
  }else if(discussionMode){
    emptyCopy=`<section class="card workspace-roster-empty"><strong>No coaching conversations waiting.</strong><span>When feedback creates something worth discussing, the player will appear here automatically.</span></section>`;
  }else{
    emptyCopy=`<section class="card workspace-roster-empty"><strong>No players to show.</strong><span>There are no accessible players in this Playing Group.</span></section>`;
  }

  page.innerHTML=`<section class="card players-workspace-head compact">
    <div>
      <div class="section-label">${esc(role)} workspace</div>
      <h2>Players</h2>
      <div class="help">${plansPublished?'Find your players, open their plans and follow up on coaching conversations.':'Register people, assign club roles and organise Playing Groups while the club prepares its setup. Player Plans open after publication.'} Filter by Playing Group or search by name.</div>
    </div>
    ${isAdmin()?`<div class="btnrow compact"><button class="btn ghost" id="managePeopleFromPlayers">People & Sign-up</button>${plansPublished?'<button class="btn ghost" id="managePlanDatesFromPlayers">Plan dates</button>':''}<button class="btn ghost" id="managePlayingGroupsFromPlayers">Manage Playing Groups</button></div>`:''}
  </section>

  ${plansPublished?'':'<div class="notice" style="margin-top:14px"><strong>People can join now; Player Plans open after publication.</strong> Use People & Sign-up to register people and assign club roles. Choose the Philosophy Lead and contributors in the Workshop. Players without setup access will see a waiting message when they sign in.</div>'}
  <section class="card players-workspace-tools compact">
    <div class="field">
      <label>Find a player</label>
      <input id="workspacePlayerSearch" value="${esc(playersWorkspaceSearch)}" placeholder="Search by name">
    </div>
    <div class="field">
      <label>Playing Group</label>
      <select id="workspaceGroupFilter">
        <option value="" ${!playersWorkspaceGroupFilter?'selected':''}>All accessible players</option>
        ${(data.groups||[]).map(g=>`<option value="${g.id}" ${playersWorkspaceGroupFilter===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}
        <option disabled>──────────</option><option value="__discussion__" ${discussionMode?'selected':''}>Needs a Coaching Conversation · ${discussionPlayers}</option>
      </select>
    </div>
    <div class="workspace-filter-count compact"><strong>${filtered.length}</strong><span>shown</span></div>
  </section>

  ${plansPublished&&playersWorkspaceGroupFilter&&!discussionMode&&filtered.length?`<div class="notice compact" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><strong>Player Plan status</strong><span><strong>${planCompleteCount}/${filtered.length}</strong> up to date</span>${planOverdueCount?`<span style="color:var(--accent,#D8232A)"><strong>${planOverdueCount}</strong> overdue</span>`:'<span>No overdue Player Plans</span>'}${isAdmin()&&planOverdueCount?`<button class="btn ghost" id="remindOverduePlayers" style="margin-left:auto">Remind overdue players</button>`:''}</div>`:''}

  ${isAdmin()&&playersWorkspaceReminderData?.email_mode==='prototype'?`<div class="notice compact"><strong>Email delivery is still in Prototype mode.</strong> Reminders can be queued and tracked here, but they will not leave Club Batting until Platform Admin switches email delivery to Live.</div>`:''}
  ${isAdmin()&&playersWorkspaceReminderData?.error?`<div class="notice compact">Reminder history could not be loaded: ${esc(playersWorkspaceReminderData.error)}</div>`:''}
  ${playersWorkspaceFeedbackData?.error?`<div class="notice compact">Coaching feedback could not be loaded, so discussion flags are temporarily unavailable: ${esc(playersWorkspaceFeedbackData.error)}</div>`:''}

  <div class="workspace-roster-list">${roster||emptyCopy}</div>`;

  document.getElementById('managePlanDatesFromPlayers')?.addEventListener('click',()=>openPlanDueDateDialog());
  document.getElementById('managePeopleFromPlayers')?.addEventListener('click',()=>{currentTab='permissions';renderTab();});
  document.getElementById('clearPlayerSearch')?.addEventListener('click',()=>{if(!confirmLeaveFeedbackEntry())return;playersWorkspaceSearch='';renderPlayersWorkspaceList();});
  document.getElementById('managePlayingGroupsFromPlayers')?.addEventListener('click',()=>{currentTab='groups';renderTab();});

  document.getElementById('remindOverduePlayers')?.addEventListener('click',async()=>{
    if(!playersWorkspaceGroupFilter||playersWorkspaceGroupFilter==='__discussion__')return;
    const ok=confirm(`Queue one Player Plan reminder for each overdue player in this Playing Group? Players still inside the 48-hour cooldown will be skipped.`);
    if(!ok)return;
    const btn=document.getElementById('remindOverduePlayers');
    if(btn){btn.disabled=true;btn.textContent='Queuing reminders…';}
    const {data:result,error}=await supabase.rpc('send_overdue_player_plan_reminders',{p_club_id:club.id,p_playing_group_id:playersWorkspaceGroupFilter});
    if(error){alert(error.message);if(btn){btn.disabled=false;btn.textContent='Remind overdue players';}return;}
    if(platformRole)await kickLiveEmailDelivery();
    await new Promise(r=>setTimeout(r,500));
    await refreshPlayersWorkspaceReminders();
    renderPlayersWorkspaceList();
    const queued=Number(result?.queued||0);
    const cooldown=Number(result?.skipped_cooldown||0);
    const noEmail=Number(result?.skipped_no_email||0);
    const failed=Number(result?.failed||0);
    alert(`${queued} reminder${queued===1?'':'s'} queued${cooldown?` · ${cooldown} skipped inside cooldown`:''}${noEmail?` · ${noEmail} without an email-linked account`:''}${failed?` · ${failed} failed`:''}.`);
  });

  const search=document.getElementById('workspacePlayerSearch');
  if(search)search.oninput=()=>{
    if(!confirmLeaveFeedbackEntry()){search.value=playersWorkspaceSearch;return;}
    playersWorkspaceSearch=search.value;
    renderPlayersWorkspaceList();
    requestAnimationFrame(()=>{
      const next=document.getElementById('workspacePlayerSearch');
      if(next){next.focus();next.setSelectionRange(playersWorkspaceSearch.length,playersWorkspaceSearch.length);}
    });
  };

  const filter=document.getElementById('workspaceGroupFilter');
  if(filter)filter.onchange=()=>{
    if(!confirmLeaveFeedbackEntry()){filter.value=playersWorkspaceGroupFilter;return;}
    playersWorkspaceGroupFilter=filter.value;
    playersWorkspaceDiscussionKey=null;
    renderPlayersWorkspaceList();
  };

  document.querySelectorAll('[data-open-workspace-player]').forEach(b=>b.onclick=()=>workspaceOpenPlayer(b.dataset.openWorkspacePlayer,'summary'));
  document.querySelectorAll('[data-open-training-plan]').forEach(b=>b.onclick=()=>workspaceOpenPlayer(b.dataset.openTrainingPlan,'training'));
  document.querySelectorAll('[data-open-player-feedback]').forEach(b=>b.onclick=()=>workspaceOpenPlayer(b.dataset.openPlayerFeedback,'development'));
  document.querySelectorAll('[data-quick-match-observation]').forEach(b=>b.onclick=()=>workspaceOpenPlayer(b.dataset.quickMatchObservation,'development','match'));
  document.querySelectorAll('[data-quick-training-observation]').forEach(b=>b.onclick=()=>workspaceOpenPlayer(b.dataset.quickTrainingObservation,'development','training'));
  document.querySelectorAll('[data-send-plan-reminder]').forEach(b=>b.onclick=async()=>{
    if(!confirmLeaveFeedbackEntry())return;
    const original=b.textContent;
    b.disabled=true;b.textContent='Queuing…';
    const {error}=await supabase.rpc('send_player_plan_reminder',{p_player_id:b.dataset.sendPlanReminder,p_format_key:b.dataset.reminderFormat||null});
    if(error){alert(error.message);b.disabled=false;b.textContent=original;return;}
    if(platformRole)await kickLiveEmailDelivery();
    await new Promise(r=>setTimeout(r,500));
    await refreshPlayersWorkspaceReminders();
    renderPlayersWorkspaceList();
  });

  document.querySelectorAll('[data-toggle-roster-discussion]').forEach(b=>b.onclick=()=>{
    if(!confirmLeaveFeedbackEntry())return;
    const identity=discussionSignalIdentity(b.dataset.discussionPlayer,b.dataset.toggleRosterDiscussion);
    playersWorkspaceDiscussionKey=playersWorkspaceDiscussionKey===identity?null:identity;
    renderPlayersWorkspaceList();
  });

  document.querySelectorAll('[data-roster-discussion-outcome]').forEach(b=>b.onclick=()=>{
    const signal=allSignals.find(s=>s.key===b.dataset.signalKey&&s.player.id===b.dataset.discussionPlayer);
    if(!signal||!signal.player.can_edit)return;
    openCoachingConversationForm(signal,b.dataset.rosterDiscussionOutcome,b.closest('.workspace-discussion-outcomes'),async()=>{
      playersWorkspaceDiscussionKey=null;
      await refreshPlayersWorkspaceFeedback();
      renderPlayersWorkspaceList();
    });
  });
}

function workspaceSelectedPlayer(){
  return playersWorkspaceData?.players?.find(p=>p.id===playersWorkspaceSelectedId)||null;
}

function workspaceAnswerFor(raw,section,key){
  if(section==='core')return raw.core?.[key]||{choices:[],comment:''};
  return raw.formats?.[section]?.[key]||{choices:[],comment:''};
}

function renderWorkspaceQuestion(section,spec,raw,editable){
  const a=workspaceAnswerFor(raw,section,spec.id);
  const badge=spec.required
    ?'<span class="question-requirement required">REQUIRED</span>'
    :'<span class="question-requirement optional">OPTIONAL</span>';

  if(!editable){
    const values=[...(a.choices||[])];
    return `<div class="question workspace-view-question">
      <div class="question-title-row"><h3>${esc(spec.label)}</h3>${badge}</div>
      <div class="why">${esc(spec.guidance||'')}</div>
      ${values.length
        ?`<div class="workspace-answer-chips">${values.map(v=>`<span>${esc(v)}</span>`).join('')}</div>`
        :''}
      ${a.comment?`<div class="workspace-answer-comment">${esc(a.comment)}</div>`:''}
      ${!values.length&&!a.comment?'<div class="workspace-unanswered">Not answered yet.</div>':''}
    </div>`;
  }

  if(spec.response_type==='text'){
    return `<div class="question">
      <div class="question-title-row"><h3>${esc(spec.label)}</h3>${badge}</div>
      <div class="why">${esc(spec.guidance||'Write the response that best describes this player’s game.')}</div>
      <div class="optional-comment">
        <textarea data-workspace-comment-key="${esc(spec.id)}" data-workspace-comment-section="${section}" placeholder="Player response…">${esc(a.comment||'')}</textarea>
      </div>
    </div>`;
  }

  return `<div class="question">
    <div class="question-title-row"><h3>${esc(spec.label)}</h3>${badge}</div>
    <div class="why">${esc(spec.guidance||'Choose all that genuinely apply.')}</div>
    <div class="option-grid">${(spec.options||[]).map((o,i)=>{
      const id=`staff_${section}_${spec.id}_${i}`;
      return `<label class="option-chip">
        <input type="checkbox" id="${esc(id)}" data-workspace-answer-section="${section}" data-workspace-answer-key="${esc(spec.id)}" value="${esc(o)}" ${(a.choices||[]).includes(o)?'checked':''}>
        <span>${esc(o)}</span>
      </label>`;
    }).join('')}</div>
    <div class="optional-comment player-own-answer staff-entry">
      <div class="player-own-answer-copy"><strong>Player-specific answer</strong><span>Add something that is genuinely part of this player’s plan but is missing from the listed choices.</span></div>
      <textarea data-workspace-comment-key="${esc(spec.id)}" data-workspace-comment-section="${section}" placeholder="Add their own answer…">${esc(a.comment||'')}</textarea>
    </div>
  </div>`;
}

function collectWorkspacePlayerAnswers(){
  const player=workspaceSelectedPlayer();
  if(!player)return;
  if(!playersWorkspaceLocalRaw)playersWorkspaceLocalRaw=workspacePlayerRaw(player);

  const section=playersWorkspaceSection;
  if(['summary','training','development'].includes(section))return;

  if(section==='core'&&!playersWorkspaceLocalRaw.core)playersWorkspaceLocalRaw.core={};
  if(section!=='core'){
    if(!playersWorkspaceLocalRaw.formats)playersWorkspaceLocalRaw.formats={};
    if(!playersWorkspaceLocalRaw.formats[section])playersWorkspaceLocalRaw.formats[section]={};
  }

  const keys=[...new Set([
    ...[...document.querySelectorAll('[data-workspace-answer-key]')].map(x=>x.dataset.workspaceAnswerKey),
    ...[...document.querySelectorAll('[data-workspace-comment-key]')].map(x=>x.dataset.workspaceCommentKey)
  ])];

  for(const key of keys){
    const choices=[...document.querySelectorAll(`[data-workspace-answer-key="${key}"][data-workspace-answer-section="${section}"]:checked`)].map(x=>x.value);
    const comment=document.querySelector(`[data-workspace-comment-key="${key}"][data-workspace-comment-section="${section}"]`)?.value.trim()||'';
    const answer={choices,comment};
    if(section==='core')playersWorkspaceLocalRaw.core[key]=answer;
    else playersWorkspaceLocalRaw.formats[section][key]=answer;
  }
}

function updateWorkspaceSectionBadge(){
  const raw=playersWorkspaceLocalRaw||workspacePlayerRaw(workspaceSelectedPlayer());
  const progress=sectionProgress(playersWorkspaceSection,raw);
  const badge=document.getElementById('workspaceSectionCompletion');
  if(!badge)return;
  badge.classList.toggle('done',progress.complete);
  badge.textContent=progress.complete
    ?'✓ SECTION COMPLETE'
    :progress.requiredCount
      ?`${progress.answeredRequired}/${progress.requiredCount} REQUIRED QUESTIONS`
      :'OPTIONAL SECTION';
}

async function saveWorkspacePlayerPlanSilently(){
  if(!workspacePlayerPlansPublished()){
    if(playersWorkspaceAutosaveTimer){clearTimeout(playersWorkspaceAutosaveTimer);playersWorkspaceAutosaveTimer=null;}
    return true;
  }
  const player=workspaceSelectedPlayer();
  if(!player?.can_edit)return true;
  if(['summary','training','development'].includes(playersWorkspaceSection))return true;

  if(playersWorkspaceAutosaveTimer){
    clearTimeout(playersWorkspaceAutosaveTimer);
    playersWorkspaceAutosaveTimer=null;
  }

  collectWorkspacePlayerAnswers();
  const raw=playersWorkspaceLocalRaw||workspacePlayerRaw(player);
  const curated=curate(raw);
  const sectionStatus=automaticSectionStatusForRaw(raw,player.workflow?.section_status||{});
  const st=document.getElementById('workspaceSaveStatus');
  if(st)st.textContent='Saving…';

  const {data,error}=await supabase.rpc('save_staff_player_plan',{
    p_player_id:player.id,
    p_raw_answers:raw,
    p_curated_draft:curated,
    p_section_status:sectionStatus
  });

  if(error){
    if(st)st.textContent=`Save problem: ${error.message}`;
    return false;
  }

  player.workflow=data||{
    ...(player.workflow||{}),
    raw_answers:raw,
    curated_draft:curated,
    section_status:sectionStatus,
    updated_at:new Date().toISOString()
  };
  playersWorkspaceLocalRaw=null;
  if(st)st.textContent='Saved ✓';
  return true;
}

function queueWorkspacePlayerPlanAutosave(){
  const st=document.getElementById('workspaceSaveStatus');
  if(st)st.textContent='Unsaved changes';
  if(playersWorkspaceAutosaveTimer)clearTimeout(playersWorkspaceAutosaveTimer);
  playersWorkspaceAutosaveTimer=setTimeout(()=>saveWorkspacePlayerPlanSilently(),700);
}


function renderStaffTrainingFormatAccordion(player,format,raw,feedback){
  const coreProgress=sectionProgress('core',raw);
  const formatProgress=sectionProgress(format,raw);
  const ready=coreProgress.complete&&formatProgress.complete;
  const label=formatLabel(format);
  const cards=ready?[...coreTrainingCards(raw),...formatTrainingCards(raw,format)].slice(0,7):[];
  const feedbackFocus=ready?trainingFocusForFormat(feedback,format,false):[];
  const nextSection=coreProgress.complete?format:'core';
  const nextLabel=coreProgress.complete?label:'Core';

  return `<details class="card train-format-accordion ${ready?'ready':'locked'}">
    <summary>
      <div><div class="section-label">${esc(label)}</div><strong>${ready?`${esc(player.display_name||'Player')} · ${esc(label)} Training Plan`:`${esc(label)} Training Plan`}</strong><span>${ready?'Targeted from the player’s completed Player Plan.':`The ${esc(nextLabel)} Player Plan questions still need answers.`}</span></div>
      <div class="train-accordion-state"><b>${ready?'TRAINING PLAN READY':'PLAYER PLAN NOT COMPLETE'}</b><em>Open ↓</em></div>
    </summary>
    <div class="train-simple-body">
      ${ready?`
        <div class="train-plan-lines">
          ${cards.length?cards.map(c=>`<article><small>${esc(c.label)}</small>${c.title?`<h3>${esc(c.title)}</h3>`:''}<strong>${esc(c.value)}</strong><p>${esc(c.cue)}</p></article>`).join(''):'<div class="notice">The Player Plan is complete, but there are no specific training cues to show yet.</div>'}
        </div>
        ${feedbackFocus.length?`<div class="train-feedback-focus"><div class="section-label">FROM RECENT FEEDBACK</div>${feedbackFocus.map(x=>`<p><strong>${esc(x.text)}</strong><span>${esc(x.source)}</span></p>`).join('')}</div>`:''}
      `:`<div class="train-format-empty"><strong>The ${esc(label)} training plan needs a completed Player Plan.</strong><span>${coreProgress.complete?`Finish the ${esc(label)} questions to generate training guidance.`:`Complete Core${formatProgress.complete?'':` and ${esc(label)}`} to generate training guidance.`}</span><div class="btnrow"><button class="btn secondary" data-workspace-section="${esc(nextSection)}">${player.can_edit?'Open':'View'} ${esc(nextLabel)} Player Plan</button></div></div>`}
    </div>
  </details>`;
}

function renderStaffPlayerTrainingPlan(player,raw,feedback){
  const enabled=publishedEnabledFormats();
  const coreProgress=sectionProgress('core',raw);
  const statuses=enabled.map(([format,label])=>({format,label,progress:sectionProgress(format,raw)}));
  return `<section class="card workspace-training-head">
    <div>
      <div class="section-label">Training Plan</div>
      <h2>${esc(player.display_name||'Player')}</h2>
      <p>This is generated from the player’s completed Player Plan. Incomplete formats stay locked rather than producing generic advice.</p>
    </div>
    <div class="workspace-training-statuses">
      <span class="${coreProgress.complete?'ready':'missing'}"><b>${coreProgress.complete?'✓':'!'}</b> Core</span>
      ${statuses.map(x=>`<span class="${coreProgress.complete&&x.progress.complete?'ready':'missing'}"><b>${coreProgress.complete&&x.progress.complete?'✓':'!'}</b> ${esc(x.label)}</span>`).join('')}
    </div>
  </section>
  ${renderClubTrainingPrinciples()}
  <div class="train-format-accordion-list">${enabled.map(([format])=>renderStaffTrainingFormatAccordion(player,format,raw,feedback)).join('')}</div>`;
}

function renderWorkspacePlayerDiscussionPanel(player){
  const signals=workspaceSignalsForPlayer(player.id);
  if(!signals.length)return '';
  return `<section class="card workspace-player-discussion-panel">
    <div class="section-label">Needs a Coaching Conversation</div>
    ${signals.map(s=>`<div class="workspace-player-discussion-item ${s.tone}">
      <div><strong>${esc(s.title)}</strong><span>${esc(s.summary)}</span><small>${esc(s.suggestion)}</small></div>
    </div>`).join('')}
  </section>`;
}

async function returnToPlayersWorkspaceList(){
  if(await saveWorkspacePlayerPlanSilently()===false)return;
  if(!confirmLeaveFeedbackEntry())return;
  playersWorkspaceSelectedId=null;
  playersWorkspaceSection='summary';
  playersWorkspaceDevelopmentMode=null;
  playersWorkspaceDevelopmentMatchId=null;
  playersWorkspaceLocalRaw=null;
  renderPlayersWorkspaceList();
}

async function renderPlayersWorkspacePlayer(){
  const page=document.getElementById('page');
  const player=workspaceSelectedPlayer();
  if(!player){
    playersWorkspaceSelectedId=null;
    renderPlayersWorkspaceList();
    return;
  }

  const plansPublished=workspacePlayerPlansPublished();
  const sections=plansPublished
    ?[['summary','Player Plan'],['training','Training Plan'],['development','Feedback'],['core','Core'],...publishedEnabledFormats()]
    :[['summary','Player details'],['development','Feedback']];
  if(!sections.some(([k])=>k===playersWorkspaceSection))playersWorkspaceSection='summary';

  const raw=playersWorkspaceLocalRaw||workspacePlayerRaw(player);
  const {required,complete,total}=plansPublished
    ?workspacePlayerProgress({...player,workflow:{...(player.workflow||{}),raw_answers:raw}})
    :{required:[],complete:0,total:0};
  const requiredSet=new Set(required);
  const groups=(player.groups||[]).map(g=>`<span class="workspace-group-pill">${esc(g.name)}</span>`).join('');
  const canEdit=!!player.can_edit;

  let developmentData=workspaceFeedbackPlayer(player.id)||{matches:[],training_observations:[],external_training_evidence:[],discussions:[]};
  let developmentError='';
  if(playersWorkspaceSection==='development'||playersWorkspaceSection==='training'){
    try{
      // Load the selected player directly so newer feedback sources — including
      // External Training Evidence — do not depend on the bulk workspace cache.
      developmentData=await loadDevelopmentFeedback(player.id);
    }catch(e){
      developmentError=e?.message||String(e);
      developmentData={...developmentData,...(e?.sharedActions||{coaching_actions:[],coaching_actions_error:'Shared actions could not load'})};
    }
  }

  const sectionTabs=sections.map(([key,label])=>{
    if(key==='summary'||key==='training'||key==='development'){
      return `<button data-workspace-section="${key}" class="${playersWorkspaceSection===key?'active':''}">${esc(label)}</button>`;
    }
    const state=workspaceSectionState(key,raw);
    return `<button data-workspace-section="${key}" class="${playersWorkspaceSection===key?'active':''} ${state.key}">
      ${esc(label)}${state.key==='complete'?' ✓':''}
    </button>`;
  }).join('');

  let body='';

  if(!plansPublished&&playersWorkspaceSection==='summary'){
    const savedPlan=player.workflow?.curated_draft;
    body=`${renderWorkspacePlayerDiscussionPanel(player)}<section class="card">
      <div class="section-label">Player Plan</div>
      <h2>Your club is preparing the Player Plan questions.</h2>
      <p>The Philosophy Lead will publish How We Bat and the questions together. Registered players will receive an email when they can start.</p>
      <p>${isAdmin()?'You can manage Playing Groups and use feedback now.':'You can use feedback for the players you have access to now.'} Training guidance will follow once the player has completed their plan.</p>
      <div class="btnrow"><button class="btn secondary" data-workspace-section="development">Open feedback</button></div>
    </section>${savedPlan&&Object.keys(savedPlan).length?`<section class="card workspace-plan-preview"><p class="help">Previously saved Player Plan · view only while the club prepares its questions.</p>${renderCuratedDraft(savedPlan,player.display_name,'Player Plan')}</section>`:''}`;
  }else if(playersWorkspaceSection==='summary'){
    const curated=player.workflow?.curated_draft&&Object.keys(player.workflow.curated_draft||{}).length&&!playersWorkspaceLocalRaw
      ?player.workflow.curated_draft
      :curate(raw);

    const progressCards=[['core','Core'],...publishedEnabledFormats()].map(([key,label])=>{
      const state=workspaceSectionState(key,raw);
      return `<div class="workspace-progress-card ${state.key} ${requiredSet.has(key)?'required':''}">
        <strong>${esc(label)}</strong>
        <span>${state.label}</span>
        <small>${esc(workspaceRequirementText(player,key))}</small>
      </div>`;
    }).join('');

    body=`<div class="workspace-summary-grid">
      <section class="card">
        <div class="section-label">Plan progress</div>
        <h2>${complete===total?'Required work complete ✓':`${complete}/${total} required sections complete`}</h2>
        <div class="workspace-progress-grid">${progressCards}</div>
        <div class="help workspace-updated">${esc(workspaceUpdatedLabel(player))}</div>
      </section>
      <section class="card workspace-plan-preview">
        ${renderCuratedDraft(curated,player.display_name,'Player Plan')}
      </section>
    </div>`;
  }else if(playersWorkspaceSection==='training'){
    body=developmentError
      ?`<section class="card"><div class="section-label">Training Plan</div><h2>This training plan could not load.</h2><div class="notice">${esc(developmentError)}</div></section>`
      :renderStaffPlayerTrainingPlan(player,raw,developmentData);
  }else if(playersWorkspaceSection==='development'){
    body=developmentError
      ?`<section class="card"><div class="section-label">Feedback</div><h2>Feedback is temporarily unavailable.</h2><p>Try loading this section again. If it still will not load, ask your Club Admin for help.</p><div class="btnrow"><button class="btn secondary" id="retryPlayerFeedback">Try again</button></div><details><summary>Error details</summary><div class="notice">${esc(developmentError)}</div></details></section>`
      :`${renderWorkspacePlayerDiscussionPanel(player)}${renderStaffDevelopmentBody(player,canEdit,developmentData)}`;
  }else{
    const section=playersWorkspaceSection;
    const label=section==='core'?'Core':(FORMATS.find(([k])=>k===section)?.[1]||section);
    const progress=sectionProgress(section,raw);
    const questions=playerPlanQuestionsFor(section);

    const liveHowWeBat=howWeBatVersions?.[0]?.snapshot||null;
    const refFormat=section==='core'?null:liveHowWeBat?.formats?.[section];
    const howWeBatHtml=refFormat?.banners?.length
      ?`<section class="card player-plan-key-messages workspace-key-messages">
        <div class="section-label">${esc(label)} · How We Bat</div>
        <h2>Club key messages</h2>
        <div class="help">Use these as reference while discussing the player’s own plan.</div>
        <div class="hwb-public-banner-grid plan-key-message-grid">
          ${refFormat.banners.map((b,i)=>renderKeyMessageReferenceCard(b,i,'plan',section)).join('')}
        </div>
      </section>`
      :'';

    body=`${howWeBatHtml}
      <div class="workspace-player-plan-grid">
        <section class="card">
          <div class="builder-head compact">
            <div>
              <div class="section-label">${esc(label)} Player Plan</div>
              <h2>${esc(player.display_name||'Player')}</h2>
              <div class="help">${canEdit
                ?'Work through the player’s plan together. Changes save automatically and the player can keep editing later.'
                :'You have view-only access to this Player Plan.'}</div>
              <div class="workspace-requirement-line">${esc(workspaceRequirementText(player,section))}</div>
            </div>
            <span id="workspaceSectionCompletion" class="section-completion ${progress.complete?'done':''}">
              ${progress.complete
                ?'✓ SECTION COMPLETE'
                :progress.requiredCount
                  ?`${progress.answeredRequired}/${progress.requiredCount} REQUIRED QUESTIONS`
                  :'OPTIONAL SECTION'}
            </span>
          </div>

          <div class="workspace-question-list">
            ${questions.length
              ?questions.map(q=>renderWorkspaceQuestion(section,q,raw,canEdit)).join('')
              :'<div class="notice">The club has not included any Player Plan questions in this section.</div>'}
          </div>

          <div class="player-plan-simple-status workspace-save-row">
            <div>
              <strong>${canEdit?'Co-create with the player':'View only'}</strong>
              <span>${canEdit?'No approval step is created — you are simply editing the same Player Plan the player owns.':'Your access lets you use the plan for coaching, training and match conversations without changing it.'}</span>
            </div>
            <span class="status" id="workspaceSaveStatus">${canEdit?'Saved ✓':'VIEW ONLY'}</span>
          </div>
        </section>

        <section class="card">
          <div class="section-label">Current Player Plan</div>
          <h2>What this section is becoming</h2>
          <div class="help">This is the same plan the player sees in their own account.</div>
          <div id="workspaceDraftPreview">${renderCuratedDraft(curate(raw),player.display_name,'Player Plan')}</div>
        </section>
      </div>`;
  }

  page.innerHTML=`<section class="card workspace-player-header">
    <div class="workspace-player-header-main">
      <button class="btn ghost" id="workspaceBackToPlayers">← Players</button>
      <div>
        <div class="section-label">${esc(permissionRoleLabel(playersWorkspaceData?.role||membership.permission_role))} workspace</div>
        <h2>${esc(player.display_name||'Player')}</h2>
        <div class="workspace-player-groups">${groups||'<span class="workspace-group-pill muted">Unassigned</span>'}</div>
      </div>
    </div>
    <div class="workspace-player-access">
      <span class="workspace-access-badge ${canEdit?'edit':'view'}">${canEdit?'VIEW + EDIT':'VIEW ONLY'}</span>
      <small>${esc(workspaceUpdatedLabel(player))}</small>
    </div>
  </section>

  <div class="workspace-player-tabs">${sectionTabs}</div>

  ${['training','development'].includes(playersWorkspaceSection)?renderCoachingActions(developmentData,{playerMode:false}):''}
  ${body}`;

  bindCoachingActionControls(developmentData,()=>renderPlayersWorkspacePlayer());
  document.getElementById('workspaceBackToPlayers').onclick=returnToPlayersWorkspaceList;
  document.getElementById('retryPlayerFeedback')?.addEventListener('click',()=>renderPlayersWorkspacePlayer());

  document.querySelectorAll('[data-workspace-section]').forEach(b=>b.onclick=async()=>{
    if(b.dataset.workspaceSection===playersWorkspaceSection)return;
    if(await saveWorkspacePlayerPlanSilently()===false)return;
    if(!confirmLeaveFeedbackEntry())return;
    playersWorkspaceSection=b.dataset.workspaceSection;
    playersWorkspaceDevelopmentMode=null;
    playersWorkspaceDevelopmentMatchId=null;
    playersWorkspaceLocalRaw=null;
    await renderPlayersWorkspacePlayer();
  });

  if(playersWorkspaceSection==='development'&&!developmentError){
    wireStaffDevelopmentControls(player,canEdit,developmentData);
  }

  if(canEdit && !['summary','training','development'].includes(playersWorkspaceSection)){
    document.querySelectorAll('[data-workspace-answer-key]').forEach(x=>x.onchange=()=>{
      collectWorkspacePlayerAnswers();
      updateWorkspaceSectionBadge();
      const preview=document.getElementById('workspaceDraftPreview');
      if(preview)preview.innerHTML=renderCuratedDraft(curate(playersWorkspaceLocalRaw||workspacePlayerRaw(player)),player.display_name,'Player Plan');
      queueWorkspacePlayerPlanAutosave();
    });

    document.querySelectorAll('[data-workspace-comment-key]').forEach(x=>x.oninput=()=>{
      collectWorkspacePlayerAnswers();
      updateWorkspaceSectionBadge();
      const preview=document.getElementById('workspaceDraftPreview');
      if(preview)preview.innerHTML=renderCuratedDraft(curate(playersWorkspaceLocalRaw||workspacePlayerRaw(player)),player.display_name,'Player Plan');
      queueWorkspacePlayerPlanAutosave();
    });
  }
}
/* ---------------- PLAYER HOME ---------------- */

let playerHomeRenderSequence=0;

function playerHomePlanState(raw,rollout){
  const requirements=new Map((rollout?.requirements||[]).filter(r=>r.required).map(r=>[r.format_key,r]));
  const core=sectionProgress('core',raw);
  const formats=publishedEnabledFormats().map(([format,label])=>({
    format,label,progress:sectionProgress(format,raw),required:requirements.has(format),
    due_date:requirements.get(format)?.due_date||null
  }));
  return {
    core,formats,
    pendingRequired:formats.filter(x=>x.required&&!x.progress.complete).sort((a,b)=>String(a.due_date||'9999-12-31').localeCompare(String(b.due_date||'9999-12-31'))),
    ready:formats.filter(x=>core.complete&&x.progress.complete),
    started:formats.filter(x=>!x.progress.complete&&x.progress.answeredAny>0),
    available:formats.filter(x=>!x.required&&!x.progress.complete&&x.progress.answeredAny===0)
  };
}

function playerHomeNextAction(raw,rollout,feedback,today=todayIso()){
  const plan=playerHomePlanState(raw,rollout);
  if(!plan.core.complete)return {kind:'plan',heading:'Complete your Player Plan',copy:'Start with Core: the shots you trust, the decisions you want to make and the reset you can use under pressure.',label:'Continue Core',tab:'myplan',section:'core'};
  if(plan.pendingRequired.length){
    const next=plan.pendingRequired[0];
    return {kind:'plan',heading:'Complete your Player Plan',copy:`Your club needs your ${next.label} plan${next.due_date?` by ${niceDate(next.due_date)}`:''}. Finish this section to create training suggestions for that format.`,label:`Continue ${next.label}`,tab:'myplan',section:next.format};
  }
  const actions=(feedback?.coaching_actions||[]).filter(x=>x.status==='open').sort((a,b)=>String(a.review_on||'9999-12-31').localeCompare(String(b.review_on||'9999-12-31')));
  const dueAction=actions.find(x=>x.review_on&&String(x.review_on).slice(0,10)<=today);
  if(dueAction)return {kind:'review',heading:'Review your training focus',copy:'Your agreed review date has arrived. Record what changed, then decide the next step with your coach or captain.',label:'Review the agreed action',tab:'howwetrain',anchor:'sharedCoachingActions',focus:dueAction.task,meta:`Review due ${niceDate(dueAction.review_on)}`};
  const reflection=playerReflectionNeededMatches(feedback).slice().sort((a,b)=>String(b.match_date||'').localeCompare(String(a.match_date||'')))[0];
  if(reflection)return {kind:'reflection',heading:'Reflect on your latest innings',copy:'Record your own view first. You can then compare it with the coaching feedback and choose what to practise next.',label:'Add your innings reflection',tab:'howwetrain',anchor:'myReflectionForm',matchId:reflection.id,meta:[formatLabel(reflection.format_key),reflection.opposition,formatDateShort(reflection.match_date)].filter(Boolean).join(' · ')};
  if(actions.length){
    const next=actions[0];
    return {kind:'training',heading:'Your next training focus',copy:'Take this agreed action into your next session. The full action and review conversation are in How We Train.',label:'Open How We Train',tab:'howwetrain',anchor:'sharedCoachingActions',focus:next.task,meta:next.review_on?`Review on ${niceDate(next.review_on)}`:''};
  }
  if(plan.ready.length){
    const cues=plan.ready.flatMap(x=>trainingFocusForFormat(feedback,x.format)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    return {kind:'training',heading:'Your next training focus',copy:cues.length?'Use your latest feedback to shape the next session. Open your training plan for the practice ideas that support it.':'Practise your chosen shots against mixed deliveries so you recognise when to commit. Reflect on the decision and execution after your next innings.',label:'Open How We Train',tab:'howwetrain',focus:cues[0]?.text||'',meta:cues[0]?.source||`${plan.ready.map(x=>x.label).join(' · ')} training ready`};
  }
  const started=plan.started[0];
  return {kind:'choose-format',heading:'Build the format you play',copy:'Your Core plan is ready. Choose the format you play next to create useful training suggestions. You do not need to complete every format.',label:started?`Continue ${started.label}`:'Choose a format',tab:'myplan',section:started?.format||'core'};
}

async function openPlayerHomeAction(action){
  if(!action||!canOpenClubTab(action.tab)||!await saveClubEditsBeforeNavigation())return;
  const clubId=club?.id;
  if(action.section)builderSection=action.section;
  if(action.tab==='howwetrain')howWeTrainReflectionEditId=action.matchId||null;
  currentTab=action.tab;
  localStorage.setItem(`bdp-tab-${club.id}`,currentTab);
  await renderTab();
  if(action.anchor&&club?.id===clubId&&currentTab===action.tab)requestAnimationFrame(()=>document.getElementById(action.anchor)?.scrollIntoView({behavior:'smooth',block:'start'}));
}

async function renderPlayerHome(){
  const page=document.getElementById('page');
  const sequence=++playerHomeRenderSequence;
  const clubId=club?.id;
  const playerId=myPlayer?.id;
  const stillCurrent=()=>sequence===playerHomeRenderSequence&&club?.id===clubId&&myPlayer?.id===playerId&&currentTab==='playerhome'&&document.getElementById('page')===page;
  if(!workspacePlayerPlansPublished()){
    renderClubPublicationGate('Player Home');
    return;
  }
  if(!myPlayer){
    page.innerHTML='<section class="card"><div class="section-label">Player Home</div><h2>Your account needs a player profile.</h2><p>Ask the person coordinating Club Batting at your club to register you as a player. Your Player Plan and training will then appear here.</p></section>';
    return;
  }
  page.innerHTML='<div class="splash">Finding your next step…</div>';
  const [rolloutResult,feedbackResult]=await Promise.allSettled([
    supabase.rpc('get_my_player_plan_rollout',{p_club_id:clubId}),
    loadDevelopmentFeedback(playerId)
  ]);
  if(!stillCurrent())return;
  const rolloutOk=rolloutResult.status==='fulfilled'&&!rolloutResult.value.error;
  const rollout=rolloutOk?rolloutResult.value.data||{}:{};
  const feedbackOk=feedbackResult.status==='fulfilled';
  const feedback=feedbackOk?feedbackResult.value:{matches:[],training_observations:[],external_training_evidence:[],coaching_actions:[],...(feedbackResult.reason?.sharedActions||{})};
  myDevelopmentFeedback=feedbackOk?feedback:null;
  const raw=localRaw||rawAnswers();
  const plan=playerHomePlanState(raw,rollout);
  const next=playerHomeNextAction(raw,rollout,feedback);
  const loadNote=!rolloutOk||!feedbackOk||feedback.coaching_actions_error;
  page.innerHTML=`${clubSetupStyles()}<section class="card club-home-next player-home-next">
    <div class="section-label">Player Home · Your next step</div>
    <h2>${esc(next.heading)}</h2>
    <p>${esc(next.copy)}</p>
    ${next.focus?`<div class="notice compact"><strong>${esc(next.focus)}</strong></div>`:''}
    ${next.meta?`<p class="help">${esc(next.meta)}</p>`:''}
    <div class="btnrow" style="margin-top:18px"><button class="btn" id="playerHomeNext">${esc(next.label)}</button></div>
  </section>
  ${loadNote?`<div class="notice compact" role="status" style="margin-top:14px">${!rolloutOk?'Your club’s required formats and due dates could not be checked. ':''}${!feedbackOk?'Your latest feedback could not be loaded. ':feedback.coaching_actions_error?'Shared training actions could not be loaded. ':''}You can keep using your saved plan.<button class="club-home-link" id="retryPlayerHome" type="button" style="margin-left:12px">Try again</button></div>`:''}
  <div class="club-home-secondary" aria-label="Your batting tools">
    <button class="club-home-link" id="playerHomePlan">My Player Plan</button>
    ${plan.ready.length?'<button class="club-home-link" id="playerHomeTraining">How We Train</button>':''}
    <button class="club-home-link" id="playerHomeReflection">Reflect on an innings</button>
    <button class="club-home-link" id="playerHomePhilosophy">Read How We Bat</button>
  </div>
  ${plan.ready.length?`<p class="help" style="margin-top:18px">Training ready for ${esc(plan.ready.map(x=>x.label).join(' and '))}.${rolloutOk&&!plan.pendingRequired.length?' Your required plan questions are complete.':''}</p>`:''}`;
  document.getElementById('playerHomeNext').onclick=()=>openPlayerHomeAction(next);
  document.getElementById('playerHomePlan').onclick=()=>openPlayerHomeAction({tab:'myplan'});
  document.getElementById('playerHomeTraining')?.addEventListener('click',()=>openPlayerHomeAction({tab:'howwetrain'}));
  document.getElementById('playerHomeReflection').onclick=()=>openPlayerHomeAction({tab:'howwetrain',matchId:'new',anchor:'myReflectionForm'});
  document.getElementById('playerHomePhilosophy').onclick=()=>openPlayerHomeAction({tab:'howwebat'});
  document.getElementById('retryPlayerHome')?.addEventListener('click',renderPlayerHome);
}

/* ---------------- GUIDED PLAYER PLAN ---------------- */

function rawAnswers(){
  return workflow?.raw_answers && typeof workflow.raw_answers==='object'
    ? structuredClone(workflow.raw_answers)
    : {core:{},formats:{}};
}

function answerFor(section,key){
  const raw=localRaw||rawAnswers();
  if(section==='core')return raw.core?.[key]||{choices:[],comment:''};
  return raw.formats?.[section]?.[key]||{choices:[],comment:''};
}


let playerPlanAutosaveTimer=null;
let playerPlanSaveQueue=Promise.resolve();
let playerPlanSaveRevision=0;

async function saveClubPlanBeforeNavigation(){
  if(currentTab==='myplan' && myPlayer && (localRaw||playerPlanAutosaveTimer)){
    return await savePlayerPlanProgressSilently()!==false;
  }
  if(currentTab==='players' && playersWorkspaceSelectedId && (playersWorkspaceLocalRaw||playersWorkspaceAutosaveTimer)){
    return await saveWorkspacePlayerPlanSilently()!==false;
  }
  return true;
}

function requiredPlayerPlanSections(rollout){
  const keys=['core',...(rollout?.requirements||[])
    .filter(r=>r.required)
    .map(r=>r.format_key)];
  return [...new Set(keys)];
}

function answerHasContent(answer){
  return !!(
    (answer?.choices||[]).length ||
    String(answer?.comment||'').trim()
  );
}

function sectionProgress(section,raw){
  const questions=playerPlanQuestionsFor(section);
  const required=questions.filter(q=>q.required);
  const answeredRequired=required.filter(q=>{
    const a=section==='core'
      ?raw.core?.[q.id]
      :raw.formats?.[section]?.[q.id];
    return answerHasContent(a);
  }).length;

  const answeredAny=questions.filter(q=>{
    const a=section==='core'
      ?raw.core?.[q.id]
      :raw.formats?.[section]?.[q.id];
    return answerHasContent(a);
  }).length;

  const complete=required.length
    ?answeredRequired===required.length
    :answeredAny>0;

  return {
    complete,
    requiredCount:required.length,
    answeredRequired,
    answeredAny,
    totalQuestions:questions.length
  };
}

function automaticSectionStatusForRaw(raw,previous={}){
  const next={};
  const sections=['core',...publishedEnabledFormats().map(([k])=>k)];

  for(const section of sections){
    const progress=sectionProgress(section,raw);
    if(progress.complete){
      next[section]=previous?.[section]||new Date().toISOString();
    }
  }
  return next;
}

function automaticSectionStatus(raw){
  return automaticSectionStatusForRaw(raw,workflow?.section_status||{});
}

async function savePlayerPlanProgressSilently(){
  if(!myPlayer)return;

  if(playerPlanAutosaveTimer){
    clearTimeout(playerPlanAutosaveTimer);
    playerPlanAutosaveTimer=null;
  }

  collectBuilderAnswers();
  // Capture this save before waiting for earlier requests. Later edits must
  // neither change its payload nor be cleared by its response.
  const raw=structuredClone(localRaw||rawAnswers());
  const playerId=myPlayer.id;
  const clubId=club?.id;
  const revision=++playerPlanSaveRevision;
  const curated=curate(raw);
  const sectionStatus=automaticSectionStatus(raw);

  const payload={
    player_id:playerId,
    raw_answers:raw,
    curated_draft:curated,
    section_status:sectionStatus,
    status:'in_progress',
    submitted_at:null,
    updated_at:new Date().toISOString()
  };

  const isCurrentPlayer=()=>myPlayer?.id===playerId&&club?.id===clubId;
  const status=()=>isCurrentPlayer()?document.getElementById('builderStatus'):null;
  if(status())status().textContent='Saving automatically…';
  const retryButton=()=>isCurrentPlayer()?document.getElementById('retryPlayerPlanSave'):null;
  if(retryButton())retryButton().hidden=true;

  // Serialize writes, not just responses: the database must finish with the
  // latest answers even if the connection is slow while the player keeps typing.
  const save=playerPlanSaveQueue.then(async()=>{
    try{
      const {data,error}=await supabase
        .from('player_plan_workflows')
        .upsert(payload,{onConflict:'player_id'})
        .select()
        .single();
      if(error)throw error;

      if(isCurrentPlayer()){
        workflow=data;
        const latest=revision===playerPlanSaveRevision;
        const sameAnswers=!localRaw||JSON.stringify(localRaw)===JSON.stringify(raw);
        if(latest&&sameAnswers){
          localRaw=null;
          if(status())status().textContent='Saved automatically ✓';
          document.dispatchEvent(new CustomEvent('bdp-player-plan-saved'));
        }
      }
      return true;
    }catch(error){
      if(isCurrentPlayer()&&revision===playerPlanSaveRevision){
        if(!localRaw)localRaw=structuredClone(raw);
        if(status())status().textContent=`Save problem: ${error?.message||'Please try again.'}`;
        if(retryButton())retryButton().hidden=false;
      }
      return false;
    }
  });
  playerPlanSaveQueue=save.then(()=>undefined,()=>undefined);
  return await save;
}

function queuePlayerPlanAutosave(){
  const st=document.getElementById('builderStatus');
  if(st)st.textContent='Saving automatically…';

  if(playerPlanAutosaveTimer)clearTimeout(playerPlanAutosaveTimer);
  playerPlanAutosaveTimer=setTimeout(()=>{
    savePlayerPlanProgressSilently();
  },700);
}

function playerPlanNextStep(raw,rollout){
  const required=requiredPlayerPlanSections(rollout);
  const next=required.find(key=>!sectionProgress(key,raw).complete);
  if(next)return {section:next,kind:'plan',label:next==='core'?'Continue Core':`Continue ${formatLabel(next)}`};
  const format=publishedEnabledFormats().find(([key])=>sectionProgress('core',raw).complete&&sectionProgress(key,raw).complete)?.[0];
  if(format)return {section:format,kind:'training',label:'Take my plan to training'};
  const first=publishedEnabledFormats()[0];
  return first?{section:first[0],kind:'plan',label:`Build ${first[1]}`}:{section:'core',kind:'plan',label:'Review my plan'};
}
function playerPlanJourneyStyles(){
  return `<style id="playerPlanJourneyStyles">
    .plan-journey-head{display:flex;gap:20px;justify-content:space-between;align-items:flex-start}
    .plan-journey-head>div{min-width:0}.plan-journey-head h2{margin:5px 0 10px}
    .plan-journey-head p{max-width:680px;margin:0 0 18px;line-height:1.6}
    .plan-journey-links{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .plan-journey-links .workspace-text-link{font-size:14px;min-height:44px}
    .plan-progress-disclosure{margin-top:20px;border-top:1px solid #e1e6ee;padding-top:15px}
    .plan-progress-disclosure>summary,.plan-reference-disclosure>summary,.plan-preview-disclosure>summary{cursor:pointer;list-style:none;font-weight:700;display:flex;align-items:center;gap:12px;justify-content:space-between;min-height:44px}
    .plan-progress-disclosure>summary::-webkit-details-marker,.plan-reference-disclosure>summary::-webkit-details-marker,.plan-preview-disclosure>summary::-webkit-details-marker{display:none}
    .plan-progress-disclosure>summary:after,.plan-reference-disclosure>summary:after,.plan-preview-disclosure>summary:after{content:'+';font-size:22px;font-weight:400}
    .plan-progress-disclosure[open]>summary:after,.plan-reference-disclosure[open]>summary:after,.plan-preview-disclosure[open]>summary:after{content:'−'}
    .plan-progress-disclosure .plan-format-cards,.plan-reference-disclosure .hwb-public-banner-grid{margin-top:16px}
    .player-plan-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
    .player-plan-grid>*,.player-plan-grid .builder-head>div{min-width:0}
    .player-plan-grid .question-card{overflow-wrap:anywhere}
    .player-plan-grid [hidden]{display:none!important}
    .plan-journey-links button:focus-visible,.plan-progress-disclosure summary:focus-visible,.plan-reference-disclosure summary:focus-visible,.plan-preview-disclosure summary:focus-visible{outline:3px solid #5572b4;outline-offset:3px}
    @media(max-width:720px){.plan-journey-head{display:block}.plan-journey-head>.workflow-status{display:inline-block;margin-top:12px}.plan-journey-links .btn{width:100%;min-height:44px}.plan-rollout-player .plan-format-cards{grid-template-columns:1fr!important}.plan-progress-disclosure>summary{flex-wrap:wrap}.player-plan-grid .builder-head{flex-wrap:wrap}}
  </style>`;
}

let playerPlanRenderSequence=0;
async function renderMyPlan(){
  const renderSequence=++playerPlanRenderSequence,clubId=club?.id,playerId=myPlayer?.id,tabAtStart=currentTab;
  const isCurrent=()=>renderSequence===playerPlanRenderSequence&&club?.id===clubId&&myPlayer?.id===playerId&&currentTab===tabAtStart;
  if(!workspacePlayerPlansPublished()){
    renderClubPublicationGate('My Player Plan','Your Player Plan will open when your club publishes How We Bat and the Player Plan questions.');
    return;
  }

  if(!myPlayer){
    document.getElementById('page').innerHTML=`<div class="card">
      <h2>Your account needs a player profile.</h2>
      <div class="help">Your account is currently set up as ${esc(labelInvolvement(membership.involvement))}. Ask your club to register you as a player if you also need your own Player Plan.</div>
    </div>`;
    return;
  }

  const formats=publishedEnabledFormats();
  if(builderSection!=='core'&&!formats.some(([k])=>k===builderSection))builderSection='core';

  let rolloutData=null,rolloutErr=null;
  try{const result=await supabase.rpc('get_my_player_plan_rollout',{p_club_id:clubId});rolloutData=result.data;rolloutErr=result.error;}
  catch(error){rolloutErr=error;}
  if(!isCurrent())return;
  const rollout=rolloutErr?{groups:[],requirements:[]}:(rolloutData||{groups:[],requirements:[]});
  const requirementsAvailable=!rolloutErr;
  const requirementMap=new Map((rollout.requirements||[]).map(r=>[r.format_key,r]));
  const rawForProgress=localRaw||rawAnswers();
  const calculatedSectionStatus=automaticSectionStatus(rawForProgress);
  const sectionStatus={
    ...(workflow?.section_status&&typeof workflow.section_status==='object'
      ?workflow.section_status
      :{}),
    ...calculatedSectionStatus
  };

  const currentProgress=sectionProgress(builderSection,rawForProgress);
  const currentComplete=currentProgress.complete;
  const currentLabel=builderSection==='core'
    ?'Core'
    :(FORMATS.find(([k])=>k===builderSection)?.[1]||builderSection);

  const requiredSections=requiredPlayerPlanSections(rollout);
  const completedRequiredSections=requiredSections.filter(key=>sectionProgress(key,rawForProgress).complete).length;

  const liveHowWeBat=howWeBatVersions?.[0]?.snapshot||null;
  const formatReferenceHtml=builderSection==='core'
    ?''
    :(()=>{
        const refFormat=liveHowWeBat?.formats?.[builderSection];
        if(!refFormat?.banners?.length)return '';
        const refLabel=FORMATS.find(([k])=>k===builderSection)?.[1]||builderSection;
        return `<details class="card player-plan-key-messages plan-reference-disclosure">
          <summary>${esc(refLabel)} · Club key messages</summary>
          <div class="section-label">${esc(refLabel)} · How We Bat</div>
          <h2>Your club’s key messages for this format</h2>
          <div class="help">These are reference points, not extra questions. Open any Key Message whenever you want to reconnect your Player Plan to the club philosophy.</div>
          <div class="hwb-public-banner-grid plan-key-message-grid">
            ${refFormat.banners.map((b,i)=>renderKeyMessageReferenceCard(b,i,'plan',builderSection)).join('')}
          </div>
        </details>`;
      })();

  const coreProgress=sectionProgress('core',rawForProgress);
  const formatCard=(key,label,raw=rawForProgress)=>{
    const req=requirementMap.get(key)||{required:false,due_date:null,sources:[]};
    const progress=sectionProgress(key,raw);
    const due=!requirementsAvailable?'Due date unavailable':req.required
      ?(req.due_date?`Required by ${niceDate(req.due_date)}`:'Required now')
      :'Available anytime';
    const source=(req.sources||[]).length?req.sources.join(' + '):'';
    const progressText=progress.requiredCount
      ?`${progress.answeredRequired} of ${progress.requiredCount} required questions answered`
      :progress.answeredAny
        ?`${progress.answeredAny} question${progress.answeredAny===1?'':'s'} answered`
        :'Not started';
    const trainingReady=sectionProgress('core',raw).complete&&progress.complete;
    let detail='';
    if(progress.complete){
      detail=trainingReady
        ?`How We Train ready${req.required&&req.due_date?` · due ${niceDate(req.due_date)}`:''}`
        :'Complete Core to create How We Train';
    }else if(req.required){
      detail=`${progressText}${source?` · ${source}`:''} · How We Train unlocks when complete`;
    }else if(!requirementsAvailable){
      detail=`${progressText} · Your club’s due dates could not be checked`;
    }else{
      detail=`${progressText} · Complete when useful to create How We Train`;
    }

    return `<div style="position:relative;min-width:0">
      <button class="plan-format-card ${builderSection===key?'active':''} ${progress.complete?'complete':''} ${req.required?'required':''}" data-builder-section="${key}" style="width:100%;height:100%">
        <span class="plan-format-name">${esc(label)}</span>
        <strong>${progress.complete?'✓ Player Plan complete':esc(due)}</strong>
        <small>${esc(detail)}</small>
      </button>
      ${isAdmin()?`<button type="button" class="workspace-text-link" data-plan-date-format="${key}" style="position:absolute;top:11px;right:12px;z-index:2;font-size:10px">Set due date</button>`:''}
    </div>`;
  };

  const currentRequirement=builderSection==='core'
    ?null
    :(requirementMap.get(builderSection)||{required:false,due_date:null,sources:[]});
  const currentTrainingReady=builderSection!=='core'&&coreProgress.complete&&currentComplete;
  const currentDueText=currentRequirement?.required
    ?(currentRequirement.due_date?` Your club has set ${niceDate(currentRequirement.due_date)} as the due date.`:' Your club has marked this format as required now.')
    :'';
  const sectionStepTitle=builderSection==='core'
    ?(currentComplete?'Core complete ✓':'Start with Core')
    :(currentComplete?`${currentLabel} Player Plan complete ✓`:`${currentLabel} Player Plan in progress`);
  const sectionStepCopy=builderSection==='core'
    ?(currentComplete
      ?'Next, choose a format. Your club can set due dates for the formats your Playing Group needs.'
      :'Your answers save automatically. Finish the required Core questions, then choose a format. You can still work ahead whenever you like.')
    :(currentTrainingReady
      ?`Your ${currentLabel} How We Train is now ready. You can still refine these answers later.${currentDueText}`
      :`Your answers save automatically. How We Train for ${currentLabel} is created only when Core and this format are complete.${currentDueText}`);
  const nextStep=playerPlanNextStep(rawForProgress,rollout);
  const formatCardsHtml=(raw)=>{
    const core=sectionProgress('core',raw);
    return `<button type="button" class="plan-format-card core ${builderSection==='core'?'active':''} ${core.complete?'complete':''}" data-builder-section="core">
      <span class="plan-format-name">Core</span><strong>${core.complete?'✓ Core complete':'Start here'}</strong>
      <small>${core.complete?'Choose a format next.':`${core.answeredRequired} of ${core.requiredCount} required questions answered`}</small>
    </button>${formats.map(([key,label])=>formatCard(key,label,raw)).join('')}`;
  };
  const coreNextFormatLinks=builderSection==='core'
    ?`<div class="btnrow compact" style="margin-top:10px"><button type="button" class="btn secondary" id="playerPlanNextStepFooter">${esc(nextStep.label)}</button></div>`
    :'';

  document.getElementById('page').innerHTML=`${playerPlanJourneyStyles()}<section class="card plan-rollout-player">
    <div class="plan-journey-head">
      <div>
        <div class="section-label">Your Player Plan</div>
        <h2>Your shots. Your decisions. Your plan.</h2>
        <p>Choose the shots you trust and when to use them. Practise them, then commit when the right ball arrives.</p>
        <div class="plan-journey-links"><button type="button" class="btn secondary" id="playerPlanNextStep">${esc(nextStep.label)}</button><button type="button" class="workspace-text-link" id="viewMyPlanSummary">View my plan</button><button type="button" class="workspace-text-link" id="myPlanGuideLink">Help</button></div>
      </div>
      <span id="playerPlanOverallStatus" role="status" aria-live="polite" class="workflow-status ${requirementsAvailable&&completedRequiredSections===requiredSections.length?'approved':''}">
        ${!requirementsAvailable?'DUE DATES UNAVAILABLE':completedRequiredSections===requiredSections.length
          ?'REQUIRED WORK COMPLETE'
          :`${completedRequiredSections}/${requiredSections.length} REQUIRED SECTIONS COMPLETE`}
      </span>
    </div>

    <details class="plan-progress-disclosure"><summary>Your progress & formats <span class="help">${esc(currentLabel)} open</span></summary>
    <div class="player-group-summary">
      <strong>Your Playing Groups</strong>
      ${!requirementsAvailable?'<span>Your Playing Groups could not be loaded.</span>':(rollout.groups||[]).length
        ?`<span>${(rollout.groups||[]).map(g=>esc(g.name)).join(' · ')}</span>`
        :'<span>Unassigned for now — that is completely fine. Your club can add groups later.</span>'}
    </div>

    <div class="plan-format-cards" id="playerPlanFormatCards">${formatCardsHtml(rawForProgress)}</div>
    </details>
  </section>

  ${rolloutErr?'<section class="card notice"><strong>Your club’s due dates could not be loaded.</strong><p>You can keep working on your plan. Required formats and due dates will be confirmed once this information loads.</p><button class="btn ghost" id="retryPlayerPlanDates">Try again</button></section>':''}
  ${formatReferenceHtml}

  <div class="grid player-plan-grid" style="margin-top:16px">
    <section class="card">
      <div class="builder-head compact">
        <div>
          <div class="section-label">${esc(currentLabel)} reflection</div>
          <h2>${esc(myPlayer.display_name)}</h2>
          <div class="help">Choose what genuinely describes your game. Add comments only where the options do not capture it.</div>
        </div>
        <span class="section-completion ${currentComplete?'done':''}">
          ${currentComplete
            ?'✓ SECTION COMPLETE'
            :currentProgress.requiredCount
              ?`${currentProgress.answeredRequired}/${currentProgress.requiredCount} REQUIRED QUESTIONS`
              :'OPTIONAL SECTION'}
        </span>
      </div>

      <div id="builderQuestions">${renderQuestions(builderSection)}</div>

      <div class="player-plan-simple-status">
        <div>
          <strong id="playerPlanStepTitle">${esc(sectionStepTitle)}</strong>
          <span id="playerPlanStepCopy">${esc(sectionStepCopy)}</span>
          ${coreNextFormatLinks}
          <div id="playerPlanRemainingAction" class="btnrow compact" style="margin-top:10px;${currentComplete?'display:none':''}"><button type="button" class="btn ghost" id="jumpToNextUnanswered">Next unanswered question ↓</button><span class="status" id="playerPlanRemainingCount">${currentProgress.requiredCount?`${currentProgress.answeredRequired}/${currentProgress.requiredCount} required answered`:''}</span></div>
          ${builderSection!=='core'?`<div class="btnrow compact" style="margin-top:10px"><button class="btn secondary" id="openHowWeTrainFromPlan" ${currentTrainingReady?'':'disabled'}>${currentTrainingReady?'Open How We Train →':'How We Train locked'}</button></div>`:''}
        </div>
        <div><span class="status" id="builderStatus" role="status" aria-live="polite">${localRaw?'Changes waiting to save…':workflow?.updated_at?'Saved automatically ✓':'Your answers save automatically.'}</span><button type="button" class="btn ghost" id="retryPlayerPlanSave" hidden>Retry saving</button></div>
      </div>
    </section>

    <details class="card plan-preview-disclosure" id="myPlanSummary">
      <summary>Your plan so far</summary>
      <h2>See your answers together.</h2>
      <div class="help">Your Core answers apply across formats. Each format adds the decisions you make in that type of match. You can refine your answers later.</div>
      <div id="draftPreview">${renderDraftPreview()}</div>
    </details>
  </div>`;
  document.getElementById('viewMyPlanSummary').onclick=()=>{const summary=document.getElementById('myPlanSummary');summary.open=true;summary.scrollIntoView({behavior:'smooth',block:'start'});};
  document.getElementById('playerPlanNextStep').onclick=async()=>{
    if(await savePlayerPlanProgressSilently()===false)return;
    const next=playerPlanNextStep(localRaw||rawAnswers(),rollout);
    if(next.kind==='training'){currentTab='howwetrain';await renderTab();return;}
    if(builderSection!==next.section){builderSection=next.section;await renderMyPlan();}
    document.getElementById('builderQuestions')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  document.getElementById('playerPlanNextStepFooter')?.addEventListener('click',()=>document.getElementById('playerPlanNextStep').click());
  document.getElementById('retryPlayerPlanSave').onclick=async()=>{await savePlayerPlanProgressSilently();};

  const renderedProgress=document.getElementById('playerPlanOverallStatus');
  const refreshCurrentPlayerPlanState=()=>{
    if(document.getElementById('playerPlanOverallStatus')!==renderedProgress)return;
    const raw=localRaw||rawAnswers();
    const progress=sectionProgress(builderSection,raw);
    const coreNow=sectionProgress('core',raw);
    const gaps=requiredQuestionGapSpecs(builderSection,raw);
    const badge=document.querySelector('.section-completion');
    const stepTitle=document.getElementById('playerPlanStepTitle');
    const stepCopy=document.getElementById('playerPlanStepCopy');
    const trainBtn=document.getElementById('openHowWeTrainFromPlan');
    const remainRow=document.getElementById('playerPlanRemainingAction');
    const remainCount=document.getElementById('playerPlanRemainingCount');
    const nextButton=document.getElementById('playerPlanNextStep');
    if(nextButton)nextButton.textContent=playerPlanNextStep(raw,rollout).label;
    const nextFooter=document.getElementById('playerPlanNextStepFooter');
    if(nextFooter)nextFooter.textContent=playerPlanNextStep(raw,rollout).label;
    const overall=document.getElementById('playerPlanOverallStatus');
    const completed=requiredSections.filter(key=>sectionProgress(key,raw).complete).length;
    if(overall){
      overall.classList.toggle('approved',requirementsAvailable&&completed===requiredSections.length);
      overall.textContent=!requirementsAvailable?'DUE DATES UNAVAILABLE':completed===requiredSections.length?'REQUIRED WORK COMPLETE':`${completed}/${requiredSections.length} REQUIRED SECTIONS COMPLETE`;
    }
    const cards=document.getElementById('playerPlanFormatCards');
    if(cards){cards.innerHTML=formatCardsHtml(raw);bindPlanFormatControls();}

    if(badge){
      badge.classList.toggle('done',progress.complete);
      badge.textContent=progress.complete
        ?'✓ SECTION COMPLETE'
        :progress.requiredCount
          ?`${progress.answeredRequired}/${progress.requiredCount} REQUIRED QUESTIONS`
          :'OPTIONAL SECTION';
    }

    if(remainRow)remainRow.style.display=progress.complete?'none':'flex';
    if(remainCount)remainCount.textContent=progress.requiredCount?`${progress.answeredRequired}/${progress.requiredCount} required answered`:'';

    if(builderSection==='core'){
      if(stepTitle)stepTitle.textContent=progress.complete?'Core complete ✓':'Start with Core';
      if(stepCopy)stepCopy.textContent=progress.complete
        ?'Next, choose a format. Your club can set due dates for the formats your Playing Group needs.'
        :gaps.length===1
          ?'One required Core answer remains. Your answers save automatically.'
          :`${gaps.length} required Core answers remain. Your answers save automatically.`;
    }else{
      const ready=coreNow.complete&&progress.complete;
      if(stepTitle)stepTitle.textContent=progress.complete?`${currentLabel} Player Plan complete ✓`:`${currentLabel} Player Plan in progress`;
      if(stepCopy)stepCopy.textContent=ready
        ?`Your ${currentLabel} How We Train is now ready. You can still refine these answers later.${currentDueText}`
        :progress.complete&&!coreNow.complete
          ?`Your ${currentLabel} answers are complete. Finish Core to create your ${currentLabel} How We Train.${currentDueText}`
          :`${gaps.length===1?'One required answer remains':`${gaps.length} required answers remain`} in ${currentLabel}. How We Train unlocks as soon as Core and this format are complete.${currentDueText}`;
      if(trainBtn){trainBtn.disabled=!ready;trainBtn.textContent=ready?'Open How We Train →':'How We Train locked';}
    }
  };

  const jumpToNextUnanswered=()=>{
    const raw=localRaw||rawAnswers();
    const gap=requiredQuestionGapSpecs(builderSection,raw)[0];
    if(!gap)return;
    const row=[...document.querySelectorAll('[data-player-question-key]')].find(el=>el.dataset.playerQuestionKey===String(gap.id));
    if(!row)return;
    row.scrollIntoView({behavior:'smooth',block:'center'});
    row.animate([{boxShadow:'0 0 0 0 rgba(32,47,120,0)'},{boxShadow:'0 0 0 4px rgba(32,47,120,.18)'},{boxShadow:'0 0 0 0 rgba(32,47,120,0)'}],{duration:1200});
  };
  document.getElementById('jumpToNextUnanswered')?.addEventListener('click',jumpToNextUnanswered);
  document.addEventListener('bdp-player-plan-saved',refreshCurrentPlayerPlanState,{once:true});

  if(document.getElementById('openHowWeTrainFromPlan'))document.getElementById('openHowWeTrainFromPlan').onclick=async()=>{
    if(await savePlayerPlanProgressSilently()===false)return;
    currentTab='howwetrain';
    renderTab();
  };

  if(document.getElementById('myPlanGuideLink'))document.getElementById('myPlanGuideLink').onclick=()=>openClubBattingGuideTopic('player_plan');
  document.getElementById('retryPlayerPlanDates')?.addEventListener('click',async()=>{if(await saveClubPlanBeforeNavigation())await renderMyPlan();});
  function bindPlanFormatControls(){
    document.querySelectorAll('[data-plan-date-format]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openPlanDueDateDialog(b.dataset.planDateFormat);});
    document.querySelectorAll('[data-builder-section]').forEach(b=>b.onclick=async()=>{
      if(await savePlayerPlanProgressSilently()===false)return;
      builderSection=b.dataset.builderSection;
      await renderMyPlan();
    });
  }
  bindPlanFormatControls();

  document.querySelectorAll('.option-chip input').forEach(x=>x.onchange=()=>{
    collectBuilderAnswers();
    document.getElementById('draftPreview').innerHTML=renderDraftPreviewFromLocal();

    refreshCurrentPlayerPlanState();
    queuePlayerPlanAutosave();
  });

  document.querySelectorAll('[data-comment-key]').forEach(x=>x.oninput=()=>{
    collectBuilderAnswers();
    document.getElementById('draftPreview').innerHTML=renderDraftPreviewFromLocal();

    refreshCurrentPlayerPlanState();
    queuePlayerPlanAutosave();
  });
}

function renderQuestions(section){
  const questions=playerPlanQuestionsFor(section);
  if(!questions.length)return '<div class="notice">Your club has not included any Player Plan questions in this section.</div>';
  return questions.map(q=>renderQuestion(section,q.id,q)).join('');
}

function renderQuestion(section,key,spec){
  const a=answerFor(section,key);
  const badge=spec.required?'<span class="question-requirement required">REQUIRED</span>':'<span class="question-requirement optional">OPTIONAL</span>';
  if(spec.response_type==='text'){
    return `<div class="question" data-player-question-key="${esc(key)}" data-player-question-required="${spec.required?'true':'false'}"><div class="question-title-row"><h3>${esc(spec.label)}</h3>${badge}</div><div class="why">${esc(spec.guidance||'Write the response that best describes your game.')}</div><div class="optional-comment"><textarea data-comment-key="${esc(key)}" data-comment-section="${section}" placeholder="Your response…">${esc(a.comment||'')}</textarea></div></div>`;
  }
  return `<div class="question" data-player-question-key="${esc(key)}" data-player-question-required="${spec.required?'true':'false'}"><div class="question-title-row"><h3>${esc(spec.label)}</h3>${badge}</div><div class="why">${esc(spec.guidance||'Choose all that genuinely apply.')}</div><div class="option-grid">${(spec.options||[]).map((o,i)=>{const id=`q_${section}_${key}_${i}`;return `<label class="option-chip"><input type="checkbox" id="${esc(id)}" data-answer-section="${section}" data-answer-key="${esc(key)}" value="${esc(o)}" ${(a.choices||[]).includes(o)?'checked':''}><span>${esc(o)}</span></label>`;}).join('')}</div><div class="optional-comment player-own-answer"><div class="player-own-answer-copy"><strong>Can’t see your answer?</strong><span>Add your own option or useful detail. It is saved with your Player Plan, and de-identified player-added answers help the club see where these choices could be better.</span></div><textarea data-comment-key="${esc(key)}" data-comment-section="${section}" placeholder="Add your own answer…">${esc(a.comment||'')}</textarea></div></div>`;
}

let localRaw=null;

function collectBuilderAnswers(){
  if(!localRaw)localRaw=rawAnswers();

  const section=builderSection;
  if(section==='core'&&!localRaw.core)localRaw.core={};
  if(section!=='core'){
    if(!localRaw.formats)localRaw.formats={};
    if(!localRaw.formats[section])localRaw.formats[section]={};
  }

  const keys=[...new Set([
    ...[...document.querySelectorAll('[data-answer-key]')].map(x=>x.dataset.answerKey),
    ...[...document.querySelectorAll('[data-comment-key]')].map(x=>x.dataset.commentKey)
  ])];

  for(const key of keys){
    const choices=[...document.querySelectorAll(`[data-answer-key="${key}"][data-answer-section="${section}"]:checked`)].map(x=>x.value);
    const comment=document.querySelector(`[data-comment-key="${key}"][data-comment-section="${section}"]`)?.value.trim()||'';
    const answer={choices,comment};
    if(section==='core')localRaw.core[key]=answer;
    else localRaw.formats[section][key]=answer;
  }
}

function curate(raw){
  const result={core:[],formats:{}};
  for(const q of playerPlanQuestionsFor('core')){
    const a=raw.core?.[q.id];if(!a)continue;
    const bits=[...(a.choices||[])];if(a.comment)bits.push(a.comment);
    if(bits.length)result.core.push({label:q.label,value:bits.join(' · ')});
  }
  for(const [f,label] of publishedEnabledFormats()){
    const lines=[];
    for(const q of playerPlanQuestionsFor(f)){
      const a=raw.formats?.[f]?.[q.id];if(!a)continue;
      const bits=[...(a.choices||[])];if(a.comment)bits.push(a.comment);
      if(bits.length)lines.push({label:q.label,value:bits.join(' · ')});
    }
    result.formats[f]={label,lines};
  }
  return result;
}

function renderDraftPreviewFromLocal(){
  return renderCuratedDraft(curate(localRaw||rawAnswers()));
}

function renderDraftPreview(){
  const curated=workflow?.curated_draft&&Object.keys(workflow.curated_draft||{}).length
    ? workflow.curated_draft
    : curate(rawAnswers());
  return renderCuratedDraft(curated);
}

function renderCuratedDraft(curated,playerName=null,kicker='Draft Player Plan'){
  const core=curated.core||[];
  const formats=curated.formats||{};
  const displayName=playerName||myPlayer?.display_name||'Player';

  return `<div class="plan-draft">
    <div class="plan-draft-head"><div class="section-label" style="color:#fff;opacity:.75">${esc(kicker)}</div><h2>${esc(displayName)}</h2></div>
    ${core.length?core.map(x=>`<div class="plan-line"><div class="label">${esc(x.label)}</div><div class="value">${esc(x.value)}</div></div>`).join(''):'<div class="plan-line"><div class="value">Start answering the guided questions to build your draft.</div></div>'}
    ${Object.values(formats).map(f=>f.lines?.length?`<div class="plan-line"><div class="label">${esc(f.label)}</div><div class="value">${f.lines.map(x=>`<strong>${esc(x.label)}:</strong> ${esc(x.value)}`).join('<br><br>')}</div></div>`:'').join('')}
  </div>`;
}


async function saveSectionCompletion(section,complete){
  collectBuilderAnswers();
  const raw=localRaw||rawAnswers();
  if(complete){
    const gaps=requiredQuestionGaps(section,raw);
    if(gaps.length){
      const st=document.getElementById('builderStatus');
      if(st)st.textContent=`Complete the required questions first: ${gaps.slice(0,3).join(', ')}${gaps.length>3?'…':''}`;
      return;
    }
  }
  const curated=curate(raw);
  const sectionStatus=structuredClone(workflow?.section_status||{});

  if(complete){
    sectionStatus[section]=new Date().toISOString();
  }else{
    delete sectionStatus[section];
  }

  const st=document.getElementById('builderStatus');
  if(st)st.textContent=complete?'Finishing section…':'Reopening section…';

  const payload={
    player_id:myPlayer.id,
    raw_answers:raw,
    curated_draft:curated,
    section_status:sectionStatus,
    status:workflow?.status||'in_progress',
    submitted_at:workflow?.submitted_at||null,
    updated_at:new Date().toISOString()
  };

  const {data,error}=await supabase
    .from('player_plan_workflows')
    .upsert(payload,{onConflict:'player_id'})
    .select()
    .single();

  if(error){
    if(st)st.textContent=error.message;
    return;
  }

  workflow=data;
  localRaw=null;
  await renderMyPlan();
}

async function saveWorkflow(status){
  collectBuilderAnswers();
  const raw=localRaw||rawAnswers();
  const curated=curate(raw);
  const payload={
    player_id:myPlayer.id,
    raw_answers:raw,
    curated_draft:curated,
    section_status:workflow?.section_status||{},
    status,
    submitted_at:status==='ready_for_review'?new Date().toISOString():workflow?.submitted_at||null,
    updated_at:new Date().toISOString()
  };

  const s=document.getElementById('builderStatus');
  s.textContent='Saving…';

  const {data,error}=await supabase
    .from('player_plan_workflows')
    .upsert(payload,{onConflict:'player_id'})
    .select()
    .single();

  if(error){s.textContent=error.message;return;}
  workflow=data;
  localRaw=null;
  s.textContent='Saved ✓';
  renderMyPlan();
}


/* ---------------- PUBLIC COMMERCIAL ONBOARDING ---------------- */

const money=(cents,currency='AUD')=>new Intl.NumberFormat('en-AU',{style:'currency',currency,minimumFractionDigits:2}).format((Number(cents)||0)/100);
const niceDate=d=>d?new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';

async function sendRouteMagicLink(email){
  const {error}=await supabase.auth.signInWithOtp({
    email,
    options:{emailRedirectTo:redirectUrl()}
  });
  return error;
}


async function renderSalesProspectRoute(token){
  const {data:p,error}=await supabase.rpc('get_public_sales_prospect',{p_token:token});
  if(error||!p){
    app.innerHTML=`<div class="login"><h1>That Club Batting link isn’t available.</h1><p>${esc(error?.message||'This link is no longer available.')}</p></div>`;
    return;
  }

  if(['maybe_later','wrong_contact','declined','do_not_contact'].includes(p.status)){
    const messages={
      maybe_later:['Thanks — we’ll come back once.','We’ll send one re-contact in about 30 days. There will be no ongoing follow-up sequence.'],
      wrong_contact:['Thanks for pointing us in the right direction.','We won’t keep prospecting this address.'],
      declined:['Thanks for letting us know.','We won’t send further prospecting emails to this address.'],
      do_not_contact:['You’ve been unsubscribed.','We won’t send further prospecting emails to this address.']
    };
    const m=messages[p.status]||messages.declined;
    app.innerHTML=`<div class="login" style="max-width:700px"><div class="success-mark">✓</div><h1>${esc(m[0])}</h1><p>${esc(m[1])}</p></div>`;
    return;
  }

  const place=[p.locality,p.region,p.country].filter(Boolean).join(', ');
  const trialStatusCopy={
    active:['Your club’s trial is active.','Sign in to Club Batting to continue setting up or using your club’s system. Nothing is automatically charged at the end of the trial.'],
    conversion_requested:['Your club has requested paid continuation.','Your Club Admin can sign in to review the next steps. Requesting continuation does not take payment.'],
    converted:['Your club has moved to paid access.','Sign in to Club Batting to continue using your club’s system.'],
    declined:['Your club has chosen to finish after the trial.','Your Club Admin can sign in to check the remaining trial access. Nothing is automatically charged.'],
    ended:['Your club’s trial has ended.','Your Club Admin can sign in to review the club’s access. Nothing was automatically charged at the end of the trial.']
  }[p.trial_status];
  const interested=p.status==='interested'||p.status==='onboarding'||!!trialStatusCopy;
  const trialLinkQueued=p.status==='onboarding';
  app.innerHTML=`<div class="prospect-shell sales-response-shell sales-guide-shell">
    <section class="prospect-hero sales-prospect-hero">
      <div class="section-label">Club Batting</div>
      <h1>Good starts should become innings that matter.</h1>
      ${place?`<p class="prospect-location">${esc(place)}</p>`:''}
      <p>Help ${esc(p.club_name)} turn the same batting conversations into action: players choose their shots, practise executing them and commit fully when the right ball is there. The aim is to help more players build a game they trust, score runs and enjoy their cricket.</p>
      <p><strong>Know your shots. Practise them. Back yourself when it’s on.</strong></p>
    </section>

    <section aria-labelledby="salesExampleTitle" style="margin:24px 0">
      <div class="section-label">Illustrative example · fictional player</div>
      <h2 id="salesExampleTitle">From a shot you trust to a decision you commit to.</h2>
      <p>Your club chooses its own approach. Here is how a player might put it to work.</p>
      <div class="sales-product-journey">
        <article><b>1</b><span>HOW WE BAT</span><strong>Back your strengths. Commit when it’s on.</strong><p style="font-size:.95rem;line-height:1.55">Choose the shots you trust and recognise when they can help the team.</p></article>
        <article><b>2</b><span>PLAYER PLAN</span><strong>My shot. My decision.</strong><p style="font-size:.95rem;line-height:1.55">“The pull is one of my scoring shots. When the ball is in my range and the shot fits the game situation, I’ll commit fully.”</p></article>
        <article><b>3</b><span>HOW WE TRAIN</span><strong>Practise the choice and the shot</strong><p style="font-size:.95rem;line-height:1.55">“Mix balls in and outside my pull-shot range. Practise recognising which to attack, then executing the shot at match pace.”</p></article>
        <article><b>4</b><span>MATCH REFLECTION</span><strong>Back the commitment. Support the next practice.</strong><p style="font-size:.95rem;line-height:1.55">“I chose a ball in my range and committed, but mistimed the pull and was caught.” The response: “Keep backing your shot. Let’s work on the execution together.”</p></article>
      </div>
      <p class="help">Players build their own plans. Accountability means using that plan, practising agreed skills and learning through constructive review. Recognise their practice and commitment, then review the decision and execution separately, without judgement.</p>
      <p class="help">Review how the plan was used across the innings separately from the decision and execution on the dismissal ball. If the ball or situation wasn’t right, work on that choice. A dismissal alone cannot tell you whether either needs to change.</p>
    </section>

      <section class="card prospect-card sales-response-card">
        ${interested?`<div class="notice success"><strong>${trialStatusCopy?esc(trialStatusCopy[0]):trialLinkQueued?'Your trial link has been requested.':`Thanks for your interest in Club Batting.`}</strong><br>${trialStatusCopy?esc(trialStatusCopy[1]):trialLinkQueued?'An email with your secure activation link has been queued for the Club Contact. Your full trial begins only when you activate it.':'A valid Club Contact email is needed before we can email your secure trial link.'}</div>${trialStatusCopy?'<div class="btnrow"><button class="btn secondary" id="salesOpenClubBatting">Open Club Batting</button></div>':''}`:`<h2>See what changes when your club puts it into practice.</h2><p class="help">Request a link to try the complete Club Batting platform with your club. The trial starts when you activate it, with no payment upfront. Paid continuation is a separate choice afterwards.</p>
        <div class="prospect-response-actions">
          <button class="btn secondary" data-sales-response="interested">Try it free with your club</button>
          <button class="btn ghost" data-sales-response="maybe_later">Maybe later</button>
          <button class="btn ghost" id="wrongContactBtn">I’m not the right person</button>
          <button class="btn ghost" data-sales-response="declined">Not interested</button>
        </div>
        <div id="wrongContactBox" class="handoff-box" style="display:none;margin-top:16px">
          <div class="section-label">Right club contact</div>
          <p class="help">If you know who looks after cricket/coaching decisions, you can point us in the right direction. This is optional.</p>
          <div class="field"><label>Name</label><input id="salesReferralName"></div>
          <div class="field"><label>Email</label><input id="salesReferralEmail" type="email"></div>
          <div class="btnrow"><button class="btn secondary" id="sendSalesReferral">Send referral</button><button class="btn ghost" id="cancelSalesReferral">Cancel</button></div>
        </div>`}
        <div id="salesResponseStatus" class="help"></div>
        ${trialStatusCopy?'':`<div class="sales-trial-note"><strong>What happens next:</strong><span>Open the trial link in your email, verify your Club Contact email and activate your trial when you’re ready. Nothing is automatically charged.</span></div>`}
      </section>

      <section class="card prospect-card sales-guide-card" style="border:2px solid var(--primary)">
        <div class="section-label">Ask the Club Batting Guide</div>
        <h2>How would this work at our club?</h2>
        <p class="help">Ask naturally. The Guide can explain the product, the setup process, Player Plans, Coach Conversations, Club Trials and what happens next.</p>
        <div id="salesGuideMessages" class="guide-chat-messages is-empty"><div class="guide-chat-empty">e.g. “We already have batting coaches. What does this add?”</div></div>
        <div class="guide-chat-compose"><textarea id="salesGuideQuestion" rows="3" placeholder="Ask a question about Club Batting…"></textarea><button class="btn secondary" id="salesGuideAsk">Ask Guide</button></div>
        <div id="salesGuideStatus" class="guide-chat-feedback" role="status" aria-live="polite"></div>
        <div class="guide-human-handoff"><button class="guide-inline-link" id="salesHumanHandoff">I’d rather speak to someone</button><div id="salesHandoffBox" hidden><textarea id="salesHandoffReason" rows="2" placeholder="What would you like to discuss?"></textarea><div class="btnrow"><button class="btn ghost" id="salesSendHandoff">Request a conversation</button><button class="btn ghost" id="salesCancelHandoff">Cancel</button></div></div></div>
      </section>
  </div>`;

  const initialGuideBox=document.getElementById('salesGuideMessages');
  let guideInteracted=false;
  const refreshGuideHistory=async()=>{
    try{
      const {data,error:e}=await supabase.functions.invoke('club-batting-guide',{body:{action:'history',lead_token:token}});
      if(e||data?.error||guideInteracted||document.getElementById('salesGuideMessages')!==initialGuideBox)return;
      setGuideMessages(initialGuideBox,data?.messages||[],'e.g. “We already have batting coaches. What does this add?”');
    }catch{/* Optional history must never block a club's response. */}
  };

  const askGuide=async()=>{
    const q=val('salesGuideQuestion').trim();if(!q)return;
    guideInteracted=true;
    const btn=document.getElementById('salesGuideAsk'),st=document.getElementById('salesGuideStatus'),messageBox=document.getElementById('salesGuideMessages');
    btn.disabled=true;btn.textContent='Thinking…';st.textContent='';st.classList.remove('error','ok');
    messageBox.classList.remove('is-empty');
    if(messageBox.querySelector('.guide-chat-empty'))messageBox.innerHTML='';
    messageBox.insertAdjacentHTML('beforeend',`<div class="guide-chat-message user pending"><span>You</span><p>${esc(q)}</p></div>`);
    messageBox.scrollTop=messageBox.scrollHeight;
    try{
      const {data,error:e}=await supabase.functions.invoke('club-batting-guide',{body:{action:'ask',lead_token:token,question:q}});
      if(e||data?.error)throw new Error(await edgeFunctionErrorMessage(e,data,'The Guide could not answer just now.'));
      document.getElementById('salesGuideQuestion').value='';
      setGuideMessages(messageBox,data?.messages||[],'e.g. “We already have batting coaches. What does this add?”');
    }catch(e){
      messageBox.querySelector('.pending:last-of-type')?.classList.remove('pending');
      st.textContent=e?.message||'The Guide could not answer just now.';
      st.classList.add('error');
    }finally{
      btn.disabled=false;btn.textContent='Ask Guide';
    }
  };
  document.getElementById('salesGuideAsk').onclick=askGuide;
  document.getElementById('salesGuideQuestion').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();askGuide();}});
  document.getElementById('salesHumanHandoff').onclick=()=>{document.getElementById('salesHandoffBox').hidden=false;document.getElementById('salesHumanHandoff').hidden=true;};
  document.getElementById('salesCancelHandoff').onclick=()=>{document.getElementById('salesHandoffBox').hidden=true;document.getElementById('salesHumanHandoff').hidden=false;};
  document.getElementById('salesSendHandoff').onclick=async()=>{
    const box=document.getElementById('salesHandoffBox');
    const {data,error:e}=await supabase.functions.invoke('club-batting-guide',{body:{action:'handoff',lead_token:token,reason:val('salesHandoffReason')}});
    box.innerHTML=e||data?.error?`<div class="notice compact">${esc(data?.error||e?.message||'Could not record the request.')}</div>`:'<div class="notice success compact"><strong>Request recorded.</strong><br>A person can pick this up with the conversation context already attached.</div>';
  };

  const respond=async(response,referralName='',referralEmail='')=>{
    const st=document.getElementById('salesResponseStatus');st.textContent='Saving…';
    const {error:e}=await supabase.rpc('respond_sales_prospect',{p_token:token,p_response:response,p_referral_name:referralName,p_referral_email:referralEmail});
    if(e){st.textContent=e.message;return;}
    if(response==='interested'){await renderSalesProspectRoute(token);return;}
    const copy=response==='maybe_later'
      ?['Thanks — we’ll come back once.','We’ll send one re-contact in about 30 days. There will be no ongoing follow-up sequence.']
      :response==='wrong_contact'
        ?[referralEmail?'Thanks — that helps.':'Thanks for letting us know.',referralEmail?'We’ll contact the person you nominated instead.':'We won’t keep prospecting this address.']
        :['Thanks for letting us know.','We won’t send further prospecting emails to this address.'];
    app.innerHTML=`<div class="login" style="max-width:700px"><div class="success-mark">✓</div><h1>${esc(copy[0])}</h1><p>${esc(copy[1])}</p></div>`;
  };
  document.querySelectorAll('[data-sales-response]').forEach(b=>b.onclick=()=>respond(b.dataset.salesResponse));
  document.getElementById('wrongContactBtn')?.addEventListener('click',()=>{document.getElementById('wrongContactBox').style.display='block';document.getElementById('wrongContactBtn').style.display='none';});
  document.getElementById('cancelSalesReferral')?.addEventListener('click',()=>{document.getElementById('wrongContactBox').style.display='none';document.getElementById('wrongContactBtn').style.display='';});
  document.getElementById('sendSalesReferral')?.addEventListener('click',()=>respond('wrong_contact',val('salesReferralName'),val('salesReferralEmail')));
  document.getElementById('salesOpenClubBatting')?.addEventListener('click',()=>{
    localStorage.setItem('bdp-context','club');
    history.replaceState({},'',location.pathname);
    routeAuth();
  });
  // The Guide is optional; every response action is ready before history loads.
  void refreshGuideHistory();
}

async function renderProspectRoute(token){
  const {data:p,error}=await supabase.rpc('get_public_prospect',{p_token:token});
  if(error||!p){
    app.innerHTML=`<div class="login"><h1>That club link isn’t available.</h1><p>${esc(error?.message||'It may have expired or been replaced.')}</p></div>`;
    return;
  }
  await supabase.rpc('mark_prospect_viewed',{p_token:token});

  if(p.entry_route==='direct_beta'){
    renderDirectBetaRoute(token,p);
    return;
  }
  renderSecretaryProspectRoute(token,p);
}

function renderDirectBetaRoute(token,p){
  if(!session){
    app.innerHTML=`<div class="prospect-shell">
      <section class="prospect-hero">
        <div class="section-label">Complimentary Beta Invitation</div>
        <h1>${esc(p.club_name)}</h1>
        <p>You’ve been invited to trial Club Batting directly with your club. The commercial Secretary → payer workflow has been deliberately skipped for this Beta.</p>
      </section>
      <section class="card prospect-card">
        <h2>Activate the trial</h2>
        <p class="help">Use the email address this Beta invitation was sent to. You’ll become the initial Club Admin, then choose who should lead the batting philosophy.</p>
        <div class="field"><label>Your email</label><input id="routeEmail" type="email" placeholder="you@club.com.au"></div>
        <button class="btn secondary" id="routeSignIn">Send secure sign-in link</button>
        <div id="routeStatus" class="help"></div>
      </section>
    </div>`;
    document.getElementById('routeSignIn').onclick=async()=>{
      const st=document.getElementById('routeStatus');st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check your email and tap the secure link to return here.';
    };
    return;
  }

  app.innerHTML=`<div class="prospect-shell">
    <section class="prospect-hero">
      <div class="section-label">Direct Beta</div>
      <h1>${esc(p.club_name)}</h1>
      <p>Complimentary trial access is ready through <strong>${esc(niceDate(p.offer_end))}</strong>. No payment or Secretary handoff is required.</p>
    </section>
    <section class="card prospect-card">
      <h2>One last thing</h2>
      <div class="field"><label>Your name</label><input id="betaName" placeholder="Full name"></div>
      <button class="btn secondary" id="activateBeta">Activate Beta & become Club Admin</button>
      <div id="betaStatus" class="help"></div>
    </section>
  </div>`;

  document.getElementById('activateBeta').onclick=async()=>{
    const st=document.getElementById('betaStatus');st.textContent='Activating…';
    const {data,error}=await supabase.rpc('accept_prospect_offer',{p_token:token,p_contact_name:val('betaName')});
    if(error){st.textContent=error.message;return;}
    if(data?.club_id)localStorage.setItem('bdp-club-id',data.club_id);
    localStorage.setItem('bdp-context','club');
    history.replaceState({},'',location.pathname);
    await loadPlatformContext();
    await loadContext();
  };
}

function prospectIntro(p){
  if(p.is_club_trial){
    const signup=p.entry_phase==='signup';
    const preactivation=!['awaiting_payment','awaiting_admin_handoff','admin_invited','active'].includes(p.status);
    return `<section class="prospect-hero">
      <div class="section-label">${signup?'Club Batting · Free Club Trial':`For ${esc(p.club_name)}`}</div>
      <h1>Turn the same batting conversations into a plan for change.</h1>
      <p>${signup?'Start with a free 60-day Club Trial. ':preactivation?'Thanks for your interest in Club Batting. Your trial is ready when you are. ':''}Agree on how your club wants to bat and help players build their own Player Plans: choose their shots, practise executing them and commit fully when the right ball is there. The aim is to help more players score runs and enjoy their batting.</p>
      <div class="prospect-value-grid">
        <div><strong>HOW WE BAT</strong><span>Agree on a clear direction for batting across your club.</span></div>
        <div><strong>MY PLAYER PLAN</strong><span>Each batter chooses the shots they trust and when to use them, within the club’s approach.</span></div>
        <div><strong>HOW WE TRAIN</strong><span>Practise the shot and the decision. Recognise the commitment, support the learning and shape the next session.</span></div>
      </div>
      <p>${preactivation?'Once you activate, choose who will coordinate the setup and lead your Batting Philosophy Workshop.':'Your club’s next step is to put its approach into practice with players.'} Keep accountability practical: use the plan, practise agreed skills and review constructively, with room for each batter’s strengths.</p>
    </section>`;
  }
  return `<section class="prospect-hero">
    <div class="section-label">For ${esc(p.club_name)}</div>
    <h1>A club-wide batting development system.</h1>
    <p>Define how your club wants to bat. Help each player choose their shots, practise them and commit when the right ball is there. Give players, coaches and captains a shared way to review decisions and execution without judgement.</p>
    <div class="prospect-value-grid">
      <div><strong>OUR CLUB</strong><span>Make the batting philosophy explicit.</span></div>
      <div><strong>OUR WAY</strong><span>Shape it for T20, Limited Overs and Long Form.</span></div>
      <div><strong>MY GAME</strong><span>Each player builds a plan around their trusted shots, strengths and role.</span></div>
    </div>
  </section>`;
}

function wireProspectAccountSwitch(buttonId,statusId){
  const button=document.getElementById(buttonId);
  if(!button)return;
  button.onclick=async()=>{
    if(button.disabled)return;
    const status=document.getElementById(statusId);
    button.disabled=true;
    if(status)status.textContent='Signing out of this account…';
    try{
      const {error}=await supabase.auth.signOut({scope:'local'});
      if(error)throw error;
      // The auth listener returns to this exact invitation with no session.
      // Keeping the URL preserves the token for the next email sign-in link.
    }catch(error){
      if(status)status.textContent=error?.message||'Could not switch accounts. Please try again.';
      button.disabled=false;
    }
  };
}

async function prepareProspectClubAccess(clubId){
  const button=document.getElementById('prospectOpenClub');
  const status=document.getElementById('prospectClubAccessStatus');
  const userId=session?.user?.id;
  if(!button||!status||!userId||!clubId)return;
  const stillCurrent=()=>session?.user?.id===userId&&document.getElementById('prospectOpenClub')===button;
  button.hidden=true;button.disabled=true;
  status.textContent='Checking your club access…';
  try{
    const {data,error}=await supabase.from('club_memberships')
      .select('club_id,clubs(archived_at)').eq('club_id',clubId).eq('user_id',userId).maybeSingle();
    if(!stillCurrent())return;
    if(error)throw error;
    if(!data||!data.clubs||data.clubs.archived_at){
      status.textContent='The nominated Club Admin can sign in to continue. This account does not have access to the club.';
      return;
    }
    status.textContent='You have access to the club. Open Club Batting to continue.';
    button.textContent='Open Club Batting';button.hidden=false;button.disabled=false;
    button.onclick=async()=>{
      if(button.disabled||session?.user?.id!==userId)return;
      button.disabled=true;
      localStorage.setItem('bdp-context','club');
      localStorage.setItem('bdp-club-id',clubId);
      const nextUrl=new URL(location.href||`${location.origin}${location.pathname}${location.search}`);
      nextUrl.search='';nextUrl.hash='';nextUrl.searchParams.set('club',clubId);
      history.replaceState({},'',nextUrl.pathname+nextUrl.search);
      // Normal launch routing independently reloads membership and permissions.
      await routeAuth();
    };
  }catch(error){
    if(!stillCurrent())return;
    status.textContent='We couldn’t check your club access. Try again.';
    button.textContent='Check club access again';button.hidden=false;button.disabled=false;
    button.onclick=()=>prepareProspectClubAccess(clubId);
  }
}

function renderProspectCoordinatorChoice(token,p){
  const alreadyInvited=p.status==='admin_invited';
  const trialUnavailable=p.is_club_trial&&(
    ['offered','declined','ended','converted'].includes(p.trial_status)
    ||(p.trial_ends_on&&p.trial_ends_on<new Date().toISOString().slice(0,10))
  );
  const linkExpired=p.offer_expires_at&&new Date(p.offer_expires_at).getTime()<=Date.now();
  const unavailable=trialUnavailable||linkExpired;
  app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}
    <section class="card prospect-card">
      <div class="section-label">Your club’s next step</div>
      <h2>${unavailable?'Check your club’s setup access':alreadyInvited?'Your Club Admin invitation is on its way.':'Who will coordinate your club’s setup?'}</h2>
      <p>${unavailable?'This setup link or trial is no longer active. Contact Club Batting to check access before continuing.':alreadyInvited?'The person you nominated can open their invitation to continue.':'If that’s you, go straight into your club’s setup. Otherwise, send an invitation to the person who will coordinate it.'}</p>
      <p class="help">Signed in as ${esc(session?.user?.email||'')}.</p>
      ${!unavailable&&!alreadyInvited?`<div class="btnrow">
        <button class="btn secondary" id="coordinateClubMyself">I’ll coordinate our club’s setup</button>
        <button class="btn ghost" id="chooseClubCoordinator">Choose someone else</button>
      </div>
      <p class="help">The coordinator has Club Admin access and can choose who leads the Batting Philosophy Workshop.</p>
      <div class="handoff-box" id="coordinatorHandoffBox" hidden>
        <div class="section-label">Invite your Club Admin</div>
        <div class="field"><label for="adminName">Name</label><input id="adminName" autocomplete="name" placeholder="The person who will coordinate setup"></div>
        <div class="field"><label for="adminEmail">Email</label><input id="adminEmail" type="email" autocomplete="email"></div>
        <div class="btnrow"><button class="btn secondary" id="sendAdminInvite">Send Club Admin invitation</button><button class="btn ghost" id="cancelCoordinatorHandoff">Back to my choices</button></div>
      </div>`:''}
      <button class="btn ghost" id="prospectUseDifferentEmail">Use a different email</button>
      <div id="adminInviteStatus" class="help" role="status" aria-live="polite"></div>
    </section></div>`;
  wireProspectAccountSwitch('prospectUseDifferentEmail','adminInviteStatus');
  if(unavailable||alreadyInvited)return;
  const selfButton=document.getElementById('coordinateClubMyself');
  const chooseButton=document.getElementById('chooseClubCoordinator');
  const inviteButton=document.getElementById('sendAdminInvite');
  const backButton=document.getElementById('cancelCoordinatorHandoff');
  const accountButton=document.getElementById('prospectUseDifferentEmail');
  const handoff=document.getElementById('coordinatorHandoffBox');
  const status=document.getElementById('adminInviteStatus');
  const signedInUser=session?.user?.id;
  const stillCurrent=()=>session?.user?.id===signedInUser&&document.getElementById('coordinateClubMyself')===selfButton;
  let busy=false;
  const setBusy=value=>{busy=value;[selfButton,chooseButton,inviteButton,backButton,accountButton].forEach(button=>button.disabled=value);};
  chooseButton.onclick=()=>{if(busy)return;handoff.hidden=false;selfButton.hidden=true;chooseButton.hidden=true;status.textContent='';document.getElementById('adminName')?.focus?.();};
  backButton.onclick=()=>{if(busy)return;handoff.hidden=true;selfButton.hidden=false;chooseButton.hidden=false;status.textContent='';};
  selfButton.onclick=async()=>{
    if(busy||!stillCurrent())return;
    setBusy(true);status.textContent='Preparing your club setup…';
    try{
      const {data,error}=await supabase.rpc('claim_prospect_club_admin',{p_token:token});
      if(!stillCurrent())return;
      if(error)throw error;
      if(!data?.club_id||data.club_id!==p.club_id||data.status!=='active')throw new Error('We couldn’t confirm your club access. Please try again.');
      localStorage.setItem('bdp-context','club');localStorage.setItem('bdp-club-id',data.club_id);
      const nextUrl=new URL(location.href||`${location.origin}${location.pathname}${location.search}`);
      nextUrl.search='';nextUrl.hash='';nextUrl.searchParams.set('club',data.club_id);
      history.replaceState({},'',nextUrl.pathname+nextUrl.search);
      // Normal routing independently reloads actual membership and permissions.
      await routeAuth();
    }catch(error){
      if(!stillCurrent())return;
      status.textContent=['PGRST202','42883'].includes(error?.code)?'Direct setup is temporarily unavailable. Please try again shortly or choose someone else.':error?.message||'We couldn’t open your club setup. Please try again.';
      setBusy(false);
    }
  };
  inviteButton.onclick=async()=>{
    if(busy||!stillCurrent())return;
    const name=val('adminName'),email=val('adminEmail');
    if(!name||!email||!/^\S+@\S+\.\S+$/.test(email)){status.textContent='Enter the name and email of the person who will coordinate setup.';return;}
    if(email.trim().toLowerCase()===(session?.user?.email||'').trim().toLowerCase()){
      status.textContent='That’s your signed-in email. Choose “I’ll coordinate our club’s setup” to continue directly.';return;
    }
    setBusy(true);status.textContent='Preparing the Club Admin invitation…';
    try{
      const {error}=await supabase.rpc('nominate_club_admin',{p_token:token,p_admin_name:name,p_admin_email:email});
      if(!stillCurrent())return;
      if(error)throw error;
      status.textContent='Club Admin invitation queued. They can continue from their email.';
      // The nomination is already recorded. Do not let a delivery or refresh
      // problem turn the same button into a second invitation request.
      try{await kickLiveEmailDelivery();}catch(error){/* Outbox retains the message for delivery. */}
      if(stillCurrent())renderProspectCoordinatorChoice(token,{...p,status:'admin_invited'});
    }catch(error){
      if(!stillCurrent())return;
      status.textContent=error?.message||'We couldn’t prepare the invitation. Please try again.';setBusy(false);
    }
  };
}

function renderSecretaryProspectRoute(token,p){
  const amount=money(p.amount_due_cents,p.currency||'AUD');
  const free=p.amount_due_cents===0;
  const isClubTrial=!!p.is_club_trial;
  const trialDays=Number(p.trial_days||60);
  const alreadyPaid=['awaiting_admin_handoff','admin_invited','active'].includes(p.status);
  const passwordSignInUrl=new URL(location.href);passwordSignInUrl.hash='';passwordSignInUrl.searchParams.set('signin','1');

  if(!session && ['awaiting_payment','awaiting_admin_handoff','admin_invited','active'].includes(p.status)){
    const headline=p.status==='awaiting_payment'?'Payment is being arranged':p.status==='active'?'Club setup handoff is complete':'Your club is active';
    const body=p.status==='awaiting_payment'
      ?'A payment request has been sent. Sign in as the Club Contact if you want to check the current status.'
      :p.status==='active'
        ?'The Club Admin has taken over. Sign in only if you need to review the organisational handoff.'
        :'Sign in as the Club Contact to nominate or check the Club Admin handoff.';
    app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}<section class="card prospect-card"><h2>${headline}</h2><p>${body}</p><p><a class="btn secondary" href="${esc(passwordSignInUrl.href)}">Already registered? Sign in with your password</a></p><div class="field"><label>Club Contact email</label><input id="routeEmail" type="email"></div><button class="btn secondary" id="routeSignIn">Send secure sign-in link</button><div id="routeStatus" class="help"></div></section></div>`;
    document.getElementById('routeSignIn').onclick=async()=>{const st=document.getElementById('routeStatus');st.textContent='Sending…';const e=await sendRouteMagicLink(val('routeEmail'));st.textContent=e?e.message:'Check your email and tap the secure link to return here.';};
    return;
  }

  if(!session){
    app.innerHTML=`<div class="prospect-shell">
      ${prospectIntro(p)}
      <section class="card prospect-card">
        <div class="section-label">${isClubTrial?'Your full club trial':'Club offer'}</div>
        <h2>${isClubTrial?`Give your club ${trialDays} days to put it into practice`:free?'Complimentary club access':`${amount} for this access period`}</h2>
        <p class="help">${isClubTrial?`Your full ${trialDays} days begin only when you activate the trial. No payment is required upfront and nothing is automatically charged. If you want to keep using Club Batting afterwards, you can review the price and choose paid continuation.`:`Access under this offer runs through <strong>${esc(niceDate(p.offer_end))}</strong>. ${free?'No payment is required.':''}`}</p>
        ${isClubTrial?`<div class="notice compact"><strong>First, verify your email.</strong><br>Use the Club Contact email this link was sent to. We’ll email you a secure sign-in link, then you can activate the trial. Requesting the sign-in link does not start your trial.</div>`:`<div class="committee-summary">
          <strong>For the committee</strong>
          <p>The Secretary remains the organisational contact, but does not need to run the coaching system. After activation, the Secretary nominates the Club Admin and can step out of day-to-day involvement.</p>
          <button class="btn ghost" id="printSummary">Print / save committee summary</button>
        </div>`}
        ${isClubTrial?'':`<button class="btn secondary" id="committeeApproved">Our committee has approved — continue</button>`}
        <button class="btn ghost" id="wrongContact">I’m not the right club contact</button>
        <div id="verifyBox" style="display:${isClubTrial?'block':'none'};margin-top:12px">
          <p><a class="btn secondary" href="${esc(passwordSignInUrl.href)}">Already registered? Sign in with your password</a></p><div class="field"><label>Club Contact email</label><input id="routeEmail" type="email" placeholder="secretary@club.com.au"></div>
          <button class="btn secondary" id="verifySecretary">${isClubTrial?'Email my secure sign-in link':'Send secure sign-in link'}</button>
          <div id="routeStatus" class="help"></div>
        </div>
        <div id="wrongContactBox" style="display:none;margin-top:12px">
          <div class="field"><label>Correct contact name</label><input id="newContactName"></div>
          <div class="field"><label>Correct contact email</label><input id="newContactEmail" type="email"></div>
          <div class="field"><label>Note (optional)</label><textarea id="newContactNote" placeholder="e.g. I’m no longer the Secretary"></textarea></div>
          <button class="btn secondary" id="sendContactCorrection">Send correction</button>
          <div id="contactCorrectionStatus" class="help"></div>
        </div>
      </section>
    </div>`;
    if(document.getElementById('printSummary'))document.getElementById('printSummary').onclick=()=>window.print();
    if(document.getElementById('committeeApproved'))document.getElementById('committeeApproved').onclick=()=>document.getElementById('verifyBox').style.display='block';
    document.getElementById('wrongContact').onclick=()=>document.getElementById('wrongContactBox').style.display='block';
    document.getElementById('verifySecretary').onclick=async()=>{
      const st=document.getElementById('routeStatus');st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:(isClubTrial?'Check your email and open the secure sign-in link. You’ll return here to start your trial; it has not started yet.':'Check that email and tap the secure sign-in link. You’ll return to this club offer.');
    };
    document.getElementById('sendContactCorrection').onclick=async()=>{
      const st=document.getElementById('contactCorrectionStatus');st.textContent='Sending…';
      const {error}=await supabase.rpc('request_prospect_contact_change',{
        p_token:token,p_name:val('newContactName'),p_email:val('newContactEmail'),p_note:val('newContactNote')
      });
      st.textContent=error?error.message:'Thanks. The platform team has been asked to update the club contact.';
    };
    return;
  }

  if(p.status==='active'){
    app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}<section class="card prospect-card"><div class="success-mark">✓</div><h2>Setup handoff complete.</h2><p>The Club Admin can now coordinate your club’s setup. If that’s you, continue into Club Batting below. If someone else is coordinating setup, your handoff is complete.</p><p class="help">Signed in as ${esc(session.user.email||'')}.</p><div class="btnrow"><button class="btn secondary" id="prospectOpenClub" hidden disabled>Open Club Batting</button><button class="btn ghost" id="prospectUseDifferentEmail">Use a different email</button></div><div id="prospectClubAccessStatus" class="help" role="status" aria-live="polite"></div></section></div>`;
    wireProspectAccountSwitch('prospectUseDifferentEmail','prospectClubAccessStatus');
    void prepareProspectClubAccess(p.club_id);
    return;
  }

  if(['awaiting_admin_handoff','admin_invited'].includes(p.status)){
    renderProspectCoordinatorChoice(token,p);
    return;
  }

  if(p.status==='awaiting_payment'){
    app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}<section class="card prospect-card"><h2>Payment request sent.</h2><p>The nominated payer has been sent a payment link for <strong>${esc(amount)}</strong>.</p><div class="notice"><strong>No more work for you until payment is completed.</strong><br>When it is paid, you’ll be prompted to nominate the Club Admin.</div></section></div>`;
    return;
  }

  app.innerHTML=`<div class="prospect-shell">
    ${prospectIntro(p)}
    <section class="card prospect-card">
      <div class="section-label">${isClubTrial?'Club Trial':'Committee approved'}</div>
      <h2>${isClubTrial?`Ready to put Club Batting to work for ${esc(p.club_name)}?`:free?'No payment is required.':`${amount} is due.`}</h2>
      <p class="help">Signed in as ${esc(session.user.email||'')}. ${isClubTrial?`Start your full ${trialDays}-day trial today, then choose who will coordinate your club’s setup. No payment is required upfront and nothing is automatically charged. At the end, you can review the price and choose paid continuation.`:'We verify the Club Contact before any subscription action.'}</p>
      <div class="field"><label>Your name</label><input id="secretaryName" placeholder="Club Secretary / Club Contact"></div>
      <div class="btnrow"><button class="btn secondary" id="acceptOffer">${isClubTrial?`Start our ${trialDays}-day trial`:'Confirm & continue'}</button><button class="btn ghost" id="prospectUseDifferentEmail">Use a different email</button></div>
      <div id="acceptStatus" class="help" role="status" aria-live="polite"></div>
    </section>
  </div>`;

  wireProspectAccountSwitch('prospectUseDifferentEmail','acceptStatus');
  document.getElementById('acceptOffer').onclick=async()=>{
    const st=document.getElementById('acceptStatus');st.textContent='Confirming…';
    const {data,error}=await supabase.rpc('accept_prospect_offer',{p_token:token,p_contact_name:val('secretaryName')});
    if(error){st.textContent=error.message;return;}
    if(data?.next==='payment'){
      app.innerHTML=`<div class="prospect-shell">${prospectIntro(p)}<section class="card prospect-card">
        <div class="section-label">Arrange payment</div><h2>Who should receive the payment request?</h2>
        <p class="help">This can be the Treasurer or anyone the committee has authorised. Paying does not create a platform account and does not make them the ongoing contact.</p>
        <div class="field"><label>Payer name (optional)</label><input id="payerName"></div>
        <div class="field"><label>Payer email</label><input id="payerEmail" type="email"></div>
        <button class="btn secondary" id="sendPayment">Send payment request</button>
        <div id="paymentStatus" class="help"></div>
      </section></div>`;
      document.getElementById('sendPayment').onclick=async()=>{
        const pst=document.getElementById('paymentStatus');pst.textContent='Sending…';
        const {error:e}=await supabase.rpc('create_payment_request_for_prospect',{
          p_token:token,p_payer_name:val('payerName'),p_payer_email:val('payerEmail')
        });
        if(e){pst.textContent=e.message;return;}
        await kickLiveEmailDelivery();
        await renderProspectRoute(token);
      };
      return;
    }
    await renderProspectRoute(token);
  };
}

async function renderPaymentRoute(token){
  const {data:p,error}=await supabase.rpc('get_public_payment_request',{p_token:token});
  if(error||!p){app.innerHTML=`<div class="login"><h1>Payment request unavailable.</h1><p>${esc(error?.message||'This link may no longer be active.')}</p></div>`;return;}

  if(p.status==='paid'){
    app.innerHTML=`<div class="login"><div class="success-mark">✓</div><h1>Payment complete.</h1><p>${esc(p.club_name)} has been activated. The Club Contact has been notified and will nominate the Club Admin.</p><div class="notice"><strong>Your part is finished.</strong> You won’t receive coaching-system emails just because you made the payment.</div></div>`;
    return;
  }

  app.innerHTML=`<div class="login" style="max-width:640px">
    <div class="section-label">Subscription payment</div>
    <h1>${esc(p.club_name)}</h1>
    <div class="payment-amount">${esc(money(p.amount_cents,p.currency))}</div>
    <p>You have been nominated only to make this payment. You do not need a platform account and this does not make you the ongoing club contact.</p>
    ${p.payment_mode==='prototype'
      ?'<div class="notice"><strong>Prototype payment mode</strong><br>No card will be charged. Use the button below to simulate a successful payment while we test the club workflow.</div><button class="btn secondary" id="prototypePay">Simulate successful payment</button>'
      :'<div class="notice">Secure card payment will be handled by the connected payment provider.</div>'}
    <div id="payStatus" class="help"></div>
  </div>`;

  if(document.getElementById('prototypePay')){
    document.getElementById('prototypePay').onclick=async()=>{
      const st=document.getElementById('payStatus');st.textContent='Processing…';
      const {error}=await supabase.rpc('prototype_complete_payment',{p_token:token});
      if(error){st.textContent=error.message;return;}
      await renderPaymentRoute(token);
    };
  }
}


async function renderPhilosophyInviteRoute(token){
  const {data:i,error}=await supabase.rpc('get_public_philosophy_invite',{p_token:token});

  if(error || !i){
    app.innerHTML=`<div class="login"><h1>Invitation not found.</h1><p>${esc(error?.message||'This philosophy invitation is invalid or no longer available.')}</p></div>`;
    return;
  }

  if(i.status==='accepted'){
    if(session){
      localStorage.setItem('bdp-context','club');
      localStorage.setItem('bdp-club-id',i.club_id);
      history.replaceState({},'',location.pathname);
      await loadPlatformContext();
      await loadContext();
      return;
    }
    app.innerHTML=`<div class="login"><h1>Invitation already accepted.</h1><p>Sign in normally to continue with ${esc(i.club_name)}.</p><button class="btn secondary" id="normalSignIn">Sign in</button></div>`;
    document.getElementById('normalSignIn').onclick=()=>{history.replaceState({},'',location.pathname);renderLogin();};
    return;
  }

  if(!session){
    app.innerHTML=`<div class="login" style="max-width:650px">
      <div class="section-label">Philosophy contributor invitation</div>
      <h1>${esc(i.club_name)}</h1>
      <p>You’ve been invited to have an independent say in the club’s batting philosophy.</p>
      <div class="notice"><strong>No committee meeting required.</strong><br>You’ll work through Club Identity → What We Value → Format Emphasis privately. Your answers are combined with the other contributors only after submission.</div>
      <div class="field"><label>Email address this invitation was sent to</label><input id="routeEmail" type="email"></div>
      <button class="btn secondary" id="routeSignIn">Send secure sign-in link</button>
      <div id="routeStatus" class="help"></div>
    </div>`;

    document.getElementById('routeSignIn').onclick=async()=>{
      const st=document.getElementById('routeStatus');
      st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check your email and tap the secure link to return to this invitation.';
    };
    return;
  }

  app.innerHTML=`<div class="login" style="max-width:650px">
    <div class="section-label">Philosophy contributor invitation</div>
    <h1>Contribute to ${esc(i.club_name)}</h1>
    <p>This gives you access only to the Batting Philosophy Workshop unless the club separately gives you another role or permission.</p>
    <div class="field"><label>Your name</label><input id="philosophyInviteName" value="${esc(i.invited_name||'')}"></div>
    <div class="btnrow">
      <button class="btn secondary" id="acceptPhilosophyInvite">Accept & start</button>
      <button class="btn ghost" id="inviteSignOut">Use a different email</button>
    </div>
    <div id="philosophyInviteStatus" class="help"></div>
  </div>`;

  document.getElementById('inviteSignOut').onclick=()=>supabase.auth.signOut();

  document.getElementById('acceptPhilosophyInvite').onclick=async()=>{
    const st=document.getElementById('philosophyInviteStatus');
    st.textContent='Accepting…';
    const {data:clubId,error:aErr}=await supabase.rpc('accept_philosophy_contributor_invite',{
      p_token:token,p_display_name:val('philosophyInviteName')
    });
    if(aErr){st.textContent=aErr.message;return;}
    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',clubId);
    history.replaceState({},'',location.pathname);
    await loadPlatformContext();
    currentTab='workshop';
    await loadContext();
  };
}


async function renderLeadAdminHandoverRoute(token){
  const {data:h,error}=await supabase.rpc('get_public_lead_admin_handover',{p_token:token});

  if(error || !h){
    app.innerHTML=`<div class="login">
      <div class="section-label">Lead Admin handover</div>
      <h1>Handover invitation unavailable.</h1>
      <p>${esc(error?.message||'This invitation may have expired, been cancelled, or been replaced.')}</p>
    </div>`;
    return;
  }

  if(h.status==='accepted'){
    if(session){
      localStorage.setItem('bdp-context','club');
      localStorage.setItem('bdp-club-id',h.club_id);
      history.replaceState({},'',location.pathname);
      await loadPlatformContext();
      await loadContext();
      return;
    }

    app.innerHTML=`<div class="login">
      <div class="success-mark">✓</div>
      <h1>Handover already completed.</h1>
      <p>${esc(h.club_name)} already has its new Lead Admin in place.</p>
      <button class="btn secondary" id="handoverHome">Open platform</button>
    </div>`;
    document.getElementById('handoverHome').onclick=()=>{history.replaceState({},'',location.pathname);routeAuth();};
    return;
  }

  if(h.status!=='pending'){
    app.innerHTML=`<div class="login">
      <div class="section-label">Lead Admin handover</div>
      <h1>This handover is no longer active.</h1>
      <p>Ask the club’s current Lead Admin to create a new handover if required.</p>
    </div>`;
    return;
  }

  const {data:handoverGroups}=await supabase.rpc('get_public_handover_playing_groups',{p_token:token});
  const activeHandoverGroups=handoverGroups||[];

  if(!session){
    app.innerHTML=`<div class="login" style="max-width:680px">
      <div class="section-label">Lead Admin handover</div>
      <h1>${esc(h.club_name)}</h1>
      <p><strong>${esc(h.outgoing_name)}</strong> has nominated you to take over as the club’s Lead Admin.</p>
      <div class="notice"><strong>Nothing changes until you accept.</strong><br>After you sign in, you’ll also decide what access ${esc(h.outgoing_name)} should retain after the handover.</div>
      <div class="field"><label>Email address this invitation was sent to</label><input id="routeEmail" type="email"></div>
      <button class="btn secondary" id="routeSignIn">Send secure sign-in link</button>
      <div id="routeStatus" class="help"></div>
    </div>`;

    document.getElementById('routeSignIn').onclick=async()=>{
      const st=document.getElementById('routeStatus');
      st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check your email and tap the secure link to return to the handover.';
    };
    return;
  }

  const outgoingRoleOptions=[
    ['remove','No club access — remove from club'],
    ...(h.outgoing_is_player?[['player','Player only — own Player Plan']]:[]),
    ['captain','Captain'],
    ['coach','Coach'],
    ['head_coach','Head Coach'],
    ['admin','Remain a Club Admin']
  ];

  app.innerHTML=`<div class="handover-shell">
    <section class="handover-hero">
      <div class="section-label">Formal Lead Admin handover</div>
      <h1>Take over ${esc(h.club_name)}</h1>
      <p>${esc(h.outgoing_name)} is formally passing responsibility for the platform to you.</p>
    </section>

    <section class="card handover-card">
      <div class="handover-step">
        <span>1</span>
        <div>
          <strong>You become Lead Admin</strong>
          <p>You’ll receive full club administration access. Other existing Club Admins are not changed.</p>
        </div>
      </div>

      <div class="handover-step">
        <span>2</span>
        <div>
          <strong>Set ${esc(h.outgoing_name)}’s ongoing access</strong>
          <p>The outgoing Admin does not decide this themselves. You set their new role as part of accepting the handover.</p>
        </div>
      </div>

      ${h.outgoing_is_philosophy_lead?`<div class="notice"><strong>${esc(h.outgoing_name)} is also the current Philosophy Lead.</strong><br>If you remove them from the club completely, Philosophy Lead responsibility will transfer to you temporarily so the club is never stranded. You can reassign it later.</div>`:''}

      <div class="field">
        <label>Your name</label>
        <input id="handoverAcceptName" value="${esc(h.invited_name||'')}" placeholder="Full name">
      </div>

      <div class="field">
        <label>${esc(h.outgoing_name)} after handover</label>
        <select id="outgoingPostRole">
          ${outgoingRoleOptions.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}
        </select>
      </div>

      <div id="outgoingAccessBox" style="display:none">
        <div class="field">
          <label>Player Plan access</label>
          <select id="outgoingPostAccess">
            <option value="none">No additional Player Plan access</option>
            <option value="grade_view">One Playing Group · view</option>
            <option value="grade_edit">One Playing Group · view + edit</option>
            <option value="whole_view">Whole club · view</option>
            <option value="whole_edit">Whole club · view + edit</option>
          </select>
        </div>
        <div class="field" id="outgoingGradeBox" style="display:none">
          <label>Playing Group</label>
          <select id="outgoingPostGrade">
            <option value="">Choose Playing Group…</option>
            ${activeHandoverGroups.map(g=>`<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="handoverAccessExplanation" class="handover-access-explanation"></div>

      <div class="btnrow">
        <button class="btn secondary" id="acceptLeadHandover">Accept handover</button>
        <button class="btn ghost" id="handoverUseDifferentEmail">Use a different email</button>
        <span class="status" id="leadHandoverStatus"></span>
      </div>
    </section>
  </div>`;

  const refreshOutgoingAccessUI=()=>{
    const role=document.getElementById('outgoingPostRole').value;
    const accessBox=document.getElementById('outgoingAccessBox');
    const gradeBox=document.getElementById('outgoingGradeBox');
    const explain=document.getElementById('handoverAccessExplanation');

    const staffRole=['captain','coach','head_coach'].includes(role);
    accessBox.style.display=staffRole?'block':'none';

    const access=staffRole?document.getElementById('outgoingPostAccess').value:'none';
    gradeBox.style.display=staffRole && ['grade_view','grade_edit'].includes(access)?'block':'none';

    const messages={
      remove:`${h.outgoing_name} will leave ${h.club_name}. Their historical club records remain, but they will no longer be able to open the club.`,
      player:`${h.outgoing_name} will keep their own Player Plan only.`,
      captain:`${h.outgoing_name} will remain a Captain. Choose the Player Plan access they should have.`,
      coach:`${h.outgoing_name} will remain a Coach. Choose the Player Plan access they should have.`,
      head_coach:`${h.outgoing_name} will remain Head Coach. Choose the Player Plan access they should have.`,
      admin:`${h.outgoing_name} will remain a Club Admin with full club access, but you become the Lead Admin responsible for the next formal handover.`
    };
    explain.textContent=messages[role]||'';
  };

  document.getElementById('outgoingPostRole').onchange=refreshOutgoingAccessUI;
  document.getElementById('outgoingPostAccess').onchange=refreshOutgoingAccessUI;
  refreshOutgoingAccessUI();

  document.getElementById('handoverUseDifferentEmail').onclick=()=>supabase.auth.signOut();

  document.getElementById('acceptLeadHandover').onclick=async()=>{
    const st=document.getElementById('leadHandoverStatus');
    const btn=document.getElementById('acceptLeadHandover');
    const role=document.getElementById('outgoingPostRole').value;
    const access=['captain','coach','head_coach'].includes(role)
      ?document.getElementById('outgoingPostAccess').value
      :'none';
    const grade=['grade_view','grade_edit'].includes(access)
      ?document.getElementById('outgoingPostGrade').value
      :'';

    if(['grade_view','grade_edit'].includes(access) && !grade){
      st.textContent='Choose the Playing Group for this access.';
      return;
    }

    btn.disabled=true;
    btn.textContent='Completing handover…';
    st.textContent='';

    const {data:clubId,error:aErr}=await supabase.rpc('accept_lead_admin_handover',{
      p_token:token,
      p_display_name:val('handoverAcceptName'),
      p_outgoing_role:role,
      p_outgoing_access:access,
      p_outgoing_grade:grade
    });

    if(aErr){
      btn.disabled=false;
      btn.textContent='Accept handover';
      st.textContent=aErr.message;
      return;
    }

    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',clubId);
    history.replaceState({},'',location.pathname);
    await loadPlatformContext();
    currentTab='permissions';
    await loadContext();
  };
}

async function renderAdminInviteRoute(token){
  const {data:i,error}=await supabase.rpc('get_public_admin_invite',{p_token:token});
  if(error||!i){app.innerHTML=`<div class="login"><h1>Admin invitation unavailable.</h1><p>${esc(error?.message||'This invitation may have expired.')}</p></div>`;return;}
  if(i.status==='accepted'){
    app.innerHTML=`<div class="login"><div class="success-mark">✓</div><h1>Admin invitation accepted.</h1><p>Sign in normally to manage ${esc(i.club_name)}.</p><button class="btn secondary" id="goHome">Open platform</button></div>`;
    document.getElementById('goHome').onclick=()=>{history.replaceState({},'',location.pathname);routeAuth();};
    return;
  }
  if(!session){
    app.innerHTML=`<div class="login" style="max-width:640px"><div class="section-label">Club Admin invitation</div><h1>${esc(i.club_name)}</h1><p>You’ve been nominated to run the platform for the club. Sign in with the email address this invitation was sent to.</p><div class="field"><label>Your email</label><input id="routeEmail" type="email"></div><button class="btn secondary" id="routeSignIn">Send secure sign-in link</button><div id="routeStatus" class="help"></div></div>`;
    document.getElementById('routeSignIn').onclick=async()=>{
      const st=document.getElementById('routeStatus');st.textContent='Sending…';
      const e=await sendRouteMagicLink(val('routeEmail'));
      st.textContent=e?e.message:'Check your email and tap the secure link to return here.';
    };
    return;
  }

  app.innerHTML=`<div class="login" style="max-width:640px"><div class="section-label">Take over club setup</div><h1>${esc(i.club_name)}</h1><p>As Club Admin you’ll manage people and permissions. You can then nominate the Philosophy Lead — that does not have to be you.</p><p class="help">Signed in as ${esc(session.user.email||'')}. Use the email address that received this invitation.</p><div class="field"><label>Your name</label><input id="adminAcceptName" value="${esc(i.invited_name||'')}"></div><div class="btnrow"><button class="btn secondary" id="acceptAdminInvite">Accept Club Admin role</button><button class="btn ghost" id="adminUseDifferentEmail">Use a different email</button></div><div id="adminAcceptStatus" class="help" role="status" aria-live="polite"></div></div>`;
  wireProspectAccountSwitch('adminUseDifferentEmail','adminAcceptStatus');
  document.getElementById('acceptAdminInvite').onclick=async()=>{
    const st=document.getElementById('adminAcceptStatus');st.textContent='Accepting…';
    const {data,error}=await supabase.rpc('accept_club_admin_invite',{p_token:token,p_display_name:val('adminAcceptName')});
    if(error){st.textContent=error.message;return;}
    localStorage.setItem('bdp-context','club');
    localStorage.setItem('bdp-club-id',data);
    history.replaceState({},'',location.pathname);
    await loadPlatformContext();
    await loadContext();
  };
}

/* ---------------- PLATFORM ADMIN CONSOLE ---------------- */

async function renderPlatformConsole(){
  document.title='Club Batting · Platform Admin';
  if(!session){renderLogin();return;}
  await loadPlatformContext();
  if(!platformRole){await loadContext();return;}
  localStorage.setItem('bdp-context','platform');
  if(platformView==='onboarding')platformView='home';

  app.innerHTML=`${accountMenuStyles()}<div class="platform-shell">
    <header class="platform-header">
      <div><div class="section-label">Private Platform Administration</div><h1>Club Batting</h1><p>Find clubs, follow the few exceptions that need attention, and see each Club Trial through to activation.</p></div>
      <div class="header-actions">
        ${allMemberships.length?`<select id="platformContextSwitch" class="context-switch" aria-label="Switch club or platform"><option value="platform">Platform Admin</option>${allMemberships.map(m=>`<option value="${m.club_id}">${esc(m.clubs?.name||'Club')}</option>`).join('')}</select>`:''}
        ${accountMenuHtml({allowJoin:false,outId:'platformOut'})}
      </div>
    </header>
    <nav class="platform-nav">
      ${[['market','Market Discovery'],['home','Club Pipeline'],['clubs','Active Clubs'],['guide_requests','Conversation requests'],['settings','Platform Settings']].map(([k,l])=>`<button data-platform-view="${k}" class="${platformView===k?'active':''}">${l}</button>`).join('')}
    </nav>
    <main class="platform-page" id="platformPage"></main>
  </div>`;

  document.getElementById('accountPassword').onclick=openAccountPassword;
  document.getElementById('platformOut').onclick=()=>supabase.auth.signOut();
  if(document.getElementById('platformContextSwitch'))document.getElementById('platformContextSwitch').onchange=async e=>{
    if(e.target.value==='platform')return;
    localStorage.setItem('bdp-context','club');localStorage.setItem('bdp-club-id',e.target.value);await loadContext();
  };
  document.querySelectorAll('[data-platform-view]').forEach(b=>b.onclick=()=>{if(platformView==='market')savePlatformMarketScroll();platformView=b.dataset.platformView;platformSelectedProspectId=null;platformSelectedOnboardingId=null;platformOnboardingSeed=null;renderPlatformView();});
  await renderPlatformView();
}

async function renderPlatformView(){
  platformMarketRenderVersion++; // Invalidate older discovery requests before any navigation.
  document.querySelectorAll('[data-platform-view]').forEach(b=>b.classList.toggle('active',b.dataset.platformView===(platformView==='outbox'?'home':platformView)));
  if(platformView==='market')return renderPlatformMarketDiscovery();
  if(platformView==='clubs')return renderPlatformActiveClubs();
  if(platformView==='outbox')return renderPlatformOutbox();
  if(platformView==='guide_requests')return renderPlatformGuideRequests();
  if(platformView==='settings')return renderPlatformSettings();
  return renderPlatformProspects();
}

async function renderPlatformGuideRequests(){
  const page=document.getElementById('platformPage');
  page.innerHTML='<div class="splash">Loading conversation requests…</div>';
  const {data,error}=await supabase.rpc('platform_get_guide_requests');
  if(platformView!=='guide_requests')return;
  if(error){page.innerHTML=`<section class="card"><h2>Conversation requests could not load.</h2><p>${esc(error.message)}</p><button class="btn secondary" id="retryGuideRequests">Try again</button></section>`;document.getElementById('retryGuideRequests').onclick=renderPlatformGuideRequests;return;}
  page.innerHTML=`<section class="card"><div class="section-label">Club Batting Guide</div><h1>Conversation requests</h1><p>Clubs and prospects who asked to speak to someone. Read their question and Guide conversation, contact them, then mark the request resolved.</p>${!data?.length?'<div class="notice">No conversation requests are waiting.</div>':''}</section>
    ${(data||[]).map(t=>`<section class="card"><div class="section-label">${esc(new Date(t.updated_at).toLocaleString())}</div><h2>${esc(t.club_name)}</h2><p>${esc(t.reason||'The club asked to speak to someone.')}</p><p>${esc(t.contact_email||'No contact email available')}</p><details><summary>Guide conversation</summary>${(t.messages||[]).map(m=>`<p><strong>${m.role==='assistant'?'Guide':m.role==='system'?'System':'Club'}:</strong> ${esc(m.content)}</p>`).join('')||'<p>No chat messages preceded this request.</p>'}</details><div class="btnrow">${t.contact_email?`<a class="btn secondary" href="mailto:${encodeURIComponent(t.contact_email)}?subject=Club%20Batting%20conversation">Reply by email</a>`:''}<button class="btn ghost" data-close-guide-request="${esc(t.id)}">Mark resolved</button></div><div class="help" role="status" id="guide-request-${esc(t.id)}"></div></section>`).join('')}`;
  document.querySelectorAll('[data-close-guide-request]').forEach(button=>button.onclick=async()=>{
    button.disabled=true;const {error}=await supabase.rpc('platform_close_guide_request',{p_thread_id:button.dataset.closeGuideRequest});
    if(error){document.getElementById('guide-request-'+button.dataset.closeGuideRequest).textContent=error.message;button.disabled=false;return;}
    await renderPlatformGuideRequests();
  });
}

function marketResearchClubReady(club,now=Date.now()){
  if(club?.research_status!=='ready'||!['strong','possible'].includes(club.outreach_fit))return false;
  const email=String(club.contact_email||'').trim().toLowerCase();
  const contactUrl=safePublicSourceUrl(club.contact_source_url);
  const checked=Date.parse(club.research_checked_at||'');
  const evidence=Array.isArray(club.research_evidence)?club.research_evidence:[];
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!!contactUrl
    &&Number.isFinite(checked)&&checked<=now+300000&&now-checked<=90*86400000
    &&!!String(club.research_summary||'').trim()
    &&Array.isArray(club.research_uncertainties)&&club.research_uncertainties.length===0
    &&['identity','activity'].every(kind=>evidence.some(item=>item?.kind===kind&&safePublicSourceUrl(item.url)&&String(item.quote||'').trim()))
    &&evidence.some(item=>item?.kind==='contact'&&safePublicSourceUrl(item.url)===contactUrl&&String(item.email||'').trim().toLowerCase()===email&&String(item.quote||'').trim());
}

function marketResearchEvidenceHtml(club){
  const evidence=(Array.isArray(club.research_evidence)?club.research_evidence:[]).filter(item=>item&&safePublicSourceUrl(item.url)).slice(0,10);
  const uncertainties=Array.isArray(club.research_uncertainties)?club.research_uncertainties:[];
  const date=Date.parse(club.research_checked_at||'');
  const checked=Number.isFinite(date)?new Date(date).toLocaleDateString():'Not checked by research yet';
  const fallback=[club.contact_source_url,club.registry_url,club.source_url,club.website_url].map(safePublicSourceUrl).find(Boolean);
  const reason=club.metadata?.market_research_contact?.reason||club.research_contact_reason||club.contact_reason||evidence.find(item=>item.kind==='contact')?.contact_reason||'';
  return `<details class="market-evidence"><summary>${evidence.length?'Evidence and contact choice':'Recorded sources'}</summary><div class="help">Checked: ${esc(checked)}</div>
    ${reason?`<p>${esc(reason)}</p>`:''}
    ${evidence.map(item=>`<div class="market-evidence-item"><a href="${esc(safePublicSourceUrl(item.url))}" target="_blank" rel="noopener noreferrer">${esc(({identity:'Club identity',activity:'Active cricket',contact:'Published contact',fit:'Club suitability'})[item.kind]||'Public source')} ↗</a><small>${esc(String(item.quote||'').slice(0,600))}</small></div>`).join('')}
    ${!evidence.length&&fallback?`<a href="${esc(fallback)}" target="_blank" rel="noopener noreferrer">View recorded source ↗</a>`:''}
    ${!evidence.length?'<p class="help">This record has not completed the research checks.</p>':''}
    ${uncertainties.length?`<p><strong>Still uncertain</strong></p><ul>${uncertainties.map(item=>`<li>${esc(String(item))}</li>`).join('')}</ul>`:''}
    <p class="help">A published contact does not confirm that the mailbox is deliverable or that the club is interested.</p></details>`;
}

function marketResearchMoney(value){
  const n=Number(value);return `$${Number.isFinite(n)?Math.max(0,n).toFixed(4):'0.0000'}`;
}

function marketResearchJobHtml(job,canControl){
  const progress=job.progress||{};
  const status=String(job.status||'queued');
  const labels={queued:'Waiting to start',running:'Researching',paused:'Paused',paused_budget:'Paused at spending limit',completed:'Research complete',cancelled:'Cancelled',failed:'Research stopped'};
  const checked=Number(progress.researched||0),target=Number(job.target_count||25);
  const failures=Number(progress.failed||0);
  const contactCount=Number(job.contact_counts?.named||0)+Number(job.contact_counts?.general||0);
  const heading=status==='completed'&&failures>0?(checked>0?'Research finished with issues':'Research stopped — no clubs researched'):(status==='completed'&&checked>0&&contactCount===0?'Research finished — no verified email contacts':(labels[status]||status));
  const taskErrors=(Array.isArray(job.task_errors)?job.task_errors:[]).slice(0,5);
  const consumed=Number(job.spent_usd||0)+Number(job.reserved_usd||0);
  const limit=Number(job.budget_usd||0);
  const used=limit>0?Math.min(100,Math.max(0,consumed/limit*100)):0;
  return `<article class="market-research-job" data-market-research-job="${esc(job.id)}">
    <div class="admin-card-head"><div><strong>${esc(heading)}</strong><div class="help">${esc(new Date(job.created_at).toLocaleString())} · up to ${target} clubs</div></div><span class="status-pill">${Number(progress.ready||0)} ready to review</span></div>
    <p class="help">${checked} researched · ${Number(progress.needs_review||0)} uncertain · ${Number(progress.not_suitable||0)} not suitable${failures?` · ${failures} research ${failures===1?'task':'tasks'} failed`:''}${Number(progress.pending||0)+Number(progress.running||0)?` · ${Number(progress.pending||0)+Number(progress.running||0)} tasks remaining`:''}</p>
    <p class="help">Contacts in current findings: ${Number(job.contact_counts?.named||0)} named people · ${Math.max(0,Number(job.contact_counts?.general||0))} general club contacts.</p>
    <div class="market-budget-track" role="progressbar" aria-label="Research budget accounted for" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(used)}"><span style="width:${used}%"></span></div>
    <p class="help">${marketResearchMoney(job.spent_usd)} recorded usage + ${marketResearchMoney(job.reserved_usd)} held for calls = ${marketResearchMoney(consumed)} of ${marketResearchMoney(limit)} USD limit.</p>
    ${Number(job.reserved_usd||0)>0?'<p class="help">Held amounts include calls whose final charge is not yet known. They still count towards this limit.</p>':''}
    ${job.last_error?`<p class="notice">${esc(job.last_error)}</p>`:''}
    ${taskErrors.length?`<details${checked===0?' open':''}><summary>What stopped the research?</summary><ul>${taskErrors.map(item=>`<li><strong>${item.kind==='discover'?'Finding clubs':'Checking a club'}</strong>: ${esc(item.message||'No failure detail was saved.')}</li>`).join('')}</ul></details>`:''}
    <div class="btnrow"><button class="btn ghost compact" data-market-job-review="${esc(job.id)}">Review this batch</button>
    ${canControl&&['queued','running'].includes(status)?`<button class="btn ghost compact" data-market-job-control="pause" data-job-id="${esc(job.id)}">Pause</button>`:''}
    ${canControl&&['paused','paused_budget'].includes(status)?`<label class="help">New total limit (USD, optional)<input type="number" min="${limit}" max="50" step="0.01" data-market-job-budget="${esc(job.id)}" aria-label="New total budget in USD for this batch" placeholder="Keep ${limit.toFixed(2)}" style="max-width:150px"></label><button class="btn secondary compact" data-market-job-control="resume" data-job-id="${esc(job.id)}">Resume</button>`:''}
    ${canControl&&['queued','running','paused','paused_budget'].includes(status)?`<button class="btn ghost compact" data-market-job-control="cancel" data-job-id="${esc(job.id)}">Cancel research</button>`:''}</div>
  </article>`;
}

async function invokeMarketResearch(body){
  const {data,error}=await supabase.functions.invoke('market-research',{body});
  if(error||data?.error){
    let message=data?.error||error?.message||'Research request failed.';
    if(error?.context?.json){try{const detail=await error.context.json();if(detail?.error)message=detail.error;}catch{}}
    throw new Error(message);
  }
  return data||{};
}

async function renderPlatformMarketDiscovery(options={}){
  const page=document.getElementById('platformPage');
  if(!page)return;
  const renderVersion=++platformMarketRenderVersion;
  const isCurrent=()=>platformView==='market'&&renderVersion===platformMarketRenderVersion&&document.getElementById('platformPage')===page;
  page.innerHTML='<div class="splash">Loading prospect findings…</div>';
  platformMarketScrollSuppressed=true;
  const countryCode='AU',regionCode='NSW';
  const [associationRes,clubRes,linkRes,scanRes,researchRes]=await Promise.all([
    loadAllPlatformRows(()=>supabase.from('market_associations').select('*').eq('country_code',countryCode).eq('region_code',regionCode).order('name').order('id')),
    loadAllPlatformRows(()=>supabase.from('market_clubs').select('*').eq('country_code',countryCode).eq('region_code',regionCode).order('name').order('id')),
    loadAllPlatformRows(()=>supabase.from('market_club_associations').select('*').order('club_id').order('association_id')),
    supabase.from('market_scan_runs').select('*').eq('country_code',countryCode).eq('region_code',regionCode).order('started_at',{ascending:false}).limit(30),
    invokeMarketResearch({action:'status'}).then(data=>({data}))
  ].map(request=>Promise.resolve(request).catch(error=>({error}))));
  if(!isCurrent())return;
  const loadError=associationRes.error||clubRes.error||linkRes.error||scanRes.error;
  if(loadError){
    platformMarketScrollSuppressed=false;
    page.innerHTML=`<div class="notice"><strong>Market Discovery could not load.</strong><br>${esc(loadError.message)}<div class="btnrow"><button class="btn ghost" id="retryMarketLoad">Try again</button></div></div>`;
    document.getElementById('retryMarketLoad').onclick=()=>renderPlatformMarketDiscovery(options);
    return;
  }
  const associations=associationRes.data||[],clubs=clubRes.data||[],links=linkRes.data||[],scans=scanRes.data||[];
  const research=researchRes.data||{};
  const readiness=Array.isArray(research.readiness)?research.readiness:[];
  const configured=!researchRes.error&&research.configured===true&&readiness.length>0&&readiness.every(item=>item.ready===true);
  const canControl=['owner','commercial_admin','support_admin'].includes(platformRole);
  const jobs=(Array.isArray(research.jobs)?research.jobs:[]).slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(job=>{
    const batchClubs=clubs.filter(club=>club.research_job_id===job.id&&club.research_checked_at);
    const contacts=batchClubs.filter(club=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(club.contact_email||'').trim()));
    const named=contacts.filter(club=>{
      if(!String(club.contact_name||'').trim())return false;
      const contactType=club.metadata?.market_research_contact?.type;
      if(contactType)return contactType==='named_person';
      const email=String(club.contact_email||'').trim().toLowerCase();
      return (Array.isArray(club.research_evidence)?club.research_evidence:[]).some(item=>item.kind==='contact'&&item.contact_type==='named_person'&&safePublicSourceUrl(item.url)===safePublicSourceUrl(club.contact_source_url)&&!!safePublicSourceUrl(item.url)&&String(item.email||'').trim().toLowerCase()===email&&String(item.quote||'').includes(String(club.contact_name).trim()));
    }).length;
    return {...job,contact_counts:{named,general:Math.max(0,contacts.length-named)}};
  });
  const associationById=new Map(associations.map(a=>[a.id,a]));
  const associationNamesByClub=new Map(),clubIdsByAssociation=new Map();
  links.forEach(link=>{
    const association=associationById.get(link.association_id);
    if(association){if(!associationNamesByClub.has(link.club_id))associationNamesByClub.set(link.club_id,[]);associationNamesByClub.get(link.club_id).push(association.name);}
    if(!clubIdsByAssociation.has(link.association_id))clubIdsByAssociation.set(link.association_id,[]);
    clubIdsByAssociation.get(link.association_id).push(link.club_id);
  });
  const reviewStatus=club=>club.sales_prospect_id&&club.prospect_review_status!=='invited'?'in_pipeline':(club.prospect_review_status||'pending');
  const isReady=club=>reviewStatus(club)==='pending'&&marketResearchClubReady(club);
  const isLegacy=club=>!club.research_status||club.research_status==='unresearched';
  const pending=clubs.filter(c=>reviewStatus(c)==='pending'),ready=pending.filter(isReady);
  const uncertain=pending.filter(c=>!isLegacy(c)&&!isReady(c));
  const legacy=pending.filter(isLegacy);
  const invited=clubs.filter(c=>['invited','in_pipeline'].includes(reviewStatus(c))),excluded=clubs.filter(c=>reviewStatus(c)==='do_not_invite');
  const latestRegionScan=scans.find(s=>s.scope_type==='region');
  const researchStatusLabel=club=>isReady(club)?'Ready to review':isLegacy(club)?'Not researched':({ready:'Research needs refreshing',needs_review:'Needs more evidence',not_suitable:'Not suitable',duplicate:'Duplicate',suppressed:'Do not contact'})[club.research_status]||'Needs more evidence';
  const draft=platformMarketResearchDraft;

  page.innerHTML=`<style>
    #marketClubInventory{max-width:none}#marketClubInventory td{overflow-wrap:anywhere}
    #marketClubInventory input[type="checkbox"]{width:18px;height:18px;accent-color:var(--navy2);cursor:pointer}
    #marketClubInventory tr.market-club-selected{background:#eef3ff}
    #marketClubInventory .prospect-filter-row>*{min-width:0;max-width:100%}
    .market-research-form{display:grid;grid-template-columns:1fr 1fr .6fr .7fr;gap:14px;margin:16px 0}
    .market-research-form label{display:block;font-weight:700;margin-bottom:6px}
    .market-research-form input,.market-research-form select{width:100%;box-sizing:border-box}
    .market-research-job{padding:16px 0;border-top:1px solid var(--line,#e0e4ec)}
    .market-budget-track{height:6px;border-radius:6px;background:#e9edf6;overflow:hidden}.market-budget-track span{display:block;height:100%;background:var(--navy2,#283177)}
    .market-evidence{min-width:160px;max-width:370px}.market-evidence summary{cursor:pointer;font-weight:700}.market-evidence-item{margin-top:12px}.market-evidence-item small{display:block}
    @media(max-width:750px){.market-research-form{grid-template-columns:1fr 1fr}}
    @media(max-width:440px){.market-research-form{grid-template-columns:1fr}}
  </style>
  <section class="admin-card" style="margin-bottom:16px">
    <div class="admin-card-head"><div><div class="section-label">Market Discovery</div><h2>Find clubs worth approaching</h2><p class="help">Research identifies clubs, checks public contacts and explains why each club may suit Club Batting. You choose who receives the introductory outreach email.</p></div></div>
    <div class="market-research-form">
      <div><label for="marketResearchMarket">Research area</label><select id="marketResearchMarket"><option value="AU:NSW">Australia · New South Wales</option></select></div>
      <div><label for="marketResearchAssociation">Association</label><select id="marketResearchAssociation"><option value="">Across New South Wales</option>${associations.map(a=>`<option value="${esc(a.id)}" ${draft.associationId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
      <div><label for="marketResearchTarget">Clubs to research</label><input id="marketResearchTarget" type="number" min="1" max="25" step="1" value="${esc(draft.targetCount)}"></div>
      <div><label for="marketResearchBudget">Spending limit (USD)</label><input id="marketResearchBudget" type="number" min="0.01" max="50" step="0.01" placeholder="Enter a limit" value="${esc(draft.budgetUsd)}"></div>
    </div>
    <p class="help">Research worker v${esc(research.version||'not reported')}. Start with up to 25 clubs. The limit covers recorded research API usage and amounts held for calls; other hosting charges are separate. Research continues in the background after you leave this page.</p>
    <div class="btnrow"><button class="btn secondary" id="startMarketResearch" ${configured&&canControl&&!platformMarketResearchStartBusy?'':'disabled'}>${platformMarketResearchStartBusy?'Starting…':'Start research'}</button><button class="btn ghost compact" id="refreshMarketResearch">Refresh progress</button><span class="status-pill">${configured?'Research is configured':'Research setup needs attention'}</span></div>
    <div id="marketResearchActionStatus" class="help" role="status" aria-live="polite">${esc(platformMarketResearchMessage)}</div>
    <div style="margin-top:12px"><button class="btn ghost compact" id="checkMarketSources">Check website access</button><span class="help"> Reads the NDCA and Belmont websites. No search or AI calls.</span></div>
    <div id="marketSourceCheckResult" role="status" aria-live="polite"></div>
    ${!canControl?'<p class="notice">Your platform role can view research. A Platform Owner, Commercial Admin or Support Admin can start and manage it.</p>':''}
    ${researchRes.error?`<p class="notice">Research status could not be checked: ${esc(researchRes.error.message)}. Refresh to retry; saved prospects are shown below.</p>`:''}
    <details ${configured?'':'open'} style="margin-top:12px"><summary>Research setup${configured?'':' · complete these checks before starting'}</summary><ul>${readiness.map(item=>`<li>${item.ready?'✓':'○'} <strong>${esc(item.label||item.key)}</strong>${item.message?` — ${esc(item.message)}`:''}</li>`).join('')||'<li>Deploy and configure Market Research, then refresh this page.</li>'}</ul>${research.pricing?.model?`<p class="help">Research model: ${esc(research.pricing.model)}. Budget uses configured provider rates in USD.</p>`:''}</details>
  </section>
  ${jobs.length?`<section class="admin-card" style="margin-bottom:16px"><div class="section-label">Latest research batch</div>${marketResearchJobHtml(jobs[0],canControl)}${jobs.length>1?`<details><summary>Previous research batches (${jobs.length-1})</summary>${jobs.slice(1).map(job=>marketResearchJobHtml(job,canControl)).join('')}</details>`:''}<p class="help">Pause and cancel stop new work. An already running provider call may finish and still count towards the limit. Refresh progress to see saved updates.</p></section>`:''}
  <section class="admin-card form-wide" id="marketClubInventory">
    <div class="admin-card-head"><div><div class="section-label">Your shortlist</div><h2>Choose the clubs to approach</h2><p class="help">Select all applies to the list shown. Untick any exceptions, then send outreach. Research never sends email on its own.</p></div></div>
    <div class="btnrow" style="margin-top:12px"><span class="status-pill">${ready.length} ready to review</span><span class="status-pill">${uncertain.length} need review</span><span class="status-pill">${legacy.length} not researched</span><span class="status-pill">${invited.length} in Club Pipeline</span><span class="status-pill">${excluded.length} do not invite</span></div>
    <div class="prospect-filter-row" style="margin-top:14px">
      <input id="marketProspectSearch" value="${esc(platformMarketClubSearch)}" aria-label="Search prospects" placeholder="Search club, place, association or contact">
      <select id="marketReviewFilter" aria-label="Research and review status">${[['ready','Research ready'],['all','All findings'],['research','Needs review / uncertain'],['unresearched','Not researched yet'],['pending','All undecided'],['invited','In Club Pipeline'],['do_not_invite','Do not invite']].map(([value,label])=>`<option value="${value}" ${platformMarketReviewFilter===value?'selected':''}>${label}</option>`).join('')}</select>
      <select id="marketAssociationFilter" aria-label="Filter prospects by association"><option value="">All associations</option>${associations.map(a=>`<option value="${esc(a.id)}" ${platformMarketAssociationFilter===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select>
      <select id="marketResearchJobFilter" aria-label="Filter prospects by research batch"><option value="">All research batches</option>${jobs.map(job=>`<option value="${esc(job.id)}" ${platformMarketResearchJobFilter===job.id?'selected':''}>${esc(new Date(job.created_at).toLocaleString())} · ${Number(job.target_count||25)} clubs</option>`).join('')}</select>
    </div>
    <div class="market-club-toolbar" style="margin-top:12px"><div class="market-selection-actions"><button class="btn ghost compact" id="selectAllMarketProspects">Select all</button><button class="btn ghost compact" id="clearMarketProspectSelection">Clear</button><button class="btn secondary compact" id="inviteSelectedMarketProspects" disabled>Send outreach</button><button class="btn ghost compact" id="excludeSelectedMarketProspects" disabled>Do not invite</button><button class="btn ghost compact" id="restoreSelectedMarketProspects" disabled>Return to review</button></div><div class="market-selection-summary"><span id="marketProspectSelectionCount" class="help">0 selected</span><span id="marketProspectShownCount" class="help"></span></div></div>
    <div id="marketProspectActionStatus" class="market-progress" role="status" aria-live="polite">${esc(platformMarketActionMessage)}</div>
    <div class="admin-table-wrap" style="margin-top:12px"><table class="admin-table"><thead><tr><th style="width:44px"><input id="marketSelectAllCheckbox" type="checkbox" aria-label="Select all shown clubs"></th><th>Club</th><th>Association</th><th>Who to contact</th><th>Why this club?</th><th>Evidence</th></tr></thead><tbody id="marketProspectTableBody"></tbody></table></div>
  </section>
  <details class="admin-card form-wide" style="margin-top:16px"><summary><div><div class="section-label">Existing discovery tools</div><h2>Association mapping and contact refresh</h2><p>These earlier tools maintain the NSW directory. Their records remain Not researched until they complete the new research checks.</p></div><span>⌄</span></summary><div class="collapsible-admin-body"><div class="btnrow" style="margin-top:16px"><button class="btn ghost compact" id="scanMarketRegion">Refresh association map</button><button class="btn ghost compact" id="scanAllAssociations" ${associations.length?'':'disabled'}>Map and sync all</button><button class="btn ghost compact" id="enrichAllContacts" ${clubs.length?'':'disabled'}>Sync public contacts</button></div><div id="marketDiscoveryStatus" class="help">Last association scan: ${esc(latestRegionScan?.finished_at||latestRegionScan?.started_at?new Date(latestRegionScan.finished_at||latestRegionScan.started_at).toLocaleString():'Not run yet')}</div></div></details>`;

  const clubsById=new Map(clubs.map(c=>[c.id,c]));
  const renderProspectRows=()=>{
    if(!isCurrent())return;
    const q=String(platformMarketClubSearch||'').trim().toLowerCase();
    const associationClubIds=platformMarketAssociationFilter?new Set(clubIdsByAssociation.get(platformMarketAssociationFilter)||[]):null;
    const shown=clubs.filter(club=>{
      const status=reviewStatus(club);
      if(platformMarketReviewFilter==='ready'&&!isReady(club))return false;
      if(platformMarketReviewFilter==='research'&&!(status==='pending'&&!isLegacy(club)&&!isReady(club)))return false;
      if(platformMarketReviewFilter==='unresearched'&&!(status==='pending'&&isLegacy(club)))return false;
      if(platformMarketReviewFilter==='pending'&&status!=='pending')return false;
      if(platformMarketReviewFilter==='invited'&&!['invited','in_pipeline'].includes(status))return false;
      if(platformMarketReviewFilter==='do_not_invite'&&status!=='do_not_invite')return false;
      if(platformMarketResearchJobFilter&&club.research_job_id!==platformMarketResearchJobFilter)return false;
      if(associationClubIds&&!associationClubIds.has(club.id))return false;
      return !q||[club.name,club.locality,club.region_name,club.contact_name,club.contact_role,club.contact_email,club.research_summary,club.qualification_reason,(associationNamesByClub.get(club.id)||[]).join(' ')].some(value=>String(value||'').toLowerCase().includes(q));
    }).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    const selectable=shown.filter(club=>['pending','do_not_invite'].includes(reviewStatus(club)));
    const selectableIds=new Set(selectable.map(club=>club.id));
    for(const id of [...platformMarketSelectedClubIds])if(!selectableIds.has(id))platformMarketSelectedClubIds.delete(id);
    document.getElementById('marketProspectTableBody').innerHTML=shown.length?shown.map(club=>{
      const status=reviewStatus(club),selected=platformMarketSelectedClubIds.has(club.id);
      const associationsForClub=associationNamesByClub.get(club.id)||[];
      const contactEvidence=(Array.isArray(club.research_evidence)?club.research_evidence:[]).find(item=>item.kind==='contact');
      const person=(club.metadata?.market_research_contact?.type||club.research_contact_type||club.contact_type||contactEvidence?.contact_type)==='general'?'':String(club.contact_name||'').trim();
      const reason=club.research_summary||club.qualification_reason||'No research recommendation yet.';
      return `<tr class="${selected?'market-club-selected':''}"><td><input type="checkbox" data-market-prospect-select="${esc(club.id)}" ${selected?'checked':''} ${['invited','in_pipeline'].includes(status)?'disabled':''} aria-label="Select ${esc(club.name)}"></td>
      <td><strong>${esc(club.name)}</strong><small>${esc([club.locality,club.region_name].filter(Boolean).join(', ')||'Location not recorded')}</small></td>
      <td>${esc(associationsForClub.slice(0,2).join(' · ')||'Association not recorded')}${associationsForClub.length>2?`<small>+${associationsForClub.length-2} more</small>`:''}</td>
      <td><strong>${esc(person||'General club contact')}</strong><small>${esc(person?(club.contact_role||'Published club contact'):'Person not identified')}</small>${club.contact_email?`<small>${esc(club.contact_email)}</small>`:'<span class="status-pill">Email needed</span>'}</td>
      <td><span class="status-pill">${esc(researchStatusLabel(club))}</span><small>${esc(reason)}</small></td><td>${marketResearchEvidenceHtml(club)}</td></tr>`;
    }).join(''):`<tr><td colspan="6">${platformMarketReviewFilter==='ready'?'No research-ready clubs in this view. Start a batch above or check Needs review / uncertain.':'No clubs match this view.'}</td></tr>`;
    document.getElementById('marketProspectShownCount').textContent=`${shown.length} shown`;
    const syncSelectionUi=()=>{
      page.querySelectorAll('[data-market-prospect-select]').forEach(checkbox=>{checkbox.checked=platformMarketSelectedClubIds.has(checkbox.dataset.marketProspectSelect);checkbox.closest('tr')?.classList.toggle('market-club-selected',checkbox.checked);});
      const selected=[...platformMarketSelectedClubIds].map(id=>clubsById.get(id)).filter(Boolean),count=selected.length;
      const selectedPending=selected.filter(club=>reviewStatus(club)==='pending'),selectedExcluded=selected.filter(club=>reviewStatus(club)==='do_not_invite');
      const allInvitable=selectedPending.length===count&&selected.every(isReady);
      const selectedShown=selectable.filter(club=>platformMarketSelectedClubIds.has(club.id)).length,allBox=document.getElementById('marketSelectAllCheckbox');
      allBox.checked=selectable.length>0&&selectedShown===selectable.length;allBox.indeterminate=selectedShown>0&&selectedShown<selectable.length;allBox.disabled=selectable.length===0;
      document.getElementById('marketProspectSelectionCount').textContent=`${count} selected${count&&!allInvitable&&selectedPending.length?' · outreach requires current, complete research and a sourced contact':''}`;
      document.getElementById('selectAllMarketProspects').disabled=selectable.length===0;
      document.getElementById('clearMarketProspectSelection').disabled=count===0;
      document.getElementById('inviteSelectedMarketProspects').disabled=count===0||!allInvitable||!canControl;
      document.getElementById('inviteSelectedMarketProspects').style.display=platformMarketReviewFilter==='do_not_invite'?'none':'';
      document.getElementById('excludeSelectedMarketProspects').disabled=selectedPending.length!==count||count===0||!canControl;
      document.getElementById('excludeSelectedMarketProspects').style.display=['do_not_invite','invited'].includes(platformMarketReviewFilter)?'none':'';
      document.getElementById('restoreSelectedMarketProspects').disabled=selectedExcluded.length!==count||count===0||!canControl;
      document.getElementById('restoreSelectedMarketProspects').style.display=platformMarketReviewFilter==='do_not_invite'?'':'none';
    };
    page.querySelectorAll('[data-market-prospect-select]').forEach(checkbox=>checkbox.onchange=()=>{if(checkbox.checked)platformMarketSelectedClubIds.add(checkbox.dataset.marketProspectSelect);else platformMarketSelectedClubIds.delete(checkbox.dataset.marketProspectSelect);syncSelectionUi();});
    const selectAll=()=>{selectable.forEach(club=>platformMarketSelectedClubIds.add(club.id));syncSelectionUi();};
    document.getElementById('selectAllMarketProspects').onclick=selectAll;
    document.getElementById('marketSelectAllCheckbox').onchange=event=>{if(event.target.checked)selectAll();else{selectable.forEach(club=>platformMarketSelectedClubIds.delete(club.id));syncSelectionUi();}};
    document.getElementById('clearMarketProspectSelection').onclick=()=>{platformMarketSelectedClubIds.clear();syncSelectionUi();};
    syncSelectionUi();
  };
  document.getElementById('marketProspectSearch').oninput=event=>{platformMarketClubSearch=String(event.target.value||'');platformMarketSelectedClubIds.clear();renderProspectRows();};
  document.getElementById('marketReviewFilter').onchange=event=>{platformMarketReviewFilter=event.target.value;platformMarketSelectedClubIds.clear();renderProspectRows();};
  document.getElementById('marketAssociationFilter').onchange=event=>{platformMarketAssociationFilter=event.target.value;platformMarketSelectedClubIds.clear();renderProspectRows();};
  document.getElementById('marketResearchJobFilter').onchange=event=>{platformMarketResearchJobFilter=event.target.value;platformMarketSelectedClubIds.clear();renderProspectRows();};
  document.getElementById('marketResearchAssociation').onchange=event=>{draft.associationId=event.target.value;};
  document.getElementById('marketResearchTarget').oninput=event=>{draft.targetCount=event.target.value;};
  document.getElementById('marketResearchBudget').oninput=event=>{draft.budgetUsd=event.target.value;};
  document.getElementById('refreshMarketResearch').onclick=()=>{savePlatformMarketScroll();return renderPlatformMarketDiscovery();};
  document.getElementById('checkMarketSources').onclick=async()=>{
    const button=document.getElementById('checkMarketSources'),output=document.getElementById('marketSourceCheckResult');
    if(button.disabled||!isCurrent())return;
    button.disabled=true;output.textContent='Checking two public websites. No research batch is being started…';
    try{
      const result=await invokeMarketResearch({action:'check_sources'});
      if(!isCurrent())return;
      if(!Array.isArray(result?.results))throw new Error('Deploy research worker v0.8.57.3 to use this check.');
      const passed=result.results.filter(item=>item.ok).length;
      output.innerHTML=`<p><strong>${passed} of ${result.results.length} websites read successfully.</strong> No Brave or OpenAI calls were made.</p><p class="help">Worker v${esc(result.version)}. This checks page access, not contact accuracy. Share the diagnostic details below before starting another batch.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%">${esc(JSON.stringify(result.results,null,2))}</pre>`;
    }catch(error){output.textContent=error.message||'The website-access check could not complete.';}
    finally{button.disabled=false;}
  };
  document.getElementById('startMarketResearch').onclick=async()=>{
    if(platformMarketResearchStartBusy||!configured||!canControl||!isCurrent())return;
    const status=document.getElementById('marketResearchActionStatus'),button=document.getElementById('startMarketResearch');
    const target=Number(document.getElementById('marketResearchTarget').value),budget=Number(document.getElementById('marketResearchBudget').value);
    if(!Number.isInteger(target)||target<1||target>25){status.textContent='Choose between 1 and 25 clubs for this research batch.';return;}
    if(!Number.isFinite(budget)||budget<0.01||budget>50){status.textContent='Enter a spending limit between 0.01 and 50 USD before starting.';return;}
    const body={action:'start',country_code:countryCode,region_code:regionCode,association_id:document.getElementById('marketResearchAssociation').value||null,target_count:target,budget_usd:budget};
    const signature=JSON.stringify(body);
    const requestStorageKey=`bdp-market-research-start-${session?.user?.id||'unknown'}`;
    if(!platformMarketResearchStartRequest){try{
      const saved=JSON.parse(sessionStorage.getItem(requestStorageKey)||'null');
      if(saved?.signature&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.key||''))platformMarketResearchStartRequest=saved;
    }catch{}}
    if(!platformMarketResearchStartRequest||platformMarketResearchStartRequest.signature!==signature){
      const id=globalThis.crypto?.randomUUID?.();
      if(!id){status.textContent='A secure request ID could not be created. Reload this page in a secure browser connection.';return;}
      platformMarketResearchStartRequest={signature,key:id};
    }
    try{sessionStorage.setItem(requestStorageKey,JSON.stringify(platformMarketResearchStartRequest));}catch{}
    body.idempotency_key=platformMarketResearchStartRequest.key;
    platformMarketResearchStartBusy=true;button.disabled=true;button.textContent='Starting…';status.textContent='Saving this research batch…';
    try{
      const result=await invokeMarketResearch(body);
      if(!result.job?.id)throw new Error('The server did not confirm a saved research batch.');
      try{sessionStorage.removeItem(requestStorageKey);}catch{}
      platformMarketResearchStartRequest=null;platformMarketResearchStartBusy=false;draft.budgetUsd='';platformMarketResearchJobFilter=result.job.id;
      platformMarketResearchMessage='Research batch saved. Work continues in the background. Refresh progress to see the findings.';
      if(isCurrent())await renderPlatformMarketDiscovery({restoreScroll:false});
    }catch(error){platformMarketResearchMessage=`Start was not confirmed: ${error.message} Retry with the same details to reuse this request.`;if(isCurrent())status.textContent=platformMarketResearchMessage;}
    finally{platformMarketResearchStartBusy=false;if(isCurrent()){button.disabled=false;button.textContent='Start research';}}
  };
  page.querySelectorAll('[data-market-job-review]').forEach(button=>button.onclick=()=>{platformMarketResearchJobFilter=button.dataset.marketJobReview;platformMarketReviewFilter='all';platformMarketClubSearch='';platformMarketAssociationFilter='';platformMarketSelectedClubIds.clear();document.getElementById('marketResearchJobFilter').value=platformMarketResearchJobFilter;document.getElementById('marketReviewFilter').value='all';document.getElementById('marketProspectSearch').value='';document.getElementById('marketAssociationFilter').value='';renderProspectRows();document.getElementById('marketClubInventory').scrollIntoView({behavior:'smooth',block:'start'});});
  let controlBusy=false;
  page.querySelectorAll('[data-market-job-control]').forEach(button=>button.onclick=async()=>{
    if(controlBusy||!canControl||!isCurrent())return;
    const job=jobs.find(item=>item.id===button.dataset.jobId),command=button.dataset.marketJobControl;
    if(!job)return;
    const body={action:'control',job_id:job.id,command};
    const status=document.getElementById('marketResearchActionStatus');
    const budgetInput=page.querySelector(`[data-market-job-budget="${job.id}"]`);
    if(command==='resume'&&budgetInput?.value){const budget=Number(budgetInput.value);if(!Number.isFinite(budget)||budget<Number(job.budget_usd)||budget>50){status.textContent='The new total limit must be at least the existing limit and no more than 50 USD.';return;}body.budget_usd=budget;}
    controlBusy=true;button.disabled=true;
    try{await invokeMarketResearch(body);platformMarketResearchMessage=({pause:'Research paused. Existing findings remain available.',resume:'Research resumed.',cancel:'Research cancelled. Existing findings remain available.'})[command];if(isCurrent())await renderPlatformMarketDiscovery({restoreScroll:false});}
    catch(error){if(isCurrent())status.textContent=error.message;}
    finally{controlBusy=false;if(isCurrent())button.disabled=false;}
  });
  let reviewBusy=false;
  const runReviewAction=async(rpcName)=>{
    if(reviewBusy)return null;
    reviewBusy=true;
    page.querySelectorAll('#marketClubInventory button, #marketClubInventory input, #marketClubInventory select').forEach(control=>control.disabled=true);
    const totals={invited:0,queued:0,already_contacted:0,in_pipeline:0,needs_contact:0,blocked:0,updated:0,errors:[]};
    const ids=[...platformMarketSelectedClubIds];
    try{
      for(let offset=0;offset<ids.length;offset+=1000){
        const {data,error}=await supabase.rpc(rpcName,{p_market_club_ids:ids.slice(offset,offset+1000)});
        if(error)throw error;
        for(const key of ['invited','queued','already_contacted','in_pipeline','needs_contact','blocked','updated'])totals[key]+=Number(data?.[key]||0);
        totals.errors.push(...(data?.errors||[]));
      }
      return totals;
    }catch(error){
      platformMarketActionMessage=`The action stopped: ${error.message}. Any earlier completed batches are retained; review the refreshed list before trying again.`;
      return null;
    }finally{reviewBusy=false;}
  };

  document.getElementById('inviteSelectedMarketProspects').onclick=async()=>{
    if(reviewBusy||!canControl||!isCurrent())return;
    const ids=[...platformMarketSelectedClubIds];
    if(!ids.length||!ids.every(id=>isReady(clubsById.get(id))))return;
    if(!confirm(`Send outreach to ${ids.length} selected club${ids.length===1?'':'s'}? This queues their introductory emails and adds them to Club Pipeline.`))return;
    const button=document.getElementById('inviteSelectedMarketProspects');
    const status=document.getElementById('marketProspectActionStatus');
    button.disabled=true;button.textContent='Queuing outreach…';status.textContent='Creating prospects and queuing introductory emails…';
    const data=await runReviewAction('platform_invite_market_clubs');
    if(data){
      platformMarketSelectedClubIds=new Set(data.errors.map(item=>item.market_club_id).filter(Boolean));
      const invitedCount=data.invited,queuedCount=data.queued,existingCount=data.already_contacted,blockedCount=data.blocked;
      platformMarketActionMessage=`${invitedCount} club${invitedCount===1?'':'s'} approved · ${queuedCount} introductory email${queuedCount===1?'':'s'} queued${existingCount?` · ${existingCount} already had an introduction`:''}${data.in_pipeline?` · ${data.in_pipeline} already in the pipeline`:''}${data.needs_contact?` · ${data.needs_contact} need a sourced contact`:''}${blockedCount?` · ${blockedCount} could not receive outreach`:''}.`;
      if(data.errors.length)platformMarketActionMessage+=' '+data.errors.map(item=>`${item.club_name}: ${item.error}`).join(' · ');
    }
    if(isCurrent())await renderPlatformMarketDiscovery({restoreScroll:false});
  };
  document.getElementById('excludeSelectedMarketProspects').onclick=async()=>{
    if(reviewBusy||!canControl||!isCurrent())return;
    const ids=[...platformMarketSelectedClubIds];
    if(!ids.length)return;
    if(!confirm(`Mark ${ids.length} selected club${ids.length===1?'':'s'} as Do not invite? The decision will be retained so the clubs do not return to this review list.`))return;
    const status=document.getElementById('marketProspectActionStatus');status.textContent='Saving the review decision…';
    const data=await runReviewAction('platform_mark_market_clubs_do_not_invite');
    if(data){platformMarketSelectedClubIds.clear();const changed=data.updated;platformMarketActionMessage=`${changed} club${changed===1?'':'s'} marked Do not invite.`;}
    if(isCurrent())await renderPlatformMarketDiscovery({restoreScroll:false});
  };
  document.getElementById('restoreSelectedMarketProspects').onclick=async()=>{
    if(reviewBusy||!canControl||!isCurrent())return;
    const ids=[...platformMarketSelectedClubIds];
    if(!ids.length)return;
    const data=await runReviewAction('platform_restore_market_clubs_to_review');
    if(data){platformMarketSelectedClubIds.clear();const restored=data.updated;platformMarketActionMessage=`Returned ${restored} club${restored===1?'':'s'} to review.`;}
    if(isCurrent())await renderPlatformMarketDiscovery({restoreScroll:false});
  };

  const invokeDiscovery=async body=>{
    const {data,error}=await supabase.functions.invoke('discover-clubs',{body});
    if(error||data?.error)throw new Error(data?.error||error?.message||'Market discovery failed.');
    return data;
  };
  const scanAssociation=async id=>invokeDiscovery({action:'scan_association',association_id:id});
  const enrichAssociation=async(id,maxBatches=10)=>{
    const syncToken=globalThis.crypto?.randomUUID?.()||`sync-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    let contacts=0,remaining=1,batches=0;
    while(remaining>0&&batches<maxBatches){
      const data=await invokeDiscovery({action:'enrich_clubs',association_id:id,limit:6,sync_token:syncToken});
      contacts+=Number(data.contacts_found||0);remaining=Number(data.remaining||0);batches++;
      if(Number(data.processed||0)===0)break;
    }
    return contacts;
  };
  if(!canControl)for(const id of ['scanMarketRegion','scanAllAssociations','enrichAllContacts'])document.getElementById(id).disabled=true;
  document.getElementById('scanMarketRegion').onclick=async()=>{
    if(!canControl||!isCurrent())return;
    const button=document.getElementById('scanMarketRegion'),status=document.getElementById('marketDiscoveryStatus');
    button.disabled=true;button.textContent='Refreshing…';status.textContent='Refreshing the NSW association map…';
    try{const data=await invokeDiscovery({action:'scan_region',country_code:countryCode,region_code:regionCode});platformMarketActionMessage=`Association map refreshed · ${Number(data.associations_discovered||0)} records found.`;if(isCurrent())await renderPlatformMarketDiscovery({restoreScroll:false});}
    catch(error){button.disabled=false;button.textContent='Refresh association map';status.textContent=error.message;}
  };
  document.getElementById('scanAllAssociations').onclick=async()=>{
    if(!canControl||!isCurrent())return;
    if(!confirm(`Map clubs and sync public contacts for all ${associations.length} NSW association records? This can take several minutes.`))return;
    const button=document.getElementById('scanAllAssociations'),status=document.getElementById('marketDiscoveryStatus');button.disabled=true;
    let completed=0,failed=0,contacts=0;
    for(let i=0;i<associations.length&&isCurrent();i++){
      const association=associations[i];status.textContent=`${i+1} of ${associations.length}: ${association.name}`;
      try{await scanAssociation(association.id);contacts+=await enrichAssociation(association.id);completed++;}catch{failed++;}
    }
    platformMarketActionMessage=`Discovery refresh complete · ${completed} associations · ${contacts} new contacts${failed?` · ${failed} failed`:''}.`;
    if(isCurrent())await renderPlatformMarketDiscovery({restoreScroll:false});
  };
  document.getElementById('enrichAllContacts').onclick=async()=>{
    if(!canControl||!isCurrent())return;
    const withClubs=associations.filter(a=>(clubIdsByAssociation.get(a.id)||[]).length);
    if(!confirm(`Sync public contacts across ${withClubs.length} mapped associations?`))return;
    const button=document.getElementById('enrichAllContacts'),status=document.getElementById('marketDiscoveryStatus');button.disabled=true;
    let contacts=0,failed=0;
    for(let i=0;i<withClubs.length&&isCurrent();i++){
      const association=withClubs[i];status.textContent=`${i+1} of ${withClubs.length}: ${association.name}`;
      try{contacts+=await enrichAssociation(association.id);}catch{failed++;}
    }
    platformMarketActionMessage=`Contact sync complete · ${contacts} new contacts${failed?` · ${failed} associations need another attempt`:''}.`;
    if(isCurrent())await renderPlatformMarketDiscovery({restoreScroll:false});
  };

  if(!isCurrent())return;
  renderProspectRows();
  page.querySelectorAll('a[target="_blank"]').forEach(link=>link.addEventListener('click',savePlatformMarketScroll));
  platformMarketScrollSuppressed=false;
  if(options?.restoreScroll!==false)restorePlatformMarketScroll();
}

async function renderPlatformProspects(){
  const page=document.getElementById('platformPage');page.innerHTML='<div class="splash">Loading Club Pipeline…</div>';
  const [prospectRes,onboardingRes,trialRes,threadRes,messageRes,suppressionRes,settingsRes]=await Promise.all([
    supabase.from('sales_prospects').select('*').order('updated_at',{ascending:false}),
    supabase.from('club_prospects').select('*').order('created_at',{ascending:false}),
    supabase.from('club_trials').select('*').order('created_at',{ascending:false}),
    supabase.from('club_batting_guide_threads').select('id,sales_prospect_id,status,human_handoff_reason,updated_at').eq('status','handoff_requested').order('updated_at',{ascending:false}),
    loadAllPlatformRows(()=>supabase.from('outbound_messages').select('id,club_id,prospect_id,sales_prospect_id,recipient_email,template_key,subject,provider_name,created_at,processing_at,sent_at,failed_at,last_error').eq('hidden_from_platform_queue',false).is('sent_at',null).order('created_at',{ascending:false}).order('id')),
    supabase.from('email_suppressions').select('email'),
    supabase.from('platform_settings').select('email_mode,email_live_from').eq('singleton',true).single()
  ]);
  const loadError=prospectRes.error||onboardingRes.error||trialRes.error||threadRes.error||messageRes.error||suppressionRes.error||settingsRes.error;
  if(loadError){page.innerHTML=`<div class="notice">${esc(loadError.message)}</div>`;return;}

  const rows=prospectRes.data||[];
  const onboarding=onboardingRes.data||[];
  const trials=trialRes.data||[];
  const guideThreads=threadRes.data||[];
  const messages=messageRes.data||[];
  const emailSettings=settingsRes.data||{};
  const suppressedEmails=new Set((suppressionRes.data||[]).map(x=>String(x.email||'').trim().toLowerCase()).filter(Boolean));

  if(platformSelectedProspectId){
    const p=rows.find(x=>x.id===platformSelectedProspectId);
    if(p){await renderPlatformSalesProspectDetail(p);return;}
    platformSelectedProspectId=null;
  }
  const validEmail=p=>String(p?.contact_email||'').trim().includes('@');
  const suppressedEmail=p=>suppressedEmails.has(String(p?.contact_email||'').trim().toLowerCase());
  const statusLabel=s=>({discovered:'Discovered',ready_to_contact:'Ready to contact',contacted:'Awaiting response',interested:'Interested',maybe_later:'Revisit later',wrong_contact:'Wrong contact',declined:'Not interested',onboarding:'Onboarding',do_not_contact:'Do not contact'}[s]||String(s||'').replaceAll('_',' '));
  const currentOnboarding=onboarding.filter(x=>x.status!=='active');
  const revisit=rows.filter(x=>x.status==='maybe_later').sort((a,b)=>String(a.follow_up_after||'9999').localeCompare(String(b.follow_up_after||'9999')));
  const today=new Date().toISOString().slice(0,10);

  const attentionByProspect=new Map();
  const addAttention=(p,type,reason)=>{
    if(!p)return;
    if(!attentionByProspect.has(p.id))attentionByProspect.set(p.id,{prospect:p,types:new Set(),reasons:[]});
    const item=attentionByProspect.get(p.id);
    item.types.add(type);
    if(reason&&!item.reasons.includes(reason))item.reasons.push(reason);
  };

  rows.forEach(p=>{
    if(['declined','do_not_contact','onboarding'].includes(p.status))return;
    if(p.status==='wrong_contact')addAttention(p,'contact','Replace the incorrect Club Contact details');
    else if(!validEmail(p)&&['discovered','ready_to_contact','interested','maybe_later'].includes(p.status))addAttention(p,'contact','Add a valid Club Contact email');
    else if(suppressedEmail(p)&&['discovered','ready_to_contact','contacted','interested','maybe_later'].includes(p.status))addAttention(p,'contact','Replace the suppressed Club Contact email');
    if(p.status==='interested'&&!p.onboarding_prospect_id)addAttention(p,'trial',validEmail(p)?'Automatic Club Trial setup has not completed':'The Club Trial is waiting for a contact email');
  });
  guideThreads.forEach(t=>addAttention(rows.find(p=>p.id===t.sales_prospect_id),'guide',t.human_handoff_reason||'The club asked to speak to someone'));
  const needsAttention=[...attentionByProspect.values()];
  const deliveryExceptions=messages.filter(message=>outboundMessageNeedsAttention(message,emailSettings));

  const prospectPlace=p=>[p.locality,p.region,p.country].filter(Boolean).join(', ');
  const prospectRow=(p,badge,detail)=>`<button class="sales-prospect-row" data-sales-id="${p.id}"><span class="sales-prospect-main"><strong>${esc(p.club_name)}</strong><small>${esc(detail||prospectPlace(p)||p.contact_email||'Details not recorded')}</small></span><span class="sales-status ${esc(p.status)}">${esc(badge||statusLabel(p.status))}</span><span class="sales-arrow">›</span></button>`;
  const attentionBadge=item=>item.types.has('contact')?'Add contact':item.types.has('guide')?'Handoff':'Check trial';
  const deliveryExceptionRow=message=>`<div class="message-row"><div><strong>${esc(message.subject||outboundTemplateLabel(message.template_key))}</strong><small>${esc(message.recipient_email)} · ${esc(outboundTemplateLabel(message.template_key))} · ${esc(outboundMessageLabel(message,emailSettings))}</small>${message.last_error?`<small class="email-error">${esc(message.last_error)}</small>`:''}</div><div class="message-row-actions"><button class="btn secondary compact" data-retry-pipeline-message="${message.id}">Retry delivery</button></div></div>`;
  const revisitDetail=p=>{
    const timing=p.follow_up_after
      ?(String(p.follow_up_after).slice(0,10)<=today?`Automatic single re-contact is due ${niceDate(p.follow_up_after)}`:`Automatic single re-contact scheduled ${niceDate(p.follow_up_after)}`)
      :'Automatic single re-contact date not set';
    return `${timing}${!validEmail(p)?' · contact email needed':suppressedEmail(p)?' · contact email is suppressed and must be replaced':` · ${p.contact_email}`}`;
  };

  page.innerHTML=`
  <section class="admin-card" style="margin-bottom:16px">
    <div class="admin-card-head"><div><div class="section-label">Club Pipeline</div><h2>Attention, follow-up and Club Trial progress</h2><p class="help">Normal outreach responses and valid Interested responses move automatically. This page keeps the exceptions and live onboarding work visible.</p><div class="btnrow" style="margin-top:10px"><span class="status-pill">${needsAttention.length+deliveryExceptions.length} need attention</span><span class="status-pill">${revisit.length} revisit later</span><button class="btn ghost compact" id="openOnboardingList" ${currentOnboarding.length?'':'disabled'}>${currentOnboarding.length} currently onboarding →</button></div></div><div class="btnrow"><button class="btn ghost" id="openMarketDiscovery">Open Market Discovery</button></div></div>
  </section>

  <section class="admin-card" style="margin-bottom:16px">
    <div class="section-label">Needs attention</div><h2>${needsAttention.length+deliveryExceptions.length?`${needsAttention.length+deliveryExceptions.length} issue${needsAttention.length+deliveryExceptions.length===1?' needs':'s need'} a person`:'Nothing needs attention'}</h2>
    <p class="help">Only real exceptions appear here: failed or delayed email delivery, missing contact details, requested conversations, or Club Trial setup that has not completed.</p>
    ${deliveryExceptions.length?`<div class="message-list" style="margin-bottom:14px">${deliveryExceptions.map(deliveryExceptionRow).join('')}</div>`:''}
    ${needsAttention.length?`<div class="ready-onboarding-list">${needsAttention.map(item=>prospectRow(item.prospect,attentionBadge(item),item.reasons.join(' · '))).join('')}</div>`:deliveryExceptions.length?'':'<div class="notice success">There are no current exceptions.</div>'}
    <div id="pipelineDeliveryStatus" class="help" role="status"></div>
  </section>

  <section class="admin-card" style="margin-bottom:16px">
    <div class="section-label">Revisit later</div><h2>${revisit.length?`${revisit.length} scheduled club${revisit.length===1?'':'s'}`:'No clubs waiting for re-contact'}</h2>
    <p class="help">Each club receives one automatic re-contact after 30 days, never more than once within 90 days. If there is no new response, no sequence follows.</p>
    ${revisit.length?`<div class="ready-onboarding-list">${revisit.map(p=>prospectRow(p,'Revisit later',revisitDetail(p))).join('')}</div>`:'<div class="notice">No automatic re-contacts are currently scheduled.</div>'}
  </section>

  <details class="admin-card" style="margin-bottom:16px">
    <summary><div><div class="section-label">Search and history</div><h2>All Club Pipeline records</h2><p>Open this only when you need to find a club or review background activity.</p></div><span>⌄</span></summary>
    <div class="collapsible-admin-body">
      <div class="prospect-filter-row" style="margin-top:18px"><input id="salesProspectSearch" placeholder="Search club, place or email"><select id="salesProspectStatus"><option value="all">All open records</option><option value="needs_contact">Needs contact details</option><option value="contacted">Awaiting response</option><option value="maybe_later">Revisit later</option><option value="interested">Interested</option><option value="onboarding">Onboarding</option><option value="ready_to_contact">Ready to contact</option><option value="discovered">Discovered</option><option value="closed">Closed / do not contact</option><option value="everything">Everything</option></select></div>
      <div id="salesProspectList"></div>
    </div>
  </details>

  <details class="admin-card manual-prospect-card" style="margin-bottom:16px">
    <summary><div><div class="section-label">Manual entry</div><h2>Add a club manually</h2><p>Use this for a referral or a known club that did not come through Market Discovery.</p></div><span>⌄</span></summary>
    <div class="collapsible-admin-body">
      <div class="form-grid">
        <div class="field"><label>Club name</label><input id="salesClubName"></div>
        <div class="field"><label>Locality</label><input id="salesLocality"></div>
        <div class="field"><label>Region / state</label><input id="salesRegion"></div>
        <div class="field"><label>Country</label><input id="salesCountry" value="Australia"></div>
        <div class="field"><label>Club website</label><input id="salesWebsite" placeholder="https://..."></div>
        <div class="field"><label>Public contact source</label><input id="salesSourceUrl" placeholder="Page where the contact was published"></div>
        <div class="field"><label>Contact name</label><input id="salesContactName"></div>
        <div class="field"><label>Contact role</label><input id="salesContactRole" value="Club Secretary / contact"></div>
        <div class="field"><label>Public contact email</label><input id="salesContactEmail" type="email"></div>
      </div>
      <div class="field"><label>Internal note</label><textarea id="salesNotes"></textarea></div>
      <div class="btnrow"><button class="btn secondary" id="addSalesProspect">Add club</button><span id="addSalesStatus" class="status"></span></div>
    </div>
  </details>

  <div class="btnrow" style="justify-content:flex-end"><button class="btn ghost compact" id="openEmailHistory">View email history →</button></div>`;

  document.getElementById('openMarketDiscovery').onclick=()=>{platformView='market';renderPlatformConsole();};
  const renderList=()=>{
    const q=(document.getElementById('salesProspectSearch').value||'').trim().toLowerCase();
    const filter=document.getElementById('salesProspectStatus').value;
    let shown=rows.filter(x=>{
      if(filter==='everything')return true;
      if(filter==='all')return !['declined','do_not_contact'].includes(x.status);
      if(filter==='closed')return ['declined','do_not_contact'].includes(x.status);
      if(filter==='needs_contact')return ((!validEmail(x)||suppressedEmail(x))&&!['declined','do_not_contact','onboarding'].includes(x.status))||x.status==='wrong_contact';
      return x.status===filter;
    });
    if(q)shown=shown.filter(x=>[x.club_name,x.locality,x.region,x.country,x.contact_email,x.contact_name].some(v=>String(v||'').toLowerCase().includes(q)));
    document.getElementById('salesProspectList').innerHTML=shown.length?`<div class="sales-prospect-list">${shown.map(x=>prospectRow(x,statusLabel(x.status),`${prospectPlace(x)||'Location not recorded'}${x.contact_email?` · ${x.contact_email}`:''}`)).join('')}</div>`:'<div class="notice">No Club Pipeline records match this view.</div>';
    document.querySelectorAll('[data-sales-id]').forEach(b=>b.onclick=()=>{platformSelectedProspectId=b.dataset.salesId;renderPlatformProspects();});
  };
  document.getElementById('salesProspectSearch').oninput=renderList;
  document.getElementById('salesProspectStatus').onchange=renderList;
  renderList();

  document.getElementById('openOnboardingList')?.addEventListener('click',()=>renderPlatformOnboardingList(onboarding,trials));
  document.getElementById('openEmailHistory').onclick=()=>{platformView='outbox';renderPlatformView();};
  page.querySelectorAll('[data-retry-pipeline-message]').forEach(button=>button.onclick=async()=>{
    const message=messages.find(item=>item.id===button.dataset.retryPipelineMessage);
    button.disabled=true;button.textContent='Retrying…';
    try{
      const result=await retryPlatformDelivery(message,emailSettings);
      await renderPlatformProspects();
      const status=document.getElementById('pipelineDeliveryStatus');if(status)status.textContent=result;
    }catch(error){
      const status=document.getElementById('pipelineDeliveryStatus');if(status)status.textContent=error.message;
      button.disabled=false;button.textContent='Retry delivery';
    }
  });

  document.getElementById('addSalesProspect').onclick=async()=>{
    const st=document.getElementById('addSalesStatus');st.textContent='Adding…';
    const email=val('salesContactEmail').trim().toLowerCase();
    const status=email?'ready_to_contact':'discovered';
    const {data,error}=await supabase.from('sales_prospects').insert({
      club_name:val('salesClubName'),locality:val('salesLocality'),region:val('salesRegion'),country:val('salesCountry')||'Australia',website_url:val('salesWebsite'),
      contact_name:val('salesContactName'),contact_role:val('salesContactRole')||'Club Secretary / contact',contact_email:email,contact_source_url:val('salesSourceUrl'),
      source_type:'manual',intended_route:'standard',status,notes:val('salesNotes')
    }).select('id').single();
    if(error){st.textContent=error.message;return;}
    st.textContent='Added ✓';platformSelectedProspectId=data.id;setTimeout(()=>renderPlatformProspects(),300);
  };
}

function onboardingProgressLabel(p,trial,invitation=null,settings=null){
  if(p?.status==='awaiting_admin_handoff')return 'Trial active · awaiting Club Admin nomination';
  if(p?.status==='admin_invited')return 'Trial active · Club Admin invited';
  if(p?.status==='active')return 'Setup complete';
  if(!trial)return String(p?.status||'').replaceAll('_',' ');
  if(trial.status==='offered'){
    if(invitation?.sent_at)return 'Invitation sent · awaiting activation';
    if(settings&&invitation&&(!settings.email_live_from||settings.email_mode!=='live'||new Date(invitation.created_at)<new Date(settings.email_live_from)))return 'Prototype invitation · not sent';
    if(invitation?.failed_at)return 'Invitation delivery failed';
    if(invitation?.processing_at&&outboundMessageAgeMinutes(invitation)<10)return 'Invitation sending';
    if(invitation&&outboundMessageAgeMinutes(invitation)>=10)return 'Invitation delayed';
    if(invitation)return 'Invitation queued';
    return 'Invitation not confirmed';
  }
  return String(p?.status||trial.status||'').replaceAll('_',' ');
}

function trialTimingLabel(trial){
  if(!trial)return '—';
  const days=Number(trial.duration_days||60);
  return trial.status==='offered'
    ?`${days} days · begins on activation`
    :`${niceDate(trial.starts_on)} – ${niceDate(trial.ends_on)}`;
}

async function renderPlatformOnboardingList(onboardingRows=null,trialRows=null,messageRows=null){
  const page=document.getElementById('platformPage');
  page.innerHTML='<div class="splash">Loading onboarding list…</div>';

  let records=onboardingRows;
  let trials=trialRows;
  let invitationMessages=messageRows;
  let emailSettings=null;
  {
    const [onboardingRes,trialRes,messageRes,settingsRes]=await Promise.all([
      Array.isArray(records)?Promise.resolve({data:records}):supabase.from('club_prospects').select('*').order('created_at',{ascending:false}),
      Array.isArray(trials)?Promise.resolve({data:trials}):supabase.from('club_trials').select('*').order('created_at',{ascending:false}),
      loadAllPlatformRows(()=>supabase.from('outbound_messages').select('id,prospect_id,template_key,created_at,processing_at,sent_at,failed_at,last_error').eq('template_key','club_trial_invitation').order('created_at',{ascending:false}).order('id')),
      supabase.from('platform_settings').select('email_mode,email_live_from').eq('singleton',true).single()
    ]);
    const loadError=onboardingRes.error||trialRes.error||messageRes.error||settingsRes.error;
    if(loadError){page.innerHTML=`<div class="notice">${esc(loadError.message)}</div>`;return;}
    records=onboardingRes.data||[];
    trials=trialRes.data||[];
    invitationMessages=messageRes.data||[];
    emailSettings=settingsRes.data;
  }

  const current=records.filter(x=>x.status!=='active');
  const trialMap=new Map(trials.map(t=>[t.onboarding_prospect_id,t]));
  const invitationByProspect=new Map();
  invitationMessages.filter(message=>message.template_key==='club_trial_invitation').forEach(message=>{
    if(message.prospect_id&&!invitationByProspect.has(message.prospect_id))invitationByProspect.set(message.prospect_id,message);
  });

  page.innerHTML=`<div class="btnrow"><button class="btn ghost" id="backFromOnboardingList">← Club Pipeline</button></div>
    <section class="admin-card">
      <div class="admin-card-head"><div><div class="section-label">Currently onboarding</div><h2>${current.length} club${current.length===1?'':'s'}</h2><p class="help">One line per club. Completed setup moves to Active Clubs automatically.</p></div><div class="prospect-filter-row"><input id="onboardingListSearch" placeholder="Search club or contact email"></div></div>
      <div class="admin-table-wrap" style="margin-top:12px"><table class="admin-table"><thead><tr><th>Club</th><th>Progress</th><th>Club Contact</th><th>Trial</th><th>If continued</th></tr></thead><tbody id="onboardingListBody"></tbody></table></div>
    </section>`;

  const renderRows=()=>{
    const q=String(document.getElementById('onboardingListSearch').value||'').trim().toLowerCase();
    const shown=q?current.filter(p=>[p.club_name,p.primary_contact_name,p.primary_contact_email].some(v=>String(v||'').toLowerCase().includes(q))):current;
    document.getElementById('onboardingListBody').innerHTML=shown.length?shown.map(p=>{
      const t=trialMap.get(p.id);
      const annualCents=t?.annual_price_cents??p.standard_price_cents;
      const currency=t?.currency||'AUD';
      return `<tr><td><strong>${esc(p.club_name)}</strong></td><td><span class="status-pill">${esc(onboardingProgressLabel(p,t,invitationByProspect.get(p.id),emailSettings))}</span></td><td>${esc(p.primary_contact_email||'—')}</td><td>${esc(t?trialTimingLabel(t):niceDate(p.offer_end))}</td><td>${annualCents!=null?`${esc(money(annualCents,currency))}/year`:'—'}</td></tr>`;
    }).join(''):'<tr><td colspan="5">No onboarding clubs match this search.</td></tr>';
  };

  document.getElementById('backFromOnboardingList').onclick=()=>renderPlatformProspects();
  document.getElementById('onboardingListSearch').oninput=renderRows;
  renderRows();
}

async function renderPlatformSalesProspectDetail(p){
  const page=document.getElementById('platformPage');
  const [{data:events},{data:trial},{data:guideThreads}]=await Promise.all([
    supabase.from('sales_prospect_events').select('*').eq('sales_prospect_id',p.id).order('created_at',{ascending:false}).limit(30),
    supabase.from('club_trials').select('*').eq('sales_prospect_id',p.id).maybeSingle(),
    supabase.from('club_batting_guide_threads').select('id,status,human_handoff_reason,updated_at').eq('sales_prospect_id',p.id).order('updated_at',{ascending:false}).limit(5)
  ]);
  const place=[p.locality,p.region,p.country].filter(Boolean).join(', ');
  const canFirstContact=!!p.contact_email&&!p.do_not_contact&&!['contacted','interested','maybe_later','wrong_contact','declined','do_not_contact','onboarding'].includes(p.status);
  const daysSinceContact=p.last_contacted_at?Math.floor((Date.now()-new Date(p.last_contacted_at).getTime())/86400000):null;
  const hasFollowUp=(events||[]).some(e=>['single_follow_up_queued','maybe_later_recontact_queued'].includes(e.event_type));
  const canFollowUp=p.status==='contacted'&&daysSinceContact>=7&&!hasFollowUp&&!p.do_not_contact;
  const handoff=(guideThreads||[]).find(t=>t.status==='handoff_requested');
  const trialDays=trial?.ends_on&&trial?.starts_on?Math.max(1,Math.round((new Date(`${trial.ends_on}T12:00:00`)-new Date(`${trial.starts_on}T12:00:00`))/86400000)+1):null;
  const hasContactEmail=String(p.contact_email||'').includes('@');
  const adminStatusActions=[
    !['interested','onboarding'].includes(p.status)?['interested','Record interest — start Club Trial']:null,
    p.status!=='maybe_later'?['maybe_later','Move to maybe later']:null,
    p.status!=='declined'?['declined','Close as not interested']:null
  ].filter(Boolean);

  page.innerHTML=`<div class="btnrow"><button class="btn ghost" id="backSalesProspects">← Club Pipeline</button></div>
    ${handoff?`<section class="admin-card guide-handoff-alert"><div><div class="section-label">Human handoff requested</div><h2>${esc(p.club_name)} would like to speak to someone.</h2><p>${esc(handoff.human_handoff_reason||'No reason supplied. Review the Guide conversation before contacting the club.')}</p></div></section>`:''}
    <div class="grid sales-detail-grid">
      <section class="admin-card">
        <div class="section-label">Prospect</div><h2>${esc(p.club_name)}</h2>
        <div class="detail-grid"><div><span>Status</span><strong>${esc(String(p.status||'').replaceAll('_',' '))}</strong></div><div><span>Location</span><strong>${esc(place||'—')}</strong></div><div><span>Commercial path</span><strong>${trial?'Club Trial':esc(String(p.intended_route||'standard').replaceAll('_',' '))}</strong></div><div><span>Last contacted</span><strong>${esc(p.last_contacted_at?niceDate(p.last_contacted_at):'Not yet')}</strong></div></div>
        ${p.website_url?`<p><a href="${esc(p.website_url)}" target="_blank" rel="noopener">Open club website ↗</a></p>`:''}
        ${p.contact_source_url?`<p class="help">Contact source: <a href="${esc(p.contact_source_url)}" target="_blank" rel="noopener">public source ↗</a></p>`:''}
        <div class="field"><label>Contact name</label><input id="editSalesContactName" value="${esc(p.contact_name||'')}"></div>
        <div class="field"><label>Contact role</label><input id="editSalesContactRole" value="${esc(p.contact_role||'')}"></div>
        <div class="field"><label>Contact email</label><input id="editSalesContactEmail" type="email" value="${esc(p.contact_email||'')}"></div>
        <div class="field"><label>Internal note</label><textarea id="editSalesNotes">${esc(p.notes||'')}</textarea></div>
        <div class="btnrow"><button class="btn ghost" id="saveSalesProspect">Save details</button></div>
      </section>
      <section class="admin-card">
        <div class="section-label">Next action</div><h2>${trial?'Club Trial progress':p.status==='interested'?'Trial setup needs contact details':'Prospect outreach'}</h2>
        ${p.status==='interested'&&!trial?`<div class="notice"><strong>The club has indicated interest.</strong><br>${hasContactEmail?'Automatic trial setup is pending. No separate onboarding step is required.':'Add and save a valid Club Contact email. Club Batting will then create the trial and queue the invitation automatically.'}</div>`:''}
        ${p.status==='maybe_later'?`<div class="notice"><strong>Automatic single re-contact scheduled.</strong><br>${p.follow_up_after?`Club Batting will re-contact the club on ${esc(niceDate(p.follow_up_after))}, subject to the 90-day frequency cap.`:'A date has not been set. Review the record.'} No follow-up sequence will be added.</div>`:''}
        ${trial?`<div class="trial-admin-card"><span class="status-pill">${esc(String(trial.status).replaceAll('_',' '))}</span><strong>${Number(trial.duration_days||trialDays||60)}-day Club Trial</strong><p>${esc(trialTimingLabel(trial))}</p><p>${esc(money(trial.annual_price_cents,trial.currency||'AUD'))}/year only if the club explicitly chooses to continue.</p></div>`:''}
        ${canFirstContact?'<button class="btn secondary" id="queueSalesIntro">Queue introduction</button>':''}
        ${canFollowUp?'<button class="btn ghost" id="queueSalesFollowUp">Queue one follow-up</button>':''}
        ${p.status==='contacted'&&!canFollowUp&&!hasFollowUp&&daysSinceContact!==null&&daysSinceContact<7?`<div class="help">One follow-up becomes available after 7 days. ${7-daysSinceContact} day${7-daysSinceContact===1?'':'s'} to go.</div>`:''}
        ${hasFollowUp?'<div class="help">The single follow-up has already been used. No drip sequence will follow.</div>':''}
        ${!hasContactEmail&&!['interested','onboarding'].includes(p.status)&&!trial?'<div class="notice">Add a public club contact email before outreach can be queued.</div>':''}
        ${p.status==='interested'&&!trial&&!p.onboarding_prospect_id&&!hasContactEmail?'<div class="notice"><strong>Only one admin action is needed:</strong> add the Club Contact email and press Save details. The rest is automatic.</div>':''}
        ${p.do_not_contact||['declined','do_not_contact'].includes(p.status)?'<div class="notice"><strong>Do not contact.</strong> This email is suppressed from prospecting.</div>':''}
        ${p.onboarding_prospect_id&&!trial?'<div class="notice success"><strong>Moved to Onboarding.</strong></div>':''}
        ${!trial&&adminStatusActions.length?`<details style="margin-top:18px"><summary style="cursor:pointer;font-weight:800">Admin: change prospect status</summary><div class="quick-status-actions" style="margin-top:10px">${adminStatusActions.map(([status,label])=>`<button class="btn ghost" data-sales-status="${status}">${label}</button>`).join('')}</div></details>`:''}
        <div id="salesActionStatus" class="help"></div>
      </section>
    </div>
    <section class="admin-card" style="margin-top:16px"><div class="section-label">History</div><h2>Prospect activity</h2><div class="prospect-event-list">${(events||[]).map(e=>`<div><strong>${esc(String(e.event_type).replaceAll('_',' '))}</strong><span>${esc(new Date(e.created_at).toLocaleString())}</span></div>`).join('')||'<div class="help">No activity yet.</div>'}</div></section>`;

  document.getElementById('backSalesProspects').onclick=()=>{platformSelectedProspectId=null;renderPlatformProspects();};
  document.getElementById('saveSalesProspect').onclick=async()=>{
    const nextEmail=val('editSalesContactEmail').trim().toLowerCase();
    const contactChanged=!!nextEmail&&nextEmail!==String(p.contact_email||'').trim().toLowerCase();
    const patch={contact_name:val('editSalesContactName'),contact_role:val('editSalesContactRole'),contact_email:nextEmail,notes:val('editSalesNotes'),updated_at:new Date().toISOString()};
    if(contactChanged&&p.status==='wrong_contact'){patch.status='ready_to_contact';patch.do_not_contact=false;}
    const {error}=await supabase.from('sales_prospects').update(patch).eq('id',p.id);
    if(error){alert(error.message);return;}renderPlatformProspects();
  };
  document.getElementById('queueSalesIntro')?.addEventListener('click',async()=>{
    const st=document.getElementById('salesActionStatus');st.textContent='Queuing…';
    const {error}=await supabase.rpc('platform_queue_sales_intro',{p_sales_prospect_id:p.id});
    if(error){st.textContent=error.message;return;}st.textContent='Introduction queued ✓';await kickLiveEmailDelivery();setTimeout(()=>renderPlatformProspects(),500);
  });
  document.getElementById('queueSalesFollowUp')?.addEventListener('click',async()=>{
    const st=document.getElementById('salesActionStatus');st.textContent='Queuing follow-up…';
    const {error}=await supabase.rpc('platform_queue_sales_follow_up',{p_sales_prospect_id:p.id});
    if(error){st.textContent=error.message;return;}st.textContent='Single follow-up queued ✓';await kickLiveEmailDelivery();setTimeout(()=>renderPlatformProspects(),500);
  });
  document.querySelectorAll('[data-sales-status]').forEach(b=>b.onclick=async()=>{
    const {error}=await supabase.rpc('platform_set_sales_prospect_status',{p_sales_prospect_id:p.id,p_status:b.dataset.salesStatus});
    if(error){alert(error.message);return;}renderPlatformProspects();
  });
}

async function loadSubscriptionCalendars(){
  const {data,error}=await supabase.from('subscription_calendars').select('*').eq('active',true).order('sort_order');
  if(error)return {data:[],error};
  return {data:data||[],error:null};
}

function calendarStartLabel(c){
  if(!c)return '';
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${c.club_year_start_day} ${months[c.club_year_start_month-1]}`;
}

function nextDayIso(value){
  if(!value)return '';
  const d=new Date(`${String(value).slice(0,10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}

function calendarOptions(calendars,selected='australia'){
  return (calendars||[]).map(c=>`<option value="${esc(c.code)}" ${c.code===selected?'selected':''}>${esc(c.label)} · renews ${esc(calendarStartLabel(c))}</option>`).join('');
}

function commercialPreviewHtml(q){
  if(!q)return '<div class="help">Choose a subscription calendar and access date to preview the term.</div>';
  const bundled=q.bundled_next_full_year===true || q.bundled_next_full_year==='true';
  return `<div class="commercial-preview-grid">
    <div><span>Access starts</span><strong>${esc(niceDate(q.access_start))}</strong></div>
    <div><span>Current term ends</span><strong>${esc(niceDate(q.offer_end))}</strong></div>
    <div><span>Next renewal</span><strong>${esc(niceDate(q.next_renewal))}</strong></div>
    <div><span>Standard annual price</span><strong>${esc(money(q.standard_annual_price_cents,q.currency))}</strong></div>
    <div><span>Current term before reduction</span><strong>${esc(money(q.base_prorated_cents,q.currency))}</strong></div>
    <div><span>Club price now</span><strong>${esc(money(q.amount_due_cents,q.currency))}</strong></div>
  </div>
  ${bundled?`<div class="notice compact"><strong>Near the renewal date:</strong> the short remaining period is included, and the charge covers the next full Club Year.</div>`:''}`;
}

async function getCommercialPreview(calendar,accessStart,reduction=0,adjustmentEnd=''){
  if(!calendar||!accessStart)return {data:null,error:null};
  return supabase.rpc('platform_preview_offer',{
    p_subscription_calendar:calendar,
    p_access_start:accessStart,
    p_adjustment_percent:Number(reduction||0),
    p_adjustment_end:adjustmentEnd||null
  });
}

async function renderPlatformOnboardingDetail(p){
  const page=document.getElementById('platformPage');
  const [{data:calendars,error:calendarError},{data:trial,error:trialError},{data:invitation,error:invitationError},{data:emailSettings,error:settingsError}]=await Promise.all([
    loadSubscriptionCalendars(),
    supabase.from('club_trials').select('*').eq('onboarding_prospect_id',p.id).maybeSingle(),
    supabase.from('outbound_messages').select('id,prospect_id,template_key,created_at,processing_at,sent_at,failed_at,last_error').eq('prospect_id',p.id).eq('template_key','club_trial_invitation').order('created_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('platform_settings').select('email_mode,email_live_from').eq('singleton',true).single()
  ]);
  const loadError=calendarError||trialError||invitationError||settingsError;
  if(loadError){page.innerHTML=`<div class="notice">${esc(loadError.message)}</div>`;return;}
  if(trial){
    const prototypeInvitation=invitation&&!invitation.sent_at&&(!emailSettings.email_live_from||emailSettings.email_mode!=='live'||new Date(invitation.created_at)<new Date(emailSettings.email_live_from));
    const invitationNotice=invitation?.sent_at
      ?'<div class="notice success"><strong>Invitation sent.</strong><br>The full trial begins when the Club Contact securely activates it. No admin action is required.</div>'
      :prototypeInvitation?'<div class="notice"><strong>Prototype invitation.</strong><br>This record is outside the current live delivery window.</div>':invitation?.failed_at
        ?`<div class="notice"><strong>Invitation delivery failed.</strong><br>${esc(invitation.last_error||'Use Retry delivery in Club Pipeline.')}</div>`
        :invitation&&outboundMessageAgeMinutes(invitation)>=10
          ?'<div class="notice"><strong>Invitation delivery is delayed.</strong><br>Use Retry delivery in Club Pipeline.</div>'
          :invitation?.processing_at
            ?'<div class="notice"><strong>Invitation is sending.</strong></div>'
            :invitation
              ?'<div class="notice"><strong>Invitation queued.</strong><br>It has not yet been recorded as sent.</div>'
              :'<div class="notice"><strong>Invitation not confirmed.</strong><br>No delivery record was found.</div>';
    page.innerHTML=`<div class="btnrow"><button class="btn ghost" id="backOnboarding">← Club Pipeline</button></div>
    <div class="grid">
      <section class="admin-card">
        <div class="section-label">Club Trial onboarding</div><h2>${esc(p.club_name)}</h2>
        <div class="detail-grid"><div><span>Progress</span><strong>${esc(onboardingProgressLabel(p,trial,invitation,emailSettings))}</strong></div><div><span>Club Contact</span><strong>${esc(p.primary_contact_email)}</strong></div><div><span>Trial</span><strong>${esc(trialTimingLabel(trial))}</strong></div><div><span>If continued</span><strong>${esc(money(trial.annual_price_cents,trial.currency||'AUD'))}/year</strong></div></div>
      </section>
      <section class="admin-card">
        <div class="section-label">Automatic progress</div><h2>${Number(trial.duration_days||60)}-day Club Trial</h2>
        ${trial.status==='offered'
          ?invitationNotice
          :`<div class="trial-admin-card"><span class="status-pill">${esc(String(trial.status).replaceAll('_',' '))}</span><strong>Trial dates</strong><p>${esc(niceDate(trial.starts_on))} – ${esc(niceDate(trial.ends_on))}</p></div>`}
        <p class="help">Nothing is automatically charged at the end. The club must explicitly choose whether to continue.</p>
      </section>
    </div>`;
    document.getElementById('backOnboarding').onclick=()=>{platformSelectedOnboardingId=null;renderPlatformProspects();};
    return;
  }

  page.innerHTML=`<div class="btnrow"><button class="btn ghost" id="backOnboarding">← Club Pipeline</button></div>
  <div class="grid">
    <section class="admin-card">
      <div class="section-label">Prospect</div><h2>${esc(p.club_name)}</h2>
      <div class="detail-grid"><div><span>Route</span><strong>${esc(p.entry_route.replaceAll('_',' '))}</strong></div><div><span>Status</span><strong>${esc(p.status.replaceAll('_',' '))}</strong></div><div><span>Club Contact</span><strong>${esc(p.primary_contact_email)}</strong></div><div><span>Current amount</span><strong>${esc(money(p.amount_due_cents))}</strong></div></div>
    </section>
    <section class="admin-card">
      <div class="section-label">Private commercial terms</div><h2>Club price & annual calendar</h2>
      <div class="private-note">Only Platform Admins see these controls. <strong>0% reduction = full standard price. 100% reduction = free.</strong> The club sees only its actual price and dates.</div>
      <div class="field"><label>Subscription calendar</label><select id="editCalendar">${calendarOptions(calendars,p.subscription_calendar||'australia')}</select></div>
      <div class="field"><label>Access starts</label><input id="editChargeFrom" type="date" value="${esc(String(p.charge_from).slice(0,10))}"></div>
      <div class="field"><label>Private rate reduction from standard price</label><input id="editAdjustment" type="number" min="0" max="100" step="1" value="${esc(p.adjustment_percent)}"><small>0% = standard price · 100% = complimentary</small></div>
      <div class="field"><label>Custom rate end date (optional)</label><input id="editAdjEnd" type="date" value="${esc(p.adjustment_end?String(p.adjustment_end).slice(0,10):'')}"><small>Only used for a temporary custom rate.</small></div>
      <div class="field"><label>At expiry</label><select id="editExpiry"><option value="renewal_approval" ${p.expiry_action==='renewal_approval'?'selected':''}>Require renewal approval</option><option value="return_standard" ${p.expiry_action==='return_standard'?'selected':''}>Return to standard rate</option><option value="end_subscription" ${p.expiry_action==='end_subscription'?'selected':''}>End subscription</option></select></div>
      ${p.entry_route!=='standard'?'<div class="notice compact"><strong>Beta route:</strong> it bypasses charging, so the rate reduction must remain at 100%.</div>':''}
      ${['owner','commercial_admin'].includes(platformRole)&&!['payment_received','awaiting_admin_handoff','admin_invited','active'].includes(p.status)?'<button class="btn secondary" id="saveProspectTerms">Recalculate & save terms</button>':'<div class="notice">Activated clubs are managed under Active Clubs rather than changing the original offer.</div>'}
      <div id="prospectTermsStatus" class="help"></div>
    </section>
  </div>`;
  document.getElementById('backOnboarding').onclick=()=>{platformSelectedOnboardingId=null;renderPlatformProspects();};
  if(document.getElementById('saveProspectTerms'))document.getElementById('saveProspectTerms').onclick=async()=>{
    const st=document.getElementById('prospectTermsStatus');st.textContent='Saving…';
    const reduction=Number(val('editAdjustment')||0);
    const {data,error}=await supabase.rpc('platform_update_prospect_terms',{
      p_prospect_id:p.id,
      p_subscription_calendar:document.getElementById('editCalendar').value,
      p_adjustment_percent:reduction,
      p_adjustment_start:reduction>0?val('editChargeFrom'):null,
      p_adjustment_end:val('editAdjEnd')||null,
      p_expiry_action:document.getElementById('editExpiry').value,
      p_access_start:val('editChargeFrom')
    });
    if(error){st.textContent=error.message;return;}
    st.textContent=`Saved. New amount: ${money(data.amount_due_cents)} · next renewal ${niceDate(data.next_renewal)}.`;
    setTimeout(()=>renderPlatformProspects(),700);
  };
}

async function renderPlatformOnboarding(manualOnly=false){
  const page=document.getElementById('platformPage');
  page.innerHTML=`<div class="splash">Loading ${manualOnly?'custom setup':'onboarding'}…</div>`;
  const [{data:settings,error:settingsError},{data:calendars,error:calendarError},{data:onboarding,error:onboardingError},{data:interested,error:interestedError},{data:trials,error:trialsError}]=await Promise.all([
    supabase.from('platform_settings').select('*').eq('singleton',true).single(),
    loadSubscriptionCalendars(),
    supabase.from('club_prospects').select('*').order('created_at',{ascending:false}),
    supabase.from('sales_prospects').select('*').eq('status','interested').order('updated_at',{ascending:false}),
    supabase.from('club_trials').select('*').order('created_at',{ascending:false})
  ]);
  const loadError=settingsError||calendarError||onboardingError||interestedError||trialsError;
  if(loadError){page.innerHTML=`<div class="notice">${esc(loadError.message)}</div>`;return;}

  const records=onboarding||[];
  if(platformSelectedOnboardingId){
    const p=records.find(x=>x.id===platformSelectedOnboardingId);
    if(p){await renderPlatformOnboardingDetail(p);return;}
  }

  const today=new Date().toISOString().slice(0,10);
  const defaultCalendar=(calendars||[]).some(c=>c.code==='australia')?'australia':(calendars?.[0]?.code||'');
  const seed=platformOnboardingSeed;
  const ready=interested||[];
  const trialMap=new Map((trials||[]).map(t=>[t.onboarding_prospect_id,t]));

  page.innerHTML=`${manualOnly?'<div class="btnrow"><button class="btn ghost" id="backToClubPipeline">← Club Pipeline</button></div>':'<section class="platform-flow-card"><div class="section-label">Club Trial progress</div><h2>Interested → invitation sent → trial activated → Club Admin handoff</h2><p>Normal Club Trial onboarding is automatic. Platform Admin only needs to step in when contact details are missing or a club asks for help.</p></section>'}
    ${!manualOnly&&ready.length&&!seed?`<section class="admin-card"><div class="admin-card-head"><div><div class="section-label">Needs attention</div><h2>${ready.length} club${ready.length===1?'':'s'}</h2></div></div><div class="ready-onboarding-list">${ready.map(x=>`<button class="sales-prospect-row" data-open-interested-prospect="${x.id}"><span class="sales-prospect-main"><strong>${esc(x.club_name)}</strong><small>${esc(x.contact_email||'A Club Contact email is required')}</small></span><span class="sales-status interested">${x.contact_email?'Check setup':'Add email'}</span><span class="sales-arrow">›</span></button>`).join('')}</div></section>`:''}
    ${!manualOnly?`<section class="admin-card"><div class="section-label">Onboarding progress</div><h2>Club Trials & handoffs</h2><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Club</th><th>Progress</th><th>Trial</th><th>Contact</th><th></th></tr></thead><tbody>${records.filter(x=>x.status!=='active').map(x=>{const t=trialMap.get(x.id);return `<tr><td><strong>${esc(x.club_name)}</strong><small>${esc(t?'Club Trial':x.entry_route.replaceAll('_',' '))}</small></td><td><span class="status-pill">${esc(onboardingProgressLabel(x,t))}</span></td><td>${esc(t?trialTimingLabel(t):niceDate(x.offer_end))}</td><td>${esc(x.primary_contact_email)}</td><td><button class="btn ghost" data-manage-onboarding="${x.id}">View</button></td></tr>`;}).join('')||'<tr><td colspan="5">No clubs currently onboarding.</td></tr>'}</tbody></table></div></section>`:''}

    <details class="admin-card form-wide onboarding-create" ${manualOnly||seed?'open':''}>
      <summary><div><div class="section-label">Admin exception</div><h2>${seed?`Custom onboarding for ${esc(seed.club_name)}`:'Create custom onboarding manually'}</h2><p>Normal interested clubs do not use this form. Open it only for a special manual or Beta arrangement.</p></div><span>⌄</span></summary>
      <div class="collapsible-admin-body">
        <div class="field"><label>Entry route</label><select id="entryRoute"><option value="standard" ${(seed?.intended_route||'standard')==='standard'?'selected':''}>Standard subscription — Club Contact first</option><option value="direct_beta" ${seed?.intended_route==='direct_beta'?'selected':''}>Direct Beta — trial lead becomes initial Admin</option><option value="full_flow_beta" ${seed?.intended_route==='full_flow_beta'?'selected':''}>Full-flow Beta — Club Contact handoff, $0 test flow</option></select></div>
        <div id="entryRouteHelp" class="notice compact"></div>
        <div class="form-grid">
          <div class="field"><label>Club name</label><input id="newClubName" value="${esc(seed?.club_name||'')}"></div>
          <div class="field"><label id="contactNameLabel">Club Secretary / contact name</label><input id="newContactName" value="${esc(seed?.contact_name||'')}"></div>
          <div class="field"><label id="contactEmailLabel">Club Secretary / contact email</label><input id="newContactEmail" type="email" value="${esc(seed?.contact_email||'')}"></div>
          <div class="field"><label>Subscription calendar</label><select id="subscriptionCalendar">${calendarOptions(calendars,defaultCalendar)}</select><small>Sets the club's universal annual renewal date.</small></div>
          <div class="field"><label>Access starts</label><input id="accessStart" type="date" value="${today}"><small>Normally the activation/payment date.</small></div>
        </div>
        <div class="commercial-box">
          <div class="section-label">Private commercial terms</div><p class="help">These controls never appear to normal clubs. <strong>0% reduction = full standard price. 100% reduction = complimentary.</strong></p>
          <div class="form-grid"><div class="field"><label>Private rate reduction</label><input id="adjustmentPct" type="number" min="0" max="100" value="${seed?.intended_route&&seed.intended_route!=='standard'?'100':'0'}"></div><div class="field"><label>Custom rate end date (optional)</label><input id="adjustmentEnd" type="date"><small>Only used for a temporary custom rate.</small></div><div class="field"><label>At expiry</label><select id="expiryAction"><option value="renewal_approval">Require renewal approval</option><option value="return_standard">Return to standard rate</option><option value="end_subscription">End subscription</option></select></div></div>
          <div class="field"><label>Internal note</label><textarea id="internalNote">${esc(seed?`Started from Club Pipeline${seed.notes?` — ${seed.notes}`:''}`:'')}</textarea></div>
        </div>
        <div class="commercial-calculation"><div class="section-label">Calculated offer</div><div id="newClubOfferPreview"><div class="help">Calculating…</div></div></div>
        <div class="btnrow"><button class="btn secondary" id="createProspect">Create custom onboarding</button>${seed?'<button class="btn ghost" id="cancelOnboardingSeed">Cancel</button>':''}<span class="status" id="createProspectStatus"></span></div>
        <div id="createdProspectResult"></div>
      </div>
    </details>`;

  document.getElementById('backToClubPipeline')?.addEventListener('click',()=>renderPlatformProspects());
  page.querySelectorAll('[data-manage-onboarding]').forEach(b=>b.onclick=()=>{platformSelectedOnboardingId=b.dataset.manageOnboarding;renderPlatformProspects();});
  page.querySelectorAll('[data-open-interested-prospect]').forEach(b=>b.onclick=()=>{platformSelectedProspectId=b.dataset.openInterestedProspect;platformView='home';renderPlatformConsole();});
  if(document.getElementById('cancelOnboardingSeed'))document.getElementById('cancelOnboardingSeed').onclick=()=>{platformOnboardingSeed=null;manualOnly?renderPlatformProspects():renderPlatformOnboarding();};

  const route=document.getElementById('entryRoute');
  const updateRoute=()=>{
    const beta=route.value!=='standard';
    document.getElementById('contactNameLabel').textContent=route.value==='direct_beta'?'Trial lead name':'Club Secretary / contact name';
    document.getElementById('contactEmailLabel').textContent=route.value==='direct_beta'?'Trial lead email':'Club Secretary / contact email';
    document.getElementById('entryRouteHelp').innerHTML=route.value==='full_flow_beta'
      ?'<strong>Full-flow Beta:</strong> no payment is taken, but the club still tests the real Club Contact → Club Admin handoff.'
      :route.value==='direct_beta'
        ?'<strong>Direct Beta:</strong> skip the organisational handoff and make the trial lead the initial Club Admin.'
        :'<strong>Standard subscription:</strong> the Club Contact approves, nominates the payer if needed, payment is completed, then the Club Contact nominates the Club Admin.';
    if(beta&&Number(val('adjustmentPct')||0)!==100){document.getElementById('adjustmentPct').value=100;}
  };
  const refreshPreview=async()=>{
    const box=document.getElementById('newClubOfferPreview');box.innerHTML='<div class="help">Calculating…</div>';
    const {data,error}=await getCommercialPreview(document.getElementById('subscriptionCalendar').value,val('accessStart'),Number(val('adjustmentPct')||0),val('adjustmentEnd')||'');
    box.innerHTML=error?`<div class="notice compact">${esc(error.message)}</div>`:commercialPreviewHtml(data);
  };
  route.onchange=()=>{updateRoute();refreshPreview();};
  ['subscriptionCalendar','accessStart','adjustmentPct','adjustmentEnd'].forEach(id=>{document.getElementById(id).onchange=refreshPreview;if(id==='adjustmentPct')document.getElementById(id).oninput=refreshPreview;});
  updateRoute();await refreshPreview();

  document.getElementById('createProspect').onclick=async()=>{
    const st=document.getElementById('createProspectStatus');st.textContent='Creating…';
    const reduction=Number(val('adjustmentPct')||0);
    const {data,error}=await supabase.rpc('platform_create_prospect',{
      p_club_name:val('newClubName'),p_entry_route:route.value,p_contact_name:val('newContactName'),p_contact_email:val('newContactEmail'),
      p_subscription_calendar:document.getElementById('subscriptionCalendar').value,p_access_start:val('accessStart'),p_adjustment_percent:reduction,
      p_adjustment_start:reduction>0?val('accessStart'):null,p_adjustment_end:val('adjustmentEnd')||null,p_expiry_action:document.getElementById('expiryAction').value,p_internal_note:val('internalNote')
    });
    if(error){st.textContent=error.message;return;}
    if(seed){
      const {error:linkError}=await supabase.rpc('platform_link_sales_onboarding',{p_sales_prospect_id:seed.id,p_onboarding_prospect_id:data.prospect_id});
      if(linkError){st.textContent=`Onboarding created, but prospect link failed: ${linkError.message}`;return;}
    }
    st.textContent='Created';
    const link=`${location.origin}${location.pathname}?prospect=${data.public_token}`;
    document.getElementById('createdProspectResult').innerHTML=`<div class="created-offer"><strong>Formal invitation ready</strong><span>Amount: ${esc(money(data.amount_due_cents,data.currency))}</span><span>Access through: ${esc(niceDate(data.offer_end))}</span><span>Next renewal: ${esc(niceDate(data.next_renewal))}</span><input id="createdLink" value="${esc(link)}" readonly><button class="btn ghost" id="copyCreatedLink">Copy invitation link</button><small>The invitation also appears in Club Pipeline email history.</small></div>`;
    document.getElementById('copyCreatedLink').onclick=async()=>{await navigator.clipboard.writeText(link);document.getElementById('copyCreatedLink').textContent='Copied ✓';};
    platformOnboardingSeed=null;
    await kickLiveEmailDelivery();
  };
}

async function openBetaReonboardDialog(targetClub){
  if(platformRole!=='owner')return;
  document.getElementById('betaReonboardDialog')?.remove();
  const dialog=document.createElement('dialog');
  dialog.id='betaReonboardDialog';
  dialog.style.cssText='max-width:720px;width:calc(100% - 32px);border:0;border-radius:16px;padding:0;box-shadow:0 20px 60px rgba(20,32,80,.28)';
  document.body.appendChild(dialog);

  const name=targetClub?.name||'this club';
  dialog.innerHTML=`<div style="padding:24px 26px">
    <div class="section-label">Full-flow Beta reset</div>
    <h2 style="margin:4px 0 8px">Re-onboard ${esc(name)} as Beta</h2>
    <div class="notice" style="margin-top:14px"><strong>This is a destructive Beta-testing action, not a normal club workflow.</strong><br><br>The current pilot club will be moved out of the live product and retained as a Platform Admin archive. Its existing cricket data is <strong>not hard-deleted</strong>. Normal club access, player sign-up links, active players, Playing Groups and rollout requirements are retired so nobody keeps using the pilot by accident.<br><br>Club Batting will then create a brand-new <strong>Full-flow Beta</strong> invitation using the real Club Contact → Club Admin handoff. When that invitation is completed, a fresh club with a new club ID is created.</div>
    <div class="form-grid" style="margin-top:18px">
      <div class="field"><label>Club Contact name</label><input id="betaReonboardContactName" placeholder="e.g. Club Secretary"></div>
      <div class="field"><label>Club Contact email</label><input id="betaReonboardContactEmail" type="email" placeholder="name@club.com.au"></div>
    </div>
    <div class="field"><label>Internal note (optional)</label><textarea id="betaReonboardNote" placeholder="e.g. Newcastle City full end-to-end Beta test"></textarea></div>
    <div class="field" style="margin-top:16px"><label>Type <strong>${esc(name)}</strong> to confirm</label><input id="betaReonboardConfirm" autocomplete="off"></div>
    <div class="help">The old pilot remains retained in the database for recovery/audit and disappears from normal club switching. There is no one-click restore because the replacement club will be a separate, genuinely clean club.</div>
    <div class="btnrow" style="margin-top:18px"><button class="btn secondary" id="startBetaReonboard" disabled>Archive pilot & start Beta</button><button class="btn ghost" id="cancelBetaReonboard">Cancel</button><span class="status" id="betaReonboardStatus"></span></div>
    <div id="betaReonboardResult"></div>
  </div>`;

  const confirmInput=dialog.querySelector('#betaReonboardConfirm');
  const startButton=dialog.querySelector('#startBetaReonboard');
  const status=dialog.querySelector('#betaReonboardStatus');
  const updateReady=()=>{startButton.disabled=confirmInput.value!==name;};
  confirmInput.addEventListener('input',updateReady);
  dialog.querySelector('#cancelBetaReonboard').onclick=()=>dialog.close();
  dialog.onclick=e=>{if(e.target===dialog)dialog.close();};

  startButton.onclick=async()=>{
    const contactEmail=dialog.querySelector('#betaReonboardContactEmail').value.trim();
    const contactName=dialog.querySelector('#betaReonboardContactName').value.trim();
    if(!contactEmail || !contactEmail.includes('@')){status.textContent='Enter the Club Contact email.';return;}
    if(confirmInput.value!==name){status.textContent='Type the club name exactly to confirm.';return;}
    const finalCheck=confirm(`Archive the current ${name} pilot and start a completely fresh Full-flow Beta?\n\nThe pilot data will remain archived, but normal users will lose access to that old club.`);
    if(!finalCheck)return;

    startButton.disabled=true;startButton.textContent='Archiving pilot…';status.textContent='';
    const {data,error}=await supabase.rpc('platform_reonboard_club_as_beta',{
      p_club_id:targetClub.id,
      p_contact_name:contactName,
      p_contact_email:contactEmail,
      p_confirmation:name,
      p_internal_note:dialog.querySelector('#betaReonboardNote').value.trim()
    });
    if(error){startButton.disabled=false;startButton.textContent='Archive pilot & start Beta';status.textContent=error.message;return;}

    allMemberships=allMemberships.filter(m=>m.club_id!==targetClub.id);
    localStorage.setItem('bdp-context','platform');
    if(localStorage.getItem('bdp-club-id')===targetClub.id)localStorage.removeItem('bdp-club-id');
    await kickLiveEmailDelivery();

    const link=`${location.origin}${location.pathname}?prospect=${data.public_token}`;
    status.textContent='Beta onboarding created ✓';
    dialog.querySelector('#betaReonboardResult').innerHTML=`<div class="created-offer" style="margin-top:16px"><strong>Pilot archived. Full-flow Beta invitation ready.</strong><span>Sent / queued for: ${esc(contactEmail)}</span><span>The replacement club will be created only when the real onboarding flow is completed.</span><input id="betaReonboardLink" value="${esc(link)}" readonly><button class="btn ghost" id="copyBetaReonboardLink">Copy invitation link</button><small>The old club remains available only as a Platform Admin Beta archive.</small></div>`;
    dialog.querySelector('#copyBetaReonboardLink').onclick=async()=>{await navigator.clipboard.writeText(link);dialog.querySelector('#copyBetaReonboardLink').textContent='Copied ✓';};
    startButton.style.display='none';
    dialog.querySelector('#cancelBetaReonboard').textContent='Close';
  };

  dialog.addEventListener('close',()=>{dialog.remove();renderPlatformActiveClubs();},{once:true});
  dialog.showModal();
}

async function renderPlatformActiveClubs(){
  const page=document.getElementById('platformPage');page.innerHTML='<div class="splash">Loading active clubs…</div>';
  const [{data:subs,error:subsError},{data:clubs,error:clubsError},{data:calendars,error:calendarError},{data:settings,error:settingsError},{data:betaArchives,error:archiveError},{data:trials,error:trialError}]=await Promise.all([
    supabase.from('club_subscriptions').select('*,clubs(id,name,archived_at)').in('status',['active','grace']).order('active_until'),
    supabase.from('clubs').select('id,name,subscription_calendar,season_start,season_end,archived_at').order('name'),
    loadSubscriptionCalendars(),
    supabase.from('platform_settings').select('*').eq('singleton',true).single(),
    supabase.from('club_beta_reonboarding_archives').select('*').order('started_at',{ascending:false}).limit(30),
    supabase.from('club_trials').select('*').order('ends_on',{ascending:true})
  ]);

  const loadError=subsError||clubsError||calendarError||settingsError||archiveError||trialError;
  if(loadError){page.innerHTML=`<div class="notice">${esc(loadError.message)}</div>`;return;}

  const visibleSubs=(subs||[]).filter(s=>!s.clubs?.archived_at);
  const liveClubs=(clubs||[]).filter(c=>!c.archived_at);
  const calendarMap=new Map((calendars||[]).map(c=>[c.code,c]));
  const activeIds=new Set(visibleSubs.map(s=>s.club_id));
  const unactivated=liveClubs.filter(c=>!activeIds.has(c.id));
  const trialMap=new Map((trials||[]).filter(t=>t.club_id).map(t=>[t.club_id,t]));
  const activeTrials=(trials||[]).filter(t=>['offered','active','conversion_requested'].includes(t.status));
  const canCommercial=['owner','commercial_admin'].includes(platformRole);
  const canReonboard=platformRole==='owner';
  const today=new Date().toISOString().slice(0,10);
  const defaultCalendar=(calendars||[]).some(c=>c.code==='australia')?'australia':(calendars?.[0]?.code||'');

  page.innerHTML=`<section class="admin-card">
    <div class="section-label">Private commercial management</div><h2>Active clubs</h2>
    <div class="help">Annual access is based on the club's regional <strong>Club Year</strong>, not its playing season. Clubs do not see the private rate-reduction percentage.</div>
    <div class="active-club-list">${visibleSubs.map(s=>{
      const cal=calendarMap.get(s.subscription_calendar);
      const renewal=nextDayIso(s.season_end);
      return `<div class="active-club-row">
        <div><strong>${esc(s.clubs?.name||'Club')}</strong><small>${esc(cal?.label||s.subscription_calendar||'Club Year')} · Club Year ${esc(niceDate(s.season_start))} – ${esc(niceDate(s.season_end))} · annual renewal ${esc(niceDate(renewal))}</small>${trialMap.get(s.club_id)?`<small class="trial-inline-status"><b>Club Trial · ${esc(String(trialMap.get(s.club_id).status).replaceAll('_',' '))}</b> · ${esc(niceDate(trialMap.get(s.club_id).starts_on))} – ${esc(niceDate(trialMap.get(s.club_id).ends_on))}</small>`:''}</div>
        <div class="active-club-controls">
          <label>Rate reduction %<input data-sub-adjust="${s.club_id}" type="number" min="0" max="100" value="${esc(s.adjustment_percent)}"><small>0 = full price · 100 = free</small></label>
          <label>Special rate ends<input data-sub-adjend="${s.club_id}" type="date" value="${esc(s.adjustment_end?String(s.adjustment_end).slice(0,10):'')}"></label>
          <label>Current access to<input data-sub-active="${s.club_id}" type="date" value="${esc(String(s.active_until).slice(0,10))}"></label>
          <label>At expiry<select data-sub-expiry="${s.club_id}"><option value="renewal_approval" ${s.expiry_action==='renewal_approval'?'selected':''}>Renewal approval</option><option value="return_standard" ${s.expiry_action==='return_standard'?'selected':''}>Return standard</option><option value="end_subscription" ${s.expiry_action==='end_subscription'?'selected':''}>End</option></select></label>
          ${canCommercial?`<button class="btn ghost" data-save-sub="${s.club_id}">Save</button>`:''}
          ${canReonboard?`<button class="btn ghost danger-lite" data-reonboard-beta="${s.club_id}">Re-onboard as Beta</button>`:''}
        </div>
      </div>`;
    }).join('')||'<div class="notice">No commercially activated clubs yet.</div>'}</div>
  </section>

  ${activeTrials.length?`<section class="admin-card" style="margin-top:16px"><div class="section-label">Club Trials</div><h2>${activeTrials.length} current trial${activeTrials.length===1?'':'s'}</h2><div class="message-list">${activeTrials.map(t=>`<div class="message-row"><div><strong>${esc((liveClubs.find(c=>c.id===t.club_id)?.name)||'Trial club')}</strong><small>${esc(niceDate(t.starts_on))} – ${esc(niceDate(t.ends_on))} · ${esc(money(t.annual_price_cents,t.currency||'AUD'))}/year if continued</small></div><div><span class="status-pill">${esc(String(t.status).replaceAll('_',' '))}</span></div></div>`).join('')}</div></section>`:''}

  ${betaArchives?.length?`<details class="admin-card" style="margin-top:16px"><summary><strong>Beta archives</strong> · ${betaArchives.length}</summary><div class="help" style="margin-top:12px">These are retired pilot clubs retained for audit/reference. They are hidden from normal club switching and are not part of the live Beta.</div><div class="message-list" style="margin-top:12px">${betaArchives.map(a=>`<div class="message-row"><div><strong>${esc(a.original_name)}</strong><small>Archived ${esc(niceDate(a.started_at))} · invitation ${esc(a.contact_email)} · ${a.replacement_club_id?'replacement club activated':'onboarding in progress'}</small></div><div><span class="status-pill">${a.replacement_club_id?'Completed':'Beta onboarding'}</span></div></div>`).join('')}</div></details>`:''}

  ${unactivated.length?`<section class="admin-card form-wide" style="margin-top:16px">
    <div class="section-label">Existing club migration</div><h2>Attach commercial terms to an existing club</h2>
    <div class="notice"><strong>Use this for clubs created before commercial onboarding existed.</strong><br>This attaches an annual entitlement to the existing club. It does not recreate the club and does not touch players, philosophy work or permissions.</div>
    ${canCommercial?`
      <div class="form-grid">
        <div class="field"><label>Existing club</label><select id="legacyClubId">${unactivated.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Subscription calendar</label><select id="legacyCalendar">${calendarOptions(calendars,unactivated[0]?.subscription_calendar||defaultCalendar)}</select></div>
        <div class="field"><label>Access starts</label><input id="legacyAccessStart" type="date" value="${today}"></div>
        <div class="field"><label>Private rate reduction from standard price</label><input id="legacyReduction" type="number" min="0" max="100" value="0"><small>0% = full standard price · 100% = free</small></div>
        <div class="field"><label>Special rate ends (optional)</label><input id="legacyAdjustmentEnd" type="date"></div>
        <div class="field"><label>At expiry</label><select id="legacyExpiry"><option value="renewal_approval">Require renewal approval</option><option value="return_standard">Return to standard rate</option><option value="end_subscription">End subscription</option></select></div>
      </div>
      <div class="field"><label>Internal note</label><textarea id="legacyNote" placeholder="e.g. Existing pilot club migrated into commercial model"></textarea></div>
      <div class="commercial-calculation"><div class="section-label">Calculated entitlement</div><div id="legacyOfferPreview"><div class="help">Calculating…</div></div></div>
      <div class="btnrow"><button class="btn secondary" id="activateExistingClub">Activate existing club</button><span class="status" id="legacyActivateStatus"></span></div>
    `:'<div class="help">Only Platform Owner / Commercial Admin can attach commercial terms.</div>'}
  </section>`:''}`;

  page.querySelectorAll('[data-reonboard-beta]').forEach(b=>b.onclick=()=>{
    const s=visibleSubs.find(x=>String(x.club_id)===String(b.dataset.reonboardBeta));
    if(!s)return;
    openBetaReonboardDialog({id:s.club_id,name:s.clubs?.name||'Club'});
  });

  page.querySelectorAll('[data-save-sub]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.saveSub;
    b.textContent='Saving…';
    const {error}=await supabase.rpc('platform_update_subscription_terms',{
      p_club_id:id,
      p_adjustment_percent:Number(document.querySelector(`[data-sub-adjust="${id}"]`).value||0),
      p_adjustment_start:null,
      p_adjustment_end:document.querySelector(`[data-sub-adjend="${id}"]`).value||null,
      p_expiry_action:document.querySelector(`[data-sub-expiry="${id}"]`).value,
      p_active_until:document.querySelector(`[data-sub-active="${id}"]`).value
    });
    b.textContent=error?'Error':'Saved ✓';if(error)alert(error.message);
  });

  if(document.getElementById('activateExistingClub')){
    const selectedClub=()=>unactivated.find(c=>c.id===document.getElementById('legacyClubId').value);
    const syncLegacyCalendar=()=>{
      const c=selectedClub();
      if(c?.subscription_calendar && (calendars||[]).some(x=>x.code===c.subscription_calendar))document.getElementById('legacyCalendar').value=c.subscription_calendar;
    };
    const refreshLegacyPreview=async()=>{
      const box=document.getElementById('legacyOfferPreview');box.innerHTML='<div class="help">Calculating…</div>';
      const {data,error}=await getCommercialPreview(
        document.getElementById('legacyCalendar').value,
        val('legacyAccessStart'),
        Number(val('legacyReduction')||0),
        val('legacyAdjustmentEnd')||''
      );
      box.innerHTML=error?`<div class="notice compact">${esc(error.message)}</div>`:commercialPreviewHtml(data);
    };
    document.getElementById('legacyClubId').onchange=()=>{syncLegacyCalendar();refreshLegacyPreview();};
    ['legacyCalendar','legacyAccessStart','legacyReduction','legacyAdjustmentEnd'].forEach(id=>{
      document.getElementById(id).onchange=refreshLegacyPreview;
      if(id==='legacyReduction')document.getElementById(id).oninput=refreshLegacyPreview;
    });
    await refreshLegacyPreview();

    document.getElementById('activateExistingClub').onclick=async()=>{
      const st=document.getElementById('legacyActivateStatus');
      const btn=document.getElementById('activateExistingClub');
      const c=selectedClub();
      const reduction=Number(val('legacyReduction')||0);
      const ok=confirm(`Attach commercial terms to ${c?.name||'this club'}? This keeps the existing club and all of its cricket data.`);
      if(!ok)return;
      btn.disabled=true;btn.textContent='Activating…';st.textContent='';
      const {data,error}=await supabase.rpc('platform_activate_existing_club',{
        p_club_id:document.getElementById('legacyClubId').value,
        p_subscription_calendar:document.getElementById('legacyCalendar').value,
        p_access_start:val('legacyAccessStart'),
        p_adjustment_percent:reduction,
        p_adjustment_end:val('legacyAdjustmentEnd')||null,
        p_expiry_action:document.getElementById('legacyExpiry').value,
        p_internal_note:val('legacyNote')
      });
      if(error){btn.disabled=false;btn.textContent='Activate existing club';st.textContent=error.message;return;}
      st.textContent=`Activated through ${niceDate(data.active_until)}.`;
      setTimeout(()=>renderPlatformActiveClubs(),700);
    };
  }
}

async function renderPlatformOutbox(){
  const page=document.getElementById('platformPage');
  page.innerHTML='<div class="splash">Loading email history…</div>';
  const [messageRes,settingsRes]=await Promise.all([
    loadAllPlatformRows(()=>supabase.from('outbound_messages').select('id,recipient_email,template_key,subject,club_name:payload->>club_name,provider_name,created_at,processing_at,sent_at,failed_at,last_error,hidden_from_platform_queue').order('created_at',{ascending:false}).order('id')),
    supabase.from('platform_settings').select('email_mode,email_provider,email_from_name,email_from_address,email_reply_to,email_live_from').eq('singleton',true).single()
  ]);
  const loadError=messageRes.error||settingsRes.error;
  if(loadError){page.innerHTML=`<div class="notice">${esc(loadError.message)}</div>`;return;}
  const messages=messageRes.data||[];
  const settings=settingsRes.data||{};
  const exceptions=messages.filter(message=>outboundMessageNeedsAttention(message,settings));
  const sentCount=messages.filter(message=>outboundMessageState(message,settings)==='sent').length;

  page.innerHTML=`<div class="btnrow"><button class="btn ghost" id="backFromEmailHistory">← Club Pipeline</button></div>
    <section class="admin-card form-wide">
      <div class="admin-card-head"><div><div class="section-label">Email history</div><h2>Delivery audit</h2><p class="help">Search routine delivery history here. Failed or delayed emails also appear in Club Pipeline → Needs attention.</p></div><div class="btnrow"><span class="status-pill">${sentCount} sent</span><span class="status-pill">${exceptions.length} need attention</span></div></div>
      <div class="prospect-filter-row" style="margin-top:16px"><input id="emailHistorySearch" placeholder="Search subject, recipient, club or message type"><select id="emailHistoryFilter"><option value="all">All messages</option><option value="attention">Needs attention</option><option value="sent">Sent</option><option value="active">Recently queued / sending</option><option value="prototype-only">Prototype history</option></select></div>
      <div class="admin-table-wrap" style="margin-top:14px"><table class="admin-table"><thead><tr><th>Date</th><th>Message</th><th>Recipient</th><th>Status</th><th>Provider</th><th></th></tr></thead><tbody id="emailHistoryBody"></tbody></table></div>
      <div id="emailHistoryRetryStatus" class="help" role="status"></div>
    </section>`;

  const renderHistory=()=>{
    const q=String(document.getElementById('emailHistorySearch').value||'').trim().toLowerCase();
    const filter=document.getElementById('emailHistoryFilter').value;
    let shown=messages.filter(message=>{
      const state=outboundMessageState(message,settings);
      if(filter==='attention'&&!outboundMessageNeedsAttention(message,settings))return false;
      if(filter==='sent'&&state!=='sent')return false;
      if(filter==='active'&&(!['queued','sending'].includes(state)||outboundMessageNeedsAttention(message,settings)))return false;
      if(filter==='prototype-only'&&state!=='prototype-only')return false;
      if(q&&![(message.subject||''),message.recipient_email,message.template_key,message.club_name,message.provider_name].some(value=>String(value||'').toLowerCase().includes(q)))return false;
      return true;
    });
    const body=document.getElementById('emailHistoryBody');
    body.innerHTML=shown.length?shown.map(message=>{
      const needsAttention=outboundMessageNeedsAttention(message,settings);
      const date=message.sent_at||message.failed_at||message.created_at;
      return `<tr><td>${esc(date?new Date(date).toLocaleString():'—')}</td><td><strong>${esc(message.subject||outboundTemplateLabel(message.template_key))}</strong><small>${esc(outboundTemplateLabel(message.template_key))}</small>${message.last_error?`<small class="email-error">${esc(message.last_error)}</small>`:''}</td><td>${esc(message.recipient_email||'—')}</td><td><span class="status-pill">${esc(outboundMessageLabel(message,settings))}</span></td><td>${esc(message.provider_name||settings.email_provider||'—')}</td><td>${needsAttention?`<button class="btn ghost compact" data-retry-history-message="${message.id}">Retry delivery</button>`:''}</td></tr>`;
    }).join(''):'<tr><td colspan="6">No email history matches this view.</td></tr>';
    body.querySelectorAll('[data-retry-history-message]').forEach(button=>button.onclick=async()=>{
      const message=messages.find(item=>item.id===button.dataset.retryHistoryMessage);
      button.disabled=true;button.textContent='Retrying…';
      try{
        const result=await retryPlatformDelivery(message,settings);
        await renderPlatformOutbox();
        const status=document.getElementById('emailHistoryRetryStatus');if(status)status.textContent=result;
      }catch(error){
        const status=document.getElementById('emailHistoryRetryStatus');if(status)status.textContent=error.message;
        button.disabled=false;button.textContent='Retry delivery';
      }
    });
  };

  document.getElementById('backFromEmailHistory').onclick=()=>{platformView='home';renderPlatformView();};
  document.getElementById('emailHistorySearch').oninput=renderHistory;
  document.getElementById('emailHistoryFilter').onchange=renderHistory;
  renderHistory();
}

async function renderPlatformSettings(){
  const page=document.getElementById('platformPage');page.innerHTML='<div class="splash">Loading settings…</div>';
  const [{data:s,error},{data:calendars,error:calendarError}]=await Promise.all([
    supabase.from('platform_settings').select('*').eq('singleton',true).single(),
    loadSubscriptionCalendars()
  ]);
  if(error||calendarError){page.innerHTML=`<div class="notice">${esc(error?.message||calendarError?.message)}</div>`;return;}
  const canCommercial=['owner','commercial_admin'].includes(platformRole);
  page.innerHTML=`<section class="admin-card form-wide"><div class="section-label">Platform defaults</div><h2>Commercial settings</h2><div class="form-grid">
    <div class="field"><label>Standard annual club price (${esc(s.currency)})</label><input id="settingPrice" type="number" step="0.01" value="${(s.standard_season_price_cents/100).toFixed(2)}" ${canCommercial?'':'disabled'}><small>This is the full 12-month Club Year price before any private rate reduction.</small></div>
    <div class="field"><label>Full Club Trial length (days)</label><input id="settingTrialDays" type="number" min="1" max="180" value="${Number(s.club_trial_days||60)}" ${canCommercial?'':'disabled'}><small>Default launch model: full product, no payment upfront, explicit decision at the end.</small></div>
    <div class="field"><label>Minimum days before renewal for a pro-rata term</label><input id="settingMinDays" type="number" value="${s.minimum_prorata_days}" ${canCommercial?'':'disabled'}><small>If fewer days remain, those days are included and the club is charged for the next full Club Year instead.</small></div>
    <div class="field"><label>Payment grace period</label><input id="settingGrace" type="number" value="${s.payment_grace_days}" ${canCommercial?'':'disabled'}></div>
    <div class="field"><label>Private-rate expiry warning</label><input id="settingWarn" type="number" value="${s.commercial_adjustment_warning_days}" ${canCommercial?'':'disabled'}></div>
    <div class="field"><label>Payment mode</label><select id="settingMode" ${canCommercial?'':'disabled'}><option value="prototype" ${s.payment_mode==='prototype'?'selected':''}>Prototype — simulate payment</option><option value="live" ${s.payment_mode==='live'?'selected':''}>Live provider</option></select></div>
    <div class="field"><label>Payment provider</label><select id="settingPaymentProvider" ${canCommercial?'':'disabled'}><option value="stripe" ${(s.payment_provider||'stripe')==='stripe'?'selected':''}>Stripe</option></select><small>Hosted Stripe Checkout / invoices. Card data never touches this app.</small></div>
  </div></section>

  <section class="admin-card form-wide"><div class="section-label">Club Batting Guide</div><h2>OpenAI provider</h2><div class="form-grid">
    <div class="field"><label>Guide provider</label><div class="provider-check-box provider-name-box">OpenAI Responses API</div><small>The provider key and model are stored only in Supabase Edge Function Secrets.</small></div>
    <div class="field"><label>Provider status</label><div class="provider-check-box" id="guideProviderCheck">Not checked</div><button class="btn ghost provider-check-btn" id="checkGuideProvider">Check Guide provider</button></div>
  </div><div class="notice"><strong>Club Batting Guide policy:</strong> tutorials are available on demand and in context. Proactive guidance only appears when a meaningful adoption gap is detected. Guide email escalation remains disabled.</div></section>

  <section class="admin-card form-wide"><div class="section-label">Market discovery support</div><h2>Search fallback provider</h2><div class="form-grid">
    <div class="field"><label>Discovery provider</label><select id="settingDiscoveryProvider" ${canCommercial?'':'disabled'}><option value="brave" ${(s.discovery_provider||'brave')==='brave'?'selected':''}>Brave Search API</option></select><small>Official cricket directories are primary. Brave resolves association/club websites and fills gaps. The key stays in Supabase Edge Function Secrets as <strong>BRAVE_SEARCH_API_KEY</strong>.</small></div>
    <div class="field"><label>Provider status</label><div class="provider-check-box" id="discoveryProviderCheck">Not checked</div><button class="btn ghost provider-check-btn" id="checkDiscoveryProvider">Check discovery provider</button></div>
  </div><div class="notice"><strong>Discovery and outreach stay separate.</strong><br>Market Discovery can persist association and club records automatically, but no discovered club is contacted until a Platform Admin deliberately selects it and chooses <strong>Invite selected</strong>.</div></section>

  <details class="admin-card form-wide"><summary><div><div class="section-label">Provider setup</div><h2>Email delivery settings</h2><p>Open only when changing the Resend sender or delivery mode. Routine history and exceptions live in Club Pipeline.</p></div><span>⌄</span></summary><div class="collapsible-admin-body"><div class="form-grid" style="margin-top:16px">
    <div class="field"><label>Email mode</label><select id="settingEmailMode" ${canCommercial?'':'disabled'}><option value="prototype" ${(s.email_mode||'prototype')==='prototype'?'selected':''}>Prototype queue</option><option value="live" ${s.email_mode==='live'?'selected':''}>Live provider</option></select><small>Use Live only after the sending domain and Database Webhook are configured.</small></div>
    <div class="field"><label>Email provider</label><select id="settingEmailProvider" ${canCommercial?'':'disabled'}><option value="resend" ${(s.email_provider||'resend')==='resend'?'selected':''}>Resend</option></select><small>The API key is stored only in Supabase Edge Function Secrets as <strong>RESEND_API_KEY</strong>.</small></div>
    <div class="field"><label>From name</label><input id="settingEmailFromName" value="${esc(s.email_from_name||'Club Batting')}" ${canCommercial?'':'disabled'}></div>
    <div class="field"><label>From email</label><input id="settingEmailFromAddress" type="email" value="${esc(s.email_from_address||'onboarding@resend.dev')}" ${canCommercial?'':'disabled'}><small><strong>onboarding@resend.dev</strong> is testing-only. Once <strong>clubbatting.com</strong> is verified in Resend, use <strong>notifications@clubbatting.com</strong>.</small></div>
    <div class="field"><label>Reply-to email</label><input id="settingEmailReplyTo" type="email" value="${esc(s.email_reply_to||'')}" ${canCommercial?'':'disabled'}><small>Use an address you actually monitor so Club Secretaries can simply reply.</small></div>
    <div class="field"><label>Provider status</label><div class="provider-check-box" id="emailProviderCheck">Not checked</div><button class="btn ghost provider-check-btn" id="checkEmailProvider">Check email provider</button></div>
  </div>
  <div class="notice"><strong>Automatic delivery.</strong><br>Supabase owns the workflow and queue, and Resend delivers email. A Database Webhook on <strong>outbound_messages → INSERT</strong> calls <strong>dispatch-outbox</strong>. Failed or delayed messages surface in <strong>Club Pipeline → Needs attention</strong>; routine messages remain in Email history.</div></div></details>

  <section class="admin-card form-wide"><div class="section-label">Regional Club Years</div><h2>Renewal calendars</h2><p class="help">These universal renewal dates give clubs access before their playing season instead of trying to identify each club's exact season start and finish.</p><div class="calendar-list">${(calendars||[]).map(c=>`<div><strong>${esc(c.label)}</strong><span>Club Year renews ${esc(calendarStartLabel(c))}</span></div>`).join('')}</div></section>
  ${canCommercial?'<button class="btn secondary" id="savePlatformSettings">Save settings</button>':''}<div id="settingsStatus" class="help"></div>`;

  document.getElementById('checkDiscoveryProvider').onclick=async()=>{
    const box=document.getElementById('discoveryProviderCheck');box.textContent='Checking…';
    const {data,error}=await supabase.functions.invoke('discover-clubs',{body:{action:'status'}});
    box.textContent=error?'Function unavailable':(data?.configured?'Connected ✓':'Function deployed — API key missing');
    box.classList.toggle('ok',!!data?.configured);box.classList.toggle('bad',!data?.configured);
  };
  document.getElementById('checkEmailProvider').onclick=async()=>{
    const box=document.getElementById('emailProviderCheck');box.textContent='Checking…';
    const {data,error}=await supabase.functions.invoke('dispatch-outbox',{body:{action:'status'}});
    box.textContent=error?'Function unavailable':(data?.configured?`Connected ✓ · ${data.from_address}`:'Function deployed — API key missing');
    box.classList.toggle('ok',!!data?.configured);box.classList.toggle('bad',!data?.configured);
  };
  document.getElementById('checkGuideProvider').onclick=async()=>{
    const box=document.getElementById('guideProviderCheck');box.textContent='Checking…';box.classList.remove('ok','bad');
    try{
      const {data,error}=await supabase.functions.invoke('club-batting-guide',{body:{action:'status'}});
      if(error||data?.error){
        box.textContent=`Function unavailable — ${await edgeFunctionErrorMessage(error,data,'could not connect')}`;
        box.classList.add('bad');return;
      }
      if(data?.configured){
        box.textContent=`Connected ✓ · ${data.provider||'OpenAI'}${data.model?` · ${data.model}`:''}`;
        box.classList.add('ok');return;
      }
      const missing=[];
      if(!data?.api_key_configured)missing.push('OpenAI API key');
      if(!data?.model_configured)missing.push('Guide model');
      box.textContent=`Function deployed — ${missing.length?`${missing.join(' and ')} missing`:'provider not configured'}`;
      box.classList.add('bad');
    }catch(error){
      box.textContent=`Function unavailable — ${error?.message||'could not connect'}`;
      box.classList.add('bad');
    }
  };

  // Provider status is a live check, so refresh it automatically whenever Platform Settings opens.
  document.getElementById('checkGuideProvider').click();
  document.getElementById('checkDiscoveryProvider').click();
  document.getElementById('checkEmailProvider').click();
  if(document.getElementById('savePlatformSettings'))document.getElementById('savePlatformSettings').onclick=async()=>{
    const st=document.getElementById('settingsStatus');st.textContent='Saving…';
    const newEmailMode=document.getElementById('settingEmailMode').value;
    const liveFrom=newEmailMode==='live'
      ? ((s.email_mode==='live'&&s.email_live_from)?s.email_live_from:new Date().toISOString())
      : s.email_live_from;
    const {error}=await supabase.from('platform_settings').update({
      standard_season_price_cents:Math.round(Number(val('settingPrice'))*100),club_trial_days:Number(val('settingTrialDays')||60),minimum_prorata_days:Number(val('settingMinDays')),
      payment_grace_days:Number(val('settingGrace')),commercial_adjustment_warning_days:Number(val('settingWarn')),payment_mode:document.getElementById('settingMode').value,
      payment_provider:document.getElementById('settingPaymentProvider').value,discovery_provider:document.getElementById('settingDiscoveryProvider').value,
      email_mode:newEmailMode,email_provider:document.getElementById('settingEmailProvider').value,
      email_from_name:val('settingEmailFromName'),email_from_address:val('settingEmailFromAddress').trim().toLowerCase(),email_reply_to:val('settingEmailReplyTo').trim().toLowerCase(),email_live_from:liveFrom,updated_at:new Date().toISOString()
    }).eq('singleton',true);
    st.textContent=error?error.message:'Saved';
  };
}

boot();
