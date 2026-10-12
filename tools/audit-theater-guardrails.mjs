import fs from 'node:fs';
import {connect,haUrl,token} from './activity-stats-ha.mjs';
const h=await connect();
const headers={Authorization:'Bearer '+token};
const entries=[];const failures=[];
const related=/active_input|activate_xbox|activate_apple_tv|liams_xbox|sony_tv_|bravia_4k|living_room_apple_tv|record_player|alexa_pup_bluetooth|activate_dvd|av_receiver|theater_watch|last_tv_command_time/i;
try {
 const states=await h.call('get_states');
 for(const s of states.filter(s=>s.entity_id.startsWith('automation.')&&s.attributes.id)){
  const r=await fetch(haUrl+'/api/config/automation/config/'+s.attributes.id,{headers});
  if(!r.ok){failures.push({entity:s.entity_id,status:r.status});continue;}
  const config=await r.json();
  if(related.test(JSON.stringify(config))) entries.push({entity:s.entity_id,state:s.state,config});
 }
 const scripts=states.filter(s=>s.entity_id.startsWith('script.'));
 for(const s of scripts){
  const r=await fetch(haUrl+'/api/config/script/config/'+s.entity_id.substring(7),{headers});
  if(!r.ok){failures.push({entity:s.entity_id,status:r.status});continue;}
  const config=await r.json();
  if(related.test(JSON.stringify(config)))entries.push({entity:s.entity_id,state:s.state,config});
 }
 fs.mkdirSync('backups/xbox-incident-2026-10-11',{recursive:true});
 fs.writeFileSync('backups/xbox-incident-2026-10-11/theater-audit.json',JSON.stringify({entries,failures},null,2));
 console.log(JSON.stringify({entries:entries.map(e=>({entity:e.entity,state:e.state,alias:e.config.alias})),failures},null,2));
}finally{h.close();}
