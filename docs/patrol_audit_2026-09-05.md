# Báo cáo rà soát từng ảnh — 2026-09-05

Nguồn: VPS Contabo · **134** snapshot

## Tóm tắt

| Verdict | Số | Ý nghĩa |
|---------|-----|---------|
| **OK** | 80 | Tab + overlay đúng; chỉ popup lịch sử thiếu tier |
| **WARN** | 33 | ROI hình học nghi ngờ / overlay khó đọc tự động |
| **FAIL** | 21 | Trùng tk, ROI sai vị trí, hoặc card/snapshot lệch |

## Lỗi hệ thống

1. **134/134** dòng lịch sử thiếu `tier_at_observation` (popup không badge tier đúng spec)
2. **13** card Người trùng (4 cụm) — spec yêu cầu 1 card/entity/ngày
3. Fix PR #285 **chưa deploy** VPS

## Chi tiết FAIL (đã xem ảnh)

### obj:obj-20260905-0077
- **Tab:** object · **Score:** 0.78 · **Giờ:** 07:55:38
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/obj-20260905-0077-115.jpg`
- **Kết luận:** ROI khoanh cột/thùng điện tĩnh — không phải chủ thể cần đếm

### obj:obj-20260905-0138
- **Tab:** object · **Score:** 0.74 · **Giờ:** 08:20:17
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/obj-20260905-0138-72.jpg`
- **Kết luận:** Không có khung ROI trên JPG

### obj:obj-20260905-0145
- **Tab:** object · **Score:** 0.76 · **Giờ:** 08:22:20
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/obj-20260905-0145-84.jpg`
- **Kết luận:** Không có khung ROI trên JPG

### obj:obj-20260905-0147
- **Tab:** object · **Score:** 0.78 · **Giờ:** 08:23:00
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/obj-20260905-0147-91.jpg`
- **Kết luận:** Không có khung ROI trên JPG

### obj:obj-20260905-0165
- **Tab:** object · **Score:** 0.71 · **Giờ:** 08:32:38
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/obj-20260905-0165-150.jpg`
- **Kết luận:** Không có khung ROI trên JPG

### obj:obj-20260905-0166
- **Tab:** object · **Score:** 0.8 · **Giờ:** 08:32:38
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/obj-20260905-0166-151.jpg`
- **Kết luận:** Không có khung ROI trên JPG

### pers:tk-0000022
- **Tab:** person · **Score:** 2.34 · **Giờ:** 08:06:03
- **Lịch sử:** 7 lượt
- **Ảnh:** `2026-09-05/tk-0000022-151.jpg`
- **Kết luận:** ROI gom ≥3 người sát nhau vào 1 khung

### pers:tk-0000023
- **Tab:** person · **Score:** 2.43 · **Giờ:** 07:56:16
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000023-117.jpg`
- **Kết luận:** Trùng cụm tk-024/025/026 cùng GPS 30s

### pers:tk-0000024
- **Tab:** person · **Score:** 2.13 · **Giờ:** 07:56:19
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000024-120.jpg`
- **Kết luận:** Trùng tk-023/025/026; ROI cắt đầu/chân

### pers:tk-0000025
- **Tab:** person · **Score:** 2.6 · **Giờ:** 07:56:20
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000025-121.jpg`
- **Kết luận:** Trùng tk-023/024/026 — cùng người polo trắng

### pers:tk-0000026
- **Tab:** person · **Score:** 2.34 · **Giờ:** 07:56:22
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000026-122.jpg`
- **Kết luận:** Trùng tk-023/024/025 — cùng người polo trắng

### pers:tk-0000035
- **Tab:** person · **Score:** 2.18 · **Giờ:** 08:03:12
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000035-147.jpg`
- **Kết luận:** Không có khung ROI trên JPG

### pers:tk-0000041
- **Tab:** person · **Score:** 2.31 · **Giờ:** 08:06:31
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000041-157.jpg`
- **Kết luận:** Trùng tk — nhiều card cùng GPS+thời gian (1 người)

### pers:tk-0000042
- **Tab:** person · **Score:** 2.36 · **Giờ:** 08:06:38
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000042-158.jpg`
- **Kết luận:** Trùng tk — nhiều card cùng GPS+thời gian (1 người)

### pers:tk-0000043
- **Tab:** person · **Score:** 1.95 · **Giờ:** 08:06:50
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000043-162.jpg`
- **Kết luận:** Trùng tk — nhiều card cùng GPS+thời gian (1 người)

