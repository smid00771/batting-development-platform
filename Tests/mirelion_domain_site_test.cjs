const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const originalCname = fs.readFileSync(path.join(root, 'CNAME'), 'utf8');
let build, outputFiles, temp, out, result;
const read = name => fs.readFileSync(path.join(out, name), 'utf8');
const doc = name => new JSDOM(read(name), { url: 'https://mirelionhq.com/' + name }).window.document;
function execute(name, scriptId, suffix = '') {
  let destination, onReady;
  const fallback = {};
  const page = new URL('https://mirelionhq.com/' + (name === 'index.html' ? '' : name) + suffix);
  vm.runInNewContext(doc(name).getElementById(scriptId).textContent, {
    URL, URLSearchParams,
    location: { href: page.href, search: page.search, hash: page.hash, replace: value => destination = value },
    document: { addEventListener: (event, fn) => onReady = fn, getElementById: () => fallback }
  });
  if (onReady) onReady();
  return { destination, fallback: fallback.href };
}
before(async () => {
  ({ buildMirelionSite: build, outputFiles } = await import('../Scripts/build-mirelion-site.mjs'));
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mirelion-domain-'));
  out = path.join(temp, 'site');
  result = build(out);
});
after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('bundle contains only the marketing site and handoff pages, never the live app', () => {
  assert.deepEqual(result.files, outputFiles);
  for (const file of ['app.js', 'config.js', 'sw.js', 'manifest.webmanifest', 'social-connect.js']) {
    assert.ok(!fs.existsSync(path.join(out, file)), file);
  }
  assert.equal(read('CNAME').trim(), 'mirelionhq.com');
  assert.equal(fs.readFileSync(path.join(root, 'CNAME'), 'utf8'), originalCname);
  assert.equal(originalCname.trim(), 'clubbatting.com');
});
test('root invitations preserve every opaque query and fragment character on the shared app', () => {
  for (const key of ['selection_invite', 'admin_invite', 'philosophy_invite', 'player_join', 'join', 'lead_handover', 'close_invitation', 'trial_product', 'club']) {
    const suffix = `?${key}=test%2B%2f%3D+plus&x=1&x=2#state=a%26b%3D`;
    assert.equal(execute('index.html', 'legacy-app-routing', suffix).destination, 'https://clubbatting.com/app.html' + suffix);
  }
});
test('auth returns use the existing origin and cannot be redirected to an input-supplied host', () => {
  for (const suffix of ['?code=test%2Bcode&next=https%3A%2F%2Fevil.invalid', '#access_token=test%2B&refresh_token=test%2F', '?error=access_denied#error_description=declined']) {
    assert.equal(execute('index.html', 'legacy-app-routing', suffix).destination, 'https://clubbatting.com/app.html' + suffix);
  }
  for (const suffix of ['', '#products', '?utm_source=club', '?product=selections']) {
    assert.equal(execute('index.html', 'legacy-app-routing', suffix).destination, undefined);
  }
});
test('direct app and enquiry links preserve raw strings and update their fallback links', () => {
  for (const name of ['app.html', 'enquire.html']) {
    for (const suffix of ['', '?product=selections&token=test%2B%2F%3D+&x=1&x=2#state=a%26b', '?next=//evil.invalid#access_token=test']) {
      const target = 'https://clubbatting.com/' + name + suffix;
      assert.deepEqual(execute(name, 'shared-app-handoff', suffix), { destination: target, fallback: target });
    }
  }
});
test('product choices and shared sign-in work as ordinary links without JavaScript', () => {
  for (const [name, product] of [['teams.html', 'selections'], ['batting.html', 'batting'], ['index.html', 'both']]) {
    const document = doc(name);
    assert.ok(document.querySelector(`a[href="https://clubbatting.com/app.html?trial_product=${product}"]`));
    assert.equal(document.querySelector('a.sign-in').href, 'https://clubbatting.com/app.html');
    assert.ok(!document.querySelector('a[href^="./enquire.html"],a[href="./app.html"]'));
  }
});
test('the new site uses its own canonical URLs and stays marked noindex during beta', () => {
  for (const name of result.files.filter(name => name.endsWith('.html'))) {
    const document = doc(name);
    assert.match(document.querySelector('meta[name="robots"]').content, /noindex/);
    assert.equal(document.querySelector('meta[name="referrer"]').content, 'no-referrer');
    if (['index.html', 'teams.html', 'batting.html', 'privacy.html', 'contact.html'].includes(name)) {
      assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://mirelionhq.com/' + (name === 'index.html' ? '' : name));
    }
    const og = document.querySelector('meta[property="og:url"]');
    if (og) assert.equal(og.content, document.querySelector('link[rel="canonical"]').href);
  }
});
test('every internal link, fragment and asset resolves inside the isolated publish bundle', () => {
  for (const name of result.files.filter(name => name.endsWith('.html'))) {
    const document = doc(name);
    assert.equal(document.querySelectorAll('h1').length, 1, name);
    for (const node of document.querySelectorAll('a[href],link[href],script[src]')) {
      const url = new URL(node.getAttribute('href') || node.getAttribute('src'), 'https://mirelionhq.com/' + name);
      if (url.origin !== 'https://mirelionhq.com') continue;
      const destination = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      assert.ok(result.files.includes(destination), `${name}: ${url.href}`);
      if (url.hash) assert.ok(doc(destination).getElementById(url.hash.slice(1)), `${name}: ${url.href}`);
    }
  }
});
test('contact and privacy retain the existing working mailbox and deletion information', () => {
  for (const name of ['contact.html', 'privacy.html']) {
    assert.ok(doc(name).querySelector('a[href="mailto:enquiries@clubbatting.com"]'));
  }
  assert.ok(doc('privacy.html').getElementById('deletion'));
  assert.equal(doc('index.html').querySelector('.footer-links a[href="./contact.html"]').textContent, 'Contact');
});
test('unknown nested pages keep useful absolute home, asset and app links', () => {
  const document = new JSDOM(read('404.html'), { url: 'https://mirelionhq.com/missing/nested/page' }).window.document;
  assert.equal(document.querySelector('link[rel="stylesheet"]').href, 'https://mirelionhq.com/marketing.css?v=20261022.1');
  assert.ok(document.querySelector('a[href="/"]'));
  assert.ok(document.querySelector('a[href="https://clubbatting.com/app.html"]'));
});
test('the builder refuses source directories and contaminated publish folders', () => {
  assert.throws(() => build(root), /Build into/);
  assert.throws(() => build(path.join(root, 'Database')), /Build into/);
  const contaminated = path.join(temp, 'contaminated');
  fs.mkdirSync(contaminated); fs.writeFileSync(path.join(contaminated, 'config.js'), 'keep this');
  assert.throws(() => build(contaminated), /Unexpected file/);
  assert.equal(fs.readFileSync(path.join(contaminated, 'config.js'), 'utf8'), 'keep this');
});
test('the release is reproducible and every publish file has a matching checksum', () => {
  const second = build(path.join(temp, 'second'));
  assert.deepEqual(second.manifest, result.manifest);
  for (const [name, expected] of Object.entries(result.manifest.files)) {
    assert.equal(createHash('sha256').update(read(name)).digest('hex'), expected, name);
  }
});
