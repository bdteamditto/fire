'use strict';
(() => {
  // Leaflet presents the same road data and route geometry as the 3D planner.
  const IDS=new Set(['roads','support','barriers','hotspots','route','egress','offroad','route-points']);
  const LABELS={roads:'ถนน / track / path',support:'จุดสนับสนุน OSM',barriers:'สิ่งกีดขวาง OSM',hotspots:'จุดไฟย้อนหลัง',route:'เส้นทางเข้า',egress:'เส้นทางออก',offroad:'ช่วงนอกทาง','route-points':'จุดเริ่ม / จุดไฟ'};
  const pending=new Map(),layers=new Map(),visibility=new Map();
  let state=null,pickActive=false,pendingFit=null,updatingOverlays=0;
  const empty=()=>({type:'FeatureCollection',features:[]});
  const validCoord=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
  function validGeometry(g){
    if(!g)return false;
    if(g.type==='Point')return validCoord(g.coordinates);
    if(g.type==='LineString')return Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.every(validCoord);
    if(g.type==='MultiLineString')return Array.isArray(g.coordinates)&&g.coordinates.every(c=>Array.isArray(c)&&c.length>=2&&c.every(validCoord));
    return false;
  }
  function cleanFC(data){
    return {type:'FeatureCollection',features:(data?.type==='FeatureCollection'&&Array.isArray(data.features)?data.features:[]).filter(f=>f?.type==='Feature'&&validGeometry(f.geometry))};
  }
  function kindOf(p){
    if(p.kind)return p.kind;
    if(['motorway','trunk','primary','secondary','tertiary'].includes(p.hw))return 'major';
    if(p.hw==='track')return 'track';
    if(['path','footway','steps','cycleway','bridleway'].includes(p.hw))return 'path';
    return 'road';
  }
  function blocked(p){return p.blocked===1||p.blocked==='1'||p.blocked===true||['private','no'].includes(String(p.access||'').toLowerCase());}
  function roadStyle(feature,casing=false){
    const p=feature.properties||{},kind=kindOf(p);
    if(blocked(p))return {color:casing?'#422e2b':'#cc3f37',weight:casing?6:3.5,opacity:.95,dashArray:casing?null:'6 5'};
    if(kind==='track')return {color:casing?'#675343':'#e6a154',weight:casing?5:2.8,opacity:.92,dashArray:casing?null:'7 5'};
    if(kind==='path')return {color:casing?'#5e6256':'#eee1b9',weight:casing?4:2.3,opacity:.95,dashArray:casing?null:'2 6',lineCap:'round'};
    return {color:casing?'#37453b':kind==='major'?'#f7d36d':'#f7f5e9',weight:casing?(kind==='major'?7:5):(kind==='major'?4.4:2.8),opacity:.95};
  }
  function routeStyle(id,casing=false){
    const color={route:'#54d88b',egress:'#42bfe7',offroad:'#f7ca5d'};
    const dashArray=id==='egress'?'9 6':id==='offroad'?'7 5':null;
    return {pane:'op2d-routes',color:casing?'#172a25':color[id],weight:casing?7:id==='route'?4.4:3.3,opacity:casing?.85:1,dashArray:casing?null:dashArray,lineCap:'round',lineJoin:'round'};
  }
  function popupBox(id,feature){
    const p=feature.properties||{},box=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('div');
    title.textContent=p.name||(typeof p.id==='string'?p.id:'')||p.kind||p.hw||LABELS[id];
    const bits=[];
    if(p.hw)bits.push('ประเภท '+p.hw);
    if(p.surface)bits.push('surface '+p.surface);
    if(p.tracktype)bits.push('track '+p.tracktype);
    if(p.smoothness)bits.push('smoothness '+p.smoothness);
    if(p.access)bits.push('access '+p.access);
    if(p.type)bits.push('barrier '+p.type);
    if(p.frp)bits.push('FRP '+p.frp);
    if(blocked(p))bits.push('access private/no ที่พบใน OSM');
    if(id==='route-points')bits.push(p.kind==='start'?'จุดเริ่ม / staging':'จุดเหตุ / fire target');
    detail.textContent=bits.join(' · ')||LABELS[id];box.append(title,detail);return box;
  }
  function onFeature(id,feature,layer){
    layer.on('click',e=>{
      if(pickActive)return;
      const latlng=e.latlng||(layer.getLatLng?.());
      if(latlng)L.popup({maxWidth:300}).setLatLng(latlng).setContent(popupBox(id,feature)).openOn(state.map);
    });
  }
  function makeLayer(id,data){
    const group=L.layerGroup();
    if(id==='roads'){
      // Separate dark casings preserve contrast on both pale and green basemaps.
      L.geoJSON(data,{pane:'op2d-roads',interactive:false,style:f=>roadStyle(f,true)}).addTo(group);
      L.geoJSON(data,{pane:'op2d-roads',style:f=>roadStyle(f),onEachFeature:(f,l)=>onFeature(id,f,l)}).addTo(group);
    }else if(['route','egress','offroad'].includes(id)){
      L.geoJSON(data,{interactive:false,style:()=>routeStyle(id,true)}).addTo(group);
      L.geoJSON(data,{style:()=>routeStyle(id),onEachFeature:(f,l)=>onFeature(id,f,l)}).addTo(group);
    }else{
      L.geoJSON(data,{
        pane:'op2d-points',
        pointToLayer:(f,ll)=>{
          const kind=f.properties?.kind;
          let style={radius:5,color:'#fff',weight:2,fillOpacity:1,fillColor:'#4aa6b5',pane:'op2d-points'};
          if(id==='barriers')style={...style,radius:5,fillColor:'#c43f35'};
          if(id==='hotspots')style={...style,radius:8,color:'#ffd47a',weight:3,fillColor:'#d74a34'};
          if(id==='route-points')style={...style,radius:kind==='target'?10:8,weight:3,fillColor:kind==='start'?'#236e47':'#df493d'};
          return L.circleMarker(ll,style);
        },
        onEachFeature:(f,l)=>onFeature(id,f,l)
      }).addTo(group);
    }
    return group;
  }
  function renderOverlay(id,data){
    if(!state)return;
    const previous=layers.get(id),intendedVisible=visibility.get(id)!==false;
    updatingOverlays++;
    try{
      layers.delete(id);
      if(previous){state.map.removeLayer(previous);state.layerControl?.removeLayer(previous);}
      const layer=makeLayer(id,data);layers.set(id,layer);
      if(intendedVisible)layer.addTo(state.map);
      state.layerControl?.addOverlay(layer,LABELS[id]);
      visibility.set(id,intendedVisible);
    }finally{updatingOverlays--;}
    state.element?.setAttribute('data-'+id+'-feature-count',String(data.features.length));
    if(pickActive)setPickMode(true);
  }
  function setOverlay(id,data){
    if(!IDS.has(id))return false;
    const fc=cleanFC(data);pending.set(id,fc);renderOverlay(id,fc);return true;
  }
  function setVisibility(id,visible){
    visibility.set(id,!!visible);
    if(!state)return;
    const selected=id==='existing-sensors'?[state.existingLayer]:id==='sensors'?[state.nodeLayer]:id==='gateways'?[state.gatewayLayer,state.linkLayer]:[layers.get(id)];
    selected.filter(Boolean).forEach(layer=>{if(visible)layer.addTo(state.map);else state.map.removeLayer(layer);});
  }
  function fitRoute(coords){
    const points=(Array.isArray(coords)?coords:[]).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180);
    if(!points.length)return false;
    if(!state){pendingFit=points;return true;}
    if(points.length===1||points.every(p=>p[0]===points[0][0]&&p[1]===points[0][1]))state.map.setView(points[0],Math.max(14,state.map.getZoom()));
    else state.map.fitBounds(L.latLngBounds(points),{padding:[34,34],maxZoom:16});
    state.map.invalidateSize({pan:false});return true;
  }
  function setPickMode(active){
    pickActive=!!active;
    if(state){
      state.element.style.cursor=pickActive?'crosshair':'';state.element.dataset.pickMode=String(pickActive);
      state.element.querySelectorAll('.leaflet-interactive').forEach(el=>el.style.cursor=pickActive?'crosshair':'');
      if(pickActive)state.map.closePopup();
    }
  }
  function connect(mapState){
    if(!mapState?.map||state?.map===mapState.map)return;
    state=mapState;
    [['op2d-roads',410],['op2d-routes',450],['op2d-points',470]].forEach(([name,z])=>{
      const pane=state.map.getPane(name)||state.map.createPane(name);pane.style.zIndex=String(z);
    });
    state.map.on('click',e=>{
      const lng=((e.latlng.lng+180)%360+360)%360-180;
      window.dispatchEvent(new CustomEvent('forestwatch:2d-point',{detail:{coord:[e.latlng.lat,lng]}}));
    });
    state.map.on('overlayadd',e=>{if(updatingOverlays)return;for(const [id,layer] of layers)if(layer===e.layer)visibility.set(id,true);});
    state.map.on('overlayremove',e=>{if(updatingOverlays)return;for(const [id,layer] of layers)if(layer===e.layer)visibility.set(id,false);});
    for(const id of IDS)renderOverlay(id,pending.get(id)||empty());
    for(const [id,visible] of visibility)setVisibility(id,visible);
    setPickMode(pickActive);
    if(pendingFit){fitRoute(pendingFit);pendingFit=null;}
    state.element.dataset.operationalReady='true';
    window.dispatchEvent(new CustomEvent('forestwatch:2d-map-ready',{detail:state}));
  }
  window.ForestWatchOperational2D={setOverlay,fitRoute,setVisibility,setPickMode,getOverlay:id=>layers.get(id)||null,getMap:()=>state?.map||null};
  window.addEventListener('forestwatch:optimizer-map-ready',e=>connect(e.detail));
  window.addEventListener('forestwatch:2d-pick-mode',e=>setPickMode(e.detail?.active));
  if(window.ForestWatchOptimizerMap)connect(window.ForestWatchOptimizerMap);
})();
