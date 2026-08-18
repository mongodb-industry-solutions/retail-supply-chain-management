# ADR 005 — Operational Data Layer (ODL): Also the Agents' Context Layer


## Context

This system has three services (ingestion_engine, risk_evaluator, alternative_finder) that need to share data — signals, evaluations, supplier master data, purchase orders. The question is: how do services exchange information without coupling directly to each other?

In a typical microservices architecture there are two common answers:

- **Service-to-service calls** — Service A calls Service B's API directly. Simple to implement, but creates tight coupling. If B is slow or down, A is affected. And in an event-driven system, it doesn't make sense to "call" a service that should be reacting to data changes.

- **Message bus** (Kafka, RabbitMQ) — Services publish and consume events. Decoupled, but adds significant infrastructure complexity for a demo system.

This project uses a third pattern that MongoDB Atlas makes practical at this scale.

---

## Decision

We apply the **Operational Data Layer (ODL)** pattern: MongoDB Atlas acts as the single shared operational store. Each collection has exactly one owner (the service that writes it). All other services that need that data read it directly from the collection.

The rule is simple: **the owner writes, consumers read.**

```
ingestion_engine   →  writes  external_conditions
risk_evaluator     →  writes  supplier_risk_evaluations
alternative_finder →  writes  supplier_alternatives
seed data          →  populates  suppliers, purchase_orders, risk_catalog, supplier_documents, agent_memory

risk_evaluator     ←  reads   external_conditions, suppliers, purchase_orders, risk_catalog, agent_memory
alternative_finder ←  reads   supplier_risk_evaluations, suppliers, purchase_orders, supplier_documents, risk_catalog, agent_memory
```

No service calls another service's API. No message broker. The data itself is the communication channel.

This ownership rule does double duty. Beyond removing service-to-service coupling, it is what makes the ODL usable directly as the context source the agents read from — not a separate retrieval store built on top of it. Because each collection has exactly one writer, there is never a second, possibly-stale copy of that data sitting in a vector store or cache for an agent to query instead: the same `supplier_documents` collection `alternative_finder` reads for structured fields (`valid_until`, `doc_type`) is the one Atlas also indexes for `$vectorSearch` and `$rankFusion` ([ADR-007](./007-backend-native_reranking.md)). A read for an operational check and a read for retrieval context are the same document, under the same access controls, never two representations that could drift apart. This is the same no-fragmentation argument the `alternative_finder` design doc makes about Atlas sustaining all four of its layers without a separate vector database or external reranking service — applied here one level down, to why the ODL itself is a sound foundation for that to be true.

> **Current implementation status — `agent_memory` is read-only today.** The ODL ownership design assigns `agent_memory` a single writer (the closure loop of [ADR-009](./009-backend-agent_memory_single_writer.md)), but **no code in the repo writes to `agent_memory`** — all three modules only read it, and no scheduled job or trigger produces closure episodes. Today `agent_memory` is populated exclusively by hand-curated seed data. The single-writer closure loop is designed-but-unbuilt; see [ADR-009](./009-backend-agent_memory_single_writer.md).

---

## Demo vs production

In this demo, `suppliers` and `purchase_orders` are populated from static seed data ingested via MongoDB Compass. They represent the master data a real retailer would have in their ERP — 40 suppliers across 18 countries, active purchase orders with delivery deadlines and order values.

In a production system, these collections would be kept in sync with the ERP via **Debezium CDC** (Change Data Capture). Debezium tails the ERP database transaction log and streams inserts, updates, and deletes into MongoDB in near real-time — no polling, no batch jobs, no custom integration code. The agents always read current operational state without coupling to the ERP directly.

The demo seed data and the production CDC stream produce documents with identical schemas. Switching from seed to live CDC requires no code changes — only infrastructure configuration.

---

## The broader case for ODL

This pattern is worth understanding beyond the demo context, because it addresses a structural problem that slows down innovation in retail and enterprise systems.

ERPs (SAP, Oracle, Microsoft Dynamics) are the systems of record for supplier master data, purchase orders, contracts, and inventory. They are reliable and comprehensive — and they are silos. Their data models are rigid, their APIs are complex, and building new capabilities on top of them directly means coupling every new service to the ERP's schema, release cycle, and performance characteristics.

