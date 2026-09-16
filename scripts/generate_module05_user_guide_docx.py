#!/usr/bin/env python3
"""Generate Module 05 user guide DOCX — 4 panels, Helmet 01–10 RTSP."""

from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

FONT = "Calibri"
BODY = Pt(11)
SMALL = Pt(10)
CAPTION = Pt(9)
HDR_FILL = "1F3864"
HDR_ALT = "2E5090"
HDR_TEXT = RGBColor(0xFF, 0xFF, 0xFF)
LABEL_FILL = "EEF2F7"
STATUS_DEFER = "FFF3CD"
STATUS_NA = "E9ECEF"

DOC_VERSION = "2026-09-16 · rev.3"
DOC_ROUTE = "/module05"
HELMET_COUNT = 10


def _font(run, size=BODY, bold=False, italic=False, color=None) -> None:
    run.font.name = FONT
    run.font.size = size
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = color
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)


def _shade(cell, fill: str) -> None:
    el = OxmlElement("w:shd")
    el.set(qn("w:fill"), fill)
    el.set(qn("w:val"), "clear")
    cell._tc.get_or_add_tcPr().append(el)


def _para(doc, text, bold=False, italic=False, size=BODY, align=None) -> None:
    p = doc.add_paragraph()
    if align:
        p.alignment = align
    _font(p.add_run(text), size=size, bold=bold, italic=italic)


def _numbered(doc, text) -> None:
    p = doc.add_paragraph(text, style="List Number")
    for r in p.runs:
        _font(r)


def _table(doc, headers, rows, col_widths=None, header_fill=HDR_FILL) -> None:
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]
        c.text = h
        _shade(c, header_fill)
        for p in c.paragraphs:
            for r in p.runs:
                _font(r, size=SMALL, bold=True, color=HDR_TEXT if header_fill in (HDR_FILL, HDR_ALT) else None)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            c = t.rows[ri + 1].cells[ci]
            c.text = val
            for p in c.paragraphs:
                for r in p.runs:
                    _font(r, size=SMALL)
    if col_widths:
        for i, w in enumerate(col_widths):
            for row in t.rows:
                row.cells[i].width = Cm(w)
    doc.add_paragraph()


def _field_table(doc, fields: list[tuple[str, str]], status: str = "Sẵn sàng") -> None:
    status_fill = STATUS_DEFER if status == "Cập nhật sau" else (STATUS_NA if status == "N/A" else "FFFFFF")
    rows = [*fields, ("Trạng thái", status)]
    t = doc.add_table(rows=len(rows), cols=2)
    t.style = "Table Grid"
    for i, (label, value) in enumerate(rows):
        lc, vc = t.rows[i].cells[0], t.rows[i].cells[1]
        lc.text = label
        vc.text = value
        _shade(lc, LABEL_FILL)
        if label == "Trạng thái":
            _shade(vc, status_fill)
        for p in lc.paragraphs:
            for r in p.runs:
                _font(r, size=SMALL, bold=True)
        for p in vc.paragraphs:
            for r in p.runs:
                _font(r, size=SMALL, bold=(label == "Trạng thái"))
    t.columns[0].width = Cm(3.2)
    t.columns[1].width = Cm(13.5)
    doc.add_paragraph()


def _feature(doc, code, name, location, purpose, steps, note="", status="Sẵn sàng") -> None:
    doc.add_heading(f"{code}  {name}", level=3)
    how = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps))
    fields = [("Vị trí", location), ("Mục đích", purpose), ("Cách sử dụng", how)]
    if note:
        fields.append(("Lưu ý", note))
    _field_table(doc, fields, status=status)


def _deferred(doc, code, name, scope) -> None:
    doc.add_heading(f"{code}  {name}", level=3)
    _field_table(
        doc,
        [
            ("Phạm vi", scope),
            ("Hướng dẫn", "Nội dung đang được hoàn thiện — bổ sung phiên bản tài liệu tiếp theo."),
            ("Lưu ý", "Tạm thời không dùng làm căn cứ vận hành chính thức."),
        ],
        status="Cập nhật sau",
    )


