import fs from 'node:fs';
import assert from 'node:assert/strict';
import {haUrl,token} from './activity-stats-ha.mjs';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const dir='backups/theater-controller-repair';
async function edit(kind,id,fn){const url=haUrl+'/api/config/'+kind+'/config/'+id;const r=await fetch(url,{headers});const original=await r.json();const c=structuredClone(original);fn(c);fs.writeFileSync(dir+'/'+id+'-refine-before.json',JSON.stringify(original,null,2));const saved=await fetch(url,{method:'POST',headers,body:JSON.stringify(c)});assert.equal(saved.status,200,await saved.text());const v=await fetch(url,{headers});assert.deepEqual(await v.json(),c);fs.writeFileSync(dir+'/'+id+'-refine-after.json',JSON.stringify(c,null,2));}
for(const id of ['theater_watch_apple_tv','theater_watch_xbox','theater_watch_dvd','theater_echo_bluetooth','theater_record_player'])await edit('script',id,c=>{const on=c.sequence.at(-1);const flag=on.target.entity_id;c.sequence=[{if:[{condition:'state',entity_id:flag,state:'on'}],then:[{action:'input_boolean.turn_off',target:{entity_id:flag}}]},on];c.description='Explicit activity requests can reapply an already-selected activity; device commands remain owned by Master.';});
await edit('automation','1769794577727',c=>{
 const tuner="{% set result = state_attr('sensor.sony_tv_current_input','result') %}{{ result is sequence and result | length > 0 and result[0] is mapping and result[0].get('uri','').startswith('tv:') and states('input_select.active_input') in ['Apple TV','Xbox','DVD'] }}";
 const previous=c.conditions[3];c.conditions[3]={condition:'or',conditions:[previous,{condition:'template',value_template:tuner}]};
 const native=c.actions[0].choose.find(b=>b.sequence?.some(a=>a.data?.option==='None'));
 if(native)native.conditions=[{condition:'template',value_template:tuner}];else c.actions[0].choose.push({conditions:[{condition:'template',value_template:tuner}],sequence:[{action:'input_select.select_option',target:{entity_id:'input_select.active_input'},data:{option:'None'}},{action:'input_boolean.turn_off',target:{entity_id:['input_boolean.activate_apple_tv','input_boolean.activate_xbox','input_boolean.activate_dvd']}}]});
 c.description+=' Native tuner takeover clears video activity bookkeeping without powering down the TV/receiver.';
});
console.log('Repeat requests and native-TV ownership checks saved and verified.');
