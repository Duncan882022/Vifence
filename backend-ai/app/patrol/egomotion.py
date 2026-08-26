"""Bù chuyển động camera cho tracker tuần tra.

Vấn đề: tracker ghép detection thuần trên toạ độ ảnh. Khi người đeo lia mũ, cả
khung hình trượt đi, nhưng tracker hiểu thành "người vừa dịch chuyển tức thời
sang chỗ khác" — vượt cổng ghép, track đứt, cấp mã mới. Mã `pers-*` cũng trôi
theo và KPI đếm thêm một người trong khi ngoài đời vẫn chỉ một.

Ước lượng dịch chuyển toàn cục giữa hai khung hình rồi trừ đi trước khi ghép.
Chỉ mô hình tịnh tiến: lia và ngẩng/cúi chiếm gần hết chuyển động của camera
đội đầu, còn xoay quanh trục ống kính thì hiếm và tốn hơn nhiều để bù.

Dùng `cv2.phaseCorrelate` trên ảnh xám thu nhỏ — khoảng 1–2ms mỗi khung, chấp
nhận được cả trên máy chủ yếu. Optical flow thưa chính xác hơn nhưng đắt gấp
nhiều lần mà bài toán này không cần.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

import cv2
import numpy as np

# Cạnh dài ảnh dùng để ước lượng. Nhỏ thì rẻ, mà dịch chuyển toàn cục vốn là
# tín hiệu tần số thấp nên không cần độ phân giải cao.
_WORK_WIDTH = 160

# Tin cậy dưới ngưỡng này thì coi như không đo được: cảnh trơn (tường, trời)
# không có kết cấu để bám, mà đoán bừa còn hại hơn không bù.
_MIN_RESPONSE = 0.08

# Dịch chuyển vượt ngần này *chiều rộng khung* trong một nhịp thì gần như chắc
# chắn là sai số — cảnh đổi hẳn (cắt cảnh, mất tín hiệu) chứ không phải lia.
_MAX_SHIFT_FRAC = 0.45


@dataclass
class _CamState:
    prev: np.ndarray | None = None
    prev_shape: tuple[int, int] | None = None
    scale: float = 1.0
    lock: threading.Lock = field(default_factory=threading.Lock)


_states: dict[str, _CamState] = {}
_states_lock = threading.Lock()


def _state_for(camera_id: str) -> _CamState:
    with _states_lock:
        st = _states.get(camera_id)
        if st is None:
            st = _CamState()
            _states[camera_id] = st
        return st


def _prepare(frame: np.ndarray) -> tuple[np.ndarray, float]:
    h, w = frame.shape[:2]
    scale = _WORK_WIDTH / float(w) if w > _WORK_WIDTH else 1.0
    if scale < 1.0:
        small = cv2.resize(
            frame, (_WORK_WIDTH, max(1, int(round(h * scale)))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        small = frame
    if small.ndim == 3:
        small = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    return small.astype(np.float32), scale


def estimate_shift(camera_id: str, frame: np.ndarray) -> tuple[float, float]:
    """Dịch chuyển của khung hình so với lần gọi trước, tính bằng **pixel gốc**.

    Trả `(0, 0)` khi chưa có khung trước, khi kích thước đổi, hoặc khi không đủ
    tin cậy. Không bù còn hơn bù sai.
    """
    if frame is None or frame.size == 0:
        return 0.0, 0.0

    st = _state_for(camera_id)
    with st.lock:
        small, scale = _prepare(frame)
        shape = small.shape[:2]

        prev = st.prev
        if prev is None or st.prev_shape != shape:
            st.prev = small
            st.prev_shape = shape
            st.scale = scale
            return 0.0, 0.0

        try:
            (dx, dy), response = cv2.phaseCorrelate(prev, small)
        except cv2.error:
            st.prev = small
            st.prev_shape = shape
            return 0.0, 0.0

        st.prev = small
        st.prev_shape = shape
        st.scale = scale

        if response < _MIN_RESPONSE:
            return 0.0, 0.0

        inv = 1.0 / scale if scale > 0 else 1.0
        shift_x = float(dx) * inv
        shift_y = float(dy) * inv

        limit = frame.shape[1] * _MAX_SHIFT_FRAC
        if abs(shift_x) > limit or abs(shift_y) > limit:
            return 0.0, 0.0

        # phaseCorrelate trả dịch chuyển của *nội dung ảnh*. Nội dung trôi sang
        # trái nghĩa là camera quay sang phải; tracker cần biết bbox cũ nằm ở
        # đâu trên khung mới, tức là dịch cùng chiều với nội dung.
        return shift_x, shift_y


def reset(camera_id: str | None = None) -> None:
    with _states_lock:
        if camera_id is None:
            _states.clear()
        else:
            _states.pop(camera_id, None)
