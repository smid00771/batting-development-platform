import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Rebuild the complete downloadable demo from the same UI used by the live app.
// No SDK, production configuration, authentication or network bootstrap is embedded.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const inputs=new Map();
const read=file=>{const value=fs.readFileSync(path.join(root,file),'utf8');inputs.set(file,createHash('sha256').update(value).digest('hex'));return value;};
const isolate=text=>text.replace(/\blocalStorage\b/g,'fixtureLocalStorage').replace(/\bsessionStorage\b/g,'fixtureSessionStorage');
const modules=new Map(),definitions=[];
function bundle(file){
 if(modules.has(file))return modules.get(file);
 const id='__demoModule'+modules.size;modules.set(file,id);
 let source=read(file);
 source=source.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm,(_,names,specifier)=>{
  if(!specifier.startsWith('.'))throw Error('External demo dependency: '+specifier);
  const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier.split('?')[0]));
  return 'const {'+names+'}='+bundle(dependency)+';';
 });
 const exports=[...source.matchAll(/^export (?:async )?(?:const|let|function|class) (\w+)/gm)].map(m=>m[1]);
 source=source.replace(/^export\s*\{([^}]+)\}\s*;?\s*$/gm,(_,names)=>{
  for(const name of names.split(',').map(n=>n.trim()).filter(Boolean)){
   const match=/^(\w+)(?:\s+as\s+(\w+))?$/.exec(name);
   if(!match)throw Error('Unsupported named export in '+file);
   exports.push(match[2]?match[2]+':'+match[1]:match[1]);
  }
  return '';
 });
 source=source.replace(/^export /gm,'');
 if(/^import\s|^export\s/m.test(source))throw Error('Unsupported module syntax in '+file);
 definitions.push('const '+id+'=(()=>{\n'+isolate(source).trim()+'\nreturn {'+exports.join(',')+'};\n})();');
 return id;
}
let app=read('app.js');
const bindings=[];
bindings.push('const {createMirelionAssistDemo}='+bundle('mirelion-assist-demo.js')+';');
app=app.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm,(_,names,specifier)=>{
 if(specifier.startsWith('https:')||specifier==='./config.js')return '';
 bindings.push('const {'+names+'}='+bundle(specifier.replace(/^\.\//,'').split('?')[0])+';');return '';
});
for(const [file,name] of Object.entries({'playcricket-team-demo.js':'createScorecardTeamDemo','team-of-week-demo.js':'createTeamWeekDemo','player-of-week-demo.js':'createPlayerWeekDemo','shared-match-results-demo.js':'createSharedResultsDemo','season-stats-demo.js':'createSeasonStatsDemo','social-awards-demo.js':'createSocialAwardsDemo','selection-room.js':'selectionCallLink'}))bindings.push('const {'+name+'}='+bundle(file)+';');
app=app.replace('const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);',"const SUPABASE_URL='https://demo.invalid',SUPABASE_ANON_KEY='demo-unused';\nconst supabase=window.__fixtureDb;");
if(!/\nboot\(\);?\s*$/.test(app))throw Error('Expected live boot() at end of app.js');
app=app.replace(/\nboot\(\);?\s*$/,'\n');
app=app.replace('demo:false','demo:true');
// Product naming in the public demo; service names and permission checks stay intact.
app=app.replaceAll('Club Selections','Mirelion Select');
const version=app.match(/const APP_UI_VERSION='([^']+)'/)[1];
const script=[read('Demo/isolation.js'),...definitions,...bindings,isolate(app),read('Demo/fixtures.js'),read('Demo/current-fixtures.js'),read('Demo/journeys.js')].join('\n\n');
const css=[read('styles.css'),read('app-design.css'),read('Demo/demo.css')].join('\n');
const template=read('Demo/template.html');
const manifest={appVersion:version,sources:Object.fromEntries([...inputs].sort(([a],[b])=>a.localeCompare(b)))};
const output=template.replace('<!-- DEMO_STYLES -->',()=>'<style>'+css+'</style>').replace('<!-- DEMO_SCRIPT -->',()=>'<script>\n'+script.replace(/<\/script/gi,'<\\/script')+'\n</script>').replaceAll('{{APP_VERSION}}',version);
const files={'demo.html':output,'Demo/build-manifest.json':JSON.stringify(manifest,null,2)+'\n'};
let stale=false;
for(const [file,value] of Object.entries(files)){
 if(process.argv.includes('--check')){if(!fs.existsSync(path.join(root,file))||fs.readFileSync(path.join(root,file),'utf8')!==value){console.error(file+' is out of date. Run node Scripts/build-demo.mjs.');stale=true;}}
 else fs.writeFileSync(path.join(root,file),value);
}
if(stale)process.exitCode=1;
else console.log('Mirelion demo matches app '+version+' ('+modules.size+' shared modules).');
