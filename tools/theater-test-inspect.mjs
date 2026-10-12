import fs from 'node:fs';
import {connect} from './activity-stats-ha.mjs';
const h=await connect();try{
const states=await h.call('get_states');
const related=states.filter(x=>/^(media_player.bravia|media_player.living_room_apple_tv|media_player.liams_xbox|input_boolean.(activate_|av_receiver_power|alexa_pup_bluetooth|record_player)|input_select.active_input|sensor.sony_tv_|switch.liams_xbox_power|input_datetime.last_tv_command_time)/.test(x.entity_id));
fs.mkdirSync('backups/theater-input-tests',{recursive:true});fs.writeFileSync('backups/theater-input-tests/starting-state.json',JSON.stringify(related,null,2));
console.log(JSON.stringify(related.map(x=>({id:x.entity_id,state:x.state,attributes:x.attributes})),null,2));
const services=await h.call('get_services');console.log(JSON.stringify({select_source:services.media_player.select_source,rest_command:Object.keys(services.rest_command)},null,2));
}finally{h.close();}
