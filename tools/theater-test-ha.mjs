import fs from 'node:fs';
import {connect,haUrl,token} from './activity-stats-ha.mjs';
const [action,arg]=process.argv.slice(2);
const h=await connect();
try{
if(action==='dvd_power_restore'){
 await h.call('call_service',{domain:'button',service:'press',target:{entity_id:'button.av_cabinet_controller_dvd_power'}});
 console.log(JSON.stringify({when:new Date().toISOString(),command:'invert_test_dvd_power_toggle'}));
}else if(action==='activity'){
 const scripts={apple_tv:'theater_watch_apple_tv',xbox:'theater_watch_xbox',dvd:'theater_watch_dvd',echo:'theater_echo_bluetooth',record_player:'theater_record_player',off:'theater_off'};
 if(!scripts[arg])throw Error('Unsupported activity');
 await h.call('call_service',{domain:'script',service:'turn_on',target:{entity_id:'script.'+scripts[arg]}});
 console.log(JSON.stringify({when:new Date().toISOString(),activity:arg}));
}else if(action==='restore'){
 const initial=JSON.parse(fs.readFileSync('backups/theater-input-tests/starting-state.json','utf8'));
 const original=Object.fromEntries(initial.map(s=>[s.entity_id,s.state]));
 const call=(domain,service,entity_id,data={})=>h.call('call_service',{domain,service,target:{entity_id},service_data:data});
 if(original['media_player.living_room_apple_tv']==='off')await call('media_player','turn_off','media_player.living_room_apple_tv');
 await new Promise(r=>setTimeout(r,14000));
 const current=await h.call('get_states');const states=Object.fromEntries(current.map(s=>[s.entity_id,s.state]));
 for(const id of ['input_boolean.activate_xbox','input_boolean.activate_apple_tv','input_boolean.activate_dvd'])if(original[id]==='off'&&states[id]==='on')await call('input_boolean','turn_off',id);
 if(original['input_select.active_input']==='None')await call('input_select','select_option','input_select.active_input',{option:'None'});
 if(original['media_player.bravia_4k_ur2_2']==='on')await call('media_player','turn_on','media_player.bravia_4k_ur2_2');
 if(original['input_boolean.av_receiver_power']==='on'&&states['input_boolean.av_receiver_power']==='off')await call('button','press','button.av_cabinet_controller_av_receiver_power');
 console.log(JSON.stringify({restored:true}));
}else if(action==='press'){
 const allowed=['game','media_box','dvd'];if(!allowed.includes(arg))throw Error('Unsupported input');
 await h.call('call_service',{domain:'button',service:'press',target:{entity_id:'button.av_cabinet_controller_av_receiver_'+arg}});
 console.log(JSON.stringify({when:new Date().toISOString(),command:arg}));
}else if(action==='state'){
 const states=await h.call('get_states');console.log(JSON.stringify(states.filter(x=>/^(sensor.sony_tv_|input_boolean.(activate_|av_receiver_power|alexa_pup_bluetooth|record_player)|input_select.active_input|switch.(liams_xbox_power|record_player_power)|media_player.(living_room_apple_tv|liams_xbox|bravia_4k_ur2_2|alexa_pup)|sensor.hub_mode|binary_sensor.av_cabinet_controller_av_receiver_power|automation.(master_activity_controller|sync_active_input_when_switches_change_2|av_receiver_bluetooth_input|system_sync_wemo_to_vinyl)|script.theater_|sensor.xbox_power_plug_shelly_integration_power)/.test(x.entity_id)||/dvd.*power|power.*dvd/i.test(x.entity_id)).map(x=>({id:x.entity_id,state:x.state,changed:x.last_changed,context:x.context}))));
}else if(action==='evidence'){
 const dir=new URL('../backups/theater-input-tests/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
 const r=await fetch(haUrl+'/api/logbook/'+arg,{headers:{Authorization:'Bearer '+token}});
 const events=(await r.json()).filter(x=>/sony_tv|activity|active_input|activate_|av_receiver|xbox|apple_tv/i.test(JSON.stringify(x)));
 fs.writeFileSync(new URL('logbook.json',dir),JSON.stringify(events,null,2));
 const traces=[];
 for(const item_id of ['1769794577727','1773513231439','1769901492019','1769901557888','1766079220833','1772829214891','1769901541455','1790094812757']){
  try{const list=await h.call('trace/list',{domain:'automation',item_id});
   for(const row of Object.values(list)){if(row.timestamp?.start>=arg){const trace=await h.call('trace/get',{domain:'automation',item_id,run_id:row.run_id});traces.push({item_id,trace});}}
  }catch(e){traces.push({item_id,error:String(e)});}
 }
 fs.writeFileSync(new URL('traces.json',dir),JSON.stringify(traces,null,2));
 console.log(JSON.stringify({events:events.length,traces:traces.length,traceErrors:traces.filter(t=>t.error)}));
}else throw Error('Unsupported action');
}finally{h.close();}
