// Run with: node tests/journey-routing.cjs
// Exercise the actual V2 UI handlers and public map bridge using small deterministic OSM networks.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor(id = '') {
    this.id = id; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {};
    this.listeners = new Map(); this.checked = true; this.hidden = false; this.value = '';
    this.clientWidth = 700; this.clientHeight = 500; this.className = ''; this.textContent = '';
    this.classList = { toggle() {} };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(callback);
  }
  async emit(name) {
    await Promise.all((this.listeners.get(name) || []).map(callback => callback({ target: this, preventDefault() {}, stopPropagation() {} })));
  }
  querySelector(selector) { return this.descendants().find(child => selector === 'button' && child.tagName === 'button') || null; }
  querySelectorAll() { return []; }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  get options() { return this.children; }
  get innerHTML() { return this.html || ''; }
  set innerHTML(value) { this.html = value; if (value === '') this.children = []; }
  get outerHTML() { return '<button data-journey-kind="' + (this.dataset.journeyKind || '') + '">' + this.innerHTML + '</button>'; }
  getBoundingClientRect() { return { width: this.clientWidth, height: this.id === 'legend' ? 160 : this.clientHeight }; }
  focus() {}
}

function fixture({ segments, start, target, flat = false, deferElevation = false } = {}) {
  const elements = new Map([...read('wildfire-v2/index.html').matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]));
  assert.ok(elements.has('op-journey'), 'V2 must mount its journey itinerary');
  elements.get('op-target').value = 'H-01'; elements.get('op-profile').value = '4x4';
  const legend = new Element('legend'), events = [], windowListeners = new Map();
  const document = {
    getElementById: id => elements.get(id) || null,
    createElement(tag) { const element = new Element(); element.tagName = tag; return element; },
    querySelectorAll: () => [], querySelector: selector => selector.includes('op-map-key') ? legend : null
  };
  const markers = [], maps = [], pendingElevation = [];
  const markerElement = options => options.element || (() => {
    const outer = new Element(), button = new Element(); button.tagName = 'button';
    button.dataset.journeyKind = /data-journey-kind="([^"]+)"/.exec(options.icon?.html || '')?.[1];
    outer.append(button); return outer;
  })();
  class Marker {
    constructor(options) { this.element = markerElement(options); this.options = options; this.removed = false; markers.push(this); }
    setLngLat(point) { this.point = point; return this; }
    addTo(map) { this.map = map; map.layers?.add(this); return this; }
    getElement() { return this.element; }
    remove() { this.removed = true; this.map?.layers?.delete(this); }
    setPopup() { return this; }
    bindPopup() { return this; }
  }
  class MapStub {
    constructor(options) {
      this.sources = new Map(); this.styleLayers = new Map(); this.listeners = new Map(); this.layers = new Set(); this.frames = [];
      this.camera = { center: options.center || [101, 19], zoom: options.zoom || 12, pitch: options.pitch || 0 };
      for (const [id, source] of Object.entries(options.style?.sources || {})) this.sources.set(id, { data: source.data, setData(data) { this.data = data; } });
      for (const layer of options.style?.layers || []) this.styleLayers.set(layer.id, { ...layer });
      maps.push(this);
    }
    on(type, layerOrCallback, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push({ callback: callback || layerOrCallback, once: false }); return this;
    }
    once(type, callback) { this.on(type, callback); this.listeners.get(type).at(-1).once = true; }
    off(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.callback !== callback)); }
    emit(type) {
      for (const item of [...this.listeners.get(type) || []]) { if (item.once) this.off(type, item.callback); item.callback({ type }); }
    }
    getSource(id) { return this.sources.get(id); }
    getLayer(id) { return this.styleLayers.get(id); }
    setLayoutProperty(id, key, value) { this.styleLayers.get(id)[key] = value; }
    addControl() {}
    getContainer() { return elements.get('operational-3d-map'); }
    getCanvas() { return { style: {} }; }
    setTerrain() {}
    setCenterClampedToGround(value) { this.clamped = value; }
    queryTerrainElevation() { return 850; }
    getCenter() { return Array.isArray(this.camera.center) ? { lng: this.camera.center[0], lat: this.camera.center[1] } : this.camera.center; }
    getZoom() { return this.camera.zoom; }
    getMinZoom() { return 0; }
    isMoving() { return false; }
    stop() {}
    setPadding() {}
    cameraForBounds(bounds) { return { center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2], zoom: 13, bearing: 0 }; }
    jumpTo(options) { this.camera = { ...this.camera, ...options }; this.frames.push(plain(options)); }
    easeTo(options) { this.jumpTo(options); }
    project(point) {
      const center = this.getCenter(), scale = Math.pow(2, this.camera.zoom - 13);
      return { x: 350 + (point[0] - center.lng) * 20000 * scale, y: 250 - (point[1] - center.lat) * 20000 * scale * (this.camera.pitch ? 1.3 : 1) };
    }
    fitBounds(bounds, options) { this.flatBounds = bounds; this.flatOptions = options; return this; }
    setView(point, zoom) { this.camera = { center: [point[1], point[0]], zoom, pitch: 0 }; return this; }
    removeLayer(layer) { this.layers.delete(layer); }
    hasLayer(layer) { return this.layers.has(layer); }
  }
  const geoLayers = [];
  const L = {
    map: () => new MapStub({}), divIcon: options => options,
    marker: (point, options) => new Marker(options).setLngLat(point),
    tileLayer: () => ({ addTo() { return this; } }), latLngBounds: points => points,
    geoJSON(data, options) {
      const layer = { data, options, addTo(map) { map.layers.add(this); return this; } }; geoLayers.push(layer); return layer;
    }
  };
  const window = {
    L, ForestWatchPresentationState: {
      osmOK: true, osm: { segments, support: [], barriers: [] }, candidates: [], result: { nodes: [], gateways: [] },
      data: { center: [(start[0] + target[0]) / 2, (start[1] + target[1]) / 2], bounds: { minLat: 18.9, maxLat: 19.6, minLon: 100.9, maxLon: 101.3 }, existing: [], historicalHotspots: [{ id: 'H-01', lat: target[0], lon: target[1] }] }
    },
    addEventListener(type, callback) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(callback); },
    dispatchEvent(event) { events.push(event); (windowListeners.get(event.type) || []).forEach(callback => callback(event)); }
  };
  const maplibregl = { Map: MapStub, Marker, NavigationControl: class {}, ScaleControl: class {} };
  if (!flat) window.maplibregl = maplibregl;
  const sandbox = vm.createContext({ window, document, L, maplibregl, AbortController, setTimeout, clearTimeout, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: url => deferElevation ? new Promise(resolve => pendingElevation.push({ resolve, url })) : Promise.reject(new Error('Elevation unavailable in fixture'))
  });
  vm.runInContext(read('wildfire-v2/terrain3d.js'), sandbox);
  const map = maps[0]; if (!flat) map.emit('style.load');
  const api = window.WildfireOperationalMap;
  return { elements, events, markers, map, api, geoLayers, pendingElevation, flat,
    liveMarkers: () => markers.filter(marker => !marker.removed && (marker.element.dataset.journeyKind || marker.element.querySelector('button')?.dataset.journeyKind)),
    setStart: async point => { elements.get('op-start-lat').value = String(point[0]); elements.get('op-start-lon').value = String(point[1]); await elements.get('op-start-coordinates').emit('submit'); },
    route: () => elements.get('op-route').emit('click'),
    finishElevation() { for (const request of pendingElevation.splice(0)) { const count = new URL(request.url).searchParams.get('latitude').split(',').length; request.resolve({ ok: true, json: async () => ({ elevation: Array(count).fill(850) }) }); } }
  };
}

