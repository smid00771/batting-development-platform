const clean=value=>String(value??'').trim();
const ordinal=n=>n+(n%100>=11&&n%100<=13?'TH':({1:'ST',2:'ND',3:'RD'}[n%10]||'TH'));
function dateLabel(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
 const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).formatToParts(date),part=type=>parts.find(p=>p.type===type)?.value||'';
 return `${part('weekday')} ${ordinal(Number(part('day')))} ${part('month')}`.toUpperCase();
}
function timeLabel(value){
 const text=clean(value);if(!/^\d{2}:\d{2}$/.test(text))return text.toUpperCase();
 const [hour,minute]=text.split(':').map(Number);
 return `${hour%12||12}${minute?':'+String(minute).padStart(2,'0'):''}${hour<12?'AM':'PM'}`;
}
// Match facts stay in the published fixture; this only formats their graphic overlay.
export function teamSelectionText(card){
 const details=card.f.published.details,round=clean(card.f.round||details.round),opposition=clean(details.opposition),days=details.days||[];
 const roundLabel=round?(/^round\b/i.test(round)?round:'Round '+round):'';
 const selected=card.split?[{day:days[card.day],number:card.day+1}]:days.map((day,i)=>({day,number:i+1}));
 const starts=selected.map(({day})=>timeLabel(day?.start)),sameStart=starts.every(value=>value===starts[0]);
 const start=sameStart?starts[0]:selected.map(({number},i)=>`DAY ${number}: ${starts[i]||'TIME TBC'}`).join(' / ');
 const timeGround=[start,clean(details.ground).toUpperCase()].filter(Boolean).join(' // ');
 return {match:[roundLabel,opposition?'V '+opposition:''].filter(Boolean).join(' ').toUpperCase(),lines:[timeGround,...selected.map(({day})=>dateLabel(day?.date))].filter(Boolean)};
}
