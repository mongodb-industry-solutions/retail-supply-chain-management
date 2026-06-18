# ADR 001 — Vertical Slice Architecture for Agentic Demo

## Status
Accepted

## Context

This backend represents three distinct logical services — ingestion, risk evaluation, and alternative sourcing — that in a production system would be independent deployable units. For the purposes of this demo, deploying three separate services adds operational overhead without meaningful benefit.

The codebase must remain readable to MongoDB Solutions Architects and engineers who may run, extend, or present the demo. Architecture boundaries must be visible in code, not just in diagrams.

## Decision

Run all three logical services as vertical slices within a single FastAPI application.

Each slice (`ingestion_engine`, `risk_evaluator`, `alternative_finder`) owns its router, service logic, and schemas. **No slice imports from another slice.** All inter-slice communication happens via MongoDB — ingestion writes to `external_conditions`, risk evaluation reads from it, alternative finder reads from `supplier_risk_evaluations` and `suppliers`. This is the Operational Data Layer pattern described in ADR 005.

The `core/` package provides shared infrastructure (DB connection, settings, session dependency, exceptions) that all slices may import from.

## Folder Boundaries

| Package | Responsibility |
|---|---|
| `ingestion_engine` | Generates 3 demo trigger signals per session; inserts them into `external_conditions`; returns JSON response |
| `risk_evaluator` | Agent 1 — activated by frontend POST; runs LangGraph RPN evaluation; streams risk summary via SSE |
| `alternative_finder` | Agent 2 — activated by frontend POST (human-in-the-loop); runs LangGraph supplier search; streams results via SSE |
| `core` | DB singleton, settings, session header dependency, shared exceptions |
| `voyageai` | Thin wrapper around MongoDB-native Voyage AI reranker |

## Activation model

In this demo both agents are activated by explicit frontend POST requests — this gives the demo full control over the flow and makes the agent steps visible to the presenter.

In a production system, `risk_evaluator` would be activated by a MongoDB Change Stream watching `external_conditions` for new `is_demo_trigger: true` inserts — no frontend call required. The Change Stream activation pattern is documented in `stream_listener.py` and ADR 003 as a production reference.

`alternative_finder` remains frontend-triggered in production — it is a human-in-the-loop step that only runs when the procurement manager decides to act on a flagged supplier.

## Consequences

**Positive**
- Each slice can be extracted into its own microservice by copying the folder, updating imports to `core/`, and pointing at the same MongoDB cluster.
- Clear bounded contexts make the demo easy to walk through slice by slice.
- A single `uvicorn` process simplifies local development and container deployment.

**Negative**
- A bug in one slice can affect the shared process. Acceptable for a demo context.
- Shared `core/db.py` singleton means all slices share one Motor connection pool — fine at demo scale.

## In Production

Each slice would be an independent service with its own repository, deployment pipeline, and MongoDB connection. The ODL pattern scales naturally — each service still owns its collections and communicates only via MongoDB reads. See ADR 005 for the full production architecture including CDC sync from ERP systems.
