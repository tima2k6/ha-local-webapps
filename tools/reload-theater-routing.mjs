import assert from 'node:assert/strict';
import {connect,haUrl,token} from './activity-stats-ha.mjs';
const r=await fetch(haUrl+'/api/config/core/check_config',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});const checked=await r.json();assert.equal(checked.result,'valid',JSON.stringify(checked));
const h=await connect();try{await h.call('call_service',{domain:'rest_command',service:'reload'});await h.call('call_service',{domain:'rest',service:'reload'});console.log('Home Assistant configuration is valid; Sony commands and sensors reloaded.');}finally{h.close();}