### pers:tk-0000055
- **Tab:** person · **Score:** 2.3 · **Giờ:** 08:15:53
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000055-31.jpg`
- **Kết luận:** Trùng tk — nhiều card cùng GPS+thời gian (1 người)

### pers:tk-0000057
- **Tab:** person · **Score:** 2.31 · **Giờ:** 08:15:46
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000057-34.jpg`
- **Kết luận:** Trùng tk — nhiều card cùng GPS+thời gian (1 người)

### pers:tk-0000067
- **Tab:** person · **Score:** 2.68 · **Giờ:** 08:28:14
- **Lịch sử:** 2 lượt
- **Ảnh:** `2026-09-05/tk-0000067-124.jpg`
- **Kết luận:** Trùng tk — nhiều card cùng GPS+thời gian (1 người)

### pers:tk-0000069
- **Tab:** person · **Score:** 2.59 · **Giờ:** 08:28:15
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000069-116.jpg`
- **Kết luận:** Trùng tk — nhiều card cùng GPS+thời gian (1 người)

### pers:tk-0000070
- **Tab:** person · **Score:** 2.5 · **Giờ:** 08:28:28
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/tk-0000070-122.jpg`
- **Kết luận:** Trùng tk — nhiều card cùng GPS+thời gian (1 người)

### pers:tk-0000071
- **Tab:** person · **Score:** 2.34 · **Giờ:** 08:28:14
- **Lịch sử:** 1 lượt
- **Ảnh:** `2026-09-05/obj-20260905-0160-127.jpg`
- **Kết luận:** Tab Người nhưng JPG obj-*; ROI chỉ khoanh cổ — lệch nặng

## Bảng đầy đủ từng ảnh

