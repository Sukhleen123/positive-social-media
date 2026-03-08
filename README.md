# Positive Social Media

A Reddit-style content feed with a **personal AI sensitivity filter**. Users describe their triggers in natural language; an embedding-based pipeline scores each post for semantic similarity and blurs sensitive content before it reaches the user. Posts resolve one-by-one via Server-Sent Events as scores stream in.

---

## Architecture

```
backend/          Python FastAPI — moderation pipeline, REST + SSE API
ingestion/        Reddit fetcher + DB seeder
frontend/         React + Vite + TypeScript — feed UI with blur/reveal UX
docker-compose.yml
```

**Embedding model:** `sentence-transformers/all-MiniLM-L6-v2` (~80MB, ~15ms/post on CPU, runs locally)

---

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# API at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

### 2. Seed the database

```bash
cd backend
python ../ingestion/seed_db.py
# Fetches ~300 posts from r/news, r/worldnews, r/technology
# Falls back to sample data if network unavailable
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# UI at http://localhost:5173
```

### 4. Docker (all at once)

```bash
cp .env.example .env
docker-compose up --build
```

---

## Usage

1. Open `http://localhost:5173`
2. Enter your trigger text (e.g. *"dog attacks, animal violence"*)
3. Click **Save Filter** — this embeds your text and stores it server-side
4. Watch posts load: each starts blurred, then resolves to safe/sensitive as scores stream in
5. Click **Reveal** on sensitive posts to read them

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/users` | Create user |
| `GET` | `/api/v1/users/{id}/triggers` | Get user's trigger profile |
| `PUT` | `/api/v1/users/{id}/triggers` | Save trigger text (recomputes embedding, invalidates cache) |
| `GET` | `/api/v1/content` | List content items (query: platform, limit, offset) |
| `POST` | `/api/v1/moderate/batch` | Score a batch of posts |
| `GET` | `/api/v1/moderate/stream` | SSE stream of scores (query: user_id, content_ids) |

---

## Scoring Logic

```python
score = np.dot(content_embedding, trigger_embedding)  # cosine similarity (L2-normalized)
is_sensitive = score >= 0.45  # threshold tunable in config
```

Posts with cosine similarity ≥ 0.45 to the trigger are flagged sensitive. The threshold can be adjusted in `backend/app/config.py`.

---

## Extension Readiness

- `frontend/src/api/` contains **zero React imports** — reusable in a Chrome extension background service worker
- `userStore` uses Zustand `persist` middleware, swappable for `chrome.storage.sync`
- `ModeratedContent` CSS logic translates directly to DOM mutation in a content script
- `ContentItem` schema supports any platform via the `platform` field

---

## Project Structure

```
backend/app/
  config.py              Settings (DATABASE_URL, threshold, model name)
  database.py            SQLAlchemy async engine + session
  models/                ORM: ContentItem, UserProfile, TriggerProfile, ModerationResult
  schemas/               Pydantic request/response models
  services/
    embedding_service.py Singleton SentenceTransformer wrapper
    moderation_service.py Async generator orchestrator (cache → embed → score → yield)
    cache_service.py     DB cache read/write/invalidation
  pipeline/scoring.py    Cosine similarity + threshold logic
  routers/               FastAPI routers: users, content, moderation (batch + SSE)

ingestion/
  pushshift_client.py    Reddit JSON API fetcher
  reddit_normalizer.py   Maps Reddit fields → ContentItem
  seed_db.py             One-shot DB populator

frontend/src/
  api/                   Pure TS (no React): content, users, moderation, config
  types/index.ts         TypeScript interfaces matching Pydantic schemas
  store/                 Zustand: feedStore, moderationStore, userStore
  hooks/                 useContentFeed, useModerationScores (SSE lifecycle)
  components/
    feed/                Feed.tsx, PostCard.tsx
    moderation/          ModeratedContent.tsx, LoadingOverlay.tsx
    settings/            TriggerSettings.tsx
```
