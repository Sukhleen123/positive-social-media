from sqlalchemy import Column, Text, Integer, Float, Boolean, ForeignKey, UniqueConstraint
from app.database import Base


class ModerationResult(Base):
    __tablename__ = "moderation_results"

    id = Column(Text, primary_key=True)
    content_id = Column(Text, ForeignKey("content_items.id"), nullable=False)
    trigger_profile_id = Column(Text, ForeignKey("trigger_profiles.id"), nullable=False)
    cosine_score = Column(Float, nullable=False)
    is_sensitive = Column(Boolean, nullable=False)
    model_version = Column(Text, nullable=False)
    scored_at = Column(Integer, nullable=False)
    is_user_override = Column(Boolean, nullable=False, server_default="0")
    pipeline_version = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("content_id", "trigger_profile_id", name="uq_content_trigger"),
    )
