'use strict';
(() => {
  const existing = [
    {id:'EX-01',lat:19.44079157568766,lon:101.07016395055662,note:'พิกัดเดิมที่ผู้ใช้ให้มา'},
    {id:'EX-02',lat:19.451642,lon:101.055952,note:'พิกัดเดิมที่ผู้ใช้ให้มา'},
    {id:'EX-03',lat:19.432653,lon:101.091239,note:'ตำแหน่งประมาณจากแผนที่เดิม — รอพิกัดจริง'}
  ];
  const hotspots = [
    {id:'H-01',lat:19.402710,lon:101.090990,time:'2025/03/06 12:33',frp:10.55},
    {id:'H-02',lat:19.455640,lon:101.100100,time:'2025/03/06 13:01',frp:21.41},
    {id:'H-03',lat:19.394840,lon:101.022190,time:'2025/03/06 13:22',frp:2.59}
  ];
  const zones = [
    {id:'Z-N',name:'Northern terrain / boundary',desc:'สันสูงและขอบด้านเหนือ — provisional จนกว่าจะสำรวจหน้างาน',color:'#4c667f'},
    {id:'Z-C',name:'Central corridor',desc:'แนวกลางสำหรับ fusion / community observability',color:'#315f4b'},
    {id:'Z-W',name:'Western inflow / ignition',desc:'แนวรับลมและพื้นที่ตะวันตกที่เชื่อมกับเหตุอ้างอิง',color:'#94613c'}
  ];
  const windFromDeg = 261;
  const windToDeg = (windFromDeg + 180) % 360;
  const windSpeedMs = 2.18;
  const windKmPerMin = windSpeedMs * 60 / 1000;
  const rows = 10, cols = 10;
  const clamp = (v,a=0,b=100) => Math.max(a,Math.min(b,v));
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;

  function distanceKm(a,b) {
    const p1=rad(a[0]),p2=rad(b[0]),dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);
    const h=Math.sin(dlat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dlon/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  function destination(origin,bearing,km) {
    const d=km/6371,b=rad(bearing),lat1=rad(origin[0]),lon1=rad(origin[1]);
    const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(b));
    const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
    return [deg(lat2),deg(lon2)];
  }
  function projectKm(origin,p) {
    const mean=rad((origin[0]+p[0])/2);
    return {e:(p[1]-origin[1])*111.32*Math.cos(mean),n:(p[0]-origin[0])*110.57};
  }
  function alongCross(origin,p,bearing=windToDeg) {
    const q=projectKm(origin,p),b=rad(bearing);
    return {along:q.e*Math.sin(b)+q.n*Math.cos(b),cross:q.e*Math.cos(b)-q.n*Math.sin(b)};
  }
  function aspectLabel(a) {
    if (!Number.isFinite(a)) return '—';
    const labels=['N','NE','E','SE','S','SW','W','NW'];
    return labels[Math.round(((a%360)+360)%360/45)%8];
  }
  function scoreColor(v,alpha=0.42) {
    const hue=18+(clamp(v)/100)*105;
    return 'hsla('+hue+',58%,48%,'+alpha+')';
  }

  const minLat=Math.min(...hotspots.map(h=>h.lat))-0.014;
  const maxLat=Math.max(...hotspots.map(h=>h.lat))+0.014;
  const minLon=Math.min(...hotspots.map(h=>h.lon))-0.014;
  const maxLon=Math.max(...hotspots.map(h=>h.lon))+0.014;
  const center=[(minLat+maxLat)/2,(minLon+maxLon)/2];

  function zoneFor(p) {
    if (p.lat > center[0]+0.014) return zones[0];
    if (p.lon < center[1]-0.020) return zones[2];
    return zones[1];
  }

  function createGrid() {
    const out=[];
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        out.push({
          r,c,
          lat:minLat+(maxLat-minLat)*r/(rows-1),
          lon:minLon+(maxLon-minLon)*c/(cols-1)
        });
      }
    }
    return out;
  }

  async function fetchElevations(coords) {
    const values=[];
    for(let i=0;i<coords.length;i+=100){
      const part=coords.slice(i,i+100);
      const lats=part.map(p=>p[0].toFixed(6)).join(',');
      const lons=part.map(p=>p[1].toFixed(6)).join(',');
      const url='https://api.open-meteo.com/v1/elevation?latitude='+encodeURIComponent(lats)+'&longitude='+encodeURIComponent(lons);
      const res=await fetch(url,{cache:'force-cache'});
      if(!res.ok) throw new Error('Elevation API '+res.status);
      const json=await res.json();
      if(!Array.isArray(json.elevation)||json.elevation.length!==part.length) throw new Error('Elevation response invalid');
      values.push(...json.elevation);
    }
    return values;
  }

  async function enrichGrid(grid) {
    const queries=[];
    const refs=[];
    for(const p of grid){
      const dLat=0.18/110.57;
      const dLon=0.18/(111.32*Math.cos(rad(p.lat)));
      const pts=[[p.lat,p.lon],[p.lat+dLat,p.lon],[p.lat-dLat,p.lon],[p.lat,p.lon+dLon],[p.lat,p.lon-dLon]];
      refs.push({start:queries.length,dx:180,dy:180});
      queries.push(...pts);
    }
    const z=await fetchElevations(queries);
    grid.forEach((p,i)=>{
      const k=refs[i].start;
      const c=z[k],n=z[k+1],s=z[k+2],e=z[k+3],w=z[k+4];
      const dzdx=(e-w)/(2*refs[i].dx);
      const dzdy=(n-s)/(2*refs[i].dy);
      p.elev=c;
      p.relief=c-(n+s+e+w)/4;
      p.slope=deg(Math.atan(Math.sqrt(dzdx*dzdx+dzdy*dzdy)));
      p.aspect=(deg(Math.atan2(-dzdx,-dzdy))+360)%360;
    });
    return true;
  }

  function addScores(grid,demLoaded) {
    const elevations=grid.map(p=>p.elev).filter(Number.isFinite);
    const slopes=grid.map(p=>p.slope).filter(Number.isFinite);
    const eMin=elevations.length?Math.min(...elevations):0;
    const eMax=elevations.length?Math.max(...elevations):1;
    const sMax=slopes.length?Math.max(...slopes):1;
    const maxCenterDist=Math.max(...grid.map(p=>distanceKm(center,[p.lat,p.lon])));
    for(const p of grid){
      const elevNorm=Number.isFinite(p.elev)?100*(p.elev-eMin)/Math.max(1,eMax-eMin):50;
      const slopeNorm=Number.isFinite(p.slope)?100*p.slope/Math.max(1,sMax):35;
      const relief=Number.isFinite(p.relief)?p.relief:0;
      p.ridgeScore=clamp(48+relief*3.0+elevNorm*0.24+slopeNorm*0.16);
      p.valleyScore=clamp(50-relief*3.2+(100-elevNorm)*0.18+slopeNorm*0.10);
      p.terrainScore=demLoaded?clamp(35+Math.min(30,p.slope||0)*1.25+Math.min(25,Math.abs(relief))*1.25):45;
      p.riskScore=Math.max(...hotspots.map(h=>{
        const d=distanceKm([h.lat,h.lon],[p.lat,p.lon]);
        return 100*Math.exp(-Math.pow(d/2.3,2));
      }));
      p.smokeScore=Math.max(...hotspots.map(h=>{
        const ac=alongCross([h.lat,h.lon],[p.lat,p.lon]);
        const downwind=ac.along>=-0.35?1:0.22;
        return 100*downwind*Math.exp(-Math.pow(Math.abs(ac.cross)/1.35,2))*Math.exp(-Math.max(0,ac.along)/8);
      }));
      p.boundaryScore=clamp(100*distanceKm(center,[p.lat,p.lon])/Math.max(0.1,maxCenterDist));
      const nearestExisting=Math.min(...existing.map(e=>distanceKm([e.lat,e.lon],[p.lat,p.lon])));
      p.coverageScore=clamp(nearestExisting/2.2*100);
      p.confidence=demLoaded?100:45;
      p.baseScore=0.30*p.terrainScore+0.25*p.smokeScore+0.20*p.riskScore+0.20*p.coverageScore+0.05*p.boundaryScore;
      if(!demLoaded){p.elev=null;p.slope=null;p.aspect=null;p.relief=null;}
    }
  }

  function selectNetwork(grid) {
    const chosen=[],used=new Set();
    while(chosen.length<21 && used.size<grid.length){
      let best=null,bestValue=-Infinity;
      for(let i=0;i<grid.length;i++){
        if(used.has(i)) continue;
        const p=grid[i];
        const refs=[...existing.map(e=>[e.lat,e.lon]),...chosen.map(c=>[c.lat,c.lon])];
        const nearest=refs.length?Math.min(...refs.map(q=>distanceKm(q,[p.lat,p.lon]))):3;
        const marginalCoverage=clamp(nearest/2.0*100);
        const spacingPenalty=chosen.some(c=>distanceKm([c.lat,c.lon],[p.lat,p.lon])<0.65)?28:0;
        const value=0.78*p.baseScore+0.22*marginalCoverage-spacingPenalty;
        if(value>bestValue){bestValue=value;best={...p,index:i,coverageScore:marginalCoverage,totalScore:clamp(value)};}
      }
      if(!best) break;
      used.add(best.index);
      chosen.push(best);
    }
    chosen.sort((a,b)=>b.totalScore-a.totalScore);
    chosen.forEach((p,i)=>{p.id='N'+String(i+1).padStart(2,'0');p.phase=i<12?'Core':'Expansion';p.zone=zoneFor(p).id;});
    assignRoles(chosen);
    return chosen;
  }

  function assignRoles(points) {
    const roleDefs=[
      {name:'Fusion Node',code:'FU',cap:5,score:p=>0.45*p.smokeScore+0.35*p.riskScore+0.20*p.terrainScore},
      {name:'Ridge / Saddle Weather',code:'RW',cap:4,score:p=>0.48*p.ridgeScore+0.27*p.terrainScore+0.25*p.boundaryScore},
      {name:'Valley Wind',code:'VW',cap:3,score:p=>0.52*p.valleyScore+0.28*p.smokeScore+0.20*p.riskScore},
      {name:'Boundary Weather',code:'BW',cap:3,score:p=>0.55*p.boundaryScore+0.25*p.coverageScore+0.20*p.terrainScore},
      {name:'High-risk AQ',code:'AQ',cap:5,score:p=>0.55*p.riskScore+0.30*p.smokeScore+0.15*p.coverageScore}
    ];
    const superPoint=[...points].sort((a,b)=>(b.terrainScore+b.ridgeScore*0.4+b.coverageScore*0.2)-(a.terrainScore+a.ridgeScore*0.4+a.coverageScore*0.2))[0];
    superPoint.role='Reference / Super Station';superPoint.roleCode='RS';
    const counts=Object.fromEntries(roleDefs.map(r=>[r.code,0]));
    for(const p of points){
      if(p===superPoint) continue;
      const options=roleDefs.filter(r=>counts[r.code]<r.cap).sort((a,b)=>b.score(p)-a.score(p));
      const pick=options[0]||roleDefs[0];
      p.role=pick.name;p.roleCode=pick.code;counts[pick.code]++;
    }
    const packages={
      RS:'RK900-12: WS/WD + T/RH + Pressure + Rain + PM2.5/PM10 reference',
      FU:'RK120-01 WS/WD + T/RH + RK300-02 PM2.5/PM10 + CO / multi-gas',
      RW:'RK120-01 WS/WD + T/RH',
      VW:'RK120-01 WS/WD + T/RH (valley channel)',
      BW:'RK120-01 WS/WD + T/RH (boundary inflow/outflow)',
      AQ:'RK300-02 PM2.5/PM10 + CO / multi-gas เฉพาะจุดเสี่ยง'
    };
    const descriptions={
      RS:'จุดอ้างอิงสำหรับเทียบลม/อากาศของทั้งเครือข่ายและใช้ตรวจ calibration drift',
      FU:'วัดควันและลมร่วมตำแหน่งเดียวกันเพื่อใช้ sensor fusion และ source estimation',
      RW:'อ่านลมบนสัน/ไหล่เขาและจุดที่ภูมิประเทศเปลี่ยนการไหลของลม',
      VW:'จับลมและการสะสมควันในแนวหุบ/ทางระบายน้ำ',
      BW:'วัดลมเข้า–ออกขอบพื้นที่เพื่อแยก plume ภายนอกกับเหตุภายใน',
      AQ:'เพิ่มความไวต่อ ignition/smoke ในพื้นที่ที่เหตุอ้างอิงและแนวลมมีความสัมพันธ์สูง'
    };
    for(const p of points){p.pkg=packages[p.roleCode];p.roleDesc=descriptions[p.roleCode];}
  }

  function terrainText(p,demLoaded) {
    if(!demLoaded) return 'DEM unavailable · ใช้ risk/wind/network geometry fallback';
    const rel=p.relief||0;
    let form='rolling / slope';
    if(rel>9) form='ridge / convex high ground';
    else if(rel<-9) form='valley / concave drainage';
    else if((p.slope||0)>18) form='steep slope';
    return form+' · relief '+rel.toFixed(1)+' m';
  }

  function detectionFor(h,selected) {
    const sensors=selected.filter(p=>['FU','AQ','RS'].includes(p.roleCode));
    const hits=sensors.map(p=>{
      const ac=alongCross([h.lat,h.lon],[p.lat,p.lon]);
      if(ac.along<-0.25) return null;
      const cross=Math.abs(ac.cross);
      const time=Math.max(2,ac.along/windKmPerMin+cross*2.2+2);
      const quality=Math.exp(-Math.pow(cross/1.5,2));
      return {p,time,cross,quality,along:ac.along};
    }).filter(Boolean).sort((a,b)=>a.time-b.time);
    if(hits.length) return hits;
    return sensors.map(p=>({p,time:distanceKm([h.lat,h.lon],[p.lat,p.lon])/windKmPerMin+5,cross:2.5,quality:0.2,along:0})).sort((a,b)=>a.time-b.time);
  }

  function probableSource(h,selected) {
    const hits=detectionFor(h,selected).slice(0,3);
    if(!hits.length) return null;
    let sw=0,lat=0,lon=0;
    for(const hit of hits){
      const backKm=Math.max(0.35,(hit.time-2)*windKmPerMin);
      const q=destination([hit.p.lat,hit.p.lon],windFromDeg,backKm);
      const w=Math.max(0.15,hit.quality)/(hit.time+1);
      lat+=q[0]*w;lon+=q[1]*w;sw+=w;
    }
    const centerEst=[lat/sw,lon/sw];
    const spread=Math.max(0.55,Math.min(1.6,0.55+hits.reduce((a,b)=>a+b.cross,0)/hits.length*0.45));
    return {center:centerEst,major:spread*1.45,minor:spread*0.72,hits};
  }

  function ellipsePoints(c,major,minor,bearing) {
    const pts=[],b=rad(bearing);
    for(let i=0;i<48;i++){
      const t=2*Math.PI*i/48;
      const along=major*Math.cos(t),cross=minor*Math.sin(t);
      const east=along*Math.sin(b)+cross*Math.cos(b);
      const north=along*Math.cos(b)-cross*Math.sin(b);
      pts.push([c[0]+north/110.57,c[1]+east/(111.32*Math.cos(rad(c[0])))]);
    }
    return pts;
  }

  const mapStatus=document.getElementById('plan-map-status');
  function setStatus(msg,state='loading'){if(mapStatus){mapStatus.textContent=msg;mapStatus.dataset.state=state;}}
  if(!window.L||!document.getElementById('network-map')){
    setStatus('Leaflet ไม่พร้อมใช้งาน — ตาราง candidate ยังสามารถสร้างได้เมื่อรีเฟรชหน้า','error');
    return;
  }

  const map=L.map('network-map',{zoomControl:true,scrollWheelZoom:true}).fitBounds([[minLat,minLon],[maxLat,maxLon]],{padding:[20,20]});
  const terrain=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{
    maxNativeZoom:19,maxZoom:19,attribution:'Tiles &copy; Esri, HERE, Garmin, USGS, NGA, EPA, NPS'
  });
  const topo=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{
    maxNativeZoom:17,maxZoom:19,attribution:'Map data &copy; OpenStreetMap contributors · OpenTopoMap'
  });
  const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxNativeZoom:19,maxZoom:19,attribution:'&copy; OpenStreetMap contributors'
  });
  terrain.on('tileerror',()=>{if(map.hasLayer(terrain)){map.removeLayer(terrain);osm.addTo(map);}});
  topo.on('tileerror',()=>{if(map.hasLayer(topo)){map.removeLayer(topo);osm.addTo(map);}});
  L.control.layers({'Esri Topographic':terrain,'OpenTopoMap contour':topo,'OpenStreetMap':osm},null,{collapsed:true}).addTo(map);
  terrain.addTo(map);
  if(window.ResizeObserver){const ro=new ResizeObserver(()=>map.invalidateSize({pan:false}));ro.observe(document.getElementById('network-map'));}

  const heatLayer=L.layerGroup().addTo(map);
  const blindLayer=L.layerGroup().addTo(map);
  const sourceLayer=L.layerGroup().addTo(map);
  const candidateLayer=L.layerGroup().addTo(map);
  const refLayer=L.layerGroup().addTo(map);
  const markerMap=new Map();
  let selected=[],grid=[],demLoaded=false;

  for(const e of existing){
    const icon=L.divIcon({className:'plan-leaflet-icon',html:'<span class="map-sensor existing">'+e.id.replace('EX-','E')+'</span>',iconSize:[38,38],iconAnchor:[19,19]});
    L.marker([e.lat,e.lon],{icon}).addTo(refLayer).bindTooltip(e.id+' · Sensor เดิม').on('click',()=>showReference(e));
  }
  for(const h of hotspots){
    const icon=L.divIcon({className:'plan-leaflet-icon',html:'<span class="map-hotspot">●</span>',iconSize:[28,28],iconAnchor:[14,14]});
    L.marker([h.lat,h.lon],{icon}).addTo(refLayer).bindTooltip(h.id+' · historical hotspot · FRP '+h.frp).on('click',()=>showHotspot(h));
  }

  const detail={
    phase:document.getElementById('plan-phase'),kind:document.getElementById('plan-kind'),
    title:document.getElementById('plan-title'),role:document.getElementById('plan-role'),
    terrain:document.getElementById('plan-terrain'),pkg:document.getElementById('plan-package'),
    coord:document.getElementById('plan-coord'),distance:document.getElementById('plan-distance'),
    total:document.getElementById('plan-score-total'),confidence:document.getElementById('plan-score-confidence'),
    functional:document.getElementById('plan-functional-role'),
    sTerrain:document.getElementById('score-terrain'),sSmoke:document.getElementById('score-smoke'),
    sRisk:document.getElementById('score-risk'),sCoverage:document.getElementById('score-coverage')
  };

  function setScoreFields(p){
    detail.total.textContent=Math.round(p.totalScore||0)+'/100';
    detail.confidence.textContent=demLoaded?'DEM + wind + risk + geometry':'fallback · DEM unavailable';
    detail.sTerrain.textContent=Math.round(p.terrainScore||0);
    detail.sSmoke.textContent=Math.round(p.smokeScore||0);
    detail.sRisk.textContent=Math.round(p.riskScore||0);
    detail.sCoverage.textContent=Math.round(p.coverageScore||0);
  }
  function showCandidate(p){
    detail.phase.textContent=p.phase;detail.phase.className='status '+(p.phase==='Core'?'green':'amber');
    detail.kind.textContent=p.role;detail.title.textContent=p.id+' · '+zoneFor(p).name;
    detail.role.textContent=p.roleDesc;detail.functional.textContent=p.role;
    detail.terrain.textContent=terrainText(p,demLoaded);
    detail.pkg.textContent=p.pkg;detail.coord.textContent=p.lat.toFixed(6)+', '+p.lon.toFixed(6);
    detail.distance.textContent=demLoaded?Math.round(p.elev)+' m · slope '+p.slope.toFixed(1)+'° · aspect '+aspectLabel(p.aspect)+' ('+p.aspect.toFixed(0)+'°)':'DEM unavailable · slope/aspect not scored';
    setScoreFields(p);
  }
  function showReference(e){
    detail.phase.textContent='Existing';detail.phase.className='status gray';detail.kind.textContent='Existing sensor reference';
    detail.title.textContent=e.id+' · Sensor เดิม';detail.role.textContent=e.note;detail.functional.textContent='Reference only';
    detail.terrain.textContent='ไม่ใช้เป็นหลักฐาน terrain ใน model';detail.pkg.textContent='Wind direction + PM + pollution (ข้อมูลเดิม)';
    detail.coord.textContent=e.lat.toFixed(6)+', '+e.lon.toFixed(6);detail.distance.textContent='ต้องยืนยัน hardware / siting metadata';
    ['total','sTerrain','sSmoke','sRisk','sCoverage'].forEach(k=>detail[k].textContent='—');detail.confidence.textContent='existing reference';
  }
  function showHotspot(h){
    detail.phase.textContent='Historical';detail.phase.className='status amber';detail.kind.textContent='VIIRS validation event';
    detail.title.textContent=h.id+' · Historical hotspot';detail.role.textContent='ใช้ replay เพื่อทดสอบ network configuration ไม่ใช้เป็นศูนย์กลางวาง sensor';
    detail.functional.textContent='Historical validation';detail.terrain.textContent='ไม่ใช้ hotspot เป็น candidate site';
    detail.pkg.textContent='VIIRS · FRP '+h.frp;detail.coord.textContent=h.lat.toFixed(6)+', '+h.lon.toFixed(6);detail.distance.textContent=h.time+' (UTC+7)';
    ['total','sTerrain','sSmoke','sRisk','sCoverage'].forEach(k=>detail[k].textContent='—');detail.confidence.textContent='historical reference';
  }

  function renderHeat(){
    heatLayer.clearLayers();
    for(const p of grid){
      const value=clamp(p.baseScore);
      L.circleMarker([p.lat,p.lon],{
        radius:5+value/18,stroke:false,fillColor:scoreColor(value,0.48),fillOpacity:0.52,className:'plan-heat-point'
      }).bindTooltip('Suitability '+Math.round(value)+'/100').addTo(heatLayer);
    }
  }
  function renderBlind(){
    blindLayer.clearLayers();
    for(const p of grid){
      const d=Math.min(...selected.map(s=>distanceKm([s.lat,s.lon],[p.lat,p.lon])));
      if(d>1.65){
        L.circleMarker([p.lat,p.lon],{radius:8,color:'#a65a49',weight:1,dashArray:'3 3',fillColor:'#efd0c8',fillOpacity:0.22})
          .bindTooltip('Network geometry gap '+d.toFixed(1)+' กม. · ไม่ใช่ detection radius').addTo(blindLayer);
      }
    }
  }
  function renderCandidates(){
    candidateLayer.clearLayers();markerMap.clear();
    for(const p of selected){
      const icon=L.divIcon({
        className:'plan-leaflet-icon',
        html:'<span class="map-sensor proposed role-'+p.roleCode+'">'+p.id.replace('N0','N')+'</span>',
        iconSize:[38,38],iconAnchor:[19,19]
      });
      const m=L.marker([p.lat,p.lon],{icon}).addTo(candidateLayer);
      m.bindTooltip(p.id+' · '+p.role+' · '+Math.round(p.totalScore)+'/100',{direction:'top',offset:[0,-13]});
      m.on('click',()=>showCandidate(p));markerMap.set(p.id,m);
    }
  }
  function renderSource(){
    sourceLayer.clearLayers();
    const src=probableSource(hotspots[0],selected);
    if(!src) return;
    const outer=ellipsePoints(src.center,src.major,src.minor,windToDeg);
    const inner=ellipsePoints(src.center,src.major*0.55,src.minor*0.55,windToDeg);
    L.polygon(outer,{color:'#ad6a26',weight:1.5,dashArray:'7 5',fillColor:'#e6a34d',fillOpacity:0.12})
      .bindTooltip('Probable source area · synthetic / unvalidated').addTo(sourceLayer);
    L.polygon(inner,{color:'#a35e1a',weight:1.5,fillColor:'#e6a34d',fillOpacity:0.16}).addTo(sourceLayer);
    L.marker(src.center,{icon:L.divIcon({className:'plan-source-label',html:'Probable source<br><small>synthetic</small>',iconSize:[92,36],iconAnchor:[46,18]})}).addTo(sourceLayer);
    for(const hit of src.hits){
      L.polyline([[hit.p.lat,hit.p.lon],src.center],{color:'#9a743e',weight:1,dashArray:'4 4',opacity:0.6}).addTo(sourceLayer);
    }
  }

  function renderTable(){
    const body=document.getElementById('plan-table-body');body.replaceChildren();
    for(const p of selected){
      const tr=document.createElement('tr');
      tr.innerHTML='<td><b>'+p.id+'</b></td><td>'+p.zone+'</td><td>'+p.role+'</td><td><span class="phase-pill '+(p.phase==='Core'?'core':'expansion')+'">'+p.phase+'</span></td><td>'+Math.round(p.totalScore)+'</td><td>'+terrainText(p,demLoaded)+'</td><td>'+p.pkg+'</td><td><button type="button" data-plan="'+p.id+'">ดูจุด</button></td>';
      body.appendChild(tr);
    }
    body.querySelectorAll('[data-plan]').forEach(btn=>btn.addEventListener('click',()=>{
      const p=selected.find(x=>x.id===btn.dataset.plan);if(!p)return;showCandidate(p);const m=markerMap.get(p.id);if(m){map.setView(m.getLatLng(),15);m.openTooltip();}
    }));
  }

  function renderZoneCards(){
    const el=document.getElementById('plan-zone-summary');
    const cards=zones.map(z=>{
      const pts=selected.filter(p=>p.zone===z.id);
      const avg=pts.length?pts.reduce((a,b)=>a+b.totalScore,0)/pts.length:0;
      return '<article class="plan-zone-card"><b>'+z.id+' · '+z.name+'</b><p>'+pts.length+' selected candidate · '+pts.filter(p=>p.phase==='Core').length+' Core</p><small>'+z.desc+'</small><span class="zone-score">avg score '+Math.round(avg)+'</span><button type="button" data-zone="'+z.id+'">ดู sector</button></article>';
    });
    el.innerHTML=cards.join('');
    el.querySelectorAll('[data-zone]').forEach(btn=>btn.addEventListener('click',()=>focusZone(btn.dataset.zone)));
  }

  function renderReplay(){
    const cards=document.getElementById('plan-replay-cards');
    cards.innerHTML=hotspots.map(h=>{
      const hits=detectionFor(h,selected);
      const first=hits[0];
      const label=first?first.p.id+' · '+first.p.role:'ไม่มี candidate ที่เหมาะสม';
      const time=first?Math.round(first.time)+' นาที':'—';
      return '<article class="plan-replay-card"><b>'+h.id+' · FRP '+h.frp+'</b><strong>'+time+'</strong><small>synthetic first-detection · '+label+'<br>'+h.time+' historical reference</small></article>';
    }).join('');
  }

  function updateMetrics(){
    const core=selected.filter(p=>p.phase==='Core').length;
    document.getElementById('plan-candidate-count').textContent=grid.length;
    document.getElementById('plan-selected-count').textContent=selected.length;
    document.getElementById('plan-core-count').textContent=core;
    document.getElementById('plan-dem-metric').textContent=demLoaded?'GLO-90':'Fallback';
    document.getElementById('plan-dem-note').textContent=demLoaded?'Copernicus DEM 2021 · 90 m via Open-Meteo':'ใช้ wind/risk/geometry จนกว่า DEM จะกลับมา';
  }

  function focusZone(id){
    const pts=id==='ALL'?selected:selected.filter(p=>p.zone===id);
    if(!pts.length){map.fitBounds([[minLat,minLon],[maxLat,maxLon]],{padding:[20,20]});return;}
    map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])).pad(0.35),{padding:[22,22]});
  }

  function bindControls(){
    const select=document.getElementById('plan-zone');
    document.getElementById('plan-focus').onclick=()=>focusZone(select.value);
    document.getElementById('plan-fit').onclick=()=>map.fitBounds([[minLat,minLon],[maxLat,maxLon]],{padding:[20,20]});
    select.onchange=()=>{if(select.value!=='ALL')focusZone(select.value);};
    document.getElementById('plan-heat').onchange=e=>e.target.checked?heatLayer.addTo(map):map.removeLayer(heatLayer);
    document.getElementById('plan-blind').onchange=e=>e.target.checked?blindLayer.addTo(map):map.removeLayer(blindLayer);
    document.getElementById('plan-source').onchange=e=>e.target.checked?sourceLayer.addTo(map):map.removeLayer(sourceLayer);
  }

  async function bootstrap(){
    setStatus('กำลังดึง Copernicus DEM GLO-90 และคำนวณ candidate 100 จุด…','loading');
    grid=createGrid();
    try{
      await enrichGrid(grid);demLoaded=true;
      setStatus('DEM พร้อม · คำนวณ slope/aspect proxy และเลือก network ตาม terrain + risk + wind + geometry','ready');
    }catch(err){
      demLoaded=false;
      setStatus('โหลด DEM ไม่สำเร็จ — ใช้ fallback score จาก wind + historical risk + network geometry เท่านั้น','error');
    }
    addScores(grid,demLoaded);
    selected=selectNetwork(grid);
    renderHeat();renderBlind();renderCandidates();renderSource();renderTable();renderZoneCards();renderReplay();updateMetrics();bindControls();
    if(selected[0]) showCandidate(selected[0]);
    focusZone('ALL');
    window.ForestWatchNetworkV4={
      mode:'DEM_DRIVEN_PLANNING_DEMO',
      demLoaded,
      candidates:grid.map(p=>({lat:p.lat,lon:p.lon,score:Math.round(p.baseScore)})),
      selected:selected.map(p=>({id:p.id,lat:p.lat,lon:p.lon,role:p.role,phase:p.phase,score:Math.round(p.totalScore),zone:p.zone})),
      historicalHotspots:hotspots
    };
  }
  bootstrap();
})();