"""Map raw Reddit post dicts → ContentItem dicts (platform-agnostic schema)."""

from __future__ import annotations

import time
from typing import Any


def normalize_reddit_post(post: dict[str, Any]) -> dict[str, Any]:
    """Convert a raw Reddit post dict to a ContentItem dict.

    The ContentItem id is platform-prefixed: "reddit:t3_<post_id>".
    """
    post_id = post.get("id", "")
    return {
        "id": f"reddit:t3_{post_id}",
        "platform": "reddit",
        "platform_id": post_id,
        "title": post.get("title"),
        "body": post.get("selftext") or None,
        "author_handle": post.get("author"),
        "url": post.get("url"),
        "created_utc": int(post.get("created_utc", 0)),
        "raw_metadata": {
            "subreddit": post.get("subreddit"),
            "score": post.get("score"),
            "num_comments": post.get("num_comments"),
            "is_self": post.get("is_self"),
            "permalink": post.get("permalink"),
        },
        "fetched_at": int(time.time()),
    }


def normalize_batch(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    seen_ids: set[str] = set()
    for post in posts:
        item = normalize_reddit_post(post)
        if item["id"] not in seen_ids and item["platform_id"]:
            seen_ids.add(item["id"])
            normalized.append(item)
    return normalized
