// Run with: node tests/fire-simulation.cjs
// Exercise the actual pure model and worker without browser or network access.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const modelSource = read('wildfire-v2/fire-model.js');
const context = vm.createContext({ self: {} });
vm.runInContext(modelSource, context);
const model = context.self.WildfireSimulationModel;
const plain = value => JSON.parse(JSON.stringify(value));
const origin = { lat: 19.42, lon: 101.07 };
const roles = ['AQ', 'FU', 'RS', 'EX', 'RW', 'VW', 'BW'];
const plannedPackages = {
  AQ: 'RK300-02 PM2.5/PM10 + CO / multi-gas',
  FU: 'RK120-01 WS/WD + T/RH + RK300-02 PM2.5/PM10 + CO / multi-gas',
  RS: 'RK900-12: WS/WD + T/RH + Pressure + Rain + PM2.5/PM10 reference',
  RW: 'RK120-01 WS/WD + T/RH', VW: 'RK120-01 WS/WD + T/RH (valley channel)',
  BW: 'RK120-01 WS/WD + T/RH (boundary inflow/outflow)'
};
const input = {
  origin, wind: { fromDeg: 270, speedMs: 2.18 }, seed: 20261002, members: 24,
  sensors: roles.map((roleCode, i) => ({ id: roleCode + '-near', roleCode,
    lat: origin.lat, lon: origin.lon + .0006 + i * .00004, elev: null, pkg: plannedPackages[roleCode] })), terrain: []
};

function assertGeometry(fc) {
  assert.equal(fc.type, 'FeatureCollection');
  for (const feature of fc.features) {
    assert.equal(feature.type, 'Feature'); assert.equal(feature.geometry.type, 'Polygon');
    for (const ring of feature.geometry.coordinates) {
      assert.ok(ring.length >= 4); assert.deepEqual(plain(ring[0]), plain(ring[ring.length - 1]));
      for (const point of ring) {
        assert.equal(point.length, 2); assert.ok(point.every(Number.isFinite));
        assert.ok(Math.abs(point[0]) <= 180); assert.ok(Math.abs(point[1]) <= 90);
      }
    }
  }
}
function centroid(scenario, minute = 120) {
  const burned = scenario.cells.filter(cell => cell.arrivalMinute !== null && cell.arrivalMinute <= minute);
  return { lon: burned.reduce((sum, cell) => sum + cell.lon, 0) / burned.length,
    lat: burned.reduce((sum, cell) => sum + cell.lat, 0) / burned.length };
}

const scenario = model.createScenario(input);
assert.equal(JSON.stringify(scenario), JSON.stringify(model.createScenario(input)), 'Same seed/input reproduce the entire scenario');
assert.notEqual(JSON.stringify(scenario), JSON.stringify(model.createScenario({ ...input, seed: input.seed + 1 })), 'Seed changes the ensemble');
assert.deepEqual(plain(structuredClone(scenario)), plain(scenario), 'Scenario contains only structured-clone-safe data');
assert.equal(scenario.members, 24); assert.ok(scenario.cells.length > 0 && scenario.cells.length <= 5000);
assert.ok(scenario.metadata.candidateCellCount <= 5000);
assert.equal(scenario.metadata.demo, true); assert.equal(scenario.metadata.calibrated, false); assert.equal(scenario.metadata.telemetry, false);
assert.match(scenario.metadata.probabilityMeaning, /conditional ensemble reach share/i);
assert.match(scenario.metadata.probabilityMeaning, /not ignition probability/i);
assert.match(scenario.metadata.probabilityMeaning, /not.*calibrated forecast/i);
assert.equal(scenario.metadata.horizonMinutes, 120); assert.equal(scenario.metadata.terrainStatus, 'unavailable');
assert.ok(scenario.cells.every(cell => cell.elevationM === null && cell.slopeDeg === null), 'Missing DEM never creates synthetic elevations/slopes');
assert.equal(new Set(scenario.cells.map(cell => cell.id)).size, scenario.cells.length);
for (const cell of scenario.cells) {
  assert.equal(cell.memberArrivals.length, 24);
  assert.equal(cell.arrivalMinute, cell.memberArrivals[0]);
  for (const arrival of cell.memberArrivals) assert.ok(arrival === null || Number.isFinite(arrival) && arrival >= 0 && arrival <= 120);
  assertGeometry({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [cell.ring] } }] });
}

