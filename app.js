'use strict';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const nodes=D.sensors.filter(p=>p.type!=='GW'),aq=nodes.filter(p=>p.type==='AQ');
const byId=new Map(D.sensors.map(p=>[p.id,p]));
const source=D.scenario.source,theta=D.scenario.wind_to_deg*Math.PI/180;
const offlineIds=new Set(['AQ-009','AQ-018','AQ-035','AQ-062','WS-009','WS-018','WS-035','WS-062']);
const state={scenario:'smoke',time:24,playing:false,speed:1,selected:'AQ-039',ackAt:null,zoom:1};
const markers=new Map();
function svg(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(parent)parent.appendChild(e);return e}
const sx=x=>500+x/5,sy=y=>500-y/5;
const path=p=>p.map((a,i)=>(i?'L':'M')+sx(a[0]).toFixed(2)+','+sy(a[1]).toFixed(2)).join(' ');
function timeLabel(t,seconds=false){const sec=Math.round(t*60),h=14+Math.floor(sec/3600),m=Math.floor(sec/60)%60,s=sec%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+(seconds?':'+String(s).padStart(2,'0'):'')}
function reading(p,t=state.time,scene=state.scenario){
 const stale=scene==='outage'&&t>=12&&offlineIds.has(p.id);
 if(p.type!=='AQ')return {id:p.id,stale,last:t>=12&&stale?12:t};
 const age=Math.max(0,t-8),dx=p.x-source.x,dy=p.y-source.y;
 const along=dx*Math.sin(theta)+dy*Math.cos(theta),cross=dx*Math.cos(theta)-dy*Math.sin(theta);
 const local=Math.exp(-(dx*dx+dy*dy)/(2*85**2));
 const plume=along>=0&&along<=2.18*age*60?Math.exp(-(cross**2)/(2*(90+.18*along)**2))*Math.exp(-along/900):0;
 const signal=scene==='smoke'?Math.max(local,plume)*(1-Math.exp(-age/8)):0;
 const pm=15+130*signal,co=.15+.85*signal;
 return {id:p.id,stale,pm,co,flag:!stale&&pm-15>25&&co-.15>.2,last:stale?12:t};
}
function snapshot(){const r=aq.map(p=>reading(p));return {readings:r,flags:r.filter(x=>x.flag),stale:nodes.filter(p=>reading(p).stale),peak:Math.max(...r.filter(r=>!r.stale).map(r=>r.pm))}}
for(const c of D.contours)svg('path',{d:path(c.p),fill:'none',stroke:'#294d3d','stroke-width':.7,opacity:.28},$('contours'));
for(const r of D.roads)svg('path',{d:path(r.p),fill:'none',stroke:r.water?'#628fa2':'#fdf8db','stroke-width':r.water?2.1:3},$('roads'));
for(const p of D.sensors){const g=p.type==='WS'?'weather-points':p.type==='AQ'?'smoke-points':'gateway-points';let e;
 const x=sx(p.x)+(p.type==='AQ'?2:0),y=sy(p.y);
 if(p.type==='WS')e=svg('path',{d:`M${x-4},${y+4}L${x},${y-4}L${x+4},${y+4}Z`,fill:'#4388a9',stroke:'#fff','stroke-width':.7},$(g));
 else e=svg('circle',{cx:x,cy:y,r:p.type==='AQ'?4.8:7,fill:p.type==='AQ'?'#2d8761':'#7b6a9e',stroke:'#fff','stroke-width':1},$(g));
 e.setAttribute('class','sensor');e.setAttribute('data-node',p.id);svg('title',{},e).textContent=p.id+(p.type==='AQ'?' · เลือกเพื่อดูค่าควัน':' · จุดสถานีอากาศที่เสนอ');
 if(p.type==='AQ')e.addEventListener('click',()=>selectSensor(p.id));markers.set(p.id,e);
}
for(const p of aq){const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.id; $('sensor-select').appendChild(opt)}
function selectSensor(id){if(!aq.some(p=>p.id===id))return false;state.selected=id;$('sensor-select').value=id;renderSensor();return true}
function renderSensor(){const p=byId.get(state.selected),r=reading(p);$('pm').textContent=r.stale?'—':r.pm.toFixed(1);$('co').textContent=r.stale?'—':r.co.toFixed(2);
 $('sensor-status').textContent=r.stale?`ข้อมูลขาด ${Math.floor(state.time-12)} นาที · ไม่ใช้ยืนยันเหตุ`:r.flag?'สัญญาณผิดปกติ · ต้องตรวจสอบ':'ยังไม่ถึงเกณฑ์ควันผิดปกติ';
 $('sensor-status').style.color=r.stale?'#657477':r.flag?'#ab5818':'#397558';
 $('sensor-location').textContent=`${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)} · ${p.landcover==='Tree cover'?'พื้นที่ tree cover':'พื้นที่ '+p.landcover} · ค่าจำลอง`;
 $('selected').setAttribute('cx',sx(p.x));$('selected').setAttribute('cy',sy(p.y));$('selected').setAttribute('visibility','visible');
 const start=Math.max(0,state.time-10),end=Math.max(1,state.time),series=Array.from({length:31},(_,i)=>{const t=start+(end-start)*i/30;return{t,r:reading(p,t)}}),max=Math.max(50,...series.filter(v=>!v.r.stale).map(v=>v.r.pm))*1.15;
 const x=t=>36+(t-start)/(end-start||1)*315,y=v=>94-v/max*75;
 const valid=series.filter(v=>!v.r.stale);const line=valid.map((v,i)=>(i?'L':'M')+x(v.t).toFixed(1)+','+y(v.r.pm).toFixed(1)).join(' ');
 $('chart-line').setAttribute('d',line);$('chart-area').setAttribute('d',valid.length?line+`L${x(valid.at(-1).t)} 94L${x(valid[0].t)} 94Z`:'');
 $('chart-grid').setAttribute('d','M36 19H351M36 56H351M36 94H351');$('chart-labels').replaceChildren();
 for(const[v,yy]of[[Math.round(max),22],[Math.round(max/2),60],[0,98]])svg('text',{x:29,y:yy,'text-anchor':'end'},$('chart-labels')).textContent=v;
 svg('text',{x:36,y:115},$('chart-labels')).textContent=timeLabel(start);svg('text',{x:350,y:115,'text-anchor':'end'},$('chart-labels')).textContent=timeLabel(end);
 $('chart-range').textContent=`${timeLabel(start)}–${timeLabel(end)}`;
}
function hull(points){const p=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],hi=[];for(const a of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),a)<=0)lo.pop();lo.push(a)}for(const a of p.slice().reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),a)<=0)hi.pop();hi.push(a)}lo.pop();hi.pop();return lo.concat(hi)}
function renderMap(s){$('flags').replaceChildren();$('zone').replaceChildren();$('forecast').replaceChildren();$('maplabels').replaceChildren();
 for(const p of nodes){const r=reading(p),e=markers.get(p.id);e.setAttribute('fill',r.stale?'#8b9293':p.type==='WS'?'#4388a9':r.flag?'#d96522':'#2d8761');if(r.stale){svg('circle',{cx:sx(p.x),cy:sy(p.y),r:8,fill:'none',stroke:'#707b7b','stroke-width':1.5,'stroke-dasharray':'3 2','pointer-events':'none'},$('flags'))}}
 if(s.flags.length){const ps=s.flags.map(r=>byId.get(r.id)),extended=ps.flatMap(p=>[[p.x-100,p.y],[p.x+100,p.y],[p.x,p.y-100],[p.x,p.y+100]]);svg('path',{d:path(hull(extended))+'Z',fill:'#ec873f','fill-opacity':.18,stroke:'#b56d25','stroke-width':2.2,'stroke-dasharray':'7 4','pointer-events':'none'},$('zone'));
  for(const p of ps){svg('circle',{cx:sx(p.x)+2,cy:sy(p.y),r:11,fill:'none',stroke:'#d86720','stroke-width':2,'pointer-events':'none'},$('flags'));const tx=svg('text',{x:sx(p.x)+14,y:sy(p.y)-9,fill:'#63361f','font-size':14,'font-weight':600,'paint-order':'stroke',stroke:'#fff9ed','stroke-width':3,'pointer-events':'none'},$('flags'));tx.textContent=p.id}
 }
 const wx=sx(500),wy=sy(1100);svg('path',{d:`M${wx} ${wy}l105 -17`,stroke:'#183f4f','stroke-width':3,'marker-end':'url(#wind-arrow)'},$('maplabels'));svg('text',{x:wx-4,y:wy+23,fill:'#183f4f','font-size':15,'paint-order':'stroke',stroke:'#fff','stroke-width':3},$('maplabels')).textContent='ลมไปตะวันออก';
 if($('showforecast').checked&&state.scenario==='smoke'&&state.time>8){const elapsed=state.time-8,level=elapsed<=15?15:elapsed<=30?30:60;for(const c of D.scenario.contours.filter(c=>c.minutes===level))svg('path',{d:path(c.p),fill:'none',stroke:'#d64939','stroke-width':2.8,'stroke-dasharray':'6 4'},$('forecast'));$('mapcaption').innerHTML=`แนวลามสมมติ ${level} นาทีหลังเริ่มควัน<br><small>ยังไม่สอบเทียบ · ไม่ใช้กำหนดเขตปลอดภัย</small>`}else $('mapcaption').innerHTML=state.scenario==='outage'?'จุดเทา = ข้อมูลขาดการติดต่อ<br><small>ไม่ใช่หลักฐานว่าพื้นที่ปลอดภัย</small>':s.flags.length?'วงส้ม = กลุ่มสัญญาณผิดปกติ<br><small>ยังไม่ใช่ขอบเขตไฟหรือจุดต้นเพลิง</small>':'ยังไม่พบสัญญาณควันผิดปกติ<br><small>จากข้อมูลเซนเซอร์จำลองในฉากนี้</small>';
}
function renderEvents(s){const entries=[{t:0,title:'เริ่มรับข้อมูลจำลอง',desc:'Weather 100 · AQ 100'}];if(state.scenario==='smoke'){
 if(state.time>=8)entries.push({t:8,title:'เริ่มสถานการณ์ควันสมมติ',desc:'จุดเริ่มต้นกำหนดไว้เพื่อสาธิต'});
 const first=Array.from({length:61},(_,i)=>i).find(t=>aq.some(p=>reading(p,t,'smoke').flag));
 if(first!==undefined&&state.time>=first)entries.push({t:first,title:'พบเซนเซอร์เกินเกณฑ์เดโม',desc:'ขึ้นสถานะต้องตรวจสอบ'});
 const multi=Array.from({length:61},(_,i)=>i).find(t=>aq.filter(p=>reading(p,t,'smoke').flag).length>=3);
 if(multi!==undefined&&state.time>=multi)entries.push({t:multi,title:'พบสัญญาณจาก 3 จุดใกล้กัน',desc:'ยังต้องมีหลักฐานยืนยันไฟ'});
 }if(state.scenario==='outage'&&state.time>=12)entries.push({t:12,title:'เซนเซอร์ 8 ตัวขาดการติดต่อ',desc:'แยกออกจากการประเมินเหตุ'});if(state.ackAt!==null)entries.push({t:state.ackAt,title:'เจ้าหน้าที่รับทราบในเดโม',desc:'บันทึกเฉพาะหน้านี้'});
 $('events').replaceChildren();for(const e of entries.sort((a,b)=>b.t-a.t).slice(0,4)){const li=document.createElement('li'),time=document.createElement('time'),div=document.createElement('div'),b=document.createElement('b'),sm=document.createElement('small');time.textContent=timeLabel(e.t);b.textContent=e.title;sm.textContent=e.desc;div.append(b,sm);li.append(time,div);$('events').append(li)}
}
function renderTable(s){$('sensor-table').replaceChildren();const list=state.scenario==='outage'?s.stale.filter(p=>p.type==='AQ').map(p=>reading(p)):s.flags.slice().sort((a,b)=>b.pm-a.pm);$('table-count').textContent=list.length?`${list.length} AQ จุด`:'ไม่มีจุดเกินเกณฑ์เดโม';
 if(!list.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.style.whiteSpace='normal';td.textContent='ยังไม่มีเซนเซอร์ควันที่ต้องตรวจสอบตามเกณฑ์ของฉากนี้';tr.append(td);$('sensor-table').append(tr);return}
 for(const r of list){const tr=document.createElement('tr');for(const value of[r.id,r.stale?'ข้อมูลขาด':'ควันผิดปกติ',r.stale?'—':r.pm.toFixed(1),r.stale?'—':r.co.toFixed(2),r.stale?`${Math.floor(state.time-12)} นาทีที่แล้ว`:'รอบปัจจุบัน']){const td=document.createElement('td');td.textContent=value;tr.append(td)}const td=document.createElement('td'),btn=document.createElement('button');btn.textContent='ดูจุด';btn.setAttribute('aria-label','ดู '+r.id);btn.onclick=()=>selectSensor(r.id);td.append(btn);tr.append(td);$('sensor-table').append(tr)}
}
function render(){const s=snapshot(),has=s.flags.length>0,out=s.stale.length>0;$('clock').textContent=timeLabel(state.time,true);$('time').value=Math.floor(state.time);$('elapsed').textContent=Math.floor(state.time)+' นาที';$('incidentcount').textContent=has?'1':'0';$('flagcount').textContent=s.flags.length;$('online').textContent=200-s.stale.length;$('peak').textContent=`สูงสุด ${s.peak.toFixed(1)} µg/m³ · ค่าสังเคราะห์`;
 $('headline').textContent=has?'พบสัญญาณควันผิดปกติ':out?'ข้อมูลขาดบางจุด · ต้องตรวจระบบ':'ยังไม่พบสัญญาณควันผิดปกติ';$('headline').style.color=has?'#8d4d1b':out?'#536b75':'#214d3d';
 $('situation').textContent=has?`โซนตะวันตก–ตอนกลาง · AQ ${s.flags.length} จุดมีสัญญาณเพิ่มขึ้น · ยังไม่ยืนยันว่าเกิดไฟ`:out?'เซนเซอร์ 8 ตัวขาดการติดต่อ ข้อมูลที่เหลือยังไม่พบควันผิดปกติ':'เฝ้าติดตามข้อมูลต่อเนื่อง · สถานะทั้งหมดในหน้านี้เป็นเดโม';
 $('incidentnote').textContent=has?'ยังไม่ยืนยันว่าเกิดไฟ':out?'มีจุดข้อมูลขาด ต้องตรวจสอบ':'จากข้อมูลจำลองที่ได้รับ';$('freshness').textContent=out?`${s.stale.length} ตัวขาดข้อมูลตั้งแต่ 14:12 น.`:'ข้อมูลจำลองรอบล่าสุดไม่เกิน 1 นาที';
 $('severity').textContent=has?(state.ackAt!==null?'รับทราบแล้ว':'ต้องตรวจสอบ'):out?'ข้อมูลไม่ครบ':'เฝ้าระวัง';$('severity').className='status '+(has?'amber':out?'gray':'green');
 $('incident').style.borderTopColor=has?'#d48423':out?'#85989d':'#4c8d65';$('incidenttitle').textContent=has?'ควันผิดปกติ · โซนตะวันตก':out?'ตรวจการเชื่อมต่อ 8 ตัว':'สถานการณ์ปกติในเดโม';
 $('incidentdesc').textContent=has?'ลมอ้างอิงพัดไปตะวันออก ติดตามจุดถัดไปตามแนวลม':out?'Weather 4 ตัว และ AQ 4 ตัว ไม่มีข้อมูลใหม่':'ไม่พบ AQ เกินเกณฑ์เดโม ไม่ใช่การยืนยันว่าไม่มีไฟ';
 $('evidence-count').textContent=has?`PM + CO เพิ่มพร้อมกัน ${s.flags.length} จุด`:out?'ข้อมูลล่าสุดไม่ครบ':'ไม่มีสัญญาณเกินเกณฑ์';$('ackstate').textContent=state.ackAt!==null?'รับทราบ · ยังไม่ยืนยันไฟ':has?'รอตรวจสอบ':'ไม่มีเหตุควันให้รับทราบ';
 $('actiontext').textContent=has?'ตรวจสอบภาพหรือข้อมูลภาคสนามเพื่อยืนยันเหตุ พร้อมติดตามเซนเซอร์ด้านตะวันออก':out?'ตรวจไฟเลี้ยงและการเชื่อมต่อของจุดเทา ให้คงสถานะข้อมูลขาดไว้จนได้รับค่ารอบใหม่':'ติดตามแนวโน้มและตรวจความพร้อมของเซนเซอร์ต่อเนื่อง';
 $('ack').disabled=!has||state.ackAt!==null;$('ack').textContent=state.ackAt!==null?'รับทราบแล้ว · รอยืนยัน':'รับทราบเหตุ (เดโม)';
 $('play').textContent=state.playing?'Ⅱ พักเดโม':'▶ เล่นเดโม';$('run-status').textContent=state.playing?'กำลังเล่นข้อมูลจำลอง · ไม่มีการเชื่อม sensor จริง':state.time>=60?'จบฉากจำลอง · กดเริ่มใหม่เพื่อเล่นอีกครั้ง':'พักการเล่น · ปรับเวลาเพื่อสำรวจเหตุการณ์';
 renderMap(s);renderSensor();renderTable(s);renderEvents(s);
}
function configure({scenario=state.scenario,minute=state.time,playing=state.playing}={}){if(!['smoke','normal','outage'].includes(scenario)||!Number.isFinite(minute)||minute<0||minute>60||typeof playing!=='boolean')throw Error('Invalid demo state');if(scenario!==state.scenario||minute<state.time){state.ackAt=null;$('toast').hidden=true}state.scenario=scenario;state.time=minute;state.playing=playing;state.selected=scenario==='outage'?'AQ-009':state.selected;$('scenario').value=scenario;$('sensor-select').value=state.selected;render();return getState()}
function getState(){const s=snapshot();return{mode:'SYNTHETIC_DEMO',scenario:state.scenario,minute:Math.round(state.time*100)/100,playing:state.playing,flaggedAQ:s.flags.map(r=>r.id),onlineSensors:200-s.stale.length,acknowledged:state.ackAt!==null,selected:state.selected}}
function acknowledge(){if(!snapshot().flags.length||state.ackAt!==null)return false;state.ackAt=state.time;render();$('toast').textContent='รับทราบเหตุในเดโมแล้ว · ยังไม่มีการยืนยันไฟหรือส่งคำสั่งภายนอก';$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4500);return true}
function resize(){const box=$('map').getBoundingClientRect(),ratio=box.width/box.height,w=Math.max(1000,880*ratio)/state.zoom,h=w/ratio;$('map').setAttribute('viewBox',`${500-w/2} ${500-h/2} ${w} ${h}`);document.querySelector('.scalebar i').style.width=(100/w*box.width)+'px'}
$('basemap').onchange=()=>{$('raster').setAttribute('href',D.rasters[$('basemap').value])};$('basemap').onchange();
$('scenario').onchange=e=>configure({scenario:e.target.value,minute:e.target.value==='normal'?0:24,playing:false});
$('play').onclick=()=>configure({minute:state.time>=60?0:state.time,playing:!state.playing});$('restart').onclick=()=>{state.ackAt=null;configure({minute:0,playing:false})};
$('speed').onchange=e=>state.speed=+e.target.value;$('time').oninput=e=>configure({minute:+e.target.value,playing:false});$('sensor-select').onchange=e=>selectSensor(e.target.value);$('ack').onclick=acknowledge;
$('showweather').onchange=()=>{$('weather-points').setAttribute('visibility',$('showweather').checked?'visible':'hidden')};$('showforecast').onchange=()=>renderMap(snapshot());
$('zoom-in').onclick=()=>{state.zoom=Math.min(3,state.zoom*1.25);resize()};$('zoom-out').onclick=()=>{state.zoom=Math.max(.8,state.zoom/1.25);resize()};$('fit').onclick=()=>{state.zoom=1;resize()};
new ResizeObserver(resize).observe($('map'));selectSensor(state.selected);render();
setInterval(()=>{if(!state.playing||document.hidden)return;state.time=Math.min(60,state.time+state.speed);if(state.time>=60)state.playing=false;render()},1000);
// Optional structured control; same validated state transitions as the visible controls.
const modelContext=document.modelContext;
if(modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});try{Promise.resolve(modelContext.registerTool({name:'configure_forest_demo',title:'เลือกฉากสาธิตไฟป่า',description:'Change only this synthetic demo scenario and playback position; never operates real sensors or sends alerts.',inputSchema:{type:'object',properties:{scenario:{type:'string',enum:['smoke','normal','outage']},minute:{type:'number',minimum:0,maximum:60},playing:{type:'boolean'}},required:['scenario','minute','playing'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['scenario','minute','playing'].includes(k))||!['scenario','minute','playing'].every(k=>k in input))throw Error('Invalid input');return configure(input)}},{signal:lifecycle.signal})).catch(()=>{})}catch{}}

