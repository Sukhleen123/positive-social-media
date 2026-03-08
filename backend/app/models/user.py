from sqlalchemy import Column, Text, Integer, ForeignKey, LargeBinary
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
