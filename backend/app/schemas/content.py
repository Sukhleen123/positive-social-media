from typing import Optional, Any
from pydantic import BaseModel


class ContentItemCreate(BaseModel):
    id: str
    platform: str
    platform_id: str
    title: Optional[str] = None
    body: Optional[str] = None
    author_handle: Optional[str] = None
    url: Optional[str] = None
    created_utc: Optional[int] = None
    raw_metadata: Optional[Any] = None
    fetched_at: int


class ContentItemSchema(ContentItemCreate):
    model_config = {"from_attributes": True}
