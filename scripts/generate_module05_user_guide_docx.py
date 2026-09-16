#!/usr/bin/env python3
"""Generate Module 05 user guide DOCX — standardized business format."""

from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ── Style constants ──────────────────────────────────────────────
FONT = "Calibri"
BODY = Pt(11)
SMALL = Pt(10)
CAPTION = Pt(9)
HDR_FILL = "1F3864"      # header row — dark blue
HDR_TEXT = RGBColor(0xFF, 0xFF, 0xFF)
LABEL_FILL = "EEF2F7"    # label column
STATUS_DEFER = "FFF3CD"  # amber — cập nhật sau
STATUS_NA = "E9ECEF"     # gray — N/A

DOC_VERSION = "2026-09-16 · rev.2"
DOC_ROUTE = "/module05"


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
    r = p.add_run(text)
    _font(r, size=size, bold=bold, italic=italic)
    return p


def _bullet(doc, text, level=0) -> None:
    p = doc.add_paragraph(text, style="List Bullet")
    if level:
        p.paragraph_format.left_indent = Cm(0.6 * level)
    for r in p.runs:
        _font(r)


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
                _font(r, size=SMALL, bold=True, color=HDR_TEXT if header_fill == HDR_FILL else None)
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
    """Two-column label/value block — uniform feature card."""
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


def _feature(
    doc,
    code: str,
    name: str,
    location: str,
    purpose: str,
    steps: list[str],
    note: str = "",
    status: str = "Sẵn sàng",
) -> None:
    doc.add_heading(f"{code}  {name}", level=3)
    how = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps))
    fields = [
        ("Vị trí", location),
        ("Mục đích", purpose),
        ("Cách sử dụng", how),
    ]
    if note:
        fields.append(("Lưu ý", note))
    _field_table(doc, fields, status=status)


def _deferred_block(doc, code: str, name: str, scope: str) -> None:
    doc.add_heading(f"{code}  {name}", level=3)
    _field_table(
        doc,
        [
            ("Phạm vi", scope),
            ("Hướng dẫn", "Nội dung đang được hoàn thiện — sẽ bổ sung trong phiên bản tài liệu tiếp theo."),
            ("Lưu ý", "Tạm thời không sử dụng mục này làm căn cứ vận hành chính thức."),
        ],
        status="Cập nhật sau",
    )


