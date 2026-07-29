# ADR-009: `agent_memory` Single-Writer Closure-Loop Architecture

**Status:** Proposed — **designed, not yet implemented.** This ADR records the intended architecture for how `agent_memory` should be populated. No part of it runs in code today; see **Current implementation status**.

## Context

`agent_memory` is the collection that gives the demo its "this has happened
before" capability. Both `risk_evaluator` and `alternative_finder` read it
for historical precedent:

- `risk_evaluator` runs `$vectorSearch` over `agent_memory` (per-supplier and
  cross-supplier by `risk_type`) inside its ReAct loop to derive a
  `historical_weight` per supplier.
- `alternative_finder` reads it two ways during Reflect & Critique: an exact
  `find` on `episode.resolution.alt_supplier_id` (has this candidate been
  proposed before?) and a cross-supplier `$vectorSearch` by `risk_type`
  (semantic precedent). See ADR-008.

For these reads to carry real signal over time, *something* has to write
episodes back into `agent_memory` as real disruptions play out and get
resolved. The question this ADR answers is **who is allowed to write to
`agent_memory`, and when.**

The risk with a memory collection that multiple agents can write to is
incoherent, self-reinforcing memory: an agent writes a speculative episode
mid-run, then reads it back (or another agent reads it) as if it were a
confirmed outcome, and the system starts trusting its own guesses. Precedent
must reflect what *actually happened*, not what an agent predicted would
happen.

## Decision

`agent_memory` has **exactly one writer**, and it writes only **closure /
outcome episodes** — records created *after* a disruption has resolved and
its real impact is known. This is the ODL single-owner rule of ADR-005
applied to the memory collection.

The intended shape:

- **Single writer.** A dedicated closure process (not the live evaluation or
  sourcing graphs) owns all writes to `agent_memory`. The `risk_evaluator`
  and `alternative_finder` graphs remain **read-only** consumers of it —
  they never write episodes they might later read.
- **Closure episodes only.** An episode is written when an outcome is known:
  whether the risk actually occurred, the realized delay/cost, the action
  taken, and (for a sourcing decision) which alternative was proposed and how
  it worked out (`episode.resolution.alt_supplier_id`, `episode.resolution.outcome`).
- **Trigger.** In the intended design this closure process is activated when
  a human resolves/closes an evaluation or an approved alternative reaches a
  terminal state — e.g. a scheduled job or a Change Stream on the approval
  collection — mirroring the reactive activation pattern of ADR-003.
- **Read/write separation preserves trust.** Because only settled outcomes
  are ever written, every read against `agent_memory` returns confirmed
  precedent, never an in-flight agent's speculation.

This closes the loop: signals come in → risk is evaluated → alternatives are
sourced and (optionally) approved → the real outcome is recorded back into
`agent_memory` → future evaluations read that outcome as precedent.

## Current implementation status

**None of the above is built. `agent_memory` is 100% read-only across the
entire codebase today.**

- A repository-wide search confirms **no `insert`, `update`, `replace`, or
  any other write against `agent_memory` anywhere** in `ingestion_engine`,
  `risk_evaluator`, or `alternative_finder`. The only three writes in the
  backend are `ingestion_engine → external_conditions`,
  `risk_evaluator → supplier_risk_evaluations`, and
  `alternative_finder → supplier_alternatives`.
- There is **no closure process** in the repo: no scheduled job, no cron, no
  Change Stream, and no trigger that produces outcome episodes. (The only
  Change Stream reference in the codebase is `stream_listener.py`, a stub —
  see ADR-003 — and it is about activating `risk_evaluator`, not writing
  memory.)
- `agent_memory` is currently populated **only by hand-curated seed data**
  (a small set of episodes loaded out-of-band). This is why
  `alternative_finder`'s exact-track-record lookup returns `found: false` for
  most candidates in most runs today — and, more fundamentally, **no code
  path in this repo ever produces a document with the
  `episode.resolution.alt_supplier_id` shape that lookup depends on**, so
  that signal is structurally empty until either the closure loop is built or
  such episodes are seeded.

## Consequences

- The precedent *reads* in `risk_evaluator` and `alternative_finder` are real
  and run against live Atlas, but the *quality and volume* of what they can
  surface is bounded by the seed data until this closure loop exists.
- Building this loop is the natural next step to make the memory capability
  self-sustaining. It requires: a closure trigger, the single-writer process,
  and an episode schema for outcomes — none of which exist yet.
- Keeping the live graphs read-only (as they are today) is consistent with
  this design, so no rework of the existing modules is needed to adopt it —
  only the addition of the writer.

## Related ADRs

- ADR-005 — Operational Data Layer (single-owner-per-collection rule)
- ADR-003 — SSE + Change Streams (the reactive activation pattern a closure trigger would use)
- ADR-008 — Two separate precedent signals (the reads this collection feeds)
