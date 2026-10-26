const encoder=new TextEncoder();
export function escapeText(value){return String(value??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
export function foldLine(line){
 const parts=[];let part='',bytes=0;
 for(const char of line){const n=encoder.encode(char).length;if(bytes+n>75){parts.push(part);part=' ';bytes=1;}part+=char;bytes+=n;}
 parts.push(part);return parts.join('\r\n');
}
const stamp=value=>{const d=new Date(value);return Number.isFinite(+d)?d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'):'19700101T000000Z';};
export function renderCalendar(data){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Club Batting//My matches//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',
  'X-WR-CALNAME:'+escapeText(data.name),'REFRESH-INTERVAL;VALUE=DURATION:PT1H','X-PUBLISHED-TTL:PT1H'];
 for(const row of data.events||[]){
  const e=row.event||{};if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date||''))continue;
  lines.push('BEGIN:VEVENT','UID:'+escapeText(row.uid),'DTSTAMP:'+stamp(row.updated_at),'LAST-MODIFIED:'+stamp(row.updated_at),'SEQUENCE:'+Math.max(0,Number.isInteger(row.sequence)?row.sequence:0));
  if(/^\d{8}T\d{6}Z$/.test(e.start||'')){lines.push('DTSTART:'+e.start);if(/^\d{8}T\d{6}Z$/.test(e.end||'')&&e.end>e.start)lines.push('DTEND:'+e.end);}
  else{const end=new Date(e.date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push('DTSTART;VALUE=DATE:'+e.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replace(/-/g,''));}
  lines.push('SUMMARY:'+escapeText(e.title),'LOCATION:'+escapeText(e.ground),'DESCRIPTION:'+escapeText([e.instructions,'Check the app for the latest team and match arrangements.'].filter(Boolean).join('\n')),
   'STATUS:'+(e.status==='CANCELLED'?'CANCELLED':'CONFIRMED'),'TRANSP:OPAQUE');
  try{const u=new URL(e.url);if(['https://mirelionhq.com','https://clubbatting.com'].includes(u.origin)&&u.pathname==='/app.html')lines.push('URL:'+u.href);}catch{}
  lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';
}
export function createCalendarHandler({feed}){
 return async request=>{
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const token=new URL(request.url).searchParams.get('token');
  if(!/^[0-9a-f]{64}$/.test(token||''))return new Response('Calendar link unavailable',{status:404,headers:{'Cache-Control':'no-store'}});
  try{
   const data=await feed(token);
   if(!data)return new Response('Calendar link unavailable',{status:404,headers:{'Cache-Control':'no-store'}});
   return new Response(request.method==='HEAD'?null:renderCalendar(data),{headers:{
    'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="my-cricket-matches.ics"',
    'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }catch{return new Response('Calendar temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'300'}});}
 };
}
