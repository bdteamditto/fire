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