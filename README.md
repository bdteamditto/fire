# Forest Watch — แดชบอร์ดสาธิตสำหรับเจ้าหน้าที่

เปิด `forest_watch_dashboard.html` ได้โดยตรงในเบราว์เซอร์ ไม่ต้องต่ออินเทอร์เน็ต ตัวนี้เป็นเดโมจำลองการอัปเดต ไม่ใช่ข้อมูลเซนเซอร์ที่ถ่ายทอดสด

## ทดลองภายในหนึ่งนาที

1. หน้าแรกอยู่ที่เวลา 14:24 น. ของฉากวันที่ 15 มี.ค. 2025 เห็น AQ 3 จุดผิดปกติพร้อมโซนที่ควรตรวจสอบ
2. กด **เล่นเดโม**: ค่าเซนเซอร์ แผนที่ กราฟและลำดับเหตุการณ์เดินตามเวลาจำลอง 1 วินาทีจริง = 1 นาทีจำลอง เลือกความเร็วช้าลงหรือพักได้
3. เลือก AQ บนแผนที่หรือรายการ เพื่อดู PM2.5, CO และแนวโน้ม 10 นาที
4. กด **รับทราบเหตุ (เดโม)**: เปลี่ยนสถานะและเพิ่มรายการในลำดับเหตุการณ์เฉพาะหน้า ยังไม่ยืนยันไฟและไม่ส่งคำสั่งภายนอก
5. เปลี่ยนฉากเป็น **สถานการณ์ปกติ** หรือ **เซนเซอร์ขาดการติดต่อ** เพื่อดูความต่าง ฉากขาดการติดต่อมี Weather 4 และ AQ 4 ตัวขาดข้อมูลตั้งแต่นาที 12 โดยไม่นับเป็นหลักฐานควัน
6. เปิด **แนวลามสมมติ** เพื่อดูเส้น 15/30/60 นาทีตามช่วงเวลาของฉาก เป็นแบบจำลองที่ยังไม่สอบเทียบ

จุดสำคัญบนหน้า: เหตุที่ต้องตรวจสอบ → โซนบนแผนที่ → sensor ที่เป็นหลักฐาน → สิ่งที่ควรทำต่อ ไม่แสดงว่าควันผิดปกติคือไฟที่ยืนยันแล้ว และไม่แปลง PM/CO เป็นความรุนแรงไฟ

## ข้อมูลจริงกับข้อมูลจำลอง

- จริงจากข้อมูลสาธารณะ: ภูมิประเทศ Copernicus, land cover WorldCover 2021, ถนน OSM และลมอ้างอิง ERA5 ย้อนหลังหนึ่งช่วง
- ข้อเสนอ: ตำแหน่ง Weather 100 + AQ 100 จากเดโมเดิม
- จำลอง: PM/CO, การขาดการติดต่อ, เวลาและเหตุการณ์ รวมทั้งแนวไฟลาม
- โซนสีส้มคือกรอบรอบเซนเซอร์ที่ผิดปกติ ไม่ใช่ตำแหน่งต้นเพลิงที่คำนวณย้อนกลับ
- การเล่นพักเมื่อแท็บถูกซ่อน และหยุดที่นาที 60 เพื่อไม่ให้เหตุใหม่เกิดนอกการมองเห็น รีเซ็ตด้วยปุ่มเริ่มใหม่
- รับทราบเหตุเก็บในหน่วยความจำของหน้า รีเฟรช/เปลี่ยนฉาก/เลื่อนย้อนเวลาแล้วรีเซ็ต ไม่มีระบบบันทึกส่วนกลาง

## หากต่อข้อมูล real-time จริง

ต้องเพิ่มบริการรับ telemetry: sensor → LoRaWAN หรือ cellular → MQTT/API → ตรวจหน่วย, timestamp, sensor quality, baseline และ freshness → ส่งข้อมูลเข้า dashboard ผ่าน SSE/WebSocket

