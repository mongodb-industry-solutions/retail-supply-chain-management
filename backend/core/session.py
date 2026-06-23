from fastapi import Header, HTTPException


async def get_session_id(x_session_id: str = Header(...)) -> str:
    if not x_session_id or not x_session_id.strip():
        raise HTTPException(status_code=400, detail="X-Session-ID header is required and cannot be empty.")
    return x_session_id
