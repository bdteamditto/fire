'use strict';
(() => {
  const QUOTE_PRICES = Object.freeze({
    superStation: {sku:'RK900-12ABAM5++', name:'Ultrasonic Automatic Weather Instrument · WS/WD/T/RH/Pressure/PM/Rain', unit:62000},
    wind: {sku:'RK120-01CAB2500', name:'Combined Wind Speed & Direction Sensor (RS485)', unit:12500},
    tempRh: {sku:'RK330-01ADB3000', name:'Atmospheric Temperature & Humidity Sensor (RS485)', unit:5200},
    pm: {sku:'RK300-02DBBA3000', name:'PM2.5 / PM10 Outdoor Air Quality Sensor', unit:7800}
  });
  const ROLE = Object.freeze({
    RS:{label:'Reference / Super',short:'Super',components:{superStation:1}},
    FU:{label:'Fusion',short:'Fusion',components:{wind:1,tempRh:1,pm:1}},
    WX:{label:'Weather',short:'Weather',components:{wind:1,tempRh:1}},
    AQ:{label:'AQ / Smoke',short:'AQ',components:{pm:1}}
  });
  const WC = Object.freeze({
    10:{name:'Tree cover',fuel:100,site:62,color:'#006400'},
    20:{name:'Shrubland',fuel:92,site:76,color:'#ffbb22'},
    30:{name:'Grassland',fuel:82,site:86,color:'#ffff4c'},
    40:{name:'Cropland',fuel:70,site:82,color:'#f096ff'},
    50:{name:'Built-up',fuel:24,site:70,color:'#fa0000'},
    60:{name:'Bare / sparse vegetation',fuel:18,site:88,color:'#b4b4b4'},
    70:{name:'Snow / ice',fuel:0,site:10,color:'#f0f0f0'},
    80:{name:'Permanent water',fuel:0,site:0,color:'#0064c8'},
    90:{name:'Herbaceous wetland',fuel:32,site:36,color:'#0096a0'},
    95:{name:'Mangroves',fuel:48,site:28,color:'#00cf75'},
    100:{name:'Moss / lichen',fuel:25,site:55,color:'#fae6a0'}
  });
  const HIGHWAY_WEIGHT = Object.freeze({
    motorway:1,trunk:1,primary:1,secondary:.98,tertiary:.95,
    unclassified:.9,residential:.9,service:.86,track:.72,
    path:.50,footway:.48,steps:.35,cycleway:.58
  });
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
  const rad=d=>d*Math.PI/180;
  const money=n=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:0}).format(Math.round(n||0));
  const km=n=>Number.isFinite(n)?n.toFixed(n<1?2:1):'—';

  function distanceKm(a,b){
    const p1=rad(a[0]),p2=rad(b[0]),dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);
    const h=Math.sin(dlat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dlon/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  function pointSegmentKm(p,a,b){
    const lat0=rad(p[0]);
    const toXY=q=>({x:(q[1]-p[1])*111.32*Math.cos(lat0),y:(q[0]-p[0])*110.57});
    const A=toXY(a),B=toXY(b),vx=B.x-A.x,vy=B.y-A.y;
    const den=vx*vx+vy*vy;
    const t=den?Math.max(0,Math.min(1,((-(A.x)*vx-(A.y)*vy)/den))):0;
    const x=A.x+t*vx,y=A.y+t*vy;
    return Math.sqrt(x*x+y*y);
  }
  function componentCost(role){
    return Object.entries(ROLE[role].components).reduce((sum,[k,q])=>sum+QUOTE_PRICES[k].unit*q,0);
  }
  function getNum(id,fallback=0){
    const el=document.getElementById(id);
    const v=Number(el?.value);
    return Number.isFinite(v)?v:fallback;
  }
  function setText(id,value){const el=document.getElementById(id);if(el)el.textContent=value;}
  function status(id,text,state='loading'){
    const el=document.getElementById(id);if(!el)return;
    el.textContent=text;el.dataset.state=state;
  }

  function tileId(lat,lon){
    const lat0=Math.floor(lat/3)*3,lon0=Math.floor(lon/3)*3;
    const ns=lat0>=0?'N':'S',ew=lon0>=0?'E':'W';
    return ns+String(Math.abs(lat0)).padStart(2,'0')+ew+String(Math.abs(lon0)).padStart(3,'0');
  }
  function worldCoverUrl(id){
    return 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_'+id+'_Map.tif';
  }
  async function enrichWorldCover(candidates){
    if(!window.GeoTIFF?.fromUrl) throw new Error('GeoTIFF library unavailable');
    const groups=new Map();
    candidates.forEach((p,i)=>{
      const id=tileId(p.lat,p.lon);
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push({p,i});
    });
    for(const [id,items] of groups){
      const tiff=await GeoTIFF.fromUrl(worldCoverUrl(id));
      const image=await tiff.getImage();
      const bbox=image.getBoundingBox(),w=image.getWidth(),h=image.getHeight();
      const pix=items.map(({p})=>{
        const x=Math.floor((p.lon-bbox[0])/(bbox[2]-bbox[0])*w);
        const y=Math.floor((bbox[3]-p.lat)/(bbox[3]-bbox[1])*h);
        return {x:Math.max(0,Math.min(w-1,x)),y:Math.max(0,Math.min(h-1,y))};
      });
      const minX=Math.min(...pix.map(x=>x.x)),maxX=Math.max(...pix.map(x=>x.x));
      const minY=Math.min(...pix.map(x=>x.y)),maxY=Math.max(...pix.map(x=>x.y));
      const width=maxX-minX+1,height=maxY-minY+1;
      const raster=await image.readRasters({window:[minX,minY,maxX+1,maxY+1],samples:[0],interleave:true});
      items.forEach(({p},j)=>{
        const q=pix[j],code=Number(raster[(q.y-minY)*width+(q.x-minX)]);
        const cls=WC[code]||{name:'Unknown',fuel:50,site:50,color:'#888'};
        p.landcoverCode=code;p.landcover=cls.name;p.fuelScore=cls.fuel;p.landcoverSiteScore=cls.site;p.landcoverColor=cls.color;
      });
    }
  }

  async function fetchOSM(bounds){
    const padLat=(bounds.maxLat-bounds.minLat)*0.10,padLon=(bounds.maxLon-bounds.minLon)*0.10;
    const bbox=[bounds.minLat-padLat,bounds.minLon-padLon,bounds.maxLat+padLat,bounds.maxLon+padLon].join(',');
    const query='[out:json][timeout:35];('+
      'way["highway"]('+bbox+');'+
      'node["man_made"~"mast|tower"]('+bbox+');'+
      'node["tower:type"="communication"]('+bbox+');'+
      'node["barrier"]('+bbox+');'+
      'nwr["emergency"="fire_hydrant"]('+bbox+');'+
      'nwr["natural"="spring"]('+bbox+');'+
      'nwr["amenity"="fire_station"]('+bbox+');'+
      'nwr["aeroway"~"helipad|heliport"]('+bbox+');'+
      'way["natural"="water"]('+bbox+');'+
      ');out geom;';
    const endpoint='https://overpass-api.de/api/interpreter';
    const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query)});
    if(!res.ok)throw new Error('Overpass '+res.status);
    const json=await res.json(),segments=[],masts=[],barriers=[],support=[];
    const centroid=e=>{
      if(Number.isFinite(e.lat)&&Number.isFinite(e.lon))return [e.lat,e.lon];
      if(Array.isArray(e.geometry)&&e.geometry.length){
        const pts=e.geometry.filter(g=>Number.isFinite(g.lat)&&Number.isFinite(g.lon));
        if(pts.length)return [pts.reduce((a,b)=>a+b.lat,0)/pts.length,pts.reduce((a,b)=>a+b.lon,0)/pts.length];
      }
      return null;
    };
    for(const e of json.elements||[]){
      const tags=e.tags||{};
      if(e.type==='way'&&tags.highway&&Array.isArray(e.geometry)){
        const hw=tags.highway,weight=HIGHWAY_WEIGHT[hw]||.65;
        const meta={
          wayId:e.id,hw,weight,name:tags.name||tags.ref||'',
          surface:tags.surface||'',smoothness:tags.smoothness||'',tracktype:tags.tracktype||'',
          access:tags.access||'',motorVehicle:tags.motor_vehicle||tags.vehicle||'',oneway:tags.oneway||''
        };
        for(let i=1;i<e.geometry.length;i++){
          segments.push({...meta,a:[e.geometry[i-1].lat,e.geometry[i-1].lon],b:[e.geometry[i].lat,e.geometry[i].lon]});
        }
        continue;
      }
      const c=centroid(e);
      if(!c)continue;
      if(tags.man_made==='mast'||tags.man_made==='tower'||tags['tower:type']==='communication'){
        masts.push({lat:c[0],lon:c[1],tags});
      }
      if(tags.barrier)barriers.push({lat:c[0],lon:c[1],type:tags.barrier,access:tags.access||'',tags});
      let kind=null;
      if(tags.emergency==='fire_hydrant')kind='Fire hydrant';
      else if(tags.natural==='spring')kind='Spring / water';
      else if(tags.amenity==='fire_station')kind='Fire station';
      else if(tags.aeroway==='helipad'||tags.aeroway==='heliport')kind='Helipad / heliport';
      else if(tags.natural==='water')kind='Mapped water body';
      if(kind)support.push({lat:c[0],lon:c[1],kind,name:tags.name||'',tags});
    }
    return {segments,masts,barriers,support};
  }

  class MinHeap{
    constructor(){this.a=[];}
    push(item){const a=this.a;a.push(item);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}
    pop(){const a=this.a;if(!a.length)return null;const root=a[0],last=a.pop();if(a.length){let i=0;while(true){let l=i*2+1,r=l+1;if(l>=a.length)break;let c=r<a.length&&a[r][0]<a[l][0]?r:l;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return root;}
    get size(){return this.a.length;}
  }
  function graphKey(p){return p[0].toFixed(6)+','+p[1].toFixed(6);}
  function buildAccessGraph(segments){
    const nodes=new Map();
    const ensure=p=>{const k=graphKey(p);if(!nodes.has(k))nodes.set(k,{key:k,coord:p,edges:[],roadClasses:new Set()});return nodes.get(k);};
    for(const s of segments){
      const a=ensure(s.a),b=ensure(s.b),d=distanceKm(s.a,s.b),difficulty=1/Math.max(.28,s.weight||.65);
      a.edges.push({to:b.key,cost:d*difficulty,km:d,hw:s.hw,seg:s});
      b.edges.push({to:a.key,cost:d*difficulty,km:d,hw:s.hw,seg:s});
      a.roadClasses.add(s.hw);b.roadClasses.add(s.hw);
    }
    return nodes;
  }
  function accessDistances(graph){
    const dist=new Map(),heap=new MinHeap();
    const primary=new Set(['motorway','trunk','primary','secondary','tertiary']);
    for(const [k,n] of graph){
      if([...n.roadClasses].some(x=>primary.has(x))){dist.set(k,0);heap.push([0,k]);}
    }
    while(heap.size){
      const cur=heap.pop(),d=cur[0],k=cur[1];
      if(d!==dist.get(k))continue;
      const node=graph.get(k);
      for(const e of node.edges){
        const nd=d+e.cost;
        if(nd<(dist.get(e.to)??Infinity)){dist.set(e.to,nd);heap.push([nd,e.to]);}
      }
    }
    return dist;
  }
  function nearestGraphNode(p,graph){
    let best=null,bestD=Infinity;
    for(const n of graph.values()){
      const d=distanceKm([p.lat,p.lon],n.coord);
      if(d<bestD){bestD=d;best=n;}
    }
    return {node:best,distanceKm:bestD};
  }
  function enrichAccess(candidates,osm){
    const graph=buildAccessGraph(osm.segments),routeDist=accessDistances(graph);
    osm.graphNodeCount=graph.size;
    osm.mainAccessGraph=graph;
    for(const p of candidates){
      let best=Infinity,bestType='—';
      for(const s of osm.segments){
        const d=pointSegmentKm([p.lat,p.lon],s.a,s.b);
        const effective=d/Math.max(.25,s.weight);
        if(effective<best){best=effective;bestType=s.hw;}
      }
      const near=nearestGraphNode(p,graph),networkKm=near.node?(routeDist.get(near.node.key)??Infinity):Infinity;
      p.roadDistanceKm=Number.isFinite(best)?best:null;p.roadType=bestType;
      p.offroadAccessKm=Number.isFinite(near.distanceKm)?near.distanceKm:null;
      p.routeAccessKm=Number.isFinite(networkKm)?networkKm:null;
      p.nearestAccessNode=near.node?near.node.coord:null;
      const generalized=(Number.isFinite(near.distanceKm)?near.distanceKm*2.4:2)+(Number.isFinite(networkKm)?networkKm:4);
      p.accessScore=clamp(100*Math.exp(-generalized/4.0));
      if(osm.masts.length){
        p.mastDistanceKm=Math.min(...osm.masts.map(m=>distanceKm([p.lat,p.lon],[m.lat,m.lon])));
        p.backhaulScore=clamp(100*Math.exp(-p.mastDistanceKm/3.5));
      }else{
        p.mastDistanceKm=null;p.backhaulScore=45;
      }
    }
  }

  function normalizeElevation(candidates){
    const vals=candidates.map(p=>p.elev).filter(Number.isFinite),lo=vals.length?Math.min(...vals):0,hi=vals.length?Math.max(...vals):1;
    for(const p of candidates)p.elevScore=Number.isFinite(p.elev)?clamp(100*(p.elev-lo)/Math.max(1,hi-lo)):50;
  }
  function finalCandidateScore(p){
    const landSite=Number.isFinite(p.landcoverSiteScore)?p.landcoverSiteScore:50;
    const fuel=Number.isFinite(p.fuelScore)?p.fuelScore:50;
    const access=Number.isFinite(p.accessScore)?p.accessScore:50;
    return clamp(
      .24*(p.score??50)+.15*(p.terrainScore??50)+.12*(p.smokeScore??50)+
      .10*(p.riskScore??50)+.11*(p.coverageScore??50)+.10*landSite+
      .08*fuel+.10*access
    );
  }
  function roleUtility(p,role,objective){
    const terrain=p.terrainScore??50,ridge=p.ridgeScore??50,valley=p.valleyScore??50,
      risk=p.riskScore??50,smoke=p.smokeScore??50,coverage=p.coverageScore??50,
      boundary=p.boundaryScore??50,fuel=p.fuelScore??50,site=p.landcoverSiteScore??50,
      access=p.accessScore??50,elev=p.elevScore??50,backhaul=p.backhaulScore??45;
    let u=50;
    if(role==='AQ')u=.27*risk+.25*smoke+.18*fuel+.12*coverage+.10*access+.08*site;
    if(role==='WX')u=.22*terrain+.18*Math.max(ridge,valley)+.16*boundary+.16*coverage+.12*access+.10*elev+.06*backhaul;
    if(role==='FU')u=.20*risk+.19*smoke+.15*terrain+.12*fuel+.11*coverage+.09*access+.08*site+.06*elev;
    if(role==='RS')u=.27*elev+.19*terrain+.17*coverage+.13*boundary+.11*access+.08*backhaul+.05*site;
    if(objective==='early'){
      if(role==='AQ'||role==='FU')u+=.12*smoke+.08*risk;
      else u-=4;
    }else if(objective==='coverage'){
      u+=.12*coverage+.08*boundary;
      if(role==='WX'||role==='FU')u+=4;
    }else if(objective==='access'){
      u+=.18*access+.08*site;
    }
    return clamp(u);
  }

  function siteSpacingFactor(p,nodes){
    if(!nodes.length)return 1;
    const d=Math.min(...nodes.map(n=>distanceKm([p.lat,p.lon],[n.p.lat,n.p.lon])));
    if(d<.55)return .45;
    if(d<.9)return .72;
    if(d>2.2)return 1.08;
    return 1;
  }
  function gatewayCandidates(candidates,nodes,rangeKm){
    return candidates.map((p,i)=>{
      const covers=nodes.filter(n=>distanceKm([p.lat,p.lon],[n.p.lat,n.p.lon])<=rangeKm);
      const centrality=nodes.length?100*covers.length/nodes.length:0;
      const score=.40*centrality+.23*(p.elevScore??50)+.17*(p.accessScore??50)+.10*(p.backhaulScore??45)+.10*finalCandidateScore(p);
      return {p,index:i,covers,score};
    }).sort((a,b)=>b.score-a.score);
  }
  function placeGateways(candidates,nodes,rangeKm){
    if(!nodes.length)return [];
    const uncovered=new Set(nodes.map((_,i)=>i)),gateways=[],used=new Set();
    while(uncovered.size&&gateways.length<8){
      let best=null;
      for(const g of gatewayCandidates(candidates,nodes,rangeKm)){
        if(used.has(g.index))continue;
        const coverIdx=[];
        nodes.forEach((n,i)=>{if(uncovered.has(i)&&distanceKm([g.p.lat,g.p.lon],[n.p.lat,n.p.lon])<=rangeKm)coverIdx.push(i);});
        if(!coverIdx.length)continue;
        const gain=coverIdx.length*100+g.score;
        if(!best||gain>best.gain)best={...g,coverIdx,gain};
      }
      if(!best)break;
      used.add(best.index);best.coverIdx.forEach(i=>uncovered.delete(i));
      gateways.push({id:'GW-'+String(gateways.length+1).padStart(2,'0'),p:best.p,score:best.score,coverIdx:best.coverIdx});
    }
    return gateways;
  }

  function quotedHardwareExVat(nodes){
    return nodes.reduce((sum,n)=>sum+componentCost(n.role),0);
  }
  function totals(nodes,gateways){
    const install=getNum('opt-install-cost',0),gatewayUnit=getNum('opt-gateway-cost',0);
    const ex=quotedHardwareExVat(nodes)+nodes.length*install+gateways.length*gatewayUnit;
    const vat=ex*.07;
    return {ex,vat,total:ex+vat};
  }
  function bestCandidateForRole(candidates,nodes,role,objective,budget){
    const used=new Set(nodes.map(n=>n.idx));
    let best=null;
    for(let i=0;i<candidates.length;i++){
      if(used.has(i))continue;
      const p=candidates[i],utility=roleUtility(p,role,objective)*siteSpacingFactor(p,nodes);
      const cost=componentCost(role)+getNum('opt-install-cost',0);
      const efficiency=objective==='cost'?utility/Math.max(1,cost):utility/Math.sqrt(Math.max(1,cost));
      const val=efficiency*(.9+.1*finalCandidateScore(p)/100);
      if(!best||val>best.value)best={idx:i,p,role,utility,value:val};
    }
    return best;
  }
  function tryAdd(nodes,candidate,candidates,rangeKm,budget){
    if(!candidate)return false;
    const next=[...nodes,candidate];
    const gateways=placeGateways(candidates,next,rangeKm);
    if(totals(next,gateways).total<=budget){nodes.push(candidate);return true;}
    return false;
  }
  function optimize(candidates){
    const budget=getNum('opt-budget',500000),rangeKm=getNum('opt-radio-range',3),objective=document.getElementById('opt-objective')?.value||'balanced';
    const nodes=[];
    for(const role of ['RS','FU','WX','AQ']){
      const c=bestCandidateForRole(candidates,nodes,role,objective,budget);
      tryAdd(nodes,c,candidates,rangeKm,budget);
    }
    const maxNodes=40;
    while(nodes.length<maxNodes){
      const counts=Object.fromEntries(['RS','FU','WX','AQ'].map(r=>[r,nodes.filter(n=>n.role===r).length]));
      const options=[];
      for(const role of ['FU','WX','AQ']){
        const c=bestCandidateForRole(candidates,nodes,role,objective,budget);
        if(!c)continue;
        const ratio=nodes.length?counts[role]/nodes.length:0;
        if(role==='AQ'&&ratio>.52)c.value*=.73;
        if(role==='WX'&&ratio>.48)c.value*=.80;
        if(role==='FU'&&ratio>.42)c.value*=.76;
        options.push(c);
      }
      options.sort((a,b)=>b.value-a.value);
      let added=false;
      for(const c of options){
        if(tryAdd(nodes,c,candidates,rangeKm,budget)){added=true;break;}
      }
      if(!added)break;
    }
    const gateways=placeGateways(candidates,nodes,rangeKm);
    const cost=totals(nodes,gateways);
    return {nodes,gateways,cost,budget,rangeKm,objective};
  }

  function makeOptimizerMap(data){
    const el=document.getElementById('optimizer-map');if(!el||!window.L)return null;
    const b=data.bounds;
    const map=L.map(el,{zoomControl:true,scrollWheelZoom:true}).fitBounds([[b.minLat,b.minLon],[b.maxLat,b.maxLon]],{padding:[18,18]});
    const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    let worldCover=null;
    try{
      worldCover=L.tileLayer.wms('https://services.terrascope.be/wms/v2',{
        layers:'WORLDCOVER_2021_MAP',format:'image/png',transparent:true,opacity:.42,
        attribution:'© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021)'
      });
      worldCover.addTo(map);
      L.control.layers({'OpenStreetMap':osm},{'WorldCover 2021 (visual)':worldCover},{collapsed:true}).addTo(map);
    }catch(e){}
    if(window.ResizeObserver){const ro=new ResizeObserver(()=>map.invalidateSize({pan:false}));ro.observe(el);}
    return {map,worldCover,nodeLayer:L.layerGroup().addTo(map),gatewayLayer:L.layerGroup().addTo(map),linkLayer:L.layerGroup().addTo(map)};
  }

  function drawResult(mapState,result){
    if(!mapState)return;
    const {map,nodeLayer,gatewayLayer,linkLayer}=mapState;
    nodeLayer.clearLayers();gatewayLayer.clearLayers();linkLayer.clearLayers();
    const roleColor={RS:'#5b4f81',FU:'#2f765e',WX:'#477aa0',AQ:'#b65b33'};
    result.nodes.forEach((n,i)=>{
      const icon=L.divIcon({className:'plan-leaflet-icon',html:'<span class="opt-node" style="background:'+roleColor[n.role]+'">'+ROLE[n.role].short[0]+String(i+1)+'</span>',iconSize:[34,34],iconAnchor:[17,17]});
      L.marker([n.p.lat,n.p.lon],{icon}).addTo(nodeLayer).bindTooltip(
        ROLE[n.role].label+' · utility '+Math.round(n.utility)+'<br>'+
        (n.p.landcover||'WorldCover unavailable')+' · road '+(Number.isFinite(n.p.roadDistanceKm)?Math.round(n.p.roadDistanceKm*1000)+' m':'—')
      );
    });
    result.gateways.forEach((g,gi)=>{
      const icon=L.divIcon({className:'plan-leaflet-icon',html:'<span class="opt-gateway">GW'+(gi+1)+'</span>',iconSize:[42,42],iconAnchor:[21,21]});
      L.marker([g.p.lat,g.p.lon],{icon}).addTo(gatewayLayer).bindTooltip(g.id+' · radio planning proxy');
      L.circle([g.p.lat,g.p.lon],{radius:result.rangeKm*1000,color:'#6c5b3d',weight:1,dashArray:'5 5',fillOpacity:.025}).addTo(gatewayLayer);
      g.coverIdx.forEach(idx=>{
        const n=result.nodes[idx];
        if(n)L.polyline([[g.p.lat,g.p.lon],[n.p.lat,n.p.lon]],{color:'#8d7b58',weight:1,opacity:.38,dashArray:'3 5'}).addTo(linkLayer);
      });
    });
    const pts=[...result.nodes.map(n=>[n.p.lat,n.p.lon]),...result.gateways.map(g=>[g.p.lat,g.p.lon])];
    if(pts.length)map.fitBounds(L.latLngBounds(pts).pad(.16),{padding:[18,18]});
  }

  function renderBOQ(result){
    const counts={RS:0,FU:0,WX:0,AQ:0};result.nodes.forEach(n=>counts[n.role]++);
    const componentQty={superStation:counts.RS,wind:counts.FU+counts.WX,tempRh:counts.FU+counts.WX,pm:counts.FU+counts.AQ};
    const body=document.getElementById('boq-body');if(body){
      body.replaceChildren();
      for(const [key,q] of Object.entries(componentQty)){
        if(!q)continue;
        const item=QUOTE_PRICES[key],tr=document.createElement('tr');
        tr.innerHTML='<td><b>'+item.sku+'</b><small>'+item.name+'</small></td><td>'+q+'</td><td>'+money(item.unit)+'</td><td>'+money(q*item.unit)+'</td><td>QT2609099</td>';
        body.appendChild(tr);
      }
      const install=getNum('opt-install-cost',0),gwCost=getNum('opt-gateway-cost',0);
      if(install){
        const tr=document.createElement('tr');tr.innerHTML='<td><b>INSTALL-ALLOWANCE</b><small>Planning allowance per sensor site · ไม่ใช่ราคาจาก quotation</small></td><td>'+result.nodes.length+'</td><td>'+money(install)+'</td><td>'+money(install*result.nodes.length)+'</td><td>Editable assumption</td>';body.appendChild(tr);
      }
      const tr=document.createElement('tr');tr.innerHTML='<td><b>GATEWAY-ALLOWANCE</b><small>Gateway / backhaul planning allowance · ไม่ใช่ราคาจาก quotation</small></td><td>'+result.gateways.length+'</td><td>'+money(gwCost)+'</td><td>'+money(gwCost*result.gateways.length)+'</td><td>Editable assumption</td>';body.appendChild(tr);
    }
    setText('boq-ex',money(result.cost.ex)+' บาท');
    setText('boq-vat',money(result.cost.vat)+' บาท');
    setText('boq-total',money(result.cost.total)+' บาท');
    setText('boq-budget-left',money(Math.max(0,result.budget-result.cost.total))+' บาท');
    setText('opt-counts','Super '+counts.RS+' · Fusion '+counts.FU+' · Weather '+counts.WX+' · AQ '+counts.AQ);
    setText('opt-gateway-count',result.gateways.length);
    setText('opt-total-cost',money(result.cost.total));
    setText('opt-node-count',result.nodes.length);
  }

  function renderSites(result){
    const body=document.getElementById('opt-sites-body');if(!body)return;
    body.replaceChildren();
    result.nodes.forEach((n,i)=>{
      const g=result.gateways.find(g=>g.coverIdx.includes(i));
      const tr=document.createElement('tr');
      tr.innerHTML='<td><b>S'+String(i+1).padStart(2,'0')+'</b></td><td>'+ROLE[n.role].label+'</td><td>'+n.p.lat.toFixed(6)+', '+n.p.lon.toFixed(6)+'</td><td>'+Math.round(n.utility)+'</td><td>'+(n.p.landcover||'—')+'</td><td>'+(Number.isFinite(n.p.roadDistanceKm)?Math.round(n.p.roadDistanceKm*1000)+' m':'—')+'</td><td>'+(g?g.id:'unassigned')+'</td>';
      body.appendChild(tr);
    });
  }

  function exportCSV(result){
    const rows=[['Type','ID','Role/SKU','Latitude','Longitude','Qty','Unit Price THB','Subtotal THB','Note']];
    result.nodes.forEach((n,i)=>rows.push(['Site','S'+String(i+1).padStart(2,'0'),ROLE[n.role].label,n.p.lat.toFixed(6),n.p.lon.toFixed(6),'','','',n.p.landcover||'']));
    const counts={RS:0,FU:0,WX:0,AQ:0};result.nodes.forEach(n=>counts[n.role]++);
    const componentQty={superStation:counts.RS,wind:counts.FU+counts.WX,tempRh:counts.FU+counts.WX,pm:counts.FU+counts.AQ};
    for(const [k,q] of Object.entries(componentQty)){
      if(!q)continue;const x=QUOTE_PRICES[k];rows.push(['BOQ','',x.sku,'','',''+q,''+x.unit,''+(q*x.unit),'QT2609099']);
    }
    result.gateways.forEach(g=>rows.push(['Gateway',g.id,'Planning proxy',g.p.lat.toFixed(6),g.p.lon.toFixed(6),'1',''+getNum('opt-gateway-cost',0),''+getNum('opt-gateway-cost',0),'Editable allowance']));
    const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='forest-watch-v5-boq.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function init(data){
    const root=document.getElementById('budget-optimizer');if(!root)return;
    status('opt-worldcover-status','กำลังอ่าน WorldCover 2021 COG…');
    status('opt-osm-status','กำลังอ่าน OSM roads / mapped towers…');
    status('opt-radio-status','รอข้อมูล candidate…');
    const candidates=data.candidates.map((p,i)=>({...p,index:i}));
    normalizeElevation(candidates);
    let wcOK=false,osmOK=false,osm={segments:[],masts:[],barriers:[],support:[]};
    await Promise.all([
      enrichWorldCover(candidates).then(()=>{wcOK=true;status('opt-worldcover-status','WorldCover COG พร้อม · ใช้ class จริงใน optimizer','ready');}).catch(err=>{
        candidates.forEach(p=>{p.landcover=null;p.fuelScore=50;p.landcoverSiteScore=50;});
        status('opt-worldcover-status','WorldCover COG โหลดไม่ได้ · ใช้ค่า neutral 50 และไม่อ้างว่าเป็น land-cover analysis','error');
      }),
      fetchOSM(data.bounds).then(x=>{osm=x;osmOK=true;enrichAccess(candidates,osm);status('opt-osm-status','OSM พร้อม · '+osm.segments.length.toLocaleString()+' road segments · '+(osm.graphNodeCount||0).toLocaleString()+' route nodes · '+osm.support.length+' support points','ready');}).catch(err=>{
        candidates.forEach(p=>{p.roadDistanceKm=null;p.roadType='—';p.accessScore=50;p.backhaulScore=45;});
        status('opt-osm-status','OSM/Overpass โหลดไม่ได้ · access score เป็น neutral 50','error');
      })
    ]);
    if(!osmOK)candidates.forEach(p=>{if(!Number.isFinite(p.accessScore))p.accessScore=50;if(!Number.isFinite(p.backhaulScore))p.backhaulScore=45;});
    candidates.forEach(p=>p.v5Score=finalCandidateScore(p));
    status('opt-radio-status','Gateway ใช้ elevation + OSM access + coverage proxy · ไม่ใช่ RF/LOS model','ready');
    setText('opt-data-summary',(data.demLoaded?'DEM ✓':'DEM fallback')+' · '+(wcOK?'WorldCover ✓':'WorldCover fallback')+' · '+(osmOK?'OSM ✓':'OSM fallback'));
    const mapState=makeOptimizerMap(data);
    let latest=null;
    function run(){
      latest=optimize(candidates);drawResult(mapState,latest);renderBOQ(latest);renderSites(latest);
      const budgetPct=latest.budget?Math.round(latest.cost.total/latest.budget*100):0;
      setText('opt-budget-use',budgetPct+'% ของงบรวม VAT');
      root.dataset.ready='true';
      const payload={data,candidates,osm,result:latest,wcOK,osmOK,prices:QUOTE_PRICES};
      window.ForestWatchOptimizerV5State=payload;
      window.dispatchEvent(new CustomEvent('forestwatch:v5-ready',{detail:payload}));
    }
    document.getElementById('opt-run')?.addEventListener('click',run);
    ['opt-budget','opt-radio-range','opt-gateway-cost','opt-install-cost','opt-objective'].forEach(id=>{
      document.getElementById(id)?.addEventListener('change',run);
    });
    document.getElementById('opt-export')?.addEventListener('click',()=>{if(latest)exportCSV(latest);});
    window.ForestWatchOptimizerV5={data,candidates,osm,run,getResult:()=>latest,prices:QUOTE_PRICES};
    run();
  }

  let started=false;
  function start(data){if(started||!data)return;started=true;init(data);}
  if(window.ForestWatchNetworkV4)start(window.ForestWatchNetworkV4);
  window.addEventListener('forestwatch:v4-ready',e=>start(e.detail),{once:true});
})();