from __future__ import annotations

import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import settings


class EmbeddingService:
    _instance: "EmbeddingService | None" = None
    _model: SentenceTransformer | None = None

    def __new__(cls) -> "EmbeddingService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _load(self) -> None:
        if self._model is None:
            self._model = SentenceTransformer(settings.embedding_model)

    def embed(self, text: str) -> np.ndarray:
        self._load()
        emb = self._model.encode([text], normalize_embeddings=True)
        return emb[0].astype(np.float32)

    def embed_batch(self, texts: list[str]) -> list[np.ndarray]:
        self._load()
        embeddings = self._model.encode(texts, normalize_embeddings=True, batch_size=32)
        return [e.astype(np.float32) for e in embeddings]

    def serialize(self, emb: np.ndarray) -> bytes:
        return emb.tobytes()

    def deserialize(self, data: bytes) -> np.ndarray:
        return np.frombuffer(data, dtype=np.float32).copy()


embedding_service = EmbeddingService()
