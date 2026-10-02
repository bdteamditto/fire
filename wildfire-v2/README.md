# WILDFIRE V.02

Customer demo of an assumed wildfire ignition, illustrative spread over 120 minutes, synthetic station responses, and a vehicle-to-walking access journey. Open `wildfire-v2/` from the repository's HTTP server or GitHub Pages deployment; serve the whole repository so the parent `style.css` and `vendor/` assets are available. A direct `file://` opening is not the supported worker/asset setup.

V.02 is a separate page. The root page and `wildfire-v1/` remain separate versions. V.02 retains the complete 2D Network Plan after the operational map and has no budget, pricing, or BOQ section.

## Demo usage

1. In the Access Planner, choose a historical hotspot or a planned sensor as the target, click **กำหนดจุดไฟบนแผนที่**, or enter Latitude/Longitude in decimal WGS84. **Auto** for the fire target samples a point inside the planning bounds; it does not identify a real fire. Fire Auto and start/staging Auto are separate controls.
2. Press **ทดลองหากเกิดไฟป่า**. The controller calculates 24 seeded illustrative scenarios, picks a new synthetic baseline wind, and starts playback. A new scene uses a wind direction in 0–360° and baseline speed in 0.8–5.0 m/s, with subsequent synthetic changes over time and between stations.
3. Use **พัก** to pause, the minute slider to inspect any minute from 0 to 120, and **เล่นต่อ** to resume. Scrubbing pauses playback. **เริ่มเวลาใหม่** returns to minute 0 in the same scene; **สุ่มลมฉากใหม่** recalculates with new wind and a new seed. Playback speeds are 1, 4, or 8 simulated minutes per second. Leaving the visible tab pauses playback; return and resume explicitly.
4. Inspect the fire, smoke, conditional-probability overlays, first synthetic detection, station readings, and event cards. Click an alert or event's station ID to focus its position. Turning off smoke/probability changes the display only.
5. Use the shared All/Sensors/Hotspots filters and sensor-type selector to compare points on both maps. The simulation still evaluates every station even when a category is hidden. Alert markers obey the visible sensor category and sensor-layer toggle.

Changing the ignition or the selected sensor/terrain inputs clears the old scenario, including a calculation still in progress. Changing the journey's start point, a display filter, or OSM road availability does not change an already calculated fire scene.

## Reading the results

The probability at a grid cell is the share of the **24 ensemble members that reach that cell by the selected minute, conditional on the supplied ignition and demo assumptions**. It is not the chance that a fire will ignite there, and it is not a calibrated forecast. Each member contributes about 4.17 percentage points; the displayed color bins are 1–49%, 50–79%, and 80–100%. The main fire footprint and area describe representative member 0; smoke/flame heights are illustrative visual geometry.

The timeline records a station's first synthetic threshold crossing. The demo uses ΔPM2.5 > 25 µg/m³ and, only when the station package includes CO, ΔCO > 0.2 ppm. These thresholds and signal amplitudes have not been calibrated to hardware or real incidents. A scene with no detection within 120 minutes can indicate a modeled coverage gap or wind direction; it does not establish that the area is fire-free.

| Code | Station role | Synthetic response in this demo |
| --- | --- | --- |
| EX | Existing sensors, green EX-01–EX-03 | PM2.5 only is assumed when the installed package is unspecified; no invented CO reading. The assumption is disclosed in alerts. |
| RS | Reference / Super Station | PM2.5 reference response without CO, plus wind, temperature, and RH. |
| FU | Fusion Node | PM2.5 and CO according to the proposed package, plus wind, temperature, and RH. |
| RW | Ridge / Saddle Weather | Wind, temperature, and RH; no smoke-detection alert. |
| VW | Valley Wind | Wind, temperature, and RH; no smoke-detection alert. |
| BW | Boundary Weather | Wind, temperature, and RH; no smoke-detection alert. |
| AQ | AQ / Smoke | PM2.5 and CO according to the proposed package; no synthetic weather-station history. |

