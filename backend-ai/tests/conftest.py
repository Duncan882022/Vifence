"""Cách ly test khỏi thư mục `data/` của repo.

Registry định danh và ảnh heatmap ghi thẳng vào `backend-ai/data/`, và đó là
dữ liệu thật: `patrol_identity_bindings.json` được commit và hệ đang chạy đọc
nó. Chạy bộ test một lần là hồ sơ trong đó bị ghi đè bằng tên của fixture —
"Duncan", "Bình" — rồi lẫn vào diff của PR kế tiếp.

Chuyển gốc dữ liệu sang thư mục tạm cho cả phiên test. Test nào cần đường dẫn
riêng vẫn tự trỏ lại được như trước; đây chỉ là mức sàn cho những test không
nghĩ tới chuyện đó.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_tmp: tempfile.TemporaryDirectory | None = None


def pytest_configure(config) -> None:  # noqa: ARG001
    """Đổi gốc dữ liệu trước khi thu thập test, không phải trước khi chạy test.

    Vài test làm `from app.patrol_identity_store import BINDINGS_FILE` ở đầu
    file rồi tearDown gán lại giá trị đó. Chốt bằng fixture thì đã muộn: lúc
    fixture chạy, hằng kia đã kịp chụp đường dẫn repo và mỗi tearDown lại trỏ
    module về đó cho toàn bộ test chạy sau.
    """
    global _tmp

    _tmp = tempfile.TemporaryDirectory(prefix="vifence-test-data-")
    root = Path(_tmp.name)

    from app import drone_heatmap, patrol_identity_store

    patrol_identity_store.DATA_DIR = root
    patrol_identity_store.BINDINGS_FILE = root / "patrol_identity_bindings.json"
    drone_heatmap.DATA_DIR = root
    drone_heatmap.HEATMAP_DIR = root / "heatmap"


def pytest_unconfigure(config) -> None:  # noqa: ARG001
    global _tmp

    if _tmp is not None:
        _tmp.cleanup()
        _tmp = None
