"""数据模型定义"""
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class FrameRange(BaseModel):
    """帧范围"""
    start_sec: float = 0
    end_sec: Optional[float] = None
    start_frame: Optional[int] = None
    end_frame: Optional[int] = None


class TargetSize(BaseModel):
    """目标尺寸"""
    w: int
    h: int


class JobParams(BaseModel):
    """任务参数"""
    fps: int = Field(ge=1, le=60, default=12)
    frame_range: FrameRange = Field(default_factory=FrameRange)
    max_frames: int = Field(ge=1, le=2000, default=300)
    target_size: TargetSize = Field(default_factory=lambda: TargetSize(w=256, h=256))
    bg_color: str = "transparent"  # #RRGGBB or transparent
    transparent: bool = True
    padding: int = Field(ge=0, le=64, default=4)
    spacing: int = Field(ge=0, le=64, default=4)
    layout_mode: str = "fixed_columns"  # fixed_columns / auto_square
    columns: int = Field(ge=1, le=64, default=12)
    matte_strength: float = Field(ge=0.0, le=1.0, default=0.6)
    crop_mode: str = "tight_bbox"  # none / tight_bbox / safe_bbox
    matte_mode: str = "ai"  # ai / none / chroma / luma / ai_luma
    matte_key_color: str = "#00ff00"
    matte_threshold: int = Field(ge=0, le=255, default=72)
    matte_softness: int = Field(ge=0, le=128, default=24)
    matte_despill: float = Field(ge=0.0, le=2.5, default=0.85)
    matte_halo: int = Field(ge=0, le=8, default=1)
    luma_black: int = Field(ge=0, le=254, default=24)
    luma_white: int = Field(ge=1, le=255, default=210)
    luma_gamma: float = Field(ge=0.05, le=4.0, default=0.75)
    luma_strength: float = Field(ge=0.0, le=2.0, default=1.25)
    green_to_black: bool = False
    semitransparent_to_black: bool = False
    semitransparent_to_opaque: bool = False


class JobCreateRequest(BaseModel):
    """创建任务请求"""
    url: Optional[str] = None
    params: JobParams = Field(default_factory=JobParams)


class JobError(BaseModel):
    """任务错误"""
    code: str
    message: str


class JobResponse(BaseModel):
    """任务响应"""
    id: str
    status: str  # queued / processing / completed / failed / canceled
    progress: int = 0
    params: Optional[JobParams] = None
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[JobError] = None
    result: Optional[dict] = None


class JobResult(BaseModel):
    """任务结果"""
    sprite_sheet_url: str
    json_index_url: str
    frame_count: int
    width: int
    height: int


class IndexFrame(BaseModel):
    """索引中的单帧"""
    i: int
    x: int
    y: int
    w: int
    h: int
    t: float