let lastArea = 0, previousProbability = new Map(), previousBurned = new Set();
for (let minute = 0; minute <= 120; minute += 5) {
  const frame = model.getFrame(scenario, minute);
  assert.equal(frame.minute, minute); assert.ok(frame.areaHa >= lastArea); lastArea = frame.areaHa;
  for (const fc of [frame.fireFC, frame.probabilityFC, frame.frontFC, frame.smokeFC]) assertGeometry(fc);
  const probabilities = new Map(frame.probabilityFC.features.map(feature => [feature.properties.id, feature.properties.probability]));
  for (const cell of scenario.cells) {
    const probability = probabilities.get(cell.id) || 0;
    assert.ok(probability >= 0 && probability <= 1);
    assert.equal(probability, cell.memberArrivals.filter(arrival => arrival !== null && arrival <= minute).length / scenario.members);
    assert.ok(probability >= (previousProbability.get(cell.id) || 0));
  }
  previousProbability = probabilities;
  const burned = new Set(frame.fireFC.features.map(feature => feature.properties.id));
  for (const id of previousBurned) assert.ok(burned.has(id), 'Representative burned area never shrinks');
  previousBurned = burned;
  for (const feature of frame.frontFC.features) {
    assert.ok(burned.has(feature.properties.id)); assert.equal(feature.properties.visualOnly, true);
    assert.ok(Number.isFinite(feature.properties.height) && feature.properties.height > 0);
  }
  for (const feature of frame.smokeFC.features) {
    assert.equal(feature.properties.visualOnly, true); assert.equal(feature.properties.synthetic, true);
    assert.ok(feature.properties.height > feature.properties.base && feature.properties.base >= 0);
  }
  assert.ok(frame.eventsSoFar.every(event => event.minute <= minute));
  assert.ok(frame.windSpeedMs >= 0 && Number.isFinite(frame.windSpeedMs));
  assert.ok(frame.windFromDeg >= 0 && frame.windFromDeg <= 360);
  assert.ok(frame.headingToDeg >= 0 && frame.headingToDeg <= 360);
}
assert.equal(JSON.stringify(model.getFrame(scenario, -5)), JSON.stringify(model.getFrame(scenario, 0)));
assert.equal(JSON.stringify(model.getFrame(scenario, 1000)), JSON.stringify(model.getFrame(scenario, 120)));
assert.equal(JSON.stringify(model.getFrame(scenario, NaN)), JSON.stringify(model.getFrame(scenario, 0)));
assert.ok(scenario.windSummary.samples.some(sample => sample.speedMs !== scenario.windSummary.samples[0].speedMs), 'Wind changes over time');
assert.equal(scenario.windSummary.samples[0].minute, 0); assert.equal(scenario.windSummary.samples.at(-1).minute, 120);
assert.ok(scenario.windStations.every(station => station.synthetic && station.source === 'synthetic-demo'));
assert.deepEqual(plain(scenario.windStations.map(station => station.roleCode).sort()), ['FU', 'RS', 'RW', 'VW', 'BW'].sort());
const detections = scenario.events.filter(event => event.type === 'smoke-detection');
assert.deepEqual(plain(detections.map(event => event.roleCode).sort()), ['AQ', 'FU', 'RS', 'EX'].sort(), 'Each nearby smoke-capable role produces one first synthetic detection');
assert.equal(new Set(detections.map(event => event.sensorId)).size, detections.length);
assert.equal(scenario.metadata.noCoverage, false);
const capabilities = new Map(scenario.sensorCapabilities.map(capability => [capability.roleCode, capability]));
assert.equal(capabilities.get('RS').pm25, true); assert.equal(capabilities.get('RS').co, false); assert.equal(capabilities.get('RS').assumed, false);
assert.equal(capabilities.get('EX').pm25, true); assert.equal(capabilities.get('EX').co, false); assert.equal(capabilities.get('EX').assumed, true);
assert.match(capabilities.get('EX').basis, /hardware is unknown/i);
for (const role of ['FU', 'AQ']) { assert.equal(capabilities.get(role).pm25, true); assert.equal(capabilities.get(role).co, true); }
for (const role of ['RW', 'VW', 'BW']) { assert.equal(capabilities.get(role).pm25, false); assert.equal(capabilities.get(role).co, false); }
for (const event of scenario.events) {
  assert.ok(Number.isFinite(event.minute) && event.minute >= 0 && event.minute <= 120); assert.equal(event.synthetic, true);
  assert.ok(Object.values(event.signals).every(value => value === null || Number.isFinite(value)));
  if (event.type === 'smoke-detection') {
    assert.ok(['AQ', 'FU', 'RS', 'EX'].includes(event.roleCode));
    assert.ok(event.signals.deltaPm25UgM3 > 25);
    if (['RS', 'EX'].includes(event.roleCode)) {
      assert.equal(event.detectionBasis, 'pm25-only'); assert.equal(event.signals.coPpm, null); assert.equal(event.signals.deltaCoPpm, null);
      assert.equal(event.capabilityAssumed, event.roleCode === 'EX');
    } else {
      assert.equal(event.detectionBasis, 'pm25-co'); assert.ok(event.signals.deltaCoPpm > .2);
      assert.equal(event.capabilityAssumed, false);
    }
    const current = model.getFrame(scenario, event.minute);
    assert.equal(event.signals.windFromDeg, current.windFromDeg);
    assert.equal(event.signals.windToDeg, current.headingToDeg);
    assert.equal(model.getFrame(scenario, event.minute - 1).eventsSoFar.some(e => e.id === event.id), false);
  } else {
    assert.equal(event.type, 'weather');
    assert.ok(!Object.keys(event.signals).some(key => /pm25|coPpm|deltaCo/i.test(key)), 'Weather events never claim pollutant measurements');
  }
}
const packageAware = model.createScenario({ ...input, sensors: [
  { id: 'FU-PM-only', roleCode: 'FU', ...origin, pkg: 'PM2.5 / PM10 + WS/WD' },
  { id: 'AQ-no-PM', roleCode: 'AQ', ...origin, pkg: 'CO2-only monitor' },
  { id: 'RW-with-PM-label', roleCode: 'RW', ...origin, pkg: 'PM2.5 + CO' }
] });
const packageDetection = packageAware.events.find(event => event.sensorId === 'FU-PM-only' && event.type === 'smoke-detection');
assert.ok(packageDetection); assert.equal(packageDetection.detectionBasis, 'pm25-only'); assert.equal(packageDetection.signals.coPpm, null);
assert.equal(packageAware.events.some(event => ['AQ-no-PM', 'RW-with-PM-label'].includes(event.sensorId) && event.type === 'smoke-detection'), false,
  'Package lacking PM capability and weather-only roles never gain smoke detection');

