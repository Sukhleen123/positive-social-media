import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import UserProfile, TriggerProfile
from app.schemas.user import UserProfileCreate, UserProfileSchema, TriggerProfileSchema, TriggerProfileUpdate
from app.services.embedding_service import embedding_service
from app.services.cache_service import invalidate_trigger

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=UserProfileSchema)
async def create_user(body: UserProfileCreate, db: AsyncSession = Depends(get_db)):
    user = UserProfile(id=str(uuid.uuid4()), display_name=body.display_name)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}/triggers", response_model=TriggerProfileSchema | None)
async def get_trigger(user_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(TriggerProfile).where(TriggerProfile.user_id == user_id)
    trigger = (await db.execute(stmt)).scalars().first()
    return trigger


@router.put("/{user_id}/triggers", response_model=TriggerProfileSchema)
async def upsert_trigger(
    user_id: str,
    body: TriggerProfileUpdate,
    db: AsyncSession = Depends(get_db),
):
    # Verify user exists
    user = await db.get(UserProfile, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Invalidate old cache
    stmt = select(TriggerProfile).where(TriggerProfile.user_id == user_id)
    old_trigger = (await db.execute(stmt)).scalars().first()
    if old_trigger:
        await invalidate_trigger(db, old_trigger.id)
        await db.delete(old_trigger)
        await db.commit()

    # Compute new embedding
    emb = embedding_service.embed(body.raw_text)
    emb_bytes = embedding_service.serialize(emb)

    trigger = TriggerProfile(
        id=str(uuid.uuid4()),
        user_id=user_id,
        raw_text=body.raw_text,
        embedding=emb_bytes,
        updated_at=int(time.time()),
    )
    db.add(trigger)
    await db.commit()
    await db.refresh(trigger)
    return trigger
