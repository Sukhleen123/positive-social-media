from typing import List
from pydantic import BaseModel


class ScoreResult(BaseModel):
    content_id: str
    cosine_score: float
    is_sensitive: bool
    is_user_override: bool = False


class ModerationBatchRequest(BaseModel):
    user_id: str
    content_ids: List[str]


class ModerationBatchResponse(BaseModel):
    results: List[ScoreResult]


class FeedbackRequest(BaseModel):
    user_id: str
    content_id: str
    is_sensitive: bool
