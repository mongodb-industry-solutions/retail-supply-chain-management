# ADR 003 — SSE Streaming + MongoDB Change Streams for Agent Activation

## Status
Accepted

## Context

The frontend requires real-time visibility into agent progress. Two communication patterns are needed:

1. **Frontend ← Backend**: The frontend must receive incremental updates as agents run (LLM token streaming, node completion events, final results).
2. **Ingestion → Risk Evaluator**: The risk evaluator must activate automatically when new disruption signals are written, without the frontend or ingestion engine calling it directly.

Options considered for frontend communication: WebSockets, polling, SSE. Options considered for internal activation: direct function call, message broker, Change Streams.

## Decision

### Frontend Communication: Server-Sent Events (SSE)

Use `StreamingResponse` with `media_type="text/event-stream"` for all agent-to-frontend communication. SSE is unidirectional (server → client), which is all that is needed here. It works over standard HTTP/1.1, requires no WebSocket upgrade, and is natively supported by all modern browsers.

Each SSE event carries a JSON payload describing the event type and data:

```
data: {"event": "node_complete", "node": "calculate_rpn", "payload": {...}}

data: {"event": "llm_token", "token": "The supplier..."}

data: {"event": "stream_end"}

```

### Internal Agent Activation: MongoDB Change Streams

Rather than having `ingestion_engine` directly call `risk_evaluator`, the ingestion engine writes trigger documents to the `external_conditions` collection with `is_demo_trigger: true` and a `session_id`. The `risk_evaluator` watches this collection via a MongoDB Change Stream filtered to the relevant `session_id`.

This preserves the slice boundary: ingestion does not import from risk_evaluator. MongoDB is the message bus.

```
[ingestion_engine]
  insert { is_demo_trigger: true, session_id: "..." } into external_conditions
      |
      v  Change Stream
[risk_evaluator]
  watch_external_conditions(session_id) detects the insert
  executes LangGraph evaluation graph
  streams results to frontend via SSE
```

### Human-in-the-Loop: Explicit POST for Alternative Finder

The `alternative_finder` is not activated automatically. After reviewing the risk evaluation results, the user explicitly triggers it via `POST /api/agent/find-alternatives`. This models the human-in-the-loop pattern intentionally.

## In Production

MongoDB Change Streams would be replaced by a message broker (Apache Kafka or Google Pub/Sub). The ingestion service would publish to a topic; the risk evaluator would be a subscriber. This avoids coupling the consumer's availability to the producer's write path.

SSE would remain appropriate for frontend communication unless bidirectional messaging becomes necessary (e.g. user can cancel a running agent), in which case WebSockets would be reconsidered.

## Consequences

**Positive**
- Real-time UX with no polling on the frontend.
- Slice boundaries are enforced at the data layer — ingestion and risk evaluation are decoupled.
- Change Streams provide at-least-once delivery within the replica set oplog window.
- SSE is simple to implement and debug (plain HTTP, inspectable in browser DevTools).

**Negative**
- Change Streams require a MongoDB replica set (Atlas satisfies this; standalone `mongod` does not).
- SSE connections are long-lived; the server must handle many open connections concurrently. Motor's async model handles this well.
- If the risk evaluator is down when a trigger is inserted, it will miss the event unless a resume token is persisted and the stream is resumed on restart.
