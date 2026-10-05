// Run with: node tests/v3-simulation-bridge.cjs
// Reuse the established lifecycle stubs, running the actual V3 engine/filter files.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

let helpers = read('tests/simulation-controller.cjs');
const mainStart = helpers.indexOf('async function main() {');
assert.ok(mainStart > 0, 'Lifecycle helper fixture is available');
helpers = helpers.slice(0, mainStart).replaceAll('wildfire-v2/', 'wildfire-v3/');
const workerAnchor = "  if (workerMode !== 'absent') window.Worker = Worker;";
assert.ok(helpers.includes(workerAnchor));
helpers = helpers.replace(workerAnchor, `
  const bridgeEvents = [];
  window.bridgeEvents = bridgeEvents;
  window.dispatchEvent = event => { bridgeEvents.push(event.detail); (listeners.get(event.type) || []).forEach(listener => listener(event)); };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
` + workerAnchor);
const sandboxAnchor = 'vm.createContext({ window, document, Worker, L,';
assert.ok(helpers.includes(sandboxAnchor));
helpers = helpers.replace(sandboxAnchor, 'vm.createContext({ window, document, Worker, L, CustomEvent,');
const returnAnchor = 'return { elements, ctx, map, flatMap,';
assert.ok(helpers.includes(returnAnchor));
helpers = helpers.replace(returnAnchor, 'return { window, elements, ctx, map, flatMap,');
helpers += '\nmodule.exports={fixture,settle,assertIdle};';
const helperModule = { exports: {} };
vm.runInNewContext(helpers, { require, module: helperModule, __dirname, console }, { filename: 'v3-lifecycle-fixture' });
const { fixture, settle, assertIdle } = helperModule.exports;

function assertShape(snapshot) {
  assert.deepEqual(Object.keys(snapshot).sort(), ['scenario', 'frame', 'minute', 'playing', 'busy', 'status'].sort());
  assert.equal(typeof snapshot.playing, 'boolean'); assert.equal(typeof snapshot.busy, 'boolean');
  assert.ok(snapshot.minute >= 0 && snapshot.minute <= 120);
  assert.equal(typeof snapshot.status.state, 'string'); assert.equal(typeof snapshot.status.message, 'string');
}
function latest(h) { return h.window.bridgeEvents.at(-1); }

