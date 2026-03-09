# Moderation Feature — Technical Deep Dive

This document explains the content moderation system built into **positive-social-media**: what problem it solves, how each piece works, and the reasoning behind the design decisions.

---

## Problem Statement

Standard keyword filters break under paraphrase. The trigger _"I don't want to see AI news"_ will miss _"OpenAI unveils new autonomous weapons system"_ because the words don't overlap. A naive embedding approach (embed the trigger sentence, measure cosine similarity against each post) also struggles: the trigger text _"I don't want to see AI news"_ lives in a very different region of the embedding space than an actual AI news headline — the negation and meta-language drag the vector away from the topic being described.

The solution is **HyDE (Hypothetical Document Embeddings)**: instead of embedding what the user *said*, generate examples of what triggering content *looks like*, then score against those.

---

## System Overview

```
User saves trigger
      │
      ▼
llm_service.expand_trigger()
  → Claude Haiku: "give me 4 realistic post titles that match this trigger"
  → returns: hypothetical_examples[], keywords[], exclusion_terms[]
      │
      ▼
embedding_service.embed_batch(hypothetical_examples)
  → (N × 384) float32 blob stored in trigger_profiles
      │
      ▼
Feed loads → SSE stream opens
      │
      ▼
moderation_service.score_content() [async generator]
  → cache_service.partition() → return cached hits immediately
  → for uncached: embedding_service.embed_batch(post bodies)
  → pipeline/scoring.compute_hybrid_score() per post
  → cache_service.write_result()
  → yield ScoreResult → SSE → frontend
      │
      ▼
ModeratedContent component
  → pending: blur + spinner
  → sensitive: blur + "Reveal" button
  → revealed: "Hide again" + "Not sensitive" button
  → safe: "Flag as sensitive" button
```

---

## HyDE Pipeline in Detail

### Why HyDE works

A sentence-transformer embedding of _"I don't want to see posts about AI"_ sits in a semantic neighbourhood of first-person preference statements, not AI news. But an embedding of _"OpenAI announces GPT-5 with autonomous reasoning"_ sits squarely in the AI-news neighbourhood. HyDE bridges the gap: the LLM generates text that lives in the *target* region of the embedding space, so cosine similarity becomes meaningful.

### Trigger expansion (`llm_service.py`)

```python
async def expand_trigger(raw_text: str) -> ExpandedTrigger:
```

Calls `claude-haiku-4-5-20251001` with a single structured prompt asking for:
- `examples` — 4 realistic post titles that *would* match the trigger
- `keywords` — 5–8 high-signal terms (for lexical boosting)
- `exclusions` — 2–4 phrases that look topically similar but should *not* be flagged (false-positive guard)

The LLM is called **exactly once per trigger save**, not at query time. Latency cost (~1–2s) is paid when the user clicks "Save Filter", not per post.

If `ANTHROPIC_API_KEY` is absent or the call fails, the function falls back gracefully: `hypothetical_examples = [raw_text]`, empty keywords/exclusions. The pipeline degrades to single-embedding scoring rather than crashing.

### Hybrid scoring (`pipeline/scoring.py`)

```python
def compute_hybrid_score(
    content_emb,     # (384,) — embedding of the post being evaluated
    content_text,    # str — raw post text for lexical matching
    trigger_emb,     # (384,) — embedding of the original trigger sentence
    hyp_embs,        # list[(384,)] — embeddings of LLM-generated examples
    keywords,        # list[str]
    exclusion_terms, # list[str]
    subreddit,       # str | None
    threshold,
) -> tuple[float, bool]:
```

**Step 1 — Dense score (max pooling across hypotheticals)**

```python
all_embs = hyp_embs + [trigger_emb]
dense = max(cosine_similarity(content_emb, e) for e in all_embs)
```

Taking the *max* rather than the mean makes the classifier ask "does this post look like *any* of the generated examples?" — more robust than a single anchor. The original trigger embedding is always included as a fallback even when hypotheticals exist.

Note: the model outputs L2-normalized vectors, so `np.dot(a, b)` is equivalent to cosine similarity — no explicit normalization needed at score time.

**Step 2 — Lexical score**

```python
if exclusion_terms and any(t in text_lower for t in exclusion_terms):
    lexical = -0.15   # explicit suppression
elif keywords:
    lexical = min(keyword_hit_count / total_keywords, 1.0)
else:
    lexical = 0.0
```

Exclusion terms (-0.15) handle the "hot dog" problem: a trigger about "dog attacks" could otherwise catch cooking content. The lexical component adds a complementary signal — semantic similarity can miss exact-match jargon that embeddings collapse together.

**Step 3 — Context bias**

```python
HIGH_RISK_SUBS = {"news", "worldnews", "politics", "morbidreality"}
context_bias = 0.04 if subreddit in HIGH_RISK_SUBS else 0.0
```

A small constant boost for subreddits known to carry heavier content. Keeps the scoring content-aware without a full classifier.

**Step 4 — Combine**

```python
combined = 0.75 * dense + 0.25 * lexical + context_bias
```

Weights are configurable via `settings.lexical_weight` (default 0.25).