def build_document() -> Document:
    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Cm(2)
    sec.bottom_margin = Cm(2)
    sec.left_margin = Cm(2.5)
    sec.right_margin = Cm(2.5)

    # ── Cover ────────────────────────────────────────────────────
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
            ["Phạm vi", "Màn hình chính /module05 — Tổng quan, Camera, Heatmap, Sự kiện"],
            ["Ngoài phạm vi (tạm thời)", "Flycam / Flymap · Trang bổ trợ — xem mục cuối tài liệu"],
        ],
        header_fill="2E5090",
    )

    doc.add_page_break()

    # ── TOC ──────────────────────────────────────────────────────
    doc.add_heading("Mục lục", 1)
    toc = [
        "1. Thuật ngữ & quy ước",
        "2. Danh sách tính năng (theo bố cục màn hình — trên xuống dưới)",
        "   2.1  Tiêu đề trang",
        "   2.2  Panel Tổng Quan",
        "   2.3  Panel Camera",
        "   2.4  Panel Heatmap",
        "   2.5  Panel Sự kiện",
        "3. Quy trình sử dụng thường gặp",
        "4. Câu hỏi thường gặp",
        "5. Phụ lục — mục tạm hoãn (Flycam/Flymap · Trang bổ trợ)",
    ]
    for line in toc:
        _para(doc, line, size=SMALL)
    doc.add_page_break()

    # ── 1. Terminology ─────────────────────────────────────────
    doc.add_heading("1. Thuật ngữ & quy ước", 1)

    doc.add_heading("1.1  Thiết bị tuần tra (helmet)", 2)
    _table(
        doc,
        ["Tên hiển thị", "Mã", "Vai trò"],
        [
            ["Helmet 01", "HC-01", "Mũ bodycam tuần tra — luồng RTSP"],
            ["Helmet 02", "HC-02", "Mũ bodycam di động — GPS & luồng WHIP"],
        ],
    )

    doc.add_heading("1.2  Ba mức nhận diện người", 2)
    _table(
        doc,
        ["Nhãn", "Màu", "Ý nghĩa"],
        [
            ["Đối tượng", "Xám", "Thấy hình người, chưa đủ nhận diện — mỗi lần vào khung = 1 lượt gặp"],
            ["Người", "Cam", "Mặt đủ rõ, có thể theo dõi lại — chưa biết tên"],
            ["Định danh", "Xanh lá", "Đã khớp tên / mã nhân viên"],
        ],
    )
    _para(doc, "Quy ước đếm: Lượt gặm · ĐT ≠ số người. Không trừ Lượt gặm khỏi Nhân sự.", italic=True)
    _para(doc, "Quy ước ngày: ngày lịch Việt Nam (0h). Dữ liệu lưu 7 ngày gần nhất.", italic=True)

    doc.add_page_break()

    # ── 2. Feature list ──────────────────────────────────────────
    doc.add_heading("2. Danh sách tính năng theo bố cục màn hình", 1)
    _para(
        doc,
        "Đọc màn hình từ trên xuống dưới. Mỗi tính năng có cùng định dạng: "
        "Vị trí · Mục đích · Cách sử dụng · Lưu ý · Trạng thái.",
    )

    # Summary index
    doc.add_heading("2.0  Bảng tổng hợp nhanh", 2)
    _table(
        doc,
        ["Mã", "Tính năng", "Panel", "Trạng thái"],
        [
            ["F-01", "Tiêu đề trang", "Header", "Sẵn sàng"],
            ["F-02", "Khu vực tuần tra", "Tổng Quan", "Sẵn sàng"],
            ["F-03", "Nhân sự", "Tổng Quan", "Sẵn sàng"],
            ["F-04", "Lượt gặm · ĐT", "Tổng Quan", "Sẵn sàng"],
            ["F-05", "Mật độ flymap", "Tổng Quan", "Cập nhật sau"],
            ["F-06", "Thu gọn Tổng Quan", "Tổng Quan", "Sẵn sàng"],
            ["F-07", "Live — lưới camera", "Camera", "Sẵn sàng"],
            ["F-08", "Live — khung ROI", "Camera", "Sẵn sàng"],
            ["F-09", "Live — lọc Bodycam", "Camera", "Sẵn sàng"],
            ["F-10", "Playback — xem lại", "Camera", "Sẵn sàng"],
            ["F-11", "Heatmap — bản đồ site", "Heatmap", "Sẵn sàng"],
            ["F-12", "Heatmap — gán định danh", "Heatmap", "Sẵn sàng"],
            ["F-13", "Flymap", "Heatmap", "Cập nhật sau"],
            ["F-14", "Flycam trên camera", "Camera", "Cập nhật sau"],
            ["F-15", "Chọn ngày", "Sự kiện", "Sẵn sàng"],
            ["F-16", "Lọc tab", "Sự kiện", "Sẵn sàng"],
            ["F-17", "Tìm kiếm", "Sự kiện", "Sẵn sàng"],
            ["F-18", "Thẻ & popup chi tiết", "Sự kiện", "Sẵn sàng"],
        ],
        col_widths=[1.5, 5.5, 3.5, 3.5],
        header_fill="2E5090",
    )

    doc.add_page_break()

    # 2.1 Header
    doc.add_heading("2.1  Tiêu đề trang", 2)
    _feature(
        doc, "F-01", "Tiêu đề trang",
        location="Đầu trang /module05",
        purpose="Xác nhận đang ở module giám sát tuần tra công trường.",
        steps=["Kiểm tra tiêu đề «Hiệu Quả Công Việc».", "Đọc dòng phụ «Giám sát tuần tra helmet camera & mật độ lao động»."],
    )

    # 2.2 KPI
    doc.add_heading("2.2  Panel Tổng Quan", 2)
    _para(doc, "Tier 1 — bốn thẻ KPI ngay dưới tiêu đề.", italic=True)

    _feature(
        doc, "F-02", "Khu vực tuần tra",
        location="Thẻ KPI thứ 1 — panel Tổng Quan",
        purpose="Biết bao nhiêu khu trên site đã có mũ tuần tra online đang phủ.",
        steps=[
            "Đọc số dạng X/Y khu vực.",
            "Xem dòng chi tiết: % khu active, hoặc «Thiết bị online — chờ xác nhận phủ khu».",
            "Nếu «Chưa có thiết bị tuần tra online» — kiểm tra mũ đã bật stream.",
        ],
    )

    _feature(
        doc, "F-03", "Nhân sự",
        location="Thẻ KPI thứ 2 — panel Tổng Quan",
        purpose="Tổng headcount ngày = Người + Định danh.",
        steps=[
            "Đọc con số lớn trên thẻ.",
            "Khi có dữ liệu: dòng dưới tách icon cam (Người) và xanh lá (Định danh).",
            "«Đang tuần tra — chờ phát hiện»: mũ online, chưa ai vào khung.",
            "«Chưa có dữ liệu hôm nay»: chưa phát hiện và mũ offline.",
        ],
        note="Có thể khác badge tab Sự kiện — bình thường.",
    )

    _feature(
        doc, "F-04", "Lượt gặm · ĐT",
        location="Thẻ KPI thứ 3 — panel Tổng Quan",
        purpose="Đếm lần silhouette chưa định danh vào khung camera.",
        steps=[
            "Đọc số lượt trên thẻ.",
            "Mỗi lần vào khung = 1 lượt — không gộp thành số người.",
            "Giờ cao điểm: detail «Peak time — mỗi lần vào khung một lượt, không gộp».",
        ],
        note="Không trừ Lượt gặm khỏi Nhân sự.",
    )

    _deferred_block(
        doc, "F-05", "Mật độ flymap",
        scope="Thẻ KPI thứ 4 — ước lượng mật độ từ flycam tầm cao (Drone 03).",
    )

    _feature(
        doc, "F-06", "Thu gọn panel Tổng Quan",
        location="Nút mũi tên góc phải header panel Tổng Quan",
        purpose="Giải phóng không gian cho Camera và Heatmap.",
        steps=["Click nút thu gọn.", "Click lại để mở rộng — 4 thẻ KPI hiện lại."],
    )

    doc.add_page_break()

    # 2.3 Camera
    doc.add_heading("2.3  Panel Camera", 2)
    _para(doc, "Tier 2 — toggle Live / Playback ở góc phải header.", italic=True)

    _feature(
        doc, "F-07", "Live — lưới camera helmet",
        location="Panel Camera · chế độ Live",
        purpose="Quan sát hiện trường realtime từ Helmet 01 và Helmet 02.",
        steps=[
            "Mặc định Helmet 02 được chọn (viền highlight).",
            "Click tile để chuyển camera.",
            "Badge LIVE + chấm nhấp nháy = đang có luồng.",
            "Không badge = offline — hệ thống tự thử kết nối lại.",
        ],
    )

    _feature(
        doc, "F-08", "Live — khung nhận diện (ROI)",
        location="Trên video tile camera · toolbar",
        purpose="Thấy ai trong khung và mức nhận diện (xám / cam / xanh lá).",
        steps=[
            "Bật/tắt khung người bằng nút bbox trên toolbar video.",
            "Đọc nhãn trên khung: Đối tượng / Người / Định danh.",
        ],
        note="Khung có thể trễ vài giây so với hình — bình thường.",
    )

    _feature(
        doc, "F-09", "Live — lọc Bodycam",
        location="Tab filter trên lưới camera",
        purpose="Chỉ xem mũ bodycam (Helmet 01, Helmet 02).",
        steps=["Click tab «Bodycam».", "Chỉ còn tile HC-01 và HC-02."],
    )

    _deferred_block(
        doc, "F-14", "Flycam trên camera",
        scope="Tab Flycam · tile Drone 03 · badge Tầm cao/Tầm thấp · overlay flycam trên lưới Live.",
    )

    _feature(
        doc, "F-10", "Playback — xem lại",
        location="Panel Camera · chế độ Playback",
        purpose="Xem lại video đã ghi trong 7 ngày.",
        steps=[
            "Chuyển toggle sang Playback.",
            "Chọn ngày — đồng bộ với panel Sự kiện.",
            "Chọn camera sidebar · kéo timeline hoặc click marker sự kiện.",
            "Click marker → phát clip ~30 giây quanh thời điểm ghi nhận.",
        ],
        note="Ngày tính 0h Việt Nam.",
    )

    doc.add_page_break()

    # 2.4 Heatmap
    doc.add_heading("2.4  Panel Heatmap", 2)
    _para(doc, "Tier 3 trái — bản đồ site Cầu Sông Hốt.", italic=True)

    _feature(
        doc, "F-11", "Heatmap — bản đồ site",
        location="Panel HEATMAP (mặc định)",
        purpose="Theo dõi vị trí phát hiện và lộ trình mũ trên site.",
        steps=[
            "Bật/tắt layer: Khu vực · Mật độ · Mũ.",
            "Chấm xám = Đối tượng, cam = Người, xanh lá = Định danh.",
            "Góc map: đếm 3 loại — khớp KPI Tổng Quan.",
            "Nút phóng to header → fullscreen; Escape để thoát.",
        ],
    )

    _feature(
        doc, "F-12", "Heatmap — gán định danh thủ công",
        location="Click chấm trên bản đồ → sheet phía dưới",
        purpose="Gán tên / mã NV cho đối tượng xám khi nhận ra thủ công.",
        steps=[
            "Click chấm xám trên map.",
            "Nhập mã NV hoặc chọn gợi ý trong panel gán.",
            "Sau đồng bộ: chấm và thẻ sự kiện chuyển sang Định danh.",
        ],
    )

    _deferred_block(
        doc, "F-13", "Flymap",
        scope="Nút Flymap trên header panel map · chế độ FLYMAP · layer Drone · overlay Phát hiện · KPI Mật độ flymap.",
    )

    doc.add_page_break()

    # 2.5 Events
    doc.add_heading("2.5  Panel Sự kiện", 2)
    _para(doc, "Tier 3 phải — danh sách bằng chứng hình ảnh trong ngày.", italic=True)

    _feature(
        doc, "F-15", "Chọn ngày xem",
        location="Date picker phía trên danh sách thẻ",
        purpose="Tra cứu sự kiện theo ngày lịch.",
        steps=[
            "Dùng mũi tên hoặc lịch compact.",
            "Phạm vi: 7 ngày gần nhất.",
            "«Đang xem ngày trước» khi không phải hôm nay.",
        ],
    )

    _feature(
        doc, "F-16", "Lọc theo tab",
        location="Thanh tab dưới date picker",
        purpose="Lọc nhanh theo mức nhận diện.",
        steps=[
            "Tất cả — mọi thẻ có ảnh.",
            "Đối tượng — silhouette chưa nhận diện.",
            "Người — có mặt, chưa biết tên.",
            "Định danh — đã có tên / mã NV.",
            "Badge = số thẻ trong tab.",
        ],
    )

    _feature(
        doc, "F-17", "Tìm kiếm",
        location="Ô tìm dưới thanh tab",
        purpose="Tìm người cụ thể trong danh sách.",
        steps=[
            "Gõ tên, mã NV, hoặc pers_id.",
            "Danh sách lọc sau ~0,3 giây khi ngừng gõ.",
        ],
    )

    _feature(
        doc, "F-18", "Thẻ sự kiện & popup chi tiết",
        location="Danh sách thẻ · popup overlay",
        purpose="Xem ảnh, thời gian, vị trí; mở playback tương ứng.",
        steps=[
            "Mỗi thẻ: badge tier, thumbnail, tên, giờ, camera/khu.",
            "Click thẻ → highlight + sync ngày playback + mở popup.",
            "Popup: ảnh lớn, lịch sử xuất hiện, gallery mặt (nếu định danh).",
            "Escape hoặc nút X để đóng.",
            "Cuộn cuối danh sách → tải thêm thẻ tự động.",
        ],
    )

    doc.add_page_break()

    # ── 3. Workflows ─────────────────────────────────────────────
    doc.add_heading("3. Quy trình sử dụng thường gặp", 1)

    doc.add_heading("3.1  Giám sát ca tuần tra (realtime)", 2)
    for s in [
        "Mở /module05 — kiểm tra KPI Khu vực và Nhân sự.",
        "Camera Live — xem Helmet 02 (hoặc chọn mũ khác).",
        "Bật ROI nếu cần thấy ai trong khung.",
        "Heatmap — theo dõi chấm và lộ trình mũ.",
        "Sự kiện tab «Tất cả» — xem phát hiện mới (tự refresh hôm nay).",
    ]:
        _numbered(doc, s)

    doc.add_heading("3.2  Tra cứu sự cố / đối chiếu bằng chứng", 2)
    for s in [
        "Sự kiện — chọn ngày xảy ra.",
        "Tìm theo tên/mã hoặc lọc tab Đối tượng / Định danh.",
        "Click thẻ → popup chi tiết + lịch sử xuất hiện.",
        "Camera Playback — xem clip 30 giây cùng thời điểm.",
    ]:
        _numbered(doc, s)

    doc.add_heading("3.3  Gán danh tính cho người chưa rõ", 2)
    for s in [
        "Sự kiện tab «Đối tượng» — hoặc click chấm xám trên Heatmap.",
        "Xem snapshot — nhận diện thủ công.",
        "Heatmap sheet → nhập mã NV trong panel gán.",
    ]:
        _numbered(doc, s)

    # ── 4. FAQ ───────────────────────────────────────────────────
    doc.add_heading("4. Câu hỏi thường gặp", 1)
    faq = [
        ("Nhân sự khác badge tab Sự kiện?", "KPI từ sổ cái ngày; tab đếm thẻ có ảnh — hai cách đếm khác nhau, bình thường."),
        ("Lượt gặm nhiều hơn số người?", "Mỗi lần vào khung = 1 lượt. Không dùng để suy ra số người lạ."),
        ("Không thấy thẻ sự kiện?", "Chỉ hiện khi có snapshot. Thử ngày khác hoặc chờ backend ghi nhận."),
        ("Chấm map và video không khớp ngay?", "Map cập nhật sau vài giây. ROI video delay ~5s — bình thường."),
        ("Xem được bao nhiêu ngày?", "7 ngày gần nhất — playback, sự kiện, heatmap dùng chung ngày."),
    ]
    _table(doc, ["Câu hỏi", "Trả lời"], faq, col_widths=[6, 10.5], header_fill="2E5090")

    doc.add_page_break()

    # ── 5. Deferred appendix ─────────────────────────────────────
    doc.add_heading("5. Phụ lục — mục tạm hoãn", 1)
    _para(
        doc,
        "Các mục dưới đây chưa có hướng dẫn vận hành chính thức. "
        "Không dùng làm căn cứ đào tạo cho đến khi tài liệu được cập nhật.",
        bold=True,
    )

    doc.add_heading("5.1  Flycam & Flymap — Cập nhật sau", 2)
    _table(
        doc,
        ["Mã", "Hạng mục", "Trạng thái"],
        [
            ["F-05", "KPI Mật độ flymap (Tổng Quan)", "Cập nhật sau"],
            ["F-13", "Chế độ Flymap (panel map)", "Cập nhật sau"],
            ["F-14", "Tab Flycam & tile Drone 03 (Camera Live)", "Cập nhật sau"],
        ],
        header_fill="2E5090",
    )
    _para(doc, "Nội dung dự kiến bổ sung: cách bật Flymap, đọc overlay mật độ, phân biệt tầm cao/tầm thấp, quy tắc lọc sự kiện flycam.", italic=True)

    doc.add_heading("5.2  Trang bổ trợ — N/A", 2)
    _table(
        doc,
        ["Đường dẫn", "Mô tả", "Trạng thái"],
        [
            ["/module05/ho-so", "Quản lý hồ sơ công nhân", "N/A"],
            ["/module05/quet-mat", "Quét mặt / tạo hồ sơ", "N/A"],
            ["/phat-song", "Phát luồng từ thiết bị đeo mũ", "N/A"],
        ],
        header_fill="2E5090",
    )
    _para(doc, "Hướng dẫn các trang trên sẽ phát hành riêng — chưa nằm trong phạm vi tài liệu này.", italic=True)

    # Footer
    doc.add_paragraph()
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
