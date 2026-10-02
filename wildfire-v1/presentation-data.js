'use strict';
(() => {
  const ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  const REQUEST_LIMIT_MS=12000;
  const HIGHWAY_WEIGHT={motorway:1,trunk:1,primary:1,secondary:.98,tertiary:.95,unclassified:.9,residential:.9,service:.86,track:.72,path:.50,footway:.48,steps:.35,cycleway:.58};
  const state={data:null,osm:{segments:[],masts:[],barriers:[],support:[]},roads:{status:'pending',source:'none'},support:{status:'pending',source:'none'},requestKey:null};
  const coordinate=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
  const number=(v,fallback=0)=>Number.isFinite(v)?v:fallback;

  function siteReference(){
    const reference=window.ForestWatchSiteReference;
    if(!reference)return {nodes:[],gateways:[],provenance:{status:'unavailable',source:'Preserved v0 site reference unavailable; no replacement network generated'}};
    // Whitelist spatial and scientific attributes; the customer page never imports financial logic.
    const point=p=>{
      const out={lat:p.lat,lon:p.lon};
      ['elev','slope','aspect','relief','score','riskScore','smokeScore','terrainScore','boundaryScore','coverageScore','ridgeScore','valleyScore','accessScore','roadDistanceKm','backhaulScore','fuelScore','landcoverSiteScore','landcover','landcoverCode','landcoverColor'].forEach(key=>{if(p[key]!=null)out[key]=p[key];});
      return out;
    };
    const nodes=(reference.nodes||[]).filter(n=>coordinate(n.p)).map(n=>({p:point(n.p),role:n.role,utility:number(n.utility)}));
    const gateways=(reference.gateways||[]).filter(g=>coordinate(g.p)).map(g=>({id:g.id,p:point(g.p),score:number(g.score),coverIdx:Array.isArray(g.coverIdx)?g.coverIdx.filter(Number.isInteger):[]}));
    return {nodes,gateways,provenance:{status:nodes.length?'ready':'unavailable',source:'v0 default demonstration reference using its documented fallback; positions remain fixed',...(reference.provenance||{})}};
  }

  function publish(){
    if(!state.data)return;
    const reference=siteReference();
    const payload={
      data:state.data,candidates:state.data.candidates||[],osm:state.osm,
      result:{nodes:reference.nodes,gateways:reference.gateways},
      osmOK:state.osm.segments.length>0,
      provenance:{network:state.data.provenance,sites:reference.provenance,roads:{...state.roads},support:{...state.support}}
    };
    window.ForestWatchPresentationState=payload;
    window.dispatchEvent(new CustomEvent('forestwatch:v1-ready',{detail:payload}));
    const label=document.getElementById('v1-data-status');
    if(label){
      const describe=(name,info)=>name+' '+(info.status==='ready'?'OSM ล่าสุด':info.source==='cache'?'OSM ที่บันทึกไว้'+(info.status==='loading'?' · กำลังอัปเดต':' · อัปเดตไม่สำเร็จ'):info.status==='loading'?'กำลังโหลด':'ไม่พร้อม');
      label.textContent=describe('ถนน/ทาง',state.roads)+' · '+describe('จุดสนับสนุน/สิ่งกีดขวาง',state.support)+' · จุดอ้างอิงสาธิต '+reference.nodes.length+' จุดจาก v0';
      label.dataset.state=payload.osmOK?'ready':state.roads.status==='loading'?'loading':'error';
    }
    const siteLabel=document.getElementById('v1-site-provenance');
    if(siteLabel)siteLabel.textContent=reference.nodes.length?'จุดเสนอและ gateway ใช้ชุดอ้างอิงสาธิต v0 จากค่า fallback เดิม · คงพิกัดเดิม':'ยังไม่มีชุดจุดเสนออ้างอิง v0 · ไม่สร้างจุดทดแทน';
  }

  function cacheKey(kind,bounds){
    return 'forestwatch:v1:osm:'+kind+':'+[bounds.minLat,bounds.minLon,bounds.maxLat,bounds.maxLon].map(n=>n.toFixed(6)).join(',');
  }
  function readCache(key,kind){
    try{
      const value=JSON.parse(localStorage.getItem(key)||'null');
      if(value?.version!==1||!Number.isFinite(value.savedAt))return null;
      if(kind==='roads'&&!Array.isArray(value.data?.segments))return null;
      if(kind==='support'&&(!Array.isArray(value.data?.support)||!Array.isArray(value.data?.barriers)||!Array.isArray(value.data?.masts)))return null;
      return value;
    }catch(_){return null;}
  }
  function writeCache(key,data,endpoint){
    try{localStorage.setItem(key,JSON.stringify({version:1,savedAt:Date.now(),endpoint,data}));}catch(_){}
  }

  function boundsBox(bounds){
    const padLat=(bounds.maxLat-bounds.minLat)*.10,padLon=(bounds.maxLon-bounds.minLon)*.10;
    return [bounds.minLat-padLat,bounds.minLon-padLon,bounds.maxLat+padLat,bounds.maxLon+padLon].join(',');
  }
  function queryFor(kind,bounds){
    const bbox=boundsBox(bounds);
    if(kind==='roads')return '[out:json][timeout:10];way["highway"]('+bbox+');out geom;';
    return '[out:json][timeout:10];('+[
      'node["man_made"~"mast|tower"]','node["tower:type"="communication"]','node["barrier"]',
      'nwr["emergency"="fire_hydrant"]','nwr["natural"="spring"]','nwr["amenity"="fire_station"]',
      'nwr["amenity"="parking"]','node["highway"="turning_circle"]','nwr["aeroway"~"helipad|heliport"]','way["natural"="water"]'
    ].map(selector=>selector+'('+bbox+');').join('')+');out geom;';
  }
  async function fetchElements(endpoint,query){
    const controller=new AbortController();
    let timer;
    try{
      return await Promise.race([
        (async()=>{
          const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query),signal:controller.signal});
          if(!response.ok)throw new Error('Overpass HTTP '+response.status);
          const json=await response.json();
          if(!Array.isArray(json.elements)||json.remark)throw new Error('Incomplete OSM response');
          return {elements:json.elements,timestamp:json.osm3s?.timestamp_osm_base||null};
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('OSM request timed out'));},REQUEST_LIMIT_MS);})
      ]);
    }finally{clearTimeout(timer);controller.abort();}
  }

  function roadData(elements){
    const segments=[];
    for(const e of elements){
      const tags=e.tags||{};
      if(e.type!=='way'||!tags.highway||!Array.isArray(e.geometry))continue;
      const meta={wayId:e.id,hw:tags.highway,weight:HIGHWAY_WEIGHT[tags.highway]||.65,name:tags.name||tags.ref||'',surface:tags.surface||'',smoothness:tags.smoothness||'',tracktype:tags.tracktype||'',access:tags.access||'',motorVehicle:tags.motor_vehicle||tags.vehicle||'',oneway:tags.oneway||''};
      for(let i=1;i<e.geometry.length;i++){
        const a=e.geometry[i-1],b=e.geometry[i];
        if(coordinate(a)&&coordinate(b))segments.push({...meta,a:[a.lat,a.lon],b:[b.lat,b.lon]});
      }
    }
    return {segments};
  }
  function elementPosition(e){
    if(coordinate(e))return [e.lat,e.lon];
    if(coordinate(e.center))return [e.center.lat,e.center.lon];
    const geometry=Array.isArray(e.geometry)?e.geometry:(e.members||[]).flatMap(member=>member.geometry||[]);
    const points=geometry.filter(coordinate);
    return points.length?[points.reduce((sum,p)=>sum+p.lat,0)/points.length,points.reduce((sum,p)=>sum+p.lon,0)/points.length]:null;
  }
  function supportData(elements){
    const masts=[],barriers=[],support=[],seen=new Set();
    for(const e of elements){
      const id=e.type+':'+e.id;if(seen.has(id))continue;seen.add(id);
      const tags=e.tags||{},position=elementPosition(e);if(!position)continue;
      const base={lat:position[0],lon:position[1],tags};
      if(tags.man_made==='mast'||tags.man_made==='tower'||tags['tower:type']==='communication')masts.push({...base});
      if(tags.barrier)barriers.push({...base,type:tags.barrier,access:tags.access||''});
      let kind=null;
      if(tags.emergency==='fire_hydrant')kind='Fire hydrant';
      else if(tags.natural==='spring')kind='Spring / water';
      else if(tags.amenity==='fire_station')kind='Fire station';
      else if(tags.amenity==='parking')kind='Parking / staging candidate';
      else if(tags.highway==='turning_circle')kind='Turning circle';
      else if(tags.aeroway==='helipad'||tags.aeroway==='heliport')kind='Helipad / heliport';
      else if(tags.natural==='water')kind='Mapped water body';
      if(kind)support.push({...base,kind,name:tags.name||''});
    }
    return {masts,barriers,support};
  }

  async function loadPart(kind,bounds,requestKey){
    const key=cacheKey(kind,bounds),cached=readCache(key,kind);
    if(cached){
      Object.assign(state.osm,cached.data);
      state[kind]={status:'loading',source:'cache',savedAt:new Date(cached.savedAt).toISOString(),endpoint:cached.endpoint||null};
    }else state[kind]={status:'loading',source:'none'};
    publish();
    let failure;
    for(const endpoint of ENDPOINTS){
      try{
        const response=await fetchElements(endpoint,queryFor(kind,bounds));
        if(state.requestKey!==requestKey)return;
        const parsed=kind==='roads'?roadData(response.elements):supportData(response.elements);
        if(kind==='roads'&&!parsed.segments.length)throw new Error('No usable mapped road geometry');
        Object.assign(state.osm,parsed);
        state[kind]={status:'ready',source:'live',endpoint,fetchedAt:new Date().toISOString(),osmTimestamp:response.timestamp};
        writeCache(key,parsed,endpoint);publish();return;
      }catch(error){failure=error;}
    }
    if(state.requestKey!==requestKey)return;
    state[kind]={...state[kind],status:'unavailable',error:failure?.message||'OSM unavailable'};publish();
  }
  function receiveData(data){
    if(!data?.bounds)return;
    state.data=data;
    const key=cacheKey('bounds',data.bounds);
    if(key!==state.requestKey){
      state.requestKey=key;
      state.osm={segments:[],masts:[],barriers:[],support:[]};
      state.roads={status:'pending',source:'none'};state.support={status:'pending',source:'none'};
      publish();
      // Routing roads can become usable without waiting for support points or elevation.
      void loadPart('roads',data.bounds,key);void loadPart('support',data.bounds,key);
    }else publish();
  }
  window.addEventListener('forestwatch:v4-ready',event=>receiveData(event.detail));
  window.addEventListener('forestwatch:v1-sites-ready',publish);
  if(window.ForestWatchSiteReference?.data)receiveData({
    ...window.ForestWatchSiteReference.data,
    demLoaded:false,demStatus:'reference',
    provenance:{terrain:{source:'v0 demonstration fallback; elevation is unavailable',status:'reference'},network:'v0 default demonstration spatial reference'}
  });
  if(window.ForestWatchNetworkV4)receiveData(window.ForestWatchNetworkV4);
})();
