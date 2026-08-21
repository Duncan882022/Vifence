**VIFENCE – HELMET CAMERA PATROL INTELLIGENCE**

**1. Mục tiêu**

Xây dựng module sử dụng **camera gắn mũ có GPS + timestamp** để giám sát hoạt động tuần tra tại công trường.

Hệ thống tự động:

- Xác định camera đang ở khu vực nào.
- Ghi nhận lộ trình tuần tra.
- Detect người.
- Detect xe/máy thi công.
- Tracking đối tượng.
- Dedup để tránh đếm trùng.
- Đếm người và xe/máy theo từng khu vực.
- Vẽ heatmap mật độ người.
- Vẽ heatmap mật độ xe/máy.
- Detect người không tuân thủ PPE.
- Detect xe/máy không di chuyển liên tục trên 5 giây.
- Tạo sự kiện kèm snapshot, GPS, Zone và Playback.

Module chia thành **3 Tier**:

TIER 1 – DASHBOARD

TIER 2 – CAMERA

TIER 3 – HEATMAP & EVENTS

  


⸻

  


**2. Kiến trúc tổng thể**

HELMET CAMERA

│

├── Video

├── Timestamp

├── GPS

└── Camera ID

        │

        ▼

FRAME + GPS SYNCHRONIZER

        │

        ├───────────────┐

        ▼               ▼

OBJECT DETECTION     GPS ENGINE

        │               │

        ▼               ▼

TRACKING             ZONE ENGINE

        │               │

        ▼               │

RE-ID / DEDUP           │

        │               │

        └───────┬───────┘

                ▼

        OBJECT / ZONE REGISTRY

                │

      ┌─────────┼──────────┐

      ▼         ▼          ▼

   COUNTING   HEATMAP    EVENT ENGINE

      │         │          │

      └─────────┼──────────┘

                ▼

             BACKEND

                │

      ┌─────────┼──────────┐

      ▼         ▼          ▼

   TIER 1     TIER 2     TIER 3

 Dashboard    Camera    Analytics

  


⸻

  


**3. TIER 1 – DASHBOARD**

**3.1 Mục tiêu**

Cho phép quản lý nhìn nhanh tình trạng của một phiên tuần tra.

Dashboard có **4 KPI chính**.

**KPI 1 – Người ghi nhận**

183

NGƯỜI GHI NHẬN

Là số **unique person** hệ thống đã quan sát trong phiên tuần tra sau khi Dedup.

Không lấy tổng detection.

Không lấy tổng Track ID.

Công thức:

Detection

→ Tracking

→ Re-ID

→ Global Person ID

→ Unique Count

Ví dụ:

Track #21

Track #58

Track #105

      ↓

    Re-ID

      ↓

PERSON_001



COUNT = 1

  


⸻

  


**3.2 KPI 2 – Xe & máy ghi nhận**

37

XE & MÁY GHI NHẬN

Là số unique:

Car

Truck

Motorcycle

Excavator

Loader

Crane

Forklift

Concrete Mixer

Other Equipment

sau Tracking + Dedup.

  


⸻

  


**3.3 KPI 3 – Độ phủ tuần tra**

Ví dụ:

8 / 10

KHU VỰC ĐÃ TUẦN TRA



80%

Không coi camera chỉ đi ngang qua Zone là đã tuần tra.

Rule:

Camera GPS nằm trong Zone

+

Có video hợp lệ

+

Dwell Time >= 10 giây

        ↓

Zone = VISITED

Zone có trạng thái:

NOT_VISITED

VISITED

  


⸻

  


**3.4 KPI 4 – Thời gian tuần tra**

Ví dụ:

47 phút

THỜI GIAN TUẦN TRA

Backend lưu:

elapsed_time

active_patrol_time

Ưu tiên hiển thị:

active_patrol_time

  


⸻

  


**4. Dashboard Layout**

┌────────────────┬────────────────┬────────────────┬────────────────┐

│ 👤 183         │ 🚚 37          │ 📍 8 / 10      │ ⏱ 47 phút      │

│ Người ghi nhận │ Xe & máy       │ Độ phủ tuần tra│ Thời gian      │