async function main() {
  assert.ok(fs.readFileSync(path.join(root, 'wildfire-v3/fire-model.js')).equals(fs.readFileSync(path.join(root, 'wildfire-v2/fire-model.js'))),
    'V3 model remains byte-identical to V2');
  const h = fixture({ pmOnlyEvents: true }), api = h.window.WildfireSimulation;
  assert.equal(typeof api.getSnapshot, 'function'); assert.equal(typeof api.run, 'function'); assert.equal(typeof api.pause, 'function');
  const initial = api.getSnapshot(); assertShape(initial);
  assert.equal(initial.scenario, null); assert.equal(initial.frame, null); assert.equal(initial.minute, 0);
  assert.equal(initial.playing, false); assert.equal(initial.busy, false);
  assert.deepEqual(plain(latest(h)), plain(initial), 'Initial lifecycle event publishes the same snapshot shape');
  const pending = api.run();
  assert.equal(api.getSnapshot().busy, true); assert.equal(api.getSnapshot().status.state, 'loading');
  assert.equal(latest(h).busy, true, 'Guide receives computation-start state');
  assert.equal(h.workers.length, 1, 'Bridge action delegates to the existing worker engine');
  h.workers[0].result(); await pending; await settle();
  const ready = api.getSnapshot(); assertShape(ready);
  assert.ok(ready.scenario); assert.ok(ready.frame); assert.equal(ready.busy, false); assert.equal(ready.playing, true);
  assert.equal(ready.status.state, 'ready');
  assert.equal(ready.scenario, latest(h).scenario); assert.equal(ready.frame, latest(h).frame, 'Event uses actual computed frame reference');
  const scene = ready.scenario, frame = ready.frame, framesRead = h.frameMinutes.length, eventsRead = h.window.bridgeEvents.length;
  for (let i = 0; i < 20; i++) {
    const snapshot = api.getSnapshot(); assert.equal(snapshot.scenario, scene); assert.equal(snapshot.frame, frame);
    assert.equal(snapshot.playing, true); assert.equal(snapshot.minute, 0);
  }
  assert.equal(h.frameMinutes.length, framesRead); assert.equal(h.workers.length, 1);
  assert.equal(h.window.bridgeEvents.length, eventsRead, 'Guide reads/navigation do not recompute or reset the engine');
  const copiedStatus = api.getSnapshot().status; copiedStatus.state = 'outside-change';
  assert.equal(api.getSnapshot().status.state, 'ready', 'Snapshot wrapper status cannot mutate engine state');
  h.advance(4);
  const playing = api.getSnapshot(); assert.equal(playing.minute, 16); assert.equal(playing.playing, true);
  assert.equal(latest(h).minute, 16); assert.equal(latest(h).frame, playing.frame);
  const pmOnly = playing.frame.eventsSoFar.filter(event => event.detectionBasis === 'pm25-only');
  assert.deepEqual(plain(pmOnly.map(event => event.roleCode).sort()), ['EX', 'RS']);
  assert.ok(pmOnly.every(event => event.signals.coPpm === null && event.signals.deltaCoPpm === null));
  assert.equal(pmOnly.find(event => event.roleCode === 'EX').capabilityAssumed, true);
  api.pause();
  assert.equal(api.getSnapshot().playing, false); assert.equal(latest(h).playing, false); assert.equal(api.getSnapshot().minute, 16);
  assert.equal(api.getSnapshot().scenario, scene); assert.match(api.getSnapshot().status.message, /T\+16/);
  h.slider(5); assert.equal(latest(h).minute, 5); assert.equal(latest(h).playing, false);
  assert.equal(api.getSnapshot().frame.eventsSoFar.some(event => event.type === 'smoke-detection'), false);
  assert.equal(api.getSnapshot().scenario, scene, 'Seek keeps the computed scenario');
  h.ctx.manualStart = [19.4, 101.05]; h.event('wildfire:data-updated');
  assert.equal(api.getSnapshot().scenario, scene, 'Start changes remain independent of the simulation');
  h.ctx.target = { ...h.ctx.target, lat: 19.43 }; h.event('wildfire:target-changed');
  assertIdle(h); assert.equal(latest(h).scenario, null); assert.equal(latest(h).frame, null);
  assert.equal(latest(h).minute, 0); assert.equal(latest(h).busy, false); assert.equal(latest(h).playing, false);

  const stale = fixture(), staleApi = stale.window.WildfireSimulation;
  const oldJob = staleApi.run(), oldWorker = stale.workers[0];
  stale.ctx.target.lat += .001; stale.event('wildfire:target-changed');
  const eventsAfterInvalidation = stale.window.bridgeEvents.length;
  oldWorker.result(); await oldJob; await settle();
  assert.equal(staleApi.getSnapshot().scenario, null); assert.equal(staleApi.getSnapshot().busy, false);
  assert.equal(stale.window.bridgeEvents.length, eventsAfterInvalidation, 'Stale results publish no ready/frame event');
  const dataJob = staleApi.run(); stale.ctx.state.candidates[0].elev += 15; stale.event('wildfire:data-updated');
  stale.workers.at(-1).result(); await dataJob; await settle(); assert.equal(staleApi.getSnapshot().scenario, null);

  const failure = fixture(), failureApi = failure.window.WildfireSimulation;
  const errorJob = failureApi.run(), failedWorker = failure.workers[0];
  failedWorker.onmessage({ data: { requestId: failedWorker.message.requestId, type: 'error', error: 'Demo worker failed' } });
  await errorJob; await settle();
  const failed = failureApi.getSnapshot(); assertShape(failed);
  assert.equal(failed.busy, false); assert.equal(failed.playing, false); assert.equal(failed.scenario, null);
  assert.equal(failed.status.state, 'error'); assert.match(failed.status.message, /Demo worker failed/);
  assert.equal(latest(failure).status.state, 'error', 'Worker errors are available to guide subscribers');

  const fallback = fixture({ workerMode: 'absent', pmOnlyEvents: true }), fallbackApi = fallback.window.WildfireSimulation;
  const fallbackJob = fallbackApi.run(); fallback.flushFallback(); await fallbackJob; await settle();
  assert.equal(fallbackApi.getSnapshot().busy, false); assert.ok(fallbackApi.getSnapshot().scenario);
  assert.equal(fallbackApi.getSnapshot().playing, true); assert.equal(fallback.createdInputs.length, 1);
  fallback.hidden(true); assert.equal(latest(fallback).playing, false);
  console.log('PASS: V3 real-engine snapshot/events; side-effect-free guide reads; worker/result/error/stale lifecycle; render/pause/seek/invalidation; PM-only capability snapshots; fallback/hidden-tab state; unchanged V2 model');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
