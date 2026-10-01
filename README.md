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

## Three-hotspot planning scope
H-01 retains the original center, N1–N7 and 2 km circle. H-02 adds N8–N14 around 19.455640,101.100100; H-03 adds N15–N21 around 19.394840,101.022190. Each zone has 3 Core and 4 Expansion candidates, for 21 new candidates plus the original 3 existing references. All 3 hotspot records are unchanged.

N8–N21 are geographic candidates generated by spherical destination at bearings 65,245,315,155,235,90,0 degrees and radii 1.45,1.35,1.55,1.40,0.85,1.85,1.65 km respectively. Their terrain role is explicitly unverified; these are not surveyed sites or proven detection coverage. Field DEM/contours, winds, access and radio tests must determine actual installation positions. No fixed budget was provided; seven candidates per additional zone is a provisional planning allocation, not a minimum sensor count recommendation.

Zone cards, a zone selector, per-zone focus, hotspot IDs, a zone column and zone-relative distances explain the allocation. Existing sensors keep their coordinates and are associated with the nearest zone only for reference, without assuming they cover that zone. The initial map fits all three circle bounds.
