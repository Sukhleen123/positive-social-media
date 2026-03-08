from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./positive_social_media.db"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    model_version: str = "all-MiniLM-L6-v2-v1"
    default_threshold: float = 0.45
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
