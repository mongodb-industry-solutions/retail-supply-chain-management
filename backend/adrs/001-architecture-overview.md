# ADR 001 — Vertical Slice Architecture for Agentic Demo

## Status
Accepted

## Context

This backend represents three distinct logical services — ingestion, risk evaluation, and alternative sourcing — that in a production system would be independent deployable units. For the purposes of this demo, deploying three separate services adds operational overhead without meaningful benefit.

The codebase must remain readable to MongoDB Solutions Architects and engineers who may run, extend, or present the demo. Architecture boundaries must be visible in code, not just in diagrams.

## Decision

Run all three logical services as vertical slices within a single FastAPI application.

Each slice (`ingestion_engine`, `risk_evaluator`, `alternative_finder`) owns its router, graph, nodes, and schemas. **No slice imports from another slice.** All inter-slice communication happens via MongoDB: ingestion writes to `external_conditions`, risk evaluation reads from it via Change Stream, and alternative finder reads from `suppliers`.

The `core/` package provides shared infrastructure (DB connection, settings, session dependency, exceptions) that all slices may import from.

## Folder Boundaries

| Package | Responsibility |
|---|---|
| `ingestion_engine` | Simulates external disruption signals; writes demo trigger documents to MongoDB |
| `risk_evaluator` | Activated by Change Stream; runs LangGraph RPN evaluation; streams risk summary to frontend |
| `alternative_finder` | Activated by frontend POST (human-in-the-loop); runs LangGraph supplier search; streams results to frontend |
| `core` | DB singleton, settings, session header dependency, shared exceptions |
| `voyageai` | Thin wrapper around MongoDB-native Voyage AI reranker |

## Consequences

**Positive**
- Each slice can be extracted into its own microservice by copying the folder, updating imports to `core/`, and pointing at the same MongoDB cluster.
- Clear bounded contexts make the demo easy to walk through slice by slice.
- A single `uvicorn` process simplifies local development and container deployment.

**Negative**
- A bug in one slice can affect the shared process. Acceptable for a demo context.
- Shared `core/db.py` singleton means all slices share one Motor connection pool; fine at demo scale.

## In Production

Each slice would be an independent service with its own repository, deployment pipeline, and MongoDB connection. Change Streams would be replaced by a message broker (see ADR 003).