def _helmet_rows() -> list[list[str]]:
    return [[f"Helmet {i:02d}", f"HC-{i:02d}", "Luồng RTSP — bodycam tuần tra khu vực"] for i in range(1, HELMET_COUNT + 1)]


def build_document() -> Document:
    doc = Document()
    for sec in doc.sections:
        sec.top_margin = Cm(2)
        sec.bottom_margin = Cm(2)
        sec.left_margin = Cm(2.5)
        sec.right_margin = Cm(2.5)

    # Cover
    t = doc.add_heading("HƯỚNG DẪN SỬ DỤNG", 0)
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    s = doc.add_paragraph()
    s.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _font(s.add_run("Module 05 — Hiệu quả công việc"), Pt(14), bold=True)
    s2 = doc.add_paragraph()
    s2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _font(s2.add_run("Giám sát tuần tra helmet camera & nhân lực công trường"), Pt(12), italic=True)
    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _font(meta.add_run(f"Đường dẫn: {DOC_ROUTE}   |   Phiên bản: {DOC_VERSION}"), CAPTION, color=RGBColor(0x66, 0x66, 0x66))

    doc.add_paragraph()
    _table(
        doc,
        ["Trường", "Giá trị"],
        [
            ["Đối tượng", "Cán bộ giám sát, an toàn, quản lý công trường"],
            ["Thiết bị", f"Helmet 01 – Helmet {HELMET_COUNT:02d} (10 mũ, luồng RTSP)"],
            ["Cấu trúc tài liệu", "Tổng quan → Camera → Heatmap → Sự kiện"],
        ],
        header_fill=HDR_ALT,
    )

    doc.add_page_break()

    # TOC
    doc.add_heading("Mục lục", 1)
    for line in [
        "1. Thuật ngữ & thiết bị tuần tra",
        "2. Danh sách tính năng",
        "   2.1  Tổng quan",
        "   2.2  Camera",
        "   2.3  Heatmap",
        "   2.4  Sự kiện",
        "3. Quy trình sử dụng thường gặp",
        "4. Câu hỏi thường gặp",
        "5. Phụ lục — mục tạm hoãn",
    ]:
        _para(doc, line, size=SMALL)

    doc.add_page_break()

    # 1. Devices
    doc.add_heading("1. Thuật ngữ & thiết bị tuần tra", 1)

    doc.add_heading("1.1  Thiết bị Helmet 01 – Helmet 10", 2)
    _para(doc, f"Hệ thống giám sát {HELMET_COUNT} mũ bodycam, mỗi mũ phát một luồng RTSP riêng qua MediaMTX.")
    _table(doc, ["Tên hiển thị", "Mã", "Luồng / Vai trò"], _helmet_rows(), header_fill=HDR_ALT)

    doc.add_heading("1.2  Ba mức nhận diện người", 2)
    _table(
        doc,
        ["Nhãn", "Màu", "Ý nghĩa"],
        [
            ["Đối tượng", "Xám", "Thấy hình người, chưa đủ nhận diện — mỗi lần vào khung = 1 lượt gặm"],
            ["Người", "Cam", "Mặt đủ rõ, có thể theo dõi lại — chưa biết tên"],
            ["Định danh", "Xanh lá", "Đã khớp tên / mã nhân viên"],
        ],
        header_fill=HDR_ALT,
    )
    _para(doc, "Quy ước: Lượt gặm · ĐT ≠ số người. Ngày lịch VN (0h), lưu 7 ngày.", italic=True)

    doc.add_page_break()

    # 2. Features by panel
    doc.add_heading("2. Danh sách tính năng", 1)
    _para(doc, "Nhóm theo bốn panel trên màn hình /module05. Mỗi tính năng: Vị trí · Mục đích · Cách sử dụng · Lưu ý · Trạng thái.")

    # Summary
    _table(
        doc,
        ["Mã", "Tính năng", "Panel", "Trạng thái"],
        [
            ["TQ-01", "Khu vực tuần tra", "Tổng quan", "Sẵn sàng"],
            ["TQ-02", "Nhân sự", "Tổng quan", "Sẵn sàng"],
            ["TQ-03", "Lượt gặm · ĐT", "Tổng quan", "Sẵn sàng"],
            ["TQ-04", "Mật độ flymap", "Tổng quan", "Cập nhật sau"],
            ["TQ-05", "Thu gọn panel", "Tổng quan", "Sẵn sàng"],
            ["CAM-01", "Live — lưới 10 mũ RTSP", "Camera", "Sẵn sàng"],
            ["CAM-02", "Live — chọn & focus mũ", "Camera", "Sẵn sàng"],
            ["CAM-03", "Live — khung ROI", "Camera", "Sẵn sàng"],
            ["CAM-04", "Live — thu gọn panel", "Camera", "Sẵn sàng"],
            ["CAM-05", "Playback — xem lại 7 ngày", "Camera", "Sẵn sàng"],
            ["CAM-06", "Flycam trên lưới camera", "Camera", "Cập nhật sau"],
            ["MAP-01", "Bản đồ site & layer", "Heatmap", "Sẵn sàng"],
            ["MAP-02", "Chấm 3 tier trên map", "Heatmap", "Sẵn sàng"],
            ["MAP-03", "Lộ trình mũ (10 helmet)", "Heatmap", "Sẵn sàng"],
            ["MAP-04", "Gán định danh từ map", "Heatmap", "Sẵn sàng"],
            ["MAP-05", "Phóng to fullscreen", "Heatmap", "Sẵn sàng"],
            ["MAP-06", "Flymap", "Heatmap", "Cập nhật sau"],
            ["EVT-01", "Chọn ngày xem", "Sự kiện", "Sẵn sàng"],
            ["EVT-02", "Lọc tab 4 loại", "Sự kiện", "Sẵn sàng"],
            ["EVT-03", "Tìm kiếm", "Sự kiện", "Sẵn sàng"],
            ["EVT-04", "Thẻ sự kiện", "Sự kiện", "Sẵn sàng"],
            ["EVT-05", "Popup chi tiết", "Sự kiện", "Sẵn sàng"],
        ],
        col_widths=[1.8, 5.2, 3.2, 3.3],
        header_fill=HDR_ALT,
    )

    doc.add_page_break()

    # 2.1 Tổng quan
    doc.add_heading("2.1  Tổng quan", 1)
    _para(doc, "Panel Tier 1 — bốn thẻ KPI ngay dưới tiêu đề trang.", italic=True)

    _feature(
        doc, "TQ-01", "Khu vực tuần tra",
        location="Thẻ KPI thứ 1",
        purpose=f"Theo dõi bao nhiêu khu trên site có ít nhất một trong {HELMET_COUNT} mũ online đang phủ.",
        steps=[
            "Đọc số X/Y khu vực.",
            "Xem dòng chi tiết: % khu active hoặc «Thiết bị online — chờ xác nhận phủ khu».",
            "«Chưa có thiết bị tuần tra online» — kiểm tra mũ đã phát RTSP.",
        ],
    )

    _feature(
        doc, "TQ-02", "Nhân sự",
        location="Thẻ KPI thứ 2",
        purpose="Tổng headcount ngày = Người + Định danh (từ mọi mũ ghi nhận).",
        steps=[
            "Đọc con số lớn trên thẻ.",
            "Dòng dưới tách icon cam (Người) và xanh lá (Định danh) khi có dữ liệu.",
            "«Đang tuần tra — chờ phát hiện»: có mũ online, chưa ai vào khung.",
            "«Chưa có dữ liệu hôm nay»: chưa phát hiện và không mũ nào online.",
        ],
        note="Có thể khác badge tab Sự kiện — bình thường.",
    )

    _feature(
        doc, "TQ-03", "Lượt gặm · ĐT",
        location="Thẻ KPI thứ 3",
        purpose="Đếm lần silhouette chưa định danh vào khung (tổng hợp từ 10 mũ).",
        steps=[
            "Đọc số lượt — mỗi lần vào khung bất kỳ mũ nào = 1 lượt.",
            "Peak time: «Peak time — mỗi lần vào khung một lượt, không gộp».",
        ],
        note="Không trừ Lượt gặm khỏi Nhân sự.",
    )

    _deferred(doc, "TQ-04", "Mật độ flymap", scope="Thẻ KPI thứ 4 — mật độ từ flycam (ngoài phạm vi 10 mũ RTSP).")

    _feature(
        doc, "TQ-05", "Thu gọn panel Tổng quan",
        location="Nút mũi tên header panel Tổng Quan",
        purpose="Giải phóng không gian cho Camera / Heatmap / Sự kiện.",
        steps=["Click thu gọn.", "Click lại để hiện 4 thẻ KPI."],
    )

    doc.add_page_break()

    # 2.2 Camera
    doc.add_heading("2.2  Camera", 1)
    _para(doc, "Panel Tier 2 — toggle Live / Playback. Lưới hiển thị 10 mũ Helmet 01–10.", italic=True)

    _feature(
        doc, "CAM-01", "Live — lưới 10 mũ RTSP",
        location="Panel Camera · chế độ Live",
        purpose=f"Quan sát hiện trường realtime từ {HELMET_COUNT} luồng RTSP (Helmet 01 – Helmet {HELMET_COUNT:02d}).",
        steps=[
            "Mở /module05 — mặc định chế độ Live.",
            "Lưới hiển thị tile cho từng mũ; cuộn nếu không đủ chỗ trên màn hình.",
            "Badge LIVE + chấm nhấp nháy = luồng RTSP đang active.",
            "Không badge = mũ offline — hệ thống tự thử kết nối lại.",
        ],
    )

    _feature(
        doc, "CAM-02", "Live — chọn & focus mũ",
        location="Tile camera trên lưới Live",
        purpose="Tập trung xem một mũ cụ thể.",
        steps=[
            "Click tile mũ cần xem — viền highlight.",
            "Mặc định thường chọn Helmet 02 (có thể đổi tùy cấu hình site).",
            "Sidebar thumbnail: chọn nhanh giữa 10 mũ.",
        ],
    )

    _feature(
        doc, "CAM-03", "Live — khung nhận diện (ROI)",
        location="Trên video tile · toolbar",
        purpose="Thấy ai trong khung và mức nhận diện (xám / cam / xanh lá).",
        steps=[
            "Bật/tắt khung người bằng nút bbox trên toolbar.",
            "Nhãn khung: Đối tượng / Người / Định danh.",
        ],
        note="Khung có thể trễ vài giây so với hình — bình thường.",
    )

    _feature(
        doc, "CAM-04", "Live — thu gọn panel Camera",
        location="Nút thu gọn header panel Camera",
        purpose="Tiết kiệm không gian màn hình.",
        steps=[
            "Click thu gọn — header hiện «X luồng» (số RTSP active).",
            "Phóng to tier Camera (desktop) để xem đủ lưới 10 mũ.",
        ],
    )

    _feature(
        doc, "CAM-05", "Playback — xem lại 7 ngày",
        location="Panel Camera · chế độ Playback",
        purpose="Xem lại băng ghi RTSP đã lưu (MediaMTX) trong 7 ngày.",
        steps=[
            "Chuyển toggle sang Playback.",
            "Chọn ngày — đồng bộ với panel Sự kiện.",
            "Chọn mũ (Helmet 01–10) trên sidebar.",
            "Kéo timeline hoặc click marker sự kiện → clip ~30 giây.",
        ],
        note="Ngày tính 0h Việt Nam.",
    )

    _deferred(doc, "CAM-06", "Flycam trên lưới camera", scope="Tab / tile flycam trên panel Camera — ngoài 10 mũ RTSP.")

    doc.add_page_break()

    # 2.3 Heatmap
    doc.add_heading("2.3  Heatmap", 1)
    _para(doc, "Panel Tier 3 trái — bản đồ site Cầu Sông Hốt.", italic=True)

    _feature(
        doc, "MAP-01", "Bản đồ site & layer",
        location="Panel HEATMAP",
        purpose="Theo dõi phát hiện và thiết bị trên site.",
        steps=[
            "Bật/tắt layer: Khu vực · Mật độ · Mũ.",
            "Khu vực: viền polygon site.",
            "Mật độ: chấm presences theo tier.",
        ],
    )

    _feature(
        doc, "MAP-02", "Chấm 3 tier trên map",
        location="Layer Mật độ",
        purpose="Vị trí GPS các lần phát hiện — khớp KPI Tổng quan.",
        steps=[
            "Chấm xám = Đối tượng (lượt gặm).",
            "Chấm cam = Người.",
            "Chấm xanh lá = Định danh.",
            "Góc map: overlay đếm 3 loại.",
        ],
    )

    _feature(
        doc, "MAP-03", "Lộ trình mũ (10 helmet)",
        location="Layer Mũ",
        purpose=f"Theo dõi vị trí & route của {HELMET_COUNT} mũ đang online.",
        steps=[
            "Bật layer Mũ.",
            "Marker + route cho từng Helmet 01–10 có GPS và online.",
            "Map có thể pan theo GPS mũ đang focus (tùy mũ active).",
        ],
    )

    _feature(
        doc, "MAP-04", "Gán định danh từ map",
        location="Click chấm → sheet dưới map",
        purpose="Gán mã NV cho đối tượng xám khi nhận ra thủ công.",
        steps=[
            "Click chấm xám.",
            "Nhập mã NV / chọn gợi ý trong panel gán.",
            "Sau đồng bộ: chấm và thẻ sự kiện chuyển Định danh.",
        ],
    )

    _feature(
        doc, "MAP-05", "Phóng to fullscreen",
        location="Nút phóng to header panel Heatmap",
        purpose="Xem bản đồ toàn màn hình.",
        steps=["Click phóng to.", "Escape hoặc nút thu nhỏ để thoát — giữ nguyên layer đang bật."],
    )

    _deferred(doc, "MAP-06", "Flymap", scope="Chế độ FLYMAP · overlay flycam · KPI Mật độ flymap.")

    doc.add_page_break()

    # 2.4 Sự kiện
    doc.add_heading("2.4  Sự kiện", 1)
    _para(doc, "Panel Tier 3 phải — bằng chứng hình ảnh trong ngày (tổng hợp từ 10 mũ).", italic=True)

    _feature(
        doc, "EVT-01", "Chọn ngày xem",
        location="Date picker trên panel Sự kiện",
        purpose="Tra cứu sự kiện theo ngày lịch.",
        steps=[
            "Dùng mũi tên hoặc lịch compact.",
            "Phạm vi 7 ngày gần nhất.",
            "«Đang xem ngày trước» khi không phải hôm nay.",
        ],
    )

    _feature(
        doc, "EVT-02", "Lọc tab 4 loại",
        location="Thanh tab dưới date picker",
        purpose="Lọc theo mức nhận diện.",
        steps=[
            "Tất cả — mọi thẻ có ảnh.",
            "Đối tượng / Người / Định danh — theo tier.",
            "Badge = số thẻ trong tab.",
        ],
    )

    _feature(
        doc, "EVT-03", "Tìm kiếm",
        location="Ô tìm dưới tab",
        purpose="Tìm người trong danh sách.",
        steps=["Gõ tên, mã NV, hoặc pers_id.", "Lọc sau ~0,3 giây khi ngừng gõ."],
    )

    _feature(
        doc, "EVT-04", "Thẻ sự kiện",
        location="Danh sách cuộn panel Sự kiện",
        purpose="Xem snapshot, thời gian, mũ ghi nhận (Helmet 01–10).",
        steps=[
            "Mỗi thẻ: badge tier, thumbnail, tên/alias, giờ, vị trí/mũ.",
            "Click thẻ → highlight + sync ngày playback.",
            "Cuộn cuối danh sách → tải thêm tự động.",
        ],
        note="Chỉ hiện thẻ có snapshotUrl.",
    )

    _feature(
        doc, "EVT-05", "Popup chi tiết",
        location="Overlay sau khi click thẻ",
        purpose="Xem ảnh lớn, lịch sử xuất hiện, gallery mặt.",
        steps=[
            "Popup: tier, tên, camera/mũ, GPS, thời gian.",
            "Lịch sử xuất hiện trong ngày (nhiều mũ / nhiều lần).",
            "Escape hoặc X để đóng.",
        ],
    )

    doc.add_page_break()

    # 3. Workflows
    doc.add_heading("3. Quy trình sử dụng thường gặp", 1)

    doc.add_heading("3.1  Giám sát ca tuần tra", 2)
    for s in [
        "Mở /module05 — kiểm tra KPI Tổng quan (Khu vực, Nhân sự).",
        "Camera Live — chọn mũ cần theo dõi trong lưới 10 helmet.",
        "Bật ROI nếu cần thấy ai trong khung.",
        "Heatmap — theo dõi chấm và lộ trình các mũ online.",
        "Sự kiện tab «Tất cả» — xem phát hiện mới.",
    ]:
        _numbered(doc, s)

    doc.add_heading("3.2  Tra cứu sự cố", 2)
    for s in [
        "Sự kiện — chọn ngày.",
        "Tìm theo tên/mã hoặc lọc tab.",
        "Click thẻ → popup chi tiết (xem mũ nào ghi nhận).",
        "Camera Playback — xem clip 30 giây cùng mũ & thời điểm.",
    ]:
        _numbered(doc, s)

    doc.add_heading("3.3  Gán danh tính", 2)
    for s in [
        "Sự kiện tab «Đối tượng» hoặc chấm xám trên Heatmap.",
        "Xem snapshot — nhận diện thủ công.",
        "Heatmap sheet → nhập mã NV.",
    ]:
        _numbered(doc, s)

    # 4. FAQ
    doc.add_heading("4. Câu hỏi thường gặp", 1)
    _table(
        doc,
        ["Câu hỏi", "Trả lời"],
        [
            (f"Có bao nhiêu mũ?", f"{HELMET_COUNT} mũ — Helmet 01 đến Helmet {HELMET_COUNT:02d}, mỗi mũ một luồng RTSP."),
            ("Nhân sự khác badge tab?", "KPI từ sổ cái ngày; tab đếm thẻ có ảnh — bình thường."),
            ("Lượt gặm > số người?", "Mỗi lần vào khung bất kỳ mũ nào = 1 lượt."),
            ("Một người nhiều mũ ghi nhận?", "Có thể — mỗi mũ ghi riêng; dedupe theo entity trên map/tab."),
            ("Không thấy thẻ?", "Chỉ hiện khi có snapshot. Thử ngày khác."),
            ("Xem bao nhiêu ngày?", "7 ngày — playback, sự kiện, heatmap dùng chung ngày."),
        ],
        col_widths=[6, 10.5],
        header_fill=HDR_ALT,
    )

    doc.add_page_break()

    # 5. Appendix
    doc.add_heading("5. Phụ lục — mục tạm hoãn", 1)

    doc.add_heading("5.1  Flycam / Flymap — Cập nhật sau", 2)
    _table(
        doc,
        ["Mã", "Hạng mục", "Trạng thái"],
        [
            ["TQ-04", "KPI Mật độ flymap", "Cập nhật sau"],
            ["CAM-06", "Flycam trên Camera", "Cập nhật sau"],
            ["MAP-06", "Chế độ Flymap", "Cập nhật sau"],
        ],
        header_fill=HDR_ALT,
    )

    doc.add_heading("5.2  Trang bổ trợ — N/A", 2)
    _table(
        doc,
        ["Đường dẫn", "Mô tả", "Trạng thái"],
        [
            ["/module05/ho-so", "Quản lý hồ sơ công nhân", "N/A"],
            ["/module05/quet-mat", "Quét mặt / tạo hồ sơ", "N/A"],
            ["/phat-song", "Phát luồng từ thiết bị đeo mũ", "N/A"],
        ],
        header_fill=HDR_ALT,
    )

    f = doc.add_paragraph()
    f.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _font(f.add_run("— Vifence CMS · Module 05 · Hướng dẫn sử dụng —"), CAPTION, italic=True, color=RGBColor(0x99, 0x99, 0x99))

    return doc


def main() -> None:
    out = "/workspace/docs/module05/Module05_HuongDanSuDung.docx"
    build_document().save(out)
    print(out)


if __name__ == "__main__":
    main()
