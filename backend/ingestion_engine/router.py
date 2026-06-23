from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from core.session import get_session_id
from ingestion_engine.service import run_simulation

router = APIRouter()


@router.post("/api/simulation/start")
async def start_simulation(session_id: str = Depends(get_session_id)):
    return StreamingResponse(
        run_simulation(session_id),
        media_type="text/event-stream",
    )
