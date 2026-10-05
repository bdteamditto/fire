'use strict';
// An illustrative, seeded ensemble. These coefficients are intentionally not a
// calibrated fire-behaviour model and do not implement Rothermel or FARSITE.
(function (scope) {
  const HORIZON = 120, STEP = 5, WIDTH = 57, HALF = (WIDTH - 1) / 2;
  const WEATHER_ROLES = new Set(['FU', 'RS', 'RW', 'VW', 'BW']);
  const rad = degrees => degrees * Math.PI / 180;
  const deg = radians => radians * 180 / Math.PI;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const angle = value => ((value % 360) + 360) % 360;
  const round = (value, digits = 3) => Number(value.toFixed(digits));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const featureCollection = features => ({ type: 'FeatureCollection', features });
  const polygon = (ring, properties) => ({ type: 'Feature', properties,
    geometry: { type: 'Polygon', coordinates: [ring] } });

  function seedValue(value) {
    if (finite(value)) return Math.trunc(value) >>> 0;
    let hash = 2166136261;
    for (const char of String(value === undefined ? 'wildfire-v2-demo' : value)) {
      hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function randomSource(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
  function coordinate(value) {
    return value && finite(value.lat) && finite(value.lon) &&
      Math.abs(value.lat) <= 85 && Math.abs(value.lon) <= 180;
  }
  function projection(origin) {
    const latScale = 111320, lonScale = latScale * Math.cos(rad(origin.lat));
    return {
      local: p => ({ x: (((p.lon - origin.lon + 540) % 360) - 180) * lonScale, y: (p.lat - origin.lat) * latScale }),
      point: (x, y) => [round(((origin.lon + x / lonScale + 180) % 360 + 360) % 360 - 180, 7),
        round(origin.lat + y / latScale, 7)]
    };
  }
  function windAt(summary, minute) {
    const samples = summary.samples, position = clamp(minute / STEP, 0, samples.length - 1);
    const index = Math.floor(position), first = samples[index], second = samples[Math.min(index + 1, samples.length - 1)];
    const fraction = position - index;
    const difference = ((second.fromDeg - first.fromDeg + 540) % 360) - 180;
    const fromDeg = angle(first.fromDeg + difference * fraction);
    return { fromDeg, toDeg: angle(fromDeg + 180), speedMs: first.speedMs + (second.speedMs - first.speedMs) * fraction };
  }

  function capabilitiesFor(sensor) {
    const pkg = typeof sensor.pkg === 'string' ? sensor.pkg.trim() : '';
    const suppliedPackage = pkg.length > 0, existing = sensor.roleCode === 'EX';
    const plannedSmoke = ['AQ', 'FU', 'RS'].includes(sensor.roleCode);
    const pm25 = (plannedSmoke || existing) && (!suppliedPackage || /PM\s*2[.,]\s*5/i.test(pkg));
    // Existing hardware is unspecified: illustrate PM only and disclose that assumption.
    // RS's canonical PM reference package does not contain CO.
    const co = pm25 && (suppliedPackage ? /\bCO\b/i.test(pkg) : ['AQ', 'FU'].includes(sensor.roleCode));
    const assumed = existing && !suppliedPackage;
    const weather = WEATHER_ROLES.has(sensor.roleCode);
    const basis = assumed ? 'Existing device hardware is unknown; PM2.5 response assumed only for illustration' :
      suppliedPackage ? 'Capabilities described by supplied planned package: ' + pkg :
        plannedSmoke ? 'Current canonical role package; RS has PM reference only, FU/AQ include CO' :
          weather ? 'Weather role: wind / temperature / humidity, no smoke detection' : 'No specified detection capability';
    return { id: sensor.id, roleCode: sensor.roleCode, pm25, co, weather, assumed, basis };
  }

  function syntheticWind(baseline, sensors, random) {
    const phase = random() * Math.PI * 2, directionPhase = random() * Math.PI * 2;
    const samples = [];
    for (let minute = 0; minute <= HORIZON; minute += STEP) {
      const fromDeg = baseline.speedMs === 0 ? baseline.fromDeg : angle(baseline.fromDeg +
        13 * Math.sin(minute / 31 + directionPhase) + 5 * Math.sin(minute / 12 + phase));
      const speedMs = baseline.speedMs === 0 ? 0 : clamp(baseline.speedMs *
        (1 + .17 * Math.sin(minute / 25 + phase) + .07 * Math.sin(minute / 11 + directionPhase)), 0, 15);
      samples.push({ minute, fromDeg: round(fromDeg), toDeg: round(angle(fromDeg + 180)), speedMs: round(speedMs) });
    }
    const stations = sensors.filter(sensor => WEATHER_ROLES.has(sensor.roleCode)).map(sensor => {
      const localPhase = random() * Math.PI * 2, directionOffset = (random() - .5) * 10;
      const speedScale = .94 + random() * .12;
      const readings = samples.map(sample => {
        const from = baseline.speedMs === 0 ? baseline.fromDeg : angle(sample.fromDeg + directionOffset +
          3 * Math.sin(sample.minute / 28 + localPhase));
        return { minute: sample.minute, windFromDeg: round(from), windToDeg: round(angle(from + 180)),
          windSpeedMs: round(sample.speedMs * speedScale),
          temperatureC: round(30 + 1.4 * Math.sin(sample.minute / 55 + localPhase), 1),
          relativeHumidityPct: round(43 - 4 * Math.sin(sample.minute / 55 + localPhase), 1) };
      });
      return { id: sensor.id, roleCode: sensor.roleCode, lat: sensor.lat, lon: sensor.lon,
        elev: finite(sensor.elev) ? sensor.elev : null, synthetic: true, source: 'synthetic-demo', readings };
    });
    // The demonstration spread uses the changing synthetic station vector mean.
    // Without weather-capable stations, it still uses the supplied baseline demo.
    if (stations.length) {
      samples.forEach((sample, index) => {
        let east = 0, north = 0;
        for (const station of stations) {
          const reading = station.readings[index];
          east += Math.sin(rad(reading.windToDeg)) * reading.windSpeedMs;
          north += Math.cos(rad(reading.windToDeg)) * reading.windSpeedMs;
        }
        east /= stations.length; north /= stations.length;
        const speedMs = Math.hypot(east, north), toDeg = speedMs < .00001 ? angle(baseline.fromDeg + 180) : angle(deg(Math.atan2(east, north)));
        sample.speedMs = round(speedMs); sample.toDeg = round(toDeg); sample.fromDeg = round(angle(toDeg + 180));
      });
    }
    return { stations, summary: { baseline, samples, source: 'synthetic-demo',
      aggregation: stations.length ? 'Vector mean of synthetic weather-station readings' : 'Synthetic variation around supplied baseline; no weather stations' } };
  }

  function terrainAt(x, y, samples) {
    if (!samples.length) return { elevationM: null, slopeDeg: null };
    const nearest = [];
    for (const sample of samples) {
      const distance2 = (x - sample.x) ** 2 + (y - sample.y) ** 2;
      if (nearest.length < 4 || distance2 < nearest[nearest.length - 1].distance2) {
        nearest.push({ sample, distance2 }); nearest.sort((a, b) => a.distance2 - b.distance2);
        if (nearest.length > 4) nearest.pop();
      }
    }
    // Do not extend a DEM sample into a distant, unobserved part of the world.
    if (nearest[0].distance2 > 1800 ** 2) return { elevationM: null, slopeDeg: null };
    let weight = 0, elevation = 0, slope = 0, slopeWeight = 0;
    for (const { sample, distance2 } of nearest) {
      const w = 1 / Math.max(25, distance2);
      weight += w; elevation += sample.elev * w;
      if (finite(sample.slope)) { slope += sample.slope * w; slopeWeight += w; }
    }
    return { elevationM: round(elevation / weight), slopeDeg: slopeWeight ? round(slope / slopeWeight) : null };
  }

  class MinHeap {
    constructor() { this.items = []; }
    push(value) {
      const items = this.items; items.push(value); let i = items.length - 1;
      while (i) { const parent = (i - 1) >> 1; if (items[parent][0] <= value[0]) break; items[i] = items[parent]; i = parent; }
      items[i] = value;
    }
    pop() {
      const items = this.items, result = items[0], last = items.pop();
      if (items.length) {
        let i = 0;
        while (i * 2 + 1 < items.length) {
          let child = i * 2 + 1;
          if (child + 1 < items.length && items[child + 1][0] < items[child][0]) child++;
          if (items[child][0] >= last[0]) break;
          items[i] = items[child]; i = child;
        }
        items[i] = last;
      }
      return result;
    }
    get length() { return this.items.length; }
  }

  function arrivalsForMember(cells, neighbours, wind, member, random) {
    const times = new Float64Array(cells.length); times.fill(Infinity);
    const originIndex = HALF * WIDTH + HALF, heap = new MinHeap();
    const spreadScale = member === 0 ? 1 : .75 + random() * .5;
    const speedScale = member === 0 ? 1 : .77 + random() * .46;
    const directionOffset = member === 0 ? 0 : (random() - .5) * 34;
    const terrainScale = member === 0 ? 1 : .75 + random() * .5;
    times[originIndex] = 0; heap.push([0, originIndex]);
    while (heap.length) {
      const [minute, index] = heap.pop();
      if (minute !== times[index] || minute > HORIZON) continue;
      const currentWind = windAt(wind, minute), speed = currentWind.speedMs * speedScale;
      const heading = rad(currentWind.toDeg + directionOffset), windEast = Math.sin(heading), windNorth = Math.cos(heading);
      for (const edge of neighbours[index]) {
        const alignment = edge.east * windEast + edge.north * windNorth;
        const windFactor = (1 + Math.max(0, alignment) * speed) / (1 + Math.max(0, -alignment) * speed * .65);
        const slopeFactor = Math.exp(clamp(edge.grade * 1.8 * terrainScale, -.65, .65));
        const rateMPerMinute = (1.5 + .2 * speed) * windFactor * slopeFactor * spreadScale;
        const arrival = minute + edge.distanceM / rateMPerMinute;
        if (arrival <= HORIZON && arrival < times[edge.to]) { times[edge.to] = arrival; heap.push([arrival, edge.to]); }
      }
    }
    return times;
  }

  function buildEvents(sensors, capabilities, stations, summary, cells, project) {
    const events = [], weatherById = new Map(stations.map(station => [station.id, station]));
    const capabilityById = new Map(capabilities.map(capability => [capability.id, capability]));
    for (const sensor of sensors) {
      const station = weatherById.get(sensor.id);
      if (station) {
        for (const reading of station.readings.filter(reading => reading.minute % 30 === 0)) {
          events.push({ id: 'weather-' + sensor.id + '-' + reading.minute, sensorId: sensor.id, roleCode: sensor.roleCode,
            lat: sensor.lat, lon: sensor.lon, minute: reading.minute, type: 'weather', synthetic: true,
            source: 'synthetic-demo', signals: { ...reading }, message: 'Synthetic wind / temperature / humidity; not a smoke detection' });
        }
      }
      const capability = capabilityById.get(sensor.id);
      if (!capability.pm25) continue;
      const point = project.local(sensor), distanceM = Math.hypot(point.x, point.y);
      let nearest = null, nearestDistance2 = Infinity;
      for (const cell of cells) {
        const d2 = (point.x - cell.x) ** 2 + (point.y - cell.y) ** 2;
        if (d2 < nearestDistance2) { nearest = cell; nearestDistance2 = d2; }
      }
      for (let minute = 1; minute <= HORIZON; minute++) {
        const wind = windAt(summary, minute), heading = rad(wind.toDeg);
        const along = point.x * Math.sin(heading) + point.y * Math.cos(heading);
        const cross = Math.abs(point.x * Math.cos(heading) - point.y * Math.sin(heading));
        const growth = Math.min(1, minute / 22), plumeLength = minute * (3 + wind.speedMs * 13);
        const plumeWidth = 45 + Math.max(0, along) * .14 + minute * 1.2;
        let strength = wind.speedMs < .1 ? (distanceM <= minute * 3 ? growth * .8 : 0) :
          along >= -50 && along <= plumeLength && cross <= plumeWidth ?
            growth * (1 - .45 * Math.max(0, along) / Math.max(1, plumeLength)) * (1 - .5 * cross / plumeWidth) : 0;
        if (nearest && finite(nearest.arrivalMinute) && nearest.arrivalMinute <= minute && nearestDistance2 <= 150 ** 2) strength = Math.max(strength, .8 * growth);
        const deltaPm25 = round(80 * strength, 1), deltaCo = capability.co ? round(.6 * strength, 3) : null;
        if (deltaPm25 <= 25 || (capability.co && deltaCo <= .2)) continue;
        events.push({ id: 'smoke-' + sensor.id + '-' + minute, sensorId: sensor.id, roleCode: sensor.roleCode,
          lat: sensor.lat, lon: sensor.lon, minute, type: 'smoke-detection', synthetic: true, source: 'synthetic-demo',
          detectionBasis: capability.co ? 'pm25-co' : 'pm25-only', capabilityAssumed: capability.assumed,
          signals: { pm25UgM3: round(15 + deltaPm25, 1), coPpm: capability.co ? round(.15 + deltaCo, 3) : null,
            deltaPm25UgM3: deltaPm25, deltaCoPpm: deltaCo,
            windFromDeg: round(wind.fromDeg), windToDeg: round(wind.toDeg), windSpeedMs: round(wind.speedMs) },
          message: 'First synthetic ' + (capability.co ? 'PM2.5 + CO' : 'PM2.5-only') + ' threshold crossing; not a measured alarm' +
            (capability.assumed ? '; existing hardware unknown, PM capability assumed for illustration' : '') });
        break;
      }
    }
    return events.sort((a, b) => a.minute - b.minute || (a.type === b.type ? (a.sensorId < b.sensorId ? -1 : a.sensorId > b.sensorId ? 1 : 0) : a.type === 'smoke-detection' ? -1 : 1));
  }

  function createScenario(input = {}) {
    if (!coordinate(input.origin)) throw new Error('A finite ignition latitude/longitude within the local-model range is required');
    const origin = { lat: input.origin.lat, lon: input.origin.lon };
    const baseline = { fromDeg: angle(finite(input.wind?.fromDeg) ? input.wind.fromDeg : 261),
      speedMs: clamp(finite(input.wind?.speedMs) ? input.wind.speedMs : 2.18, 0, 15) };
    const seed = seedValue(input.seed), random = randomSource(seed);
    const members = clamp(finite(input.members) ? Math.floor(input.members) : 24, 1, 24);
    const sensorIds = new Set();
    const sensors = (Array.isArray(input.sensors) ? input.sensors : []).filter(sensor => {
      if (!coordinate(sensor) || typeof sensor.id !== 'string' || !sensor.id || sensorIds.has(sensor.id)) return false;
      sensorIds.add(sensor.id); return true;
    }).map(sensor => ({ id: sensor.id, lat: sensor.lat, lon: sensor.lon, roleCode: sensor.roleCode,
      elev: finite(sensor.elev) ? sensor.elev : null, pkg: typeof sensor.pkg === 'string' ? sensor.pkg : null }));
    const sensorCapabilities = sensors.map(capabilitiesFor);
    const project = projection(origin);
    const terrain = (Array.isArray(input.terrain) ? input.terrain : []).filter(sample => coordinate(sample) && finite(sample.elev))
      .map(sample => ({ ...project.local(sample), elev: sample.elev,
        slope: finite(sample.slope) && sample.slope >= 0 && sample.slope <= 90 ? sample.slope : null }));
    const { stations, summary } = syntheticWind(baseline, sensors, random);
    // Keep a fixed number of cells; larger assumed winds enlarge their size.
    const maxSpeed = baseline.speedMs * 1.4;
    const cellSizeM = Math.max(30, Math.ceil(((1.5 + .2 * maxSpeed) * (1 + maxSpeed) * HORIZON * 1.5 / (HALF - 2)) / 5) * 5);
    const cells = [];
    for (let row = 0; row < WIDTH; row++) {
      for (let col = 0; col < WIDTH; col++) {
        const x = (col - HALF) * cellSizeM, y = (row - HALF) * cellSizeM, half = cellSizeM / 2;
        const point = project.point(x, y);
        cells.push({ id: row * WIDTH + col, row, col, x, y, lat: point[1], lon: point[0],
          ring: [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half], [x - half, y - half]]
            .map(([px, py]) => project.point(px, py)), ...terrainAt(x, y, terrain),
          arrivalMinute: null, memberArrivals: [] });
      }
    }
    const neighbours = cells.map(cell => {
      const edges = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || cell.row + dy < 0 || cell.row + dy >= WIDTH || cell.col + dx < 0 || cell.col + dx >= WIDTH) continue;
        const to = (cell.row + dy) * WIDTH + cell.col + dx, target = cells[to], distanceM = cellSizeM * Math.hypot(dx, dy);
        const grade = finite(cell.elevationM) && finite(target.elevationM) ? (target.elevationM - cell.elevationM) / distanceM : 0;
        edges.push({ to, distanceM, east: dx / Math.hypot(dx, dy), north: dy / Math.hypot(dx, dy), grade });
      }
      return edges;
    });
    for (let member = 0; member < members; member++) {
      const times = arrivalsForMember(cells, neighbours, summary, member, random);
      cells.forEach((cell, index) => {
        const arrival = Number.isFinite(times[index]) ? round(times[index], 2) : null;
        cell.memberArrivals.push(arrival); if (member === 0) cell.arrivalMinute = arrival;
      });
    }
    const events = buildEvents(sensors, sensorCapabilities, stations, summary, cells, project);
    const reached = cells.filter(cell => cell.memberArrivals.some(finite));
    const terrainCellCount = reached.filter(cell => finite(cell.elevationM)).length;
    const boundaryClipped = reached.some(cell => cell.row === 0 || cell.row === WIDTH - 1 || cell.col === 0 || cell.col === WIDTH - 1);
    return {
      origin, seed, members, windStations: stations, windSummary: summary, sensorCapabilities,
      cells: reached.map(({ row, col, x, y, ...cell }) => cell), events,
      metadata: {
        demo: true, calibrated: false, telemetry: false, horizonMinutes: HORIZON, cellSizeM,
        candidateCellCount: WIDTH * WIDTH, terrainCellCount, boundaryClipped,
        terrainStatus: terrainCellCount ? 'coarse-dem-proxy' : 'unavailable',
        windSource: 'Synthetic station histories around the supplied scenario baseline; not measured wind',
        probabilityMeaning: 'Conditional ensemble reach share by the selected minute given this ignition and illustrative assumptions; not ignition probability or a calibrated forecast',
        detectionMeaning: 'Earliest synthetic PM2.5 threshold crossing with CO required only when planned; arbitrary demo plume geometry and signal scales; weather-only roles never detect smoke',
        capabilityMeaning: 'RS has PM reference without CO; FU/AQ follow planned package; unspecified existing hardware uses explicitly assumed PM-only illustration',
        representativeMeaning: 'Member 0 uses the synthetic mean wind and nominal spread coefficient',
        headingMeaning: 'Current synthetic wind transport direction',
        noCoverage: !events.some(event => event.type === 'smoke-detection'),
        limitations: ['No live sensor telemetry', 'No fuel or moisture survey', 'Coarse DEM gradients only when available; no invented terrain',
          'Uniform illustrative burnable fuel', 'No calibrated spread or smoke-transport equations', 'Flame/plume heights are visual metres only',
          'No spotting, suppression, structures, or validated evacuation predictions'],
        referenceLinks: [
          'https://www.weather.gov/ggw/GlossaryW',
          'https://research.fs.usda.gov/firelab/projects/rothermelfirespread'
        ]
      }
    };
  }

  function ellipse(project, center, alongM, crossM, headingDeg) {
    const direction = rad(headingDeg), ring = [];
    for (let i = 0; i <= 24; i++) {
      const theta = i / 24 * Math.PI * 2, along = Math.cos(theta) * alongM, cross = Math.sin(theta) * crossM;
      ring.push(project.point(center.x + Math.sin(direction) * along + Math.cos(direction) * cross,
        center.y + Math.cos(direction) * along - Math.sin(direction) * cross));
    }
    ring[ring.length - 1] = [...ring[0]]; return ring;
  }

  function getFrame(scenario, requestedMinute) {
    if (!scenario || !coordinate(scenario.origin) || !Array.isArray(scenario.cells) || !scenario.windSummary?.samples?.length)
      throw new Error('A scenario created by WildfireSimulationModel is required');
    const minute = clamp(finite(requestedMinute) ? requestedMinute : 0, 0, HORIZON);
    const wind = windAt(scenario.windSummary, minute), fire = [], probability = [], front = [];
    let east = 0, north = 0;
    const project = projection(scenario.origin);
    for (const cell of scenario.cells) {
      const share = cell.memberArrivals.filter(arrival => finite(arrival) && arrival <= minute).length / scenario.members;
      if (share > 0) probability.push(polygon(cell.ring, { id: cell.id, probability: share, conditional: true, demo: true }));
      if (!finite(cell.arrivalMinute) || cell.arrivalMinute > minute) continue;
      fire.push(polygon(cell.ring, { id: cell.id, arrivalMinute: cell.arrivalMinute, demo: true }));
      const local = project.local(cell); east += local.x; north += local.y;
      if (minute - cell.arrivalMinute <= 7) {
        const half = scenario.metadata.cellSizeM * .24;
        const ring = [[local.x-half,local.y-half*.6],[local.x+half,local.y-half*.6],[local.x+half*.35,local.y+half],[local.x-half,local.y-half*.6]].map(([x,y])=>project.point(x,y));
        front.push(polygon(ring, { id: cell.id,
          height: round(35 + wind.speedMs * 5 + (1 - (minute - cell.arrivalMinute) / 7) * 12), base: 0, visualOnly: true, demo: true }));
      }
    }
    const smoke = [];
    if (minute > 0 && fire.length) {
      const centroid = { x: east / fire.length, y: north / fire.length }, heading = rad(wind.toDeg);
      const length = Math.min(1800, 90 + minute * (5 + wind.speedMs * 5));
      for (let i = 0; i < 3; i++) {
        const offset = wind.speedMs < .1 ? 0 : length * (.35 + i * .2);
        const center = { x: centroid.x + Math.sin(heading) * offset, y: centroid.y + Math.cos(heading) * offset };
        const along = wind.speedMs < .1 ? 65 + minute * 1.8 : length * (.4 + i * .09);
        const cross = wind.speedMs < .1 ? along : 50 + minute * (1 + i * .3);
        smoke.push(polygon(ellipse(project, center, along, cross, wind.toDeg), {
          id: 'visual-smoke-' + i, base: 20 + i * 45, height: 110 + i * 75, opacity: .24 - i * .04,
          visualOnly: true, synthetic: true, demo: true }));
      }
    }
    return { minute, fireFC: featureCollection(fire), probabilityFC: featureCollection(probability),
      frontFC: featureCollection(front), smokeFC: featureCollection(smoke),
      areaHa: round(fire.length * scenario.metadata.cellSizeM ** 2 / 10000, 2),
      headingToDeg: round(wind.toDeg), windSpeedMs: round(wind.speedMs), windFromDeg: round(wind.fromDeg),
      eventsSoFar: scenario.events.filter(event => event.minute <= minute) };
  }

  scope.WildfireSimulationModel = Object.freeze({ createScenario, getFrame });
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
