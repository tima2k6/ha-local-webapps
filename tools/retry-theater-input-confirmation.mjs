import fs from 'node:fs';
import assert from 'node:assert/strict';
import {haUrl,token} from './activity-stats-ha.mjs';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const url=haUrl+'/api/config/automation/config/1769901492019';const r=await fetch(url,{headers});const c=await r.json();
for(const branch of c.actions.at(-1).choose){
const seq=branch.sequence;const at=seq.findIndex(a=>a.action==='rest_command.sony_tv_get_playing_content');
if(at<0)continue;
const condition=seq[at+1].wait_template;assert.ok(condition?.includes("playing.get"));
seq.splice(at,1,{repeat:{sequence:[{delay:{seconds:4}},{action:'rest_command.sony_tv_get_playing_content',response_variable:'playing'}],until:[{condition:'template',value_template:condition},{condition:'template',value_template:'{{ repeat.index >= 4 }}'}]}});
// Until conditions are ANDed by HA; use one OR expression so success exits early.
seq[at].repeat.until=[{condition:'template',value_template:"{% set p = playing.get('content', {}) %}{% set result = p.get('result', []) if p is mapping else [] %}{{ repeat.index >= 4 or (result | length > 0 and result[0] is mapping and 'port=3' in result[0].get('uri','')) }}"}];
}
const saved=await fetch(url,{method:'POST',headers,body:JSON.stringify(c)});assert.equal(saved.status,200,await saved.text());const verified=await fetch(url,{headers});assert.deepEqual(await verified.json(),c);
fs.writeFileSync('backups/theater-controller-repair/master-final.json',JSON.stringify(c,null,2));
console.log('Video input confirmation now tolerates transient Sony no-content responses with bounded retries.');
