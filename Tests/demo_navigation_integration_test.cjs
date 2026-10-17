const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const {openDemo} = require('./helpers/demo_harness.cjs');

const labels = (h, selector) => [...h.document.querySelectorAll(selector)].map(e => e.textContent.trim());
const noErrors = h => {
  assert.deepEqual(h.errors.map(e => e.message), []);
  assert.equal(h.document.getElementById('demoStatus').textContent, '');
  assert.equal(h.window.__fixtureLogs.filter(e => e.name === 'DEMO ERROR').length, 0);
};
async function openAwards(h) {
  await h.click('[data-se-view="socials"]');
  await h.click('[data-social-view="awards"]');
  assert.deepEqual(labels(h, '#socialContent h3').slice(0, 2), ['Awards your club uses', 'Request a new award']);
}
async function choice(h, kind, enabled) {
  const input = h.document.querySelector('[data-sa-choice="' + kind + '"]');
  input.checked = enabled;
  input.dispatchEvent(new h.window.Event('change', {bubbles: true}));
  await h.settle();
}

test('the complete demo opens on the selector board and retains it through app navigation', async t => {
  const h = await openDemo(); t.after(h.close);
  assert.equal(h.document.getElementById('demoStage').value, 'selections');
  assert.ok(h.document.querySelector('[data-se-view="board"][aria-pressed="true"]'));
  assert.equal(h.document.querySelector('[data-se-view="published"]'), null);
  assert.ok(h.document.getElementById('seSeasonStats'));
  assert.ok(h.document.getElementById('seOpenRoom'));
  assert.ok(h.document.querySelector('[data-se-view="socials"]'));
  await h.click('[data-se-view="availability"]');
  await h.click('[data-se-view="board"]');
  const help = [...h.document.querySelectorAll('button')].find(b => b.textContent === 'Help & Tutorials');
  help.click(); await h.settle();
  [...h.document.querySelectorAll('button')].find(b => b.textContent === 'Teams & availability').click();
  await h.settle();
  assert.ok(h.document.querySelector('[data-se-view="board"][aria-pressed="true"]'));
  assert.equal(h.document.querySelector('[data-se-view="published"]'), null);
  noErrors(h);
});

test('award choices save through the complete demo and control Create posts', async t => {
  const h = await openDemo(); t.after(h.close);
  await openAwards(h);
  assert.deepEqual(labels(h, '[data-social-view]'), ['Who handles socials', 'Social accounts', 'Socials Awards', 'Create posts']);
  assert.equal(h.document.querySelectorAll('[data-sa-choice]').length, 5);
  await choice(h, 'century', true); await choice(h, 'five_wickets', true);
  await h.click('#saSaveChoices');
  assert.match(h.document.getElementById('saStatus').textContent, /Award choices saved/);
  await h.click('[data-social-view="graphics"]');
  const values = [...h.document.getElementById('socialCreateMenu').options].map(o => o.value);
  assert.ok(values.includes('century')); assert.ok(values.includes('five_wickets'));
  assert.equal(values.includes('results'), false);
  await h.choose('#socialCreateMenu', 'century');
  assert.ok(h.document.getElementById('saCanvas'));
  await h.click('[data-social-view="awards"]');
  assert.equal(h.document.querySelector('[data-sa-choice="century"]').checked, true);
  assert.equal(h.window.localStorage.length, 0, 'Demo choices never reach real browser storage');
  noErrors(h);
});

test('a new award request is retained, shown, and cleared by Reset demo', async t => {
  const h = await openDemo('social_awards'); t.after(h.close);
  const form = h.document.getElementById('saRequest'); assert.ok(form);
  for (const [name, value] of Object.entries({name: 'Fielding effort', criteria: 'Recognise a saved boundary and a run-out.', artwork_notes: 'Use the club colours.'})) {
    form.elements[name].value = value;
    form.elements[name].dispatchEvent(new h.window.Event('input', {bubbles: true}));
  }
  await h.click('#saRequest button[type="submit"]');
  assert.match(h.document.getElementById('saRequestUpdates').textContent, /Fielding effort/);
  assert.match(h.document.getElementById('saRequestUpdates').textContent, /No request has been sent/);
  await h.click('[data-social-view="graphics"]');
  await h.click('[data-social-view="awards"]');
  assert.equal(h.document.querySelectorAll('#saRequestUpdates article').length, 1);
  await h.click('#saRefreshRequests');
  assert.equal(h.document.querySelectorAll('#saRequestUpdates article').length, 1);
  await h.click('#demoReset');
  assert.equal(h.document.getElementById('saRequestUpdates'), null);
  assert.ok(h.document.getElementById('saRequest'));
  noErrors(h);
});

test('the View menu exposes socials directly while player and admin-only examples retain their actual permissions', async t => {
  const h = await openDemo(); t.after(h.close);
  await h.choose('#demoStage', 'socials');
  assert.ok(h.document.querySelector('[data-social-view="awards"]'));
  await h.choose('#demoStage', 'social_awards');
  assert.ok(h.document.getElementById('saRequest'));
  await h.choose('#demoStage', 'selected_teams');
  assert.ok(h.document.querySelector('[data-se-view="published"]'));
  assert.equal(h.document.querySelector('[data-se-view="board"]'), null);
  assert.equal(h.document.querySelector('[data-se-view="socials"]'), null);
  await h.choose('#demoStage', 'selection_admin');
  assert.match(h.document.getElementById('demoRole').textContent, /no selection role/);
  assert.equal(h.document.querySelector('[data-se-view="board"]'), null);
  await h.choose('#demoStage', 'selections');
  assert.ok(h.document.querySelector('[data-se-view="board"]'));
  assert.equal(h.document.querySelector('[data-se-view="published"]'), null);
  noErrors(h);
});

test('the delivered demo retains the current shared awards modules and navigation', () => {
  execFileSync(process.execPath, ['Scripts/sync-demo-socials.mjs', '--check'], {cwd: path.resolve(__dirname, '..')});
});

test('landing-page product links open the batting home and selector board in the complete demo', async () => {
  const landing = new JSDOM(fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8'));
  try {
    const links = [...landing.window.document.querySelectorAll('.product-card a')].filter(a => a.textContent === 'Try the demo');
    assert.equal(links.length, 2);
    assert.deepEqual(links.map(a => new URL(a.getAttribute('href'), 'https://example.test/').searchParams.get('stage')), ['home', 'selections']);
    for (const link of links) {
      const stage = new URL(link.getAttribute('href'), 'https://example.test/').searchParams.get('stage');
      const h = await openDemo(stage);
      try {
        assert.equal(h.document.getElementById('demoStage').value, stage);
        if (stage === 'selections') assert.ok(h.document.querySelector('[data-se-view="board"][aria-pressed="true"]'));
        else assert.match(h.document.getElementById('page').textContent, /Club Home/);
        noErrors(h);
      } finally {h.close();}
    }
  } finally {landing.window.close();}
});
