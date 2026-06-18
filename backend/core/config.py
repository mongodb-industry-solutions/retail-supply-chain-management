from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongodb_uri: str
    database_name: str = "retail-supply-chain-risk"
    app_name: str = "retail-supply-chain-risk"
    anthropic_api_key: str
    voyage_api_key: str
    cors_origins: list[str] = ["*"]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