Capabilities follow an explicitly supplied package when present. A package that lacks a PM or CO channel does not receive that channel merely because of its role. All V.02 wind histories, temperatures, humidity, smoke signals, and detection times are synthetic, not telemetry. The retained 2D Historical Replay uses its original 261° → 81° reference wind and is separate from V.02's newly randomized fire scenes.

The 2D and 3D maps share the latest planned N01–N21 sites, station roles, and the three existing reference sensors. EX-03's coordinate remains approximate.

## Vehicle handoff and walking routes

Select **รถทั่วไป**, **4x4 / forest track**, or **เดินเท้า**. Set **จุดเริ่มต้นการเดินทาง** by map click or coordinates, or use start Auto to find a connected major-road staging point. Press **คำนวณ Access / Egress Route**.

For vehicle profiles the journey panel separates the drive, the vehicle handoff/parking coordinate, mapped walking continuation, and any remaining off-road approach. The car/person markers and the handoff coordinate button focus those locations. A walking profile shows the walking network directly. The legend distinguishes access, egress, mapped walking, and off-road connectors; access and egress are solved independently using the available directed road graph.

Off-road lines are approximate connectors, not surveyed paths. A manual start away from the network can include an approximate connector to the road. Travel times, elevations, and grades are planning estimates. Route geometry uses available OSM ways and access metadata; missing roads, restrictions, barriers, or disconnected data can prevent a route. The vehicle handoff is a computed network endpoint, not a confirmed safe parking/staging site. Routes do not avoid the simulated fire dynamically and do not establish a safe evacuation route.

## Dependencies and fallbacks

| Component | Dependency | Failure behavior |
| --- | --- | --- |
| Map runtime | Repository-local MapLibre GL JS 5.6.2, Leaflet, and `maplibre-contour` 0.1.0 in `../vendor/` | If MapLibre/WebGL initialization fails, the operational view falls back to Leaflet 2D with coordinates and routing retained. Smoke/fire/probability become flat overlays; 3D extrusion is unavailable. |
| Contours and 3D elevation | AWS Terrain Tiles, Terrarium encoding | Contours are optional. Contour failure disables contour lines; DEM failure disables terrain/hillshade while retaining the base map and points. |
| Base maps and labels | Esri World Imagery, OpenTopoMap, OSM raster tiles, MapLibre demo font glyphs | A selected raster source error switches the operational map to OSM. External tiles still require network access; this is not a packaged offline base map. |
| Network Plan elevations | Copernicus GLO-90 via Open-Meteo Elevation API | A validated local cache can retain the latest DEM plan. A bounded refresh failure reports cached DEM or uses wind/risk/network-geometry fallback. Without valid elevation samples, the fire model records terrain as unavailable rather than inventing it. |
| Roads/support | Public Overpass instances at `overpass-api.de`, then `overpass.kumi.systems` | Bounded 12-second requests and validated local cache with visible provenance. If no usable road graph is available, routing reports unavailable; it does not fabricate a road route. |
| Route elevation profile | Open-Meteo Elevation API | A failed bounded elevation request leaves elevation gain/grade unavailable while keeping the calculated route. |
| Fire calculation | Local `fire-model.js`, normally through `fire-worker.js` | Missing/blocked worker support or a worker error falls back to the same local model on the main thread. A missing model reports an error. |
| Saved data | Browser `localStorage` | Storage failures are tolerated; live data/fallbacks still work, but a saved cache may be unavailable. |

The runtime scripts are local assets, so loading MapLibre/contour does not depend on an external JavaScript CDN. External mapping/data services remain dependencies. Use the on-page status messages to distinguish live, cached, and unavailable inputs.

## Model limitations

