# Database Reference — Retail Supply Chain Risk Management Demo

This folder contains reference/sample data for a MongoDB Atlas demo that
models supply-chain risk detection and mitigation for a retail business.
Three backend modules operate on this data:

- **`ingestion_engine`** — simulates real-world signals (tariffs, storms,
  port delays) that create risk conditions.
- **`risk_evaluator`** — scores supplier risk exposure (RPN — Risk
  Priority Number) using those conditions plus historical precedent.
- **`alternative_finder`** — searches for and evaluates alternative
  suppliers when a risk evaluation calls for one.

Each JSON file in this folder is a direct export of one MongoDB collection
from the `retail-supply-chain-risk` database. `triggers_optional.md`
documents optional Atlas Scheduled Triggers used to keep demo data fresh
over time — unrelated to the modules' core logic, safe to skip.

> **Note on data maturity:** this is demo/reference data, not a production
> dataset. Some collections are lightly seeded (a handful of documents per
> scenario) and calibration values (thresholds, weights) are illustrative,
> not derived from real business data. Treat field *shapes* as stable;
> treat specific values as adjustable.

---

## Collections

### `suppliers`
**What it represents:** the master list of vendors the business sources
from — one document per supplier.
**Key fields (conceptual):** `supplier_id`/`supplier_name`; `region`/
`country`; `product_categories`; `status` (active/inactive); `location`
(GeoJSON point, for proximity search); `has_active_orders`;
`committed_capacity_pct` (how much of the supplier's capacity is already
booked); `avg_lead_time_days`; `certifications[]` (type, validity,
scope); `tariff_exposure_rating`; `erp_last_synced_at`; `auto_embed_text`
(a short natural-language summary of the supplier, used for semantic
search).
**Reads:** all three modules. **Writes:** none — reference data, loaded
once. Conceptually, a supplier record like this could plausibly be
assembled from more than one system of record — an ERP for
capacity/orders, a compliance system for `certifications`, a CRM for
contact/relationship data — with MongoDB's document model acting as the
single, consolidated view across them, rather than being the original
source of any single field itself. In this demo it's a static, unified
snapshot; it isn't wired to any of those upstream systems.

### `risk_catalog`
**What it represents:** the fixed catalog of risk *types* the system
knows how to detect and score (e.g. tariff escalation, tropical storms,
port congestion) — not live incidents, the definitions behind them.
**Key fields:** `risk_id`/`risk_type`/`name`/`description`;
`applies_to_regions`; `severity`/`occurrence_base`/`detection` (the three
factors that make up the RPN formula: RPN = severity × occurrence ×
detection); `rpn_base`; `alert_threshold_rpn`; `signal_source` (which
real-world feed this models, e.g. GDELT, NOAA); `has_physical_location`.
**Reads:** all three modules. **Writes:** none — reference data.

### `purchase_orders`
**What it represents:** active and recent purchase orders, used as the
"business pressure" context around a risk (how urgent is this, how much
is at stake).
**Key fields:** `order_id`/`supplier_id`; `product_category`/
`product_description`; `value_usd`; `delivery_due_date`/
`days_until_due`; `status` (`pending`/`active`/`in_transit`);
`criticality`; `promotional_window` (is this order tied to a time-locked
campaign); `erp_last_synced_at`.
**Reads:** all three modules. **Writes:** none — reference data.
Conceptually this is the kind of collection you'd expect to be
continuously synced from an ERP system — the `erp_last_synced_at` field
on both this collection and `suppliers` points at that intent — but in
this demo it's static, imported once as reference data rather than kept
live by an actual ERP integration.

