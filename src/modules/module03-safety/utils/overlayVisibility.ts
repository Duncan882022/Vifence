/** Ngưỡng ẩn ROI vi phạm / PPE — conf < 70%. */
export const OVERLAY_MIN_CONFIDENCE = 0.70

/** Máy công trường (info dashed) — OWLv2 zero-shot thường 0.34–0.58. */
export const MACHINERY_INFO_MIN_CONFIDENCE = 0.34

/** Số khung liên tiếp không thấy trước khi ẩn ROI (tránh nhấp nháy). */
export const OVERLAY_MISS_GRACE_FRAMES = 2
