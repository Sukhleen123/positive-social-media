from sqlalchemy import Column, Text, Integer, JSON
from app.database import Base


class ContentItem(Base):
    __tablename__ = "content_items"

    id = Column(Text, primary_key=True)          # "reddit:t3_abc123"
    platform = Column(Text, nullable=False)       # "reddit" | "twitter" | "hackernews"
    platform_id = Column(Text, nullable=False)
    title = Column(Text, nullable=True)
    body = Column(Text, nullable=True)
    author_handle = Column(Text, nullable=True)
    url = Column(Text, nullable=True)
    created_utc = Column(Integer, nullable=True)
    raw_metadata = Column(JSON, nullable=True)
    fetched_at = Column(Integer, nullable=False)
