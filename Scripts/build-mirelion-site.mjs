import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(join(sourceRoot, name), 'utf8');
const config = JSON.parse(read('Website/site.json'));
const publicPages = ['index.html', 'teams.html', 'batting.html', 'privacy.html'];
const assets = ['marketing.css', 'marketing.js', 'icons/mirelion.svg'];
const extraPages = ['app.html', 'enquire.html', 'contact.html', '404.html'];
export const outputFiles = [...publicPages, ...assets, ...extraPages, 'CNAME', '.nojekyll', 'robots.txt', 'release-manifest.json'].sort();

// This release deliberately keeps every account operation on the existing app origin.
// A full app-origin migration is a separate task involving sessions, installed apps,
// notifications, OAuth callbacks, calendars and server origin restrictions.
if (config.websiteOrigin !== 'https://mirelionhq.com' || config.appOrigin !== 'https://clubbatting.com'
    || config.domain !== 'mirelionhq.com' || config.releaseStage !== 'beta') {
  throw new Error('Review the domain/release plan before changing the beta site configuration.');
}

function siteLinks(html) {
  return html
    .replaceAll('href="./app.html"', `href="${config.appOrigin}/app.html"`)
    .replace(/href="\.\/enquire\.html(?:\?product=(batting|selections|both))?"/g,
      (_, product = '') => `href="${config.appOrigin}/app.html?trial_product=${product}"`)
    .replaceAll(`href="mailto:${config.contactEmail}">Contact</a>`, 'href="./contact.html">Contact</a>')
    .replaceAll(`href="mailto:${config.contactEmail}">Contact us</a>`, 'href="./contact.html">Contact us</a>');
}

function publicPage(name) {
  const path = name === 'index.html' ? '/' : `/${name}`;
  let html = siteLinks(read(name));
  const oldCanonical = `href="https://clubbatting.com${path}"`;
  if (!html.includes(oldCanonical)) throw new Error(`Missing expected canonical URL in ${name}`);
  html = html.replace(oldCanonical, `href="${config.websiteOrigin}${path}"`)
    .replaceAll(`content="https://clubbatting.com${path}"`, `content="${config.websiteOrigin}${path}"`)
    .replace('</head>', '<meta name="robots" content="noindex, follow">\n</head>');
  if (name === 'index.html') {
    const oldTarget = "new URL('./app.html', location.href)";
    if (!html.includes(oldTarget)) throw new Error('Review the changed root invitation/auth router before building.');
    html = html.replace(oldTarget, `new URL('${config.appOrigin}/app.html')`)
      .replace('// Keep existing invitations and authentication callbacks working at the old address.',
        '// Hand account links to the existing shared app, preserving the original query and fragment.');
  }
  return html;
}

function simplePage({ title, heading, body, path, script = '' }) {
  const home = publicPage('index.html');
  const header = home.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
  const footer = home.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0];
  if (!header || !footer) throw new Error('The shared marketing header or footer has changed.');
  // Absolute local paths keep the error page usable at unknown nested URLs.
  const nav = html => html.replaceAll('href="./', 'href="/');
  return `<!doctype html>
<html lang="en-AU"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex, follow">
<title>${title} — Mirelion</title><meta name="theme-color" content="#173d32">
${path ? `<link rel="canonical" href="${config.websiteOrigin}${path}">` : ''}
<link rel="icon" type="image/svg+xml" href="/icons/mirelion.svg"><link rel="stylesheet" href="/marketing.css?v=20261022.1">
<style>.simple-page{max-width:760px;min-height:45vh;padding-block:36px}.simple-page h1{font-size:clamp(32px,6vw,48px);line-height:1.1;letter-spacing:-1.4px;margin-bottom:20px}.simple-page h2{font-size:23px;margin:26px 0 10px}.simple-page p{margin:12px 0;overflow-wrap:anywhere}.simple-page a:not(.button){text-underline-offset:3px}.simple-page .hero-actions{margin-top:20px}@media(max-width:620px){.simple-page{padding-block:26px}}</style>
${script}</head><body><a class="skip-link" href="#main">Skip to content</a>
${nav(header)}<main id="main" class="container simple-page"><h1>${heading}</h1>${body}</main>${nav(footer)}
</body></html>
`;
}

