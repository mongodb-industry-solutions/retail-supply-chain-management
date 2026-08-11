from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongodb_uri: str
    database_name: str = "retail-supply-chain-risk"
    app_name: str = "retail-supply-chain-risk"
    llm_api_key: str
    llm_base_url: str
    anthropic_model: str
    cors_origins: list[str] = ["*"]
    # Optional. ONLY used by alternative_finder's tier-2 rerank fallback, when the native
    # in-database ``$rerank`` stage is unavailable on the configured cluster. Obtained from
    # the Voyage AI dashboard (NOT from MongoDB Atlas). Left as None when unset, which
    # simply disables tier 2 and lets the pipeline fall through to the un-reranked order.
    voyage_api_key_fallback: str | None = None

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