ต้องมีสถานะอย่างน้อย `normal`, `suspect`, `confirmed`, `stale/offline` แยกกัน พร้อมสิทธิ์ผู้ใช้ บันทึกผู้รับทราบ และประวัติแก้สถานะจริง ควรสอบเทียบเกณฑ์ PM/CO กับอุปกรณ์และสภาพพื้นที่ก่อนใช้ปฏิบัติการ

ฉบับนี้ไม่ต้องใช้บัญชีหรือ API key ฝั่งผู้ดูเดโม และไม่มีการแจ้งเตือนจริง ใช้เดโมบนเครื่องตามคำขอผู้ใช้ ไม่อัปโหลดและไม่เผยแพร่เว็บไซต์ออนไลน์



## Sensor Network Plan — พื้นที่ใหม่

เพิ่มหน้าสำหรับวางแผนเครือข่ายเซนเซอร์ที่ศูนย์กลาง **19.402722, 101.091000** รัศมี 2 กม. โดยคงฉาก playback เดิมไว้สำหรับทดสอบ logic การแจ้งเตือน

- Existing sensor 3 จุดแสดงเป็นสีเขียว: 2 จุดใช้พิกัดที่ได้รับโดยตรง และจุดที่ 3 เป็นตำแหน่งประมาณจากแผนที่ที่แนบมา
- Hotspot อ้างอิง 3 จุดใช้พิกัดจากภาพ VIIRS ที่แนบมา
- Proposed sensor N1–N7 แสดงเป็นสีน้ำเงินภายในวง 2 กม.
- N1–N3 เป็น Core deployment; N4–N7 เป็น Expansion
- แผนที่ planning ใช้ Esri Topographic ผ่าน HTTPS เป็นค่าเริ่มต้น เลือก OpenTopoMap (contour) หรือ OpenStreetMap ได้
- พิกัด N1–N7 เป็น candidate planning coordinates ไม่ใช่พิกัดก่อสร้าง ต้องตรวจ ridge / saddle / drainage, ความโล่งรับลม, ถนนเข้าถึง และความปลอดภัยหน้างานก่อนติดตั้งจริง

ไฟล์ที่เพิ่ม: `plan.js` และส่วน UI/CSS ใน `index.html` / `style.css`


### Basemap recovery

Leaflet 1.9.4 (including CSS, control images and its license) is served locally from `vendor/leaflet/`; no CDN is required. Esri Topographic is the default HTTPS basemap. A tile error or a 12-second timeout without a successful tile switches either terrain provider to OSM standard at https://tile.openstreetmap.org/{z}/{x}/{y}.png. OSM failures show an accessible Thai status message; vectors, the 2 km circle, sensor details and the table remain available. Provider switching resets status so a recovered connection can load again. OpenTopoMap is optional and uses maxNativeZoom 17 with overzoom to 19.

GitHub Pages and all tile URLs use HTTPS. No CSP is defined in index.html; if adding a CSP or using a filtering proxy, allow images from server.arcgisonline.com, *.tile.opentopomap.org and tile.openstreetmap.org (plus same-origin Leaflet assets and data URLs). Do not use a no-referrer policy for OSM requests. Esri topography is not a substitute for the optional contour layer or a surveyed DEM.

The map must call setView(center, 14) before adding the circle and reading circle.getBounds(). Without an initial view Leaflet defers layer attachment, so getBounds throws while accessing layerPointToLatLng and initialization stops on a gray map.

Validated in a headless Edge browser: live Esri tiles, simulated provider failure → OSM, blocked Esri + OSM with visible status, hanging Esri requests → OSM after 12 seconds, missing Leaflet with working N1–N7 table, and a 390 px mobile viewport. Marker counts remain 7 proposed, 3 existing, 3 hotspots; focus/all buttons and sensor details work. No runtime errors in the corrected app.

## Version 4 — DEM-driven sensor placement

Network Plan เปลี่ยนจากการสร้าง N8–N21 ด้วย bearing/radius รอบ H-01/H-02/H-03 เป็น candidate-selection model ที่ใช้ภูมิประเทศและ network observability เป็นตัวขับหลัก

