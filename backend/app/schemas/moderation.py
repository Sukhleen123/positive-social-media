from typing import List
from pydantic import BaseModel


class ScoreResult(BaseModel):
    content_id: str
    cosine_score: float
    is_sensitive: bool


class ModerationBatchRequest(BaseModel):
    user_id: str
    content_ids: List[str]


class ModerationBatchResponse(BaseModel):
    results: List[ScoreResult]
