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

- **Watch the agents work, not just their output**
  The UI streams every step live: which supplier the agent is looking at, which MongoDB operation it just ran — a vector search, a geospatial query, a rerank — and what it found. You see the agent's reasoning and the real data behind it side by side, not just a final answer.

- **`risk_evaluator` — real risk math over simulated signals**
  LangGraph + Claude. Detects the session's disruption signals (simulated for the demo, but structurally identical to a real feed), matches exposed suppliers with geospatial (`$geoWithin`) and region queries, scores dynamic RPN risk, and runs a ReAct loop that retrieves historical memory via Atlas Vector Search before writing a natural-language summary.

- **`alternative_finder` — every kind of search MongoDB can do, chained together**
  LangGraph. Narrows candidates with `$rankFusion` hybrid search (vector + full-text), reranks natively in-pipeline with `$rerank`, cross-checks each candidate against its own cited documents and historical precedent, then ranks survivors by `$geoNear` proximity. Human-in-the-loop: the final pick is always the procurement manager's call.

- **One dataset, every collection type in play**
  Suppliers, purchase orders, a risk catalog, supplier documents, and historical `agent_memory` episodes all live in [`docs/database-files/`](./docs/database-files/) — real enough to run the full demo end to end, or swap in your own data and watch the same agents respond to it.

### MongoDB Atlas capabilities used in this demo