const noCoverage = model.createScenario({ ...input, sensors: [{ id: 'AQ-far', roleCode: 'AQ', lat: 19.8, lon: 101.5 },
  { id: 'RW-near', roleCode: 'RW', lat: origin.lat, lon: origin.lon }] });
assert.equal(noCoverage.metadata.noCoverage, true);
assert.equal(noCoverage.events.some(event => event.type === 'smoke-detection'), false);
assert.ok(noCoverage.events.every(event => event.roleCode === 'RW' && event.type === 'weather'));

const directionalInput = { origin, seed: 123, members: 24, sensors: [], terrain: [] };
const eastward = model.createScenario({ ...directionalInput, wind: { fromDeg: 270, speedMs: 2.18 } });
const westward = model.createScenario({ ...directionalInput, wind: { fromDeg: 90, speedMs: 2.18 } });
assert.ok(centroid(eastward).lon > origin.lon + .001);
assert.ok(centroid(westward).lon < origin.lon - .001, 'Wind FROM east drives illustrative spread toward west');
assert.ok(Math.abs(model.getFrame(eastward, 120).areaHa - model.getFrame(westward, 120).areaHa) < 1, 'Reversal changes heading rather than arbitrary fire size');
const calm = model.createScenario({ ...directionalInput, wind: { fromDeg: 0, speedMs: 0 } });
assert.ok(calm.windSummary.samples.every(sample => sample.speedMs === 0));
assert.equal(model.getFrame(calm, 120).windSpeedMs, 0);
assert.ok(Math.abs(centroid(calm).lat - origin.lat) < .000001);
assert.ok(Math.abs(centroid(calm).lon - origin.lon) < .000001);
assert.ok(model.getFrame(calm, 120).areaHa < model.getFrame(eastward, 120).areaHa);

