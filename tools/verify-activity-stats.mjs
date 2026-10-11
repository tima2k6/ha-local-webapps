import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'previews/activity-stats');
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
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
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
  const {haUrl,token:accessToken}=await import('./activity-stats-ha.mjs');
  const {buildActivityCard}=await import('./activity-stats-card.mjs');
  const auth={hassUrl:haUrl,access_token:accessToken,token_type:'Bearer',expires_in:86400,expires:Date.now()+86400000,clientId:haUrl+'/'};
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  await call('Page.enable',{},sessionId);await call('Runtime.enable',{},sessionId);
  await call('Emulation.setDeviceMetricsOverride',{width:480,height:950,deviceScaleFactor:1,mobile:false},sessionId);
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const origin=${JSON.stringify(new URL(haUrl).origin)};const auth=${JSON.stringify(auth)};const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(location.origin===origin&&key==='hassTokens')return JSON.stringify(auth);return get.call(this,key)};Storage.prototype.setItem=function(key,value){if(location.origin===origin&&key==='hassTokens')return;return set.call(this,key,value)}})();`},sessionId);
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  await call('Page.navigate',{url:haUrl+'/lovelace/default_view_hidden'},sessionId);
  assert.ok(await evaluate(`new Promise(resolve=>{const until=Date.now()+20000;function check(){const ha=document.querySelector('home-assistant');if(ha?.hass && window.loadCardHelpers && customElements.get('stack-in-card') && customElements.get('apexcharts-card'))return resolve(true);if(Date.now()>until)return resolve(false);setTimeout(check,150)}check()})`));
  await evaluate(`(async()=>{window.statsHass=document.querySelector('home-assistant').hass;const helpers=await window.loadCardHelpers();window.statsCard=helpers.createCardElement(${JSON.stringify(buildActivityCard())});statsCard.hass=statsHass;const frame=document.createElement('div');frame.id='stats-frame';frame.style='position:fixed;inset:0;z-index:9999;background:var(--primary-background-color,#111);padding:16px;overflow:auto';frame.append(statsCard);document.body.append(frame);return true})()`);
  await evaluate(`new Promise(r=>setTimeout(r,3000))`);
  const deep=`function all(root){const out=[];for(const e of root.querySelectorAll('*')){out.push(e);if(e.shadowRoot)out.push(...all(e.shadowRoot))}return out}`;
  const reports=[];
  for(const index of [0,1,2]){
    if(index)await evaluate(`(()=>{${deep};const tabs=all(statsCard.shadowRoot).filter(e=>e.localName==='mwc-tab');tabs[${index}].click();return true})()`);
    await evaluate(`new Promise(r=>setTimeout(r,1700))`);
    const report=await evaluate(`(()=>{${deep};const nodes=all(statsCard.shadowRoot);return {index:${index},text:nodes.filter(e=>e.localName==='ha-markdown').map(e=>e.shadowRoot?.textContent||e.textContent),errors:nodes.filter(e=>e.localName==='hui-error-card').map(e=>e.textContent),piePaths:nodes.filter(e=>e.classList?.contains('apexcharts-pie-area')).length,charts:nodes.filter(e=>e.localName==='apexcharts-card').map(e=>({series:e._chart?.w?.config?.series,labels:e._chart?.w?.config?.labels})),width:statsCard.getBoundingClientRect().width,overflow:document.querySelector('#stats-frame').scrollWidth>innerWidth}})()`);
    assert.equal(report.errors.length,0);assert.ok(report.piePaths>0,'Pie chart did not render');assert.equal(report.overflow,false);
    reports.push(report);
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);fs.writeFileSync(path.join(output,['today','week','month'][index]+'.png'),Buffer.from(shot.data,'base64'));
  }
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({reports,errors},null,2));
  console.log(JSON.stringify({passed:true,reports,browserExceptions:errors}));
  await call('Target.closeTarget',{targetId});
}finally{socket.close();chrome.kill();server.close()}


