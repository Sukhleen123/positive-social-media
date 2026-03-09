from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


def _migrate_db(conn):
    """Add new columns to existing tables if they don't exist yet."""
    migrations = [
        "ALTER TABLE trigger_profiles ADD COLUMN hypothetical_examples JSON",
        "ALTER TABLE trigger_profiles ADD COLUMN hypothetical_embeddings BLOB",
        "ALTER TABLE trigger_profiles ADD COLUMN keywords JSON",
        "ALTER TABLE trigger_profiles ADD COLUMN exclusion_terms JSON",
        "ALTER TABLE moderation_results ADD COLUMN is_user_override INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE moderation_results ADD COLUMN pipeline_version TEXT",
    ]
    for sql in migrations:
        try:
            conn.execute(text(sql))
        except Exception as exc:
            if "duplicate column name" in str(exc).lower():
                pass  # column already exists — fine
            else:
                raise


async def init_db():
    async with engine.begin() as conn:
        from app.models import content, user, moderation  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_db)
