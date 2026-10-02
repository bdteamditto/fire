// Run with: node tests/point-plan.cjs
// Browser-library stubs exercise the real selection, publication and renderer code.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

class Element {
  constructor() {
    this.dataset = {}; this.style = {}; this.children = []; this.checked = true;
    this.value = 'ALL'; this.listeners = {}; this.classList = { toggle() {} };
  }
  setAttribute(key, value) { this[key] = value; }
  removeAttribute(key) { delete this[key]; }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  querySelectorAll() { return []; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  get options() { return this.children; }
  get innerHTML() { return this._html || ''; }
  set innerHTML(value) { this._html = value; if (value === '') this.children = []; }
}

function fixture({ cachedTerrain = null, leaflet = true, elevationReady = false, randomValues = [] } = {}) {
  const elements = new Map([...read('wildfire-v1/index.html').matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], new Element()]));
  const buttons = ['all', 'sensors', 'hotspots', 'all', 'sensors', 'hotspots'].map(mode => {
    const element = new Element(); element.dataset.pointView = mode; return element;
  });
  const selects = [elements.get('op-sensor-type'), elements.get('plan-sensor-type')];
  elements.get('op-target').value = 'H-01';
  elements.get('op-profile').value = '4x4';
  const document = {
    getElementById: id => elements.get(id) || null,
    createElement: () => new Element(),
    querySelectorAll: selector => selector === '[data-point-view]' ? buttons :
      selector === '[data-sensor-type]' ? selects : [],
    querySelector: selector => selector === '[data-point-count="2d"]' ? elements.get('plan-point-count') : null
  };
  const groups = [];
  let map;
  const layer = (options = {}) => ({
    options, addTo(target) { target.addLayer(this); return this; }, on() { return this; },
    bindTooltip(text) { this.tooltip = text; return this; }, bindPopup() { return this; },
    getLatLng() { return this.coord; }, openTooltip() {}
  });
  const L = {
    map() {
      map = { layers: new Set(), addLayer(item) { this.layers.add(item); return this; },
        removeLayer(item) { this.layers.delete(item); return this; }, hasLayer(item) { return this.layers.has(item); },
        fitBounds() { return this; }, setView() { return this; }, invalidateSize() {} };
      return map;
    },
    tileLayer: () => layer(), control: { layers: () => ({ addTo() { return this; } }) },
    layerGroup() {
      const group = { children: [], addTo(target) { target.addLayer(this); return this; },
        addLayer(child) { this.children.push(child); return this; }, clearLayers() { this.children = []; },
        getLayers() { return this.children; } };
      groups.push(group); return group;
    },
    divIcon: options => ({ options }),
    marker: (coord, options) => Object.assign(layer(options), { coord }),
    circleMarker: (coord, options) => Object.assign(layer(options), { coord }),
    polygon: () => layer(), polyline: () => layer(), latLngBounds: () => ({ pad() { return this; } }),
    geoJSON: (data, options) => Object.assign(layer(options), { data })
  };
  const cache = new Map();
  const store = {
    getItem: key => cache.get(key) || (key.includes(':dem:') && cachedTerrain ? JSON.stringify(cachedTerrain) : null),
    setItem: (key, value) => cache.set(key, value)
  };
  const listeners = new Map();
  const window = {
    L: leaflet ? L : undefined, localStorage: store,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach(fn => fn(event)); }
  };
  class CustomEvent { constructor(type, args) { this.type = type; this.detail = args.detail; } }
  const fetch = async url => {
    if (elevationReady && url.includes('/v1/elevation')) {
      const lats = new URL(url).searchParams.get('latitude').split(',').map(Number);
      return { ok: true, json: async () => ({ elevation: lats.map((lat, index) => 400 + lat * 10 + (index % 5 === 0 ? 20 : 0)) }) };
    }
    return { ok: false, status: 503 };
  };
  const mockMath = Object.create(Math);
  mockMath.random = () => randomValues.length ? randomValues.shift() : .5;
  const context = vm.createContext({ window, document, L, localStorage: store, CustomEvent, AbortController,
    fetch, setTimeout, clearTimeout, Date, Intl, console, Math: mockMath });
  vm.runInContext(read('wildfire-v1/point-filters.js'), context);
  const source = read('wildfire-v1/network-plan.js');
  const anchor = 'const cachedTerrain=readTerrainCache();';
  assert.ok(source.includes(anchor), 'Network test export anchor exists');
  vm.runInContext(source.replace(anchor, 'window.__networkTest={assignRoles,createGrid,refreshTerrain};' + anchor), context);
  return { window, context, elements, groups, buttons, selects, get map() { return map; } };
}