const segment = (a, b, hw, metadata = {}) => ({ a, b, hw, ...metadata });
const markerKind = marker => marker.element.dataset.journeyKind || marker.element.querySelector('button')?.dataset.journeyKind;

async function driveToWalkAndFootOnly() {
  const a = [19, 101], b = [19, 101.01], d = [19.004, 101.014], target = [19.005, 101.015], actualStart = [19, 100.999];
  const f = fixture({ start: a, target, segments: [segment(a, b, 'primary', { oneway: 'yes' }), segment(b, d, 'path', { motorVehicle: 'no' }), segment(d, target, 'footway', { motorVehicle: 'no' }), segment(b, target, 'path', { access: 'private' })] });
  assert.equal(f.events.filter(event => event.type === 'wildfire:target-changed').length, 0, 'initial map readiness must not announce an unchanged target');
  f.api.setTarget(target); await f.setStart(actualStart); await f.route();
  assert.deepEqual(plain(f.map.sources.get('route').data.features[0].geometry.coordinates), [[a[1], a[0]], [b[1], b[0]]]);
  assert.deepEqual(plain(f.map.sources.get('walk').data.features[0].geometry.coordinates), [[b[1], b[0]], [d[1], d[0]], [target[1], target[0]]], 'walking may use motor_vehicle=no paths while respecting private access');
  assert.deepEqual(plain(f.map.sources.get('offroad').data.features[0].geometry.coordinates), [[actualStart[1], actualStart[0]], [a[1], a[0]]], 'manual start connector is separate from driving');
  assert.equal(f.map.sources.get('egress').data.features.length, 0); assert.equal(f.elements.get('op-egress-time').textContent, 'ไม่พบ route', 'one-way ingress must not fabricate reverse egress');
  const car = f.liveMarkers().find(marker => markerKind(marker) === 'car'), person = f.liveMarkers().find(marker => markerKind(marker) === 'person'), handoff = f.liveMarkers().find(marker => markerKind(marker) === 'handoff');
  assert.deepEqual(plain(car.point), [a[1], a[0]]); assert.deepEqual(plain(person.point), [actualStart[1], actualStart[0]]); assert.deepEqual(plain(handoff.point), [b[1], b[0]]);
  assert.ok(f.liveMarkers().every(marker => marker.element.getAttribute('aria-label') && marker.element.innerHTML.includes('<svg')));
  f.elements.get('op-route-layer').checked = false; await f.elements.get('op-route-layer').emit('change');
  assert.equal(f.map.styleLayers.get('walk').visibility, 'none'); assert.ok(f.liveMarkers().every(marker => marker.element.style.display === 'none'));
  f.elements.get('op-route-layer').checked = true; f.elements.get('op-profile').value = 'foot'; await f.route();
  assert.equal(f.map.sources.get('route').data.features.length, 0); assert.ok(f.map.sources.get('walk').data.features.length); assert.ok(f.map.sources.get('egress').data.features.length, 'walking may return against a motor-vehicle one-way restriction');
  assert.ok(f.liveMarkers().every(marker => !['car', 'handoff'].includes(markerKind(marker))), 'foot-only profile must not create parked vehicles');
  console.log('PASS: drive-to-walk handoff, restrictions, actual-start connector and pure walking.');
}

