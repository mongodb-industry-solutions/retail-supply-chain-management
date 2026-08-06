# ADR-009: `agent_memory` — Precedent Reads Now, Closure-Loop Write Deferred by Design


## Decision

`agent_memory` is read-only in this demo, on purpose, not by omission. Both
read paths — `risk_evaluator`'s `historical_weight` lookup and
`alternative_finder`'s exact/semantic precedent checks ([ADR-008](./008-backend-precedent_signals_no_fusion.md)) — run
against a fixed, hand-curated set of 25 episodes. No code in this repo writes
to `agent_memory`, and this ADR does not propose building that writer as part
of the demo.

What we *are* designing, and recording here as the target architecture for a
real deployment, is a single-writer closure process: one job, triggered when
a disruption's outcome becomes known, writing settled episodes
(`episode.resolution.alt_supplier_id`, `episode.resolution.outcome`,
`actual_impact`) — never a live agent writing its own speculation back into
the collection it reads for precedent. 

## Context

Every demo run needs `agent_memory` to already contain believable precedent
— that's what makes `historical_weight` and the Reflect & Critique precedent
checks show real agent behavior instead of an empty lookup. A closure loop
that writes episodes only after a disruption resolves is the correct
long-term design ([ADR-005](./005-backend-operational-data-layer.md)'s single-owner rule, applied here), but it has a
property that matters specifically for a demo: **it needs real elapsed time
between "risk detected" and "outcome known."** A purchase order's actual
delivery outcome, or whether an approved alternative supplier actually
performed, isn't knowable synchronously — it plays out over days or weeks
against a real ERP.

Building that loop now, correctly, would mean modeling ERP settlement signals
that don't exist in this project (`purchase_orders` has no real delivery
confirmation field today), and it would produce, at best, one or two
organically-written episodes over the life of a demo — not the volume needed
to demonstrate `historical_weight` or cross-supplier precedent convincingly.
That's the overengineering risk this ADR is naming explicitly: a technically
correct closure job that, in a demo timeframe, writes less useful memory than
a seed already does, while adding a scheduled job, a trigger, and a new
schema surface to maintain.

## Why this scope, for a demo

The thing worth demonstrating is the **read side**: an agent reasoning over
real historical precedent via `$vectorSearch`, weighing recency and
specificity, distinguishing a confirmed outcome from an untested one (both
patterns already documented in the `alternative_finder` design doc). None of
that requires the precedent to have been produced by a live writer — it only
requires the precedent to be realistic, varied, and stored the same way a
real episode would be. A hand-curated seed satisfies that; a partially-built
closure job that fires rarely and asynchronously would not visibly change
what the demo shows, at real engineering cost.


## Demo operating reality (what stands in for the writer today)

Two things maintain `agent_memory` today, neither of which is the closure
process described below — both are demo infrastructure, not product logic:

1. **A hand-curated seed of 25 episodes** (`origin: "seed_curated"`),
   covering all 3 `risk_type` values with a deliberate mix of
   `occurred: true/false` outcomes. Every episode also carries
   `is_base: true` / `session_id: null`, the same scoping fields
   `external_conditions` uses. These two fields are a carryover from an
   earlier idea, before this ADR's scope decision, that `agent_memory`
   might need to vary per session — once the design settled on serving
   every session against the same fixed, curated set of episodes (see Why
   this scope), per-session memory scoping had nothing left to do. Neither
   field is read by `risk_evaluator` or `alternative_finder` today .

2. **A weekly Atlas Scheduled Trigger (`refresh_agent_memory_dates`)** that
   recomputes each episode's `recorded_at` from a fixed relative age
   (`today − age_days`), so precedent doesn't visibly age into staleness
   between demo sessions. It never adds, removes, or resolves an episode —
   it only keeps the existing 25 looking recent. Its own documentation
   scopes it explicitly as demo maintenance, not product behavior: no
   backend module depends on it to run correctly.

Reading `agent_memory` today always resolves against this same fixed set of
25 episodes — real documents, real `$vectorSearch` results, just not
produced by the write path this ADR designs for later.

## Target write architecture (design record, not built)

For a real deployment, `agent_memory` should have exactly one writer, and it
should write only closure episodes — records created once a disruption's
outcome is confirmed:

- **Single writer.** A dedicated closure process owns all writes.
  `risk_evaluator` and `alternative_finder` stay read-only permanently, not
  just until this is built — an agent should never read back its own
  speculation as if it were confirmed precedent.
- **Trigger.** Activated when a human resolves an evaluation or an approved
  alternative reaches a terminal state — a scheduled job or a Change Stream
  on the approval collection, mirroring [ADR-003](./003-backend-sse-change-stream.md)'s reactive activation
  pattern.
- **Content.** `actual_impact` (did the risk occur, real delay/cost) and,
  for sourcing decisions, `episode.resolution.alt_supplier_id` /
  `.outcome` — the exact fields the seed already models, so adopting this
  later requires no shape change to existing episodes.

## Consequences

- Precedent reads in both agents are real Atlas queries over real documents
  — nothing about the demo's read-side behavior is simulated.
- The volume and diversity of precedent is bounded by the seed (25
  episodes) rather than by real usage, which is an accepted and named
  limitation, not a hidden one.
- Adopting the target write architecture later requires no rework of
  `risk_evaluator` or `alternative_finder` — they're already read-only —
  only adding the writer and, separately, deciding what to do with the
  seed once real episodes start accumulating alongside it.



## Related ADRs

- [ADR-005](./005-backend-operational-data-layer.md) — Operational Data Layer (single-owner-per-collection rule)
- [ADR-004](./004-backend-langgraph-checkpointing.md) — Scope discipline for demo vs. production (same "build what
  changes what a viewer sees" criterion)
- [ADR-003](./003-backend-sse-change-stream.md) — SSE + Change Streams (the activation pattern a future closure
  trigger would reuse)
- [ADR-008](./008-backend-precedent_signals_no_fusion.md) — Two separate precedent signals (the reads this collection feeds)