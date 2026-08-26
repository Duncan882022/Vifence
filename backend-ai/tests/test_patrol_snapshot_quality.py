"""Ảnh đại diện của một người phải là ảnh tốt nhất, không phải ảnh mới nhất.

Bản ghi PERS-001 được làm mới mỗi ba giây. Không so chất lượng thì chỉ cần đúng
nhịp đó người đang quay lưng hoặc bị che một nửa là ảnh rõ mặt trước đó bị thay,
và chỉ huy mất luôn thứ để nhận ra ai.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.events import _patrol_snapshot_score  # noqa: E402
from app.schemas import PpeDetection  # noqa: E402


def _person(
    *,
    tier: str = "object",
    face_eligible: bool = False,
    confidence: float = 0.6,
    face_match_confidence: float | None = None,
) -> PpeDetection:
    return PpeDetection(
        behavior="person",
        label="CN",
        scenario_id="PERS-001",
        confidence=confidence,
        bbox=[10.0, 10.0, 100.0, 200.0],
        tier=tier,
        face_eligible=face_eligible,
        face_match_confidence=face_match_confidence,
    )


class TestPatrolSnapshotScore(unittest.TestCase):
    def test_face_visible_beats_turned_away(self):
        turned_away = _person(tier="person", face_eligible=False, confidence=0.9)
        facing = _person(tier="person", face_eligible=True, confidence=0.6)
        self.assertGreater(
            _patrol_snapshot_score(facing),
            _patrol_snapshot_score(turned_away),
            "khung nhìn rõ mặt phải thắng khung conf cao nhưng quay lưng",
        )

    def test_identity_tier_beats_lower_tiers(self):
        obj = _person(tier="object", face_eligible=True, confidence=0.95)
        person = _person(tier="person", face_eligible=True, confidence=0.7)
        identity = _person(tier="identity", face_eligible=True, confidence=0.5)
        self.assertLess(_patrol_snapshot_score(obj), _patrol_snapshot_score(person))
        self.assertLess(_patrol_snapshot_score(person), _patrol_snapshot_score(identity))

    def test_confidence_breaks_tie_within_same_tier(self):
        low = _person(tier="person", face_eligible=True, confidence=0.55)
        high = _person(tier="person", face_eligible=True, confidence=0.85)
        self.assertLess(_patrol_snapshot_score(low), _patrol_snapshot_score(high))

    def test_gallery_match_adds_weight(self):
        plain = _person(tier="identity", face_eligible=True, confidence=0.7)
        matched = _person(
            tier="identity", face_eligible=True, confidence=0.7, face_match_confidence=0.93,
        )
        self.assertGreater(_patrol_snapshot_score(matched), _patrol_snapshot_score(plain))

    def test_missing_tier_treated_as_object(self):
        untyped = PpeDetection(
            behavior="person",
            label="CN",
            scenario_id="PERS-001",
            confidence=0.6,
            bbox=[10.0, 10.0, 100.0, 200.0],
        )
        self.assertEqual(
            _patrol_snapshot_score(untyped),
            _patrol_snapshot_score(_person(tier="object", confidence=0.6)),
        )


if __name__ == "__main__":
    unittest.main()
