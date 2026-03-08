import numpy as np
from app.config import settings


def compute_personal_toxicity_score(
    content_emb: np.ndarray,
    trigger_emb: np.ndarray,
    threshold: float | None = None,
) -> tuple[float, bool]:
    """Compute cosine similarity between content and trigger embeddings.

    Embeddings must be L2-normalized — dot product equals cosine similarity.
    Returns (score, is_sensitive).
    """
    if threshold is None:
        threshold = settings.default_threshold
    score = float(np.dot(content_emb, trigger_emb))
    return score, score >= threshold