- Candidate grid 100 จุดครอบคลุมพื้นที่ศึกษา
- ดึง elevation จาก **Open-Meteo Elevation API** ซึ่งอ้างอิง **Copernicus DEM 2021 GLO-90 (90 m)** แล้วสุ่มอ่านค่ารอบ candidate เพื่อคำนวณ planning-scale slope / aspect / local relief
- คำนวณคะแนน 4 ด้านหลัก: terrain suitability, smoke interception ตามลมอ้างอิง, historical hotspot relevance และ coverage gain เทียบ sensor เดิม/จุดที่เลือกไปแล้ว
- ใช้ greedy spacing/coverage selection เพื่อเลือก 21 จุด โดยไม่กำหนด 7 จุดต่อ hotspot
- Auto-assign functional role: Fusion Node, Ridge/Saddle Weather, Valley Wind, Boundary Weather, High-risk AQ และ Reference/Super Station
- Core / Expansion เป็น deployment phase อีกมิติหนึ่ง ไม่ใช่ชนิด sensor
- H-01/H-02/H-03 ถูกใช้เป็น **historical validation events** สำหรับ synthetic replay ไม่ใช่ zone center
- เพิ่ม Sensor Suitability layer, Network Geometry Blind Spots และ Probable Source Area demo
- Probable Source Area เป็นการ backtrack จาก synthetic first detections ด้วยลมอ้างอิง 261° → 81°; เป็น planning demo และไม่ได้สอบเทียบกับเหตุจริง

### ข้อจำกัด Version 4

คะแนนยัง **ไม่รวม** road/accessibility, solar exposure, radio/LoRa/cellular link budget, land ownership, vegetation obstruction หรือ field safety เพราะยังไม่มี survey data ที่พอสำหรับให้คะแนนอย่างมีหลักฐาน หน้าเว็บจึงแสดงสิ่งเหล่านี้เป็น field checks ที่ต้องทำก่อนเลือกพิกัดก่อสร้างจริง

หาก Open-Meteo Elevation API ใช้งานไม่ได้ หน้า Network Plan จะ fallback ไปใช้ wind + historical risk + network geometry และแสดงสถานะชัดเจนว่า DEM ไม่พร้อม แทนการสร้างค่า elevation ปลอม

Data attribution: Open-Meteo Elevation API / Copernicus DEM 2021 GLO-90, Esri Topographic, OpenTopoMap, OpenStreetMap.

## Version 5 — WorldCover + OSM + Gateway + Budget optimizer

Version 5 ต่อจาก DEM-driven planning โดยเพิ่มข้อมูลและข้อจำกัดด้านการติดตั้งจริงเข้าในตัวเลือกเครือข่าย

### ข้อมูลที่ optimizer ใช้

- **Copernicus DEM / Open-Meteo Elevation**: ใช้ elevation และตัวแปร terrain จาก Version 4
- **ESA WorldCover 2021 v200**: อ่าน land-cover class จาก Cloud Optimized GeoTIFF (COG) บน AWS Open Data; ใช้ Tree cover / Shrubland / Grassland / Cropland ฯลฯ เป็น fuel-context และ siting-context score
- **OpenStreetMap / Overpass API**: คำนวณระยะ candidate ถึง highway / track / path และอ่าน mast/tower ที่มี tag ใน OSM เพื่อเป็น backhaul context
- **Historical H-01 / H-02 / H-03**: ใช้เป็น validation/risk context ไม่ใช่จุดศูนย์กลางของ network
- **Network geometry**: ใช้ spacing / coverage gain เพื่อไม่ให้ sensor ซ้ำตำแหน่งกันมากเกินไป
- **Gateway planning proxy**: เลือก gateway candidate จาก elevation + OSM access + node coverage + tagged mast proximity หากมี

WorldCover WMS ที่แสดงบน optimizer map เป็น **visual overlay เท่านั้น**; การให้คะแนน land cover ใช้ค่าจาก COG โดยตรง เนื่องจาก WMS เป็น RGB imagery และไม่เหมาะสำหรับวิเคราะห์ class value.