│                │ ghi nhận       │ 80%            │ tuần tra       │

└────────────────┴────────────────┴────────────────┴────────────────┘

Bên dưới có thể hiển thị:

Phiên tuần tra hiện tại

Camera đang hoạt động

Số sự kiện

Zone đông người nhất

Zone nhiều xe/máy nhất

Nhưng không tạo thêm KPI chính.

  


⸻

  


**5. TIER 2 – CAMERA**

Logic UI tương tự module ATLĐ hiện tại.

**5.1 Camera List**

Hiển thị:

Camera

Trạng thái

Zone hiện tại

GPS

Phiên tuần tra

Thời gian hoạt động

Ví dụ:

Helmet Cam 01     ONLINE     Zone A

Helmet Cam 02     ONLINE     Zone C

Helmet Cam 03     OFFLINE    -

  


⸻

  


**6. Camera Detail**

Click camera mở Camera Detail.

Bao gồm:

LIVE VIEW

PLAYBACK

GPS

ZONE

AI OVERLAY

PATROL ROUTE

EVENT TIMELINE

  


⸻

  


**7. Live View**

Hiển thị video realtime.

AI Overlay:

Person #P023

Person #P024

Excavator #M018

Truck #V011

Bounding Box có:

Object Type

Tracking ID

Confidence

Event Status

Toggle:

[ Bounding Box ]

[ Tracking ID ]

[ AI Event ]

  


⸻

  


**8. Playback**

Cho phép:

Chọn ngày

Chọn thời gian

Timeline

Play / Pause

Speed

Jump to Event

Event marker được đặt trực tiếp trên timeline.

Ví dụ:

09:20 ───── ● ───────── ● ─────────── 09:40

             PPE          MACHINE STOP

Click event:

Jump playback → thời điểm xảy ra event

  


⸻

  


**9. GPS & Zone**

Camera gửi:

latitude

longitude

timestamp

accuracy

Mỗi Site có các Zone dạng GPS Polygon.

Ví dụ:

{

  "zone_id": "ZONE_A",

  "name": "Khu thi công móng",

  "polygon": [

    [20.981001, 105.812001],

    [20.981201, 105.812020],

    [20.981220, 105.812320],

    [20.980990, 105.812300]

  ]

}

Backend:

Camera GPS

↓

Point-in-Polygon

↓

ZONE_A

  


⸻

  


**10. GPS Trail**

GPS camera được lưu định kỳ.

POC:

GPS_SAMPLE_INTERVAL = 2 giây

Frontend nối GPS point thành:

PATROL ROUTE

Trên Site Map hiển thị:

Current Camera Position

+

Historical Patrol Trail

  


⸻

  


**11. TIER 3 – ANALYTICS**

Tier 3 có 2 tab:

[MẬT ĐỘ]     [SỰ KIỆN]

  


⸻

  


**12. TAB MẬT ĐỘ**

Site Map hiển thị:

People Heatmap

Vehicle Heatmap

Zone Count

Patrol Coverage

Patrol Route

Layer switch:

[ Người ]

[ Xe & Máy ]

[ Tổng hợp ]

[ Lộ trình tuần tra ]

  


⸻

  


**13. People Heatmap**

POC V1 sử dụng **Zone Heatmap**.

Không cần xác định GPS chính xác của từng người.

Logic:

Camera GPS

↓

Zone

↓

Person Detection

↓

Tracking

↓

Dedup

↓

People Count

↓

Zone Density

Ví dụ:

ZONE A

👤 42



ZONE B

👤 18



ZONE C

👤 61

  


⸻

  


**14. Vehicle Heatmap**

Tương tự People:

ZONE A

🚚 8



ZONE B

🚚 3



ZONE C

🚚 14

Có thể tách:

Car

Truck

Excavator

Crane

Loader

Other

nhưng KPI tổng sử dụng:

Vehicle / Equipment

  


⸻

  


**15. Mật độ**

Nếu có diện tích Zone:

people_density =

people_count / zone_area_m2

vehicle_density =

vehicle_count / zone_area_m2

Heatmap nên hỗ trợ:

Số lượng

