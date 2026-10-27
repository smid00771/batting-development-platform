export const FIELDING_RATINGS=[['unknown','Not assessed'],['needs_work','Needs work'],['reliable','Reliable'],['strong','Strong']];
export const fieldingLabel=person=>FIELDING_RATINGS.find(([key])=>key===person?.fielding)?.[1]||'Not assessed';
