import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'previews/quiet-hours');
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + requested);
  const allowed = target.startsWith(path.join(root, 'previews') + path.sep) || target === path.join(root, 'js/quiet-hours-dashboard.js') || target === path.join(root, 'js/quiet-hours-dashboard.css');
  if (!allowed || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(target)] || 'text/plain');
  fs.createReadStream(target).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(output, '.browser-cache');
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
const endpoint = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Headless browser did not start.')), 20000);
  chrome.stderr.on('data', data => { stderr += data; const found = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (found) { clearTimeout(timeout); resolve(found[1]); } });
  chrome.on('error', reject);
});
const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 1; const pending = new Map(); const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (!message.id) return;
  const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
  message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result);
});
function call(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const id = nextId++; const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
try {
  const reports = [];
  if (process.argv.includes('--live')) {
    const credentials = fs.readFileSync(path.join(root, 'js/ha-config.js'), 'utf8');
    const haUrl = credentials.match(/(?:const|let|var)\s+HA_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const accessToken = credentials.match(/(?:const|let|var)\s+HA_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const auth = { hassUrl: haUrl, access_token: accessToken, token_type: 'Bearer', expires_in: 86400, expires: Date.now() + 86400000, clientId: haUrl + '/' };
    const findCard = `function findCard(root=document){for(const el of root.querySelectorAll('*')){if(el.localName==='quiet-hours-dashboard')return el;if(el.shadowRoot){const found=findCard(el.shadowRoot);if(found)return found}}return null}`;
    for (const page of ['overview', 'liam', 'network']) {
      const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
      await call('Page.enable', {}, sessionId); await call('Runtime.enable', {}, sessionId);
      await call('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' }, sessionId);
      await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
      // Supply the existing credential in memory only; never write it to the browser profile.
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const origin=${JSON.stringify(new URL(haUrl).origin)};const auth=${JSON.stringify(auth)};const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(location.origin===origin&&key==='hassTokens')return JSON.stringify(auth);return get.call(this,key)};Storage.prototype.setItem=function(key,value){if(location.origin===origin&&key==='hassTokens')return;return set.call(this,key,value)}})();` }, sessionId);
      await call('Page.navigate', { url: `${haUrl}/quiet-hours-preview/${page}` }, sessionId);
      const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw new Error('Live browser evaluation failed.'); return result.result.value; };
      const ready = await evaluate(`new Promise(resolve=>{${findCard};const until=Date.now()+15000;const check=()=>{const c=findCard();if(c?._hass&&c.shadowRoot.querySelector('.topbar'))return resolve(true);if(Date.now()>until)return resolve(false);setTimeout(check,100)};check()})`);
      assert.equal(ready, true, `${page} did not render in HA.`);
      const report = await evaluate(`(()=>{${findCard};const c=findCard();return {page:c._config.page,live:true,connected:c._hass.connected!==false,mainButtons:c.shadowRoot.querySelectorAll('main button').length,horizontalOverflow:c.getBoundingClientRect().width>innerWidth+1}})()`);
      assert.equal(report.connected, true);
      assert.equal(report.horizontalOverflow, false);
      const group = page === 'overview' ? 'household' : page === 'liam' ? 'room' : 'gateway';
      await evaluate(`(async()=>{${findCard};const c=findCard();await c._openGroup(${JSON.stringify(group)});await new Promise(r=>setTimeout(r,1200));return true})()`);
      const details = await evaluate(`(()=>{${findCard};const c=findCard();const cards=c._childCards;return {count:cards.length,errors:cards.filter(x=>x.localName==='hui-error-card').length,loading:c.shadowRoot.querySelector('.sheet-body').textContent.includes('Loading controls')}})()`);
      assert.ok(details.count > 0 && details.errors === 0 && !details.loading, `${page} detail cards did not load: ${JSON.stringify(details)}`);
      report.details = details;
      await evaluate(`(()=>{${findCard};findCard()._closeSheet();document.scrollingElement.scrollTop=0;for(const el of document.querySelectorAll('*')){if(el.shadowRoot){const reset=root=>{for(const child of root.querySelectorAll('*')){if(child.scrollTop)child.scrollTop=0;if(child.shadowRoot)reset(child.shadowRoot)}};reset(el.shadowRoot)}}return true})()`);
      const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      fs.writeFileSync(path.join(output, `${page}-live.png`), Buffer.from(screenshot.data, 'base64'));
      reports.push(report);
      await call('Target.closeTarget', { targetId });
    }
    fs.writeFileSync(path.join(output, 'verification-live.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify({ passed: true, reports, browserExceptions: errors.length, deviceActions: 0 }));
  } else for (const width of [1280, 390]) for (const page of ['overview', 'liam', 'network']) {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Page.enable', {}, sessionId); await call('Runtime.enable', {}, sessionId);
    await call('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' }, sessionId);
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 1280 ? 800 : 844, deviceScaleFactor: 1, mobile: width < 700 }, sessionId);
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/previews/quiet-hours/preview.html?page=${page}` }, sessionId);
    // Wait for the module and fixture to initialize without relying on arbitrary screenshots.
    await call('Runtime.evaluate', { expression: 'new Promise(resolve => {const check=()=>window.testReady ? window.testReady.then(resolve) : setTimeout(check,50);check()})', awaitPromise: true }, sessionId);
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    const report = await evaluate(`(()=>{const c=document.querySelector('quiet-hours-dashboard');const r=c.shadowRoot;const main=r.querySelector('main');return {page:${JSON.stringify(page)},width:${width},horizontalOverflow:main.scrollWidth>innerWidth+1,mainButtons:r.querySelectorAll('main button').length,contentHeight:main.getBoundingClientRect().height,brokenGroups:[...r.querySelectorAll('main [data-group]')].map(b=>b.dataset.group).filter(id=>!c._config.detail_groups.some(g=>g.id===id)),unavailableCount:(main.textContent.match(/unavailable/gi)||[]).length}})()`);
    assert.equal(report.horizontalOverflow, false, `${page} overflows at ${width}`);
    assert.deepEqual(report.brokenGroups, [], 'A detail link has no group.');
    await evaluate(`(()=>{const c=document.querySelector('quiet-hours-dashboard');c.shadowRoot.querySelector('[data-directory]').click();return !c.shadowRoot.querySelector('.sheet').hidden})()`);
    assert.equal(await evaluate(`(()=>{const c=document.querySelector('quiet-hours-dashboard');const result=c.shadowRoot.querySelectorAll('.sheet-list button').length===c._config.detail_groups.length;c.shadowRoot.querySelector('[data-close]').click();return result})()`), true);
    if (page === 'liam') {
      await evaluate(`(async()=>{const c=document.querySelector('quiet-hours-dashboard');c.shadowRoot.querySelector('[data-toggle="light.neon_light"]').click();await new Promise(r=>setTimeout(r,100));return true})()`);
      assert.deepEqual(await evaluate('window.testCalls[0]'), { domain: 'light', service: 'toggle', data: { entity_id: 'light.neon_light' } });
      await evaluate(`(async()=>{const c=document.querySelector('quiet-hours-dashboard');c.shadowRoot.querySelector('[data-script="bedtime_routine_start"]').click();await new Promise(r=>setTimeout(r,100));return true})()`);
      assert.equal(await evaluate('window.testCalls[1].service'), 'bedtime_routine_start');
      assert.equal(await evaluate(`(()=>{const c=document.querySelector('quiet-hours-dashboard');return c._starCount()===Number(window.testStates['input_number.liam_star_bank'].state)})()`), true);
      await evaluate(`(async()=>{const c=document.querySelector('quiet-hours-dashboard');window.testHass={...window.testHass,states:{...window.testStates,'input_select.bedtime_routine_phase':{state:'Books!',attributes:{}},'input_text.bedtime_pause_seconds':{state:'120',attributes:{}}}};c.hass=window.testHass;await new Promise(r=>setTimeout(r,100));return true})()`);
      assert.equal(await evaluate(`!!document.querySelector('quiet-hours-dashboard').shadowRoot.querySelector('[data-script="bedtime_routine_resume_2"]')`), true);
      await evaluate(`(async()=>{const c=document.querySelector('quiet-hours-dashboard');c.hass={...window.testHass,states:window.testStates};await new Promise(r=>setTimeout(r,100));return true})()`);
    }
    if (page === 'network') {
      await evaluate(`(async()=>{const c=document.querySelector('quiet-hours-dashboard');c.hass={...window.testHass,states:{...window.testStates,'sensor.office_ap_state':{state:'unavailable',attributes:{}}}};await new Promise(r=>setTimeout(r,100));return true})()`);
      assert.equal(await evaluate(`document.querySelector('quiet-hours-dashboard').shadowRoot.querySelector('.health-title').textContent.includes('unavailable')`), true);
      await evaluate(`(async()=>{const c=document.querySelector('quiet-hours-dashboard');c.hass=window.testHass;await new Promise(r=>setTimeout(r,100));return true})()`);
    }
    const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(report.contentHeight), scale: 1 } }, sessionId);
    fs.writeFileSync(path.join(output, `${page}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    reports.push(report);
    await call('Target.closeTarget', { targetId });
  }
  if (!process.argv.includes('--live')) {
    assert.deepEqual(errors, [], 'Browser JavaScript errors.');
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify({ passed: true, reports, scenarios: ['No horizontal overflow on all six layouts', 'All detail links resolve', 'All-control directory opens and closes', 'Light action targets correct entity', 'Bedtime start and pause/resume states', 'Stars use the real bank helper', 'Unavailable network status is not healthy', 'No JavaScript exceptions'], screenshots: output }));
  }
} finally { try { await call('Browser.close'); } catch {} socket.close(); chrome.kill(); server.close(); }
