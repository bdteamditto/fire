// Run with: node tests/simulation-controller.cjs
// Run the actual controller with a small DOM/map/model and controllable async workers.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ type: 'FeatureCollection', features: [] });
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

class Element {
  constructor(id = '') {
    this.id = id; this.dataset = {}; this.children = []; this.listeners = new Map(); this.className = '';
    this.hidden = true; this.checked = true; this.disabled = false; this.value = '0'; this.textContent = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, enabled) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (enabled) names.add(name); else names.delete(name); this.className = [...names].join(' ');
      }
    };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener);
  }
  emit(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this }); }
  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (selector === '[data-minute]' && child.dataset.minute !== undefined) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
  get outerHTML() { return '<div class="' + this.className + '">' + this.textContent + '</div>'; }
}

function fixture({ workerMode = 'async', flat = false, exclusiveFilter = false, pmOnlyEvents = false } = {}) {
  const elements = new Map([...read('wildfire-v2/index.html').matchAll(/\bid="([^"]+)"/g)]
    .map(match => [match[1], new Element(match[1])]));
  elements.get('sim-speed').value = '4';
  elements.get('operational-3d-map').dataset.mapReady = 'true';
  const listeners = new Map(), documentListeners = new Map();
  const emit = (registry, type) => (registry.get(type) || []).forEach(listener => listener({ type }));
  const document = {
    hidden: false, getElementById: id => elements.get(id) || null, createElement: () => new Element(),
    querySelectorAll: () => [],
    addEventListener(type, listener) { if (!documentListeners.has(type)) documentListeners.set(type, []); documentListeners.get(type).push(listener); }
  };
  const sources = new Map(), layers = new Map(), createdMarkers = [], workers = [], createdInputs = [], frameMinutes = [], geoLayers = [];
  const cameraMoves = [];
  const map = {
    isStyleLoaded: () => true, getSource: id => sources.get(id), getLayer: id => layers.get(id),
    addSource(id, options) { sources.set(id, { data: options.data, writes: [], setData(data) { this.data = data; this.writes.push(data); } }); },
    addLayer(layer) { layers.set(layer.id, layer); }, setLayoutProperty(id, key, value) { layers.get(id)[key] = value; },
    easeTo(options) { cameraMoves.push(options); }, fitBounds() {}
  };
  const flatMap = {
    layers: new Set(), addLayer(layer) { this.layers.add(layer); return this; },
    removeLayer(layer) { this.layers.delete(layer); return this; }, hasLayer(layer) { return this.layers.has(layer); },
    fitBounds() {}, setView(point) { cameraMoves.push(point); }
  };
  const roles = ['RS', ...Array(5).fill('FU'), ...Array(4).fill('RW'), ...Array(3).fill('VW'), ...Array(3).fill('BW'), ...Array(5).fill('AQ')];
  const packages = { RS: 'PM2.5/PM10 reference + WS/WD', FU: 'PM2.5/PM10 + CO + WS/WD', AQ: 'PM2.5/PM10 + CO',
    RW: 'WS/WD + T/RH', VW: 'WS/WD + T/RH', BW: 'WS/WD + T/RH' };
  const ctx = {
    map: flat ? null : map, flatMap: flat ? flatMap : null, target: { id: 'CUSTOM', lat: 19.42, lon: 101.07, type: 'fire' },
    state: { result: { nodes: roles.map((roleCode, index) => ({ id: 'N' + String(index + 1).padStart(2, '0'), roleCode,
      p: { lat: 19.42, lon: 101.07 + index * .00002, elev: 400 + index, pkg: packages[roleCode] } })) },
      data: { wind: { fromDeg: 261, speedMs: 2.18 }, planRevision: 1,
        existing: [1, 2, 3].map(index => ({ id: 'EX-0' + index, lat: 19.42 + index * .0001, lon: 101.07 })) },
      candidates: [{ lat: 19.42, lon: 101.07, elev: 400, slope: 10 }] }
  };
  function scenarioFor(input) {
    const weather = { id: 'weather-N01', sensorId: 'N01', roleCode: 'RS', type: 'weather', minute: 0,
      ...input.origin, signals: { windFromDeg: 270, windToDeg: 90, windSpeedMs: 2, temperatureC: 30, relativeHumidityPct: 40 }, message: 'Synthetic weather' };
    const smoke = { id: 'smoke-N21', sensorId: 'N21', roleCode: 'AQ', type: 'smoke-detection', minute: 10,
      detectionBasis: 'pm25-co', capabilityAssumed: false,
      lat: input.origin.lat, lon: input.origin.lon + .0004,
      signals: { pm25UgM3: 60, deltaPm25UgM3: 45, coPpm: .6, deltaCoPpm: .45, windToDeg: 90 }, message: 'Synthetic smoke' };
    const events = [weather, smoke];
    if (pmOnlyEvents) {
      events.push({ ...smoke, id: 'smoke-N01-PM', sensorId: 'N01', roleCode: 'RS', minute: 12, detectionBasis: 'pm25-only',
        signals: { ...smoke.signals, coPpm: null, deltaCoPpm: null } });
      events.push({ ...smoke, id: 'smoke-EX-01-PM', sensorId: 'EX-01', roleCode: 'EX', minute: 14,
        detectionBasis: 'pm25-only', capabilityAssumed: true, signals: { ...smoke.signals, coPpm: null, deltaCoPpm: null } });
    }
    return { origin: input.origin, seed: input.seed, members: 24, events,
      metadata: { terrainStatus: 'coarse-dem-proxy', cellSizeM: 60 },
      windStations: [{ id: 'N01', roleCode: 'RS', readings: [{ ...weather.signals, minute: 0 }] }] };
  }
  const model = {
    createScenario(input) { createdInputs.push(plain(input)); return scenarioFor(input); },
    getFrame(scenario, minute) {
      frameMinutes.push(minute);
      const p = scenario.origin, ring = [[p.lon, p.lat], [p.lon + .001, p.lat], [p.lon + .001, p.lat + .001], [p.lon, p.lat]];
      const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { probability: 1, height: 5, base: 1 },
        geometry: { type: 'Polygon', coordinates: [ring] } }] };
      return { fireFC: fc, probabilityFC: fc, frontFC: fc, smokeFC: fc, areaHa: 1 + minute,
        headingToDeg: 90, windSpeedMs: 2, windFromDeg: 270,
        eventsSoFar: scenario.events.filter(event => event.minute <= minute) };
    }
  };
  class Marker {
    constructor(options) { this.element = options.element; this.removed = false; createdMarkers.push(this); }
    setLngLat(point) { this.point = point; return this; }
    addTo() { return this; }
    setRotation(value) { this.rotation = value; return this; }
    remove() { this.removed = true; }
    on() { return this; }
  }
  class Popup { setLngLat() { return this; } setDOMContent() { return this; } addTo() { return this; } remove() {} }
  class Worker {
    constructor(url) { if (workerMode === 'throws') throw new Error('Worker blocked'); this.url = url; this.terminated = false; workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
    result(requestId = this.message.requestId) { this.onmessage({ data: { type: 'result', requestId, scenario: scenarioFor(this.message.input) } }); }
  }
  const L = {
    divIcon: options => options,
    marker: (point, options) => new Marker({ element: { className: options.icon.html.includes('sim-sensor-alert') ? 'sim-sensor-alert' : 'other' } }).setLngLat(point),
    geoJSON(data) { const layer = { data, addTo(target) { target.addLayer(this); return this; } }; geoLayers.push(layer); return layer; }
  };
  const window = { WildfireOperationalMap: { getContext: () => ctx }, WildfireSimulationModel: model, L,
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); }
  };
  if (workerMode !== 'absent') window.Worker = Worker;
  let now = 0, nextTimer = 1;
  const timeouts = new Map(), intervals = new Map();
  const sandbox = vm.createContext({ window, document, Worker, L,
    maplibregl: { Marker, Popup, LngLatBounds: class { extend() { return this; } } },
    performance: { now: () => now },
    setTimeout: (callback, milliseconds) => { const id = nextTimer++; timeouts.set(id, { callback, milliseconds }); return id; },
    clearTimeout: id => timeouts.delete(id),
    setInterval: callback => { const id = nextTimer++; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id), console });
  // Use the real shared filter API, including subscriptions and category matching.
  vm.runInContext(read('wildfire-v2/point-filters.js'), sandbox);
  if (exclusiveFilter) window.ForestWatchPointFilters.set('sensors', 'RW');
  vm.runInContext(read('wildfire-v2/fire-simulation.js'), sandbox);
  return { elements, ctx, map, flatMap, sources, layers, workers, createdInputs, frameMinutes, createdMarkers, cameraMoves, geoLayers,
    filters: window.ForestWatchPointFilters,
    click: id => elements.get(id).emit('click'),
    slider(minute) { elements.get('sim-minute').value = String(minute); elements.get('sim-minute').emit('input'); },
    event: type => emit(listeners, type),
    hidden(value) { document.hidden = value; emit(documentListeners, 'visibilitychange'); },
    advance(seconds) { now += seconds * 1000; for (const callback of [...intervals.values()]) callback(); },
    flushFallback() { for (const [id, timer] of [...timeouts]) if (timer.milliseconds === 0) { timeouts.delete(id); timer.callback(); } },
    get activeIntervals() { return intervals.size; }
  };
}

