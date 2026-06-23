# In production, the risk evaluator would be activated by a MongoDB Change Stream
# watching external_conditions for is_demo_trigger=True inserts (see stream_listener.py
# and ADR 003). In the demo, the frontend triggers it explicitly via POST after
# ingestion completes.
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.session import get_session_id
from risk_evaluator.graph import run_risk_evaluator

router = APIRouter()


class EvaluateRequest(BaseModel):
    supplier_id: str
    condition_id: str


@router.post("/api/simulation/evaluate")
async def evaluate(
    body: EvaluateRequest,
    session_id: str = Depends(get_session_id),
):
    return StreamingResponse(
        run_risk_evaluator(session_id, body.supplier_id, body.condition_id),
        media_type="text/event-stream",
    )
