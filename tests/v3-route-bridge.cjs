// Run with: node tests/v3-route-bridge.cjs
// Exercise the actual V3 UI handlers and guided-demo bridge using small deterministic OSM networks.
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

const segment = (a, b, hw, metadata = {}) => ({ a, b, hw, ...metadata });
const routeEvents = fixture => fixture.events.filter(event => event.type === 'wildfire:route-updated').map(event => event.detail);

async function historicalTargetAndReadiness() {
  // Deliberately use a different H-01 location for each data set: the bridge must use published data.
  for (const target of [[19.11321, 101.04432], [19.50345, 101.23765]]) {
    const start = [target[0] - .001, target[1] - .001];
    const f = fixture({ start, target, autoReady: false, segments: [segment(start, target, 'primary')] });
    assert.equal(f.api.getSnapshot().ready, false); assert.equal(f.api.focusTarget(), false);
    f.map.emit('style.load'); assert.equal(f.api.getSnapshot().ready, true);
    f.api.setTarget(start); assert.equal(f.api.selectHistoricalTarget('H-01'), true);
    assert.equal(f.elements.get('op-target').value, 'H-01');
    assert.deepEqual(plain(f.api.getSnapshot().target), { id: 'H-01', lat: target[0], lon: target[1], type: 'fire' });
    assert.equal(Number(f.elements.get('op-target-lat').value), target[0]); assert.equal(Number(f.elements.get('op-target-lon').value), target[1]);
    const targetEvent = f.events.filter(event => event.type === 'wildfire:target-changed').at(-1);
    assert.deepEqual(plain(targetEvent.detail.coordinate), target, 'H-01 must take the normal change pipeline');
    const routeSnapshot = routeEvents(f).at(-1);
    assert.equal(routeSnapshot.currentRoute, null); assert.equal(routeSnapshot.routeStatus.state, 'idle');
    assert.deepEqual(plain(routeSnapshot.target), plain(f.api.getSnapshot().target));
    assert.equal(f.api.selectHistoricalTarget('H-99'), false); assert.equal(f.elements.get('op-target').value, 'H-01');
    assert.equal(f.api.selectHistoricalTarget('CUSTOM'), false);
    assert.equal(f.api.focusTarget(), true); assert.deepEqual(plain(f.map.getCenter()), { lat: target[0], lng: target[1] });
    assert.deepEqual(plain(f.map.sources.get('route-points').data.features.at(-1).geometry.coordinates), [target[1], target[0]], 'focus keeps a chosen target marker');
  }
  const target = [19.25678, 101.08765], start = [19.25, 101.08];
  const flat = fixture({ flat: true, start, target, segments: [segment(start, target, 'primary')] });
  assert.equal(flat.api.getSnapshot().ready, true); assert.equal(flat.api.focusTarget(), true);
  assert.deepEqual(plain(flat.map.getCenter()), { lat: target[0], lng: target[1] });
  console.log('PASS: readiness, published H-01 selection, target events, and target focus in both maps.');
}

async function routeAndElevationSnapshots() {
  const start = [19, 101], handoff = [19, 101.01], target = [19.002, 101.012];
  const f = fixture({ start, target, deferElevation: true, segments: [segment(start, handoff, 'primary', { oneway: 'yes' }), segment(handoff, target, 'path', { motorVehicle: 'no' })] });
  await f.setStart(start); const pending = f.route();
  const started = routeEvents(f).find(snapshot => snapshot.routeStatus.state === 'loading');
  assert.equal(started.currentRoute, null); assert.equal(started.routeStatus.distance, '—');
  const computed = f.api.getSnapshot();
  assert.equal(computed.routeStatus.state, 'ready'); assert.equal(computed.routingAvailable, true);
  assert.deepEqual(plain(computed.currentRoute.journey.handoff), handoff);
  assert.ok(computed.currentRoute.journey.driveKm > 0 && computed.currentRoute.journey.walkKm > 0);
  assert.equal(computed.currentRoute.egress, null); assert.equal(computed.currentRoute.metrics.egressTimeMin, null);
  assert.equal(computed.routeStatus.egressTime, 'ไม่พบ route');
  assert.equal(computed.routeStatus.distance, f.elements.get('op-route-distance').textContent);
  assert.equal(computed.routeStatus.time, f.elements.get('op-route-time').textContent);
  assert.equal(computed.currentRoute.elevation.state, 'loading'); assert.equal(computed.routeStatus.elevationGain, '—');
  computed.currentRoute.journey.handoff[0] = 0; computed.target.lat = 0;
  assert.deepEqual(plain(f.api.getSnapshot().currentRoute.journey.handoff), handoff, 'snapshot consumers cannot mutate engine state');
  const beforeElevation = routeEvents(f).length; f.finishElevation(); await pending;
  const elevated = routeEvents(f).at(-1);
  assert.ok(routeEvents(f).length > beforeElevation, 'elevation completion publishes a fresh route update');
  assert.equal(elevated.currentRoute.elevation.state, 'ready'); assert.equal(elevated.currentRoute.elevation.gain, 0);
  assert.equal(elevated.routeStatus.elevationGain, '0 m'); assert.equal(elevated.routeStatus.maxGrade, '0%');
  assert.equal(computed.currentRoute.elevation.state, 'loading', 'previous snapshots remain independent');
  assert.equal(f.api.selectHistoricalTarget('H-01'), true);
  const cleared = f.api.getSnapshot(); assert.equal(cleared.currentRoute, null); assert.equal(cleared.routeStatus.state, 'idle');
  assert.equal(cleared.routeStatus.distance, '—'); assert.equal(cleared.routeStatus.elevationGain, '—');
  console.log('PASS: actual route/journey metrics, independent snapshots, completion/elevation events and immediate invalidation.');
}