**Step 5 — Safety buffer**

```python
is_sensitive = combined >= threshold * safety_buffer
# default: 0.38 * 0.80 = 0.304
```

The effective threshold is 80% of the nominal threshold. This is a deliberate asymmetric error preference: false positives (over-blurring) are less harmful than false negatives (under-blurring) for a sensitivity filter. Users can always reveal content; they can't un-see it.

---

## Cache & Versioning (`cache_service.py`)

Results are stored in `moderation_results` (UNIQUE on `content_id × trigger_profile_id`).

**Version-aware cache hits:**

```python
WHERE pipeline_version = 'hyde-v1'
   OR is_user_override = TRUE
```

When the pipeline changes, bumping `model_version` in config to `"hyde-v2"` automatically makes all old entries invisible without a migration. User overrides are permanently excluded from this filter — they survive model upgrades.

**User feedback (`upsert_feedback`):**

```python
existing.is_user_override = True
existing.is_sensitive = is_sensitive
```

When a user clicks "Flag as sensitive" or "Not sensitive", the frontend calls `POST /api/v1/moderate/feedback` which writes a permanent DB override. On next page load, `partition()` returns this as a cache hit with `is_user_override=True`, bypassing scoring entirely.

---

## Streaming Architecture (`moderation_service.py` + SSE)

`score_content()` is an **async generator** that yields `ScoreResult` objects:

1. Resolve the user's `TriggerProfile` (single query)
2. `cache_service.partition()` → split content IDs into cached vs. uncached
3. **Yield cached results immediately** — zero compute, near-zero latency
4. Fetch post bodies for uncached IDs
5. `embedding_service.embed_batch()` — single batched inference call (much faster than per-post)
6. `compute_hybrid_score()` per post → yield → `write_result()`

The router wraps this in a `StreamingResponse` with `media_type="text/event-stream"`. The frontend opens an `EventSource` and updates Zustand state per result:

```
pending → safe/sensitive
```

Posts resolve progressively rather than waiting for all scores. The loading overlay disappears per-post as soon as its score arrives.

---

## Frontend State Machine (`ModeratedContent.tsx`)

Each post card renders through a state machine with 5 observable states:

| State | Render |
|-------|--------|
| `pending` | Content visible under loading overlay/spinner |
| `sensitive` (not revealed) | Content blurred, "Sensitive content" badge, "Reveal" button |
| `sensitive` (revealed) | Content visible, "Hide again" + "Not sensitive" buttons |
| `safe` | Content visible, "Flag as sensitive" button |
| `safe` (after override) | Same as safe, is_user_override flag set in store |

The `revealed` boolean is local component state — it doesn't round-trip to the server. "Hide again" resets it to `false` without any API call. Only "Flag as sensitive" and "Not sensitive" make network requests (optimistic update first via `applyOverride`, then `submitFeedback` in background).

---

## DB Schema Migration (`database.py`)

SQLAlchemy's `create_all()` skips tables that already exist — it does not add new columns to old schemas. The `_migrate_db()` helper runs after `create_all` and issues `ALTER TABLE … ADD COLUMN` for every new column:

```python
def _migrate_db(conn):
    for sql in migrations:
        try:
            conn.execute(text(sql))
        except Exception as exc:
            if "duplicate column name" in str(exc).lower():
                pass   # already exists — fine
            else:
                raise
```

SQLite raises `OperationalError: duplicate column name` if the column already exists. This makes the migration idempotent: safe to run on a fresh DB (no-op) or an old DB (adds missing columns). No data is lost.

---

## Design Decisions & Trade-offs

**Why call the LLM at trigger-save time, not at query time?**
Query-time LLM calls would add 1–2s latency to *every page load*. Trigger-save is a deliberate one-shot action — users expect it to take a moment. The embeddings are computed once and stored.

**Why max pooling across hypothetical embeddings?**
Mean pooling would blend all examples together, potentially washing out specificity. Max pooling preserves the best-matching signal: if *any* hypothetical matches the content, it should be caught.

**Why 80% safety buffer rather than the raw threshold?**
A sensitivity filter errs toward over-inclusion. False negatives (failing to blur something triggering) are worse than false positives (blurring something benign that can be revealed with one click). The buffer is configurable so it can be tuned per-use-case.

**Why keep the original trigger embedding alongside hypotheticals?**
As a fallback: if the LLM-generated examples aren't representative (or if the API is down and the fallback fires), the original trigger still provides a meaningful baseline signal.

**Why Server-Sent Events instead of WebSockets or a single batch response?**
SSE is unidirectional (server → client), stateless, and works over plain HTTP — no upgrade handshake, firewall-friendly, trivially proxied. For this use case (server pushes score results as they're computed, client only reads) SSE is the right fit. WebSockets add bidirectional complexity that isn't needed.

**Why is the API layer React-free?**
`frontend/src/api/` contains zero JSX/React imports. This means the same API calls can be used in a Chrome extension's background service worker, which doesn't have a DOM or React. The extension architecture is a natural next step: the scoring pipeline runs server-side, so the extension just needs to call the same endpoints.
