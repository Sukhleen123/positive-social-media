from __future__ import annotations

import time
import uuid

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.moderation import ModerationResult
from app.schemas.moderation import ScoreResult
from app.config import settings


async def partition(
    db: AsyncSession,
    content_ids: list[str],
    trigger_profile_id: str,
) -> tuple[list[ScoreResult], list[str]]:
    """Split content_ids into (cached_results, uncached_ids)."""
    if not content_ids:
        return [], []

    stmt = select(ModerationResult).where(
        ModerationResult.trigger_profile_id == trigger_profile_id,
        ModerationResult.content_id.in_(content_ids),
    )
    rows = (await db.execute(stmt)).scalars().all()

    cached_map = {r.content_id: r for r in rows}
    cached = [
        ScoreResult(
            content_id=r.content_id,
            cosine_score=r.cosine_score,
            is_sensitive=r.is_sensitive,
        )
        for r in cached_map.values()
    ]
    uncached = [cid for cid in content_ids if cid not in cached_map]
    return cached, uncached


async def write_result(
    db: AsyncSession,
    content_id: str,
    trigger_profile_id: str,
    cosine_score: float,
    is_sensitive: bool,
) -> None:
    result = ModerationResult(
        id=str(uuid.uuid4()),
        content_id=content_id,
        trigger_profile_id=trigger_profile_id,
        cosine_score=cosine_score,
        is_sensitive=is_sensitive,
        model_version=settings.model_version,
        scored_at=int(time.time()),
    )
    db.add(result)
    await db.commit()


async def invalidate_trigger(db: AsyncSession, trigger_profile_id: str) -> None:
    """Delete all cached results for a given trigger profile."""
    await db.execute(
        delete(ModerationResult).where(
            ModerationResult.trigger_profile_id == trigger_profile_id
        )
    )
    await db.commit()