async function errorsAndLateResponses() {
  const start = [19, 101], target = [19, 101.01];
  const f = fixture({ start, target, deferElevation: true, segments: [segment(start, target, 'primary')] });
  await f.setStart(start); const pending = f.route();
  assert.ok(f.api.getSnapshot().currentRoute);
  f.api.setTarget([19.001, 101.011]);
  const clearEventCount = routeEvents(f).length;
  assert.equal(f.api.getSnapshot().currentRoute, null); assert.equal(f.api.getSnapshot().routeStatus.distance, '—');
  f.finishElevation(); await pending;
  assert.equal(routeEvents(f).length, clearEventCount, 'a delayed elevation response cannot publish a cleared route');
  assert.equal(f.api.getSnapshot().currentRoute, null);
  f.updateState({ ...f.state, osmOK: false }); await f.route();
  const unavailable = routeEvents(f).at(-1);
  assert.equal(unavailable.routeStatus.state, 'error'); assert.equal(unavailable.currentRoute, null); assert.equal(unavailable.routingAvailable, false);
  assert.equal(unavailable.routeStatus.distance, '—'); assert.match(unavailable.routeStatus.message, /OSM/);
  f.updateState({ ...f.state, osm: { segments: [segment(start, target, 'primary', { access: 'private' })], support: [], barriers: [] } });
  await f.route(); assert.equal(f.api.getSnapshot().routeStatus.state, 'error'); assert.equal(f.api.getSnapshot().routingAvailable, false);
  assert.equal(f.api.getSnapshot().currentRoute, null);
  const elevationFailed = fixture({ start, target, segments: [segment(start, target, 'primary')] });
  await elevationFailed.setStart(start); await elevationFailed.route();
  assert.equal(elevationFailed.api.getSnapshot().routeStatus.state, 'ready');
  assert.equal(elevationFailed.api.getSnapshot().currentRoute.elevation.state, 'unavailable');
  assert.equal(elevationFailed.api.getSnapshot().routeStatus.elevationGain, '—', 'failed enrichment does not invent elevation or discard a valid route');
  const runtimeFailure = fixture({ start, target, segments: [segment(start, target, 'primary')] });
  runtimeFailure.map.cameraForBounds = () => { throw new Error('camera failure'); };
  await runtimeFailure.route();
  assert.equal(runtimeFailure.api.getSnapshot().routeStatus.state, 'error'); assert.equal(runtimeFailure.api.getSnapshot().currentRoute, null);
  assert.equal(runtimeFailure.map.sources.get('route').data.features.length, 0, 'unexpected route errors clear partial drawing');
  console.log('PASS: missing/restricted graph, runtime error cleanup, failed elevation, and stale-response suppression.');
}

(async () => { await historicalTargetAndReadiness(); await routeAndElevationSnapshots(); await errorsAndLateResponses(); await settle(); })()
  .catch(error => { console.error(error); process.exitCode = 1; });

function fixture({ segments, start, target, flat = false, deferElevation = false, autoReady = true } = {}) {
  const elements = new Map([...read('wildfire-v3/index.html').matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element(match[1])]));
  assert.ok(elements.has('op-journey'), 'V3 must mount its journey itinerary');
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
  vm.runInContext(read('wildfire-v3/terrain3d.js'), sandbox);
  const map = maps[0]; if (!flat && autoReady) map.emit('style.load');
  const api = window.WildfireOperationalMap;
  return { elements, events, markers, map, api, geoLayers, pendingElevation, flat, state: window.ForestWatchPresentationState,
    updateState: state => window.dispatchEvent(new sandbox.CustomEvent('forestwatch:v1-ready', { detail: state })),
    liveMarkers: () => markers.filter(marker => !marker.removed && (marker.element.dataset.journeyKind || marker.element.querySelector('button')?.dataset.journeyKind)),
    setStart: async point => { elements.get('op-start-lat').value = String(point[0]); elements.get('op-start-lon').value = String(point[1]); await elements.get('op-start-coordinates').emit('submit'); },
    route: () => elements.get('op-route').emit('click'),
    finishElevation() { for (const request of pendingElevation.splice(0)) { const count = new URL(request.url).searchParams.get('latitude').split(',').length; request.resolve({ ok: true, json: async () => ({ elevation: Array(count).fill(850) }) }); } }
  };
}
