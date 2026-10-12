import {connect} from './activity-stats-ha.mjs';
const h=await connect();try{const services=await h.call('get_services');console.log(JSON.stringify({rest:Object.keys(services.rest??{}),homeassistant:Object.keys(services.homeassistant??{}),input_boolean:Object.keys(services.input_boolean??{})}));console.log(JSON.stringify(await h.call('input_boolean/list')));}finally{h.close();}
