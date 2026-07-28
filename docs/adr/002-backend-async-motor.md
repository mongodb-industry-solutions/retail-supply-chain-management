# ADR 002 — Motor Async Driver over PyMongo Sync

## Status
Accepted

## Context

The backend serves SSE (Server-Sent Events) streams to the frontend for both the risk evaluation and alternative finder flows. SSE requires that the FastAPI handlers remain non-blocking for the duration of the stream. Any synchronous I/O call inside an `async def` handler would block the event loop and stall all concurrent SSE connections.

The template used PyMongo, which is synchronous. Running synchronous PyMongo calls from async FastAPI handlers via `run_in_executor` is possible but adds indirection and defeats the purpose of async.

## Decision

Replace PyMongo with **Motor** (`motor.motor_asyncio.AsyncIOMotorClient`) as the primary MongoDB driver.

Motor is the official async Python driver for MongoDB, built on top of PyMongo. It exposes an identical API to PyMongo but returns coroutines instead of blocking. This means all `find`, `insert_one`, `aggregate`, and change stream operations are naturally awaitable.

PyMongo remains a transitive dependency because Motor is built on top of it. It would also be required by the LangGraph MongoDB checkpointer (`langgraph-checkpoint-mongodb`), which targets the sync PyMongo client — but note that no checkpointer is wired into either graph today, so PyMongo's presence is currently due solely to Motor's internal use of it. See ADR-004 for the checkpointer status.

### Singleton Pattern

A single `AsyncIOMotorClient` is created in `core/db.py` during the FastAPI `lifespan` startup event and closed on shutdown. All slices obtain a database handle via `await get_database()`, which returns a reference to the already-open client's database — no new connections are opened per request.

```python
# core/db.py (simplified)
async def connect():
    global _client
    _client = AsyncIOMotorClient(settings.mongodb_uri, appname=settings.app_name)

async def get_database() -> AsyncIOMotorDatabase:
    return _client[settings.database_name]
```

## Consequences

**Positive**
- All database calls are non-blocking; the event loop remains free during I/O.
- SSE streams remain responsive even when multiple sessions are active concurrently.
- Motor's API is nearly identical to PyMongo, minimising the learning curve.

**Negative**
- Motor does not support every PyMongo feature (e.g. some gridFS operations); not a concern for this use case.
- Two drivers (Motor + PyMongo) are listed as dependencies; Motor's internal use of PyMongo makes this unavoidable.
