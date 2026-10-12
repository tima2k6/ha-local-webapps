import {connect,haUrl,token} from './activity-stats-ha.mjs';
const h=await connect();
try {
 const s=await h.call('get_states');
 console.log(JSON.stringify(s.filter(x=>/automation.*(xbox|activity|input)|input_.*(xbox|activity|input)|media_player.liams_xbox|sensor.sony_tv_current_input/i.test(x.entity_id))));
 const ids=s.filter(x=>/xbox|apple_tv|activate_tv|activity/i.test(x.entity_id)&&!/^sensor\./.test(x.entity_id)).map(x=>x.entity_id);
 const r=await fetch(haUrl+'/api/history/period/2026-10-12T05:08:00Z?end_time=2026-10-12T05:18:00Z&filter_entity_id='+ids.join(','),{headers:{Authorization:'Bearer '+token}});
 console.log('HISTORY',JSON.stringify((await r.json()).map(a=>a.map(x=>({id:x.entity_id,s:x.state,t:x.last_changed,c:x.context})))));
 const l=await fetch(haUrl+'/api/logbook/2026-10-12T05:08:00Z?end_time=2026-10-12T05:18:00Z',{headers:{Authorization:'Bearer '+token}});
 console.log('LOGBOOK',JSON.stringify((await l.json()).filter(x=>/xbox|activity|sony_tv_current_input|active_input|av_receiver/i.test(JSON.stringify(x)))));
 for(const a of s.filter(x=>/automation.*(xbox|activity|sync_active_input)/.test(x.entity_id))){const id=a.attributes.id;if(!id)continue;const r=await fetch(haUrl+'/api/config/automation/config/'+id,{headers:{Authorization:'Bearer '+token}}); console.log('CONFIG',a.entity_id,JSON.stringify(await r.json()));}
} finally {h.close();}