The ODL breaks that coupling. The ERP remains the system of record — it owns the data, it enforces business rules, it runs the transactional workflows. But via CDC, a curated operational view of that data flows into MongoDB, where it becomes available to new services without touching the ERP directly.

```
ERP (system of record)
    │
    │  Debezium CDC — tails transaction log
    ▼
MongoDB Atlas ODL (operational view)
    │
    ├── risk_evaluator   reads suppliers, purchase_orders
    ├── alternative_finder reads suppliers, supplier_documents
    └── Atlas Charts     reads everything in real time
```

New capabilities — agentic risk evaluation, vector search over supplier documents, real-time dashboards — sit above the ODL, not inside the ERP. They can evolve independently, use modern data patterns (vector search, geospatial queries, TTL indexes), and be replaced or extended without touching the source system.

The ODL is not a replacement for the ERP. It is a decoupling layer that lets innovation happen above a stable operational foundation.

---

## Why this works here

**1. Change Streams replace a message bus.**  
In production, the risk_evaluator doesn't need to be called — it watches `external_conditions` for new inserts via Change Stream. The ingestion_engine writes a document; the Change Stream fires; the risk_evaluator reacts. This is the publish/subscribe pattern without a separate broker. In the demo, the frontend triggers the evaluator explicitly (simpler for demo control), but the production pattern is documented in `stream_listener.py` and [ADR-003](./003-backend-sse-change-stream.md).

**2. TTL indexes handle cleanup automatically.**  
Session-scoped documents expire after 2 hours without any service needing to manage cleanup logic. The store manages its own state lifecycle.

**3. The shared schema is the contract.**  
When the ingestion_engine writes to `external_conditions`, the document structure it writes is the contract the risk_evaluator depends on.

---

## The shared schema problem

The main risk of a shared database is schema coupling: if one service changes the structure of a document, it can silently break all readers. We mitigate this with two practices:

**ODL ownership rule** — only the owning service writes to a collection. Schema changes are always initiated by the owner, never by a consumer. The owner is responsible for backward compatibility or coordinating the migration.

---

## Polymorphic documents

MongoDB's flexible document model is used intentionally in two collections:

**`suppliers`** — CN/TW suppliers carry `tariff_exposure_rating`. Fresh produce suppliers carry `cold_chain_certified`. Audited suppliers carry `sustainability_verified`. Each document carries only the fields that are real for that supplier. Consumers check field presence before using it — no null columns, no empty strings standing in for absent data.

**`external_conditions`** — Signals with a physical location carry `epicentre` (GeoJSON Point) and `impact_radius_km`. Signals without a physical location (e.g. tariff announcements) do not. The `has_physical_location` boolean is the discriminator — consumers branch on it to decide whether to use region matching or geospatial query.

Pydantic models for polymorphic collections use `Optional` fields with the discriminator field required, making the branching logic explicit in code.

---

## What this is not

This is not a Data Warehouse or a Data Lake. The ODL serves live operational queries — agents reading current supplier state to calculate risk scores, checking active certifications, looking up open purchase orders. All data is current and operational, not historical or analytical.

Atlas Charts reads from the same ODL in real time. There is no separate reporting database.

---

## Consequences

**Positive:**
- No service-to-service coupling — each slice is independently deployable in production
- New capabilities can be built above the ODL without touching the ERP
- Change Streams provide reactive activation without a message broker
- TTL indexes handle session cleanup without application logic
- Single source of truth for all operational data, including retrieval context — no separate vector store to keep in sync

**Negative / mitigations:**
- Schema changes require coordination across services → mitigated by Pydantic models in `core/`
- All services share the same Atlas cluster → acceptable for demo; in production, consider dedicated Atlas clusters per service tier with Atlas Data Federation for cross-cluster queries
- CDC adds infrastructure complexity (Debezium, Kafka Connect) → not needed for demo; seed data produces identical schemas

---

## Related ADRs

- [ADR-001](./001-backend-architecture-overview.md) — Vertical Slice Architecture
- [ADR-002](./002-backend-async-motor.md) — Async Motor driver
- [ADR-003](./003-backend-sse-change-stream.md) — SSE + Change Streams (production vs demo activation model)
- [ADR-007](./007-backend-native_reranking.md) — Native in-pipeline reranking (the retrieval capability this single-copy property sustains)
- [ADR-010](./010-backend-direct-driver-not-mcp.md) — Why agents access this same ODL directly, not through a generic tool layer
