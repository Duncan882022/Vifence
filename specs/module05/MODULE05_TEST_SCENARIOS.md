# Module 05 — Kịch bản kiểm thử (Hiệu quả công việc / Tuần tra)

> **Phạm vi:** `/module05` (Tuần tra) · `/module05/ho-so` (Hồ sơ công nhân) · `/module05/quet-mat` (Quét mặt)  
> **Tham chiếu:** `specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md` · `.cursor/rules/vifence.mdc` (Module 05 ngày lịch VN)

---

## 1. Tóm tắt kiểm tra tự động (đã chạy)

| Lớp | Lệnh | Kết quả |
|-----|------|---------|
| FE unit (Vitest) | `npm test -- --run src/modules/module05-productivity` | **38 file · 199 test — PASS** |
| FE audit script | `node scripts/test_workforce_fe.mjs` | **8/11 PASS** — 3 check static audit lỗi thời (file `workforceEventsMapper.ts` đã gỡ; tab thời gian heatmap chưa render UI) |
| BE (Python) | `pytest backend-ai/tests/test_patrol_*.py backend-ai/tests/test_module05_detector.py` | Chạy khi backend-ai sẵn sàng |

**Phạm vi unit test FE hiện có:** playback ngày VN, heatmap dots, tab sự kiện (Đối tượng/Người/Định danh), identity entity, flycam filter, face scan guide/camera, live feed, zone coverage, position engine, person ROI, v.v.

---

## 2. Điều kiện tiên quyết

| Hạng mục | Yêu cầu |
|----------|---------|
| Backend patrol | API + SQLite day bundle hoạt động; ping `/patrol/...` OK |
| Luồng video | HC-01, HC-02 (mũ) và DR-03 (flycam) online hoặc stub playback MediaMTX |
| Auth | Token patrol hợp lệ (`ensurePatrolAuth`) |
| Trình duyệt | Desktop ≥1280px, tablet dọc, mobile; HTTPS cho quét mặt |
| Dữ liệu mẫu | ≥1 hồ sơ `identified`, ≥1 `draft`; sự kiện ngày hôm nay và ngày trước |
| Múi giờ | Máy test hoặc mock thời gian ở **UTC+7** khi kiểm ngày lịch |

---

## 3. Điều kiện nghiệp vụ bắt buộc (Module 05)

Trước khi chạy kịch bản, xác nhận các quy tắc sau **không bị vi phạm**:

1. **Không có ca/kíp** — `event_date` / playback / date picker = **ngày lịch VN (cắt 0h)**.
2. **Không** rollover 06:00, **không** copy `getPatrolWorkDate` từ Module 02/03.
3. Sự kiện sau 0h VN (ví dụ 00:30 ngày 29/08) thuộc **ngày 29/08**, không tự lùi về ngày 28.
4. Tab heatmap **「Ca」** (nếu có) = cửa sổ lọc thời gian, **không** đổi mốc ngày lịch.
5. Sidebar cố định **220px**; layout Tier1 → Tier2 (Camera | Events) → Tier3 (Heatmap | Sự kiện).

---

## 4. Kịch bản — Điều hướng & khung chung

### M05-NAV-01 — Sidebar Module 05

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Mở CMS, chọn **Hiệu quả công việc** | Menu con mở: Tuần tra, Hồ sơ công nhân, Quét mặt |
| 2 | Vào **Tuần tra** | URL `/module05`; Header «Hiệu Quả Công Việc» |
| 3 | Vào **Hồ sơ công nhân** | URL `/module05/ho-so` |
| 4 | Vào **Quét mặt** | URL `/module05/quet-mat` |
| 5 | Truy cập `/scanner` (legacy) | Redirect 301 → `/module05/quet-mat` |

### M05-LAY-01 — Layout Tuần tra (desktop)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Mở `/module05` desktop | Tier1 KPI (4 thẻ) → Tier2 Camera → Tier3 HEATMAP \| SỰ KIỆN |
| 2 | Thu gọn Tier1 / Tier2 | Nút collapse hoạt động; không che Sidebar |
| 3 | Resize mobile (<1024px) | Stack dọc; heatmap + sự kiện có chiều cao tối thiểu, không dead whitespace lớn |

---

## 5. Kịch bản — Trang Tuần tra (`/module05`)

### M05-KPI-01 — Tổng quan KPI

