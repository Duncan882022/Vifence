"""Tracker đa đối tượng cho camera tuần tra (HC-* bodycam, DR-* flycam).

Thay `track_matching._person_slot`, vốn cấp id theo ô lưới 8×6 của khung hình:
người bước qua ranh giới ô là đổi id, mà cổng tái dùng lại đòi IoU ≥ 0.28 giữa
hai lần detect cách nhau 200ms. Người đi bộ bình thường đã trượt khỏi ngưỡng đó,
người trên flycam thì gần như không frame nào khớp. Hệ quả: ROI nhảy sang track
mới mỗi frame còn track cũ nằm lại coast — nhìn như bbox không bám ai cả, và mã
`sgc-*` (khoá theo `camera_id|track_id`) cũng trôi theo.

Ở đây dùng ByteTrack: Kalman vận tốc không đổi + ghép hai vòng (high-conf trước,
low-conf sau), gate theo IoU **hoặc** khoảng cách tâm chuẩn hoá theo cỡ hộp. Chuẩn
hoá theo cỡ hộp là điểm mấu chốt cho flycam — người cao 12px dịch 20px giữa hai
frame là chuyện thường, IoU bằng 0 nhưng vẫn là cùng một người.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

from .detector import MODULE05_BYTETRACK_MAX_AGE

Bbox = tuple[float, float, float, float]

# Track bị che giữa khung sống lâu hơn ngưỡng này mà không được đo lại thì bỏ.
#
# Trên công trường đông, một người đi ngang qua ống kính che mất đồng nghiệp phía
# sau 2–4 giây là chuyện thường. Bỏ track ngay ở mốc 2 giây nghĩa là mỗi lần bị
# che lại sinh ra một người mới trong hệ thống: mã `sgc-*` mới, dòng sự kiện mới,
# KPI cộng thêm một — trong khi ngoài đời vẫn chỉ là một người. Track đang mất dấu
# gần như không tốn tài nguyên, nên giữ lâu hơn rẻ hơn nhiều so với đếm trùng.
_LOST_KEEP_SEC_BODYCAM = 8.0
_LOST_KEEP_SEC_FLYCAM = 4.0

# Track mất dấu ngay ở biên khung thì chờ ngần này — người đã bước ra ngoài.
#
# Cửa sổ dài của trường hợp bị che không dùng được ở đây. Ra khỏi khung là hết
# một lượt gặp: giữ track thêm 8 giây nghĩa là người kế tiếp bước vào đúng mép
# đó bị ghép vào lượt của người vừa đi, hai người thành một. Ngắn hơn nhịp
# `max_age_frames` ở FPS thường gặp, nên trên thực tế số frame thử lại mới là
# thứ quyết định — mốc thời gian chỉ chặn trường hợp FPS tụt bất thường.
_EXIT_KEEP_SEC = 0.6

# Bbox coi là chạm biên khi có cạnh nằm trong dải này (tỉ lệ cạnh khung hình).
#
# Người đi khỏi khung không biến mất tức thì: YOLO bám tới lúc còn khoảng nửa
# thân trong hình, nên bbox cuối cùng luôn dính mép. Dải 2% đủ rộng để hứng sai
# số làm tròn của detector mà chưa chạm tới người đứng sát rìa vẫn đang trong
# khung.
_EXIT_EDGE_MARGIN_RATIO = 0.02

# Trần số track giữ đồng thời mỗi camera — chặn phình bộ nhớ khi cảnh đông.
_MAX_TRACKS = 150

# Lý do một track kết thúc — đi kèm lượt gặp để đọc số liệu về sau.
END_REASON_EXIT_EDGE = "exit_edge"
END_REASON_LOST = "lost"
END_REASON_STREAM_OFFLINE = "stream_offline"


def _bbox_iou(a: Bbox, b: Bbox) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _center(b: Bbox) -> tuple[float, float]:
    return (b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0


def _size_ratio(a: Bbox, b: Bbox) -> float:
    """Tỉ lệ diện tích nhỏ/lớn — chặn ghép người gần với người xa."""
    area_a = max(1.0, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1.0, (b[2] - b[0]) * (b[3] - b[1]))
    return min(area_a, area_b) / max(area_a, area_b)


def _center_ratio(a: Bbox, b: Bbox) -> float:
    """Khoảng cách tâm tính theo *số lần cạnh hộp*, không theo cạnh khung hình.

    Chuẩn hoá theo khung hình (cách cũ) khiến cùng một ngưỡng vừa quá chặt với
    người nhỏ trên flycam vừa quá lỏng với người cận cảnh trên bodycam.
    """
    acx, acy = _center(a)
    bcx, bcy = _center(b)
    scale = max(
        8.0,
        (max(a[2] - a[0], a[3] - a[1]) + max(b[2] - b[0], b[3] - b[1])) / 2.0,
    )
    return ((acx - bcx) ** 2 + (acy - bcy) ** 2) ** 0.5 / scale


def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else (hi if v > hi else v)


def touches_frame_edge(bbox: Bbox, frame_w: float, frame_h: float) -> bool:
    """Bbox có cạnh dính mép khung — dấu hiệu người đang ra/vào khỏi khung."""
    if frame_w <= 0 or frame_h <= 0:
        return False
    mx = max(2.0, frame_w * _EXIT_EDGE_MARGIN_RATIO)
    my = max(2.0, frame_h * _EXIT_EDGE_MARGIN_RATIO)
    x1, y1, x2, y2 = bbox
    return x1 <= mx or y1 <= my or x2 >= frame_w - mx or y2 >= frame_h - my


@dataclass
class TrackerProfile:
    """Tham số ghép — bodycam và flycam có động học rất khác nhau."""

    iou_min: float
    center_ratio_max: float
    size_ratio_min: float
    confirm_hits: int
    # Cửa sổ chờ khi track mất dấu **giữa khung** — gần như luôn là bị che.
    lost_keep_sec: float
    # Cửa sổ chờ khi lần đo cuối đã dính biên khung — người đi ra ngoài.
    exit_keep_sec: float = _EXIT_KEEP_SEC
    # Ranh giới high/low conf của ByteTrack. Phải bám theo sàn conf của từng
    # camera: flycam nhận người từ 0.18 nên lấy chung mốc 0.34 của bodycam thì
    # gần như mọi detection đều rơi vào nhánh low.
    high_conf: float = 0.34
    # Độ bất định cộng thêm mỗi giây. Để quá thấp thì `p` tụt xuống sàn, hệ số
    # lọc chỉ còn ~0.2 và bbox hiển thị bám chậm hẳn sau người đang đi — nhìn
    # như ROI "trôi" phía sau. 1.2 cho hệ số ổn định quanh 0.55 ở nhịp 8 FPS:
    # đủ mượt mà vẫn theo kịp.
    process_noise: float = 1.2
    measure_noise: float = 0.2
    size_gain: float = 0.35
    velocity_smoothing: float = 0.72
    velocity_damping: float = 0.978
    max_speed_box_per_sec: float = 3.0
    # Giữ track qua lúc bị che chỉ an toàn khi cổng ghép siết lại theo tuổi: càng
    # lâu không đo được thì khả năng có người khác bước vào đúng vị trí đó càng
    # cao, mà ghép nhầm thì hai người thành một danh tính — hỏng nặng hơn đếm
    # trùng. Vài khung hình đầu vẫn ghép bình thường để không phá nhịp bám.
    lost_strict_after_sec: float = 1.2
    lost_size_ratio_min: float = 0.45
    lost_center_ratio_max: float = 0.85
    # Số frame thử ghép lại **tối thiểu** trước khi bỏ track.
    #
    # Trước đây đây là điều kiện bỏ track thứ hai, nối với cửa sổ thời gian bằng
    # `or`: 5 frame ở nhịp 6 FPS là 0,8 giây, luôn tới trước mốc 8 giây, nên
    # `lost_keep_sec` cùng toàn bộ phần siết cổng ghép theo tuổi mất dấu chưa
    # bao giờ chạy. Giờ hai điều kiện nối bằng `and`: đếm frame là sàn số lần
    # thử lại, còn cửa sổ thời gian mới là thứ quyết định khi nào hết lượt.
    max_age_frames: int = MODULE05_BYTETRACK_MAX_AGE


# Bodycam: người to, nhưng camera đội đầu rung và xoay nhanh nên vẫn cần gate rộng.
PROFILE_BODYCAM = TrackerProfile(
    iou_min=0.10,
    center_ratio_max=1.30,
    size_ratio_min=0.28,
    confirm_hits=2,
    lost_keep_sec=_LOST_KEEP_SEC_BODYCAM,
)

# Flycam: người chiếm 1–2% chiều cao khung. IoU thường bằng 0 giữa hai frame kể
# cả khi đứng yên vì drone tự trôi, nên phải cho phép ghép thuần theo tâm.
PROFILE_FLYCAM = TrackerProfile(
    iou_min=0.04,
    center_ratio_max=2.20,
    size_ratio_min=0.20,
    confirm_hits=2,
    lost_keep_sec=_LOST_KEEP_SEC_FLYCAM,
    high_conf=0.28,
    max_speed_box_per_sec=4.5,
)

PROFILE_DEFAULT = TrackerProfile(
    iou_min=0.18,
    center_ratio_max=0.90,
    size_ratio_min=0.30,
    confirm_hits=3,
    lost_keep_sec=1.5,
    high_conf=0.40,
)


def is_patrol_tracker_camera(camera_id: str) -> bool:
    return camera_id.startswith("HC-") or camera_id.startswith("DR-")


def profile_for_camera(camera_id: str) -> TrackerProfile:
    if camera_id.startswith("DR-"):
        from .patrol_flight_mode import is_patrol_flycam_proximity

        if is_patrol_flycam_proximity(camera_id):
            return PROFILE_BODYCAM
        return PROFILE_FLYCAM
    if camera_id.startswith("HC-"):
        return PROFILE_BODYCAM
    return PROFILE_DEFAULT


class _Kalman:
    """Constant-velocity trên tâm bbox + EMA kích thước (mô hình SORT)."""

    __slots__ = ("cx", "cy", "vx", "vy", "w", "h", "p", "_prof")

    def __init__(self, bbox: Bbox, prof: TrackerProfile) -> None:
        self.cx, self.cy = _center(bbox)
        self.w = max(1.0, bbox[2] - bbox[0])
        self.h = max(1.0, bbox[3] - bbox[1])
        self.vx = 0.0
        self.vy = 0.0
        self.p = 1.0
        self._prof = prof

    def _max_speed(self) -> float:
        return max(self.w, self.h) * self._prof.max_speed_box_per_sec

    def predict(self, dt_sec: float) -> None:
        dt = _clamp(dt_sec, 0.0, 1.2)
        self.cx += self.vx * dt
        self.cy += self.vy * dt
        self.vx *= self._prof.velocity_damping
        self.vy *= self._prof.velocity_damping
        self.p += self._prof.process_noise * dt

    def update(
        self,
        bbox: Bbox,
        dt_sec: float,
        measured_velocity: tuple[float, float] | None = None,
    ) -> None:
        mx, my = _center(bbox)
        mw = max(1.0, bbox[2] - bbox[0])
        mh = max(1.0, bbox[3] - bbox[1])
        dt = max(0.008, dt_sec)
        k = self.p / (self.p + self._prof.measure_noise)

        applied_x = k * (mx - self.cx)
        applied_y = k * (my - self.cy)
        self.cx += applied_x
        self.cy += applied_y

        keep = self._prof.velocity_smoothing
        limit = self._max_speed()
        if measured_velocity is not None:
            # Dịch chuyển giữa hai lần đo là số đo trực tiếp của vận tốc. Suy từ
            # phần dư sau `predict` thì khi dự đoán đúng phần dư gần bằng 0 và
            # vận tốc tự tiêu biến — FE nhận số hụt rồi nội suy thiếu.
            raw_vx, raw_vy = measured_velocity
        else:
            raw_vx, raw_vy = applied_x / dt, applied_y / dt
        self.vx = _clamp(self.vx * keep + raw_vx * (1 - keep), -limit, limit)
        self.vy = _clamp(self.vy * keep + raw_vy * (1 - keep), -limit, limit)

        gain = self._prof.size_gain
        self.w = self.w * (1 - gain) + mw * gain
        self.h = self.h * (1 - gain) + mh * gain
        self.p = max(0.05, (1 - k) * self.p)

    def bbox(self) -> Bbox:
        hw, hh = self.w / 2.0, self.h / 2.0
        return (self.cx - hw, self.cy - hh, self.cx + hw, self.cy + hh)


@dataclass
class PatrolTrack:
    track_id: str
    kalman: _Kalman
    state: str = "tentative"  # tentative | confirmed | lost
    hits: int = 1
    miss_streak: int = 0
    first_seen: float = 0.0
    last_measured_at: float = 0.0
    confidence: float = 0.0
    measured_bbox: Bbox = (0.0, 0.0, 0.0, 0.0)
    # Lần đo cuối có dính biên khung không — quyết định cửa sổ chờ lúc mất dấu.
    at_frame_edge: bool = False

    def bbox(self) -> Bbox:
        """Bbox đã làm mượt — dùng để hiển thị."""
        return self.kalman.bbox()

    def gate_bbox(self, now: float, ego: tuple[float, float] = (0.0, 0.0)) -> Bbox:
        """Bbox dùng để ghép — vị trí đo lần cuối, đẩy theo vận tốc và theo camera.

        Không dùng bbox Kalman ở đây: bộ lọc cố tình bám chậm để hình đỡ giật,
        nên với người đang đi nó luôn nằm sau vị trí thật. Lấy nó làm mốc ghép
        thì khoảng cách tới detection mới cứ nới ra từng frame cho tới lúc vượt
        cổng, và track đứt ngay giữa lúc người vẫn đang trong khung.

        `ego` là dịch chuyển của cả khung hình từ lần đo cuối tới giờ. Thiếu nó
        thì một cú lia mũ bị hiểu thành người dịch chuyển tức thời — vượt cổng,
        đứt track, cấp mã mới cho đúng người vừa đứng đó.
        """
        age = _clamp(now - self.last_measured_at, 0.0, 1.2)
        dx = self.kalman.vx * age + ego[0]
        dy = self.kalman.vy * age + ego[1]
        if dx == 0.0 and dy == 0.0:
            return self.measured_bbox
        x1, y1, x2, y2 = self.measured_bbox
        return (x1 + dx, y1 + dy, x2 + dx, y2 + dy)

    def velocity(self) -> tuple[float, float]:
        """px/giây trên hệ toạ độ frame AI — FE dùng để nội suy giữa hai snapshot."""
        return self.kalman.vx, self.kalman.vy


@dataclass
class _Candidate:
    track: PatrolTrack
    det_index: int
    cost: float


@dataclass
class PatrolTracker:
    """Một instance cho mỗi camera. Chỉ luồng AI của camera đó gọi tới."""

    camera_id: str
    profile: TrackerProfile
    tracks: dict[str, PatrolTrack] = field(default_factory=dict)
    _seq: int = 0
    _last_update_at: float = 0.0
    # Cỡ khung hình lần cập nhật gần nhất — dùng để biết bbox có dính biên.
    frame_size: tuple[float, float] | None = None
    # Lịch sử dịch chuyển của khung hình: (thời điểm, dx, dy). Track mất dấu
    # vài nhịp phải cộng dồn cả quãng camera đã lia trong lúc đó.
    _ego_log: list[tuple[float, float, float]] = field(default_factory=list)

    def note_camera_shift(self, dx: float, dy: float, *, now: float) -> None:
        """Ghi dịch chuyển toàn cục của khung hình vừa xử lý."""
        if dx == 0.0 and dy == 0.0:
            self._ego_log.append((now, 0.0, 0.0))
        else:
            self._ego_log.append((now, dx, dy))
        cutoff = now - max(self.profile.lost_keep_sec, 1.0) - 1.0
        if len(self._ego_log) > 240:
            self._ego_log = [row for row in self._ego_log if row[0] >= cutoff]

    def _ego_since(self, since: float) -> tuple[float, float]:
        if not self._ego_log:
            return 0.0, 0.0
        dx = dy = 0.0
        for ts, sx, sy in reversed(self._ego_log):
            if ts <= since:
                break
            dx += sx
            dy += sy
        return dx, dy

    def _at_frame_edge(self, bbox: Bbox) -> bool:
        if self.frame_size is None:
            return False
        return touches_frame_edge(bbox, self.frame_size[0], self.frame_size[1])

    def _should_drop(self, track: PatrolTrack, now: float) -> bool:
        """Đã thử lại đủ số frame **và** đã quá cửa sổ chờ của tình huống này."""
        if track.miss_streak < self.profile.max_age_frames:
            return False
        keep = (
            self.profile.exit_keep_sec
            if track.at_frame_edge
            else self.profile.lost_keep_sec
        )
        return (now - track.last_measured_at) >= keep

    def _close_track(self, track: PatrolTrack, *, now: float, reason: str) -> None:
        self.tracks.pop(track.track_id, None)
        try:
            from .patrol.sink import forget_track

            forget_track(self.camera_id, track.track_id, now=now, end_reason=reason)
        except Exception:  # noqa: BLE001
            pass

    def _evict_stalest_track(self, now: float) -> bool:
        """Nhường chỗ cho detection mới bằng track lâu nhất chưa được đo lại.

        Giữ track qua lúc bị che khiến số track sống đồng thời tăng hẳn, nên
        trần `_MAX_TRACKS` giờ mới thực sự chạm tới. Bỏ qua detection mới khi
        chạm trần là bỏ rơi một người đang đứng trong khung để giữ chỗ cho một
        người có thể đã đi từ lâu — đánh đổi sai chiều.

        Track vừa đo ở frame này thì không đụng tới: nó đang bám một người có
        thật ngay lúc đó.
        """
        stalest: PatrolTrack | None = None
        for track in self.tracks.values():
            if track.last_measured_at >= now:
                continue
            if stalest is None or track.last_measured_at < stalest.last_measured_at:
                stalest = track
        if stalest is None:
            return False
        reason = END_REASON_EXIT_EDGE if stalest.at_frame_edge else END_REASON_LOST
        self._close_track(stalest, now=now, reason=reason)
        return True

    def _next_id(self) -> str:
        self._seq += 1
        # Hậu tố ":person" giữ tương thích với các nhánh dedup/appearance đang
        # phân biệt track người với track vi phạm PPE theo hậu tố hành vi.
        return f"ptk{self._seq:04d}:person"

    def _match_cost(self, track: PatrolTrack, det: Bbox, now: float) -> float | None:
        prof = self.profile
        tb = track.gate_bbox(now, self._ego_since(track.last_measured_at))

        size_min = prof.size_ratio_min
        center_max = prof.center_ratio_max
        if now - track.last_measured_at > prof.lost_strict_after_sec:
            size_min = max(size_min, prof.lost_size_ratio_min)
            center_max = min(center_max, prof.lost_center_ratio_max)

        if _size_ratio(tb, det) < size_min:
            return None

        iou = _bbox_iou(tb, det)
        if iou >= prof.iou_min:
            return 1.0 - iou

        ratio = _center_ratio(tb, det)
        if ratio > center_max:
            return None
        # Chồng lấn một phần → tin hơn hẳn trường hợp chỉ gần nhau.
        if iou > 0.0:
            return 0.55 + 0.45 * (ratio / center_max)
        # IoU bằng 0: chỉ nhận khi tâm còn rất gần theo cỡ hộp. Người nhỏ trên
        # flycam rơi hết vào nhánh này.
        if ratio <= center_max * 0.6:
            return 0.80 + 0.20 * (ratio / center_max)
        return None

    def _assign(
        self,
        pool: list[tuple[int, Bbox]],
        states: set[str],
        used_tracks: set[str],
        used_dets: set[int],
        now: float,
    ) -> list[tuple[str, int]]:
        candidates: list[_Candidate] = []
        for track in self.tracks.values():
            if track.state not in states or track.track_id in used_tracks:
                continue
            for det_index, det_bbox in pool:
                if det_index in used_dets:
                    continue
                cost = self._match_cost(track, det_bbox, now)
                if cost is not None:
                    candidates.append(_Candidate(track, det_index, cost))

        candidates.sort(key=lambda c: c.cost)
        out: list[tuple[str, int]] = []
        for cand in candidates:
            if cand.track.track_id in used_tracks or cand.det_index in used_dets:
                continue
            used_tracks.add(cand.track.track_id)
            used_dets.add(cand.det_index)
            out.append((cand.track.track_id, cand.det_index))
        return out

    def update(
        self,
        detections: list[tuple[Bbox, float]],
        *,
        now: float,
        high_conf: float | None = None,
        camera_shift: tuple[float, float] = (0.0, 0.0),
        frame_size: tuple[float, float] | None = None,
    ) -> list[str | None]:
        """Ghép detections của frame này vào track.

        `camera_shift` là dịch chuyển của cả khung hình so với lần gọi trước.
        Nó được cộng vào mốc ghép và trừ khỏi vận tốc đo được, để tracker phân
        biệt "người đi" với "camera lia".

        `frame_size` (rộng, cao) cho biết bbox nào đang dính biên khung. Thiếu
        nó thì mọi track mất dấu đều được coi là bị che, tức chờ lâu hơn.

        Trả về list track_id **cùng thứ tự với `detections`** (None khi không cấp
        được track, ví dụ đã chạm trần `_MAX_TRACKS`).
        """
        dt = 0.0 if self._last_update_at <= 0 else max(0.0, now - self._last_update_at)
        self._last_update_at = now
        if frame_size is not None:
            self.frame_size = (float(frame_size[0]), float(frame_size[1]))
        self.note_camera_shift(camera_shift[0], camera_shift[1], now=now)

        for track in self.tracks.values():
            track.kalman.predict(dt)

        threshold = self.profile.high_conf if high_conf is None else high_conf
        high: list[tuple[int, Bbox]] = []
        low: list[tuple[int, Bbox]] = []
        for index, (bbox, conf) in enumerate(detections):
            (high if conf >= threshold else low).append((index, bbox))

        used_tracks: set[str] = set()
        used_dets: set[int] = set()
        pairs: list[tuple[str, int]] = []

        # ByteTrack: high-conf ghép trước với track đang sống, rồi tới track vừa
        # mất dấu, cuối cùng mới để low-conf vớt lại.
        pairs += self._assign(high, {"confirmed"}, used_tracks, used_dets, now)
        pairs += self._assign(high, {"lost", "tentative"}, used_tracks, used_dets, now)
        pairs += self._assign(low, {"confirmed"}, used_tracks, used_dets, now)
        # ByteTrack gốc dừng ở đây vì giả định track nào cũng khởi sinh từ
        # detection high-conf. Người nhỏ trên flycam thì không: cả vòng đời của
        # họ nằm dưới ngưỡng, nên track vừa sinh sẽ không bao giờ được đo lại và
        # chết ngay sau `lost_keep_sec` — đúng hiện tượng ROI không bám ai.
        pairs += self._assign(low, {"lost", "tentative"}, used_tracks, used_dets, now)

        result: list[str | None] = [None] * len(detections)
        measure_dt = max(dt, 0.008)

        for track_id, det_index in pairs:
            track = self.tracks[track_id]
            bbox, conf = detections[det_index]
            gap = now - track.last_measured_at
            measured_velocity: tuple[float, float] | None = None
            if gap > 1e-3:
                pcx, pcy = _center(track.measured_bbox)
                ncx, ncy = _center(bbox)
                # Trừ phần do camera lia: nếu không, vận tốc học được là vận
                # tốc của cái mũ chứ không phải của người. Frontend nội suy
                # theo số đó sẽ đẩy ROI bay đi lúc người đứng yên.
                ex, ey = self._ego_since(track.last_measured_at)
                measured_velocity = (
                    (ncx - pcx - ex) / gap,
                    (ncy - pcy - ey) / gap,
                )
            track.kalman.update(bbox, measure_dt, measured_velocity)
            track.hits += 1
            track.miss_streak = 0
            track.last_measured_at = now
            track.confidence = max(track.confidence * 0.6, conf)
            track.measured_bbox = bbox
            track.at_frame_edge = self._at_frame_edge(bbox)
            if track.state == "lost" or (
                track.state == "tentative" and track.hits >= self.profile.confirm_hits
            ):
                track.state = "confirmed"
            result[det_index] = track_id

        for track in list(self.tracks.values()):
            if track.track_id in used_tracks:
                continue
            track.miss_streak += 1
            if track.state == "confirmed":
                track.state = "lost"
            if not self._should_drop(track, now):
                continue
            reason = END_REASON_EXIT_EDGE if track.at_frame_edge else END_REASON_LOST
            self._close_track(track, now=now, reason=reason)

        for det_index, (bbox, conf) in enumerate(detections):
            if det_index in used_dets:
                continue
            if len(self.tracks) >= _MAX_TRACKS and not self._evict_stalest_track(now):
                continue
            track_id = self._next_id()
            self.tracks[track_id] = PatrolTrack(
                track_id=track_id,
                kalman=_Kalman(bbox, self.profile),
                state="tentative",
                hits=1,
                first_seen=now,
                last_measured_at=now,
                confidence=conf,
                measured_bbox=bbox,
                at_frame_edge=self._at_frame_edge(bbox),
            )
            result[det_index] = track_id

        return result

    def get(self, track_id: str | None) -> PatrolTrack | None:
        if not track_id:
            return None
        return self.tracks.get(track_id)


_trackers: dict[str, PatrolTracker] = {}
_trackers_lock = threading.Lock()


def get_patrol_tracker(camera_id: str) -> PatrolTracker:
    with _trackers_lock:
        tracker = _trackers.get(camera_id)
        if tracker is None:
            tracker = PatrolTracker(camera_id=camera_id, profile=profile_for_camera(camera_id))
            _trackers[camera_id] = tracker
        return tracker


def reset_patrol_trackers(camera_id: str | None = None) -> int:
    """Xoá track — dùng khi reset dữ liệu test hoặc camera đổi nguồn."""
    with _trackers_lock:
        if camera_id is None:
            count = sum(len(t.tracks) for t in _trackers.values())
            _trackers.clear()
            return count
        tracker = _trackers.pop(camera_id, None)
        return len(tracker.tracks) if tracker else 0
