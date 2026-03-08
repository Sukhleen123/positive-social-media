from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.content import ContentItem
from app.schemas.content import ContentItemSchema

router = APIRouter(prefix="/api/v1/content", tags=["content"])


@router.get("", response_model=List[ContentItemSchema])
async def list_content(
    platform: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ContentItem)
    if platform:
        stmt = stmt.where(ContentItem.platform == platform)
    stmt = stmt.order_by(ContentItem.created_utc.desc()).offset(offset).limit(limit)
    items = (await db.execute(stmt)).scalars().all()
    return items
