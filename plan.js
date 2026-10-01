'use strict';
(() => {
  const center = [19.4027222222, 101.091000];

  const proposed = [
    {id:'N1',phase:'Core',title:'East / ENE Ridge Watch',terrain:'สันเขา / upper slope ฝั่ง E/NE',role:'ดักลมและควันก่อนข้ามสันเขาเข้าสู่พื้นที่หลัก',pkg:'Wind speed + Wind direction + T/RH + PM2.5/PM10',lat:19.408233,lon:101.103530,km:1.45},
    {id:'N2',phase:'Core',title:'West / WSW Drainage Watch',terrain:'แนวหุบ / drainage ฝั่ง W/SW',role:'จับ downslope wind และควันที่ไหลสะสมตามหุบก่อนเข้าสู่พื้นที่กลาง',pkg:'Wind speed + Wind direction + PM2.5/PM10 + CO / multi-gas',lat:19.397591,lon:101.079335,km:1.35},
    {id:'N3',phase:'Core',title:'NW Saddle / Ridge Watch',terrain:'คอเขา / saddle ฝั่ง NW',role:'ปิด blind spot ฝั่ง NW และจับลมที่ถูกเร่งผ่านช่องเขา',pkg:'Wind speed + Wind direction + T/RH + PM2.5/PM10',lat:19.412579,lon:101.080549,km:1.55},
    {id:'N4',phase:'Expansion',title:'South / SE Ridge–Slope',terrain:'ไหล่เขา / ridge-slope ฝั่ง S/SE',role:'เพิ่ม coverage ฝั่งใต้และจับลมกลับทิศหรือควันที่อ้อมตาม slope',pkg:'Wind speed + Wind direction + T/RH',lat:19.391311,lon:101.096641,km:1.40},
    {id:'N5',phase:'Expansion',title:'Valley Mouth / Community Inlet',terrain:'ปากหุบก่อนเข้าสู่ชุมชน',role:'เป็นด่านหน้าจับ plume ที่ไหลเข้าชุมชนและช่วยเตือนก่อนถึงจุดกลาง',pkg:'Wind speed + Wind direction + PM2.5/PM10 + CO / multi-gas',lat:19.398338,lon:101.084361,km:0.85},
    {id:'N6',phase:'Expansion',title:'Outer East Downwind',terrain:'ปลายแนว E / downwind edge',role:'ตรวจว่าควันข้าม ridge แล้วเคลื่อนออกทางตะวันออกจริงหรือไม่',pkg:'Wind speed + Wind direction + PM2.5/PM10',lat:19.402721,lon:101.108639,km:1.85},
    {id:'N7',phase:'Expansion',title:'North High Ridge Reference',terrain:'สันสูงด้าน N / reference',role:'เป็น background wind reference แยก local turbulence ในหุบออกจากลมระดับสัน',pkg:'Wind speed + Wind direction + T/RH + Pressure',lat:19.417561,lon:101.091000,km:1.65}
  ];

  const existing = [
    {id:'EX-01',lat:19.44079157568766,lon:101.07016395055662,note:'พิกัดเดิมที่ผู้ใช้ให้มา',pkg:'Wind direction + PM + pollution'},
    {id:'EX-02',lat:19.451642,lon:101.055952,note:'พิกัดเดิมที่ผู้ใช้ให้มา',pkg:'Wind direction + PM + pollution'},
    {id:'EX-03',lat:19.432653,lon:101.091239,note:'ตำแหน่งประมาณจากจุดเขียวในแผนที่ที่แนบมา — รอพิกัดจริง',pkg:'Wind direction + PM + pollution'}
  ];

  const hotspots = [
    {id:'H-01',lat:19.402710,lon:101.090990,time:'2025/03/06 12:33',frp:10.55},
    {id:'H-02',lat:19.455640,lon:101.100100,time:'2025/03/06 13:01',frp:21.41},
    {id:'H-03',lat:19.394840,lon:101.022190,time:'2025/03/06 13:22',frp:2.59}
  ];

  const detail = {
    phase: document.getElementById('plan-phase'),
    kind: document.getElementById('plan-kind'),
    title: document.getElementById('plan-title'),
    role: document.getElementById('plan-role'),
    terrain: document.getElementById('plan-terrain'),
    pkg: document.getElementById('plan-package'),
    coord: document.getElementById('plan-coord'),
    distance: document.getElementById('plan-distance')
  };

  function setDetail(p, type='proposed') {
    if (!detail.title) return;
    if (type === 'proposed') {
      detail.phase.textContent = p.phase;
      detail.phase.className = 'status ' + (p.phase === 'Core' ? 'green' : 'amber');
      detail.kind.textContent = 'Candidate point';
      detail.title.textContent = p.id + ' · ' + p.title;
      detail.role.textContent = p.role;
      detail.terrain.textContent = p.terrain;
      detail.pkg.textContent = p.pkg;
      detail.coord.textContent = p.lat.toFixed(6) + ', ' + p.lon.toFixed(6);
      detail.distance.textContent = p.km.toFixed(2) + ' กม.';
      return;
    }
    if (type === 'existing') {
      const d = window.L ? (L.latLng(center).distanceTo([p.lat,p.lon]) / 1000).toFixed(2) : '—';
      detail.phase.textContent = 'Existing';
      detail.phase.className = 'status gray';
      detail.kind.textContent = p.id === 'EX-03' ? 'Approx. existing sensor' : 'Existing sensor';
      detail.title.textContent = p.id + ' · Sensor เดิม';
      detail.role.textContent = p.note;
      detail.terrain.textContent = 'Regional reference นอกวง local 2 กม.';
      detail.pkg.textContent = p.pkg;
      detail.coord.textContent = p.lat.toFixed(6) + ', ' + p.lon.toFixed(6);
      detail.distance.textContent = d + ' กม.';
      return;
    }
    detail.phase.textContent = 'Hotspot';
    detail.phase.className = 'status amber';
    detail.kind.textContent = 'VIIRS reference';
    detail.title.textContent = p.id + ' · Historical hotspot';
    detail.role.textContent = 'จุดความร้อนอ้างอิงจากภาพที่แนบมา ใช้ช่วยวางตำแหน่ง sensor ไม่ใช่เหตุสด';
    detail.terrain.textContent = 'Hotspot reference';
    detail.pkg.textContent = 'VIIRS · FRP ' + p.frp;
    detail.coord.textContent = p.lat.toFixed(6) + ', ' + p.lon.toFixed(6);
    detail.distance.textContent = p.time + ' (UTC+7)';
  }

  const tbody = document.getElementById('plan-table-body');
  if (tbody) {
    for (const p of proposed) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><b>'+p.id+'</b></td><td><span class="phase-pill '+(p.phase==='Core'?'core':'expansion')+'">'+p.phase+'</span></td><td>'+p.terrain+'</td><td>'+p.role+'</td><td>'+p.pkg+'</td><td><button type="button" data-plan="'+p.id+'">ดูจุด</button></td>';
      tbody.appendChild(tr);
    }
  }

  if (!window.L || !document.getElementById('network-map')) {
    const el = document.getElementById('network-map');
    if (el) el.innerHTML = '<div class="plan-map-fallback">โหลดแผนที่ออนไลน์ไม่ได้ แต่รายการ N1–N7 ยังใช้งานได้ด้านล่าง</div>';
    document.querySelectorAll('[data-plan]').forEach(btn => btn.onclick = () => setDetail(proposed.find(p => p.id === btn.dataset.plan)));
    setDetail(proposed[0]);
    return;
  }

  const map = L.map('network-map', {zoomControl:true, scrollWheelZoom:true});
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom:17,
    attribution:'Map data © OpenStreetMap contributors · Map style © OpenTopoMap'
  }).addTo(map);
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19,
    attribution:'© OpenStreetMap contributors'
  });
  L.control.layers({'ภูมิประเทศ / contour':topo,'OpenStreetMap':osm}, null, {collapsed:true}).addTo(map);

  const localCircle = L.circle(center, {
    radius:2000,
    color:'#123f34',
    weight:2,
    dashArray:'8 6',
    fillColor:'#7fb68e',
    fillOpacity:0.08
  }).addTo(map).bindTooltip('พื้นที่ออกแบบรัศมี 2 กม.');

  L.circleMarker(center, {
    radius:5, color:'#172e28', weight:2, fillColor:'#fff', fillOpacity:1
  }).addTo(map).bindTooltip('Project center · 19.402722, 101.091000', {direction:'top'});

  const proposedMarkers = new Map();
  for (const p of proposed) {
    const icon = L.divIcon({
      className:'plan-leaflet-icon',
      html:'<span class="map-sensor proposed">'+p.id+'</span>',
      iconSize:[38,38],
      iconAnchor:[19,19]
    });
    const m = L.marker([p.lat,p.lon], {icon}).addTo(map);
    m.bindTooltip(p.id+' · '+p.title, {direction:'top', offset:[0,-13]});
    m.on('click', () => setDetail(p,'proposed'));
    proposedMarkers.set(p.id,m);
  }

  for (const p of existing) {
    const icon = L.divIcon({
      className:'plan-leaflet-icon',
      html:'<span class="map-sensor existing">'+p.id.replace('EX-','E')+'</span>',
      iconSize:[38,38],
      iconAnchor:[19,19]
    });
    const m = L.marker([p.lat,p.lon], {icon}).addTo(map);
    m.bindTooltip(p.id+' · Sensor เดิม', {direction:'top', offset:[0,-13]});
    m.on('click', () => setDetail(p,'existing'));
  }

  for (const p of hotspots) {
    const icon = L.divIcon({
      className:'plan-leaflet-icon',
      html:'<span class="map-hotspot" aria-hidden="true">●</span>',
      iconSize:[28,28],
      iconAnchor:[14,14]
    });
    const m = L.marker([p.lat,p.lon], {icon}).addTo(map);
    m.bindTooltip('Hotspot '+p.time+' · FRP '+p.frp, {direction:'top', offset:[0,-10]});
    m.on('click', () => setDetail(p,'hotspot'));
  }

  const localBounds = localCircle.getBounds();
  const allLatLngs = [...proposed, ...existing, ...hotspots].map(p => [p.lat,p.lon]);
  const allBounds = L.latLngBounds(allLatLngs).pad(0.10);

  function focusLocal() { map.fitBounds(localBounds, {padding:[24,24]}); }
  function fitAll() { map.fitBounds(allBounds, {padding:[24,24]}); }

  document.getElementById('plan-focus')?.addEventListener('click', focusLocal);
  document.getElementById('plan-fit')?.addEventListener('click', fitAll);
  document.querySelectorAll('[data-plan]').forEach(btn => btn.addEventListener('click', () => {
    const p = proposed.find(x => x.id === btn.dataset.plan);
    if (!p) return;
    setDetail(p,'proposed');
    map.setView([p.lat,p.lon], 15);
    proposedMarkers.get(p.id)?.openTooltip();
    document.getElementById('network-map')?.scrollIntoView({behavior:'smooth',block:'center'});
  }));

  fitAll();
  setDetail(proposed[0]);
})();
