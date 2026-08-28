"""Vòng đời định danh của một track tuần tra: Đối tượng → Người → Định danh.

Quy ước nghiệp vụ Module 05 có ba tầng:

* **Đối tượng** — YOLO chắc chắn đây là người, nhưng chưa lần nào thấy đủ mặt để
  nhận diện. Chưa có mã.
* **Người** — đã thấy mặt, đã cấp mã ẩn danh `sgc-*` ổn định (re-id), nhưng người
  này không có trong gallery nhân sự.
* **Định danh** — mặt khớp gallery, có mã nhân sự và tên thật.

Trước đây tầng được suy lại **từng frame** từ `worker_id`, nên chỉ cần một khung
hình quay lưng hoặc một lần embed mặt hỏng là nhãn tụt từ "Định danh" về "Đối
tượng" rồi lại nhảy lên — trên màn hình là nhãn giật liên tục trên cùng một người.

Ở đây tầng là **trạng thái của track, chỉ tiến không lùi**. Đã lên Người thì
không bao giờ tụt lại Đối tượng chừng nào track còn sống; đã lên Định danh thì
không tụt về Người. Đổi tên giữa hai người trong gallery phải quan sát được vài
frame liên tiếp mới đổi, tránh nhấp nháy giữa hai khuôn mặt giống nhau.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

TIER_OBJECT = "object"
TIER_PERSON = "person"
TIER_IDENTITY = "identity"

_TIER_RANK = {TIER_OBJECT: 0, TIER_PERSON: 1, TIER_IDENTITY: 2}

TIER_LABEL_VI = {
    TIER_OBJECT: "Đối tượng",
    TIER_PERSON: "Người",
    TIER_IDENTITY: "Định danh",
}

# Lên "Người" cho ngay khi có mã: đã qua ngưỡng face embedding rồi, chờ thêm chỉ
# làm nhãn tới muộn. Lên "Định danh" đòi 2 frame liên tiếp — khớp gallery sai một
# frame mà đã dán tên thật lên người khác thì hậu quả nặng hơn nhiều.
_PROMOTE_HITS = {TIER_PERSON: 1, TIER_IDENTITY: 2}

# Đang là gallery A mà nhận ra B: phải thấy B liên tiếp ngần này frame mới đổi.
_IDENTITY_SWITCH_HITS = 3

# Không thấy track lâu hơn ngần này thì bỏ state (track đã chết hẳn).
_STATE_TTL_SEC = 300.0

# Đường vẽ ROI và đường ghi sự kiện cùng quan sát một frame. Quan sát y hệt lặp
# lại trong cửa sổ này chỉ được tính một lần, nếu không ngưỡng "2 frame liên
# tiếp" của tầng Định danh sẽ đạt ngay trong một frame.
_OBSERVE_DEDUPE_SEC = 0.030


@dataclass
class TierTransition:
    """Một lần thăng tầng — dùng để ghi sự kiện giám sát."""

    camera_id: str
    track_id: str
    from_tier: str
    to_tier: str
    worker_id: str
    worker_name: str
    at: float

    @property
    def from_label(self) -> str:
        return TIER_LABEL_VI.get(self.from_tier, self.from_tier)

    @property
    def to_label(self) -> str:
        return TIER_LABEL_VI.get(self.to_tier, self.to_tier)


@dataclass
class TrackIdentity:
    """Kết quả đã ổn định của một track tại frame hiện tại."""

    tier: str
    worker_id: str
    worker_name: str
    tier_since: float
    first_seen: float
    transition: TierTransition | None = None

    @property
    def tier_label(self) -> str:
        return TIER_LABEL_VI.get(self.tier, self.tier)

    @property
    def is_identified(self) -> bool:
        return self.tier == TIER_IDENTITY


@dataclass
class _TrackState:
    tier: str = TIER_OBJECT
    worker_id: str = ""
    worker_name: str = ""
    first_seen: float = 0.0
    tier_since: float = 0.0
    last_seen: float = 0.0
    # Ứng viên đang chờ đủ số frame liên tiếp để được chấp nhận.
    pending_tier: str = ""
    pending_worker_id: str = ""
    pending_worker_name: str = ""
    pending_hits: int = 0
    tier_history: dict[str, float] = field(default_factory=dict)
    last_observed_tier: str = ""
    last_observed_worker_id: str = ""
    last_observed_at: float = 0.0


_states: dict[str, _TrackState] = {}
_lock = threading.Lock()


def _key(camera_id: str, track_id: str) -> str:
    return f"{camera_id}|{track_id}"


def tier_for_worker_id(worker_id: str | None) -> str:
    """Tầng *thô* suy từ mã — chưa áp ràng buộc chỉ-tiến-không-lùi."""
    from .patrol_entity import is_patrol_gallery_id
    from .person_identity_registry import is_sgc_worker_id

    wid = (worker_id or "").strip()
    if not wid or wid == "unknown":
        return TIER_OBJECT
    if is_patrol_gallery_id(wid):
        return TIER_IDENTITY
    if is_sgc_worker_id(wid):
        return TIER_PERSON
    # Mã lạ không thuộc gallery cũng không phải sgc — coi như chưa định danh.
    return TIER_OBJECT


def _prune(now: float) -> None:
    stale = [k for k, s in _states.items() if now - s.last_seen > _STATE_TTL_SEC]
    for k in stale:
        _states.pop(k, None)


def observe(
    camera_id: str,
    track_id: str,
    *,
    worker_id: str | None,
    worker_name: str | None,
    now: float | None = None,
) -> TrackIdentity:
    """Ghi nhận quan sát của frame này, trả về tầng đã ổn định của track.

    Gọi ở **cả** đường vẽ ROI lẫn đường ghi sự kiện để hai nơi không bao giờ nói
    hai điều khác nhau về cùng một người.
    """
    ts = now if now is not None else time.time()
    observed_tier = tier_for_worker_id(worker_id)
    wid = (worker_id or "").strip()
    from .patrol_entity import is_technical_patrol_worker_label, resolve_patrol_worker_display_name

    wname = resolve_patrol_worker_display_name(wid, worker_name)

    sibling = _sibling_identity_for_worker(wid, camera_id) if wid else None
    sibling_tier = sibling[0] if sibling else None
    sibling_name = sibling[1] if sibling else ""
    sibling_rank = _TIER_RANK.get(sibling_tier, 0) if sibling_tier else 0
    if sibling_rank > _TIER_RANK.get(observed_tier, 0):
        observed_tier = sibling_tier or observed_tier
        if sibling_name and not is_technical_patrol_worker_label(sibling_name):
            wname = sibling_name

    with _lock:
        key = _key(camera_id, track_id)
        state = _states.get(key)
        if state is None:
            state = _TrackState(first_seen=ts, tier_since=ts)
            _states[key] = state
            if len(_states) > 512:
                _prune(ts)
        state.last_seen = ts

        duplicate = (
            state.last_observed_tier == observed_tier
            and state.last_observed_worker_id == wid
            and ts - state.last_observed_at <= _OBSERVE_DEDUPE_SEC
        )
        if duplicate:
            return TrackIdentity(
                tier=state.tier,
                worker_id=state.worker_id,
                worker_name=state.worker_name,
                tier_since=state.tier_since,
                first_seen=state.first_seen,
            )
        state.last_observed_tier = observed_tier
        state.last_observed_worker_id = wid
        state.last_observed_at = ts

        current_rank = _TIER_RANK.get(state.tier, 0)
        observed_rank = _TIER_RANK.get(observed_tier, 0)
        transition: TierTransition | None = None

        if observed_rank > current_rank:
            # Thăng tầng — cần đủ số frame liên tiếp.
            need = _PROMOTE_HITS.get(observed_tier, 1)
            # Mũ khác đã xác nhận cùng worker_id — không bắt HC-02 chờ lại từ đầu.
            if sibling_tier == observed_tier and sibling_rank == observed_rank:
                need = 1
            if state.pending_tier == observed_tier and state.pending_worker_id == wid:
                state.pending_hits += 1
            else:
                state.pending_tier = observed_tier
                state.pending_worker_id = wid
                state.pending_worker_name = wname
                state.pending_hits = 1

            if state.pending_hits >= need:
                from_tier = state.tier
                state.tier = observed_tier
                state.worker_id = wid
                if wname and not is_technical_patrol_worker_label(wname):
                    state.worker_name = wname
                elif not state.worker_name or is_technical_patrol_worker_label(state.worker_name):
                    state.worker_name = wname
                state.tier_since = ts
                state.tier_history[observed_tier] = ts
                state.pending_tier = ""
                state.pending_worker_id = ""
                state.pending_hits = 0
                transition = TierTransition(
                    camera_id=camera_id,
                    track_id=track_id,
                    from_tier=from_tier,
                    to_tier=observed_tier,
                    worker_id=wid,
                    worker_name=wname,
                    at=ts,
                )

        elif observed_rank == current_rank and wid:
            if wid == state.worker_id:
                # Cùng người — chỉ làm tươi tên khi có tên thật, không ghi mã lên tên.
                if wname and not is_technical_patrol_worker_label(wname):
                    state.worker_name = wname
                state.pending_tier = ""
                state.pending_worker_id = ""
                state.pending_hits = 0
            else:
                # Cùng tầng nhưng khác mã: chỉ đổi khi thấy liên tiếp đủ lâu, để
                # hai khuôn mặt giống nhau không làm nhãn nhảy qua lại.
                if state.pending_worker_id == wid:
                    state.pending_hits += 1
                else:
                    state.pending_tier = observed_tier
                    state.pending_worker_id = wid
                    state.pending_worker_name = wname
                    state.pending_hits = 1
                if state.pending_hits >= _IDENTITY_SWITCH_HITS:
                    state.worker_id = wid
                    if wname and not is_technical_patrol_worker_label(wname):
                        state.worker_name = wname
                    state.pending_tier = ""
                    state.pending_worker_id = ""
                    state.pending_hits = 0
        else:
            # Quan sát thấp hơn tầng đang giữ (quay lưng, mất mặt một frame).
            # Giữ nguyên — đây chính là điều kiện "chỉ tiến không lùi".
            state.pending_tier = ""
            state.pending_worker_id = ""
            state.pending_hits = 0

        if state.tier == TIER_OBJECT and not state.worker_id and wid:
            # Mã lạ chưa xếp được tầng nhưng vẫn nên giữ để hiển thị nhất quán.
            state.worker_id = wid
            state.worker_name = wname

        return TrackIdentity(
            tier=state.tier,
            worker_id=state.worker_id,
            worker_name=state.worker_name,
            tier_since=state.tier_since,
            first_seen=state.first_seen,
            transition=transition,
        )


def _sibling_identity_for_worker(
    worker_id: str,
    exclude_camera_id: str,
) -> tuple[str, str] | None:
    """Tier + tên cao nhất từ cam tuần tra khác cho cùng worker_id."""
    from .patrol_flight_mode import is_patrol_identity_unified_camera

    wid = (worker_id or "").strip()
    if not wid or not is_patrol_identity_unified_camera(exclude_camera_id):
        return None
    best_tier = ""
    best_rank = -1
    best_name = ""
    with _lock:
        for key, state in _states.items():
            cam = key.split("|", 1)[0]
            if cam == exclude_camera_id or not is_patrol_identity_unified_camera(cam):
                continue
            if state.worker_id != wid:
                continue
            rank = _TIER_RANK.get(state.tier, 0)
            if rank > best_rank:
                best_rank = rank
                best_tier = state.tier
                best_name = state.worker_name
    if best_rank < 0:
        return None
    return best_tier, best_name


def peek(camera_id: str, track_id: str) -> TrackIdentity | None:
    """Đọc trạng thái hiện tại, không ghi nhận quan sát mới."""
    with _lock:
        state = _states.get(_key(camera_id, track_id))
        if state is None:
            return None
        return TrackIdentity(
            tier=state.tier,
            worker_id=state.worker_id,
            worker_name=state.worker_name,
            tier_since=state.tier_since,
            first_seen=state.first_seen,
        )


def reset(camera_id: str | None = None) -> int:
    with _lock:
        if camera_id is None:
            count = len(_states)
            _states.clear()
            return count
        prefix = f"{camera_id}|"
        keys = [k for k in _states if k.startswith(prefix)]
        for k in keys:
            _states.pop(k, None)
        return len(keys)