| ID | Kiểm tra | Kết quả mong đợi |
|----|----------|------------------|
| KPI-1 | Thẻ **Khu vực tuần tra** | `visited/total` khu; detail phù hợp online/offline |
| KPI-2 | Thẻ **Nhân sự** | = `personCount + identityCount`; badge ĐT/Người/Định danh khi >0 |
| KPI-3 | Thẻ **Lượt gặp · ĐT** | Đếm silhouette chưa gán; **không** cộng vào Nhân sự |
| KPI-4 | Thẻ **Mật độ flymap** | DR-03 online → số người/khung; offline → «—» + «Flycam chưa online» |
| KPI-5 | Không có dữ liệu hôm nay | Detail «Chưa có dữ liệu hôm nay» hoặc «Đang tuần tra — chờ phát hiện» |

### M05-CAM-01 — Camera Live

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Tab **Live** (mặc định) | Grid HC-01, HC-02, DR-03; filter tab mũ/flycam |
| 2 | Chọn camera HC-02 | Tile highlight; stream phát (hoặc placeholder offline) |
| 3 | Badge LIVE | Pulse dot khi stream online |
| 4 | Đếm luồng header | Số luồng active khớp tile đang phát |
| 5 | Legacy mobile helmet | Chỉ khi `hasLegacyMobileHelmet()` — gate xin quyền camera/mic |

### M05-CAM-02 — Camera Playback

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Chuyển toggle **Playback** | `PatrolPlaybackPanel` hiện date picker + timeline |
| 2 | Date picker mặc định | **Hôm nay** (`getPatrolDefaultPlaybackDate` = ngày lịch VN) |
| 3 | Chọn ngày trong 7 ngày | Min/max date theo `PATROL_PLAYBACK_RETAIN_DAYS` |
| 4 | Phát băng MediaMTX | URL `/get?path=hc-xx` qua playback base (không IP nội bộ lộ ra UI) |
| 5 | 404 băng | Không crash; danh sách clip trống |

### M05-DATE-01 — Ngày lịch VN (critical)

| ID | Dữ liệu | Thao tác | Kết quả mong đợi |
|----|---------|----------|------------------|
| D-1 | Sự kiện `lockedAt = 2026-08-28T17:30:00.000Z` (00:30 VN ngày 29) | Mở tab Sự kiện ngày 28/08 | **Không** thấy sự kiện |
| D-2 | Cùng sự kiện | Chọn ngày 29/08 | **Có** sự kiện |
| D-3 | Click card sự kiện ngày cũ | — | `patrolViewDate` chuyển đúng ngày sự kiện (`getPatrolEventViewDate`) |
| D-4 | Playback + heatmap + sự kiện | Cùng ngày được chọn | Ba panel đồng bộ `viewDate` |
| D-5 | Sau 0h VN | User chọn ngày trên picker | **Không** tự lùi ngày; dữ liệu 23:50 hôm qua thuộc ngày hôm qua |

### M05-MAP-01 — Heatmap

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Layer **Khu vực / Mật độ / Mũ / Flycam** | Bật/tắt độc lập; polygon site hiển thị |
| 2 | Nút **Flymap** header | Chuyển FLYMAP; layer drone; follow GPS DR-03 |
| 3 | Nút **Phóng to** | Overlay fullscreen; **Thu nhỏ** trở lại |
| 4 | HC-02 online | Chấm mũ + heading; follow GPS khi có fix |
| 5 | Click chấm đối tượng | Bottom sheet Unknown (OBJ-*) hoặc Verified (tên + Worker ID) |
| 6 | Flycam aerial | Chấm flymap **không** cộng Nhân sự KPI |
| 7 | Flycam proximity | Sự kiện/chấm flymap được lọc theo `patrolFlycamEventFilter` |

### M05-EVT-01 — Panel Sự kiện

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Tab filter | **Tất cả · Đối tượng · Người · Định danh** (4 tab) |
| 2 | Badge đếm tab | Khớp số card sau dedupe entity (`computePatrolTabCounts`) |
| 3 | Tìm kiếm (>20 nếu có) | Lọc theo tên, mã, objectId, pers_id |
| 4 | Scroll infinite | Load thêm 4 card/lần sau 6 card đầu |
| 5 | Không backend | «Chưa có sự kiện — đang chờ backend» (không mock feed) |
| 6 | `PERSON_DETECTED` raw | **Không** hiển thị trên feed |
| 7 | Sự kiện chờ snapshot | Không đếm tab (pending evidence) |

### M05-EVT-02 — Chi tiết sự kiện

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Click card / snapshot | Modal chi tiết: loại, trạng thái, vị trí, thời gian, confidence, GPS |
| 2 | Badge giai đoạn | Màu/icon đúng token: Đối tượng (xanh lá) · Người (sky) · Định danh (violet) |
| 3 | Đóng modal | `detailEventId` null; không ảnh hưởng selection list |

