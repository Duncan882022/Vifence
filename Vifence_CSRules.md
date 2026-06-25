# **VIFENCE CMS**

# **CURSOR RULES**

Version: 1.0

---

# **CORE PRINCIPLE**

Mục tiêu cuối cùng:

Xây dựng hệ thống đủ chất lượng để trình Ban Tổng Giám đốc.

Ưu tiên:

1. Dễ hiểu
2. Đồng nhất
3. Truy vết được
4. Hỗ trợ hành động
5. Hiệu năng tốt

---

# **UI CONSISTENCY**

## **Rule 01**

Không tự tạo layout mới.

Luôn kiểm tra UI-SPEC trước.

---

## **Rule 02**

Sidebar là component bất biến.

Không thay đổi:

- Width
- Màu sắc
- Cấu trúc menu

Giữ nguyên cho toàn bộ module.

---

## **Rule 03**

CameraGrid là component bất biến.

Module 01 là chuẩn.

Module 02, 03, 04, 05 phải tái sử dụng.

Không được thiết kế camera khác nhau giữa các module.

---

## **Rule 04**

PlaybackPanel là component bất biến.

Dùng chung cho toàn bộ hệ thống.

---

## **Rule 05**

EventList là component bất biến.

Dùng chung cho toàn bộ hệ thống.

---

# **COMPONENT RULES**

## **Rule 06**

Ưu tiên reuse component.

Thứ tự:

1. Reuse
2. Extend
3. Create New

Không được tạo component mới nếu đã có component tương tự.

---

## **Rule 07**

Không duplicate UI.

Nếu đã có:

CameraGrid

thì không tạo:

TrainingCameraGrid

SafetyCameraGrid

HousekeepingCameraGrid

---

## **Rule 08**

Mọi component phải:

- Typed
- Reusable
- Testable

---

# **UX RULES**

## **Rule 09**

Không có khoảng trắng vô nghĩa.

Nếu có khoảng trống lớn:

- Bổ sung thông tin  
hoặc
- Thu nhỏ layout

---

## **Rule 10**

Không để bất kỳ component nào đè lên Sidebar.

---

## **Rule 11**

Không hiển thị dữ liệu trùng lặp.

Ví dụ sai:

40/42

Có mặt: 40

Xuất hiện cùng lúc.

---

## **Rule 12**

Mỗi hành động tối đa 3 click.

Ví dụ:

Sự kiện  
→ Playback  
→ Xuất clip

---

## **Rule 13**

Action phải là động từ.

Đúng:

Thông báo

Xử lý

Xuất clip

Tải xuống

Sai:

Notification

Playback

---

## **Rule 14**

Mọi danh sách lớn hơn 20 bản ghi phải có Search.

---

## **Rule 15**

Accordion phải expand thật.

Không dùng mock expand.

---

# **DATA RULES**

## **Rule 16**

Không hardcode dữ liệu trong component.

Sử dụng:

services/

hooks/

store/

---

## **Rule 17**

Mọi API response phải có TypeScript type.

Không dùng any.

---

## **Rule 18**

Không gọi API trực tiếp trong UI component.

Luôn thông qua service layer.

---

# **PERFORMANCE RULES**

## **Rule 19**

Sử dụng React.memo cho component lớn.

---

## **Rule 20**

Sử dụng useMemo cho dữ liệu tính toán.

---

## **Rule 21**

Sử dụng useCallback cho event handler.

---

## **Rule 22**

Lazy load:

- Playback
- Chart
- Large Table

---

# **MODULE RULES**

## **Module 01**

Là module chuẩn.

Các module khác phải học theo.

---

## **Module 02**

Camera phải giống Module 01.

Chỉ thay đổi dữ liệu đào tạo.

---

## **Module 03**

Camera phải giống Module 01.

Chỉ thay đổi dữ liệu an toàn.

---

## **Module 04**

Camera phải giống Module 01.

Chỉ thay đổi dữ liệu vệ sinh.

---

## **Module 05**

Camera phải giống Module 01.

Chỉ thay đổi dữ liệu năng suất.

---

# **DESIGN REVIEW CHECKLIST**

Trước khi hoàn thành bất kỳ màn hình nào:

[ ] Sidebar còn nguyên

[ ] Không đè menu

[ ] Camera giống Module 01

[ ] Không có khoảng trắng chết

[ ] Search hoạt động

[ ] Filter hoạt động

[ ] Playback hoạt động

[ ] Accordion hoạt động

[ ] Không lặp dữ liệu

[ ] Không icon vô nghĩa

[ ] Không hardcode dữ liệu

[ ] Responsive 1366+

[ ] Đúng UI-SPEC

[ ] Đúng STYLE-GUIDE

[ ] Đủ chất lượng trình Tổng Giám đốc

Nếu bất kỳ mục nào không đạt:

Thiết kế chưa được chấp nhận.