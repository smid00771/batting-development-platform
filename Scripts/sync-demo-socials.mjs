import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const isolateStorage = text => text.replace(/\blocalStorage\b/g, 'fixtureLocalStorage').replace(/\bsessionStorage\b/g, 'fixtureSessionStorage');
const app = read('app.js');
let demo = read('demo.html');
const original = demo;

function functionSource(source, name) {
  const match = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(source);
  if (!match) return null;
  const tail = source.slice(match.index), next = /\n(?=(?:async )?function |(?:const|let|var) |window\.)/.exec(tail);
  return {start: match.index, text: (next ? tail.slice(0, next.index) : tail).trimEnd()};
}
const extra = [];
for (const name of ['restoreSocialNavigation', 'socialCanLeave', 'socialRefresh', 'socialDraw',
  'socialReviewUpdatedAward', 'socialAdoptResultsWeek', 'socialResultsChanged', 'socialSetResultsWeek']) {
  const from = functionSource(app, name), to = functionSource(demo, name);
  if (!from) throw Error('Missing live function: ' + name);
  const text = isolateStorage(from.text);
  if (['socialReviewUpdatedAward', 'socialSetResultsWeek'].includes(name)) extra.push(text);
  else if (to) demo = demo.slice(0, to.start) + text + demo.slice(to.start + to.text.length);
  else extra.push(text);
}
const unload = /^window\.addEventListener\('beforeunload'.*socialState.*$/m;
demo = demo.replace(unload, () => app.match(unload)[0]);

// Embed complete module dependencies in an isolated scope, preserving their exports.
function moduleBundle(entry, exportedName) {
  const modules = new Map(), definitions = [];
  function visit(file) {
    if (modules.has(file)) return modules.get(file);
    const id = '__demoModule' + modules.size; modules.set(file, id);
    let source = read(file);
    source = source.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, names, specifier) => {
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.split('?')[0]));
      return 'const {' + names + '}=' + visit(dependency) + ';';
    });
    const exports = [...source.matchAll(/^export (?:async )?(?:const|let|function|class) (\w+)/gm)].map(m => m[1]);
    source = source.replace(/^export /gm, '');
    definitions.push('const ' + id + '=(()=>{\n' + isolateStorage(source).trim() + '\nreturn {' + exports.join(',') + '};\n})();');
    return id;
  }
  const module = visit(entry);
  return 'const ' + exportedName + '=(()=>{\n' + definitions.join('\n') + '\nreturn ' + module + '.' + exportedName + ';\n})();';
}
const block = '// BEGIN SHARED SOCIAL AWARDS DEMO\n' + extra.join('\n') + '\n' +
  moduleBundle('social-awards.js', 'createSocialAwards') + '\n' +
  moduleBundle('social-awards-demo.js', 'createSocialAwardsDemo') + '\n' +
  app.slice(app.indexOf('const socialAwards=createSocialAwards'), app.indexOf('const socialPlayerWeek=', app.indexOf('const socialAwards=createSocialAwards'))).trim() + '\n' +
  `const demoSocialAwards=createSocialAwardsDemo(()=>demoSelections,()=>demoSharedResults,()=>demoSocial,()=>membership,()=>session?.user.id);
const demoBeforeAwardsRpc=window.__fixtureDb.rpc;
window.__fixtureDb.rpc=function(name,args){return name==='club_social_awards_api'?demoSocialAwards.rpc(name,args):demoBeforeAwardsRpc.call(this,name,args);};
// END SHARED SOCIAL AWARDS DEMO`;
const marker = /\/\/ BEGIN SHARED SOCIAL AWARDS DEMO[\s\S]*?\/\/ END SHARED SOCIAL AWARDS DEMO/;
if (marker.test(demo)) demo = demo.replace(marker, () => block);
else demo = demo.replace('window.demoReady=startClubDemo();', () => block + '\n\nwindow.demoReady=startClubDemo();');

if (process.argv.includes('--check')) {
  if (demo !== original) {console.error('Demo social awards differ from the shared source. Run node Scripts/sync-demo-socials.mjs.'); process.exitCode = 1;}
} else {fs.writeFileSync(path.join(root, 'demo.html'), demo); console.log('Demo uses the current shared awards modules and social navigation.');}
