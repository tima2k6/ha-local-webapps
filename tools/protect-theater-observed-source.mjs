import fs from 'node:fs';
import assert from 'node:assert/strict';
import {haUrl,token} from './activity-stats-ha.mjs';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const observed=(name,allowIdle=false)=>`{% set p = sony_observed.get('content', {}) %}{% set result = p.get('result', []) if p is mapping else [] %}{% set uri = result[0].get('uri','') if result | length > 0 and result[0] is mapping else '' %}{% set ns = namespace(name='') %}{% for device in states('sensor.sony_tv_cec_devices').split(' ;; ') %}{% set parts = device.rsplit('=',1) %}{% if parts | length == 2 and 'extInput:' ~ parts[0] == uri %}{% set ns.name = parts[1] %}{% endif %}{% endfor %}{{ ${allowIdle?"is_state('input_select.active_input','None') or ":''}'${name}' in ns.name | lower }}`;
for(const id of ['1769794577727','1773513231439']){
 const url=haUrl+'/api/config/automation/config/'+id;const r=await fetch(url,{headers});const c=await r.json();
 const choose=c.actions.find(a=>a.choose);assert.ok(choose);
 if(id==='1769794577727'){
  for(const [index,name]of [[0,'xbox'],[1,'apple tv']]){
   const conditions=choose.choose[index].conditions;
   if(!conditions.some(x=>x.alias==='Confirm the observed CEC source, not an inferred HDMI label'))conditions.push({alias:'Confirm the observed CEC source, not an inferred HDMI label',condition:'template',value_template:observed(name)});
  }
 }else{
  const conditions=choose.choose[0].conditions;
  if(!conditions.some(x=>x.alias==='Protect a running activity from ambiguous Xbox input reports'))conditions.push({alias:'Protect a running activity from ambiguous Xbox input reports',condition:'template',value_template:observed('xbox',true)});
  c.actions=[{action:'rest_command.sony_tv_get_playing_content',response_variable:'sony_observed'},choose];
 }
 const result=await fetch(url,{method:'POST',headers,body:JSON.stringify(c)});assert.equal(result.status,200,await result.text());const verify=await fetch(url,{headers});assert.deepEqual(await verify.json(),c);fs.writeFileSync('backups/theater-controller-repair/'+id+'-observed-final.json',JSON.stringify(c,null,2));
}
console.log('Ambiguous input labels can no longer override a running activity without an observed matching CEC source.');
