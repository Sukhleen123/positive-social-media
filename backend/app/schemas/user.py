from typing import Optional
from pydantic import BaseModel


class UserProfileCreate(BaseModel):
    display_name: Optional[str] = None


class UserProfileSchema(BaseModel):
    id: str
    display_name: Optional[str] = None

    model_config = {"from_attributes": True}


class TriggerProfileUpdate(BaseModel):
    raw_text: str


class TriggerProfileSchema(BaseModel):
    id: str
    user_id: str
    raw_text: str
    updated_at: int
    hypothetical_examples: list[str] | None = None

    model_config = {"from_attributes": True}
