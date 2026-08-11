"""Thu thập mẫu auto-train từ kết quả engine — dùng chung FE /analyze và VMS."""

from __future__ import annotations

from . import collector as auto_train_collector
from ..config import settings
from ..mobile_frame_utils import downscale_for_mobile

_ROAD_AUTO_TRAIN_CLASS_BY_KIND = {"material": "material"}

_PPE_AUTO_TRAIN_BY_BEHAVIOR = {
    "hard_hat": "ppe_helmet",
    "safety_vest": "ppe_vest",
    "safety_shoes": "ppe_shoes",
}


def _scale_detections_to_small(frame, detections: list[dict]) -> list[dict]:
    small = downscale_for_mobile(frame)
    sw, sh = small.shape[1], small.shape[0]
    ow, oh = frame.shape[1], frame.shape[0]
    if sw == ow and sh == oh:
        return detections
    sx, sy = sw / ow, sh / oh
    out: list[dict] = []
    for d in detections:
        x1, y1, x2, y2 = d["bbox"]
        out.append({**d, "bbox": [x1 * sx, y1 * sy, x2 * sx, y2 * sy]})
    return out


def collect_road_sample(frame, result: dict) -> None:
    if not settings.auto_train_enabled:
        return
    small = downscale_for_mobile(frame)
    dets = _scale_detections_to_small(frame, result.get("detections") or [])
    boxes: list[tuple[str, float, float, float, float]] = []
    for d in dets:
        behavior = d.get("behavior")
        cls_name: str | None = None
        if behavior in ("mud", "water"):
            cls_name = behavior
        elif behavior == "object":
            cls_name = _ROAD_AUTO_TRAIN_CLASS_BY_KIND.get(d.get("object_kind"))
        if cls_name:
            x1, y1, x2, y2 = d["bbox"]
            boxes.append((cls_name, x1, y1, x2, y2))
    auto_train_collector.collect("road_material", small, boxes)


def collect_crane_sample(frame, result: dict) -> None:
    if not settings.auto_train_enabled:
        return
    small = downscale_for_mobile(frame)
    dets = _scale_detections_to_small(frame, result.get("detections") or [])
    boxes: list[tuple[str, float, float, float, float]] = []
    for d in dets:
        if d.get("behavior") == "crane" and d.get("machine_kind"):
            x1, y1, x2, y2 = d["bbox"]
            boxes.append((d["machine_kind"], x1, y1, x2, y2))
    auto_train_collector.collect("crane_machinery", small, boxes)


def collect_ppe_sample(frame, result: dict) -> None:
    if not settings.auto_train_enabled:
        return
    small = downscale_for_mobile(frame)
    dets = _scale_detections_to_small(frame, result.get("detections") or [])
    by_task: dict[str, list[tuple[str, float, float, float, float]]] = {}
    for d in dets:
        task_id = _PPE_AUTO_TRAIN_BY_BEHAVIOR.get(d.get("behavior", ""))
        if not task_id:
            continue
        cls_name = d.get("behavior")
        if task_id == "ppe_helmet":
            cls_name = "hard_hat"
        elif task_id == "ppe_vest":
            cls_name = "safety_vest"
        elif task_id == "ppe_shoes":
            cls_name = "safety_shoes"
        x1, y1, x2, y2 = d["bbox"]
        by_task.setdefault(task_id, []).append((cls_name, x1, y1, x2, y2))
    for task_id, boxes in by_task.items():
        auto_train_collector.collect(task_id, small, boxes)


def collect_mesh_sample(frame, result: dict) -> None:
    if not settings.auto_train_enabled:
        return
    from .inference import predict_boxes

    small = downscale_for_mobile(frame)
    boxes: list[tuple[str, float, float, float, float]] = []
    for cls_name, _conf, x1, y1, x2, y2 in predict_boxes("safety_mesh_cover", small, conf_threshold=0.35):
        if cls_name == "mesh_cover":
            boxes.append((cls_name, x1, y1, x2, y2))
    auto_train_collector.collect("safety_mesh_cover", small, boxes)


def collect_vms_engine_sample(engine_name: str, frame, result: dict) -> None:
    """Gọi sau mỗi engine trên VMS — nuôi dataset khi AUTO_TRAIN_ENABLED=true."""
    if engine_name == "road":
        collect_road_sample(frame, result)
    elif engine_name == "crane":
        collect_crane_sample(frame, result)
    elif engine_name == "ppe":
        collect_ppe_sample(frame, result)
    elif engine_name == "mesh":
        collect_mesh_sample(frame, result)