| Verdict | Card | Tab | Score | Giờ | Lịch sử | Ghi chú |
|---------|------|-----|-------|-----|---------|---------|
| WARN | obj:obj-20260905-0064 | object | 0.24 | 07:51:33 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| WARN | obj:obj-20260905-0065 | object | 0.53 | 07:51:33 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| OK | obj:obj-20260905-0066 | object | 0.73 | 07:51:56 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0067 | object | 0.76 | 07:52:01 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0068 | object | 0.78 | 07:52:17 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0069 | object | 0.54 | 07:52:50 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0070 | object | 0.83 | 07:54:22 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0071 | object | 0.64 | 07:54:19 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0072 | object | 0.75 | 07:54:36 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| WARN | obj:obj-20260905-0073 | object | 0.65 | 07:54:52 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| WARN | obj:obj-20260905-0074 | object | 0.74 | 07:54:47 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| OK | obj:obj-20260905-0075 | object | 0.6 | 07:55:20 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0076 | object | 0.6 | 07:55:41 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| FAIL | obj:obj-20260905-0077 | object | 0.78 | 07:55:38 | 1 | ROI khoanh cột/thùng điện tĩnh — không phải chủ thể cần đếm |
| WARN | obj:obj-20260905-0078 | object | 0.81 | 07:55:38 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| OK | obj:obj-20260905-0079 | object | 0.86 | 07:56:19 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0080 | object | 0.61 | 07:56:32 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0081 | object | 0.69 | 07:56:55 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0082 | object | 0.64 | 07:56:55 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0083 | object | 0.59 | 07:58:51 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0084 | object | 0.85 | 07:58:53 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0085 | object | 0.73 | 07:59:23 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0086 | object | 0.62 | 08:00:21 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0087 | object | 0.79 | 08:00:11 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0088 | object | 0.81 | 08:01:11 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0090 | object | 0.57 | 08:02:54 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0091 | object | 0.48 | 08:02:48 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0092 | object | 0.84 | 08:03:24 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0093 | object | 0.61 | 08:06:39 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0094 | object | 0.42 | 08:06:42 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0096 | object | 0.81 | 08:07:22 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0097 | object | 0.84 | 08:07:38 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0098 | object | 0.66 | 08:10:24 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0099 | object | 0.83 | 08:11:14 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0100 | object | 0.81 | 08:11:19 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0101 | object | 0.8 | 08:12:10 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0102 | object | 0.57 | 08:11:25 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0103 | object | 0.3 | 08:11:36 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0104 | object | 0.83 | 08:13:18 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0106 | object | 0.76 | 08:13:21 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0107 | object | 0.74 | 08:13:31 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0108 | object | 0.39 | 08:13:33 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| WARN | obj:obj-20260905-0110 | object | 0.81 | 08:14:33 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| OK | obj:obj-20260905-0111 | object | 0.72 | 08:14:46 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| WARN | obj:obj-20260905-0112 | object | 0.78 | 08:15:09 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| WARN | obj:obj-20260905-0114 | object | 0.79 | 08:15:21 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| WARN | obj:obj-20260905-0117 | object | 0.82 | 08:15:39 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| WARN | obj:obj-20260905-0118 | object | 0.75 | 08:15:46 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| WARN | obj:obj-20260905-0119 | object | 0.72 | 08:15:47 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| WARN | obj:obj-20260905-0120 | object | 0.83 | 08:15:41 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| WARN | obj:obj-20260905-0121 | object | 0.73 | 08:15:59 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| OK | obj:obj-20260905-0122 | object | 0.32 | 08:16:41 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0123 | object | 0.64 | 08:17:21 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0124 | object | 0.8 | 08:17:29 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0125 | object | 0.81 | 08:18:11 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| WARN | obj:obj-20260905-0127 | object | 0.84 | 08:18:45 | 1 | ROI sát mép — có thể lệch (vật tĩnh/FP) |
| OK | obj:obj-20260905-0128 | object | 0.36 | 08:19:08 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0130 | object | 0.83 | 08:19:12 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0131 | object | 0.72 | 08:19:28 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0132 | object | 0.31 | 08:19:37 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0134 | object | 0.52 | 08:19:45 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0135 | object | 0.82 | 08:19:46 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0136 | object | 0.73 | 08:19:46 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0137 | object | 0.73 | 08:19:45 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| FAIL | obj:obj-20260905-0138 | object | 0.74 | 08:20:17 | 1 | Không có khung ROI trên JPG |
| OK | obj:obj-20260905-0139 | object | 0.74 | 08:20:17 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0140 | object | 0.7 | 08:21:34 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0141 | object | 0.8 | 08:20:57 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0142 | object | 0.7 | 08:21:49 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0143 | object | 0.77 | 08:21:55 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0144 | object | 0.63 | 08:22:19 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| FAIL | obj:obj-20260905-0145 | object | 0.76 | 08:22:20 | 1 | Không có khung ROI trên JPG |
| OK | obj:obj-20260905-0146 | object | 0.63 | 08:22:29 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| FAIL | obj:obj-20260905-0147 | object | 0.78 | 08:23:00 | 1 | Không có khung ROI trên JPG |
| OK | obj:obj-20260905-0148 | object | 0.36 | 08:23:14 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0149 | object | 0.72 | 08:23:55 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0150 | object | 0.72 | 08:25:00 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0151 | object | 0.79 | 08:25:10 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0152 | object | 0.81 | 08:25:25 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0153 | object | 0.77 | 08:26:07 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0154 | object | 0.72 | 08:26:34 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0155 | object | 0.64 | 08:27:05 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0157 | object | 0.77 | 08:27:25 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0158 | object | 0.81 | 08:27:40 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0161 | object | 0.35 | 08:28:52 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0162 | object | 0.7 | 08:30:20 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0163 | object | 0.72 | 08:30:45 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0164 | object | 0.69 | 08:31:10 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| FAIL | obj:obj-20260905-0165 | object | 0.71 | 08:32:38 | 1 | Không có khung ROI trên JPG |
| FAIL | obj:obj-20260905-0166 | object | 0.8 | 08:32:38 | 1 | Không có khung ROI trên JPG |
| OK | obj:obj-20260905-0169 | object | 0.74 | 08:37:14 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0170 | object | 0.47 | 08:40:48 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0172 | object | 0.83 | 08:48:50 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | obj:obj-20260905-0173 | object | 0.79 | 08:48:49 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| OK | pers:tk-0000001 | person | 2.45 | 08:46:08 | 2 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| WARN | pers:tk-0000002 | person | 2.66 | 08:48:31 | 3 | tier_mismatch:expected=person,image=object |
| OK | pers:tk-0000003 | person | 2.39 | 08:36:57 | 1 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| WARN | pers:tk-0000019 | person | 2.4 | 07:54:13 | 1 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000020 | person | 2.43 | 07:55:25 | 1 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000021 | person | 2.5 | 07:54:45 | 1 | tier_mismatch:expected=person,image=object |
| FAIL | pers:tk-0000022 | person | 2.34 | 08:06:03 | 7 | ROI gom ≥3 người sát nhau vào 1 khung |
| FAIL | pers:tk-0000023 | person | 2.43 | 07:56:16 | 1 | Trùng cụm tk-024/025/026 cùng GPS 30s |
| FAIL | pers:tk-0000024 | person | 2.13 | 07:56:19 | 1 | Trùng tk-023/025/026; ROI cắt đầu/chân |
| FAIL | pers:tk-0000025 | person | 2.6 | 07:56:20 | 1 | Trùng tk-023/024/026 — cùng người polo trắng |
| FAIL | pers:tk-0000026 | person | 2.34 | 07:56:22 | 1 | Trùng tk-023/024/025 — cùng người polo trắng |
| WARN | pers:tk-0000027 | person | 2.05 | 07:57:16 | 1 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000028 | person | 2.71 | 08:33:45 | 7 | tier_mismatch:expected=person,image=object; roi_near_frame_edge |
| OK | pers:tk-0000029 | person | 2.58 | 08:48:21 | 17 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| WARN | pers:tk-0000030 | person | 2.25 | 08:03:42 | 2 | tier_mismatch:expected=person,image=object; roi_near_frame_edge |
| WARN | pers:tk-0000032 | person | 2.12 | 08:04:13 | 2 | tier_mismatch:expected=person,image=object |
| OK | pers:tk-0000034 | person | 2.58 | 08:07:45 | 4 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| FAIL | pers:tk-0000035 | person | 2.18 | 08:03:12 | 1 | Không có khung ROI trên JPG |
| WARN | pers:tk-0000037 | person | 2.11 | 08:17:11 | 2 | ROI quá lớn (>40% khung) |
| FAIL | pers:tk-0000041 | person | 2.31 | 08:06:31 | 1 | Trùng tk — nhiều card cùng GPS+thời gian (1 người) |
| FAIL | pers:tk-0000042 | person | 2.36 | 08:06:38 | 1 | Trùng tk — nhiều card cùng GPS+thời gian (1 người) |
| FAIL | pers:tk-0000043 | person | 1.95 | 08:06:50 | 1 | Trùng tk — nhiều card cùng GPS+thời gian (1 người) |
| WARN | pers:tk-0000044 | person | 2.36 | 08:14:11 | 1 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000045 | person | 2.57 | 08:46:46 | 9 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000046 | person | 2.51 | 08:13:20 | 1 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000047 | person | 2.56 | 08:19:40 | 4 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000054 | person | 2.17 | 08:15:27 | 1 | tier_mismatch:expected=person,image=object; roi_near_frame_edge |
| FAIL | pers:tk-0000055 | person | 2.3 | 08:15:53 | 1 | Trùng tk — nhiều card cùng GPS+thời gian (1 người) |
| FAIL | pers:tk-0000057 | person | 2.31 | 08:15:46 | 1 | Trùng tk — nhiều card cùng GPS+thời gian (1 người) |
| WARN | pers:tk-0000059 | person | 2.54 | 08:18:03 | 2 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000063 | person | 2.13 | 08:19:12 | 1 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000064 | person | 2.44 | 08:25:30 | 4 | tier_mismatch:expected=person,image=object |
| WARN | pers:tk-0000065 | person | 2.39 | 08:22:34 | 2 | tier_mismatch:expected=person,image=object |
| OK | pers:tk-0000066 | person | 2.35 | 08:45:39 | 2 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |
| FAIL | pers:tk-0000067 | person | 2.68 | 08:28:14 | 2 | Trùng tk — nhiều card cùng GPS+thời gian (1 người) |
| WARN | pers:tk-0000068 | person | 2.26 | 08:27:39 | 1 | tier_mismatch:expected=person,image=object |
| FAIL | pers:tk-0000069 | person | 2.59 | 08:28:15 | 1 | Trùng tk — nhiều card cùng GPS+thời gian (1 người) |
| FAIL | pers:tk-0000070 | person | 2.5 | 08:28:28 | 1 | Trùng tk — nhiều card cùng GPS+thời gian (1 người) |
| FAIL | pers:tk-0000071 | person | 2.34 | 08:28:14 | 1 | Tab Người nhưng JPG obj-*; ROI chỉ khoanh cổ — lệch nặng |
| OK | pers:tk-0000073 | person | 2.24 | 08:30:55 | 2 | Tab + overlay khớp; lịch sử thiếu tier_at_observation |