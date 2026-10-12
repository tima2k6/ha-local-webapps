import fs from 'node:fs';
import {connect,haUrl,token} from './activity-stats-ha.mjs';
const h=await connect();try{
const states=await h.call('get_states');const entries=[];
const names=['automation.master_activity_controller','automation.sync_active_input_when_switches_change','automation.sync_active_input_when_switches_change_2','automation.sync_when_devices_power_on','automation.system_sync_wemo_to_vinyl','automation.av_receiver_bluetooth_input','automation.av_receiver_sync_power_state_from_plug','automation.av_receiver_track_power_state','automation.reset_when_everything_off','automation.audio_activity_keep_tv_off_after_start'];
for(const s of states.filter(s=>names.includes(s.entity_id)||/^script.theater_(watch_|record_player|echo_bluetooth|off)/.test(s.entity_id))){const kind=s.entity_id.split('.')[0];const id=kind==='script'?s.entity_id.slice(7):s.attributes.id;const r=await fetch(haUrl+'/api/config/'+kind+'/config/'+id,{headers:{Authorization:'Bearer '+token}});entries.push({entity:s.entity_id,state:s.state,config:await r.json()});}
fs.mkdirSync('backups/theater-controller-repair',{recursive:true});fs.writeFileSync('backups/theater-controller-repair/current.json',JSON.stringify(entries,null,2));console.log(JSON.stringify(entries.filter(e=>!e.entity.includes('master_activity')).map(e=>e),null,0));
}finally{h.close();}