Mật độ

  


⸻

  


**16. Current Count và Unique Count**

Bắt buộc tách hai khái niệm.

**Current / Latest Scan**

Ví dụ:

Zone A



Hiện thấy:

24 người

6 xe/máy

**Unique trong phiên tuần tra**

Zone A



Đã ghi nhận:

31 unique people

8 unique vehicles

Không dùng Unique Count để biểu diễn số người đang hiện diện.

  


⸻

  


**17. Tracking**

Sử dụng:

YOLO

+

BoT-SORT

hoặc:

YOLO

+

ByteTrack

Ưu tiên:

YOLO + BoT-SORT

Một object xuất hiện qua nhiều frame:

Frame 1 → Person #37

Frame 2 → Person #37

Frame 3 → Person #37

...

chỉ count:

1 person

  


⸻

  


**18. Re-ID & Dedup**

Camera mũ liên tục di chuyển nên Track ID không đủ.

Ví dụ:

Person #37

↓

Camera quay đi

↓

Person mất khỏi frame

↓

Camera quay lại

↓

Person #82

Re-ID phải xác định:

Track 37 = Track 82

và tạo:

Global Object:



PERSON_00023

  


⸻

  


**19. Person Dedup**

Có thể sử dụng:

Appearance Embedding

Shirt Color

Pants Color

Helmet Color

Object Class

Zone

Timestamp

Rule POC:

Same Object Class

AND

Same Zone

AND

Visual Similarity >= threshold

AND

Time Gap <= threshold

Không sử dụng Face Recognition trong POC.

  


⸻

  


**20. Vehicle Dedup**

Xe/máy sử dụng:

Vehicle Re-ID

Vehicle Type

Color

Appearance

Zone

Timestamp

License Plate nếu nhìn thấy

Priority:

License Plate

↓

Vehicle Re-ID

↓

Type + Color + Time + Zone

  


⸻

  


**21. TAB SỰ KIỆN**

POC có 2 nhóm event chính:

PPE VIOLATION

MACHINE STOPPED

  


⸻

  


**22. PPE Event**

AI detect:

Person

↓

Tracking

↓

PPE Detection

↓

Check PPE

Các PPE có thể kiểm tra:

Helmet

Safety Vest

Các PPE khác bổ sung theo khả năng camera.

  


⸻

  


**23. PPE Event Rule**

Không tạo event ngay ở frame đầu tiên.

Logic:

Person detected

↓

Tracking ổn định

↓

Missing PPE

↓

PENDING

↓

Vi phạm liên tục >= PPE_CONFIRM_SECONDS

↓

LOCK EVENT

Default:

PPE_CONFIRM_SECONDS = 5

Config được theo từng rule.

  


⸻

  


**24. PPE Event Dedup**

Một người thiếu PPE xuất hiện 100 frame không được tạo 100 event.

Event Key:

global_person_id

+

violation_type

+

zone_id

Nếu event đang active:

UPDATE EXISTING EVENT

Không:

CREATE NEW EVENT

  


⸻

  


**25. PPE Event Data**

Ví dụ:

EVT-00128



Loại:

Không đội mũ bảo hộ



Camera:

Helmet Cam 03



Zone:

Zone B



Thời gian:

09:32:18



Object:

PERSON_0023



Status:

LOCKED



Snapshot

Playback

GPS

Confidence

  


⸻

  


**26. MACHINE STOPPED Event**

Mục tiêu:

Nếu hệ thống quan sát một xe/máy liên tục và xác định máy không di chuyển quá 5 giây thì khóa sự kiện dừng máy.

Logic:

Machine detected

↓

Tracking

↓

Estimate Object Motion

↓

Machine không di chuyển

↓

PENDING

↓

>= 5 seconds

↓

LOCK MACHINE_STOPPED EVENT

Default:

MACHINE_STOP_SECONDS = 5

  


⸻

  


**27. Camera Motion Compensation**

Camera mũ đang di chuyển nên KHÔNG được dùng đơn thuần:

bbox displacement

để kết luận máy có di chuyển hay không.

Ví dụ:

Máy xúc đứng yên

+

