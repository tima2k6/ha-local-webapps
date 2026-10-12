import assert from 'node:assert/strict';
import {haUrl,token} from './activity-stats-ha.mjs';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const r=await fetch(haUrl+'/api/config/automation/config/1769794577727',{headers});const config=await r.json();
const template=config.actions.find(a=>a.choose).choose[0].conditions.find(c=>c.alias==='Confirm the observed CEC source, not an inferred HDMI label').value_template;
const uri=n=>'extInput:cec?type=player&port=3&logicalAddr='+n;
const cases=[
 ['Apple TV on address 4 must not claim Xbox',uri(4),'cec?type=player&port=3&logicalAddr=4=Apple TV ;; cec?type=player&port=3&logicalAddr=8=XBOX','False'],
 ['Xbox on address 8 is recognized',uri(8),'cec?type=player&port=3&logicalAddr=4=Apple TV ;; cec?type=player&port=3&logicalAddr=8=XBOX','True'],
 ['Xbox on address 4 is recognized after address swap',uri(4),'cec?type=player&port=3&logicalAddr=4=XBOX ;; cec?type=player&port=3&logicalAddr=8=Apple TV','True'],
 ['Apple TV on address 8 must not claim Xbox',uri(8),'cec?type=player&port=3&logicalAddr=4=XBOX ;; cec?type=player&port=3&logicalAddr=8=Apple TV','False'],
 ['Generic HDMI label cannot claim Xbox','extInput:hdmi?port=3','cec?type=player&port=3&logicalAddr=4=XBOX','False'],
];
for(const [name,input,devices,expected]of cases){const prefix='{% set sony_observed = '+JSON.stringify({content:{result:[{uri:input}]}})+' %}';const rendered=template.replace("states('sensor.sony_tv_cec_devices')",JSON.stringify(devices));const r=await fetch(haUrl+'/api/template',{method:'POST',headers,body:JSON.stringify({template:prefix+rendered})});assert.equal(r.status,200);assert.equal((await r.text()).trim(),expected,name);console.log(name+': passed');}
const checked=await fetch(haUrl+'/api/config/core/check_config',{method:'POST',headers,body:'{}'});assert.equal((await checked.json()).result,'valid');
console.log('Five observed-source scenarios passed; HA configuration is valid.');
