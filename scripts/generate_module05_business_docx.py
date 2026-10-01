#!/usr/bin/env python3
"""Generate Module 05 business documentation DOCX."""

from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def set_cell_shading(cell, fill: str) -> None:
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), fill)
    shading.set(qn("w:val"), "clear")
    cell._tc.get_or_add_tcPr().append(shading)


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    doc.add_heading(text, level=level)


def add_para(doc: Document, text: str, bold: bool = False, italic: bool = False) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(11)
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")


def add_bullet(doc: Document, text: str, level: int = 0) -> None:
    p = doc.add_paragraph(text, style="List Bullet")
    if level > 0:
        p.paragraph_format.left_indent = Inches(0.25 * level)
    for run in p.runs:
        run.font.size = Pt(11)
        run.font.name = "Calibri"


def add_table(doc: Document, headers: list[str], rows: list[list[str]], header_fill: str = "D9E2F3") -> None:
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = h
        for p in hdr_cells[i].paragraphs:
            for run in p.runs:
                run.bold = True
                run.font.size = Pt(10)
        set_cell_shading(hdr_cells[i], header_fill)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = table.rows[ri + 1].cells[ci]
            cell.text = val
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(10)
    doc.add_paragraph()


def build_document() -> Document:
    doc = Document()

    # Title
    title = doc.add_heading("Tài liệu nghiệp vụ — Module 05", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run("Hiệu quả công việc (Smart Helmet & Flycam Patrol)")
    run.italic = True
    run.font.size = Pt(12)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = meta.add_run("Route: /module05  |  Cập nhật: 2026-09-16 (rev.2 — danh sách tính năng)")
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    doc.add_paragraph()

    # Overview
    add_heading(doc, "Giới thiệu chung", 1)
    add_para(
        doc,
        "Module 05 phục vụ giám sát tuần tra công trường qua Smart Helmet (HC-*) và Flycam (DR-03): "
        "vị trí nhân lực, lượt gặp, định danh và mật độ khu vực.",
    )
    add_para(doc, "Layout màn hình:", bold=True)
    add_bullet(doc, "Tier1 — Panel Tổng quan (KPI)")
    add_bullet(doc, "Tier2 — Panel Camera | Heatmap + Panel Sự kiện")

    add_heading(doc, "Bảng màu 3 tầng nhận diện (token hiện tại)", 2)
    add_para(
        doc,
        "Nguồn sự thật: src/modules/module05-productivity/utils/patrolTierTokens.ts — "
        "dùng chung cho ROI live, thẻ sự kiện, chấm heatmap.",
    )
    add_table(
        doc,
        ["Tier", "Label", "Màu UI", "Hex heatmap", "Ý nghĩa"],
        [
            ["object", "Đối tượng", "xám (stone-400)", "#a8a29e", "Silhouette — chưa đủ tiêu chí nhận diện"],
            ["person", "Người", "cam (orange-400)", "#fb923c", "Mặt đủ rõ / hồ sơ bản nháp, re-ID"],
            ["identity", "Định danh", "xanh lá (green-400)", "#4ade80", "Đã xác minh gallery / gán tên"],
        ],
    )
    add_para(
        doc,
        "Lưu ý: Palette cũ (xanh lá Đối tượng / sky Người / tím Định danh) đã bỏ — không còn dùng trong UI.",
        italic=True,
    )

    add_para(doc, "Quy ước ngày (quan trọng):", bold=True)
    add_bullet(doc, "Ngày sự kiện, playback, SQLite event_date = ngày lịch Việt Nam (cắt 0h).")
    add_bullet(doc, "Không dùng ca/kíp 06:00 như Module 02/03.")
    add_bullet(doc, "Tab 「Ca」 trên heatmap (nếu có) chỉ là cửa sổ lọc thời gian, không đổi mốc ngày.")

    doc.add_page_break()

    # Feature list — top to bottom
    add_heading(doc, "Danh sách tính năng theo bố cục màn hình (trên → dưới)", 1)
    add_para(
        doc,
        "Liệt kê theo thứ tự người vận hành nhìn thấy trên /module05 — từ header xuống Tier3. "
        "Mỗi mục mô tả theo góc nghiệp vụ (người dùng làm gì, hệ thống trả lời gì).",
    )

    add_heading(doc, "A. Header trang", 2)
    features_header = [
        "Tiêu đề module: Hiệu Quả Công Việc",
        "Mô tả phụ: Giám sát tuần tra helmet camera & mật độ lao động",
    ]
    for f in features_header:
        add_bullet(doc, f)

    add_heading(doc, "B. Tier 1 — Panel Tổng Quan (KPI)", 2)
    add_para(doc, "Thu gọn / mở rộng panel; hiển thị 4 thẻ chỉ số realtime + thống kê ngày:", bold=True)
    features_kpi = [
        "Khu vực tuần tra — theo dõi bao nhiêu khu GPS site đã có thiết bị online đang phủ (visited/total, % phủ)",
        "Nhân sự — tổng headcount ngày (Người + Định danh); chi tiết tách icon cam / xanh lá khi có dữ liệu",
        "Lượt gặp · ĐT — đếm lần silhouette chưa định danh vào khung (mỗi lần = 1 lượt, không gộp người)",
        "Mật độ flymap — số người/khung từ drone tầm cao (YOLO); tách biệt KPI Nhân sự",
        "Trạng thái chờ: thiết bị online nhưng chưa phát hiện / chưa có dữ liệu / flycam offline",
        "Peak time: detail KPI lượt gặm phản ánh giờ cao điểm (không gộp lượt)",
    ]
    for f in features_kpi:
        add_bullet(doc, f)

    add_heading(doc, "C. Tier 2 — Panel Camera", 2)
    add_para(doc, "Chuyển Live ↔ Playback; thu gọn panel (header hiện số luồng active khi thu gọn).", bold=True)

    add_heading(doc, "C.1. Chế độ Live", 3)
    features_live = [
        "Lưới 3 thiết bị: Helmet 01 (HC-01), Helmet 02 (HC-02), Drone 03 (DR-03)",
        "Mặc định chọn HC-02; click tile để focus camera",
        "Lọc tab Bodycam (HC-01, HC-02) / Flycam (DR-03)",
        "Badge LIVE + pulse dot khi stream online; retry khi offline",
        "Badge chế độ bay DR-03: Tầm cao / Tầm thấp",
        "Xem luồng WHEP/HLS qua MediaMTX; poll WS live bundle (~2.5s), fallback HTTP",
        "Overlay bbox người (ROI) theo tier xám / cam / xanh lá — bật/tắt trên toolbar",
        "Overlay thời gian + GPS trên tile HC-02 và drone",
        "HC-02 mobile bridge: coi online khi có frames dù backend báo offline",
        "Phóng to tier Camera fullscreen (desktop)",
        "Sidebar thumbnail camera — nhóm Bodycam / Flycam",
    ]
    for f in features_live:
        add_bullet(doc, f)

    add_heading(doc, "C.2. Chế độ Playback", 3)
    features_playback = [
        "Xem lại băng ghi MediaMTX theo ngày lịch VN (0h, retain 7 ngày)",
        "Date picker đồng bộ với panel Sự kiện (patrolViewDate shared)",
        "Timeline marker sự kiện — click phát clip 30 giây quanh thời điểm lockedAt",
        "Click thẻ sự kiện → tự chuyển ngày playback + sync timeline",
        "Lọc Bodycam / Flycam trên playback",
        "Không rollover ca 06:00 (khác Module 02/03)",
    ]
    for f in features_playback:
        add_bullet(doc, f)

    add_heading(doc, "D. Tier 3 trái — Panel HEATMAP / FLYMAP", 2)
    add_para(doc, "Bản đồ satellite site Cầu Sông Hốt; toggle Flymap; phóng to fullscreen.", bold=True)

    add_heading(doc, "D.1. Chế độ HEATMAP (site)", 3)
    features_heatmap = [
        "Layer Khu vực — polygon ranh giới site",
        "Layer Mật độ — chấm presences theo tier (xám ĐT / cam Người / xanh lá Định danh)",
        "Layer Mũ — marker + lộ trình HC-01, HC-02",
        "Layer Flycam — marker/route DR-03 (proximity hoặc có GPS)",
        "Overlay stats góc map: đếm ĐT / Người / Định danh (đồng bộ KPI)",
        "Follow GPS live HC-02 — map tự pan theo vị trí mũ",
        "Click chấm → bottom sheet chi tiết đối tượng (Unknown / Verified)",
        "Gán định danh thủ công từ sheet (PatrolManualIdentityPanel)",
        "Dedupe 1 chấm/entity; lọc chấm DR aerial khỏi heatmap site",
        "DR proximity: chấm hiện như helmet",
    ]
    for f in features_heatmap:
        add_bullet(doc, f)

    add_heading(doc, "D.2. Chế độ FLYMAP (drone tầm cao)", 3)
    features_flymap = [
        "Layer Khu vực · Mật độ · Drone",
        "Chấm phát hiện một màu uniform — overlay Phát hiện: N",
        "Follow GPS live DR-03",
        "Route chỉ drone; không mở object sheet khi click chấm",
    ]
    for f in features_flymap:
        add_bullet(doc, f)

    add_heading(doc, "E. Tier 3 phải — Panel SỰ KIỆN", 2)
    features_events = [
        "Date picker compact — 7 ngày gần nhất, đồng bộ playback/heatmap",
        "Hint Đang xem ngày trước khi xem lịch sử",
        "Header label chế độ flycam: Tầm thấp · AI / Tầm cao · Mật độ",
        "4 tab filter: Tất cả · Đối tượng · Người · Định danh (badge count mỗi tab)",
        "Tìm kiếm tên, mã NV, pers_id (debounce 300ms)",
        "Thẻ sự kiện có snapshot evidence — badge tier + thời gian + vị trí camera/khu",
        "Badge thăng tần (promoted) khi entity được nâng tier trong ngày",
        "Hiển thị số lượt xuất hiện (≥2) cho Người / Định danh",
        "Cuộn vô hạn — load thêm 4 thẻ/lần",
        "Click thẻ → chọn + mở popup chi tiết + sync ngày playback",
        "Lọc sự kiện person/profile từ DR-03 aerial (chỉ giữ object)",
        "Peak time: thẻ nhóm 1 snapshot; ledger vẫn đếm đủ N lượt gặm",
        "Empty state: chờ backend / không có sự kiện ngày",
    ]
    for f in features_events:
        add_bullet(doc, f)

    add_heading(doc, "F. Popup & hành động phát sinh từ màn chính", 2)
    features_modal = [
        "PatrolEventDetailModal — snapshot lớn, tier, tên/alias, camera, GPS, thời gian",
        "Lịch sử xuất hiện trong ngày (appearance segments) theo subject",
        "Gallery mặt đối chiếu (khi đã định danh)",
        "PatrolCameraAiConfigModal — cấu hình AI patrol_person cho HC-* / DR-*",
        "PatrolDevicePermissionGate — xin quyền camera/mic (legacy mobile helmet only)",
    ]
    for f in features_modal:
        add_bullet(doc, f)

    add_heading(doc, "G. Trang con liên quan (ngoài layout chính)", 2)
    features_sub = [
        "/module05/ho-so — Quản lý hồ sơ công nhân: bản nháp, xác minh, import Excel",
        "/module05/quet-mat — Quét mặt bổ sung vector / tạo hồ sơ mới 3 góc",
        "/module05/phat-song (publisher) — phát luồng WHIP từ thiết bị đeo mũ",
    ]
    for f in features_sub:
        add_bullet(doc, f)

    doc.add_page_break()

    # Section 1: Tổng quan
    add_heading(doc, "1. Tổng quan (Panel KPI — Tier1)", 1)
    add_para(
        doc,
        "Panel Tổng Quan hiển thị 4 thẻ KPI tóm tắt tình hình tuần tra trong ngày.",
    )

    add_heading(doc, "1.1. Bốn chỉ số KPI", 2)
    add_table(
        doc,
        ["Thẻ", "Ý nghĩa nghiệp vụ", "Nguồn dữ liệu"],
        [
            [
                "Khu vực tuần tra",
                "Số khu GPS đã có thiết bị tuần tra online và active trong polygon khu",
                "computePatrolZoneCoverage() + live poll workforce/GPS",
            ],
            [
                "Nhân sự",
                "Tổng headcount = Người + Định danh",
                "dayBundle.stats (SQLite backend)",
            ],
            [
                "Lượt gặp · ĐT",
                "Số lần gặp silhouette chưa định danh — không phải số người",
                "objectEncounterCount / unassignedObservations",
            ],
            [
                "Mật độ flymap",
                "Số người/khung từ YOLO flycam tầm cao — không cộng Nhân sự",
                "usePatrolFlymapMetrics() → DR-03 metrics",
            ],
        ],
    )

    add_heading(doc, "1.2. Khu vực tuần tra", 2)
    add_bullet(doc, "Value: {visited}/{total} khu vực (polygon GPS trên site Cầu Sông Hốt).")
    add_bullet(doc, "Một khu được coi là đã phủ khi có thiết bị được gán (HC-01, HC-02, DR-03) online và GPS nằm trong polygon, hoặc online nhưng chưa có GPS → coi là đang tuần tra khu được gán tĩnh.")
    add_para(doc, "Detail theo trạng thái:", bold=True)
    add_bullet(doc, 'Có khu visited → "{X}% khu có thiết bị tuần tra active"')
    add_bullet(doc, 'Cam online, chưa xác nhận phủ → "Thiết bị online — chờ xác nhận phủ khu"')
    add_bullet(doc, 'Mọi thiết bị offline → "Chưa có thiết bị tuần tra online"')
    add_para(doc, "Lưu ý: KPI này đo phủ sóng thiết bị, không phải mật độ nhân lực quan sát.", italic=True)

    add_heading(doc, "1.3. Nhân sự", 2)
    add_bullet(doc, "Value: personCount + identityCount")
    add_bullet(doc, "Detail khi có dữ liệu: icon tách Người (cam) và Định danh (xanh lá).")
    add_bullet(doc, 'Cam online + có stream → "Đang tuần tra — chờ phát hiện"')
    add_bullet(doc, 'Không cam online → "Chưa có dữ liệu hôm nay"')

    add_heading(doc, "1.4. Lượt gặp · ĐT (Đối tượng)", 2)
    add_para(
        doc,
        "Quy tắc nghiệp vụ cốt lõi: Một người đi qua ba camera = ba lượt. Ra khung rồi quay lại = hai lượt. "
        "Đối tượng chưa định danh không gộp lượt — không được trừ KPI này khỏi Nhân sự để suy ra số người chưa nhận diện.",
        italic=True,
    )
    add_bullet(doc, 'Detail bình thường: "Mỗi lần vào khung một lượt — không phải số người"')
    add_bullet(doc, 'Peak time (≥30 silhouette/khung): "Peak time — mỗi lần vào khung một lượt, không gộp"')
    add_bullet(doc, "Có lượt do mất tín hiệu: hiện thêm N lượt do mất tín hiệu")
    add_bullet(doc, 'Chưa có lượt: "Chưa ghi nhận lượt gặp Đối tượng"')

    add_heading(doc, "1.5. Mật độ flymap", 2)
    add_bullet(doc, "Chỉ áp dụng DR-03 ở chế độ Tầm cao (aerial) — YOLO đếm người trong khung hình.")
    add_bullet(doc, 'Value: số người/khung khi flycam online; "—" khi offline.')
    add_bullet(doc, 'Detail: "YOLO tầm cao — không cộng Nhân sự" — tách biệt hoàn toàn với ledger nhân sự helmet.')

    add_heading(doc, "1.6. Lưu ý đồng bộ KPI vs Tab Sự kiện", 2)
    add_table(
        doc,
        ["Hạng mục", "KPI Tier1", "Badge tab Sự kiện"],
        [
            ["Nhân sự", "day_stats backend", "Đếm thẻ có snapshot, dedupe entity"],
            [
                "Lượt gặp · ĐT",
                "Tổng lượt gặm (N chấm xám Đối tượng)",
                "Số thẻ snapshot (peak time có thể gom 1 thẻ nhóm)",
            ],
        ],
    )
    add_para(doc, "Hai con số có thể lệch — đúng thiết kế, không phải bug.", italic=True)

    doc.add_page_break()

    # Section 2: Sự kiện
    add_heading(doc, "2. Sự kiện (Panel SỰ KIỆN)", 1)

    add_heading(doc, "2.1. Mục đích", 2)
    add_para(
        doc,
        "Hiển thị bằng chứng hình ảnh (snapshot) của mỗi lần phát hiện người trong ngày — "
        "phục vụ tra cứu, đối chiếu playback, gán định danh thủ công. "
        "Không phải log detection thô — chỉ hiện sự kiện có ý nghĩa nghiệp vụ (Rule 09).",
    )

    add_heading(doc, "2.2. Thang 3 tầng nhận diện", 2)
    add_para(doc, "Pipeline Encounter — chốt tại frame tốt nhất trong cửa sổ 2 giây (~6 frame):")
    add_table(
        doc,
        ["Bằng chứng", "Tier", "Badge", "Màu token"],
        [
            ["Silhouette người", "Đối tượng", "Đối tượng", "xám (stone-400)"],
            ["+ mặt đủ rõ (face_eligible, score ≥ 1.05)", "Người", "Người", "cam (orange-400)"],
            ["+ khớp gallery / HR", "Định danh", "Định danh", "xanh lá (green-400)"],
        ],
    )
    add_bullet(doc, "Chỉ thăng tầng, không hạ tầng khi tiếp tục bám track.")
    add_bullet(doc, "Mất track / ra khung → finalize ngay (người lướt qua <2s vẫn ghi).")
    add_bullet(doc, "Trong 2s: giữ frame tốt nhất đã có — không chờ frame mới mà bỏ snapshot cũ.")

    add_heading(doc, "2.3. Tab filter (4 tab)", 2)
    add_table(
        doc,
        ["Tab", "Nội dung hiển thị"],
        [
            ["Tất cả", "Mọi thẻ có snapshot (Đối tượng + Người + Định danh)"],
            ["Đối tượng", "Silhouette, score < 1.05"],
            ["Người", "pers:* stage person, có mặt đủ re-ID"],
            ["Định danh", "Đã khớp gallery / gán thủ công — hiện tên + mã NV"],
        ],
    )
    add_para(doc, "Điều kiện hiển thị thẻ (bắt buộc):", bold=True)
    add_bullet(doc, "Có snapshotUrl (evidence)")
    add_bullet(doc, "Dedupe cùng entity — giữ bản lockedAt mới nhất")
    add_bullet(doc, "Object score ≥ 1.05 bị lọc khỏi tab Đối tượng (mis-tiered → thuộc Người)")

    add_heading(doc, "2.4. Nguồn dữ liệu", 2)
    add_para(doc, "GET /patrol/day/bundle?date={YYYY-MM-DD} → poll ~3s (hôm nay) → bundleToEvents() → filterPatrolEventsByFlycamAltitude() → PatrolEventsPanel")
    add_bullet(doc, "Một người một thẻ/ngày — khóa chính từ SQLite backend.")
    add_bullet(doc, 'Không fallback mock — empty state: "Chưa có sự kiện — đang chờ backend".')

    add_heading(doc, "2.5. Date picker & tìm kiếm", 2)
    add_bullet(doc, "Chọn ngày trong 7 ngày gần nhất (VN).")
    add_bullet(doc, "Đồng bộ patrolViewDate với Playback và Heatmap.")
    add_bullet(doc, 'Xem ngày quá khứ → hint "Đang xem ngày trước".')
    add_bullet(doc, "Sự kiện sau 0h VN thuộc ngày mới.")
    add_bullet(doc, 'Tìm kiếm debounce 300ms — placeholder: "Tìm tên, mã NV, pers_id…"')

    add_heading(doc, "2.6. Flycam DR-03 — quy tắc lọc", 2)
    add_table(
        doc,
        ["Chế độ bay", "Label header", "Sự kiện person/profile", "Sự kiện object"],
        [
            ["Tầm cao (aerial)", "Tầm cao · Mật độ", "Ẩn", "Hiện (chỉ silhouette)"],
            ["Tầm thấp (proximity)", "Tầm thấp · AI", "Hiện đủ 3 tier", "Hiện như HC-*"],
        ],
    )

    add_heading(doc, "2.7. Peak time — gom snapshot, không gom lượt", 2)
    add_bullet(doc, "Thẻ UI: 1 snapshot nhóm Nhóm N (gom hiển thị).")
    add_bullet(doc, "Ledger lượt gặm: vẫn N lượt, N chấm xám trên map, KPI Lượt gặp · ĐT += N.")
    add_bullet(doc, "ROI video: vẫn N bbox #1…#N.")

    add_heading(doc, "2.8. Popup chi tiết & loại ẩn", 2)
    add_para(doc, "PatrolEventDetailModal: loại, tiêu đề, trạng thái, vị trí, đối tượng, thời gian, confidence, GPS, actions.")
    add_para(doc, "Click thẻ → sync ngày playback + marker timeline 30 giây quanh lockedAt.")
    add_para(doc, "Loại sự kiện ẩn khỏi feed:", bold=True)
    add_bullet(doc, "PERSON_DETECTED raw (detection spam)")
    add_bullet(doc, "PPE_VIOLATION (Module 05 hiện ẩn PPE)")
    add_bullet(doc, "OBJECT_MERGED — chỉ audit log")

    doc.add_page_break()

    # Section 3: Heatmap
    add_heading(doc, "3. Heatmap (Panel HEATMAP / FLYMAP)", 1)

    add_heading(doc, "3.1. Mục đích", 2)
    add_para(
        doc,
        "Bản đồ vị trí GPS của nhân lực, thiết bị tuần tra và mật độ phát hiện trên site Cầu Sông Hốt (Leaflet satellite). "
        "Hai chế độ: HEATMAP (site helmet + drone proximity) và FLYMAP (góc nhìn flycam tầm cao).",
    )

    add_heading(doc, "3.2. Ba loại chấm = ba chỉ số KPI", 2)
    add_para(doc, "Nguồn sự thật: Presences (SQLite appearances). Quy tắc vàng: Số chấm xám Đối tượng = số lượt gặm, không phải số entity obj-* duy nhất hay số thẻ card.")
    add_table(
        doc,
        ["Chấm map", "Màu", "Hex", "KPI", "Ý nghĩa"],
        [
            ["Đối tượng", "xám", "#a8a29e", "unassigned_observations", "Mỗi chấm = 1 lượt gặm"],
            ["Người", "cam", "#fb923c", "person_count", "pers-* draft, chưa gallery"],
            ["Định danh", "xanh lá", "#4ade80", "identity_count", "NV đã verify"],
        ],
    )

    add_heading(doc, "3.3. Layer toggle — HEATMAP mode", 2)
    add_table(
        doc,
        ["Layer", "Nội dung"],
        [
            ["Khu vực", "Polygon site boundary"],
            ["Mật độ", "Chấm detection (presences) — không phải canvas KDE"],
            ["Mũ", "Marker + route HC-01, HC-02"],
            ["Flycam", "Marker/route DR-03 (proximity hoặc có GPS)"],
        ],
    )

    add_heading(doc, "3.4. Layer toggle — FLYMAP mode", 2)
    add_table(
        doc,
        ["Layer", "Nội dung"],
        [
            ["Khu vực", "Polygon"],
            ["Mật độ", "Chấm một màu uniform (PATROL_FLYMAP_DOT_HEX)"],
            ["Drone", "Route chỉ DR-03"],
        ],
    )
    add_para(doc, "Canvas KDE (PatrolDensityCanvasLayer) hiện tắt. Toggle Mật độ = bật/tắt chấm detection.", italic=True)

    add_heading(doc, "3.5. Tương tác", 2)
    add_table(
        doc,
        ["Hành động", "HEATMAP", "FLYMAP"],
        [
            ["Click chấm", "Mở WorkforceObjectSheet (Unknown/Verified)", "Không mở sheet"],
            ["Gán định danh thủ công", "PatrolManualIdentityPanel trong sheet", "—"],
            ["Phóng to", "Fullscreen portal, Escape đóng, giữ state layer", "—"],
            ["Follow GPS", "Pan theo HC-02 live GPS", "Pan theo DR-03 live GPS"],
        ],
    )

    add_heading(doc, "3.6. Dedupe, lọc flycam & Live trên map", 2)
    add_bullet(doc, "Nhiều nguồn cùng objectId → 1 chấm/entity, ưu tiên inCameraView.")
    add_bullet(doc, "DR-03 aerial: chấm không hiện trên heatmap site (chỉ flymap).")
    add_bullet(doc, "DR-03 proximity: chấm hiện như HC-*.")
    add_bullet(doc, "Live trên map: Presence ended_at trong 120s + cam online. Map có thể trễ vài giây so với video — đổi lại data khớp KPI.")

    add_heading(doc, "3.7. TTL layer người (spec kiến trúc)", 2)
    add_table(
        doc,
        ["Trạng thái", "Thời gian", "UI"],
        [
            ["ACTIVE", "0–30s", "Opacity cao, update live"],
            ["RECENTLY_OBSERVED", "30–120s", "Opacity TB, vị trí static"],
            ["EXPIRED", ">120s", "Xóa khỏi Live; giữ history heat"],
        ],
    )

    doc.add_page_break()

    # Section 4: Camera
    add_heading(doc, "4. Camera (Panel Camera)", 1)
    add_para(doc, "Camera Module 05 dùng chung layout với Module 01 (CameraGridPanel) — chỉ khác dữ liệu tuần tra.")

    add_heading(doc, "4.1. Thiết bị", 2)
    add_table(
        doc,
        ["ID", "Tên hiển thị", "Loại", "Vai trò"],
        [
            ["HC-01", "Helmet 01", "Bodycam RTSP", "Tuần tra + AI server-side"],
            ["HC-02", "Helmet 02", "Bodycam WHIP/mobile", "Tuần tra + GPS thật"],
            ["DR-03", "Drone 03", "Flycam", "Tầm cao (mật độ) / Tầm thấp (AI proximity)"],
        ],
    )
    add_para(doc, "Mặc định: mode Live, camera chọn HC-02.")

    add_heading(doc, "4.2. Mode Live", 2)
    add_para(doc, "Luồng dữ liệu: WS /ws/patrol/live?cameras=HC-01,HC-02,DR-03 (ưu tiên ~2.5s) → fallback GET /patrol/live/bundle → buildPatrolCamerasLive() → CameraGridPanel")
    add_para(doc, "Filter tab:", bold=True)
    add_bullet(doc, "Bodycam — chỉ HC-01, HC-02")
    add_bullet(doc, "Flycam — chỉ DR-03")
    add_para(doc, "Trạng thái tile:", bold=True)
    add_bullet(doc, "Online + stream WHEP/HLS → badge LIVE + pulse dot")
    add_bullet(doc, "Offline → retry streamWhenOffline, không crash")
    add_bullet(doc, "DR-03 online → badge Tầm cao hoặc Tầm thấp (flight_mode)")
    add_bullet(doc, "HC-02 mobile bridge: Khi backend báo offline nhưng mobile gửi frames → vẫn coi online.")

    add_heading(doc, "4.3. Person ROI overlay", 2)
    add_bullet(doc, "Label tier: Đối tượng / Người / Định danh")
    add_bullet(doc, "Delay đồng bộ 5s (PATROL_LIVE_ROI_DELAY_MS) để bbox khớp khung video")
    add_bullet(doc, "Publisher local (WHIP từ trình duyệt): bbox cùng khung, không delay")
    add_bullet(doc, "User bật/tắt bbox qua toolbar")
    add_bullet(doc, "DR-03 proximity: ROI person như helmet. DR-03 aerial: không ROI person trên tile site.")

    add_heading(doc, "4.4. Mode Playback", 2)
    add_bullet(doc, "Ngày lịch VN 0h, retain 7 ngày, không rollover 06:00.")
    add_bullet(doc, "patrolViewDate shared với panel Sự kiện.")
    add_bullet(doc, "MediaMTX: GET /list → GET /get?path=&start=&duration=30")
    add_bullet(doc, "Click marker sự kiện → clip 30 giây quanh lockedAt.")
    add_bullet(doc, "Không có băng → timeline trống, không crash.")
    add_bullet(doc, "URL playback qua proxy, không lộ IP nội bộ MediaMTX.")

    add_heading(doc, "4.5. Pipeline video thống nhất (HC-01 & HC-02)", 2)
    add_para(
        doc,
        "HC-01 (RTSP) và HC-02 (WHIP) → MediaMTX → record (playback) + RTSP nội bộ (AI worker) + WHEP/LL-HLS (CMS). "
        "GPS + IMU → WebSocket → backend → heatmap (mọi viewer). "
        "Từ MediaMTX trở đi hai mũ không phân biệt — cùng worker, schema detection, player, overlay.",
    )

    add_heading(doc, "4.6. Cấu hình AI", 2)
    add_para(doc, "PatrolCameraAiConfigModal: HC-* / DR-* chỉ patrol_person (PERS-001). Không PPE / ATLĐ Module 03 trên Module 05.")

    doc.add_page_break()

    # Section 5: Rules
    add_heading(doc, "5. Nguyên tắc nghiệp vụ cốt lõi (10 Rules)", 1)
    rules = [
        "Raw Person Detection ≠ Worker Entity",
        "Track ID ≠ Worker Entity",
        "Object ID ≠ Unique Worker",
        "No-Face Persistence — mất mặt vẫn giữ Object ID",
        "Conservative Dedup — chưa chắc thì không merge",
        "Retroactive Merging — cho phép gộp hồi tố",
        "Close-up không làm giảm Population Count",
        "Chỉ update Population khi Observability HIGH/MEDIUM",
        "Event Feed ≠ Raw Detection Log",
        "Heatmap ≠ raw detection density",
    ]
    for i, rule in enumerate(rules, 1):
        add_bullet(doc, f"Rule {i:02d}: {rule}")

    add_heading(doc, "6. Tài liệu kỹ thuật tham chiếu", 1)
    add_table(
        doc,
        ["Tài liệu", "Nội dung"],
        [
            ["specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md", "Spec kiến trúc heatmap + event"],
            ["specs/module05/PATROL_ENCOUNTER_PIPELINE.md", "Pipeline 3 tier + cửa sổ 2s"],
            ["specs/module05/HEATMAP_SINGLE_SOURCE_SPEC.md", "Presences = nguồn duy nhất map/KPI"],
            ["specs/module05/MODULE05_TEST_SCENARIOS.md", "120 test cases theo module"],
            ["specs/module05/HELMET_UNIFIED_PIPELINE.md", "Pipeline video HC-01/HC-02"],
            ["specs/module05/PATROL_CAMERA_STREAM_TELEMETRY_SPEC.md", "Overlay GPS trên stream"],
        ],
    )

    footer = doc.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = footer.add_run("— Vifence CMS · Module 05 Hiệu quả công việc —")
    fr.font.size = Pt(9)
    fr.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
    fr.italic = True

    return doc


def main() -> None:
    out_path = "/workspace/docs/module05/Module05_TaiLieu_NghiepVu.docx"
    doc = build_document()
    doc.save(out_path)
    print(out_path)


if __name__ == "__main__":
    main()
