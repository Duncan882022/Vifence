"""Pydantic schemas — patrol API input validation."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class PersonUpdatePayload(BaseModel):
    full_name: str | None = Field(default=None, alias="ho_ten", max_length=200)
    employee_code: str | None = Field(default=None, alias="ma_nv", max_length=64)
    contractor: str | None = Field(default=None, alias="don_vi", max_length=200)

    model_config = {"populate_by_name": True}


class VerifyDraftPayload(PersonUpdatePayload):
    enroll_session_id: str | None = Field(default=None, max_length=64)


class PersonCreatePayload(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    employee_code: str = Field(min_length=1, max_length=64)
    contractor: str | None = Field(default=None, max_length=200)


class IdentifyPayload(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    employee_code: str = Field(min_length=1, max_length=64)
    contractor: str | None = Field(default=None, max_length=200)


class MergePersonsPayload(BaseModel):
    keep: str = Field(min_length=1, max_length=64)
    drop: str = Field(min_length=1, max_length=64)


class ImportPersonRow(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)
    employee_code: str | None = Field(default=None, max_length=64)
    contractor: str | None = Field(default=None, max_length=200)
    image_b64: str | None = Field(default=None, max_length=5_000_000)


class ImportPersonsPayload(BaseModel):
    items: list[ImportPersonRow] = Field(default_factory=list, max_length=100)


class EnrollScanPayload(BaseModel):
    image_b64: str = Field(min_length=32, max_length=5_000_000)
    pose_slot: int | None = Field(default=None, ge=0, le=10)


class EnrollCompletePayload(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    employee_code: str = Field(min_length=1, max_length=64)
    contractor: str | None = Field(default=None, max_length=200)


class PersonScanPayload(BaseModel):
    image_b64: str = Field(min_length=32, max_length=5_000_000)
    pose_slot: int | None = Field(default=None, ge=0, le=10)


class SnapshotSignPayload(BaseModel):
    path: str = Field(min_length=1, max_length=512)


class PurgeDayPayload(BaseModel):
    date: str | None = Field(default=None, max_length=16)


class FrameImagePayload(BaseModel):
    """Validate base64 JPEG trước decode."""

    image: str = Field(min_length=32, max_length=5_000_000)

    @field_validator("image")
    @classmethod
    def strip_data_url(cls, v: str) -> str:
        if "," in v and v.startswith("data:"):
            return v.split(",", 1)[1]
        return v