async function cameraAndClearLifecycle() {
  const start = [19.4, 101.09], handoff = [19.44, 101.1], target = [19.45, 101.1];
  const f = fixture({ start, target, deferElevation: true, segments: [segment(start, handoff, 'primary'), segment(handoff, target, 'path')] });
  f.api.setTarget(target); await f.setStart(start); const pending = f.route();
  assert.equal(f.elements.get('operational-3d-map').getAttribute('data-route-camera-verified'), 'true');
  assert.ok(f.map.camera.zoom <= 13 && f.map.camera.pitch <= 40); assert.equal(f.map.camera.elevation, 850); assert.equal(f.map.clamped, true); assert.ok(f.map.frames.length > 2, 'clipped perspective must trigger conservative reframing');
  const assertVisible = () => {
    for (const coordinate of [start, handoff, target]) {
      const screen = f.map.project([coordinate[1], coordinate[0]]);
      assert.ok(screen.x >= 72 && screen.x <= 628 && screen.y >= 100 && screen.y <= 325, 'every route icon must fit above the legend and inside map controls');
    }
  };
  assertVisible();
  const focus = f.elements.get('op-journey').descendants().find(element => element.className === 'op-journey-focus'); await focus.emit('click');
  assert.deepEqual(plain(f.map.getCenter()), { lng: handoff[1], lat: handoff[0] }); assert.equal(f.elements.get('operational-3d-map').getAttribute('data-route-camera-verified'), 'true');
  assertVisible();
  const framesBefore = f.map.frames.length, targetEvents = f.events.filter(event => event.type === 'wildfire:target-changed').length;
  await f.elements.get('op-auto-start').emit('click');
  assert.equal(f.liveMarkers().length, 0); assert.equal(f.elements.get('op-journey').hidden, true); assert.equal(f.map.sources.get('walk').data.features.length, 0);
  assert.equal(f.events.filter(event => event.type === 'wildfire:target-changed').length, targetEvents, 'start/reset must not invalidate an unchanged ignition target');
  f.map.emit('idle'); assert.equal(f.map.frames.length, framesBefore, 'cleared routes must cancel delayed terrain reframing');
  f.finishElevation(); await pending;
  assert.equal(f.elements.get('op-route-distance').textContent, '—'); assert.equal(f.elements.get('op-elevation-gain').textContent, '—'); assert.equal(f.elements.get('op-journey').hidden, true, 'late elevation results must not resurrect a cleared itinerary');
  f.api.setTarget(target); assert.equal(f.events.filter(event => event.type === 'wildfire:target-changed').length, targetEvents, 'same accepted target must not emit a change');
  console.log('PASS: terrain framing/focus, initial target race and clear versus delayed elevation/idle.');
}

async function leafletFallback() {
  const start = [19, 101], handoff = [19, 101.01], target = [19.001, 101.011];
  const f = fixture({ flat: true, start, target, segments: [segment(start, handoff, 'primary'), segment(handoff, target, 'path')] });
  assert.equal(f.api.getContext().map, null); assert.equal(f.events.filter(event => event.type === 'wildfire:map-ready').length, 1);
  f.api.setTarget(target); await f.setStart(start); await f.route();
  assert.ok(f.geoLayers.some(layer => layer.data.features.length && layer.options.style({ properties: {} }).color === '#9760c8'), 'fallback must draw mapped walking as its own purple line');
  assert.ok(f.liveMarkers().some(marker => markerKind(marker) === 'handoff'));
  f.elements.get('op-route-layer').checked = false; await f.elements.get('op-route-layer').emit('change'); assert.ok(f.liveMarkers().every(marker => marker.element.style.display === 'none'));
  await f.elements.get('op-auto-start').emit('click'); assert.equal(f.liveMarkers().length, 0); assert.equal(f.elements.get('op-journey').hidden, true);
  console.log('PASS: Leaflet fallback walking, handoff, visibility and cleanup.');
}

(async () => { await driveToWalkAndFootOnly(); await cameraAndClearLifecycle(); await leafletFallback(); await settle(); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
