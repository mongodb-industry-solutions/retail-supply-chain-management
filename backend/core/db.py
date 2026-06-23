import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from core.config import get_settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None


async def connect():
    global _client
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.mongodb_uri, appname=settings.app_name)
    logger.info("MongoDB connection established.")


async def disconnect():
    global _client
    if _client:
        _client.close()
        logger.info("MongoDB connection closed.")


async def get_database() -> AsyncIOMotorDatabase:
    settings = get_settings()
    return _client[settings.database_name]
