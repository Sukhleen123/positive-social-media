from __future__ import annotations

import time
import uuid

from sqlalchemy import select, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.moderation import ModerationResult
from app.schemas.moderation import ScoreResult
from app.config import settings


async def partition(
    db: AsyncSession,
    content_ids: list[str],
    trigger_profile_id: str,
) -> tuple[list[ScoreResult], list[str]]:
    """Split content_ids into (cached_results, uncached_ids).

    Cache hits require matching pipeline_version OR is_user_override=True (permanent overrides
    survive version bumps).
    """
    if not content_ids:
        return [], []

    stmt = select(ModerationResult).where(
        ModerationResult.trigger_profile_id == trigger_profile_id,
        ModerationResult.content_id.in_(content_ids),
        or_(
            ModerationResult.pipeline_version == settings.model_version,
            ModerationResult.is_user_override == True,  # noqa: E712
        ),
    )
    rows = (await db.execute(stmt)).scalars().all()

    cached_map = {r.content_id: r for r in rows}
    cached = [
        ScoreResult(
            content_id=r.content_id,
            cosine_score=r.cosine_score,
            is_sensitive=r.is_sensitive,
            is_user_override=r.is_user_override,
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
    is_user_override: bool = False,
    pipeline_version: str | None = None,
) -> None:
    if pipeline_version is None:
        pipeline_version = settings.model_version

    stmt = select(ModerationResult).where(
        ModerationResult.content_id == content_id,
        ModerationResult.trigger_profile_id == trigger_profile_id,
    )
    existing = (await db.execute(stmt)).scalars().first()

    if existing:
        existing.cosine_score = cosine_score
        existing.is_sensitive = is_sensitive
        existing.is_user_override = is_user_override
        existing.pipeline_version = pipeline_version
        existing.model_version = settings.model_version
        existing.scored_at = int(time.time())
    else:
        result = ModerationResult(
            id=str(uuid.uuid4()),
            content_id=content_id,
            trigger_profile_id=trigger_profile_id,
            cosine_score=cosine_score,
            is_sensitive=is_sensitive,
            model_version=settings.model_version,
            pipeline_version=pipeline_version,
            is_user_override=is_user_override,
            scored_at=int(time.time()),
        )
        db.add(result)

    await db.commit()


async def upsert_feedback(
    db: AsyncSession,
    content_id: str,
    trigger_profile_id: str,
    is_sensitive: bool,
) -> None:
    """Write a permanent user override; bypasses normal scoring."""
    stmt = select(ModerationResult).where(
        ModerationResult.content_id == content_id,
        ModerationResult.trigger_profile_id == trigger_profile_id,
    )
    existing = (await db.execute(stmt)).scalars().first()

    if existing:
        existing.is_sensitive = is_sensitive
        existing.is_user_override = True
        existing.pipeline_version = settings.model_version
        existing.scored_at = int(time.time())
    else:
        result = ModerationResult(
            id=str(uuid.uuid4()),
            content_id=content_id,
            trigger_profile_id=trigger_profile_id,
            cosine_score=0.0,
            is_sensitive=is_sensitive,
            model_version=settings.model_version,
            pipeline_version=settings.model_version,
            is_user_override=True,
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