- This is a presentation model, not a Rothermel/FARSITE implementation, operational forecast, or calibrated fire/smoke model.
- It assumes uniform burnable fuel and uses illustrative spread coefficients. It has no measured fuel moisture, fuel inventory, spotting, crown-fire, structure, or suppression model.
- Terrain effects use nearby coarse Network Plan DEM sample gradients when available. The 3D rendered surface is a separate Terrarium DEM; seeing detailed 3D terrain does not improve the simulation's coarse input resolution.
- The local 57 × 57 grid and 120-minute horizon bound the scene. Ensemble probabilities reflect the selected demo variations, not validated forecast uncertainty.
- Smoke plume shape, concentration scaling, flame heights, and detection timing are synthetic. No real sensor telemetry or verified alarm is consumed.
- OSM access and planning-scale slope screening require field verification. The simulation does not model responder safety, usable evacuation corridors, or suppression decisions.

## Automated checks

Run from the repository root with Node.js; no package install is required for these suites:

```sh
node tests/fire-simulation.cjs
node tests/simulation-controller.cjs
node tests/journey-routing.cjs
node tests/point-plan.cjs
```

The model suite checks deterministic cloneable ensembles, probability/area progression, geometry and time bounds, wind cases, role/package-safe detections, terrain handling, and the worker protocol. The controller suite checks stale result invalidation, time controls, alert filtering, hidden-tab pause, worker fallback, and Leaflet overlay cleanup. The point-plan suite covers shared site coordinates/roles, filters, target identity, DEM cache/failure behavior, and Auto fire bounds. These automated harnesses do not replace real browser rendering checks.

## Browser QA matrix

This matrix is a checklist for the root integration/browser QA pass. It does **not** record browser results; each row requires observed evidence from the tested build.

| Case | Exercise | Expected evidence |
| --- | --- | --- |
| Desktop fresh load | Load with empty storage; wait for map/data startup | Operational map is visible, statuses describe loading/live/fallback data, no uncaught runtime error. |
| Mobile layout | Test narrow 390px portrait and landscape; scroll controls/results | Coordinate forms, buttons, slider, toast, legend, and journey steps remain readable and usable; map resizes correctly. |
| Map dependencies | Block contour; block DEM; block imagery; test WebGL/MapLibre initialization failure | Optional layers degrade independently; imagery can use OSM; Leaflet fallback remains usable without a blank operational panel. |
| Fire selection | Use hotspot, manual click, valid/invalid coordinates, repeated fire Auto | Accepted target matches the chosen coordinate; invalid input is rejected; Auto stays in bounds and preserves a manual journey start. |
| Playback | Run, pause, resume, scrub backward/forward, reset, finish at minute 120 | Overlay/time/metrics agree; future alerts disappear on rewind; end time is clamped; reset keeps the same scene. |
| New/stale scenarios | Change target or sensor/DEM input while running/computing; change start/filter only; finish initial map/data load | Old calculation cannot reappear after invalidation; display/start changes do not reset the scene; unchanged initial target stays stable. |
| Probability | Compare early/late times and color bins | Conditional 24-member meaning is visible; probabilities correspond to the selected time, with 1–49/50–79/80–100% colors. |
| Station capabilities | Inspect RS, FU, AQ, EX, and weather-only roles | RS/EX PM-only cases have no CO reading; EX assumption is disclosed; RW/VW/BW never generate smoke alerts; readings are labeled synthetic. |
| Alert interactions | Click map alerts while point-pick mode is active; change All/Sensors/Hotspots/type filters and sensor toggle | Alert focuses its station without changing ignition; hidden categories have no alert marker; scene calculations still include every station. |
| Worker/lifecycle | Disable Worker, block worker load, leave/return to the tab | Main-thread fallback completes; hidden playback pauses and does not silently resume. |
| Access journey | Calculate vehicle, 4x4, and foot journeys; inspect handoff; toggle routes; compare directed egress | Visible road/track/path and separate journey segments; handoff coordinate focuses correctly; off-road parts are identified as estimates. |
| Data failures | Block Overpass/elevation with and without valid cache | Cache provenance or unavailable state is explicit; routes are never invented; unavailable elevation does not erase an otherwise valid route. |
| Version preservation | Open V.01/root separately and compare the V.02 Network Plan | Prior versions remain intact; N01–N21 and EX references agree between the two V.02 maps; complete 2D plan remains; V.02 has no pricing/BOQ. |
