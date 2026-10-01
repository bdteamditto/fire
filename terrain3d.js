'use strict';
(() => {
  const ROLE_COLOR={RS:'#5b4f81',FU:'#2f765e',WX:'#477aa0',AQ:'#b65b33'};
  const MAJOR=new Set(['motorway','trunk','primary','secondary','tertiary']);
  const TRACK=new Set(['track']);
  const PATH=new Set(['path','footway','steps','cycleway','bridleway']);
  const MOTORABLE=new Set(['motorway','trunk','primary','secondary','tertiary','unclassified','residential','service','living_street','track']);
  const rad=d=>d*Math.PI/180;
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
  const fmt=n=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:1}).format(n);
  function distanceKm(a,b){
    const p1=rad(a[0]),p2=rad(b[0]),dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);
    const h=Math.sin(dlat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dlon/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  function key(p){return p[0].toFixed(6)+','+p[1].toFixed(6);}
  class MinHeap{
    constructor(){this.a=[];}
    push(v){const a=this.a;a.push(v);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=v[0])break;a[i]=a[p];i=p;}a[i]=v;}
    pop(){const a=this.a;if(!a.length)return null;const r=a[0],last=a.pop();if(a.length){let i=0;while(true){let l=i*2+1,rr=l+1;if(l>=a.length)break;let c=rr<a.length&&a[rr][0]<a[l][0]?rr:l;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return r;}
    get size(){return this.a.length;}
  }
  function roadKind(hw){
    if(MAJOR.has(hw))return 'major';
    if(TRACK.has(hw))return 'track';
    if(PATH.has(hw))return 'path';
    return 'road';
  }
  function accessBlocked(seg){
    const a=(seg.access||'').toLowerCase(),mv=(seg.motorVehicle||'').toLowerCase();
    return ['private','no'].includes(a)||['private','no'].includes(mv);
  }
  function profileAllows(seg,profile){
    if(accessBlocked(seg))return false;
    const hw=seg.hw;
    if(profile==='foot')return !['motorway','motorway_link'].includes(hw);
    if(profile==='4x4')return MOTORABLE.has(hw)&&!['motorway'].includes(hw);
    return ['trunk','primary','secondary','tertiary','unclassified','residential','service','living_street'].includes(hw) ||
      (hw==='track'&&(['grade1','grade2'].includes(seg.tracktype)||['paved','asphalt','concrete','compacted','fine_gravel','gravel'].includes(seg.surface)));
  }
  function speedKph(seg,profile){
    if(profile==='foot'){
      if(seg.hw==='steps')return 2.2;
      if(PATH.has(seg.hw)||seg.hw==='track')return 3.5;
      return 4.3;
    }
    const speeds={trunk:45,primary:42,secondary:36,tertiary:32,unclassified:24,residential:22,service:16,living_street:12,track:profile==='4x4'?13:9};
    let v=speeds[seg.hw]||14;
    if(['unpaved','ground','dirt','earth','mud','sand'].includes(seg.surface))v*=profile==='4x4'?.82:.55;
    if(['grade4','grade5'].includes(seg.tracktype))v*=.65;
    return Math.max(4,v);
  }
  function buildGraph(segments,profile){
    const nodes=new Map();
    const ensure=p=>{const k=key(p);if(!nodes.has(k))nodes.set(k,{key:k,coord:p,edges:[],major:false});return nodes.get(k);};
    for(const seg of segments){
      if(!profileAllows(seg,profile))continue;
      const a=ensure(seg.a),b=ensure(seg.b),km=distanceKm(seg.a,seg.b),minutes=km/speedKph(seg,profile)*60;
      if(MAJOR.has(seg.hw)){a.major=true;b.major=true;}
      const eAB={to:b.key,km,minutes,seg},eBA={to:a.key,km,minutes,seg};
      const ow=(seg.oneway||'').toLowerCase();
      if(profile==='foot'||!['yes','1','true','-1'].includes(ow)){
        a.edges.push(eAB);b.edges.push(eBA);
      }else if(ow==='-1')b.edges.push(eBA);
      else a.edges.push(eAB);
    }
    return nodes;
  }
  function nearestNode(target,graph){
    let best=null,d=Infinity;
    for(const n of graph.values()){
      const x=distanceKm(target,n.coord);
      if(x<d){d=x;best=n;}
    }
    return {node:best,distanceKm:d};
  }
  function reconstruct(targetKey,prev,graph){
    const keys=[targetKey],edges=[];let cur=targetKey,guard=0;
    while(prev.has(cur)&&guard++<100000){
      const p=prev.get(cur);edges.push(p.edge);cur=p.from;keys.push(cur);
    }
    keys.reverse();edges.reverse();
    return {coords:keys.map(k=>graph.get(k).coord),edges};
  }
  function routeFromMainRoad(graph,targetKey){
    const dist=new Map(),prev=new Map(),heap=new MinHeap();
    for(const [k,n] of graph){if(n.major){dist.set(k,0);heap.push([0,k]);}}
    while(heap.size){
      const [d,k]=heap.pop();if(d!==dist.get(k))continue;
      if(k===targetKey)return reconstruct(targetKey,prev,graph);
      for(const e of graph.get(k).edges){
        const nd=d+e.minutes;
        if(nd<(dist.get(e.to)??Infinity)){dist.set(e.to,nd);prev.set(e.to,{from:k,edge:e});heap.push([nd,e.to]);}
      }
    }
    return null;
  }
  function routeBetween(graph,startKey,targetKey){
    const dist=new Map([[startKey,0]]),prev=new Map(),heap=new MinHeap();heap.push([0,startKey]);
    while(heap.size){
      const [d,k]=heap.pop();if(d!==dist.get(k))continue;
      if(k===targetKey)return reconstruct(targetKey,prev,graph);
      for(const e of graph.get(k).edges){
        const nd=d+e.minutes;
        if(nd<(dist.get(e.to)??Infinity)){dist.set(e.to,nd);prev.set(e.to,{from:k,edge:e});heap.push([nd,e.to]);}
      }
    }
    return null;
  }
  function lineFC(segments){
    return {type:'FeatureCollection',features:segments.map((s,i)=>({
      type:'Feature',
      properties:{
        id:i,kind:roadKind(s.hw),hw:s.hw,name:s.name||'',surface:s.surface||'',tracktype:s.tracktype||'',
        access:s.access||'',smoothness:s.smoothness||'',blocked:accessBlocked(s)?1:0
      },
      geometry:{type:'LineString',coordinates:[[s.a[1],s.a[0]],[s.b[1],s.b[0]]]}
    }))};
  }
  function supportFC(points){
    return {type:'FeatureCollection',features:(points||[]).map((p,i)=>({
      type:'Feature',properties:{id:i,kind:p.kind,name:p.name||''},geometry:{type:'Point',coordinates:[p.lon,p.lat]}
    }))};
  }
  function barrierFC(points){
    return {type:'FeatureCollection',features:(points||[]).map((p,i)=>({
      type:'Feature',properties:{id:i,type:p.type,access:p.access||''},geometry:{type:'Point',coordinates:[p.lon,p.lat]}
    }))};
  }
  function nodeFC(result){
    return {type:'FeatureCollection',features:(result?.nodes||[]).map((n,i)=>({
      type:'Feature',properties:{id:'S'+String(i+1).padStart(2,'0'),role:n.role,utility:Math.round(n.utility||0),color:ROLE_COLOR[n.role]||'#355'},
      geometry:{type:'Point',coordinates:[n.p.lon,n.p.lat]}
    }))};
  }
  function gatewayFC(result){
    return {type:'FeatureCollection',features:(result?.gateways||[]).map((g,i)=>({
      type:'Feature',properties:{id:g.id||('GW-'+(i+1)),score:Math.round(g.score||0)},
      geometry:{type:'Point',coordinates:[g.p.lon,g.p.lat]}
    }))};
  }
  function hotspotFC(data){
    return {type:'FeatureCollection',features:(data.historicalHotspots||[]).map(h=>({
      type:'Feature',properties:{id:h.id,frp:h.frp,time:h.time},geometry:{type:'Point',coordinates:[h.lon,h.lat]}
    }))};
  }
  function slopeFC(candidates,bounds){
    const lats=[...new Set(candidates.map(p=>p.lat))].sort((a,b)=>a-b),lons=[...new Set(candidates.map(p=>p.lon))].sort((a,b)=>a-b);
    const dLat=lats.length>1?Math.min(...lats.slice(1).map((v,i)=>v-lats[i])):((bounds.maxLat-bounds.minLat)/10);
    const dLon=lons.length>1?Math.min(...lons.slice(1).map((v,i)=>v-lons[i])):((bounds.maxLon-bounds.minLon)/10);
    return {type:'FeatureCollection',features:candidates.filter(p=>Number.isFinite(p.slope)).map((p,i)=>{
      const a=dLat*.48,b=dLon*.48;
      return {type:'Feature',properties:{id:i,slope:p.slope},geometry:{type:'Polygon',coordinates:[[
        [p.lon-b,p.lat-a],[p.lon+b,p.lat-a],[p.lon+b,p.lat+a],[p.lon-b,p.lat+a],[p.lon-b,p.lat-a]
      ]]}};
    })};
  }
  function emptyFC(){return {type:'FeatureCollection',features:[]};}
  function routeFC(coords){return {type:'FeatureCollection',features:coords?.length?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords.map(p=>[p[1],p[0]])}}]:[]};}
  function pointFC(points){return {type:'FeatureCollection',features:points.map(p=>({type:'Feature',properties:p.properties||{},geometry:{type:'Point',coordinates:[p.coord[1],p.coord[0]]}}))};}
  async function fetchElevations(coords){
    if(!coords.length)return [];
    const sampled=[];
    const step=Math.max(1,Math.ceil(coords.length/80));
    for(let i=0;i<coords.length;i+=step)sampled.push(coords[i]);
    if(sampled[sampled.length-1]!==coords[coords.length-1])sampled.push(coords[coords.length-1]);
    const out=[];
    for(let i=0;i<sampled.length;i+=100){
      const p=sampled.slice(i,i+100);
      const url='https://api.open-meteo.com/v1/elevation?latitude='+encodeURIComponent(p.map(x=>x[0].toFixed(6)).join(','))+'&longitude='+encodeURIComponent(p.map(x=>x[1].toFixed(6)).join(','));
      const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error('elevation '+r.status);
      const j=await r.json();out.push(...(j.elevation||[]));
    }
    return {coords:sampled,elevation:out};
  }
  function profileStats(sample){
    if(!sample?.elevation?.length)return {gain:null,loss:null,maxGrade:null};
    let gain=0,loss=0,maxGrade=0;
    for(let i=1;i<sample.elevation.length;i++){
      const dz=sample.elevation[i]-sample.elevation[i-1],d=distanceKm(sample.coords[i-1],sample.coords[i])*1000;
      if(dz>0)gain+=dz;else loss-=dz;
      if(d>2)maxGrade=Math.max(maxGrade,Math.abs(dz/d*100));
    }
    return {gain,loss,maxGrade};
  }

  const app={map:null,state:null,graph:null,profile:'4x4',manualStart:null,customTarget:null,pickMode:null,currentRoute:null,demSource:null};

  function setStatus(text,state='ready'){
    const el=document.getElementById('op-status');if(!el)return;el.textContent=text;el.dataset.state=state;
  }
  function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
  function sourceSet(id,data){const s=app.map?.getSource(id);if(s)s.setData(data);}
  function visible(id,on){if(app.map?.getLayer(id))app.map.setLayoutProperty(id,'visibility',on?'visible':'none');}
  function currentTarget(){
    const sel=document.getElementById('op-target')?.value||'H-01';
    if(sel==='CUSTOM')return app.customTarget?{id:'Custom fire point',lat:app.customTarget[0],lon:app.customTarget[1],type:'fire'}:null;
    if(sel.startsWith('H-')){
      const h=app.state.data.historicalHotspots.find(x=>x.id===sel);return h?{id:h.id,lat:h.lat,lon:h.lon,type:'fire'}:null;
    }
    if(sel.startsWith('S')){
      const idx=Number(sel.slice(1))-1,n=app.state.result.nodes[idx];return n?{id:sel,lat:n.p.lat,lon:n.p.lon,type:'sensor'}:null;
    }
    return null;
  }
  function populateTargets(){
    const sel=document.getElementById('op-target');if(!sel)return;
    const old=sel.value;
    sel.innerHTML='';
    for(const h of app.state.data.historicalHotspots||[]){
      const o=document.createElement('option');o.value=h.id;o.textContent=h.id+' · Historical fire / hotspot';sel.appendChild(o);
    }
    (app.state.result.nodes||[]).forEach((n,i)=>{
      const o=document.createElement('option');o.value='S'+String(i+1).padStart(2,'0');o.textContent=o.value+' · '+n.role+' site';sel.appendChild(o);
    });
    const custom=document.createElement('option');custom.value='CUSTOM';custom.textContent='Custom fire point · คลิกกำหนดบนแผนที่';sel.appendChild(custom);
    if([...sel.options].some(o=>o.value===old))sel.value=old;
  }
  function updateOperationalData(state){
    app.state=state;populateTargets();
    if(!app.map)return;
    sourceSet('roads',lineFC(state.osm.segments||[]));
    sourceSet('support',supportFC(state.osm.support||[]));
    sourceSet('barriers',barrierFC(state.osm.barriers||[]));
    sourceSet('sensors',nodeFC(state.result));
    sourceSet('gateways',gatewayFC(state.result));
    sourceSet('hotspots',hotspotFC(state.data));
    sourceSet('slope-screen',slopeFC(state.candidates,state.data.bounds));
    setText('op-road-count',(state.osm.segments||[]).length.toLocaleString('th-TH'));
    setText('op-support-count',(state.osm.support||[]).length.toLocaleString('th-TH'));
    setText('op-barrier-count',(state.osm.barriers||[]).length.toLocaleString('th-TH'));
    setText('op-route-data',state.osmOK?'OSM routing graph ready':'OSM fallback · route unavailable');
  }

  function createMap(state){
    if(!window.maplibregl||!window.mlcontour){setStatus('โหลด MapLibre / contour engine ไม่สำเร็จ','error');return;}
    const el=document.getElementById('operational-3d-map');if(!el)return;
    const dem=new mlcontour.DemSource({
      url:'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
      encoding:'terrarium',maxzoom:13,worker:true,cacheSize:140,timeoutMs:10000
    });
    dem.setupMaplibre(maplibregl);app.demSource=dem;
    const b=state.data.bounds,c=state.data.center;
    const style={
      version:8,
      glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources:{
        satellite:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Esri World Imagery'},
        topo:{type:'raster',tiles:['https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:17,attribution:'OpenTopoMap / OpenStreetMap contributors'},
        'terrain-dem':{type:'raster-dem',encoding:'terrarium',tiles:[dem.sharedDemProtocolUrl],maxzoom:13,tileSize:256},
        contours:{type:'vector',tiles:[dem.contourProtocolUrl({multiplier:1,thresholds:{10:[100,500],11:[100,500],12:[50,200],13:[25,100],14:[20,100],15:[10,50]},elevationKey:'ele',levelKey:'level',contourLayer:'contours'})],maxzoom:15},
        roads:{type:'geojson',data:lineFC(state.osm.segments||[])},
        support:{type:'geojson',data:supportFC(state.osm.support||[])},
        barriers:{type:'geojson',data:barrierFC(state.osm.barriers||[])},
        sensors:{type:'geojson',data:nodeFC(state.result)},
        gateways:{type:'geojson',data:gatewayFC(state.result)},
        hotspots:{type:'geojson',data:hotspotFC(state.data)},
        'slope-screen':{type:'geojson',data:slopeFC(state.candidates,b)},
        route:{type:'geojson',data:emptyFC()},
        offroad:{type:'geojson',data:emptyFC()},
        'route-points':{type:'geojson',data:emptyFC()}
      },
      layers:[
        {id:'satellite',type:'raster',source:'satellite',paint:{'raster-saturation':-.12,'raster-contrast':.08,'raster-brightness-max':.93}},
        {id:'topo',type:'raster',source:'topo',layout:{visibility:'none'},paint:{'raster-opacity':.95}},
        {id:'hillshade',type:'hillshade',source:'terrain-dem',paint:{'hillshade-exaggeration':.48,'hillshade-shadow-color':'#27342c','hillshade-highlight-color':'#f4eedf','hillshade-accent-color':'#566c5c'}},
        {id:'slope-screen',type:'fill',source:'slope-screen',layout:{visibility:'none'},paint:{'fill-color':['interpolate',['linear'],['get','slope'],15,'#f2e6a6',25,'#dc954d',35,'#b84a36',45,'#7d2633'],'fill-opacity':['interpolate',['linear'],['get','slope'],15,0,25,.16,35,.30,45,.42]}},
        {id:'contour-minor',type:'line',source:'contours','source-layer':'contours',paint:{'line-color':'rgba(241,232,204,.62)','line-width':['match',['get','level'],1,1.25,.55]}},
        {id:'roads-casing',type:'line',source:'roads',filter:['in',['get','kind'],['literal',['major','road']]],paint:{'line-color':'rgba(30,35,32,.82)','line-width':['match',['get','kind'],'major',6,4]}},
        {id:'roads',type:'line',source:'roads',filter:['in',['get','kind'],['literal',['major','road']]],paint:{'line-color':['match',['get','kind'],'major','#f7d36d','#f4f0e6'],'line-width':['match',['get','kind'],'major',3.8,2.3]}},
        {id:'tracks',type:'line',source:'roads',filter:['==',['get','kind'],'track'],paint:{'line-color':'#e4a556','line-width':2.2,'line-dasharray':[2,1.5]}},
        {id:'paths',type:'line',source:'roads',filter:['==',['get','kind'],'path'],paint:{'line-color':'#d8d1bd','line-width':1.5,'line-dasharray':[1,2]}},
        {id:'blocked-access',type:'line',source:'roads',filter:['==',['get','blocked'],1],paint:{'line-color':'#cc3f37','line-width':3,'line-dasharray':[1,1]}},
        {id:'support',type:'circle',source:'support',paint:{'circle-radius':5,'circle-color':'#4aa6b5','circle-stroke-width':2,'circle-stroke-color':'#fff'}},
        {id:'barriers',type:'circle',source:'barriers',paint:{'circle-radius':4,'circle-color':'#c43f35','circle-stroke-width':1.5,'circle-stroke-color':'#fff'}},
        {id:'hotspots',type:'circle',source:'hotspots',paint:{'circle-radius':8,'circle-color':'#d74a34','circle-stroke-width':3,'circle-stroke-color':'#ffd47a'}},
        {id:'sensors',type:'circle',source:'sensors',paint:{'circle-radius':6,'circle-color':['get','color'],'circle-stroke-width':2,'circle-stroke-color':'#fff'}},
        {id:'gateways',type:'circle',source:'gateways',paint:{'circle-radius':8,'circle-color':'#5e533b','circle-stroke-width':3,'circle-stroke-color':'#f1d187'}},
        {id:'route-casing',type:'line',source:'route',paint:{'line-color':'#171d1a','line-width':7,'line-opacity':.88}},
        {id:'route',type:'line',source:'route',paint:{'line-color':'#67e39c','line-width':4.4}},
        {id:'offroad',type:'line',source:'offroad',paint:{'line-color':'#f7ca5d','line-width':3,'line-dasharray':[2,1.5]}},
        {id:'route-points',type:'circle',source:'route-points',paint:{'circle-radius':['match',['get','kind'],'start',7,'target',9,6],'circle-color':['match',['get','kind'],'start','#55b87b','target','#df493d','#fff'],'circle-stroke-width':3,'circle-stroke-color':'#fff'}}
      ]
    };
    const map=new maplibregl.Map({
      container:el,style,center:[c[1],c[0]],zoom:12.25,pitch:58,bearing:-26,maxPitch:82,antialias:true,hash:false
    });
    app.map=map;
    map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');
    map.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}),'bottom-right');
    map.on('load',()=>{
      map.setTerrain({source:'terrain-dem',exaggeration:1.45});
      setStatus('3D terrain พร้อม · Satellite + hillshade + contour + OSM access network','ready');
      updateOperationalData(state);
      bindMapInteractions();
      applyMode('terrain');
    });
    map.on('error',e=>{if(e?.error?.message)setStatus('บางชั้นข้อมูลโหลดไม่ครบ: '+e.error.message,'error');});
    if(window.ResizeObserver){const ro=new ResizeObserver(()=>map.resize());ro.observe(el);}
  }

  function setBasemap(which){
    visible('satellite',which==='satellite');visible('topo',which==='topo');
    document.querySelectorAll('[data-basemap]').forEach(b=>b.classList.toggle('active',b.dataset.basemap===which));
  }
  function applyMode(mode){
    document.querySelectorAll('[data-op-mode]').forEach(b=>b.classList.toggle('active',b.dataset.opMode===mode));
    const c=document.getElementById('op-contours'),h=document.getElementById('op-hillshade'),sl=document.getElementById('op-slope'),r=document.getElementById('op-roads'),t=document.getElementById('op-tracks'),sup=document.getElementById('op-support');
    if(mode==='terrain'){if(c)c.checked=true;if(h)h.checked=true;if(sl)sl.checked=false;if(r)r.checked=true;if(t)t.checked=true;if(sup)sup.checked=false;app.map.easeTo({pitch:65,bearing:-28,duration:650});}
    if(mode==='access'){if(c)c.checked=true;if(h)h.checked=true;if(sl)sl.checked=false;if(r)r.checked=true;if(t)t.checked=true;if(sup)sup.checked=true;app.map.easeTo({pitch:48,bearing:0,duration:650});}
    if(mode==='suppression'){if(c)c.checked=true;if(h)h.checked=true;if(sl)sl.checked=true;if(r)r.checked=true;if(t)t.checked=true;if(sup)sup.checked=true;app.map.easeTo({pitch:57,bearing:-18,duration:650});}
    syncLayerToggles();
  }
  function syncLayerToggles(){
    visible('contour-minor',document.getElementById('op-contours')?.checked!==false);
    visible('hillshade',document.getElementById('op-hillshade')?.checked!==false);
    visible('slope-screen',document.getElementById('op-slope')?.checked===true);
    const roads=document.getElementById('op-roads')?.checked!==false;
    visible('roads-casing',roads);visible('roads',roads);visible('blocked-access',roads);
    const tracks=document.getElementById('op-tracks')?.checked!==false;
    visible('tracks',tracks);visible('paths',tracks);
    const sup=document.getElementById('op-support')?.checked===true;
    visible('support',sup);visible('barriers',sup);
    const assets=document.getElementById('op-assets')?.checked!==false;
    visible('sensors',assets);visible('gateways',assets);
    const route=document.getElementById('op-route-layer')?.checked!==false;
    visible('route-casing',route);visible('route',route);visible('offroad',route);visible('route-points',route);
  }

  function popupFeature(e){
    const fs=app.map.queryRenderedFeatures(e.point,{layers:['roads','tracks','paths','blocked-access','support','barriers','hotspots','sensors','gateways']});
    if(!fs.length)return;
    const f=fs[0],p=f.properties||{},box=document.createElement('div');
    const title=document.createElement('b'),body=document.createElement('div');
    title.textContent=p.id||p.name||p.kind||p.hw||'Map feature';
    const bits=[];
    if(p.hw)bits.push('ประเภท '+p.hw);
    if(p.surface)bits.push('surface '+p.surface);
    if(p.tracktype)bits.push('track '+p.tracktype);
    if(p.access)bits.push('access '+p.access);
    if(p.role)bits.push('role '+p.role);
    if(p.frp)bits.push('FRP '+p.frp);
    if(p.kind&&!p.hw)bits.push(p.kind);
    body.textContent=bits.join(' · ')||'OSM / planning feature';
    box.append(title,body);
    new maplibregl.Popup({closeButton:true,maxWidth:'300px'}).setLngLat(e.lngLat).setDOMContent(box).addTo(app.map);
  }
  function bindMapInteractions(){
    app.map.on('click',e=>{
      if(app.pickMode==='start'){
        app.manualStart=[e.lngLat.lat,e.lngLat.lng];app.pickMode=null;setText('op-start-mode','Manual start · '+app.manualStart[0].toFixed(5)+', '+app.manualStart[1].toFixed(5));setStatus('กำหนดจุดเริ่มแล้ว · กดคำนวณเส้นทาง','ready');return;
      }
      if(app.pickMode==='target'){
        app.customTarget=[e.lngLat.lat,e.lngLat.lng];app.pickMode=null;const sel=document.getElementById('op-target');if(sel)sel.value='CUSTOM';setStatus('กำหนดจุดเหตุบนแผนที่แล้ว · กดคำนวณเส้นทาง','ready');return;
      }
      popupFeature(e);
    });
    app.map.on('mouseenter','roads',()=>app.map.getCanvas().style.cursor='pointer');
    app.map.on('mouseleave','roads',()=>app.map.getCanvas().style.cursor='');
  }

  async function calculateRoute(){
    if(!app.state?.osmOK){setStatus('ไม่มี OSM routing graph จึงยังคำนวณ access route ไม่ได้','error');return;}
    const target=currentTarget();if(!target){setStatus('กรุณาเลือกหรือกำหนดจุดเป้าหมาย','error');return;}
    const profile=document.getElementById('op-profile')?.value||'4x4';app.profile=profile;
    setStatus('กำลังคำนวณเส้นทาง access '+profile+'…','loading');
    const graph=buildGraph(app.state.osm.segments||[],profile);
    if(!graph.size){setStatus('ไม่พบเส้นทาง OSM ที่ใช้กับ profile นี้','error');return;}
    const nearTarget=nearestNode([target.lat,target.lon],graph);
    if(!nearTarget.node){setStatus('ไม่พบ access network ใกล้เป้าหมาย','error');return;}
    let route,startSnap,startGap=0;
    if(app.manualStart){
      const ns=nearestNode(app.manualStart,graph);startSnap=ns.node;startGap=ns.distanceKm;
      route=startSnap?routeBetween(graph,startSnap.key,nearTarget.node.key):null;
    }else{
      route=routeFromMainRoad(graph,nearTarget.node.key);
      startSnap=route?.coords?.length?graph.get(key(route.coords[0])):null;
    }
    if(!route||route.coords.length<1){
      setStatus('หาเส้นทางเชื่อมต่อไม่ได้สำหรับ '+profile+' · ลอง 4x4 หรือเดินเท้า และตรวจ OSM/ภาคสนาม','error');
      sourceSet('route',emptyFC());sourceSet('offroad',emptyFC());return;
    }
    const roadKm=route.edges.reduce((a,e)=>a+e.km,0),roadMin=route.edges.reduce((a,e)=>a+e.minutes,0);
    const last=route.coords[route.coords.length-1],offroadKm=distanceKm(last,[target.lat,target.lon]);
    const offroadMin=offroadKm/(profile==='foot'?3.0:2.8)*60;
    const startCoord=route.coords[0];
    const fullCoords=[...route.coords,[target.lat,target.lon]];
    sourceSet('route',routeFC(route.coords));
    sourceSet('offroad',routeFC(offroadKm>.015?[[last[0],last[1]],[target.lat,target.lon]]:[]));
    sourceSet('route-points',pointFC([
      {coord:startCoord,properties:{kind:'start'}},{coord:[target.lat,target.lon],properties:{kind:'target'}}
    ]));
    app.map.fitBounds([[Math.min(...fullCoords.map(p=>p[1])),Math.min(...fullCoords.map(p=>p[0]))],[Math.max(...fullCoords.map(p=>p[1])),Math.max(...fullCoords.map(p=>p[0]))]],{padding:70,pitch:54,bearing:-16,duration:700});
    const types={};route.edges.forEach(e=>{types[e.seg.hw]=(types[e.seg.hw]||0)+e.km;});
    const surface=Object.entries(types).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([x,d])=>x+' '+fmt(d)+' km').join(' · ');
    setText('op-route-distance',fmt(roadKm+offroadKm)+' กม.');
    setText('op-route-time',Math.round(roadMin+offroadMin)+' นาที');
    setText('op-offroad-distance',fmt(offroadKm)+' กม.');
    setText('op-route-profile',profile==='4x4'?'4x4 / track':profile==='vehicle'?'รถทั่วไป':'เดินเท้า');
    setText('op-route-surface',surface||'—');
    setText('op-start-mode',app.manualStart?'Manual start · snap '+Math.round(startGap*1000)+' m':'Auto staging · nearest connected major road');
    try{
      const elev=await fetchElevations(fullCoords),stats=profileStats(elev);
      setText('op-elevation-gain',stats.gain==null?'—':Math.round(stats.gain)+' m');
      setText('op-max-grade',stats.maxGrade==null?'—':fmt(stats.maxGrade)+'%');
    }catch(err){setText('op-elevation-gain','—');setText('op-max-grade','—');}
    app.currentRoute={target,profile,route,roadKm,offroadKm};
    setStatus('เส้นทางพร้อม · เป็น planning route จาก OSM ไม่ใช่คำสั่งเข้าดับไฟหรือการรับรองสภาพถนนจริง','ready');
  }

  function bindControls(){
    document.querySelectorAll('[data-op-mode]').forEach(b=>b.addEventListener('click',()=>applyMode(b.dataset.opMode)));
    document.querySelectorAll('[data-basemap]').forEach(b=>b.addEventListener('click',()=>setBasemap(b.dataset.basemap)));
    ['op-contours','op-hillshade','op-slope','op-roads','op-tracks','op-support','op-assets','op-route-layer'].forEach(id=>document.getElementById(id)?.addEventListener('change',syncLayerToggles));
    document.getElementById('op-exaggeration')?.addEventListener('input',e=>{
      const x=Number(e.target.value);setText('op-exag-value',x.toFixed(1)+'×');if(app.map?.getSource('terrain-dem'))app.map.setTerrain({source:'terrain-dem',exaggeration:x});
    });
    document.getElementById('op-route')?.addEventListener('click',calculateRoute);
    document.getElementById('op-pick-start')?.addEventListener('click',()=>{app.pickMode='start';setStatus('คลิกบนแผนที่เพื่อกำหนดจุดเริ่ม / staging','loading');});
    document.getElementById('op-auto-start')?.addEventListener('click',()=>{app.manualStart=null;setText('op-start-mode','Auto staging · nearest connected major road');setStatus('กลับไปใช้ Auto staging','ready');});
    document.getElementById('op-pick-target')?.addEventListener('click',()=>{app.pickMode='target';setStatus('คลิกบนแผนที่เพื่อกำหนดจุดเหตุ / fire target','loading');});
    document.getElementById('op-target')?.addEventListener('change',()=>{if(document.getElementById('op-target').value==='CUSTOM'&&!app.customTarget){app.pickMode='target';setStatus('คลิกบนแผนที่เพื่อกำหนด Custom fire point','loading');}});
    document.getElementById('op-profile')?.addEventListener('change',()=>{if(app.currentRoute)calculateRoute();});
  }

  function init(state){
    app.state=state;populateTargets();bindControls();createMap(state);
  }
  function handle(state){
    if(!state)return;
    if(!app.map)init(state);else updateOperationalData(state);
  }
  if(window.ForestWatchOptimizerV5State)handle(window.ForestWatchOptimizerV5State);
  window.addEventListener('forestwatch:v5-ready',e=>handle(e.detail));
})();