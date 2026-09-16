#!/usr/bin/env python3
"""Generate Module 05 user guide DOCX — business-oriented, top to bottom."""

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


def add_bullet(doc: Document, text: str) -> None:
    p = doc.add_paragraph(text, style="List Bullet")
    for run in p.runs:
        run.font.size = Pt(11)
        run.font.name = "Calibri"


def add_numbered(doc: Document, text: str) -> None:
    p = doc.add_paragraph(text, style="List Number")
    for run in p.runs:
        run.font.size = Pt(11)
        run.font.name = "Calibri"


def add_feature_block(
    doc: Document,
    name: str,
    purpose: str,
    how_to: list[str],
    note: str | None = None,
) -> None:
    add_para(doc, name, bold=True)
    add_para(doc, f"Mục đích: {purpose}")
    add_para(doc, "Cách sử dụng:", bold=True)
    for step in how_to:
        add_numbered(doc, step)
    if note:
        add_para(doc, f"Lưu ý: {note}", italic=True)
    doc.add_paragraph()


def add_table(doc: Document, headers: list[str], rows: list[list[str]]) -> None:
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = h
        set_cell_shading(cell, "E8F4EA")
        for p in cell.paragraphs:
            for run in p.runs:
                run.bold = True
                run.font.size = Pt(10)
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

    title = doc.add_heading("Hướng dẫn sử dụng Module 05", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run("Hiệu quả công việc — Giám sát tuần tra & nhân lực công trường")
    r.italic = True
    r.font.size = Pt(12)

    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    m = meta.add_run("Đường dẫn: /module05  ·  Phiên bản tài liệu: 2026-09-16")
    m.font.size = Pt(10)
    m.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    doc.add_paragraph()

    # --- Intro ---
    add_heading(doc, "1. Giới thiệu", 1)
    add_para(
        doc,
        "Module 05 dành cho cán bộ giám sát, an toàn và quản lý công trường — theo dõi "
        "tuần tra qua mũ camera (Helmet) và flycam, biết ai đang ở đâu, đã nhận diện được "
        "bao nhiêu người, và xem lại bằng chứng hình ảnh trong ngày.",
    )
    add_para(doc, "Thiết bị được giám sát:", bold=True)
    add_table(
        doc,
        ["Tên trên màn hình", "Thiết bị", "Vai trò"],
        [
            ["Helmet 01", "HC-01", "Mũ bodycam tuần tra khu vực"],
            ["Helmet 02", "HC-02", "Mũ bodycam (thường mang GPS di động)"],
            ["Drone 03", "DR-03", "Flycam — tầm cao (mật độ) hoặc tầm thấp (AI gần)"],
        ],
    )

    add_heading(doc, "2. Ba mức nhận diện người (cần biết trước khi dùng)", 1)
    add_para(doc, "Toàn bộ màn hình dùng chung ba nhãn màu sau:")
    add_table(
        doc,
        ["Nhãn", "Màu", "Ý nghĩa với người vận hành"],
        [
            ["Đối tượng", "Xám", "Thấy hình người nhưng chưa đủ để nhận diện — mỗi lần vào khung tính 1 lượt gặp"],
            ["Người", "Cam", "Mặt đủ rõ — hệ thống có thể theo dõi lại (re-ID) nhưng chưa biết tên"],
            ["Định danh", "Xanh lá", "Đã biết tên / mã nhân viên — khớp hồ sơ gallery"],
        ],
    )
    add_para(
        doc,
        "Quan trọng: số Lượt gặp · ĐT không phải số người. Một người đi qua nhiều lần "
        "hoặc nhiều camera sẽ tạo nhiều lượt. Không trừ Lượt gặm khỏi Nhân sự.",
        italic=True,
    )

    doc.add_page_break()

    # --- Screen walkthrough ---
    add_heading(doc, "3. Hướng dẫn theo bố cục màn hình (từ trên xuống)", 1)
    add_para(
        doc,
        "Mở /module05 — đọc màn hình theo thứ tự bên dưới. Mỗi mục gồm: mục đích, "
        "cách thao tác, và điều cần lưu ý.",
    )

    add_heading(doc, "3.1. Tiêu đề trang", 2)
    add_feature_block(
        doc,
        "Hiệu Quả Công Việc",
        "Xác nhận bạn đang ở đúng module giám sát tuần tra công trường.",
        [
            "Kiểm tra dòng phụ: «Giám sát tuần tra helmet camera & mật độ lao động».",
        ],
    )

    add_heading(doc, "3.2. Panel Tổng Quan — 4 chỉ số KPI", 2)
    add_para(doc, "Nằm ngay dưới tiêu đề. Click mũi tên thu gọn nếu cần thêm không gian cho camera.", italic=True)

    add_feature_block(
        doc,
        "Khu vực tuần tra",
        "Biết mũ/flycam đã đi qua bao nhiêu khu trên bản đồ site.",
        [
            "Nhìn số dạng X/Y khu vực — X = khu đã có thiết bị online đang phủ.",
            "Đọc dòng chi tiết phía dưới: % khu active, hoặc «chờ xác nhận phủ khu» nếu mới online.",
            "Nếu 0/Y và «Chưa có thiết bị tuần tra online» — kiểm tra mũ/flycam đã bật stream chưa.",
        ],
    )

    add_feature_block(
        doc,
        "Nhân sự",
        "Tổng số người đã được hệ thống ghi nhận trong ngày (Người + Định danh).",
        [
            "Xem con số lớn ở giữa thẻ.",
            "Khi có dữ liệu: dòng dưới tách icon cam (Người) và xanh lá (Định danh).",
            "«Đang tuần tra — chờ phát hiện»: thiết bị online, chưa ai vào khung.",
            "«Chưa có dữ liệu hôm nay»: chưa có phát hiện và thiết bị offline.",
        ],
        "Số này có thể khác badge tab Sự kiện — KPI lấy từ sổ cái ngày, tab đếm thẻ có ảnh.",
    )

    add_feature_block(
        doc,
        "Lượt gặp · ĐT",
        "Đếm bao nhiêu lần hệ thống thấy silhouette chưa định danh (Đối tượng).",
        [
            "Đọc số lượt — mỗi lần người/chỉ người vào khung camera = 1 lượt.",
            "Giờ cao điểm (peak): detail ghi «Peak time — mỗi lần vào khung một lượt, không gộp».",
        ],
        "Không dùng số này để tính «bao nhiêu người lạ» bằng cách trừ Nhân sự.",
    )

    add_feature_block(
        doc,
        "Mật độ flymap",
        "Ước lượng mật độ từ flycam bay cao (YOLO) — tham khảo, không phải headcount chính thức.",
        [
            "Khi Drone 03 online: xem số người/khung.",
            "Khi offline: hiện «—» và «Flycam chưa online».",
        ],
        "Không cộng vào thẻ Nhân sự.",
    )

    doc.add_page_break()

    add_heading(doc, "3.3. Panel Camera", 2)
    add_para(doc, "Chuyển Live / Playback bằng nút toggle góc phải header panel.", bold=True)

    add_heading(doc, "A. Chế độ Live — xem trực tiếp", 3)
    add_feature_block(
        doc,
        "Lưới camera",
        "Quan sát hiện trường realtime từ 3 thiết bị.",
        [
            "Mặc định Helmet 02 được chọn (viền highlight).",
            "Click ô camera để chuyển focus sang thiết bị khác.",
            "Tab Bodycam: chỉ Helmet 01 & 02. Tab Flycam: chỉ Drone 03.",
            "Badge LIVE (chấm nhấp nháy): đang có luồng. Không có = offline hoặc mất tín hiệu.",
            "Góc tile Drone 03: «Tầm cao» hoặc «Tầm thấp» — biết flycam đang bay kiểu gì.",
        ],
    )

    add_feature_block(
        doc,
        "Khung bbox trên video (ROI)",
        "Thấy ai đang trong khung và mức nhận diện (xám / cam / xanh lá).",
        [
            "Bật/tắt khung người bằng nút bbox trên thanh công cụ video.",
            "Nhãn trên khung: Đối tượng / Người / Định danh — cùng màu với bản đồ và thẻ sự kiện.",
        ],
        "Khung có thể trễ vài giây so với hình để khớp thời gian — bình thường.",
    )

    add_feature_block(
        doc,
        "Thu gọn panel Camera",
        "Tiết kiệm chỗ khi cần xem bản đồ hoặc sự kiện.",
        [
            "Click nút thu gọn trên header panel Camera.",
            "Header vẫn hiện «X luồng» — số stream đang active.",
        ],
    )

    add_heading(doc, "B. Chế độ Playback — xem lại", 3)
    add_feature_block(
        doc,
        "Xem lại theo ngày",
        "Tra cứu video đã ghi trong 7 ngày gần nhất.",
        [
            "Chuyển toggle sang Playback.",
            "Chọn ngày trên date picker — cùng ngày với panel Sự kiện.",
            "Chọn camera ở sidebar, kéo timeline hoặc click marker sự kiện.",
            "Click marker → phát đoạn ~30 giây quanh thời điểm ghi nhận.",
        ],
        "Ngày tính theo 0h Việt Nam — sự kiện sau nửa đêm thuộc ngày mới.",
    )

    doc.add_page_break()

    add_heading(doc, "3.4. Panel HEATMAP / FLYMAP (bên trái, hàng dưới)", 2)

    add_feature_block(
        doc,
        "Bản đồ HEATMAP (mặc định)",
        "Nhìn vị trí phát hiện và lộ trình mũ trên site Cầu Sông Hốt.",
        [
            "Bật/tắt layer góc trái map: Khu vực · Mật độ · Mũ · Flycam.",
            "Chấm xám = Đối tượng (lượt gặm), cam = Người, xanh lá = Định danh.",
            "Góc map hiện đếm 3 loại — nên khớp với KPI Tổng Quan.",
            "Click một chấm → sheet chi tiết phía dưới map.",
            "Nút phóng to (góc header): xem fullscreen; Escape để thoát.",
        ],
    )

    add_feature_block(
        doc,
        "Gán tên thủ công từ bản đồ",
        "Khi biết đối tượng xám thực ra là ai — gán vào hồ sơ.",
        [
            "Click chấm trên map → mở sheet.",
            "Nhập mã NV / chọn gợi ý trong panel gán định danh.",
            "Sau khi gán, chấm và thẻ sự kiện cập nhật sang Định danh khi đồng bộ.",
        ],
    )

    add_feature_block(
        doc,
        "Chế độ FLYMAP",
        "Xem phát hiện từ flycam tầm cao trên bản đồ riêng.",
        [
            "Click nút Flymap trên header panel map.",
            "Title đổi thành FLYMAP; layer: Khu vực · Mật độ · Drone.",
            "Chấm một màu; góc phải hiện «Phát hiện: N».",
            "Click Flymap lần nữa để về HEATMAP site.",
        ],
        "Flymap không mở sheet chi tiết khi click chấm — chỉ xem mật độ.",
    )

    doc.add_page_break()

    add_heading(doc, "3.5. Panel SỰ KIỆN (bên phải, hàng dưới)", 2)

    add_feature_block(
        doc,
        "Chọn ngày xem",
        "Tra cứu bằng chứng theo ngày lịch.",
        [
            "Dùng mũi tên hoặc lịch compact phía trên danh sách.",
            "Chỉ xem được 7 ngày gần nhất.",
            "Dòng «Đang xem ngày trước» khi không phải hôm nay.",
        ],
    )

    add_feature_block(
        doc,
        "Lọc theo loại",
        "Tìm nhanh đúng nhóm cần xử lý.",
        [
            "Tab Tất cả — mọi thẻ có ảnh trong ngày.",
            "Tab Đối tượng — silhouette chưa nhận diện.",
            "Tab Người — có mặt, chưa biết tên.",
            "Tab Định danh — đã có tên / mã NV.",
            "Số trên badge = số thẻ trong tab (không nhất thiết bằng KPI).",
        ],
    )

    add_feature_block(
        doc,
        "Tìm kiếm",
        "Tìm một người cụ thể trong danh sách.",
        [
            "Gõ tên, mã NV, hoặc mã pers_id vào ô tìm.",
            "Danh sách lọc sau khi bạn ngừng gõ (~0,3 giây).",
        ],
    )

    add_feature_block(
        doc,
        "Thẻ sự kiện & chi tiết",
        "Xem ảnh chụp, thời gian, vị trí; mở playback tương ứng.",
        [
            "Mỗi thẻ: badge tier, ảnh thumbnail, tên/alias, giờ, camera/khu.",
            "Click thẻ → highlight + đồng bộ ngày playback + mở popup chi tiết.",
            "Popup: ảnh lớn, lịch sử xuất hiện trong ngày, gallery mặt (nếu đã định danh).",
            "Nhấn Escape hoặc nút X để đóng popup.",
            "Cuộn xuống cuối danh sách để tải thêm thẻ (tự động).",
        ],
    )

    add_para(doc, "Header panel Sự kiện (góc phải): hiện chế độ flycam — «Tầm thấp · AI» hoặc «Tầm cao · Mật độ».", italic=True)

    doc.add_page_break()

    # --- Workflows ---
    add_heading(doc, "4. Quy trình sử dụng thường gặp", 1)

    add_heading(doc, "4.1. Giám sát ca tuần tra (realtime)", 2)
    for step in [
        "Mở /module05 — kiểm tra KPI Khu vực và Nhân sự.",
        "Panel Camera ở Live — xem Helmet 02 (hoặc chọn mũ khác).",
        "Bật bbox nếu cần thấy ai trong khung.",
        "Nhìn HEATMAP — theo dõi chấm và lộ trình mũ.",
        "Tab Sự kiện «Tất cả» — xem phát hiện mới (refresh tự động hôm nay).",
    ]:
        add_numbered(doc, step)

    add_heading(doc, "4.2. Tra cứu sự cố / đối chiếu bằng chứng", 2)
    for step in [
        "Panel Sự kiện — chọn ngày xảy ra sự việc.",
        "Tìm theo tên/mã hoặc lọc tab Đối tượng / Định danh.",
        "Click thẻ → xem popup chi tiết và lịch sử xuất hiện.",
        "Chuyển Camera sang Playback — xem clip 30 giây cùng thời điểm.",
    ]:
        add_numbered(doc, step)

    add_heading(doc, "4.3. Gán danh tính cho người chưa rõ", 2)
    for step in [
        "Tab Sự kiện → Đối tượng — hoặc click chấm xám trên HEATMAP.",
        "Xem ảnh snapshot — nhận diện thủ công.",
        "Từ map: mở sheet → nhập mã NV trong panel gán.",
        "Hoặc vào /module05/ho-so để quản lý hồ sơ; /module05/quet-mat để quét mặt bổ sung.",
    ]:
        add_numbered(doc, step)

    add_heading(doc, "4.4. Theo dõi mật độ flycam", 2)
    for step in [
        "Kiểm tra KPI Mật độ flymap (Drone 03 phải online).",
        "Bật FLYMAP trên panel map — xem chấm phát hiện tầm cao.",
        "Lưu ý: con số tham khảo YOLO, không thay thế Nhân sự từ mũ.",
    ]:
        add_numbered(doc, step)

    doc.add_page_break()

    # --- FAQ ---
    add_heading(doc, "5. Câu hỏi thường gặp", 1)
    faq = [
        (
            "Tại sao Nhân sự khác số badge tab Sự kiện?",
            "KPI lấy tổng từ sổ cái ngày; tab đếm thẻ có ảnh (đã dedupe). Hai cách đếm khác nhau — bình thường.",
        ),
        (
            "Tại sao Lượt gặm nhiều hơn số người?",
            "Mỗi lần vào khung = 1 lượt. Cùng một khu vực nhiều người hoặc một người đi qua nhiều lần đều tăng lượt.",
        ),
        (
            "Không thấy thẻ sự kiện?",
            "Chỉ hiện khi có ảnh snapshot. Chưa có → «Chưa có sự kiện — đang chờ backend» hoặc thử ngày khác.",
        ),
        (
            "Flycam tầm cao có hiện tên người không?",
            "Không — aerial chỉ ghi silhouette (Đối tượng). Person/Định danh từ drone chỉ khi bay tầm thấp (proximity).",
        ),
        (
            "Chấm trên map và video không khớp ngay?",
            "Map cập nhật sau khi backend ghi sổ (vài giây). Video bbox có thể delay ~5s để khớp khung.",
        ),
        (
            "Xem được bao nhiêu ngày?",
            "7 ngày gần nhất (playback, sự kiện, heatmap cùng ngày).",
        ),
    ]
    for q, a in faq:
        add_para(doc, q, bold=True)
        add_para(doc, a)
        doc.add_paragraph()

    add_heading(doc, "6. Trang bổ trợ", 1)
    add_table(
        doc,
        ["Đường dẫn", "Dùng khi nào"],
        [
            ["/module05/ho-so", "Quản lý hồ sơ công nhân, import Excel, xác minh danh tính"],
            ["/module05/quet-mat", "Quét mặt bổ sung vector hoặc tạo hồ sơ mới (3 góc)"],
            ["/phat-song", "Thiết bị đeo mũ phát luồng video lên hệ thống (người mang mũ dùng)"],
        ],
    )

    footer = doc.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = footer.add_run("— Vifence CMS · Hướng dẫn sử dụng Module 05 —")
    fr.font.size = Pt(9)
    fr.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
    fr.italic = True

    return doc


def main() -> None:
    out = "/workspace/docs/module05/Module05_HuongDanSuDung.docx"
    build_document().save(out)
    print(out)


if __name__ == "__main__":
    main()