### `supplier_documents`
**What it represents:** chunked text extracted from real-looking supplier
paperwork (certificates, contracts, audit reports, sustainability
reports, emails) — the evidence base `alternative_finder` cites when
judging whether a candidate supplier is a safe replacement.
**Key fields:** `chunk_id`/`doc_id`/`supplier_id`; `filename`/`page_ref`;
`chunk_index`/`chunk_total`; `doc_type` (`certificate`/`contract`/
`audit_report`/`sustainability_report`/`email`); `chunk_text` (the
extracted passage); `auto_embed_text` (text indexed for semantic
search); `valid_until` (ISO-8601 string, relevant for certificates).
**Reads:** `alternative_finder` only. **Writes:** none — reference data.
**On the chunks:** this demo ships only the already-chunked text, not the
original source files (PDFs, emails) they came from — those aren't part
of this dataset. In a real deployment, this collection would be fed
continuously by a separate document-processing pipeline (ingesting raw
files, extracting text, chunking, embedding) rather than loaded once as
a static seed. For a reference architecture of what that pipeline could
look like on MongoDB, see our team's prior work: [Document Intelligence
with Agentic AI](https://www.mongodb.com/docs/atlas/architecture/current/solutions-library/document-intelligence/).

### `external_conditions`
**What it represents:** individual real-world signals (a headline, a
detected condition) that `ingestion_engine` generates or that exist as
baseline scenarios — the raw material a risk evaluation reacts to.
**Key fields:** `condition_id`; `risk_catalog_ref`/`risk_type_triggered`;
`source`; `raw_headline`; `affected_regions`; `condition_score`;
`epicentre` (GeoJSON point, when the risk has a physical location) /
`impact_radius_km`; `detected_at`/`valid_until`; `is_base` (permanent
baseline scenario vs. `is_demo_trigger`/session-generated).
**Reads:** `risk_evaluator`. **Writes:** `ingestion_engine` (session-scoped
documents only; `is_base: true` documents are reference data and are
never modified).

### `agent_memory`
**What it represents:** curated "what actually happened" episodes —
precedent that `risk_evaluator` and `alternative_finder` use to weigh
their reasoning against real historical outcomes, instead of scoring
every situation from scratch.
**Key fields:** `memory_id`; `supplier_id`; `risk_type`/`risk_id_ref`;
`episode` (a nested object: `condition_summary`, `rpn_at_trigger`,
`actual_impact` — did the risk materialize, and at what cost —,
`resolution` — what was done, which alternative supplier was proposed if
any, and the outcome); `evaluation_quality`/`proposal_quality`/
`proposal_feedback`; `auto_embed_text`; `recorded_at`.
**Reads:** `risk_evaluator` and `alternative_finder` (both read-only).
**Writes:** none of the three modules write here in this demo — this
collection is meant to be populated by a separate periodic
close-the-loop process (outside the scope of these three modules), which
confirms real-world outcomes after the fact.

### `supplier_risk_evaluations`
**What it represents:** the output of `risk_evaluator` — one risk
assessment per supplier exposed to an active condition.
**Key fields:** `evaluation_id`; `supplier_id`/`supplier_name`/`region`/
`country`/`product_categories`; `operational_context`; `risk_scores[]`
(per risk type: base RPN, `historical_weight` derived from precedent,
resulting `rpn_dynamic` and status); `supplier_risk_level`;
`requires_action`; `natural_language_summary`.
**Reads:** `alternative_finder` (to know why it was invoked).
**Writes:** `risk_evaluator` only — every document in this collection is
session-generated; there is no fixed reference data here. The sample
file in this folder shows the *shape* of that output, not a stable seed.

### `supplier_alternatives`
**What it represents:** the output of `alternative_finder` — a shortlist
of alternative suppliers proposed for a given risk evaluation, pending
human approval.
**Key fields:** `evaluation_id_ref`; candidate suppliers with
`proximity_km` to a reference distribution point, and a compliance
verdict per criterion (backed by cited `supplier_documents`); an
`approved_supplier_id` field that starts `null` and is meant to be set
by a human reviewer, never by the agent itself.
**Reads:** none of the current modules (it's a terminal output, meant for
a UI/reviewer). **Writes:** `alternative_finder` only — session-generated,
same caveat as above: this is a shape reference, not a stable seed.
**Note:** this schema is still evolving as the module is actively being
extended — don't treat it as final.

---

## Setting this up on your own Atlas cluster

1. **Create a cluster** running a MongoDB version that supports Atlas
   Search, Vector Search, and Native Reranking (Atlas clusters on the
   Latest Version with Auto-Upgrades track).
2. **Create the database** `retail-supply-chain-risk` and import each
   JSON file in this folder into a collection of the same name (via
   Atlas Data Explorer's **Import Data**, or `mongoimport --jsonArray`).
3. **Create standard indexes:**
   - `suppliers`: a `2dsphere` index on `location` (needed for
     `$geoNear` proximity search).
   - `agent_memory`: a compound index on `supplier_id` + `risk_type`.
   - `supplier_documents`: a compound index on `supplier_id` + `doc_type`.
4. **Create Vector Search indexes with Automated Embedding (autoEmbed)**
   so Atlas generates and keeps embeddings in sync for you, instead of
   computing them yourself. In Atlas: **Data Explorer → your collection
   → Search Indexes → Create Search Index → Vector Search**, JSON editor,
   using a definition like:
   ```json
   {
     "fields": [
       { "type": "autoEmbed", "path": "auto_embed_text", "model": "voyage-4" },
       { "type": "filter", "path": "supplier_id" },
       { "type": "filter", "path": "doc_type" }
     ]
   }
   ```
   Create one such index on `supplier_documents` (filters:
   `supplier_id`, `doc_type`), one on `suppliers` (filters as needed for
   your query patterns), and one on `agent_memory` (filters:
   `supplier_id`, `risk_type`). Automated Embedding needs a Voyage AI
   Model API key configured at the project level (**Project Settings →
   AI Models → Model API Keys**) — Atlas calls Voyage on your behalf at
   index- and query-time, no separate embedding pipeline needed.
5. **Create a full-text Search index** on `supplier_documents.chunk_text`
   (standard Atlas Search index, dynamic or static mapping) — this is the
   full-text half of the hybrid search used to retrieve supporting
   evidence.
6. **Combine both with `$rankFusion`** in your aggregation pipeline to
   merge vector and full-text results into a single ranked list
   (Reciprocal Rank Fusion) — this stage needs no separate setup beyond
   the indexes above.
7. **Enable Native Reranking** if you want the `$rerank` aggregation
   stage (reorders `$rankFusion` output using a Voyage reranker model,
   inside the same pipeline, no external API call): toggle **"Native
   Reranking: $rerank Aggregation Stage"** under **Project Settings**,
   and make sure the same Voyage AI Model API key from step 4 is
   configured at the project level. This is a separate opt-in from
   Automated Embedding — enabling one does not enable the other.

Full official references:
- Automated Embedding: https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/
- Hybrid Search / `$rankFusion`: https://www.mongodb.com/docs/atlas/atlas-vector-search/hybrid-search/
- `$rankFusion` reference: https://www.mongodb.com/docs/manual/reference/operator/aggregation/rankfusion/
- Native Reranking / `$rerank`: https://www.mongodb.com/docs/vector-search/hybrid-search/vector-search-with-full-text-search/