### M05-EVT-03 — Vòng đời nhận diện (3 tầng)

| Giai đoạn | Dấu hiệu UI | Tab filter |
|-----------|-------------|------------|
| Đối tượng | Silhouette, OBJ-*, chưa đủ snapshot | Tab **Đối tượng** |
| Người | Mã tạm ổn định (pers/tk), re-id | Tab **Người** |
| Định danh | Tên + đơn vị / gallery worker | Tab **Định danh** |

### M05-LIVE-01 — Live poll & WebSocket

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | WS `/ws/patrol/live` OK | KPI + heatmap cập nhật ~2.5s |
| 2 | WS ngắt | Fallback HTTP `GET /patrol/live/bundle` |
| 3 | Day bundle poll ~3s | Tab sự kiện refresh theo `GET /patrol/day/bundle?date=` |
| 4 | DR-03 flight mode | Label chế độ bay hiện header Sự kiện (aerial/proximity) |

---

## 6. Kịch bản — Hồ sơ công nhân (`/module05/ho-so`)

### M05-PRO-01 — Danh sách & thống kê

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Mở trang | 4 KPI: Tổng hồ sơ, Bản nháp, Đã xác minh, Có vector |
| 2 | Backend down | Banner amber «Backend tuần tra chưa sẵn sàng» |
| 3 | **Làm mới** | Reload danh sách |
| 4 | Tìm kiếm | Lọc tên, mã NV, đơn vị, pers_id |
| 5 | Filter Tất cả / Bản nháp / Đã xác minh | Danh sách khớp `status` |

### M05-PRO-02 — Import Excel

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | **Tải mẫu** | File `patrol_workers_template.xlsx` cột Họ tên, Mã NV, Đơn vị |
| 2 | Import file hợp lệ | Báo `success` count; list refresh |
| 3 | Dòng thiếu Họ tên hoặc Mã | Lỗi validation, không import |
| 4 | File rỗng | «File Excel không có dòng hợp lệ» |

### M05-PRO-03 — CRUD hồ sơ

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | **Xem** (Eye) | Modal chi tiết + gallery vector |
| 2 | **Sửa** (Pencil) | Modal edit; lưu thành công |
| 3 | **Quét mặt** link | Navigate `/module05/quet-mat?code=<employee_code>` |
| 4 | **Xóa** | Confirm; xóa vector; không hoàn tác |
| 5 | Badge vector | `count/3` — xanh khi `face_enrollment_complete` |

---

## 7. Kịch bản — Quét mặt (`/module05/quet-mat`)

### M05-FACE-01 — Chế độ HR (admin)

| Điều kiện | `hasPatrolRole('hr')` và không có `?code=` |
| Bước | Thao tác | Kết quả mong đợi |
| 1 | Tra cứu mã NV hợp lệ | Hiện hồ sơ → bước quét bổ sung vector |
| 2 | Mã không tồn tại | Lỗi + gợi ý «Tạo hồ sơ mới» |
| 3 | **Tạo hồ sơ mới** | Flow enroll: quét → nhập profile → hoàn tất |

### M05-FACE-02 — Tự đăng ký (`?code=`)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | Mở link có `?code=NV001` | **Quét mặt trước**, nhập thông tin sau |
| 2 | Không role HR | Không hiện tra cứu admin |
| 3 | Hoàn tất 3 góc bắt buộc | Progress 3/3; slot 4 (Cúi xuống) tuỳ chọn |

### M05-FACE-03 — Camera & hướng dẫn

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|------------------|
| 1 | HTTP (không HTTPS) | Lỗi «Camera chỉ hoạt động trên HTTPS» |
| 2 | Từ chối quyền camera | Hướng dẫn iPhone/Safari |
| 3 | Slot 1→3 | Hướng dẫn: Chính diện → Trái → Phải |
| 4 | Ring la bàn | Nhãn TRÊN · PHẢI · DƯỚI · TRÁI |
| 5 | Consent checkbox | Bắt buộc trước khi gửi hồ sơ mới |

---

## 8. Kịch bản — Tích hợp & hồi quy

### M05-INT-01 — Identity hierarchy

| Kiểm tra | Kết quả mong đợi |
|----------|------------------|
| Track ID ≠ Worker Entity | UI không hiển thị track là nhân sự đã xác minh |
| Object ID dedupe heatmap | Một entity một chấm (ưu tiên `inCameraView`) |
| Manual identity binding | Gán tay cập nhật card sự kiện + heatmap label |
| Gallery worker SGC-* | Tab **Định danh**; badge violet |

