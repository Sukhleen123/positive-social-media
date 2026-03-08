from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import ContentItem
from app.models.user import TriggerProfile
from app.schemas.moderation import ScoreResult
from app.services import cache_service
from app.services.embedding_service import embedding_service
from app.pipeline.scoring import compute_personal_toxicity_score


async def score_content(
    db: AsyncSession,
    user_id: str,
    content_ids: list[str],
) -> AsyncGenerator[ScoreResult, None]:
    """Async generator: yields ScoreResult for each content_id.

    Cached results come first (near-zero latency), then freshly scored items.
    """
    # Resolve trigger profile for user
    stmt = select(TriggerProfile).where(TriggerProfile.user_id == user_id)
    trigger = (await db.execute(stmt)).scalars().first()
    if trigger is None or trigger.embedding is None:
        # No trigger set — mark everything safe
        for cid in content_ids:
            yield ScoreResult(content_id=cid, cosine_score=0.0, is_sensitive=False)
        return

    trigger_emb = embedding_service.deserialize(trigger.embedding)

    # Partition into cached and uncached
    cached_results, uncached_ids = await cache_service.partition(db, content_ids, trigger.id)

    # Yield cached results immediately
    for result in cached_results:
        yield result

    if not uncached_ids:
        return

    # Fetch content bodies for uncached items
    stmt = select(ContentItem).where(ContentItem.id.in_(uncached_ids))
    items = (await db.execute(stmt)).scalars().all()
    item_map = {item.id: item for item in items}

    # Batch embed all uncached content bodies
    texts = [(item_map[cid].body or item_map[cid].title or "") for cid in uncached_ids if cid in item_map]
    valid_ids = [cid for cid in uncached_ids if cid in item_map]

    if not texts:
        return

    embeddings = embedding_service.embed_batch(texts)

    for cid, content_emb in zip(valid_ids, embeddings):
        score, is_sensitive = compute_personal_toxicity_score(content_emb, trigger_emb)
        await cache_service.write_result(db, cid, trigger.id, score, is_sensitive)
        yield ScoreResult(content_id=cid, cosine_score=score, is_sensitive=is_sensitive)