function terrainRenderer(f) {
  vm.runInContext(read('wildfire-v1/presentation-data.js'), f.context);
  const source = read('wildfire-v1/terrain3d.js');
  const anchor = source.lastIndexOf('  bindControls();');
  assert.ok(anchor > 0, 'Terrain test export anchor exists');
  // Keep production control/filter handlers; skip actual WebGL/Leaflet map creation.
  const testEnd = `
    bindControls();
    window.ForestWatchPointFilters?.subscribe(()=>{if(app.state)syncLayerToggles();});
    window.__terrainTest={app,nodeFC,hotspotFC,llText,currentTarget,updateOperationalData,setCoordinatePoint,randomizeFireTarget,syncLayerToggles};
  })();`;
  vm.runInContext(source.slice(0, anchor) + testEnd, f.context);
  return f.window.__terrainTest;
}

function markerAttributes(marker) {
  const html = marker.options.icon.options.html;
  return Object.fromEntries([...html.matchAll(/data-([a-z-]+)="([^"]+)"/g)].map(match => [match[1], match[2]]));
}
const identities = points => points.map(p => ({ id: p.id, lat: p.lat, lon: p.lon, roleCode: p.roleCode }));
const roleCounts = points => Object.fromEntries(['RS', 'FU', 'RW', 'VW', 'BW', 'AQ']
  .map(code => [code, points.filter(p => p.roleCode === code).length]));

async function main() {
  const f = fixture(), model = f.window.ForestWatchNetworkV4;
  const [heat, blind, source, candidates, refs] = f.groups;
  const filters = f.window.ForestWatchPointFilters;
  assert.equal(model.selected.length, 21);
  assert.equal(candidates.children.length, 21); assert.equal(refs.children.length, 6);
  for (const marker of candidates.children) {
    const data = markerAttributes(marker), p = model.selected.find(p => p.id === data['site-id']);
    assert.ok(p); assert.equal(Number(data.lat), p.lat); assert.equal(Number(data.lon), p.lon);
    assert.equal(data['role-code'], p.roleCode);
  }
  for (const marker of refs.children) {
    const data = markerAttributes(marker), p = (data['role-code'] === 'EX' ? model.existing : model.historicalHotspots)
      .find(p => p.id === data['site-id']);
    assert.ok(p); assert.equal(Number(data.lat), p.lat); assert.equal(Number(data.lon), p.lon);
  }
  const original = JSON.stringify(model.selected), tableCount = f.elements.get('plan-table-body').children.length;
  const sectorCards = f.elements.get('plan-zone-summary').innerHTML, replay = f.elements.get('plan-replay-cards').innerHTML;
  const T = terrainRenderer(f), payload = f.window.ForestWatchPresentationState;
  T.updateOperationalData(payload);
  const expected = identities(model.selected);
  const fc = T.nodeFC(payload.result);
  assert.deepEqual(plain(fc.features.map(feature => ({ id: feature.properties.id,
    lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0], roleCode: feature.properties.roleCode }))), plain(expected));
  assert.deepEqual(JSON.parse(f.elements.get('operational-3d-map')['data-sensors-points']), plain(expected));
  for (const feature of fc.features) {
    const p = model.selected.find(p => p.id === feature.properties.id);
    assert.equal(feature.properties.pkg, p.pkg); assert.equal(feature.properties.terrain, p.terrainInterpretation);
    assert.equal(feature.properties.role, p.role);
  }
  for (const p of model.selected) {
    f.elements.get('op-target').value = p.id;
    assert.deepEqual(plain(T.currentTarget()), { id: p.id, lat: p.lat, lon: p.lon, type: 'sensor' });
  }
  assert.equal(T.llText([101.09, 19.4]), '19.400000, 101.090000 (WGS84)');
  for (const type of ['EX', 'RS', 'FU', 'RW', 'VW', 'BW', 'AQ']) {
    // Exercise the real shared dropdown event and both synchronized controls.
    f.selects[0].value = type; f.selects[0].listeners.change();
    const count = model.selected.filter(p => p.roleCode === type).length;
    assert.equal(f.selects[1].value, type); assert.equal(candidates.children.length, count);
    assert.equal(refs.children.length, type === 'EX' ? 3 : 0);
    assert.equal(T.nodeFC(payload.result).features.length, count); assert.equal(T.hotspotFC(payload.data).features.length, 0);
    assert.equal(T.currentTarget().id, 'N21');
    assert.equal(f.map.hasLayer(heat), false); assert.equal(f.map.hasLayer(blind), false); assert.equal(f.map.hasLayer(source), false);
    assert.equal(f.elements.get('plan-heat').checked, true); assert.equal(f.elements.get('plan-heat').disabled, true);
    assert.equal(f.elements.get('plan-table-body').children.length, tableCount);
    assert.equal(f.elements.get('plan-zone-summary').innerHTML, sectorCards); assert.equal(f.elements.get('plan-replay-cards').innerHTML, replay);
    assert.equal(JSON.stringify(f.window.ForestWatchNetworkV4.selected), original);
  }
  f.buttons[2].listeners.click();
  assert.equal(candidates.children.length, 0); assert.equal(refs.children.length, 3);
  assert.equal(T.nodeFC(payload.result).features.length, 0); assert.equal(T.hotspotFC(payload.data).features.length, 3);
  f.elements.get('plan-blind').checked = false; f.buttons[0].listeners.click();
  assert.equal(candidates.children.length, 21); assert.equal(refs.children.length, 6);
  assert.equal(f.map.hasLayer(heat), true); assert.equal(f.map.hasLayer(blind), false); assert.equal(f.map.hasLayer(source), true);
  assert.equal(f.elements.get('plan-heat').disabled, false);
  assert.equal(f.elements.get('plan-point-count').textContent, 'แสดง 27 จุด · เซนเซอร์ 24 · จุดไฟ 3');
  f.elements.get('op-target').value = 'N01'; T.app.currentRoute = { dummy: true };
  const revision = T.app.routeRevision; T.updateOperationalData(payload);
  assert.ok(T.app.currentRoute); assert.equal(T.app.routeRevision, revision);
  const changed = { ...payload, result: { ...payload.result, nodes: payload.result.nodes.map(n => ({ ...n,
    p: { ...n.p, lat: n.p.lat + (n.id === 'N01' ? .001 : 0) } })) } };
  T.updateOperationalData(changed); assert.equal(T.app.currentRoute, null); assert.ok(T.app.routeRevision > revision);
  assert.equal(Number(f.elements.get('op-target-lat').value), Number(changed.result.nodes[0].p.lat.toFixed(6)));

  // Compare role repair with the retained original assignment, using contradictory relief.
  const originalPlan = read('plan.js');
  const roleFunction = originalPlan.slice(originalPlan.indexOf('  function assignRoles(points)'), originalPlan.indexOf('  function terrainText'));
  vm.runInContext('window.__originalRoles=' + roleFunction.trim() + ';', f.context);
  const points = plain(model.selected).map((p, i) => ({ ...p, terrainScore: 100 - i, smokeScore: 100 - i,
    riskScore: 100 - i, boundaryScore: 100 - i, coverageScore: 100 - i,
    ridgeScore: i < 7 ? 100 : 30, valleyScore: i >= 7 && i < 10 ? 100 : 10,
    relief: i < 7 ? -20 : i < 10 ? 20 : i % 2 ? 20 : -20 }));
  const old = plain(points), repaired = plain(points);
  f.window.__originalRoles(old); f.window.__networkTest.assignRoles(repaired);
  assert.deepEqual(repaired.map(p => [p.id, p.lat, p.lon]), points.map(p => [p.id, p.lat, p.lon]));
  assert.deepEqual(roleCounts(repaired), roleCounts(old));
  assert.deepEqual(roleCounts(repaired), { RS: 1, FU: 5, RW: 4, VW: 3, BW: 3, AQ: 5 });
  const contradictions = data => data.filter(p => p.roleCode === 'RW' && p.relief < -9 || p.roleCode === 'VW' && p.relief > 9).length;
  assert.ok(contradictions(repaired) < contradictions(old));

  const cacheGrid = plain(f.window.__networkTest.createGrid()).map((p, i) => ({ ...p, elev: 400 + i,
    slope: 8, aspect: 120, relief: i % 2 ? 20 : -20 }));
  const cached = fixture({ leaflet: false, cachedTerrain: { version: 1, savedAt: Date.now() - 3600000, grid: cacheGrid } });
  const unavailable = fixture({ leaflet: false });
  const latest = JSON.stringify(cached.window.ForestWatchNetworkV4.selected), timestamp = cached.window.ForestWatchNetworkV4.updatedAt;
  assert.equal(cached.window.ForestWatchNetworkV4.demLoaded, true);
  assert.equal(cached.window.ForestWatchNetworkV4.selected.length, 21);
  assert.equal(unavailable.window.ForestWatchNetworkV4.selected.length, 21);
  await tick();
  assert.equal(cached.window.ForestWatchNetworkV4.demStatus, 'cached');
  assert.equal(JSON.stringify(cached.window.ForestWatchNetworkV4.selected), latest);
  assert.equal(cached.window.ForestWatchNetworkV4.updatedAt, timestamp);
  assert.equal(unavailable.window.ForestWatchNetworkV4.demStatus, 'unavailable');
  assert.equal(unavailable.window.ForestWatchNetworkV4.selected.length, 21);

  // A successful terrain refresh updates hidden layer contents without displaying them.
  const live = fixture({ elevationReady: true }), liveT = terrainRenderer(live);
  liveT.updateOperationalData(live.window.ForestWatchPresentationState);
  live.window.ForestWatchPointFilters.set('sensors', 'VW');
  await tick();
  const latestModel = live.window.ForestWatchNetworkV4;
  assert.equal(latestModel.demStatus, 'ready'); assert.equal(latestModel.selected.length, 21);
  assert.equal(live.groups[3].children.length, latestModel.selected.filter(p => p.roleCode === 'VW').length);
  for (const overlay of live.groups.slice(0, 3)) { assert.equal(live.map.hasLayer(overlay), false); assert.ok(overlay.children.length > 0); }
  for (const id of ['plan-heat', 'plan-blind', 'plan-source']) { assert.equal(live.elements.get(id).checked, true); assert.equal(live.elements.get(id).disabled, true); }
  liveT.updateOperationalData(live.window.ForestWatchPresentationState);
  assert.deepEqual(plain(liveT.nodeFC(live.window.ForestWatchPresentationState.result).features.map(feature => ({ id: feature.properties.id,
    lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0], roleCode: feature.properties.roleCode }))),
    plain(identities(latestModel.selected.filter(p => p.roleCode === 'VW'))));
  live.window.ForestWatchPointFilters.set('all');
  assert.equal(live.groups[3].children.length, 21);
  for (const overlay of live.groups.slice(0, 3)) assert.equal(live.map.hasLayer(overlay), true);

  // Auto fire targets work from published planning bounds even while OSM/DEM are offline.
  const auto = fixture({ randomValues: [0, 1 - Number.EPSILON, .25, .75, .25, .75] }), autoT = terrainRenderer(auto);
  const autoPayload = auto.window.ForestWatchPresentationState;
  autoT.updateOperationalData(autoPayload);
  assert.equal(autoPayload.osmOK, false); assert.equal(autoPayload.data.selected.length, 21);
  const bounds = autoPayload.data.bounds, sourceData = new Map(), visibility = new Map(), cameraMoves = [];
  autoT.app.map = {
    getSource: id => ({ setData: data => sourceData.set(id, plain(data)) }),
    getLayer: () => ({}), setLayoutProperty: (id, key, value) => visibility.set(id, value),
    flyTo() {}, easeTo: options => cameraMoves.push(options), fitBounds() {}, getZoom: () => 14
  };
  const manualStart = [bounds.minLat + .001, bounds.minLon + .001];
  autoT.setCoordinatePoint('start', manualStart);
  autoT.setCoordinatePoint('target', [(bounds.minLat + bounds.maxLat) / 2, (bounds.minLon + bounds.maxLon) / 2]);
  const beforeAuto = JSON.stringify(autoPayload.data), startFields = ['lat', 'lon'].map(axis => auto.elements.get('op-start-' + axis).value);
  autoT.app.currentRoute = { target: autoT.currentTarget(), dummy: true }; autoT.app.pickMode = 'target';
  const oldRevision = autoT.app.routeRevision;
  const first = autoT.randomizeFireTarget();
  function assertFireTarget(coord) {
    assert.equal(coord.length, 2); assert.ok(coord.every(Number.isFinite));
    assert.ok(coord[0] >= bounds.minLat && coord[0] <= bounds.maxLat);
    assert.ok(coord[1] >= bounds.minLon && coord[1] <= bounds.maxLon);
    const insetLat = (bounds.maxLat - bounds.minLat) * .05, insetLon = (bounds.maxLon - bounds.minLon) * .05;
    assert.ok(coord[0] >= bounds.minLat + insetLat - .0000005 && coord[0] <= bounds.maxLat - insetLat + .0000005);
    assert.ok(coord[1] >= bounds.minLon + insetLon - .0000005 && coord[1] <= bounds.maxLon - insetLon + .0000005);
    coord.forEach(value => assert.equal(value, Number(value.toFixed(6))));
    assert.deepEqual(plain(autoT.app.customTarget), plain(coord));
    assert.equal(auto.elements.get('op-target').value, 'CUSTOM');
    assert.deepEqual(plain(autoT.currentTarget()), { id: 'Custom fire point', lat: coord[0], lon: coord[1], type: 'fire' });
    ['lat', 'lon'].forEach((axis, index) => assert.equal(Number(auto.elements.get('op-target-' + axis).value), Number(coord[index].toFixed(6))));
    assert.deepEqual(plain(autoT.app.manualStart), manualStart); assert.equal(autoT.app.pickMode, null);
    assert.deepEqual(['lat', 'lon'].map(axis => auto.elements.get('op-start-' + axis).value), startFields);
    assert.equal(autoT.app.currentRoute, null); assert.equal(auto.elements.get('op-route-distance').textContent, '—');
    for (const id of ['route', 'egress', 'offroad']) assert.equal(sourceData.get(id).features.length, 0);
    const chosen = sourceData.get('route-points').features;
    assert.equal(chosen.length, 2);
    assert.deepEqual(chosen.find(p => p.properties.kind === 'start').geometry.coordinates, [manualStart[1], manualStart[0]]);
    assert.deepEqual(chosen.find(p => p.properties.kind === 'target').geometry.coordinates, [coord[1], coord[0]]);
    assert.equal(JSON.stringify(autoPayload.data), beforeAuto);
  }
  assertFireTarget(first); assert.ok(autoT.app.routeRevision > oldRevision);
  assert.deepEqual(plain(cameraMoves[0].center), [first[1], first[0]]); assert.equal(cameraMoves[0].zoom, undefined);
  autoT.app.currentRoute = { dummy: true };
  assert.equal(typeof auto.elements.get('op-auto-target')?.listeners.click, 'function');
  auto.elements.get('op-auto-target').listeners.click();
  const second = autoT.app.customTarget;
  assertFireTarget(second); assert.notDeepEqual(plain(second), plain(first));
  // Repeated RNG values still produce a new coordinate after rounding.
  const third = autoT.randomizeFireTarget();
  assertFireTarget(third); assert.notDeepEqual(plain(third), plain(second));
  for (const mode of ['sensors', 'hotspots', 'all']) {
    auto.window.ForestWatchPointFilters.set(mode, mode === 'sensors' ? 'RW' : 'all');
    assert.equal(auto.window.ForestWatchPointFilters.get().mode, mode);
    assert.equal(visibility.get('route-points'), 'visible', 'Explicit custom target stays visible in each point filter');
    assert.deepEqual(plain(autoT.app.customTarget), plain(third));
  }
  auto.elements.get('op-route-layer').checked = false; autoT.syncLayerToggles();
  assert.equal(visibility.get('route-points'), 'none');
  auto.elements.get('op-route-layer').checked = true; autoT.syncLayerToggles();
  assert.equal(visibility.get('route-points'), 'visible');
  // Leaflet fallback uses the same custom-point rule, and retains the route-layer switch.
  autoT.app.flatMap = {
    layers: new Set(), addLayer(item) { this.layers.add(item); return this; },
    removeLayer(item) { this.layers.delete(item); return this; }, hasLayer(item) { return this.layers.has(item); }
  };
  autoT.setCoordinatePoint('target', third);
  for (const mode of ['sensors', 'hotspots', 'all']) {
    auto.window.ForestWatchPointFilters.set(mode, mode === 'sensors' ? 'RW' : 'all');
    assert.equal(autoT.app.flatMap.hasLayer(autoT.app.flatLayers.get('route-points')), true);
    assert.equal(auto.window.ForestWatchPointFilters.get().mode, mode);
  }
  auto.elements.get('op-route-layer').checked = false; autoT.syncLayerToggles();
  assert.equal(autoT.app.flatMap.hasLayer(autoT.app.flatLayers.get('route-points')), false);
  auto.elements.get('op-route-layer').checked = true;
  auto.window.ForestWatchPointFilters.set('sensors', 'RW'); auto.elements.get('op-target').value = 'H-01';
  autoT.syncLayerToggles(); assert.equal(visibility.get('route-points'), 'none');
  assert.equal(autoT.app.flatMap.hasLayer(autoT.app.flatLayers.get('route-points')), false);
  auto.elements.get('op-target').value = 'CUSTOM'; autoT.syncLayerToggles();
  assert.equal(visibility.get('route-points'), 'visible');
  assert.equal(autoT.app.flatMap.hasLayer(autoT.app.flatLayers.get('route-points')), true);
  const validState = autoT.app.state, validRevision = autoT.app.routeRevision;
  autoT.app.state = { ...validState, data: { ...validState.data, bounds: { ...bounds, maxLat: bounds.minLat } } };
  assert.equal(autoT.randomizeFireTarget(), null);
  assert.equal(auto.elements.get('op-status').dataset.state, 'error');
  assert.equal(autoT.app.routeRevision, validRevision); assert.deepEqual(plain(autoT.app.customTarget), plain(third));
  autoT.app.state = null; assert.equal(autoT.randomizeFireTarget(), null);
  assert.equal(autoT.app.routeRevision, validRevision); assert.deepEqual(plain(autoT.app.manualStart), manualStart);
  autoT.app.state = validState;
  await tick();
  assert.equal(auto.window.ForestWatchNetworkV4.demStatus, 'unavailable');
  assert.equal(auto.window.ForestWatchNetworkV4.selected.length, 21);
  assert.deepEqual(plain(autoT.app.customTarget), plain(third));
  console.log('PASS: exact shared N21/EX/H coordinates and metadata; every point filter; route target identity/invalidation; role-repair quotas; cached DEM failure; no-Leaflet bootstrap; hidden-overlay DEM refresh; bounded repeated Auto fire coordinates and preserved manual start offline');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
