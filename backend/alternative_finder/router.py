from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.session import get_session_id
from alternative_finder.graph import run_alternative_finder

router = APIRouter()


class FindAlternativesRequest(BaseModel):
    supplier_id: str
    condition_id: str


@router.post("/api/agent/find-alternatives")
async def find_alternatives(
    body: FindAlternativesRequest,
    session_id: str = Depends(get_session_id),
):
    return StreamingResponse(
        run_alternative_finder(session_id, body.supplier_id, body.condition_id),
        media_type="text/event-stream",
    )
