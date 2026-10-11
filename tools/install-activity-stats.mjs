import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './activity-stats-ha.mjs';
import {buildActivityCard,activities,periods,entityId} from './activity-stats-card.mjs';
const ha=await connect();
try{
const dashboard=await ha.call('lovelace/config');
const states=await ha.call('get_states');
for(const [activity] of activities)for(const [period] of periods)assert.ok(states.some(s=>s.entity_id===entityId(activity,period)),`Missing ${entityId(activity,period)}`);
const card=buildActivityCard();
fs.mkdirSync('previews/activity-stats',{recursive:true});
fs.writeFileSync('previews/activity-stats/card.json',JSON.stringify(card,null,2));
const view=dashboard.views.find(v=>v.path==='default_view_hidden');assert.ok(view?.sections?.[3]);
const section=view.sections[3];
const existing=section.cards.findIndex(c=>c.type==='custom:stack-in-card'&&c.title==='Activity stats');
if(existing<0)section.cards.push(card);else section.cards[existing]=card;
const backup=await ha.call('lovelace/config');
fs.writeFileSync(`previews/activity-stats/dashboard-before-${Date.now()}.json`,JSON.stringify(backup,null,2));
// Re-read before applying to avoid replacing a concurrent edit.
assert.deepEqual(await ha.call('lovelace/config'),backup);
await ha.call('lovelace/config/save',{config:dashboard});
const saved=await ha.call('lovelace/config');assert.deepEqual(saved,dashboard);
console.log(JSON.stringify({saved:true,view:view.path,card:'Activity stats',entities:15}));
}finally{ha.close()}
