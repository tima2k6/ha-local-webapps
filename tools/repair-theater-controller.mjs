import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,haUrl,token} from './activity-stats-ha.mjs';
const dir='backups/theater-controller-repair';
const entries=JSON.parse(fs.readFileSync(dir+'/current.json','utf8'));
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const flags=['input_boolean.activate_apple_tv','input_boolean.activate_xbox','input_boolean.activate_dvd','input_boolean.alexa_pup_bluetooth','input_boolean.record_player'];
const targets={request_appletv:['Apple TV',flags[0],'media_box'],request_xbox:['Xbox',flags[1],'game'],request_dvd:['DVD',flags[2],'dvd'],request_echo:['Echo',flags[3],'bluetooth'],request_record:['Record Player',flags[4],'sa_cd']};
const service=(action,entity,data)=>({action,...(entity?{target:{entity_id:entity}}:{}),...(data?{data}:{})});
const select=option=>service('input_select.select_option','input_select.active_input',{option});
const delay=seconds=>({delay:{seconds}});
const state=(entity_id,value)=>({condition:'state',entity_id,state:value});
const wait=(template,seconds=20)=>({wait_template:template,timeout:{seconds},continue_on_timeout:true});
const request=(entity)=>[service('input_boolean.turn_on',entity)];
const edits=[];
function edit(entity,fn){const original=entries.find(e=>e.entity===entity);assert.ok(original,entity);const config=structuredClone(original.config);fn(config);edits.push({...original,original:original.config,config});}
const offAsync=service('script.turn_on','script.theater_off');
function failed(message){return [{if:[{condition:'template',value_template:'{{ not wait.completed }}'}],then:[service('persistent_notification.create',null,{title:'Theater activity did not start',notification_id:'theater_start_failure',message}),select('None'),offAsync,{stop:message}]}];}
const h=await connect();try{
const booleans=await h.call('input_boolean/list');
if(!booleans.some(b=>b.id==='theater_dvd_owned'))await h.call('input_boolean/create',{name:'Theater DVD Owned',icon:'mdi:disc-player'});
const owned='input_boolean.theater_dvd_owned';
edit('automation.master_activity_controller',c=>{
 assert.ok(!c.description.includes('Single owner'), 'Controller repair already installed');
 c.description='Single owner of activity startup commands. Sensor-sync automations request helpers only. Video starts explicitly select TV HDMI 3; failed wakes do not claim a successful activity. New requests cancel older sequences.';
 c.triggers.push({trigger:'state',entity_id:flags[3],from:'off',to:'on',id:'request_echo'},{trigger:'state',entity_id:flags[4],from:'off',to:'on',id:'request_record'},{trigger:'state',entity_id:flags,from:'on',to:'off',for:{seconds:1},id:'request_end'});
 const oldBranches=c.actions[1].choose;
 c.conditions=[{condition:'template',value_template:"{{ trigger.id != 'request_end' or (['input_boolean.activate_apple_tv','input_boolean.activate_xbox','input_boolean.activate_dvd','input_boolean.alexa_pup_bluetooth','input_boolean.record_player'] | select('is_state','on') | list | count == 0) }}"}];
 const common=[{variables:{requested:'{{ trigger.id }}'}},c.actions[0],{if:[{condition:'template',value_template:"{{ requested != 'request_end' }}"}],then:[service('persistent_notification.dismiss',null,{notification_id:'theater_start_failure'})]}];
 const branches=[];
 for(const old of oldBranches){
  const id=old.conditions[0].id;const [label,flag,button]=targets[id];
  let seq=old.sequence.filter(a=>!(a.action==='button.press'&&String(a.target?.entity_id).includes('av_receiver_')&&!String(a.target?.entity_id).endsWith('_power'))&&!a.repeat&&!String(a.alias??'').startsWith('Re-press'));
  seq=seq.map(a=>a.action==='input_select.select_option'?select('None'):a);
  const on=seq.findIndex(a=>a.action==='media_player.turn_on'&&a.target?.entity_id==='media_player.bravia_4k_ur2_2');assert.ok(on>=0);
  seq.splice(on+1,0,wait("{{ is_state('media_player.bravia_4k_ur2_2','on') }}",25),...failed('The TV did not report on.'),{action:'rest_command.sony_tv_select_receiver_hdmi',response_variable:'hdmi_select'},delay(3));
  const avr=seq.findIndex(a=>a.if&&a.then?.some(x=>x.target?.entity_id==='button.av_cabinet_controller_av_receiver_power'));
  if(avr>=0)seq[avr]={if:[state('binary_sensor.av_cabinet_controller_av_receiver_power','off')],then:[service('button.press','button.av_cabinet_controller_av_receiver_power'),wait("{{ is_state('binary_sensor.av_cabinet_controller_av_receiver_power','on') }}",15),...failed('The receiver did not report on.')]};
  if(id==='request_xbox'){
   const wake=seq.findIndex(a=>a.alias?.startsWith('Wake the Xbox'));assert.ok(wake>=0);
   seq.splice(wake+1,0,wait("{{ is_state('switch.liams_xbox_power','on') }}",10),...failed('Xbox power-on could not be confirmed. Remote wake may be unavailable; use the controller and request Xbox again.'));
  }
  if(id==='request_appletv'){
   const wake=seq.findIndex(a=>a.if&&a.then?.some(x=>x.target?.entity_id==='media_player.living_room_apple_tv'&&x.action==='media_player.turn_on'));
   seq.splice(wake+1,0,wait("{{ states('media_player.living_room_apple_tv') not in ['off','standby','unknown','unavailable'] }}",20),...failed('Apple TV did not report awake.'));
  }
  if(id==='request_dvd'){
   const dvd=seq.findIndex(a=>a.action==='button.press'&&a.target?.entity_id==='button.av_cabinet_controller_dvd_power');assert.ok(dvd>=0);
   seq[dvd]={if:[state(owned,'off')],then:[seq[dvd],service('input_boolean.turn_on',owned)]};
  }
  seq.push(delay(3),{condition:'state',entity_id:flag,state:'on'},service('button.press','button.av_cabinet_controller_av_receiver_'+button),delay(3),{action:'rest_command.sony_tv_get_playing_content',response_variable:'playing'});
  seq.push(wait("{% set p = playing.get('content', {}) %}{% set result = p.get('result', []) if p is mapping else [] %}{{ result | length > 0 and result[0] is mapping and 'port=3' in result[0].get('uri','') }}",1),...failed('The TV did not confirm HDMI 3 after the activity request.'),select(label));
  branches.push({conditions:[{condition:'trigger',id}],sequence:seq});
 }
 for(const [id,entity]of [['request_echo','automation.av_receiver_bluetooth_input'],['request_record','automation.system_sync_wemo_to_vinyl']]){
  const [label,flag,button]=targets[id];
  const seq=[select('None'),service('input_boolean.turn_off',flags.filter(f=>f!==flag)),service('media_player.turn_off','media_player.living_room_apple_tv'),service('media_player.turn_off','media_player.bravia_4k_ur2_2'),wait("{{ is_state('media_player.bravia_4k_ur2_2','off') }}",25),...failed('The TV did not turn off for the audio activity.'),{if:[state('binary_sensor.av_cabinet_controller_av_receiver_power','off')],then:[service('button.press','button.av_cabinet_controller_av_receiver_power'),wait("{{ is_state('binary_sensor.av_cabinet_controller_av_receiver_power','on') }}",15),...failed('The receiver did not report on.')]},delay(3),state(flag,'on'),service('button.press','button.av_cabinet_controller_av_receiver_'+button),select(label)];
  branches.push({conditions:[{condition:'trigger',id}],sequence:seq});
 }
 const allOff={condition:'template',value_template:"{{ ['input_boolean.activate_apple_tv','input_boolean.activate_xbox','input_boolean.activate_dvd','input_boolean.alexa_pup_bluetooth','input_boolean.record_player'] | select('is_state','on') | list | count == 0 }}"};
 branches.push({conditions:[{condition:'trigger',id:'request_end'},allOff,{condition:'template',value_template:"{{ states('input_select.active_input') in ['Echo','Record Player'] or (states('input_select.active_input') in ['Apple TV','Xbox','DVD'] and states('sensor.sony_tv_current_input') in ['Apple TV','Xbox','HDMI 3','No Signal','Off']) }}"}],sequence:[offAsync]});
 c.actions=[...common,{if:[{condition:'template',value_template:"{{ requested != 'request_dvd' and is_state('input_boolean.theater_dvd_owned','on') }}"}],then:[service('button.press','button.av_cabinet_controller_dvd_power'),service('input_boolean.turn_off',owned)]},{choose:branches}];
});
for(const [entity,flag]of [['script.theater_watch_apple_tv',flags[0]],['script.theater_watch_xbox',flags[1]],['script.theater_watch_dvd',flags[2]],['script.theater_echo_bluetooth',flags[3]],['script.theater_record_player',flags[4]]])edit(entity,c=>{c.sequence=request(flag);c.description='Request the activity; Master Activity Controller owns device commands and cleanup.';});
edit('automation.system_sync_wemo_to_vinyl',c=>{c.description='Record Player power plug follows its request helper; activity transitions and receiver commands belong to Master.';c.actions=[{choose:[{conditions:[{condition:'trigger',id:'activity_on'}],sequence:[service('switch.turn_on','switch.record_player_power')]},{conditions:[{condition:'trigger',id:'activity_off'}],sequence:[service('switch.turn_off','switch.record_player_power')]}]}];});
edit('automation.av_receiver_bluetooth_input',c=>{c.description='Legacy Bluetooth controller retired; Master Activity Controller handles this request.';c.actions=[];});
edit('automation.av_receiver_sync_power_state_from_plug',c=>{c.description='Mirror actual receiver power only; avoid independent delayed input selection.';c.actions=[{choose:[{conditions:[{condition:'trigger',id:'powered_on'}],sequence:[service('input_boolean.turn_on','input_boolean.av_receiver_power')]},{conditions:[{condition:'trigger',id:'powered_off'}],sequence:[service('input_boolean.turn_off','input_boolean.av_receiver_power')]}]}];});
edit('automation.sync_active_input_when_switches_change',c=>{for(const branch of c.actions[0].choose){const label=branch.conditions[0].state;branch.sequence=request(label==='Xbox'?flags[1]:flags[0]);}});
edit('automation.sync_when_devices_power_on',c=>{const first=c.actions.findIndex(a=>a.action==='input_select.select_option');c.actions=c.actions.slice(0,first).filter(a=>a.action!=='input_datetime.set_datetime');c.actions.push(...request(flags[1]));});
edit('automation.sync_active_input_when_switches_change_2',c=>{
 const branches=c.actions[0].choose;branches[0].sequence=request(flags[1]);branches[2].sequence=request(flags[0]);
 for(const [index,label,flag]of [[1,'Xbox',flags[1]],[3,'Apple TV',flags[0]]]){
  branches[index].conditions.push(state('input_select.active_input',label));
  branches[index].sequence=[{if:[{condition:'template',value_template:"{{ states('sensor.sony_tv_current_input') in ['Apple TV','Xbox','HDMI 3','No Signal','Off'] }}"}],then:[offAsync],else:[select('None'),service('input_boolean.turn_off',flag)]}];
 }
});
edit('script.theater_off',c=>{
 c.sequence=[{if:[state('automation.master_activity_controller','on')],then:[service('automation.turn_off','automation.master_activity_controller',{stop_actions:true}),service('automation.turn_on','automation.master_activity_controller')]},c.sequence[0],service('input_boolean.turn_off',flags),select('None'),service('switch.turn_off','switch.record_player_power'),{if:[state(owned,'on')],then:[service('button.press','button.av_cabinet_controller_dvd_power'),service('input_boolean.turn_off',owned)]},service('media_player.turn_off','media_player.living_room_apple_tv'),{if:[state('switch.liams_xbox_power','on')],then:[service('switch.turn_off','switch.liams_xbox_power')]},service('media_player.turn_off','media_player.bravia_4k_ur2_2'),wait("{{ is_state('media_player.bravia_4k_ur2_2','off') }}",25),{if:[state('binary_sensor.av_cabinet_controller_av_receiver_power','on')],then:[service('button.press','button.av_cabinet_controller_av_receiver_power'),wait("{{ is_state('binary_sensor.av_cabinet_controller_av_receiver_power','off') }}",15)]}];c.mode='restart';
});
for(const e of edits){const kind=e.entity.split('.')[0];const id=kind==='script'?e.entity.slice(7):e.config.id;const url=haUrl+'/api/config/'+kind+'/config/'+id;const before=await fetch(url,{headers});assert.deepEqual(await before.json(),e.original,'Live configuration changed: '+e.entity);fs.writeFileSync(dir+'/'+e.entity+'-before.json',JSON.stringify(e.original,null,2));fs.writeFileSync(dir+'/'+e.entity+'-after.json',JSON.stringify(e.config,null,2));const result=await fetch(url,{method:'POST',headers,body:JSON.stringify(e.config)});assert.equal(result.status,200,await result.text());const verify=await fetch(url,{headers});assert.deepEqual(await verify.json(),e.config);console.log('Saved '+e.entity);}
await h.call('call_service',{domain:'automation',service:'turn_off',target:{entity_id:'automation.av_receiver_bluetooth_input'}});
await h.call('call_service',{domain:'automation',service:'turn_off',target:{entity_id:'automation.av_receiver_track_power_state'}});
console.log('Controller definitions saved and verified; legacy duplicate controllers disabled.');
}finally{h.close();}
