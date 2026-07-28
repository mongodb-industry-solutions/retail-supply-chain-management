# Agentic Supplier Management – Real-Time Supply Chain Risk with AI Agents

This README helps developers understand the purpose, structure, and deployment process of this Demo App.

---

## Overview

This demo showcases **Agentic Supplier Management** — a working example of how retailers can detect supply chain disruptions in real time and surface alternative suppliers using AI agents, all built on MongoDB.

Retail supply chains are a board-level concern, not a back-office logistics function — a single geopolitical announcement or shipping bottleneck can change supplier costs overnight. Responding fast enough takes a data foundation that moves as quickly as the disruption itself, not a patchwork of legacy ERP tables, a separate vector database, a separate memory store, and disconnected search tools stitched together with custom pipelines.

This is the pattern MongoDB calls a [converged datastore](https://www.mongodb.com/company/blog/technical/converged-datastore-for-agentic-ai) for agentic AI: the business entities an application operates on, the vector embeddings its agents reason over, and the operational state those agents accumulate across sessions all live together under one API, one query language, one security model. This demo is a working, code-verified example of that pattern applied to supplier risk management — not a slide deck version of it.

It also means the agents can reason semantically instead of matching exact fields. Rather than a procurement manager filtering suppliers by attribute, `alternative_finder` takes a flagged supplier's risk profile and searches real contracts, certifications, and historical outcomes to surface an alternative that actually fits the situation — not just one that matches a keyword.

When an external signal is detected — a geopolitical tariff, a climate event, or a logistics disruption — two LangGraph agents run in sequence: **risk_evaluator** evaluates supplier risk using dynamic [RPN scoring](https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis) and historical memory retrieved from Atlas Vector Search, and **alternative_finder** surfaces validated alternative suppliers using in-database hybrid search and native reranking.

![Agentic Supplier Management](docs/images/architecture_overview.png)

---

## Discover in this Demo

- **Real-time disruption signal ingestion**  
  Three signal types — geopolitical tariffs, climate events, and logistics disruptions — are generated per demo session. Signal content varies each run so different suppliers enter alert or critical state, simulating real-world unpredictability.

- **Agentic risk evaluation with RPN scoring**  
  `risk_evaluator` (LangGraph + Claude) detects active conditions, matches affected suppliers (geospatial and region queries), calculates dynamic Risk Priority Number (RPN) scores, runs a ReAct loop that retrieves historical memory from prior incidents via Atlas Vector Search, and generates a natural-language risk summary.

- **AI-powered alternative supplier discovery**  
  `alternative_finder` (LangGraph) is human-in-the-loop. When a procurement manager decides to act on a flagged supplier, it plans a search from that supplier's risk evaluation, narrows candidates entirely inside MongoDB using `$rankFusion` hybrid search and a native `$rerank` stage, audits each candidate against its own cited documents and historical precedent, and ranks the survivors by proximity (`$geoNear`) and evidence coverage. The final approval is always left to the human.

- **Live streaming progress via SSE**  
  Both agents stream step-by-step progress to the frontend in real time using Server-Sent Events — no polling, no page reloads.

- **MongoDB as the unified operational and AI layer**  
  Suppliers, purchase orders, risk catalogs, historical `agent_memory` episodes, and vector embeddings all live in MongoDB Atlas. Atlas Vector Search, `$rankFusion`, native `$rerank`, and `$geoNear` power `alternative_finder`'s in-database candidate search. (Note: the two agents run in-memory per request — there is no LangGraph checkpointer wired in today; see [ADR-004](./docs/adr/004-backend-langgraph-checkpointing.md).)

---

## 🧩 Architecture Overview

> 🚧 **Diagram in progress** — a detailed architecture diagram for this
> section is being prepared. Check back soon.

| Component | Description |
|-----------|-------------|
| **Frontend (Next.js)** | Full-stack frontend that delivers the step-by-step demo UI, manages session isolation, and streams agent progress in real time. Includes an Atlas Charts dashboard for supply chain visualization. |
| **Backend (FastAPI)** | Cleanly architected as vertical slices — three logical services (`ingestion_engine`, `risk_evaluator`, `alternative_finder`) running as a single FastAPI app for demo simplicity. Slices never import from each other; they integrate only through shared MongoDB collections and the `session_id` / `evaluation_id` identifiers. |
| **`risk_evaluator`** | Real 5-node LangGraph `StateGraph` that detects disruption signals, matches affected suppliers, calculates dynamic RPN scores, runs a ReAct loop to retrieve historical memory, and generates a Claude-powered natural-language summary. |
| **`alternative_finder`** | Human-in-the-loop LangGraph `StateGraph` (4 conceptual layers across 6 nodes) that runs `$rankFusion` hybrid search + native `$rerank`, audits candidates against cited documents and precedent, and ranks them by `$geoNear` proximity and evidence. |
| **MongoDB Atlas** | Operational Data Layer — stores suppliers, purchase orders, risk catalog, `agent_memory`, and the three session-scoped outputs. Atlas Vector Search / `$rankFusion` / native `$rerank` power the in-database search. (No LangGraph checkpoint state is persisted today — the graphs run in-memory.) |

👉 For technical deep dives:
- [Frontend README](./frontend/README.md)
- [Backend README](./backend/README.md) — architecture, data model, SSE contracts
- [`ingestion_engine` README](./backend/ingestion_engine/README.md)
- [`risk_evaluator` README](./backend/risk_evaluator/README.md)
- [`alternative_finder` README](./backend/alternative_finder/README.md)
- [Architecture Decision Records](./docs/adr/) — the reasoning behind each design choice, including what's built vs. designed-but-not-yet-implemented
- [Dataset & seed setup](./docs/database-files/) — sample suppliers, orders, risk catalog, and historical memory episodes to populate your own Atlas cluster

---

## 🗂 Folder Structure

```bash
retail-supply-chain-management/
├── frontend/               # Next.js app
├── backend/                # FastAPI backend (vertical slice architecture)
├── docs/
│   ├── adr/                # Architecture Decision Records (backend-tagged; frontend series to follow)
│   ├── database-files/     # Seed data (suppliers, orders, risk catalog, agent memory) + setup guide
│   └── images/              # Diagrams used in this README
├── docker-compose.yml      # Orchestrates services
└── makefile                # Dev commands
```

---

## 🐳 Getting Started – Run the Full Demo Locally

### 🔧 Prerequisites

- [MongoDB Atlas account](https://www.mongodb.com/cloud/atlas/register) (M10 or higher for Vector Search)
- Anthropic API key — used by `risk_evaluator` and `alternative_finder` for their LLM calls (risk summaries, planning, auditing, rationales)
- Voyage AI API key — used by Atlas for `agent_memory` / `supplier_documents` auto-embedding and the native `$rerank` stage in `alternative_finder`
- [Atlas Charts](https://www.mongodb.com/products/charts) dashboard configured with your cluster
- Sample data loaded into your cluster — see [`docs/database-files/`](./docs/database-files/) for the seed files (suppliers, purchase orders, risk catalog, supplier documents, and historical `agent_memory` episodes)
- Environment configuration files (`.env`) for each service, using the example files as a template:
  - [frontend](./frontend/EXAMPLE.env)
  - [backend](./backend/.env.example)
- Installed tools:
  - Docker + Docker Compose
  - Node.js 22 or higher (if running the frontend separately)
  - Python 3.13 + uv (if running the backend separately — [uv install guide](https://docs.astral.sh/uv/getting-started/installation/))

---

### 🚀 Start Locally with Docker Compose

```bash
git clone <repo-url>
cd retail-supply-chain-management
make build
```

> 📝 **Note:** Once running, go to [http://localhost:3000](http://localhost:3000) for the frontend and [http://localhost:8000/docs](http://localhost:8000/docs) for the backend API docs.

#### Common Commands

| Action                  | Command      |
|-------------------------|--------------|
| Build & start           | `make build` |
| Start (no rebuild)      | `make start` |
| Stop all containers     | `make stop`  |
| Clean containers/images | `make clean` |

---

## 👨‍💻 Explore the Demo

The demo is structured as a step-by-step procurement workflow:

1. **Dashboard** — Atlas Charts visualization of your supply chain data
2. **Start simulation** — ingest disruption signals (geopolitical, climate, logistics)
3. **Evaluate risk** — `risk_evaluator` scores all suppliers and streams its reasoning live
4. **Act on flagged suppliers** — `alternative_finder` finds and validates alternatives on demand

Each session is fully isolated by a `session_id` generated in the browser — no state leaks between runs.

---

## 🍃 Why MongoDB for Agentic Supply Chain Management

Retail supply chains are a board-level concern, not a back-office logistics function — a single geopolitical announcement or shipping bottleneck can change supplier costs overnight. Responding fast enough requires a data foundation that moves as quickly as the disruption itself, not a patchwork of legacy ERP tables, a separate vector database, a separate memory store, and disconnected search tools stitched together with custom pipelines.

This is the industry pattern MongoDB calls a [converged datastore](https://www.mongodb.com/company/blog/technical/converged-datastore-for-agentic-ai) for agentic AI: the business entities an application operates on, the vector embeddings its agents reason over, and the operational state those agents accumulate across sessions all live together under one API, one query language, one security model. This demo is a working, code-verified example of that pattern applied to supplier risk management.

### Key Advantages — demonstrated in this repo today

- **Flexible document model for supplier data that varies by region**  
  A supplier in Shenzhen carries `tariff_exposure_rating`; a fresh-produce supplier in Mexico carries `cold_chain_certified`. Both live in the same `suppliers` collection — no rigid shared schema, no sparse columns, no joins to assemble a full supplier profile.

- **Semantic discovery, not keyword matching**  
  `alternative_finder` narrows candidates using `$rankFusion` (combining vector similarity and full-text search) and Atlas's native `$rerank` stage — entirely inside the aggregation pipeline, so no document ever leaves Atlas to be reranked by an external service. This is what lets the agent surface a supplier whose profile is *semantically* close to what the risk context calls for, not just one that matches an exact filter.

- **Agent memory as operational data, not a bolted-on store**  
  `agent_memory` holds past disruption episodes and is queried via `$vectorSearch` by both agents — `risk_evaluator` to weight its RPN score, `alternative_finder` to check precedent on a candidate — in the same collection model, same query language, same cluster as every other operational document. No separate memory service, no synchronization between two systems to keep consistent.

- **Session isolation without extra infrastructure**  
  Each demo run is scoped by a `session_id` carried on the `X-Session-ID` header and stored on every document each module writes — no Redis, no separate session store.

### Where this demo shows the target architecture, not (yet) the running one

Being transparent here is itself part of what this repo is meant to teach — a real, MongoDB-native agentic system, and the honest gap between its design and its current implementation:

- **Agent state persistence.** The converged-datastore pattern extends to the agent's own runtime state — LangGraph's MongoDB checkpointer (`thread_id = session_id`) would give each run resumable, replayable state stored in Atlas, alongside everything else. **Not implemented today** — both graphs run in-memory per request. See [ADR-004](./docs/adr/004-backend-langgraph-checkpointing.md).
- **Reactive activation via Change Streams.** The design calls for `risk_evaluator` to wake up automatically on a Change Stream watching for new disruption signals, instead of waiting for an explicit frontend call — matching how a real ERP integration would trigger it. **Not implemented today** — `stream_listener.py` is a stub; both agents are frontend-triggered. See [ADR-003](./docs/adr/003-backend-sse-change-stream.md).
- **A self-sustaining memory loop.** The converged-datastore promise for agent memory is that it compounds over time from real outcomes, not just seed data. The design calls for a single dedicated process that writes real disruption *outcomes* back into `agent_memory` as they resolve. **Not implemented today** — `agent_memory` is 100% read-only across the codebase, populated only by hand-curated seed episodes. See [ADR-009](./docs/adr/009-backend-agent_memory_single_writer.md).

Each of these is a natural next step for this platform, and each is deliberately documented as a design decision rather than left implicit — the [ADRs](./docs/adr/) are where to look for the full reasoning, tradeoffs, and what it would take to close each gap.

---

## 👥 Authors

### Lead Authors *(Use Case Ideation & Retail Implementation)*

- [**Ronan Conlon**](https://www.linkedin.com/in/ronan-conlon/) – Principal. Retail CTO

### Developers & Maintainers *(Technical Design & Implementation)*

- [**Florencia Arin**](https://www.linkedin.com/in/floarin/) – Developer & Maintainer
- [**Angie Guemes**](https://www.linkedin.com/in/angelica-guemes-estrada/) – Developer & Maintainer

---

## MIT License

Copyright (c) 2025 MongoDB

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