1. [`$vectorSearch`](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/) — semantic search over `agent_memory` (risk precedent) and `supplier_documents` (certifications, contracts), with Atlas Auto-Embedding — no separate embedding pipeline to maintain.
2. [`$rankFusion`](https://www.mongodb.com/docs/atlas/atlas-vector-search/hybrid-search/) — hybrid search in `alternative_finder`, combining vector similarity and full-text relevance into a single ranked result.
3. [Native `$rerank`](https://www.mongodb.com/docs/vector-search/hybrid-search/vector-search-with-full-text-search/) — Voyage's reranking model running as an aggregation stage inside Atlas; candidates are never pulled out to an external API to be reranked.
4. [`$search`](https://www.mongodb.com/docs/atlas/atlas-search/) — full-text search over `supplier_documents` chunks, the lexical half of the hybrid search.
5. [`$geoWithin` / `$centerSphere`](https://www.mongodb.com/docs/manual/geospatial-queries/) — geospatial matching in `risk_evaluator`, so a physical disruption (a storm, a port closure) only affects suppliers actually within its radius.
6. [`$geoNear`](https://www.mongodb.com/docs/manual/reference/operator/aggregation/geoNear/) — proximity ranking in `alternative_finder`, factoring distance-to-distribution-center into how alternative suppliers are ranked.
7. [Aggregation pipelines](https://www.mongodb.com/docs/manual/aggregation/) — used throughout for operational context (e.g. active purchase orders per supplier) alongside the search stages above.
8. [2dsphere index](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-geospatial/) — powers the geospatial queries on `suppliers.location`.
9. [Compound indexes](https://www.mongodb.com/docs/manual/core/index-compound/) — e.g. `supplier_id + risk_type` on `agent_memory`, keeping precedent lookups fast as the collection grows.
10. **Session cleanup** — demo-session data in `external_conditions` needs periodic cleanup; either a [TTL index](https://www.mongodb.com/docs/manual/core/index-ttl/) or an [Atlas Scheduled Trigger](https://www.mongodb.com/docs/atlas/atlas-ui/triggers/) can implement this — a good example of MongoDB giving you more than one way to solve the same operational need.


---

## 🧩 Architecture Overview

![Architecture Overview](docs/images/architecture_detailed.jpg)

| Component | Description |
|-----------|-------------|
| **Frontend (Next.js)** | Full-stack frontend that delivers the step-by-step demo UI, manages session isolation, and streams agent progress in real time. Includes an Atlas Charts dashboard for supply chain visualization. |
| **Backend (FastAPI)** | Cleanly architected as vertical slices — three logical services (`ingestion_engine`, `risk_evaluator`, `alternative_finder`) running as a single FastAPI app for demo simplicity. Slices never import from each other; they integrate only through shared MongoDB collections and the `session_id` / `evaluation_id` identifiers. |
| **`ingestion_engine`** | Not an agent — fully deterministic. Picks up to 3 suppliers with active orders, matches them to a base disruption signal, and calibrates a `condition_score` (reading `agent_memory` for a historical weighting factor) to guarantee at least one supplier reaches CRITICAL each session. |
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

Agentic AI workloads break assumptions most data platforms were never built for. MongoDB frames it as an industry-wide shift: databases went from systems of record, to systems of engagement, and agentic AI is now pushing them toward systems of action — agents that execute and decide, not just retrieve ([MongoDB, "The Unified Intelligence Layer: Powering the Agentic Era"](https://www.mongodb.com/resources/industries/database-digest-2026-edition/unified-intelligence-layer)). That shift multiplies complexity: an agent reasons in a loop, hitting vector search, full-text search, and geospatial queries dozens of times a session, against data that has to evolve as fast as the business does. MongoDB's advantage for this new class of workload comes down to five things:

### 1. One consolidated data platform
Agentic systems need operational data, vector embeddings, full-text search, and reranking to all be queryable together — an agent reasoning across a disruption doesn't have time to round-trip between four different systems to assemble context. This is what MongoDB calls a ["converged datastore" for agentic AI](https://www.mongodb.com/company/blog/technical/converged-datastore-for-agentic-ai): the core business entities, the vector embeddings agents reason over, and the live operational state agents accumulate across sessions all live under one API, one query language, and one security model. MongoDB is the only platform that unifies all of it — database, vector store, search engine, and reranker — in one place, queried through a single aggregation pipeline: `$rankFusion` merges semantic and keyword retrieval ([MongoDB Blog, "Harness the Power of Atlas Search and Vector Search with $rankFusion"](https://www.mongodb.com/company/blog/technical/harness-power-atlas-search-vector-search-with-rankfusion)), and native `$rerank` — currently in public preview, powered by Voyage AI — runs as a stage in that same pipeline, improving retrieval accuracy by an average of ~24% over full-text search and ~11% over vector search alone, with no data leaving Atlas ([MongoDB, "New in MongoDB"](https://www.mongodb.com/products/updates/)). This demo's `alternative_finder` aims to prove that end to end — aunque, como está señalado en las notas de diseño, el reranking nativo de Voyage todavía no está configurado/probado en este proyecto puntual, así que ese punto queda "pendiente de configurar" hasta que se confirme contra Atlas.

### 2. Architecturally built for AI
Agentic workloads deal with messy, evolving, real-world entities — suppliers, contracts, incidents — that don't fit a fixed relational shape and never stop changing. A flexible, document-native schema lets that data evolve at the pace of the business, not the pace of a migration ([MongoDB, Document Databases](https://www.mongodb.com/resources/basics/databases/document-databases)).

### 3. Trustworthy, secure, and governed by default
An autonomous agent making decisions over sensitive operational data raises the stakes on security, not just the convenience. Security and governance controls what an agent is permitted to do, on whose authority it acts, and what record is produced of its actions — identity propagation, permission scoping, and auditability are exactly where most enterprise agent projects stall before production ([MongoDB Blog, "The Agent Harness: Why the LLM Is the Smallest Part of Your Agent System"](https://www.mongodb.com/company/blog/technical/agent-harness-why-llm-is-smallest-part-of-your-agent-system)). Nothing about agentic AI matters if the platform underneath it can't be trusted — encryption, access control, and governance need to be defaults built into the platform, not something bolted on after an agent is already querying live data ([MongoDB Blog, "Security in the Age of AI"](https://www.mongodb.com/company/blog/innovation/security-in-the-age-of-ai); [MongoDB Newsroom, "MongoDB Delivers Accurate AI Retrieval Wherever Enterprise Data Lives"](https://www.mongodb.com/company/newsroom/press-releases/mongodb-delivers-accurate-ai-retrieval-wherever-enterprise-data-lives)).

### 4. Build once, run anywhere
As agentic workloads scale, hyperscaler capacity itself is becoming a real constraint — not just a preference. An agentic platform locked to a single cloud provider doesn't scale with the business if that provider runs short on capacity. Being multi-cloud in MongoDB means the same document model and query API run unchanged across AWS, Azure, GCP, and on-prem ([MongoDB Blog, "Introducing Multi-Cloud Clusters on MongoDB Atlas"](https://www.mongodb.com/company/blog/product-release-announcements/introducing-multicloud-clusters-on-mongodb-atlas); [MongoDB Docs, Multi-Cloud Deployment Paradigm](https://www.mongodb.com/docs/atlas/architecture/current/deployment-paradigms/multi-cloud/)) — that constraint never becomes the application's problem. That's what build once, run anywhere actually means in practice.

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