// Real supplied elevation gradients influence spread. No slope/elevation is invented.
const terrain = [];
for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
  terrain.push({ lat: origin.lat + y * .005, lon: origin.lon + x * .005,
    elev: 500 + x * 80, slope: 9 });
}
const upslope = model.createScenario({ ...directionalInput, wind: { fromDeg: 0, speedMs: 0 }, terrain });
assert.equal(upslope.metadata.terrainStatus, 'coarse-dem-proxy');
assert.ok(upslope.metadata.terrainCellCount > 0);
assert.ok(upslope.cells.some(cell => Number.isFinite(cell.elevationM) && Number.isFinite(cell.slopeDeg)));
assert.ok(centroid(upslope).lon > origin.lon + .00003, 'Supplied east-rising DEM gradient increases eastward spread');
const invalidTerrain = model.createScenario({ ...directionalInput, terrain: [{ ...origin, elev: null, slope: 20 }, { ...origin, elev: NaN }] });
assert.equal(invalidTerrain.metadata.terrainStatus, 'unavailable');
assert.ok(invalidTerrain.cells.every(cell => cell.elevationM === null));
const remoteTerrain = model.createScenario({ ...directionalInput, terrain: [{ lat: 25, lon: 110, elev: 999, slope: 25 }] });
assert.equal(remoteTerrain.metadata.terrainStatus, 'unavailable', 'Remote samples never fabricate local DEM coverage');
assert.throws(() => model.createScenario({ origin: { lat: NaN, lon: 101 } }));
assert.throws(() => model.createScenario({ origin: { lat: 91, lon: 101 } }));
assert.throws(() => model.getFrame(null, 0));
assert.equal(model.createScenario({ ...directionalInput, members: 100 }).members, 24);
assert.equal(model.createScenario({ ...directionalInput, members: 0 }).members, 1);
const duplicated = model.createScenario({ ...directionalInput, sensors: [...input.sensors, ...input.sensors] });
assert.equal(new Set(duplicated.windStations.map(station => station.id)).size, duplicated.windStations.length);

// Run the actual worker import and message protocol, including malformed input.
const messages = [], workerSelf = { postMessage: message => messages.push(message) };
const workerContext = vm.createContext({ self: workerSelf });
workerContext.importScripts = filename => {
  assert.equal(filename, 'fire-model.js'); vm.runInContext(modelSource, workerContext);
};
vm.runInContext(read('wildfire-v2/fire-worker.js'), workerContext);
workerSelf.onmessage({ data: { type: 'run', requestId: 'scenario-7', input } });
assert.equal(messages[0].type, 'result'); assert.equal(messages[0].requestId, 'scenario-7');
assert.equal(JSON.stringify(messages[0].scenario), JSON.stringify(scenario));
workerSelf.onmessage({ data: { type: 'run', requestId: 'bad-origin', input: {} } });
assert.equal(messages[1].type, 'error'); assert.equal(messages[1].requestId, 'bad-origin'); assert.ok(messages[1].error);
workerSelf.onmessage({ data: { type: 'unknown', requestId: 'ignored' } });
assert.equal(messages.length, 2);
console.log('PASS: deterministic cloneable ensemble; exact monotonic reach probabilities/burn area; finite geometry/horizon; variable/calm/reversed winds; package-aware PM/CO capabilities and explicitly assumed EX; role-safe detections/no coverage; supplied DEM/no invented DEM; worker result/error protocol');
