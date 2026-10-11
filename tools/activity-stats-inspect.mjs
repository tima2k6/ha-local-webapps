import fs from 'node:fs';
const c=fs.readFileSync('js/ha-config.js','utf8');
const url=c.match(/HA_URL\s*=\s*['"]([^'"]+)/)[1], token=c.match(/HA_TOKEN\s*=\s*['"]([^'"]+)/)[1];
const ws=new WebSocket(url.replace(/^http/,'ws')+'/api/websocket');let id=0;const pending=new Map();
const ready=new Promise((resolve,reject)=>{ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.type==='auth_required')ws.send(JSON.stringify({type:'auth',access_token:token}));if(m.type==='auth_ok')resolve();if(m.type==='auth_invalid')reject(Error('Auth failed'));if(m.type==='result'){const p=pending.get(m.id);pending.delete(m.id);m.success?p?.resolve(m.result):p?.reject(Error(JSON.stringify(m.error)))}};ws.onerror=()=>reject(Error('Connection failed'))});
const call=(type,fields={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,type,...fields}))});
await ready;
try {
const results=await Promise.all([call('get_states'),call('lovelace/dashboards/list'),call('lovelace/resources'),call('lovelace/config')]);
fs.mkdirSync('previews/activity-stats',{recursive:true});
fs.writeFileSync('previews/activity-stats/inspect.json',JSON.stringify({states:results[0].filter(s=>/tv|dvd|xbox|echo|record_player|activity/i.test(s.entity_id)),dashboards:results[1],resources:results[2],dashboard:results[3]},null,2));
console.log(JSON.stringify({states:results[0].filter(s=>/tv|dvd|xbox|echo|record_player|activity/i.test(s.entity_id)).map(s=>({id:s.entity_id,state:s.state,name:s.attributes.friendly_name,unit:s.attributes.unit_of_measurement})),dashboards:results[1],resources:results[2],views:results[3].views.map(v=>({title:v.title,path:v.path}))},null,2));
} finally {ws.close()}
