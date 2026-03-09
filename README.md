# Positive Social Media

A Reddit-style content feed with a **personal AI sensitivity filter**. Users describe their triggers in natural language; a HyDE hybrid pipeline scores each post for semantic similarity and blurs sensitive content before it reaches the user. Posts resolve one-by-one via Server-Sent Events as scores stream in. Users can reveal, re-hide, and correct the model's decisions in real time.

---

## Architecture

```
backend/          Python FastAPI — moderation pipeline, REST + SSE API
ingestion/        Reddit fetcher + DB seeder
frontend/         React + Vite + TypeScript — feed UI with blur/reveal/feedback UX
```

**Embedding model:** `sentence-transformers/all-MiniLM-L6-v2` (~80MB, ~15ms/post on CPU, runs locally)
**LLM:** `claude-haiku-4-5-20251001` via Anthropic SDK — used once at trigger-save time to expand triggers into hypothetical examples

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

### 4. (Optional) Enable LLM expansion

Add `ANTHROPIC_API_KEY=your_key` to `backend/.env`. Without it the pipeline degrades gracefully to single-embedding scoring.

### 5. Docker (all at once)

```bash
cp .env.example .env
docker-compose up --build
```

---

## Usage

1. Open `http://localhost:5173`
2. Enter your trigger text (e.g. *"I don't want to see posts about AI"*)
3. Click **Save Filter** — the backend embeds your text, calls Claude to generate hypothetical examples, and stores everything
4. Watch posts load: each starts blurred (pending), then resolves to safe/sensitive as scores stream in
5. Click **Reveal** on sensitive posts to read them
6. After revealing: click **Hide again** to re-blur, or **Not sensitive** to permanently correct the model
7. On safe posts: click **Flag as sensitive** to permanently mark them

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/users` | Create user |
| `GET` | `/api/v1/users/{id}/triggers` | Get user's trigger profile |
| `PUT` | `/api/v1/users/{id}/triggers` | Save trigger (recomputes embedding + HyDE expansion, invalidates cache) |
| `GET` | `/api/v1/content` | List content items (query: platform, limit, offset) |
| `POST` | `/api/v1/moderate/batch` | Score a batch of posts synchronously |
| `GET` | `/api/v1/moderate/stream` | SSE stream of scores (query: user_id, content_ids) |
| `POST` | `/api/v1/moderate/feedback` | Submit a permanent user override (flag/unflag) |

---

## Scoring Pipeline (HyDE Hybrid)

When a user saves a trigger, the backend:

1. **Embeds** the raw trigger text → 384-dim float32 vector
2. **Calls Claude** (`expand_trigger`) → returns 4 hypothetical post titles that *would* match the trigger, plus 5–8 keywords and 2–4 exclusion phrases
3. **Embeds all hypothetical examples** → stores as flat `(N×384)` float32 blob in `trigger_profiles`

At scoring time (`compute_hybrid_score`):

```
dense    = max cosine similarity(content_emb, [hyp_embs..., trigger_emb])
lexical  = keyword hit-rate OR -0.15 if exclusion term matched
bias     = +0.04 if post is from a high-risk subreddit (news, worldnews, politics...)
combined = 0.75 * dense + 0.25 * lexical + bias
sensitive = combined >= threshold * 0.80   # safety buffer fires at 80% of threshold
```

Default threshold: `0.45`. Safety buffer: `0.80` → effective trigger at `0.36`.

Cache entries are versioned by `pipeline_version` (`"hyde-v1"`). User overrides (`is_user_override=True`) survive version bumps.

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
  config.py              Settings (threshold=0.45, lexical_weight=0.25, safety_buffer=0.80, model_version="hyde-v1")
  database.py            SQLAlchemy async engine + session + _migrate_db() for schema migrations
  models/                ORM: ContentItem, UserProfile, TriggerProfile, ModerationResult
  schemas/               Pydantic request/response models (incl. FeedbackRequest, ScoreResult)
  services/
    embedding_service.py Singleton SentenceTransformer wrapper
    llm_service.py       expand_trigger() — calls Claude Haiku, returns ExpandedTrigger dataclass
    moderation_service.py Async generator orchestrator (cache → embed → HyDE score → yield)
    cache_service.py     Version-aware DB cache: partition(), write_result(), upsert_feedback()
  pipeline/scoring.py    compute_hybrid_score() — dense + lexical + context bias + safety buffer
  routers/               FastAPI routers: users, content, moderation (batch + SSE + feedback)

ingestion/
  pushshift_client.py    Reddit JSON API fetcher
  reddit_normalizer.py   Maps Reddit fields → ContentItem
  seed_db.py             One-shot DB populator

frontend/src/
  api/                   Pure TS (no React): content, users, moderation, config
  types/index.ts         TypeScript interfaces matching Pydantic schemas
  store/                 Zustand: feedStore, moderationStore (applyOverride), userStore
  hooks/                 useContentFeed, useModerationScores (SSE lifecycle + error fallback)
  components/
    feed/                Feed.tsx, PostCard.tsx (wires feedback callbacks)
    moderation/          ModeratedContent.tsx (pending/safe/sensitive + reveal/hide/flag)
    settings/            TriggerSettings.tsx
```