function assertIdle(h) {
  assert.equal(h.elements.get('operational-3d-map').dataset.simulationState, 'idle');
  assert.equal(h.elements.get('sim-run').disabled, false); assert.equal(h.elements.get('sim-pause').disabled, true);
  assert.equal(h.elements.get('sim-results').hidden, true); assert.equal(h.elements.get('sim-toast').hidden, true);
  for (const id of ['sim-probability', 'sim-fire', 'sim-front', 'sim-smoke']) assert.equal(h.sources.get(id).data.features.length, 0);
}
async function startWorkerScenario(h) {
  h.click('sim-run'); const worker = h.workers.at(-1); assert.ok(worker); worker.result(); await settle();
  assert.equal(h.elements.get('sim-pause').disabled, false); assert.equal(h.elements.get('sim-results').hidden, false);
  return worker;
}

async function main() {
  const stale = fixture({ exclusiveFilter: true }); stale.click('sim-run'); const old = stale.workers[0];
  assert.equal(old.message.input.sensors.length, 24, 'Exclusive point filter does not alter simulation sensor input');
  assert.equal(old.message.input.sensors[0].pkg, stale.ctx.state.result.nodes[0].p.pkg, 'Planned package is passed to capability-aware model');
  assert.deepEqual(plain(old.message.input.sensors.map(sensor => sensor.id)), [...stale.ctx.state.result.nodes.map(n => n.id), 'EX-01', 'EX-02', 'EX-03']);
  stale.ctx.target = { ...stale.ctx.target, lat: 19.43 }; stale.event('wildfire:target-changed'); assert.ok(old.terminated); assertIdle(stale);
  old.result(); await settle(); assertIdle(stale); assert.equal(stale.frameMinutes.length, 0, 'Old worker result after target change never renders');
  const current = await startWorkerScenario(stale);
  assert.equal(current.message.input.origin.lat, 19.43);
  stale.advance(3); assert.equal(stale.elements.get('sim-minute').value, '12');
  stale.ctx.target = { ...stale.ctx.target, lon: 101.08 }; stale.event('wildfire:target-changed'); assertIdle(stale);
  assert.ok(stale.createdMarkers.every(marker => marker.removed), 'Target invalidation removes origin/wind/detection markers');

  const revision = fixture(); revision.click('sim-run'); const revisionWorker = revision.workers[0];
  revision.ctx.state.result.nodes[0].p.lat += .001; revision.event('wildfire:data-updated'); assertIdle(revision);
  revisionWorker.result(); await settle(); assertIdle(revision);
  await startWorkerScenario(revision);
  revision.ctx.manualStart = [19.4, 101.05]; revision.event('wildfire:data-updated'); revision.event('wildfire:start-changed');
  assert.equal(revision.elements.get('sim-results').hidden, false); assert.equal(revision.elements.get('sim-pause').disabled, false);
  revision.ctx.state.osm = { segments: [{ updated: true }] }; revision.event('wildfire:data-updated');
  assert.equal(revision.elements.get('sim-results').hidden, false, 'Road changes do not alter fire-model inputs');
  revision.ctx.state.result.nodes[0].roleCode = 'AQ'; revision.event('wildfire:data-updated'); assertIdle(revision);
  for (const change of [
    ctx => { ctx.state.data.existing[0].lat += .001; },
    ctx => { ctx.state.result.nodes[0].p.pkg += ' + CO'; },
    ctx => { ctx.state.candidates[0].elev += 25; },
    ctx => { ctx.state.candidates[0].slope += 5; }
  ]) {
    await startWorkerScenario(revision); change(revision.ctx); revision.event('wildfire:data-updated'); assertIdle(revision);
  }
  const changedBeforeReply = fixture(); changedBeforeReply.click('sim-run');
  changedBeforeReply.ctx.state.candidates[0].elev += 100;
  changedBeforeReply.workers[0].result(); await settle(); assertIdle(changedBeforeReply);
  assert.equal(changedBeforeReply.frameMinutes.length, 0, 'Latest input snapshot is checked even if a data event was missed');

  const notReady = fixture(); notReady.elements.get('operational-3d-map').dataset.mapReady = 'false';
  notReady.click('sim-run'); assert.equal(notReady.workers.length, 0); assert.equal(notReady.elements.get('sim-status').dataset.state, 'error');
  notReady.elements.get('operational-3d-map').dataset.mapReady = 'true'; notReady.event('wildfire:map-ready');
  notReady.click('sim-run'); assert.equal(notReady.workers.length, 1);
  notReady.workers[0].result(notReady.workers[0].message.requestId + 1); await settle();
  assert.equal(notReady.frameMinutes.length, 0); assert.equal(notReady.elements.get('sim-run').disabled, true);
  notReady.workers[0].result(); await settle(); assert.equal(notReady.elements.get('sim-results').hidden, false);

  const rewind = fixture(); await startWorkerScenario(rewind); rewind.advance(3);
  assert.equal(rewind.elements.get('sim-toast').hidden, false); assert.match(rewind.elements.get('sim-toast-title').textContent, /N21/);
  const alerts = rewind.createdMarkers.filter(marker => marker.element.className === 'sim-sensor-alert'); assert.equal(alerts.length, 1);
  const activeAlerts = () => rewind.createdMarkers.filter(marker => marker.element.className === 'sim-sensor-alert' && !marker.removed);
  const frameCount = rewind.frameMinutes.length, detections = rewind.elements.get('operational-3d-map').dataset.simulationDetections;
  rewind.filters.set('sensors', 'RW'); assert.equal(activeAlerts().length, 0);
  assert.ok(alerts[0].removed, 'Shared weather-only category removes smoke alert markers');
  rewind.filters.set('sensors', 'AQ'); assert.equal(activeAlerts().length, 1);
  rewind.elements.get('op-assets').checked = false; rewind.elements.get('op-assets').emit('change'); assert.equal(activeAlerts().length, 0);
  rewind.elements.get('op-assets').checked = true; rewind.elements.get('op-assets').emit('change'); assert.equal(activeAlerts().length, 1);
  rewind.filters.set('hotspots'); assert.equal(activeAlerts().length, 0);
  rewind.filters.set('all'); assert.equal(activeAlerts().length, 1);
  assert.equal(rewind.elements.get('sim-detected').textContent, '1 / 1 จุด');
  assert.equal(rewind.elements.get('operational-3d-map').dataset.simulationDetections, detections);
  assert.equal(rewind.frameMinutes.length, frameCount, 'Point filters redraw alerts without recomputing the fire frame');
  assert.equal(rewind.workers.length, 1, 'Point filters never replace the canonical simulation');
  rewind.slider(5); assert.equal(rewind.activeIntervals, 0); assert.equal(rewind.elements.get('sim-toast').hidden, true);
  assert.ok(alerts.every(marker => marker.removed)); assert.equal(rewind.elements.get('sim-detected').textContent, '0 / 1 จุด');
  const cameraCount = rewind.cameraMoves.length; rewind.click('sim-toast-focus'); assert.equal(rewind.cameraMoves.length, cameraCount, 'Rewind clears stale toast focus');
  rewind.slider(20); assert.equal(rewind.elements.get('sim-toast').hidden, false);
  rewind.click('sim-reset'); assert.equal(rewind.elements.get('sim-minute').value, '0'); assert.equal(rewind.elements.get('sim-toast').hidden, true);
  assert.equal(rewind.createdMarkers.filter(marker => marker.element.className === 'sim-sensor-alert' && !marker.removed).length, 0);
  rewind.slider(1000); assert.equal(rewind.elements.get('sim-minute').value, '120'); assert.equal(rewind.frameMinutes.at(-1), 120);
  assert.ok(rewind.frameMinutes.every(minute => minute >= 0 && minute <= 120));

  const pmOnly = fixture({ pmOnlyEvents: true }); await startWorkerScenario(pmOnly); pmOnly.advance(4);
  const eventText = id => pmOnly.elements.get('sim-events').children.find(card => card.dataset.eventId === id)
    .children.map(child => child.textContent).join(' ');
  for (const id of ['smoke-N01-PM', 'smoke-EX-01-PM']) {
    assert.match(eventText(id), /PM เท่านั้น ไม่มีค่า CO/);
    assert.doesNotMatch(eventText(id), /CO\s+0(?:[.,]0+)?\s+ppm/, 'Missing CO remains absent rather than fabricated zero');
    assert.match(eventText(id), /PM2.5 เพิ่มเป็นครั้งแรก/);
  }
  assert.match(eventText('smoke-EX-01-PM'), /สมมติการรองรับ PM/);
  assert.match(pmOnly.elements.get('sim-toast-message').textContent, /สมมติการรองรับ PM/);
  assert.doesNotMatch(pmOnly.elements.get('sim-toast-message').textContent, /CO\s+0(?:[.,]0+)?\s+ppm/);

  const hidden = fixture(); await startWorkerScenario(hidden); hidden.advance(1); const beforeHidden = hidden.elements.get('sim-minute').value;
  hidden.hidden(true); assert.equal(hidden.activeIntervals, 0); assert.equal(hidden.elements.get('sim-pause').disabled, true);
  hidden.advance(300); assert.equal(hidden.elements.get('sim-minute').value, beforeHidden);
  hidden.hidden(false); assert.equal(hidden.activeIntervals, 0, 'Visible tab does not silently resume playback');

  for (const workerMode of ['absent', 'throws']) {
    const fallback = fixture({ workerMode }); fallback.click('sim-run'); fallback.flushFallback(); await settle();
    assert.equal(fallback.createdInputs.length, 1); assert.equal(fallback.elements.get('sim-results').hidden, false);
    assert.equal(fallback.elements.get('sim-pause').disabled, false); assert.equal(fallback.elements.get('sim-status').dataset.state, 'ready');
  }
  const cancelledFallback = fixture({ workerMode: 'absent' }); cancelledFallback.click('sim-run');
  cancelledFallback.ctx.target.lat += .001; cancelledFallback.event('wildfire:target-changed');
  cancelledFallback.flushFallback(); await settle(); assertIdle(cancelledFallback); assert.equal(cancelledFallback.createdInputs.length, 0);
  const errorFallback = fixture(); errorFallback.click('sim-run'); errorFallback.workers[0].onerror(); await settle();
  assert.equal(errorFallback.createdInputs.length, 1); assert.equal(errorFallback.elements.get('sim-results').hidden, false);

  const flat = fixture({ flat: true }); await startWorkerScenario(flat);
  assert.equal(flat.geoLayers.length, 3, 'Initial Leaflet frame draws three layers once');
  flat.slider(12); assert.equal(flat.geoLayers.length, 6, 'Slider draws a Leaflet frame once');
  flat.ctx.target.lat += .001; flat.event('wildfire:target-changed');
  assert.equal(flat.flatMap.layers.size, 0, 'Target invalidation removes fallback overlays');
  assert.ok(flat.createdMarkers.every(marker => marker.removed));
  console.log('PASS: stale worker/target/selected/EX/DEM invalidation; start/roads/filter independence; shared alert category/asset visibility; map readiness and request IDs; rewind/reset/toast cleanup; 120-minute clamping; hidden-tab pause; unavailable/blocked/error worker fallback; single Leaflet draw and overlay cleanup');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
