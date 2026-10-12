import fs from 'node:fs';
import assert from 'node:assert/strict';
import {haUrl,token} from './activity-stats-ha.mjs';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const dir='backups/xbox-incident-2026-10-11/guardrails';
const get=name=>JSON.parse(fs.readFileSync(dir+'/'+name+'-after.json','utf8'));
const remote=get('automation.sync_active_input_when_switches_change');
const sync=get('automation.sync_active_input_when_switches_change_2');
const wake=get('automation.sync_when_devices_power_on');
const base={states:{'switch.liams_xbox_power':'on','sensor.sony_tv_cec_devices':'Xbox Series S','sensor.sony_tv_current_input':'Xbox','sensor.hub_mode':'Home','input_select.active_input':'Apple TV','media_player.living_room_apple_tv':'playing'},age:120,command:120,trigger:'xbox_on'};
async function condition(c,s){
 if(c.condition==='state'){const desired=Array.isArray(c.state)?c.state:[c.state];const ids=Array.isArray(c.entity_id)?c.entity_id:[c.entity_id];return ids.every(id=>desired.includes(s.states[id]))&&(!c.for||s.age>=c.for.seconds);}
 if(c.condition==='trigger')return (Array.isArray(c.id)?c.id:[c.id]).includes(s.trigger);
 if(c.condition==='and')return (await Promise.all(c.conditions.map(c=>condition(c,s)))).every(Boolean);
 if(c.condition==='or')return (await Promise.all(c.conditions.map(c=>condition(c,s)))).some(Boolean);
 if(c.condition==='not')return !(await Promise.all(c.conditions.map(c=>condition(c,s)))).some(Boolean);
 if(c.condition==='template'){
 let template=c.value_template.replace(/states\('([^']+)'\)/g,(_,id)=>JSON.stringify(s.states[id]??'unknown'));
 template=template.replace(/state_attr\('input_datetime.last_tv_command_time', 'timestamp'\)/g,String(2000000000-s.command)).replace(/as_timestamp\(now\(\)\)/g,'2000000000');
 const r=await fetch(haUrl+'/api/template',{method:'POST',headers,body:JSON.stringify({template})});assert.equal(r.status,200);return (await r.text()).trim().toLowerCase()==='true';
 }
 throw Error('Unsupported condition '+c.condition);
}
const results=[];
async function check(name,conditions,overrides,expected){const s={...base,...overrides,states:{...base.states,...overrides.states}};const actual=(await Promise.all(conditions.map(c=>condition(c,s)))).every(Boolean);assert.equal(actual,expected,name);results.push({name,passed:true,allowed:actual});}
const rg=[...remote.conditions.slice(3),...remote.actions[0].choose[0].conditions];
const sg=sync.actions[0].choose[0].conditions;
const wg=[...wake.conditions,...wake.actions.filter(a=>a.condition)];
for(const [name,guards]of [['TV remote sync',rg],['Device sync',sg],['Idle wake sync',wg]]){
 const idle=name==='Idle wake sync'?{'input_select.active_input':'None'}:{};
 await check(name+': Xbox off blocks false input',guards,{states:{...idle,'switch.liams_xbox_power':'off'}},false);
 await check(name+': maintenance wake without Xbox CEC blocks',guards,{states:{...idle,'sensor.sony_tv_cec_devices':'Apple TV ;; STR-DH590'}},false);
 await check(name+': Night blocks automatic takeover',guards,{states:{...idle,'sensor.hub_mode':'Night'}},false);
 await check(name+': Away blocks automatic takeover',guards,{states:{...idle,'sensor.hub_mode':'Away'}},false);
 await check(name+': corroborated controller wake works',guards,{states:idle},true);
 if(name!=='Idle wake sync')await check(name+': recent explicit command blocks feedback',guards,{command:20},false);
}
const ag=remote.actions[0].choose[1].conditions;
for(const state of ['off','standby','unknown','unavailable'])await check('Apple TV remote sync rejects '+state,ag,{states:{'sensor.sony_tv_current_input':'Apple TV','input_select.active_input':'Xbox','media_player.living_room_apple_tv':state}},false);
await check('Apple TV remote sync accepts awake player',ag,{states:{'sensor.sony_tv_current_input':'Apple TV','input_select.active_input':'Xbox'}},true);
for(const name of ['script.theater_watch_apple_tv','script.theater_watch_xbox','script.theater_record_player','script.theater_echo_bluetooth'])assert.ok(get(name).sequence[0].target.entity_id.includes('input_boolean.activate_dvd'));
for(const name of ['automation.system_sync_wemo_to_vinyl','automation.av_receiver_bluetooth_input']){
const c=get(name);const off=c.actions[0].choose[1].sequence.find(a=>a.if&&a.then?.some(a=>a.action==='button.press'));assert.ok(off.if.some(a=>a.entity_id==='input_boolean.activate_dvd'&&a.state==='off'));
}
fs.writeFileSync(dir+'/verification.json',JSON.stringify(results,null,2));
console.log(`${results.length} condition scenarios passed; DVD cleanup and receiver shutdown checks passed. No device actions executed.`);