function handoffPage(destination, title) {
  const target = `${config.appOrigin}/${destination}`;
  // Concatenation preserves opaque auth/invitation strings, including +, % and duplicate keys.
  // The destination is a build-time constant; query parameters never choose a host or path.
  const script = `<script id="shared-app-handoff">(() => {
    const target = '${target}' + location.search + location.hash;
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('continueApp').href = target;
    });
    location.replace(target);
  })();</script>`;
  return simplePage({ title, heading: title, script,
    body: `<p>Opening the shared app for Club Batting and Mirelion Select.</p>
<p><a class="button" id="continueApp" href="${target}">Continue to the app <span aria-hidden="true">→</span></a></p>` });
}

function walk(directory, prefix = '') {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    const entry = prefix + name;
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`Refusing a symbolic link in the publish directory: ${entry}`);
    return info.isDirectory() ? walk(path, entry + '/') : [entry];
  });
}

export function buildMirelionSite(directory = join(sourceRoot, 'Website/dist')) {
  const out = resolve(directory);
  const insideSource = relative(sourceRoot, out);
  if (!insideSource || (!insideSource.startsWith('..') && !isAbsolute(insideSource) && insideSource !== 'Website/dist')) {
    throw new Error('Build into Website/dist or a separate directory outside the source checkout.');
  }
  for (const file of walk(out)) {
    if (!outputFiles.includes(file)) throw new Error(`Unexpected file in publish directory: ${file}. Use an empty directory.`);
  }
  const files = new Map(publicPages.map(name => [name, publicPage(name)]));
  for (const name of assets) files.set(name, read(name));
  files.set('app.html', handoffPage('app.html', 'Sign in'));
  files.set('enquire.html', handoffPage('enquire.html', 'Start your club’s free trial'));
  files.set('contact.html', simplePage({ title: 'Help and contact', heading: 'Personal support for your club.', path: '/contact.html',
    body: `<p>Every club can contact us for help getting started, solving a problem or requesting changes to how Mirelion Select or Club Batting works for them.</p>
<p>Email <a href="mailto:${config.contactEmail}">${config.contactEmail}</a>. Tell us your club name, the page you’re using and what you’d like to work differently. We’ll work with you on practical changes to suit your club.</p>
<p>Changes specific to your club stay scoped to your club. Improvements that prove useful more widely can become shared features after testing.</p>
<p>Support is based in Australia. We respond as soon as we can around time zones and availability. For bigger changes, we’ll agree what’s possible and a timeframe with you.</p>
<h2>Already using the app?</h2><p>Sign in with your existing account and open Help. Include your club name and the page you were using when asking for support.</p>
<div class="hero-actions"><a class="button" href="${config.appOrigin}/app.html">Open the app <span aria-hidden="true">→</span></a><a class="text-link" href="/privacy.html#deletion">Privacy and deletion requests</a></div>` }));
  files.set('404.html', simplePage({ title: 'Page not found', heading: 'Let’s get you to the right place.',
    body: `<p>We couldn’t find that page. Explore our products or open your club’s app.</p><div class="hero-actions"><a class="button" href="/">Mirelion home <span aria-hidden="true">→</span></a><a class="text-link" href="${config.appOrigin}/app.html">Sign in to your club</a></div>` }));
  files.set('CNAME', config.domain + '\n');
  files.set('.nojekyll', '');
  // Crawlers must be able to read the page-level noindex directive during beta.
  files.set('robots.txt', '# Beta pages carry noindex metadata. Wider public launch is a separate release.\nUser-agent: *\nAllow: /\n');
  const manifest = { website: config.websiteOrigin, app: config.appOrigin, stage: config.releaseStage,
    files: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, content]) =>
      [name, createHash('sha256').update(content).digest('hex')])) };
  files.set('release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  for (const [name, content] of files) {
    const path = join(out, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return { directory: out, files: [...files.keys()].sort(), manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildMirelionSite(process.argv[2]);
  console.log(`Prepared ${result.files.length} static files in ${result.directory}`);
}
