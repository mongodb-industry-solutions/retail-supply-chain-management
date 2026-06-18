# ADR 003 — SSE Streaming + MongoDB Change Streams for Agent Activation

## Status
Accepted

## Context

The frontend requires real-time visibility into agent progress. Two communication patterns are needed:

1. **Frontend ← Backend**: The frontend must receive incremental updates as agents run (LLM token streaming, node completion events, final results).
2. **Ingestion → Risk Evaluator**: The risk evaluator must activate when new disruption signals are written. The activation model differs between demo and production.

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

### Agent Activation: Demo vs Production

#### Demo

Both agents are activated by explicit frontend POSTs — this is a human-driven flow that matches the demo's step-by-step UX:

- `risk_evaluator` — activated by `POST /api/simulation/evaluate` after the ingestion step completes. The frontend drives the sequence.
- `alternative_finder` — activated by `POST /api/agent/find-alternatives` after the user reviews the risk evaluation results. Human-in-the-loop by design.

#### Production

- `risk_evaluator` — would be activated automatically by a MongoDB Change Stream watching the `external_conditions` collection for `is_demo_trigger: true` inserts. The ingestion engine writes a trigger document; the risk evaluator wakes up without any direct call from the frontend or ingestion service. This preserves the slice boundary: ingestion does not import from risk_evaluator. MongoDB is the message bus.

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

- `alternative_finder` — remains frontend-triggered (`POST /api/agent/find-alternatives`). Human-in-the-loop is intentional regardless of environment.

See `risk_evaluator/stream_listener.py` for the Change Stream implementation stub.

## In Production

MongoDB Change Streams would be replaced by a message broker (Apache Kafka or Google Pub/Sub). The ingestion service would publish to a topic; the risk evaluator would be a subscriber. This avoids coupling the consumer's availability to the producer's write path.

SSE would remain appropriate for frontend communication unless bidirectional messaging becomes necessary (e.g. user can cancel a running agent), in which case WebSockets would be reconsidered.

## Consequences

**Positive**
- Real-time UX with no polling on the frontend.
- In production, slice boundaries are enforced at the data layer — ingestion and risk evaluation are decoupled.
- Change Streams provide at-least-once delivery within the replica set oplog window.
- SSE is simple to implement and debug (plain HTTP, inspectable in browser DevTools).

**Negative**
- Change Streams require a MongoDB replica set (Atlas satisfies this; standalone `mongod` does not).
- SSE connections are long-lived; the server must handle many open connections concurrently. Motor's async model handles this well.
- If the risk evaluator is down when a trigger is inserted, it will miss the event unless a resume token is persisted and the stream is resumed on restart.
