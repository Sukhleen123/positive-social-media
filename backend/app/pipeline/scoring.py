from __future__ import annotations

import numpy as np
from app.config import settings

HIGH_RISK_SUBS = {"news", "worldnews", "politics", "morbidreality"}


def compute_hybrid_score(
    content_emb: np.ndarray,
    content_text: str,
    trigger_emb: np.ndarray,
    hyp_embs: list[np.ndarray],
    keywords: list[str],
    exclusion_terms: list[str],
    subreddit: str | None,
    threshold: float | None = None,
) -> tuple[float, bool]:
    """Compute a hybrid HyDE + lexical score.

    1. Dense: max cosine similarity across hypothetical embeddings + original trigger embedding.
    2. Lexical: keyword hit-rate, suppressed by exclusion terms.
    3. Context bias: small boost for high-risk subreddits.
    4. Safety buffer: fires at ``safety_buffer * threshold`` so we err on the side of caution.

    Returns (score, is_sensitive).
    """
    if threshold is None:
        threshold = settings.default_threshold

    lexical_weight: float = settings.lexical_weight
    safety_buffer: float = settings.safety_buffer

    # 1. Dense — max similarity across all embeddings
    all_embs = list(hyp_embs) + [trigger_emb]
    dense = max(float(np.dot(content_emb, e)) for e in all_embs)

    # 2. Lexical
    text_lower = content_text.lower()
    if exclusion_terms and any(t.lower() in text_lower for t in exclusion_terms):
        lexical = -0.15  # suppress false positives
    elif keywords:
        hits = sum(1 for kw in keywords if kw.lower() in text_lower)
        lexical = min(hits / len(keywords), 1.0)
    else:
        lexical = 0.0

    # 3. Context bias
    context_bias = 0.04 if subreddit and subreddit.lower() in HIGH_RISK_SUBS else 0.0

    # 4. Combined
    combined = (1 - lexical_weight) * dense + lexical_weight * lexical + context_bias

    # 5. Safety buffer: fire at 80% of threshold
    is_sensitive = combined >= threshold * safety_buffer

    return combined, is_sensitive
