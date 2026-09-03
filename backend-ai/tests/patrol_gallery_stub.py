"""Gallery HR giả lập cho test tier.

Tier "định danh" chỉ được cấp khi mã `p-*` thật sự nằm trong gallery HR, và tên
hiển thị chỉ được cấp khi có hồ sơ HR đứng sau mã đó. Test vòng đời tier dùng mã
bịa (`p-102`, `p-SGC-6688`) nên phải dựng cả hai điều kiện, nếu không tier luôn
rơi xuống "person" và tên rơi về "Người" — che mất đúng thứ đang cần kiểm.
"""

from __future__ import annotations

import re
from unittest.mock import patch

_GALLERY_ID = re.compile(r"^p-[a-z0-9_-]+$", re.IGNORECASE)


def _norm(worker_id: str | None) -> str:
    return (worker_id or "").strip()


def _code_for(gallery_id: str) -> str:
    """`p-SGC-6688` → `SGC-6688`, đúng quy ước mã gallery dựng từ mã nhân sự."""
    wid = _norm(gallery_id)
    return wid[2:].upper() if wid[:2].lower() == "p-" else wid.upper()


class FakeGalleryMixin:
    """Khai mọi mã `p-*` là mã gallery hợp lệ, kèm hồ sơ HR tuỳ chọn.

    Lớp con đặt `hr_profiles` = {mã gallery (chữ thường): tên đầy đủ}.
    """

    hr_profiles: dict[str, str] = {}

    def setUp(self) -> None:
        super().setUp()
        by_gallery = {
            k.lower(): {"full_name": v, "employee_code": _code_for(k)}
            for k, v in self.hr_profiles.items()
        }
        by_code = {row["employee_code"]: row for row in by_gallery.values()}
        targets = (
            (
                "app.patrol_entity.is_patrol_gallery_id",
                lambda wid: bool(_GALLERY_ID.match(_norm(wid))),
            ),
            (
                "app.patrol.identity.hr_profile_for_gallery",
                lambda wid: by_gallery.get(_norm(wid).lower()),
            ),
            # Đường chính của resolve_patrol_worker_display_name đi qua hai hàm
            # này, và nó là đường duy nhất trả được tên khi ROI gửi lên nhãn kỹ
            # thuật (worker_name trùng worker_id).
            (
                "app.patrol_identity_store.lookup_patrol_identity",
                lambda wid: by_gallery.get(_norm(wid).lower()),
            ),
            (
                "app.patrol.identity.hr_profile_for_employee_code",
                lambda code: by_code.get(_norm(code)),
            ),
        )
        for target, side_effect in targets:
            p = patch(target, side_effect=side_effect)
            p.start()
            self.addCleanup(p.stop)
