export const activities = [
  ['apple_tv', 'TV', '#60a5fa'], ['dvd', 'DVD', '#a78bfa'],
  ['xbox', 'Xbox', '#4ade80'], ['echo', 'Echo', '#fbbf24'],
  ['record_player', 'Record player', '#fb7185'],
];
export const periods = [['today', 'Today'], ['this_week', 'This week'], ['this_month', 'This month']];
export const entityId = (activity, period) => `sensor.${activity}_time_${period}`;
const ids = activities.flatMap(([id]) => periods.map(([period]) => entityId(id, period)));
const macro = `{% macro duration(value) -%}
{%- if is_number(value) and value | float >= 0 -%}
{%- set minutes = (value | float * 60) | round(0) | int -%}
{{ minutes // 60 }}h {{ '%02d' | format(minutes % 60) }}m
{%- else -%}—{%- endif -%}
{%- endmacro %}`;
const total = period => `{% set ns = namespace(total=0, valid=true) %}{% for activity in ['apple_tv','dvd','xbox','echo','record_player'] %}{% set value = states('sensor.' ~ activity ~ '_time_${period}') %}{% if is_number(value) and value | float >= 0 %}{% set ns.total = ns.total + value | float %}{% else %}{% set ns.valid=false %}{% endif %}{% endfor %}{{ duration(ns.total) if ns.valid else 'Unavailable' }}`;
export function buildActivityCard() {
  const content = `${macro}
| Today | This week | This month |
| :---: | :---: | :---: |
| **${total('today')}** | **${total('this_week')}** | **${total('this_month')}** |

| Activity | Today | Week | Month |
| :--- | ---: | ---: | ---: |
${activities.map(([id, name]) => `| ${name} | ${periods.map(([period]) => `{{ duration(states('${entityId(id, period)}')) }}`).join(' | ')} |`).join('\n')}

<small>Hours & minutes · Calendar week (Mon–Sun) · Calendar month</small>`;
  const tabs = periods.map(([period, label]) => ({
    attributes: {label},
    card: {
      type: 'vertical-stack', cards: [
        {type:'markdown', content:`{% set ns = namespace(total=0, missing=false) %}{% for activity in ['apple_tv','dvd','xbox','echo','record_player'] %}{% set v = states('sensor.' ~ activity ~ '_time_${period}') %}{% if is_number(v) and v | float >= 0 %}{% set ns.total = ns.total + v | float %}{% else %}{% set ns.missing=true %}{% endif %}{% endfor %}{% if ns.missing %}Some activity stats are unavailable; distribution shows available data.{% elif ns.total == 0 %}No activity recorded ${label.toLowerCase()}.{% else %}**Activity distribution · ${label.toLowerCase()}**{% endif %}`},
        {type:'custom:apexcharts-card',chart_type:'pie',update_interval:'1min',header:{show:false},
          apex_config:{chart:{height:280},legend:{position:'bottom',fontSize:'12px'},stroke:{width:2},plotOptions:{pie:{expandOnClick:false}},dataLabels:{enabled:true,formatter:'EVAL:function(value) { return value.toFixed(1) + "%"; }'},noData:{text:'No activity recorded'}},
          series:activities.map(([id,name,color])=>({entity:entityId(id,period),name,color,unit:'h',float_precision:2,
            data_generator:'const v = Number.parseFloat(entity.state); return [[Date.now(), Number.isFinite(v) && v >= 0 ? v : null]];',
            show:{legend_value:false,as_duration:'hour',datalabels:'percent'}}))},
      ],
    },
  }));
  return {type:'custom:stack-in-card',title:'Activity stats',mode:'vertical',grid_options:{columns:12,rows:'auto'},cards:[
    {type:'markdown',entity_id:ids,content,card_mod:{style:{'ha-markdown$':'table { width: 100%; font-size: 13px; } th, td { padding: 6px 4px; }'}}},
    {type:'custom:tabbed-card',styles:{'--mdc-tab-height':'44px'},tabs},
  ]};
}

