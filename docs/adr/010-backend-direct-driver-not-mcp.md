# ADR-010: Backend Agents Access Atlas via Direct Driver, Not MCP

**Status:** Accepted

## Decision

None of the three backend modules — `ingestion_engine`, `risk_evaluator`,
`alternative_finder` — access MongoDB Atlas through an MCP server. All Atlas
access is a direct driver call (motor/pymongo) inside hand-written, narrowly
scoped functions exposed as LangGraph tools (`search_supplier_memory`,
`search_combined_episodes`, `get_order_detail`, the Layer 1 `$rankFusion`/
`$rerank` pipeline, `$geoNear` in Layer 3). This ADR fixes that as the
backend's permanent data-access pattern, not an interim state pending an MCP
migration.

Whether an MCP server has a role in *this project* at all — specifically, as
a developer/operator tool for inspecting Atlas directly during design and
debugging sessions — is a separate question this ADR does not answer. See
**Out of scope** below.

## Context

MCP standardizes tool access across AI *clients* that don't share a backend
— the same Mongo tool can be reused by Claude Desktop, Claude Code, Claude.ai,
or a third-party host without reimplementing it for each. That problem does
not exist here: each of the three modules already owns a persistent Atlas
connection inside its own process. Routing that connection through an MCP
server would insert a protocol hop and a generic tool surface between a
LangGraph node and a database call it can already make directly.

The more specific reason is architectural, not just about latency. A generic
MCP-exposed Mongo tool set (`find`, `aggregate`, `listCollections`, etc.)
hands the LLM the ability to construct its own query or aggregation pipeline
at call time. This backend's central design claim — documented in
[ADR-007](./007-backend-native_reranking.md) — is the opposite: at
the one layer where the biggest token reduction happens
(`alternative_finder` Layer 1: `$rankFusion` + native `$rerank`, 146 chunks →
5), the database narrowed the candidate set, *not a prompt*. That guarantee
depends on the pipeline being fixed code the LLM never sees or constructs. A
generic query/aggregate tool available to the LLM would let it bypass or
reshape that pipeline, undermining the exact property the module exists to
demonstrate.

The same reasoning extends to `risk_evaluator`'s ReAct loop: its three tools
are deliberately narrow signatures (`supplier_ids`, `risk_type`) over fixed
queries, not an open `aggregate` call. The LLM decides *when* to call which
tool, never *what query* to run — the query is always determined by code,
parameterized by the LLM's arguments.

## Alternatives Considered

- **Expose Atlas to the agents through an MCP server with generic
  `find`/`aggregate` tools.** Rejected: it moves query construction from
  fixed code into LLM-decided territory at exactly the layer (Layer 1's
  `$rankFusion`/`$rerank` funnel) whose entire justification is that the
  narrowing is deterministic and database-side, not agent-side. It also
  provides no benefit here, since there is no second AI client that needs
  to reuse these tools outside this backend's own LangGraph processes.
- **Expose only the existing narrow tools (`search_supplier_memory`, etc.)
  through an MCP server, keeping their signatures unchanged.** Rejected as
  unnecessary complexity: this would preserve every constraint of the
  current design while adding a network hop and a second service to
  operate, for no capability the direct driver call doesn't already
  provide within the same process.

## Consequences

- Adding a new Atlas-backed tool to any module means writing a new
  narrow function and registering it as a LangGraph tool, not configuring
  an MCP server — consistent with, and no heavier than, the current
  pattern.
- If a future requirement needs the *same* Atlas tool reused by a genuinely
  separate AI client (not part of this backend), that would be a real
  argument to revisit this decision — it isn't a case that exists today.

## Out of scope — developer-facing Atlas access

Separately from the agents' own architecture, this project's design and
debugging work has repeatedly needed to verify live Atlas state (episode
counts in `agent_memory`, seed-vs-Atlas drift) against static seed exports
uploaded by hand, rather than a live query. Whether a MongoDB MCP server,
connected to a development tool (e.g. Claude Code), should be used for that
verification workflow is a legitimate, separate question — it concerns
tooling for the people building this project, not the product's runtime
architecture, and this ADR takes no position on it.

## Related ADRs

- [ADR-007](./007-backend-native_reranking.md) — Native in-pipeline reranking
  (the deterministic funnel this decision protects)
