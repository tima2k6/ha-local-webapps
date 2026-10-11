import fs from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const output = new URL('../previews/flight-tally/', import.meta.url);
fs.mkdirSync(output, { recursive: true });
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
        `--user-data-dir=${new URL('.browser-cache', output).pathname.replace(/^\//, '')}`, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser did not start')), 20000);
    chrome.stderr.on('data', data => {
        stderr += data;
        const found = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (found) { clearTimeout(timer); resolve(found[1]); }
    });
    chrome.on('error', reject);
});
const socket = new WebSocket(endpoint);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map(), errors = [];
socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (!message.id) return;
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id); clearTimeout(p.timer);
    message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result);
});
function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
        const id = ++nextId, timer = setTimeout(() => reject(new Error(method + ' timeout')), 20000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
}
try {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Runtime.enable', {}, sessionId);
    await call('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' }, sessionId);
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    if (process.argv.includes('--icons')) {
        await call('Page.navigate', { url: 'http://192.168.2.119/?v=20261010-helicopter' }, sessionId);
        const ready = await call('Runtime.evaluate', { expression: `new Promise(resolve=>{const until=Date.now()+10000;const check=()=>{if(window.flightBackdrop)return resolve(true);if(Date.now()>until)return resolve(false);setTimeout(check,100)};check()})`, awaitPromise: true, returnByValue: true }, sessionId);
        assert.equal(ready.result.value, true, 'Flight renderer did not initialize');
    }
    for (const night of process.argv.includes('--icons') ? [] : [false, true]) {
        await call('Page.navigate', { url: 'http://192.168.2.119/?v=20261010-flight-tally' + (night ? '&night=1' : '') }, sessionId);
        const result = await call('Runtime.evaluate', { expression: `new Promise(resolve=>{const until=Date.now()+20000;const check=()=>{const t=document.querySelector('#flight-tally');if(t&&!t.hidden&&window.flightBackdrop?.map.dataset.feed==='live')return resolve({text:t.textContent,opacity:getComputedStyle(t).opacity,rect:t.getBoundingClientRect().toJSON()});if(Date.now()>until)return resolve(null);setTimeout(check,200)};check()})`, awaitPromise: true, returnByValue: true }, sessionId);
        assert.ok(result.result.value, 'Live map and tally did not load');
        const report = result.result.value;
        assert.match(report.text, /^\d[\d,]* aircraft today$/);
        assert.ok(report.rect.x >= 0 && report.rect.bottom <= 800);
        const shot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
        fs.writeFileSync(new URL(night ? 'night.png' : 'day.png', output), Buffer.from(shot.data, 'base64'));
        console.log(JSON.stringify({ night, ...report }));
    }
    // Fixture stays inside this isolated browser; it never changes HA's feed.
    const icons = await call('Runtime.evaluate', { expression: `(()=>{
        const b=window.flightBackdrop;
        b.stopped=true;clearInterval(b.timer);clearTimeout(b.reconnectTimer);b.ws?.close();
        const draw=b.draw.bind(b);b.draw=()=>{};b.fail=()=>{};
        const box=b.box=[47.4,-122.45,47.6,-122.15];
        const flight=(id,x,category)=>({id,callsign:id,latitude:box[2]-(630/800)*(box[2]-box[0]),longitude:box[1]+(x/1280)*(box[3]-box[1]),heading:35,aircraft_category:category});
        const helicopter=flight('HELICOPTER',850,'Helicopter'), plane=flight('AIRPLANE',1030,'Airplane');
        draw([helicopter,plane]);
        const first=b.markers.get('HELICOPTER').plane.getAttribute('href');
        const rotation=b.markers.get('HELICOPTER').plane.getAttribute('transform');
        draw([{...helicopter,aircraft_category:'Airplane'},plane]);
        const changed=b.markers.get('HELICOPTER').plane.getAttribute('href');
        draw([helicopter,plane]);document.body.classList.remove('force-night');
        return {first,rotation,changed,plane:b.markers.get('AIRPLANE').plane.getAttribute('href'),symbol:!!document.querySelector('#helicopter')};
    })()`, returnByValue: true }, sessionId);
    assert.deepEqual(icons.result.value, {first:'#helicopter',rotation:'rotate(35)',changed:'#plane',plane:'#plane',symbol:true});
    await new Promise(resolve => setTimeout(resolve, 2200));
    const iconShot = await call('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(new URL('aircraft-icons.png', output), Buffer.from(iconShot.data, 'base64'));
    console.log('Helicopter icon, heading, and updated category verified.');
    assert.deepEqual(errors, []);
} finally {
    await call('Browser.close').catch(() => {});
    socket.close();
    chrome.kill();
}
