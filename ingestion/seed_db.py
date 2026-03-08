"""One-shot script: populate SQLite with Reddit posts.

Usage:
    cd positive-social-media/backend
    python ../ingestion/seed_db.py

Fetches posts from r/news, r/worldnews, r/technology using the Reddit JSON API.
Falls back to generated sample data if the network is unavailable.
"""

from __future__ import annotations

import asyncio
import sys
import os
import time
from typing import Any

# Allow imports from backend/app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.database import init_db, AsyncSessionLocal
from app.models.content import ContentItem

try:
    from pushshift_client import fetch_subreddit_posts
    from reddit_normalizer import normalize_batch
except ImportError:
    sys.path.insert(0, os.path.dirname(__file__))
    from pushshift_client import fetch_subreddit_posts
    from reddit_normalizer import normalize_batch


SUBREDDITS = ["news", "worldnews", "technology"]
POSTS_PER_SUB = 100


def generate_sample_posts(count: int = 300) -> list[dict[str, Any]]:
    """Generate sample posts when network is unavailable."""
    samples = [
        ("Man Killed by Police Dog During Traffic Stop", "The incident occurred Tuesday evening when officers attempted to pull over a vehicle for a broken taillight."),
        ("Scientists Discover New Treatment for Alzheimer's", "Researchers at MIT have developed a promising new approach to treating the neurodegenerative disease."),
        ("Local School Wins National Robotics Competition", "Students from Jefferson High School took first place in this year's FIRST Robotics Championship."),
        ("Earthquake Strikes Northern California, Several Injured", "A 5.8 magnitude earthquake shook the region early this morning, damaging several buildings."),
        ("New Park Opens in Downtown Area", "The city unveiled a new 10-acre green space featuring native plants and walking trails."),
        ("Dog Attack Leaves Child Seriously Injured", "A seven-year-old is recovering in hospital after being bitten by a neighbor's dog."),
        ("Tech Company Lays Off 2,000 Employees", "The announcement came as part of a broader restructuring effort to cut costs."),
        ("Community Garden Project Feeds Hundreds", "Volunteers have grown over 5,000 pounds of fresh produce for local food banks this year."),
        ("Fatal Car Crash on Interstate 80", "Two people died and three were injured in a multi-vehicle collision during morning rush hour."),
        ("New Climate Report Shows Record Temperatures", "The annual assessment found global average temperatures hit an all-time high last year."),
        ("Local Artist Transforms Abandoned Building", "A muralist has turned a derelict warehouse into a colorful tribute to the city's history."),
        ("Violence Escalates in Conflict Zone", "International observers report increased casualties as fighting intensifies in the region."),
        ("High School Students Launch Satellite", "A team of teenagers successfully launched a small satellite as part of a NASA educational program."),
        ("Water Contamination Found in Municipal Supply", "Officials issued a boil-water advisory after elevated lead levels were detected."),
        ("Wildfire Threatens Residential Areas", "Thousands of residents have been ordered to evacuate as the blaze grows to 10,000 acres."),
        ("Record Voter Turnout in Local Elections", "Election officials reported the highest participation in three decades for yesterday's municipal vote."),
        ("Child Rescued After Being Trapped in Well", "Emergency crews worked through the night to safely extract a six-year-old from a 30-foot well."),
        ("New Bridge Project Will Cut Commute Times", "The infrastructure upgrade is expected to reduce average travel times by 15 minutes."),
        ("Armed Robbery at Convenience Store", "Police are searching for two suspects who robbed the establishment at gunpoint."),
        ("University Offers Free Tuition to Low-Income Students", "The new scholarship program will cover full costs for families earning under $65,000 annually."),
    ]
    now = int(time.time())
    posts = []
    for i in range(count):
        title, body = samples[i % len(samples)]
        suffix = f" ({i // len(samples) + 1})" if i >= len(samples) else ""
        posts.append({
            "id": f"sample_{i:04d}",
            "platform": "reddit",
            "platform_id": f"sample_{i:04d}",
            "title": title + suffix,
            "body": body,
            "author_handle": f"user_{i % 50}",
            "url": f"https://reddit.com/r/news/comments/sample_{i:04d}",
            "created_utc": now - (i * 3600),
            "raw_metadata": {"subreddit": ["news", "worldnews", "technology"][i % 3], "score": 100 + i},
            "fetched_at": now,
        })
    return posts


async def seed():
    print("[seed_db] Initializing database...")
    await init_db()

    items: list[dict[str, Any]] = []

    # Try fetching from Reddit
    network_ok = False
    for subreddit in SUBREDDITS:
        print(f"[seed_db] Fetching r/{subreddit}...")
        try:
            raw_posts = fetch_subreddit_posts(subreddit, limit=POSTS_PER_SUB)
            if raw_posts:
                normalized = normalize_batch(raw_posts)
                items.extend(normalized)
                print(f"[seed_db]   → {len(normalized)} posts from r/{subreddit}")
                network_ok = True
            else:
                print(f"[seed_db]   → No posts returned from r/{subreddit}")
        except Exception as e:
            print(f"[seed_db]   → Failed to fetch r/{subreddit}: {e}")

    if not network_ok or len(items) < 50:
        print("[seed_db] Network unavailable or insufficient posts; using sample data.")
        items = generate_sample_posts(300)

    # Deduplicate
    seen: set[str] = set()
    unique_items = []
    for item in items:
        if item["id"] not in seen:
            seen.add(item["id"])
            unique_items.append(item)

    print(f"[seed_db] Inserting {len(unique_items)} unique posts...")

    async with AsyncSessionLocal() as db:
        # Skip already-existing items
        existing_stmt = "SELECT id FROM content_items"
        from sqlalchemy import text
        existing = {row[0] for row in (await db.execute(text(existing_stmt))).fetchall()}

        new_items = [item for item in unique_items if item["id"] not in existing]
        print(f"[seed_db] {len(new_items)} new (skipping {len(unique_items) - len(new_items)} existing).")

        for item in new_items:
            db.add(ContentItem(**item))

        await db.commit()

    print(f"[seed_db] Done. Database contains {len(existing) + len(new_items)} posts.")


if __name__ == "__main__":
    asyncio.run(seed())