Người đeo camera đang đi

↓

BBox máy xúc vẫn di chuyển trong frame

Do đó cần:

Video Frame

↓

Estimate Camera Motion

↓

Camera Motion Compensation

↓

Estimate Relative Object Motion

↓

Machine Motion State

  


⸻

  


**28. Machine Stop Rule**

Pseudo:

Machine continuously detected

AND

Track stable

AND

Compensated motion < MOTION_THRESHOLD

AND

Duration >= 5 seconds

        ↓

MACHINE_STOPPED

  


⸻

  


**29. Machine Event Lifecycle**

Ví dụ:

00s

Machine detected



↓

DETECTED



02s

Machine still stationary



↓

PENDING



05s

Machine still stationary



↓

LOCKED



12s

Machine moves



↓

ENDED

  


⸻

  


**30. Event State**

Tất cả AI Event dùng chung lifecycle:

DETECTED

↓

PENDING

↓

LOCKED

↓

ENDED

Ý nghĩa:

**DETECTED**

AI vừa phát hiện điều kiện.

**PENDING**

Đang chờ đủ thời gian xác nhận.

**LOCKED**

Đủ điều kiện tạo sự kiện chính thức.

**ENDED**

Điều kiện vi phạm/dừng máy không còn tồn tại.

  


⸻

  


**31. Machine Event Data**

{

  "event_id": "EVT-00143",

  "event_type": "MACHINE_STOPPED",

  "object_id": "VEHICLE_0021",

  "zone_id": "ZONE_C",

  "camera_id": "HELMET_02",



  "started_at": "2026-08-20T09:42:11+07:00",

  "locked_at": "2026-08-20T09:42:16+07:00",

  "ended_at": "2026-08-20T09:42:23+07:00",



  "duration_seconds": 12,



  "status": "ENDED",



  "snapshot_url": "...",

  "playback_url": "...",



  "gps": {

    "lat": 20.981102,

    "lng": 105.812115

  }

}

  


⸻

  


**32. Event List UI**

Tier 3 → Sự kiện:

┌────────────────────────────────────────────────────────────┐

│ Thời gian │ Sự kiện       │ Zone │ Camera │ Trạng thái    │

├────────────────────────────────────────────────────────────┤

│ 09:42:16  │ Máy dừng      │ C    │ HC-02  │ Đã kết thúc   │

│ 09:32:18  │ Thiếu mũ PPE  │ B    │ HC-03  │ Ghi nhận      │

│ 09:21:04  │ Thiếu áo PPE  │ A    │ HC-01  │ Ghi nhận      │

└────────────────────────────────────────────────────────────┘

Filter:

Thời gian

Camera

Zone

Event Type

Status

  


⸻

  


**33. Event Detail**

Click Event mở:

Snapshot



Event Type

Timestamp

Camera

Zone

GPS

Object ID

Duration

Confidence

Status

Actions:

[ Xem Playback ]

[ Xem trên bản đồ ]

Playback tự jump về:

event_started_at - 5 seconds

và tiếp tục:

event_ended_at + 5 seconds

  


⸻

  


**34. Event Snapshot**

Khi event chuyển:

PENDING → LOCKED

hệ thống lưu:

Snapshot

Timestamp

GPS

Zone

Camera

Object Bounding Box

Event Type

Có thể lưu clip:

5 giây trước event

+

event duration

+

5 giây sau event

  


⸻

  


**35. Patrol Session**

Mỗi lần bắt đầu tuần tra:

CREATE PATROL SESSION

Ví dụ:

{

  "patrol_session_id": "PATROL_20260820_0800",

  "camera_id": "HELMET_03",

  "started_at": "2026-08-20T08:00:00+07:00",

  "ended_at": null,

  "status": "ACTIVE"

}

Mọi dữ liệu phải liên kết với:

site_id

patrol_session_id

camera_id

  


⸻

  


**36. Zone Object Registry**

Mỗi Zone lưu:

{

  "zone_id": "ZONE_A",



  "latest_scan": {

    "people_current": 24,

    "vehicles_current": 6,

    "timestamp": "..."

  },



  "patrol_session": {

    "unique_people": 31,

    "unique_vehicles": 8

  },



  "coverage": {

    "visited": true,

    "dwell_seconds": 186,

    "last_visit": "..."

  }

}

  


