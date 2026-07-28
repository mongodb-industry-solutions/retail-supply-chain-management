# Agentic Supplier Management – Real-Time Supply Chain Risk with AI Agents

This README helps developers understand the purpose, structure, and deployment process of this Demo App.

---

## Overview

<table>
  <tr>
    <td width="300">
      <img src="docs/images/overview.png" width="280" alt="Agentic Supplier Management"/>
    </td>
    <td>
      This demo showcases <b>Agentic Supplier Management</b>, built on <b>MongoDB</b> to detect supply chain disruptions in real time and surface alternative suppliers using AI agents.<br><br>
      When an external signal is detected — a geopolitical tariff, a climate event, or a logistics disruption — two LangGraph agents run in sequence: <b>risk_evaluator</b> evaluates supplier risk using dynamic RPN scoring and historical memory retrieved from Atlas Vector Search, and <b>alternative_finder</b> surfaces validated alternative suppliers using in-database hybrid search and native reranking. In the demo both are triggered by explicit frontend actions, not automatically.<br><br>
      MongoDB Atlas serves as the <a href="https://www.mongodb.com/resources/solutions/use-cases/implementing-an-operational-data-layer"><b>Operational Data Layer (ODL)</b></a> — a single platform where operational data, vector embeddings, and agent state all live together. By unifying data storage, search, and AI infrastructure in one place, the demo shows how retailers can build intelligent, agentic supply chain workflows without complex multi-system architectures.
    </td>
  </tr>
</table>

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
  Suppliers, purchase orders, risk catalogs, historical `agent_memory` episodes, and vector embeddings all live in MongoDB Atlas. Atlas Vector Search, `$rankFusion`, native `$rerank`, and `$geoNear` power `alternative_finder`'s in-database candidate search. (Note: the two agents run in-memory per request — there is no LangGraph checkpointer wired in today; see backend ADR-004.)

---

## 🧩 Architecture Overview

![Architecture Overview](docs/images/architecture_overview.png)

| Component | Description |
|-----------|-------------|
| **Frontend (Next.js)** | Full-stack frontend that delivers the step-by-step demo UI, manages session isolation, and streams agent progress in real time. Includes an Atlas Charts dashboard for supply chain visualization. |
| **Backend (FastAPI)** | Cleanly architected as vertical slices — three logical services (`ingestion_engine`, `risk_evaluator`, `alternative_finder`) running as a single FastAPI app for demo simplicity. Slices never import from each other; they integrate only through shared MongoDB collections and the `session_id` / `evaluation_id` identifiers. |
| **`risk_evaluator`** | Real 5-node LangGraph `StateGraph` that detects disruption signals, matches affected suppliers, calculates dynamic RPN scores, runs a ReAct loop to retrieve historical memory, and generates a Claude-powered natural-language summary. |
| **`alternative_finder`** | Human-in-the-loop LangGraph `StateGraph` (4 conceptual layers across 6 nodes) that runs `$rankFusion` hybrid search + native `$rerank`, audits candidates against cited documents and precedent, and ranks them by `$geoNear` proximity and evidence. |
| **MongoDB Atlas** | Operational Data Layer — stores suppliers, purchase orders, risk catalog, `agent_memory`, and the three session-scoped outputs. Atlas Vector Search / `$rankFusion` / native `$rerank` power the in-database search. (No LangGraph checkpoint state is persisted today — the graphs run in-memory.) |

👉 For technical deep dives, see the [Frontend README](./frontend/README.md) and [Backend README](./backend/README.md).

---

## 🗂 Folder Structure

```bash
retail-supply-chain-management/
├── frontend/               # Next.js app
├── backend/                # FastAPI backend (vertical slice architecture)
├── docs/                   # Images, setup and architecture decision records
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

MongoDB Atlas is a powerful **Operational Data Layer (ODL)** for agentic workflows. It eliminates the need for separate vector databases, message queues, or state stores.

### Key Advantages

- **Flexible document model**  
  Model rich supply chain data — suppliers with per-region risk profiles, purchase orders, and risk catalogs — in a single document. No rigid schemas or painful joins.

- **Built-in vector and hybrid search**  
  Atlas Vector Search powers the hybrid search used by `alternative_finder` to find alternative suppliers, combining semantic similarity with full-text matching via `$rankFusion` and narrowing results with a native in-pipeline `$rerank` stage — no separate search infrastructure and no external rerank API call needed.

- **Session isolation without extra infrastructure**  
  Each demo run is scoped by a `session_id` carried on the `X-Session-ID` header and stored on the documents each module writes, so reads and writes never leak between runs. (The LangGraph MongoDB checkpointer described in backend ADR-004 is a designed enhancement, not yet wired in — the graphs currently run in-memory per request.)

- **Data lifecycle and reactive activation**  
  Session-scoped documents are cleaned up on demo reset. A Change-Stream–based activation model for `risk_evaluator` (waking the agent on new signal inserts instead of a frontend call) is documented as a production reference in backend ADR-003, but it is **not implemented** — `stream_listener.py` is a stub and both agents are frontend-triggered today.

- **Simplified architecture**  
  One platform for operational data, search, and AI state. No ETL pipelines between systems, no synchronization lag, no separate vector store to manage.

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
