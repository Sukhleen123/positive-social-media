import asyncio
import json

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.moderation import ModerationBatchRequest, ModerationBatchResponse, ScoreResult
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