⸻

  


**37. GPS Boundary Handling**

GPS có thể nhảy giữa 2 Zone.

Không switch ngay.

Rule:

GPS vào Zone B

↓

Wait

↓

GPS liên tục trong Zone B >= 5s

↓

Current Zone = Zone B

Default:

ZONE_SWITCH_CONFIRM_SECONDS = 5

  


⸻

  


**38. GPS Accuracy**

Nếu:

GPS Accuracy <= 15m

cho phép gán Zone.

Nếu accuracy quá thấp:

zone_confidence = LOW

Nếu mất GPS lâu:

Không gán object mới vào Zone

nhưng vẫn tiếp tục:

Detection

Tracking

Event Detection

  


⸻

  


**39. Database**

Các bảng chính:

sites

zones



helmet_cameras

patrol_sessions

patrol_gps_points



object_tracks

global_objects

object_observations



zone_scan_sessions

zone_statistics



ai_events

event_snapshots

event_clips

  


⸻

  


**40. API**

**Dashboard**

GET /api/patrol/{patrol_id}/dashboard

Response:

{

  "unique_people": 183,

  "unique_vehicles": 37,

  "visited_zones": 8,

  "total_zones": 10,

  "coverage_percent": 80,

  "active_patrol_seconds": 2820

}

  


⸻

  


**Camera List**

GET /api/sites/{site_id}/helmet-cameras

  


⸻

  


**Camera Live**

GET /api/cameras/{camera_id}/live

  


⸻

  


**Camera Playback**

GET /api/cameras/{camera_id}/playback

  


⸻

  


**Heatmap**

GET /api/patrol/{patrol_id}/heatmap

  


⸻

  


**Zone Analytics**

GET /api/patrol/{patrol_id}/zones

  


⸻

  


**Events**

GET /api/patrol/{patrol_id}/events

  


⸻

  


**Event Detail**

GET /api/events/{event_id}

  


⸻

  


**41. Realtime WebSocket**

Có thể sử dụng:

/ws/patrol/{patrol_id}

Events:

camera_position

zone_changed

zone_count_updated

new_unique_object

event_pending

event_locked

event_ended

coverage_updated

  


⸻

  


**42. Cấu trúc menu**

HELMET CAMERA PATROL



├── Tổng quan

│

├── Camera

│   ├── Camera List

│   ├── Live View

│   └── Playback

│

└── Phân tích

    ├── Mật độ

    │   ├── Người

    │   ├── Xe & Máy

    │   └── Lộ trình tuần tra

    │

    └── Sự kiện

        ├── PPE

        └── Máy dừng >5s

  


⸻

  


**43. Mapping 3 Tier**

┌───────────────────────────────────────────────┐

│ TIER 1 – DASHBOARD                            │

│                                               │

│ 👤 People   🚚 Vehicle   📍 Coverage   ⏱ Time │

└───────────────────────────────────────────────┘



                    ↓



┌───────────────────────────────────────────────┐

│ TIER 2 – CAMERA                               │

│                                               │

│ Camera List                                   │

│ Live View                                     │

│ Playback                                      │

│ GPS / Zone                                    │

│ AI Overlay                                    │

└───────────────────────────────────────────────┘



                    ↓



┌───────────────────────────────────────────────┐

│ TIER 3 – ANALYTICS                            │

│                                               │

│ [ MẬT ĐỘ ]               [ SỰ KIỆN ]          │

│                                               │

│ People Heatmap           PPE                  │

│ Vehicle Heatmap          Machine Stopped      │

│ Zone Count               Snapshot             │

│ Coverage                 Playback             │

│ Patrol Route             GPS / Zone           │

└───────────────────────────────────────────────┘

  


⸻

  


**44. AI Pipeline**

Helmet Camera

      │

      ├──── GPS ──────────────→ Zone Engine

      │

      ▼

Video Frame

      │

      ▼

YOLO Detection

      │

      ├── Person

      │

      └── Vehicle / Equipment

      │

      ▼

