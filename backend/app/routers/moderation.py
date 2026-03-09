import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import TriggerProfile
from app.schemas.moderation import (
    ModerationBatchRequest,
    ModerationBatchResponse,
    ScoreResult,
    FeedbackRequest,
)
from app.services import cache_service
from app.services.moderation_service import score_content

router = APIRouter(prefix="/api/v1/moderate", tags=["moderation"])


@router.post("/batch", response_model=ModerationBatchResponse)
async def moderate_batch(
    body: ModerationBatchRequest,
    db: AsyncSession = Depends(get_db),
):
    results: list[ScoreResult] = []
    async for result in score_content(db, body.user_id, body.content_ids):
        results.append(result)
    return ModerationBatchResponse(results=results)


@router.get("/stream")
async def moderate_stream(
    user_id: str = Query(...),
    content_ids: str = Query(..., description="Comma-separated content IDs"),
    db: AsyncSession = Depends(get_db),
):
    ids = [cid.strip() for cid in content_ids.split(",") if cid.strip()]

    async def event_generator():
        async for result in score_content(db, user_id, ids):
            data = json.dumps(result.model_dump())
            yield f"data: {data}\n\n"
            await asyncio.sleep(0)  # yield control to event loop

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TriggerProfile).where(TriggerProfile.user_id == body.user_id)
    trigger = (await db.execute(stmt)).scalars().first()
    if trigger is None:
        raise HTTPException(status_code=404, detail="No trigger profile found for user")

    await cache_service.upsert_feedback(db, body.content_id, trigger.id, body.is_sensitive)
    return {"ok": True}
