import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from core.db import connect, disconnect
from ingestion_engine.router import router as ingestion_router
from risk_evaluator.router import router as risk_router
from alternative_finder.router import router as alternative_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up retail-supply-chain-risk-backend...")
    await connect()
    yield
    logger.info("Shutting down retail-supply-chain-risk-backend...")
    await disconnect()


settings = get_settings()

app = FastAPI(title="Retail Supply Chain Risk Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion_router)
app.include_router(risk_router)
app.include_router(alternative_router)


@app.get("/")
async def health_check():
    return {"status": "ok", "service": "retail-supply-chain-risk-backend"}