### Budget optimizer

ผู้ใช้กำหนดงบประมาณรวม VAT, objective และ planning radio range แล้วระบบเลือกจำนวน/ตำแหน่งของ

- Reference / Super Station
- Fusion node
- Weather node
- AQ / Smoke node
- Gateway planning sites

ผลลัพธ์มี BOQ และ selected-site table พร้อม export CSV.

ราคาที่ hard-code เป็นราคาก่อน VAT จาก quotation **QT2609099**:

- RK900-12ABAM5++ = 62,000 บาท
- RK120-01CAB2500 = 12,500 บาท
- RK330-01ADB3000 = 5,200 บาท
- RK300-02DBBA3000 = 7,800 บาท

Fusion package ใน Version 5 คิดจาก RK120-01 + RK330-01 + RK300-02. AQ package คิดจาก RK300-02. Weather package คิดจาก RK120-01 + RK330-01. Super Station ใช้ RK900-12ABAM5++.

**ไม่เดาราคาที่ไม่มีใน quotation:** Gateway, pole, solar/battery, enclosure, civil work, cabling, SIM/data plan, installation, calibration, maintenance และ RK300-08 multi-gas จะแสดงเป็น editable allowance หรือยังไม่รวมใน BOQ จนกว่าจะมีราคาอ้างอิง.

### Radio / gateway limitation

วง gateway เป็นระยะ planning ที่ผู้ใช้กำหนดเอง ไม่ใช่ RF coverage ที่รับรองแล้ว. Version 5 ยังไม่ได้ใช้ antenna gain, frequency, Fresnel clearance, vegetation attenuation, tower height, terrain line-of-sight หรือ field RSSI test จึงต้องทำ RF/site survey ก่อนออกแบบก่อสร้างจริง.

### Fallback behavior

- ถ้า WorldCover COG โหลดไม่ได้: land-cover score ใช้ neutral 50 และ UI ระบุว่า WorldCover unavailable
- ถ้า Overpass โหลดไม่ได้: access/backhaul score ใช้ neutral value และ UI ระบุว่า OSM unavailable
- ถ้า DEM จาก Version 4 ไม่พร้อม: optimizer ยังทำงานได้ แต่ confidence ลดลงตามข้อมูลที่ขาด

Data attribution: ESA WorldCover 2021 v200 (CC-BY 4.0), OpenStreetMap contributors, Copernicus DEM / Open-Meteo Elevation API.


## Version 6 — 3D Operational Terrain & Access

Version 6 เพิ่มแผนที่ปฏิบัติการ 3 มิติสำหรับอ่านภูมิประเทศและเส้นทางเข้า–ออกพื้นที่ โดยยังคง Network Plan และ Budget Optimizer เดิมไว้เป็นชั้นวางแผน/จัดงบ.

### 3D terrain stack

- **MapLibre GL JS** สำหรับ WebGL 3D terrain
- **Terrarium DEM tiles** จาก AWS elevation tiles เพื่อยกภูมิประเทศ
- **maplibre-contour** สร้าง contour vector tiles ฝั่ง browser จาก DEM เดียวกัน
- Satellite base = Esri World Imagery
- Topographic alternative = OpenTopoMap
- Hillshade + contour + terrain exaggeration ปรับได้ 1.0–2.2×

### Access & suppression layers

ข้อมูล OSM/Overpass ขยายจาก Version 5 ให้รวม:

- highway / service / unclassified / residential
- forest track / path / footway / steps
- surface / smoothness / tracktype / access / motor_vehicle / oneway
- barriers
- fire station
- fire hydrant
- spring / mapped water body
- helipad / heliport
- parking / mapped staging candidate
- turning circle
- communication mast/tower

ถนนถูกแยก visual class เป็น major road / road / track / path และ access=private/no ที่พบใน OSM ถูก highlight แยกเพื่อไม่ให้ routing ใช้เป็นเส้นทางปกติ.

### Access / Egress routing

Access Planner รองรับ 3 planning profiles:

- รถทั่วไป
- 4x4 / forest track
- เดินเท้า

ผู้ใช้เลือก target ได้จาก historical hotspot, selected sensor site หรือคลิก custom fire point บนแผนที่. จุดเริ่มสามารถใช้ Auto staging (จุดบน main road ที่เชื่อม network และใช้เวลาเดินทางต่ำ) หรือคลิกกำหนดเอง.

Routing เป็น graph search ภายใน browser จาก OSM road geometry:

- คำนวณ **Access route** จาก staging/main road → target access point
- คำนวณ **Egress route** จาก target access point → main road แยกจากกัน เพื่อรองรับ oneway ที่ map ไว้
- ช่วงสุดท้ายจาก road/track network ถึง target แสดงเป็น **off-road approach**
- แสดง route distance, estimated travel time, off-road distance, elevation gain และ max grade จาก sampled elevation

ความเร็วเป็น planning assumptions ตาม road class/profile ไม่ใช่เวลาถึงเหตุจริง.

### Route-based access score

Optimizer Version 5 ถูกอัปเกรดให้ access score ไม่ได้ใช้เพียงระยะตรงถึงถนนอีกต่อไป. ระบบสร้าง OSM access graph และใช้ generalized network distance จาก candidate ไปยัง main-access road ร่วมกับ off-road distance เพื่อปรับคะแนนตำแหน่ง sensor.

### Suppression mode

Suppression mode เปิด slope screening, road/track/path, mapped support point และ operational route พร้อมกัน เพื่อให้ดูภูมิประเทศกับการเข้าถึงในภาพเดียว.

**ข้อจำกัดสำคัญ:** OSM เป็น volunteered geographic data; road/path/support/barrier อาจไม่ครบหรือไม่เป็นปัจจุบัน. 3D terrain และ slope screen เป็น planning support เท่านั้น. Route ไม่ได้รวม live fire perimeter, smoke visibility, falling trees, bridge load, road closure, recent landslide, field command, crew capability หรือ tactical safety. ต้อง field-verify และใช้ SOP/incident command ก่อนการใช้งานปฏิบัติการจริง.

Data attribution: OpenStreetMap contributors, MapLibre GL JS, maplibre-contour, AWS elevation tiles / Terrarium DEM, Esri World Imagery, OpenTopoMap, Copernicus DEM / Open-Meteo Elevation, ESA WorldCover 2021.


## wildfire versions

- `wildfire v.0`: original dashboard at `/fire/`; only its displayed name changes.
- `wildfire v.1`: customer presentation at `/fire/wildfire-v1/`. Operational 3D appears first, followed by the complete original DEM-driven 2D Network Plan. The first playback map and Budget Optimizer/BOQ section are excluded. No financial JavaScript or quotation data loads in v.1.
- v.1 includes latitude/longitude inputs for the fire point and travel starting point. The shared Network Plan initializes 3D independently of elevation, Leaflet and OSM enrichment. DEM and OSM requests are bounded; missing optional contour/terrain data keeps the map usable, and devices without WebGL receive an explicitly identified 2D fallback.
- Both maps use the latest 21-site Network Plan, including the same N01–N21 identities, coordinates, roles and terrain metadata, plus the same three existing sensors and three historical hotspots. The obsolete 34-site/5-gateway demonstration reference is no longer loaded. Valid DEM results are cached; a failed refresh retains the latest saved plan and labels it as cached.
- Shared point controls show all points, sensors only, or historical hotspots only, and select existing/RS/FU/RW/VW/BW/AQ sensor types. Filtering changes both maps together and leaves the planned site coordinates, counts, tables and route targets unchanged.
- Ridge/valley interpretation uses the original GLO-90 local-relief proxy. Strongly contradicted ridge/valley roles are exchanged with suitable selected sites without moving or renumbering locations. Missing elevation keeps roles provisional; EX-03 remains the original approximate reference coordinate.
- Run `node tests/point-plan.cjs` for coordinate, category, terrain-role, cached-data and routing-target regressions.
