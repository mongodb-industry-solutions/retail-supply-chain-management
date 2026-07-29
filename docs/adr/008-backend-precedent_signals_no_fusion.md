# ADR-008: Memory Precedent Is Two Separate Signals, Never Fused Into One Score

**Status:** Accepted (2026-07-07)

## Context

When auditing a candidate alternative supplier, `agent_memory` can offer
two structurally different kinds of precedent:

1. **Exact track record** — this specific candidate was literally proposed
   as an alternative before, and there's a recorded outcome
   (`episode.resolution.alt_supplier_id` matches). This is direct evidence
   about this candidate.
2. **Semantic precedent** — a *different* supplier faced a similar kind of
   risk before (matched by `risk_type` via `$vectorSearch` over
   `auto_embed_text`), and that episode's outcome offers *directional*
   context about how this class of situation tends to play out. This is
   not evidence about the current candidate specifically.

It would be technically easy to collapse these into a single "confidence"
or "reliability" number and hand the frontend one score. Early UI mockups
(pre-dating this rebuild) implied exactly this kind of single score
(`Reliability: 94%`).

## Decision

`alternative_finder` keeps these as two permanently separate objects
throughout the system — in the `candidate_audited` and `shortlist_ready`
event payloads (`precedent.exact_track_record` and
`precedent.semantic_precedent`), and in the persisted
`supplier_alternatives` document. They are never averaged, weighted
together, or reduced to one numeric confidence score anywhere in the
pipeline. A `precedent_summary` presentation token does exist on the
shortlist (`"exact_track_record"` > `"<strength>_directional"` > `"none"`),
but it is a display-only label built with an explicit precedence rule, not
a merged score — the full, unmerged objects always ride alongside it.

Verified live: `exact_track_record.found: true` and
`semantic_precedent.found: true` fire independently, via two separate real
Mongo operations (`find` on `episode.resolution.alt_supplier_id`, and
`$vectorSearch` filtered by `risk_type`), and a candidate can have either,
both, or neither.

## Consequences

- A manager reading a candidate's audit sees, explicitly, whether a
  supplier was *literally proposed before with a known outcome* versus
  whether the system is *inferring from a different supplier's similar
  situation*. These carry very different evidentiary weight, and
  collapsing them into one number would hide that difference.
- This makes some demo runs look "thinner" than a single-score design
  would — e.g. a candidate with only a weak `semantic_precedent` shows
  visibly less certainty than one with a real `exact_track_record` hit,
  rather than both being smoothed into a similar-looking score. This is
  intentional honesty, not a shortcoming to fix.
- Because `agent_memory` currently holds only 5 hand-curated episodes
  (deliberately never fabricated per-session — see the existing
  `agent_memory` architecture ADR/design notes), `exact_track_record` will
  show `found: false` for most candidates in most demo runs today. This is
  a data-volume limitation to address in a future data-enrichment pass,
  not a reason to abandon the two-signal design.

## Alternatives Considered

- **Single fused "confidence" score** combining both signals with some
  weighting scheme. Rejected: no principled weighting between "this exact
  thing happened before" and "something similar happened to someone else"
  exists, and forcing one invites exactly the kind of fabricated-looking
  precision (`Reliability: 94%`) this rebuild moved away from.
- **Only exact track record, drop semantic precedent entirely.** Rejected:
  with only 5 episodes in `agent_memory`, exact matches will be rare for
  the foreseeable future; semantic precedent is the only precedent signal
  most candidates will ever surface, and it has real value as long as its
  directional, non-candidate-specific nature is kept visible.
