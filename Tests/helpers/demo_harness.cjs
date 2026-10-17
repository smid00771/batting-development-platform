const fs = require('node:fs');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const {JSDOM, VirtualConsole} = require('jsdom');

// Run the delivered file, including its real bootstrap and fixture RPCs.
// Canvas pixels and browser-only APIs are stubbed; this is not a visual test.
async function openDemo(stage = '') {
  const errors = [], requests = [], alerts = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const html = fs.readFileSync(path.join(__dirname, '../../demo.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://example.test/demo.html' + (stage ? '?stage=' + stage : ''),
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(w) {
      Object.defineProperty(w, 'crypto', {value: webcrypto});
      Object.assign(w, {structuredClone, TextEncoder, TextDecoder,
        scrollTo() {}, alert: text => alerts.push(text), confirm: () => true,
        requestAnimationFrame: fn => w.setTimeout(() => fn(w.performance.now()), 0),
        cancelAnimationFrame: id => w.clearTimeout(id),
        matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}),
        ResizeObserver: class {observe() {} disconnect() {}},
        fetch: async url => {requests.push(String(url)); throw Error('Network blocked in demo test');}
      });
      w.HTMLElement.prototype.scrollIntoView = function() {};
      w.HTMLDialogElement.prototype.showModal = function() {this.open = true;};
      w.HTMLDialogElement.prototype.close = function() {this.open = false;};
      w.URL.createObjectURL = () => 'blob:demo-test';
      w.URL.revokeObjectURL = () => {};
      w.CSS = {escape: value => String(value).replace(/[^\w-]/g, '\\$&')};
      w.HTMLCanvasElement.prototype.getContext = function() {
        return new Proxy({canvas: this, measureText: value => ({width: String(value).length * 8}),
          createLinearGradient: () => ({addColorStop() {}}),
          createRadialGradient: () => ({addColorStop() {}}),
          getImageData: () => ({data: new Uint8ClampedArray(4)})
        }, {get: (o, key) => key in o ? o[key] : () => {}});
      };
      w.HTMLCanvasElement.prototype.toBlob = function(fn) {fn(new w.Blob(['demo'], {type: 'image/png'}));};
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
      Object.defineProperty(w.document, 'fonts', {value: {ready: Promise.resolve(), load: async () => []}});
    }
  });
  async function settle() {
    await dom.window.demoReady;
    await dom.window.__demoRenderDone;
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  }
  try {await settle();} catch (error) {dom.window.close(); throw error;}
  return {dom, window: dom.window, document: dom.window.document, errors, requests, alerts, settle,
    close: () => dom.window.close(),
    async click(selector) {
      const node = dom.window.document.querySelector(selector);
      if (!node) throw Error('Missing control: ' + selector);
      node.click(); await settle();
    },
    async choose(selector, value) {
      const node = dom.window.document.querySelector(selector);
      if (!node) throw Error('Missing choice: ' + selector);
      node.value = value; node.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
      await settle();
    }
  };
}
module.exports = {openDemo};