### M05-INT-02 — Flycam vs Helmet

| Kiểm tra | Kết quả mong đợi |
|----------|------------------|
| Aerial YOLO | KPI flymap có số; không tăng Nhân sự |
| Proximity | Sự kiện drone xuất hiện feed + heatmap |
| Filter đồng bộ | `filterPatrolEventsByFlycamAltitude` áp dụng list + map |

### M05-INT-03 — Module 03 overlay (ROI)

| Kiểm tra | Kết quả mong đợi |
|----------|------------------|
| Person ROI engine | Label overlay đồng bộ tier Module 05 |
| Live overlay sync test | `liveOverlaySync.test.ts` pass |

### M05-REG-01 — Không vi phạm design system

| Kiểm tra | Kết quả mong đợi |
|----------|------------------|
| Sidebar 220px | Không bị camera/heatmap đè |
| Không duplicate CameraGrid | Dùng `PatrolCameraPanel` riêng Module 05 |
| Action verbs VN | Thông báo, Xử lý, Xuất clip, Tải xuống (nếu có) |

---

## 9. Kịch bản — POC Acceptance (spec §10)

| # | Tiêu chí | Cách kiểm |
|---|---------|-----------|
| 1 | GPS + heading <1s | Quan sát chấm mũ live |
| 2 | Partial body không tạo Object/count | Backend log + KPI không tăng |
| 3 | Full→Close giữ 1 Track/Object | Không nhân đôi card/ngày |
| 4 | Close-up → Observability LOW, population không tụt | KPI Nhân sự ổn định |
| 5 | Face match UNKNOWN→VERIFIED | Chuyển tab Định danh |
| 6 | Dedup conservative | Không merge sớm 2 OBJ khác nhau |
| 7 | Retroactive merge | Audit log (không feed chính) |
| 8 | 1000 raw detect/phút → feed <5 meaningful | Tab sự kiện không spam |
| 9 | Đứng yên 10 phút → heatmap không đỏ giả | Mật độ không bùng |
| 10 | Time filter Live ↔ 15 phút | Heat grid window đúng (khi UI tab thời gian bật) |

---

## 10. Ma trận ưu tiên

| Ưu tiên | Nhóm | Lý do |
|---------|------|-------|
| **P0** | M05-DATE-01, M05-EVT-01, M05-CAM-02 | Ngày VN sai = sai toàn module |
| **P0** | M05-FACE-03, M05-PRO-02 | Enroll nhân sự production |
| **P1** | M05-MAP-01, M05-LIVE-01, M05-KPI-01 | Giám sát realtime |
| **P1** | M05-INT-02 | Flycam/proximity logic |
| **P2** | M05-LAY-01, M05-NAV-01 | UX responsive |
| **P2** | POC §10 item 7–10 | Cần dữ liệu dài hạn / BE engine |

---

## 11. Checklist trước release

- [ ] `npm test -- --run src/modules/module05-productivity` — 199/199 pass
- [ ] Smoke manual P0 trên staging có backend thật
- [ ] Playback 7 ngày gần nhất — ít nhất 1 camera có băng
- [ ] Quét mặt HTTPS — hoàn tất 3 pose trên 1 hồ sơ test
- [ ] Import Excel ≥10 dòng — không duplicate mã NV
- [ ] Sau 0h VN — xác nhận sự kiện 23:xx hôm qua không lẫn sang hôm nay
- [ ] Mobile compact — heatmap + sự kiện scroll được, không overlap sidebar

---

## 12. Ghi chú triển khai / gap đã biết

1. **Tab thời gian heatmap** (`Live | 5p | 15p | 1h | Ca`) — logic `HeatmapTimeWindow` có trong `workforceHeatmapUi.ts`; UI tab chưa expose đầy đủ trên chrome heatmap (default canvas `heatWindow = 'shift'`).
2. **Script `test_workforce_fe.mjs`** — cần cập nhật audit path sau refactor (bỏ `workforceEventsMapper.ts`, filter meaningful event chuyển sang `patrolEventsFeed.ts`).
3. **Event workforce cũ** (`POPULATION_OBSERVED`, …) — feed hiện tại ưu tiên **SQLite day bundle** một người một thẻ/ngày; tab filter theo stage (ĐT/Người/Định danh) thay vì tab Nhân lực/Mật độ spec cũ.

---

*Cập nhật: 2026-09-01 · Module 05 productivity / patrol*
