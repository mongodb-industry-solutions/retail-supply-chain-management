# ADR-007: Native In-Pipeline Reranking (`$rerank`) Instead of an External Voyage API Call

**Status:** Accepted (2026-07-07)

## Context

The Deterministic Funnel layer needs to narrow a `$rankFusion`-produced set
of candidate document chunks down to a small, well-ranked set of supplier
candidates. Two ways to do this were available:

1. Fetch the fused candidates in application code, then call Voyage AI's
   reranking model via an external HTTP request (the `voyageai` Python
   SDK), the same way the pre-rebuild `backend/voyageai/rerank.py` stub's
   docstring *claimed* to work (its actual code just sliced the list —
   confirmed non-functional by the 2026-07-03 audit; the stub has since
   been deleted).
2. Use MongoDB Atlas's native `$rerank` aggregation stage, which runs the
   reranking model call as part of the same aggregation pipeline, without
   the application ever handling the raw candidate documents or making a
   separate network call.

Native reranking was, at the start of this rebuild, an unverified
capability for this project — explicitly flagged in every design document
as "not yet configured or tested." It required real infrastructure changes
to activate: the "Native Reranking: `$rerank` Aggregation Stage" project
setting had to be enabled in Atlas, and a project-level Voyage Model API
key had to be created — both one-time, manual, project-level Atlas
configuration steps, not something achievable from application code alone.

## Decision

Use the native `$rerank` aggregation stage, chained directly after
`$rankFusion` in the same `supplier_documents` aggregation pipeline:

```
$match (pre-filter) → $rankFusion ($vectorSearch + $search) → $rerank (native Voyage) → dedupe to top-N suppliers
```

This was confirmed working live on 2026-07-07 after enabling the two Atlas
project-level settings above. Verified spec:
```json
{ "$rerank": { "query": { "text": "<profile_text>" }, "path": "chunk_text",
                "model": "rerank-2.5", "numDocsToRerank": <n> } }
```
Relevance score is read via `{"$meta": "score"}` (not `relevanceScore` or
`rerankScore`, which several early drafts assumed).

## Consequences

- The candidate-narrowing step (dozens of documents down to the shortlist)
  never leaves MongoDB Atlas. The application only ever sees the final
  reranked result — no raw document payloads round-trip through the
  backend just to be reranked and thrown away.
- This is a **Preview** feature per MongoDB's own documentation, subject to
  change and not recommended for production use as-is. Model inference for
  `$rerank` runs on MongoDB's infrastructure in a GCP US region regardless
  of the cluster's own region — a data-processing-location fact worth
  knowing for any future data-residency conversation, though it did not
  block this demo.
- This decision has a real, non-code dependency: any new Atlas
  project/environment this module is deployed to will need the same two
  manual steps repeated (enable the Native Reranking project setting,
  create a project-level Voyage Model API key) before `$rerank` will work.
  This is not something a code deploy alone can satisfy.
- The `rerank-2.5` model choice, the `$rankFusion` combination weights
  (`{vector: 0.7, text: 0.3}`), and the target candidate count (5) are
  documented as judgment calls in `alternative_finder/README.md`, not
  fixed by any prior design document — they may warrant tuning as real
  usage data accumulates.

## Alternatives Considered

- **External Voyage API call from application code**, mirroring what the
  stub's docstring falsely claimed. Rejected: it defeats the specific
  point this demo makes about MongoDB's own retrieval/ranking
  capabilities — "the database narrowed this, not a prompt or an external
  service" is a deliberate part of the narrative this module demonstrates.

  Beyond the narrative, the external-call path was worse on three concrete
  counts. It moves data for no reason: every fused candidate chunk would have
  to be pulled out of Atlas into the backend, serialized to Voyage over the
  network, and then discarded once the shortlist came back — paying two extra
  network hops and the full candidate payload to produce a result the database
  can compute in place. It adds a second failure domain and a second set of
  credentials: an application-held `VOYAGE_API_KEY`, its own rate limits,
  timeouts, and retry logic, all of which the native stage folds into the
  single aggregation call the pipeline already makes. And it splits the
  ranking logic across two systems — `$rankFusion` weights in the pipeline,
  rerank parameters in Python — so tuning retrieval would mean reasoning about
  two places that must stay in sync. The native stage keeps the entire
  narrowing decision expressible as one pipeline that can be read, explained,
  and tuned as a unit. The tradeoff accepted in exchange is the Preview status
  and the manual Atlas project-level setup documented above.
- **No reranking step at all** (ship candidates straight from
  `$rankFusion`'s fused order). Considered as a fallback if the native
  stage had turned out to be unavailable on this cluster/project — it
  wasn't needed, since enabling the Atlas project setting resolved the
  blocker, but it remains documented as the fallback path if native
  reranking is ever disabled or unavailable in a future environment.
