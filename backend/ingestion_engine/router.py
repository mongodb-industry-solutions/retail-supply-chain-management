from fastapi import APIRouter, Depends

from core.session import get_session_id
from ingestion_engine.service import run_ingestion

router = APIRouter()


@router.post("/api/simulation/start")
async def start_simulation(session_id: str = Depends(get_session_id)):
    return await run_ingestion(session_id)
