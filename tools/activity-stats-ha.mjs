import fs from 'node:fs';
const c=fs.readFileSync(new URL('../js/ha-config.js',import.meta.url),'utf8');
export const haUrl=c.match(/HA_URL\s*=\s*['"]([^'"]+)/)[1];
export const token=c.match(/HA_TOKEN\s*=\s*['"]([^'"]+)/)[1];
export async function connect(){
const ws=new WebSocket(haUrl.replace(/^http/,'ws')+'/api/websocket');let id=0;const pending=new Map();
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('HA connection timed out')),15000);ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.type==='auth_required')ws.send(JSON.stringify({type:'auth',access_token:token}));if(m.type==='auth_ok'){clearTimeout(timer);resolve()}if(m.type==='auth_invalid'){clearTimeout(timer);reject(Error('Auth failed'))}if(m.type==='result'){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p?.timer);m.success?p?.resolve(m.result):p?.reject(Error(JSON.stringify(m.error)))}};ws.onerror=()=>{clearTimeout(timer);reject(Error('Connection failed'))}});
return {call:(type,fields={})=>new Promise((resolve,reject)=>{const requestId=++id;const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('HA request timed out: '+type))},15000);pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({id:requestId,type,...fields}))}),close:()=>ws.close()};
}
