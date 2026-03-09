from sqlalchemy import Column, Text, Integer, ForeignKey, LargeBinary, JSON
from app.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Text, primary_key=True)
    display_name = Column(Text, nullable=True)


class TriggerProfile(Base):
    __tablename__ = "trigger_profiles"

    id = Column(Text, primary_key=True)
    user_id = Column(Text, ForeignKey("user_profiles.id"), nullable=False)
    raw_text = Column(Text, nullable=False)
    embedding = Column(LargeBinary, nullable=True)  # serialized numpy float32 array
    updated_at = Column(Integer, nullable=False)
    hypothetical_examples = Column(JSON, nullable=True)       # list[str] — LLM-generated examples
    hypothetical_embeddings = Column(LargeBinary, nullable=True)  # (N, 384) float32 blob
    keywords = Column(JSON, nullable=True)                    # list[str] — risk keywords
    exclusion_terms = Column(JSON, nullable=True)             # list[str] — false-positive guard
