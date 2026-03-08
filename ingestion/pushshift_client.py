"""Reddit content fetcher using the public Reddit JSON API.

The original Pushshift API is largely defunct. This module fetches posts
directly from reddit.com's public JSON endpoints, which require no auth
for basic reads (though rate limits apply).
"""

from __future__ import annotations

import time
from typing import Any

import httpx

HEADERS = {"User-Agent": "positive-social-media-poc/0.1 (local dev)"}
REDDIT_BASE = "https://www.reddit.com"


def fetch_subreddit_posts(
    subreddit: str,
    limit: int = 100,
    after: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch up to `limit` posts from a subreddit.

    Returns a list of Reddit post data dicts (the 'data' field of each child).
    Makes multiple paginated requests if needed to reach `limit`.
    """
    posts: list[dict[str, Any]] = []
    params: dict[str, Any] = {"limit": min(100, limit), "raw_json": 1}
    if after:
        params["after"] = after

    url = f"{REDDIT_BASE}/r/{subreddit}/new.json"

    with httpx.Client(headers=HEADERS, timeout=30) as client:
        while len(posts) < limit:
            try:
                resp = client.get(url, params=params)
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                print(f"[pushshift_client] HTTP error {e.response.status_code} for r/{subreddit}")
                break
            except httpx.RequestError as e:
                print(f"[pushshift_client] Request error for r/{subreddit}: {e}")
                break

            data = resp.json()
            children = data.get("data", {}).get("children", [])
            if not children:
                break

            for child in children:
                posts.append(child["data"])

            after_token = data.get("data", {}).get("after")
            if not after_token or len(posts) >= limit:
                break

            params["after"] = after_token
            params["limit"] = min(100, limit - len(posts))
            time.sleep(1)  # respect rate limits

    return posts[:limit]
