"""Cơ chế tự động train — thay dần rule-based/model tĩnh bằng model tự học
liên tục từ dữ liệu thực tế (self-training / pseudo-label).

Luồng hoạt động:
1. `collector.collect(...)` — mỗi frame đi qua pipeline detect hiện tại (rule
   màu Cam 03/04, YOLO lửa/hút thuốc) đều được lưu lại kèm nhãn do chính
   detector hiện tại sinh ra (pseudo-label / "giáo viên").
2. `scheduler` chạy nền, định kỳ kiểm tra đã đủ dữ liệu mới chưa — nếu đủ thì
   gọi `trainer.train_task()` tự fine-tune YOLO trên dữ liệu vừa thu thập.
3. Model mới chỉ được `registry.promote()` (đưa vào chạy thật) nếu đạt
   ngưỡng chất lượng tối thiểu — tránh tự thay model đang chạy tốt bằng bản
   train dở dang.
4. `inference.predict_boxes()` cho pipeline hiện tại hỏi model đã tự train
   xem có nhận diện tốt hơn không; nếu chưa có model / model chưa đủ tin cậy
   thì vẫn dùng rule-based/model gốc như cũ — không có rủi ro thoái lui.
"""
