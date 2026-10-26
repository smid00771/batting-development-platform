// Build the small compatibility host from the authoritative application repository.
// The shared app is loaded from Mirelion only when an old auth/Meta flow needs it.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2];
if(!output)throw Error('Usage: node Scripts/build-legacy-site.mjs /absolute/output/directory');
const out=path.resolve(output);if(out===root)throw Error('Use a separate output directory.');
fs.mkdirSync(path.join(out,'icons'),{recursive:true});
const write=(name,text)=>fs.writeFileSync(path.join(out,name),text);
const origin='https://mirelionhq.com';
const page=(title,body,script)=>`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex, follow"><meta name="theme-color" content="#173d32"><title>${title}</title><link rel="icon" href="./icons/mirelion.svg"><link rel="apple-touch-icon" href="./icons/mirelion-180.png"><link rel="manifest" href="./manifest.webmanifest"><link rel="stylesheet" href="${origin}/styles.css"><link rel="stylesheet" href="${origin}/app-design.css"></head><body>${body}<script type="module">${script}</script></body></html>\n`;
write('app.html',page('Mirelion — your club','<div id="app"><div class="splash">Opening Mirelion…</div></div><noscript><a href="https://mirelionhq.com/app.html">Open Mirelion</a>.</noscript>',`import {legacyAppRedirect} from './domain-routing.js';
const target=legacyAppRedirect(location.href);
if(target)location.replace(target);
else import('${origin}/app.js').catch(()=>{document.getElementById('app').textContent='Mirelion could not load. Reconnect and reload this page to finish your account link.';});`));
const appKeys=['lead','prospect','payment','admin_invite','philosophy_invite','assist_thread','selection_invite','lead_handover','player_join','join','club','tab','involvement','platform','trial','signin','password_setup','trial_product','continue_trial','enquiry','continue_enquiry','close_invitation','legacy'];
for(const name of ['index.html','batting.html','teams.html','contact.html','privacy.html','enquire.html','demo.html','404.html']){
 const script=`import {hasAuthenticationCallback} from './domain-routing.js';
const u=new URL(location.href),keys=${JSON.stringify(appKeys)};
const appLink=hasAuthenticationCallback(u.href)||keys.some(k=>u.searchParams.has(k));
const target=appLink?new URL('/app.html',u.origin):new URL(${JSON.stringify(name==='index.html'||name==='404.html'?'/':'/'+name)},${JSON.stringify(origin)});
target.search=u.search;target.hash=u.hash;location.replace(target.href);`;
 write(name,page('Mirelion has moved','<main class="login"><h1>Mirelion has a new home.</h1><p><a href="https://mirelionhq.com">Continue to Mirelion</a>.</p></main>',script));
}
for(const name of ['domain-routing.js','config.js','social-connect.js','social-connect.html','sw.js','offline.html','manifest.webmanifest','icons/mirelion.svg','icons/mirelion-180.png','icons/mirelion-192.png','icons/mirelion-512.png','icons/mirelion-maskable-512.png'])fs.copyFileSync(path.join(root,name),path.join(out,name));
write('.nojekyll','');write('CNAME','clubbatting.com\n');write('robots.txt','User-agent: *\nDisallow: /\n');
write('release-manifest.json',JSON.stringify({role:'legacy compatibility host',canonical:origin,source_repository:'smid00771/batting-development-platform',app_version:fs.readFileSync(path.join(root,'app.js'),'utf8').match(/const APP_UI_VERSION='([^']+)'/)[1]},null,2)+'\n');
console.log('Compatibility site prepared at '+out);
