import fs from 'node:fs';
import assert from 'node:assert/strict';
import {haUrl,token,connect} from './activity-stats-ha.mjs';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const id='1769901492019',url=haUrl+'/api/config/automation/config/'+id;
const r=await fetch(url,{headers});const c=await r.json();
c.conditions=[{condition:'template',value_template:"{{ trigger.id != 'request_end' or (['input_boolean.activate_apple_tv','input_boolean.activate_xbox','input_boolean.activate_dvd','input_boolean.alexa_pup_bluetooth','input_boolean.record_player'] | select('is_state','on') | list | count == 0) }}"}];
if(c.actions[2].action==='persistent_notification.dismiss')c.actions[2]={if:[{condition:'template',value_template:"{{ requested != 'request_end' }}"}],then:[c.actions[2]]};
// Correct the response shape before exercising any devices: Sony returns result=[object].
for(const b of c.actions.at(-1).choose)for(const a of b.sequence){if(a.wait_template?.includes("result[0][0]"))a.wait_template=a.wait_template.replace("result[0] | length > 0 and 'port=3' in result[0][0].get", "result[0] is mapping and 'port=3' in result[0].get");}
const saved=await fetch(url,{method:'POST',headers,body:JSON.stringify(c)});assert.equal(saved.status,200,await saved.text());
fs.writeFileSync('backups/theater-controller-repair/automation.master_activity_controller-after.json',JSON.stringify(c,null,2));
const template=c.actions.at(-1).choose[0].sequence.find(a=>a.wait_template?.includes("playing.get")).wait_template;
for(const [name,result,expected]of [['HDMI3',[{uri:'extInput:hdmi?port=3'}],'True'],['CEC3',[{uri:'extInput:cec?type=player&port=3&logicalAddr=4'}],'True'],['tuner',[{uri:'tv:dvbt?trip=1'}],'False'],['empty',[],'False']]){
const prefix='{% set playing = '+JSON.stringify({content:{result}})+' %}';const r=await fetch(haUrl+'/api/template',{method:'POST',headers,body:JSON.stringify({template:prefix+template})});assert.equal(r.status,200);assert.equal((await r.text()).trim(),expected);console.log('Physical-input response gate: '+name+' passed');}
const checked=await fetch(haUrl+'/api/config/core/check_config',{method:'POST',headers,body:'{}'});assert.equal((await checked.json()).result,'valid');
const h=await connect();try{const s=await h.call('get_states');console.log(JSON.stringify(s.filter(x=>['automation.master_activity_controller','automation.av_receiver_bluetooth_input','automation.av_receiver_track_power_state','input_boolean.theater_dvd_owned'].includes(x.entity_id)).map(x=>({id:x.entity_id,state:x.state}))));}finally{h.close();}
