import fs from 'node:fs';
import {connect} from './activity-stats-ha.mjs';
const audit=JSON.parse(fs.readFileSync('backups/xbox-incident-2026-10-11/theater-audit.json','utf8'));
const h=await connect();try{
const states=await h.call('get_states');const ids=new Set(states.map(s=>s.entity_id));const services=await h.call('get_services');for(const [domain,values]of Object.entries(services))for(const service of Object.keys(values))ids.add(domain+'.'+service);
const missing=[];
for(const e of audit.entries){const refs=[...JSON.stringify(e.config).matchAll(/\b(?:input_boolean|input_select|input_datetime|binary_sensor|sensor|media_player|switch|button|script|automation)\.[a-z0-9_]+\b/g)].map(m=>m[0]);for(const ref of new Set(refs))if(!ids.has(ref))missing.push({entity:e.entity,state:e.state,ref});}
console.log(JSON.stringify({missing,unreadable:audit.failures.map(e=>({...e,state:states.find(s=>s.entity_id===e.entity)?.state}))},null,2));
}finally{h.close();}
