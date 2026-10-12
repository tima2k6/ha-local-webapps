import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,haUrl,token} from './activity-stats-ha.mjs';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const audit=JSON.parse(fs.readFileSync('backups/xbox-incident-2026-10-11/theater-audit.json','utf8'));
assert.ok(!audit.entries.find(e=>e.entity==='automation.sync_active_input_when_switches_change').config.conditions.some(c=>c.alias==='Device-initiated input changes must respect Night and Away'),'These repairs are already present in the audit; no changes made.');
const directory='backups/xbox-incident-2026-10-11/guardrails';fs.mkdirSync(directory,{recursive:true});
const modeGuard={alias:'Device-initiated input changes must respect Night and Away',condition:'not',conditions:[{condition:'state',entity_id:'sensor.hub_mode',state:'Night'},{condition:'state',entity_id:'sensor.hub_mode',state:'Away'}]};
const cooldown={alias:'Do not let sensor feedback override a theater command within 60 seconds',condition:'template',value_template:"{% set command_time = state_attr('input_datetime.last_tv_command_time', 'timestamp') %} {{ command_time is number and (as_timestamp(now()) - command_time) > 60 }}"};
const cecGuard={alias:'Require the Xbox by name on the TV CEC bus; input labels alone can be stale',condition:'template',value_template:"{{ 'xbox' in states('sensor.sony_tv_cec_devices') | lower }}"};
const stamp={action:'input_datetime.set_datetime',target:{entity_id:'input_datetime.last_tv_command_time'},data:{datetime:'{{ now().isoformat() }}'}};
const off={condition:'state',entity_id:'input_boolean.activate_dvd',state:'off'};
const edits=[];
function edit(entity,mutate){const e=audit.entries.find(e=>e.entity===entity);assert.ok(e,entity);const config=structuredClone(e.config);mutate(config);edits.push({...e,config,original:e.config});}
function clearDvd(action){assert.equal(action.action,'input_boolean.turn_off');const ids=action.target.entity_id;assert.ok(Array.isArray(ids));if(!ids.includes('input_boolean.activate_dvd'))ids.push('input_boolean.activate_dvd');}
edit('automation.sync_active_input_when_switches_change',c=>{
 c.conditions.push(modeGuard);
 c.conditions[3]=cooldown;
 c.actions[0].choose[0].sequence.splice(1,0,{action:'input_boolean.turn_off',target:{entity_id:'input_boolean.activate_dvd'}});
 c.actions[0].choose[1].conditions.push({alias:'An Apple TV input report must be corroborated by the native player being awake',condition:'template',value_template:"{{ states('media_player.living_room_apple_tv') not in ['off','standby','unknown','unavailable'] }}"});
 c.actions[0].choose[1].sequence.splice(1,0,{action:'input_boolean.turn_off',target:{entity_id:'input_boolean.activate_dvd'}});
});
edit('automation.sync_when_devices_power_on',c=>{
 assert.equal(c.actions[0].action,'input_datetime.set_datetime');const savedStamp=c.actions.shift();
 const idx=c.actions.findIndex(a=>a.action==='input_select.select_option');assert.ok(idx>0);
 c.actions.splice(idx,0,cecGuard,modeGuard,savedStamp);
});
edit('automation.sync_active_input_when_switches_change_2',c=>{
 const branches=c.actions[0].choose;
 for(const idx of [0,2])branches[idx].conditions.push(cooldown);
});
for(const entity of ['automation.system_sync_wemo_to_vinyl','automation.av_receiver_bluetooth_input'])edit(entity,c=>{
 const branches=c.actions[0].choose;clearDvd(branches[0].sequence.find(a=>a.action==='input_boolean.turn_off'));
 branches[0].sequence.unshift(stamp);
 const powerOff=branches[1].sequence.find(a=>a.if&&a.then?.some(x=>x.action==='button.press'));assert.ok(powerOff);
 powerOff.if.push(off);
});
for(const entity of ['script.theater_watch_apple_tv','script.theater_watch_xbox','script.theater_record_player','script.theater_echo_bluetooth'])edit(entity,c=>clearDvd(c.sequence[0]));
edit('script.theater_off',c=>c.sequence.unshift(stamp));
for(const e of edits){
 const kind=e.entity.startsWith('script.')?'script':'automation';const id=kind==='script'?e.entity.substring(7):e.config.id;
 const url=haUrl+'/api/config/'+kind+'/config/'+id;
 const before=await fetch(url,{headers});assert.equal(before.status,200);assert.deepEqual(await before.json(),e.original,'Live config changed during audit: '+e.entity);
 fs.writeFileSync(directory+'/'+e.entity+'-before.json',JSON.stringify(e.original,null,2));
 fs.writeFileSync(directory+'/'+e.entity+'-after.json',JSON.stringify(e.config,null,2));
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(e.config)});assert.equal(r.status,200,await r.text());
 const verified=await fetch(url,{headers});assert.deepEqual(await verified.json(),e.config);
 console.log('Saved and verified '+e.entity);
}
const h=await connect();try{const s=await h.call('get_states');console.log(JSON.stringify(s.filter(s=>['input_select.active_input','input_boolean.activate_apple_tv','input_boolean.activate_xbox',...edits.filter(e=>e.entity.startsWith('automation.')).map(e=>e.entity)].includes(s.entity_id)).map(s=>({id:s.entity_id,state:s.state})),null,2));}finally{h.close();}
