import fs from 'node:fs';
import assert from 'node:assert/strict';
import {haUrl,token} from './activity-stats-ha.mjs';

// Retry the actual selection after Sony rejects an early wake-time request.
// Checking content repeatedly cannot recover a selection that never succeeded.
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const url=haUrl+'/api/config/automation/config/1769901492019';
const r=await fetch(url,{headers});assert.equal(r.status,200);
const original=await r.json();const c=structuredClone(original);
let changed=0;
for(const branch of c.actions.at(-1).choose){
  for(const step of branch.sequence){
    const repeat=step.repeat;
    if(!repeat?.sequence?.some(a=>a.action==='rest_command.sony_tv_get_playing_content'))continue;
    if(repeat.sequence.some(a=>a.action==='rest_command.sony_tv_select_receiver_hdmi'))continue;
    repeat.sequence.splice(1,0,
      {action:'rest_command.sony_tv_select_receiver_hdmi',response_variable:'hdmi_select'},
      {delay:{seconds:2}});
    changed++;
  }
}
assert.equal(changed,3,'Expected three unpatched video confirmation loops; refusing unexpected config');
const dir='backups/theater-controller-repair';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/hdmi-selection-retry-before.json',JSON.stringify(original,null,2));
const saved=await fetch(url,{method:'POST',headers,body:JSON.stringify(c)});
assert.equal(saved.status,200,await saved.text());
const verified=await fetch(url,{headers});assert.deepEqual(await verified.json(),c);
fs.writeFileSync(dir+'/hdmi-selection-retry-after.json',JSON.stringify(c,null,2));
const check=await fetch(haUrl+'/api/config/core/check_config',{method:'POST',headers,body:'{}'});
const validity=await check.json();assert.equal(validity.result,'valid',JSON.stringify(validity));
console.log('All three video starts now retry HDMI selection and confirm the observed input, with a four-attempt limit. Configuration valid.');