BoT-SORT

      │

      ▼

Re-ID / Dedup

      │

      ├─────────────────────────────┐

      ▼                             ▼

Counting Engine                 Event Engine

      │                             │

      ├── People                     ├── PPE

      └── Vehicle                    └── Machine Stop

      │                             │

      ▼                             ▼

Zone Registry                   Event Registry

      │                             │

      └──────────────┬──────────────┘

                     ▼

                  Backend

                     │

                     ▼

             Vifence Dashboard

  


⸻

  


**45. POC Technology**

**AI**

Python

Ultralytics YOLO

BoT-SORT

Person Re-ID

Vehicle Re-ID

OpenCV

**Spatial**

GeoJSON

Shapely

**Backend**

FastAPI

PostgreSQL

PostGIS optional

Redis optional

WebSocket

**Frontend**

React

Leaflet hoặc Mapbox

GeoJSON

  


⸻

  


**46. Phase triển khai**

**Phase 1 – Camera & GPS**

Helmet Video

GPS

Timestamp Sync

Zone Detection

Patrol Trail

Live View

Playback

**Phase 2 – Counting**

Person Detection

Vehicle Detection

Tracking

Re-ID

Dedup

Unique Count

**Phase 3 – Heatmap**

Zone Count

People Heatmap

Vehicle Heatmap

Coverage

Patrol Route

**Phase 4 – Events**

PPE Detection

PPE Event Lock

Machine Motion Detection

Machine Stop >5s

Snapshot

Playback Event

  


⸻

  


**47. Không làm trong POC V1**

Chưa cần:

Face Recognition

Employee Identification

Exact GPS từng người

Exact GPS từng xe

3D Reconstruction

SLAM

Drone Integration

Cross-Camera Re-ID

  


⸻

  


**48. Tiêu chí nghiệm thu**

**Tier 1**

- Hiển thị Unique People.
- Hiển thị Unique Vehicle/Equipment.
- Hiển thị Coverage.
- Hiển thị Patrol Time.

**Tier 2**

- Camera List.
- Online/Offline.
- Live View.
- Playback.
- AI Bounding Box.
- Tracking ID.
- GPS.
- Current Zone.
- Patrol Route.

**Tier 3 – Heatmap**

- People Heatmap.
- Vehicle Heatmap.
- Zone Count.
- Current Count.
- Unique Count.
- Visited/Not Visited.
- Patrol Trail.

**Tier 3 – Events**

- Detect Person thiếu PPE.
- PPE confirmation timer.
- PPE Event Lock.
- Detect Vehicle/Equipment.
- Theo dõi trạng thái chuyển động.
- Machine Stop timer >= 5s.
- Machine Stop Event Lock.
- Event Snapshot.
- Event GPS.
- Event Zone.
- Event Camera.
- Event Playback.
- Event Timeline.
- Không tạo duplicate event cho cùng object/rule.

  


⸻

  


**49. Definition of Done**

POC hoàn thành khi một người đeo camera mũ có GPS có thể thực hiện một vòng tuần tra công trường và hệ thống:

1. Theo dõi được camera đang ở đâu và đang thuộc Zone nào.
2. Ghi lại lộ trình tuần tra.
3. Detect và tracking người, xe/máy.
4. Dedup để hạn chế đếm cùng một đối tượng nhiều lần.
5. Tính số unique người và xe/máy theo từng Zone.
6. Hiển thị heatmap mật độ người và xe/máy.
7. Xác định Zone đã/chưa được tuần tra.
8. Cho phép xem Live View và Playback camera.
9. Khi phát hiện người thiếu PPE đủ thời gian xác nhận → **Lock PPE Event**.
10. Khi phát hiện xe/máy không di chuyển liên tục trên 5 giây sau khi bù chuyển động camera → **Lock Machine Stopped Event**.
11. Mỗi event có **Snapshot + Playback + Timestamp + GPS + Zone + Camera + Object ID**.
12. Toàn bộ dữ liệu được tổng hợp lên cấu trúc **Tier 1 Dashboard → Tier 2 Camera → Tier 3 Heatmap & Events**.

