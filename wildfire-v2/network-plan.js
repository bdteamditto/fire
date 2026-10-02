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

  async function fetchElevations(coords,signal) {
    const values=[];
    for(let i=0;i<coords.length;i+=100){
      const part=coords.slice(i,i+100);
      const lats=part.map(p=>p[0].toFixed(6)).join(',');
      const lons=part.map(p=>p[1].toFixed(6)).join(',');
      const url='https://api.open-meteo.com/v1/elevation?latitude='+encodeURIComponent(lats)+'&longitude='+encodeURIComponent(lons);
      const res=await fetch(url,{cache:'force-cache',signal});
      if(!res.ok) throw new Error('Elevation API '+res.status);
      const json=await res.json();
      if(!Array.isArray(json.elevation)||json.elevation.length!==part.length||!json.elevation.every(Number.isFinite)) throw new Error('Elevation response invalid');
      values.push(...json.elevation);
    }
    return values;
  }

  async function enrichGrid(grid,signal) {
    const queries=[];
    const refs=[];
    for(const p of grid){
      const dLat=0.18/110.57;
      const dLon=0.18/(111.32*Math.cos(rad(p.lat)));
      const pts=[[p.lat,p.lon],[p.lat+dLat,p.lon],[p.lat-dLat,p.lon],[p.lat,p.lon+dLon],[p.lat,p.lon-dLon]];
      refs.push({start:queries.length,dx:180,dy:180});
      queries.push(...pts);
    }
    const z=await fetchElevations(queries,signal);
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
    // Repair strongly contradicted terrain roles without moving or renumbering selected sites.
    if(points.every(p=>Number.isFinite(p.relief))){
      const swapRoles=(a,b)=>{[a.role,b.role]=[b.role,a.role];[a.roleCode,b.roleCode]=[b.roleCode,a.roleCode];};
      for(const p of points.filter(p=>p.roleCode==='RW'&&p.relief<-9)){
        const replacement=points.filter(q=>!['RS','RW'].includes(q.roleCode)&&q.relief>9)
          .sort((a,b)=>b.ridgeScore-a.ridgeScore||(b.roleCode==='FU')-(a.roleCode==='FU'))[0];
        if(replacement)swapRoles(p,replacement);
      }
      for(const p of points.filter(p=>p.roleCode==='VW'&&p.relief>9)){
        const replacement=points.filter(q=>!['RS','RW','VW'].includes(q.roleCode)&&q.relief<-9)
          .sort((a,b)=>b.valleyScore-a.valleyScore)[0];
        if(replacement)swapRoles(p,replacement);
      }
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
    return 'terrain proxy · '+form+' · relief '+rel.toFixed(1)+' m';
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
  let selected=[],grid=[],demLoaded=false,demStatus='pending',demCachedAt=null,planRevision=0,updatedAt=null,renderUpdatedPlan=null;
  const terrainCacheKey='forestwatch:v1:dem:original-grid-180m:'+rows+'x'+cols+':'+[minLat,minLon,maxLat,maxLon].map(n=>n.toFixed(6)).join(',');
  function readTerrainCache(){
    try{
      const value=JSON.parse(localStorage.getItem(terrainCacheKey)||'null'),expected=createGrid();
      if(value?.version!==1||!Number.isFinite(value.savedAt)||!Number.isFinite(new Date(value.savedAt).getTime())||!Array.isArray(value.grid)||value.grid.length!==expected.length)return null;
      const valid=value.grid.every((p,i)=>
        Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat-expected[i].lat)<1e-9&&Math.abs(p.lon-expected[i].lon)<1e-9&&
        ['elev','slope','aspect','relief'].every(key=>Number.isFinite(p[key]))&&p.slope>=0&&p.slope<=90&&p.aspect>=0&&p.aspect<360
      );
      if(!valid)return null;
      return {grid:expected.map((p,i)=>({...p,elev:value.grid[i].elev,slope:value.grid[i].slope,aspect:value.grid[i].aspect,relief:value.grid[i].relief})),savedAt:value.savedAt};
    }catch(_){return null;}
  }
  function saveTerrainCache(){
    const savedAt=Date.now();
    try{localStorage.setItem(terrainCacheKey,JSON.stringify({version:1,savedAt,source:'Copernicus GLO-90 via Open-Meteo',grid,selected}));}catch(_){}
    return new Date(savedAt).toISOString();
  }
  function publishNetworkData(){
    planRevision++;
    if(!updatedAt)updatedAt=new Date().toISOString();
    window.ForestWatchNetworkV4={
      mode:'DEM_DRIVEN_PLANNING_DEMO',
      demLoaded,demStatus,demCachedAt,planRevision,updatedAt,
      provenance:{
        terrain:{source:demLoaded?'Copernicus GLO-90 via Open-Meteo':'wind/risk/network geometry fallback',status:demStatus,cachedAt:demCachedAt},
        network:'Original 21-point Network Plan selection algorithm shared by 2D and 3D; 3 existing reference points unchanged',
        selection:{revision:planRevision,updatedAt,algorithm:'Original terrain + wind + historical risk + geometry selection',roleValidation:demLoaded?'Contradicted ridge/valley roles exchanged using relief proxy without moving selected sites':'Terrain roles provisional while DEM is unavailable'}
      },
      bounds:{minLat,maxLat,minLon,maxLon},center,
      wind:{fromDeg:windFromDeg,toDeg:windToDeg,speedMs:windSpeedMs},
      candidates:grid.map(p=>({
        lat:p.lat,lon:p.lon,score:p.baseScore,
        elev:p.elev,slope:p.slope,aspect:p.aspect,relief:p.relief,
        terrainScore:p.terrainScore,ridgeScore:p.ridgeScore,valleyScore:p.valleyScore,
        riskScore:p.riskScore,smokeScore:p.smokeScore,coverageScore:p.coverageScore,
        boundaryScore:p.boundaryScore
      })),
      selected:selected.map(p=>({
        id:p.id,lat:p.lat,lon:p.lon,role:p.role,roleCode:p.roleCode,phase:p.phase,
        score:p.totalScore,zone:p.zone,pkg:p.pkg,roleDesc:p.roleDesc,
        elev:p.elev,slope:p.slope,aspect:p.aspect,relief:p.relief,
        terrainScore:p.terrainScore,ridgeScore:p.ridgeScore,valleyScore:p.valleyScore,
        riskScore:p.riskScore,smokeScore:p.smokeScore,coverageScore:p.coverageScore,boundaryScore:p.boundaryScore,
        confidence:p.confidence,terrainInterpretation:terrainText(p,demLoaded)
      })),
      existing:existing.map(p=>({...p})),historicalHotspots:hotspots.map(p=>({...p}))
    };
    window.dispatchEvent(new CustomEvent('forestwatch:v4-ready',{detail:window.ForestWatchNetworkV4}));
  }
  async function refreshTerrain(){
    const terrainGrid=createGrid(),controller=new AbortController();
    let timeout;
    try{
      await Promise.race([
        enrichGrid(terrainGrid,controller.signal),
        new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error('Elevation deadline exceeded'));},14000);})
      ]);
      grid=terrainGrid;demLoaded=true;demStatus='ready';updatedAt=new Date().toISOString();
      addScores(grid,true);selected=selectNetwork(grid);demCachedAt=saveTerrainCache();
      setStatus('DEM พร้อม · อัปเดต network 21 จุดชุดเดียวกันบนแผนที่ 2D และ 3D','ready');
    }catch(err){
      demStatus=demLoaded?'cached':'unavailable';
      setStatus(demLoaded?'อัปเดต DEM ไม่สำเร็จ · คง network ล่าสุดจาก DEM ที่บันทึกไว้':'DEM ไม่พร้อมภายในเวลาที่กำหนด · ใช้ fallback จาก wind + historical risk + network geometry',demLoaded?'ready':'error');
    }finally{clearTimeout(timeout);controller.abort();}
    publishNetworkData();
    if(renderUpdatedPlan)renderUpdatedPlan();
  }
  // Publish usable geometry before either the map library or an elevation request is needed.
  const cachedTerrain=readTerrainCache();
  grid=cachedTerrain?cachedTerrain.grid:createGrid();demLoaded=!!cachedTerrain;
  if(cachedTerrain){demStatus='cached';demCachedAt=new Date(cachedTerrain.savedAt).toISOString();updatedAt=demCachedAt;}
  addScores(grid,demLoaded);selected=selectNetwork(grid);publishNetworkData();
  void refreshTerrain();
  if(!window.L||!document.getElementById('network-map')){
    setStatus('แผนที่ Network Plan ไม่พร้อม · ส่งข้อมูล fallback ให้แผนที่ 3D แล้ว','error');
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

  function pointMatches(kind,roleCode){return window.ForestWatchPointFilters?.matches(kind,roleCode)??true;}
  function renderReferences(){
    refLayer.clearLayers();
    for(const e of existing){
      if(!pointMatches('sensor','EX'))continue;
      const icon=L.divIcon({className:'plan-leaflet-icon',html:'<span class="map-sensor existing" data-site-id="'+e.id+'" data-lat="'+e.lat+'" data-lon="'+e.lon+'" data-role-code="EX" role="img" aria-label="'+e.id+' เซนเซอร์เดิม">'+e.id.replace('EX-','E')+'</span>',iconSize:[38,38],iconAnchor:[19,19]});
      L.marker([e.lat,e.lon],{icon}).addTo(refLayer).bindTooltip(e.id+' · Sensor เดิม').on('click',()=>showReference(e));
    }
    for(const h of hotspots){
      if(!pointMatches('hotspot'))continue;
      const icon=L.divIcon({className:'plan-leaflet-icon',html:'<span class="map-hotspot" data-site-id="'+h.id+'" data-lat="'+h.lat+'" data-lon="'+h.lon+'" data-role-code="hotspot" role="img" aria-label="'+h.id+' จุดไฟย้อนหลัง">●</span>',iconSize:[28,28],iconAnchor:[14,14]});
      L.marker([h.lat,h.lon],{icon}).addTo(refLayer).bindTooltip(h.id+' · historical hotspot · FRP '+h.frp).on('click',()=>showHotspot(h));
    }
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
    detail.confidence.textContent=demLoaded?(demStatus==='cached'?'DEM ที่บันทึกไว้ + wind + risk + geometry':'DEM + wind + risk + geometry'):'fallback · DEM unavailable';
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
      if(!pointMatches('sensor',p.roleCode))continue;
      const icon=L.divIcon({
        className:'plan-leaflet-icon',
        html:'<span class="map-sensor proposed role-'+p.roleCode+'" data-site-id="'+p.id+'" data-lat="'+p.lat+'" data-lon="'+p.lon+'" data-role-code="'+p.roleCode+'" role="img" aria-label="'+p.id+' '+p.role+'">'+p.id.replace('N0','N')+'</span>',
        iconSize:[38,38],iconAnchor:[19,19]
      });
      const m=L.marker([p.lat,p.lon],{icon}).addTo(candidateLayer);
      m.bindTooltip(p.id+' · '+p.role+' · '+Math.round(p.totalScore)+'/100',{direction:'top',offset:[0,-13]});
      m.on('click',()=>showCandidate(p));markerMap.set(p.id,m);
    }
    syncPlanningOverlays();
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
    document.getElementById('plan-dem-metric').textContent=demLoaded?(demStatus==='cached'?'GLO-90 (cache)':'GLO-90'):'Fallback';
    const cachedAt=window.ForestWatchNetworkV4?.demCachedAt;
    const cacheLabel=demStatus==='cached'&&cachedAt&&Number.isFinite(Date.parse(cachedAt))?' · บันทึก '+new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}).format(new Date(cachedAt)):'';
    document.getElementById('plan-dem-note').textContent=demLoaded?'Copernicus DEM 2021 · 90 m via Open-Meteo'+cacheLabel:'ใช้ wind/risk/geometry จนกว่า DEM จะกลับมา';
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
    ['plan-heat','plan-blind','plan-source'].forEach(id=>document.getElementById(id).onchange=syncPlanningOverlays);
  }

  function syncPlanningOverlays(){
    const showPlanning=(window.ForestWatchPointFilters?.get().mode||'all')==='all';
    [['plan-heat',heatLayer],['plan-blind',blindLayer],['plan-source',sourceLayer]].forEach(([id,layer])=>{
      const input=document.getElementById(id);input.disabled=!showPlanning;
      if(showPlanning&&input.checked)layer.addTo(map);else map.removeLayer(layer);
    });
    const el=document.getElementById('network-map');
    const sensorCount=selected.filter(p=>pointMatches('sensor',p.roleCode)).length+(pointMatches('sensor','EX')?existing.length:0),hotspotCount=pointMatches('hotspot')?hotspots.length:0;
    el.dataset.visibleSensorCount=String(sensorCount);el.dataset.visibleHotspotCount=String(hotspotCount);
    el.dataset.pointMode=window.ForestWatchPointFilters?.get().mode||'all';
    const count=document.querySelector('[data-point-count="2d"]');
    if(count)count.textContent='แสดง '+(sensorCount+hotspotCount)+' จุด · เซนเซอร์ '+sensorCount+' · จุดไฟ '+hotspotCount;
  }
  renderReferences();syncPlanningOverlays();
  window.ForestWatchPointFilters?.subscribe(()=>{renderCandidates();renderReferences();syncPlanningOverlays();});

  function bootstrap(){
    setStatus(demLoaded?'ใช้ network ล่าสุดจาก DEM ที่บันทึกไว้ · กำลังตรวจอัปเดต':'ใช้ fallback จาก wind/risk/geometry ระหว่างโหลด DEM · แสดง 21 จุดให้ตรวจสอบได้ทันที','loading');
    renderUpdatedPlan=()=>{
      renderHeat();renderBlind();renderCandidates();renderSource();renderTable();renderZoneCards();renderReplay();updateMetrics();
      if(selected[0])showCandidate(selected[0]);
    };
    renderUpdatedPlan();bindControls();focusZone('ALL');
  }
  bootstrap();
})();
