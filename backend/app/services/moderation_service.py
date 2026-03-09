from __future__ import annotations

from typing import AsyncGenerator

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.content import ContentItem
from app.models.user import TriggerProfile
from app.schemas.moderation import ScoreResult
from app.services import cache_service
from app.services.embedding_service import embedding_service
from app.pipeline.scoring import compute_hybrid_score


async def score_content(
    db: AsyncSession,
    user_id: str,
    content_ids: list[str],
) -> AsyncGenerator[ScoreResult, None]:
    """Async generator: yields ScoreResult for each content_id.

    Cached results come first (near-zero latency), then freshly scored items.
    Uses the hybrid HyDE scorer when hypothetical embeddings are available.
    """
    # Resolve trigger profile for user
    stmt = select(TriggerProfile).where(TriggerProfile.user_id == user_id)
    trigger = (await db.execute(stmt)).scalars().first()
    if trigger is None or trigger.embedding is None:
        for cid in content_ids:
            yield ScoreResult(content_id=cid, cosine_score=0.0, is_sensitive=False)
        return

    trigger_emb = embedding_service.deserialize(trigger.embedding)

    # Deserialize hypothetical embeddings if available
    hyp_embs: list[np.ndarray] = []
    if trigger.hypothetical_embeddings:
        arr = np.frombuffer(trigger.hypothetical_embeddings, dtype=np.float32).reshape(-1, 384)
        hyp_embs = [arr[i] for i in range(arr.shape[0])]

    keywords: list[str] = trigger.keywords or []
    exclusion_terms: list[str] = trigger.exclusion_terms or []

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

    valid_items = [(cid, item_map[cid]) for cid in uncached_ids if cid in item_map]
    if not valid_items:
        return

    texts = [(item.body or item.title or "") for _, item in valid_items]
    embeddings = embedding_service.embed_batch(texts)

    for (cid, item), content_emb, text in zip(valid_items, embeddings, texts):
        subreddit: str | None = None
        if item.raw_metadata:
            subreddit = item.raw_metadata.get("subreddit")

        score, is_sensitive = compute_hybrid_score(
            content_emb=content_emb,
            content_text=text,
            trigger_emb=trigger_emb,
            hyp_embs=hyp_embs,
            keywords=keywords,
            exclusion_terms=exclusion_terms,
            subreddit=subreddit,
            threshold=settings.default_threshold,
        )
        await cache_service.write_result(db, cid, trigger.id, score, is_sensitive)
        yield ScoreResult(content_id=cid, cosine_score=score, is_sensitive=is_sensitive)
