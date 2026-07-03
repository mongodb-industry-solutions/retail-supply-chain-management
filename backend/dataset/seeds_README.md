# Database Setup Guide — Retail Supply Chain Risk

This guide walks through setting up the MongoDB Atlas database for the Retail Supply Chain Risk demo from scratch. Follow the steps in order — indexes depend on data being ingested first, and some indexes depend on other indexes existing.

**Cluster:** your Atlas cluster  
**Database:** `retail-supply-chain-risk`  


---

## Status overview

| Collection | Seed file | Docs | Status |
|---|---|---|---|
| `suppliers` | `suppliers_seed.json` | 40 | ✅ Done |
| `risk_catalog` | `risk_catalog_seed.json` | 10 | ✅ Done |
| `purchase_orders` | `purchase_orders_seed.json` | 620 | ✅ Done |
| `supplier_documents` | `supplier_documents_seed.json` | 146 | ✅ Done |
| `external_conditions` | `external_conditions_seed.json` | 20 | ⬜ Pending |
| `supplier_risk_evaluations` | — | — | ⬜ Created by risk_evaluator at runtime |
| `supplier_alternatives` | — | — | ⬜ Created by alternative_finder at runtime |
| `agent_memory` | — | — | ⬜ Pending (base episodes) |

---

## Cluster requirements

**Tier:** M20 base, min M10 / max M30 (Compute Auto-Scaling enabled)  
**Why M20:** The autoEmbed feature (Voyage AI vector generation inside Atlas) requires Compute Auto-Scaling to be enabled. M10 fixed tier does not qualify. Auto-Scaling was confirmed enabled on your Atlas cluster on June 15, 2026.

If replicating on a new cluster, enable Compute Auto-Scaling before creating any Vector Search indexes.

---

## Step 1 — Create the database and collections

1. Open MongoDB Atlas → navigate to your cluster
2. Click **Browse Collections** → **Create Database**
3. Database name: `retail-supply-chain-risk` / Collection name: `suppliers`
4. Create the remaining 7 collections one by one (click **+** next to the database name):
   - `risk_catalog`
   - `external_conditions`
   - `purchase_orders`
   - `agent_memory`
   - `supplier_risk_evaluations`
   - `supplier_documents`
   - `supplier_alternatives`

---

## Step 2 — Ingest `suppliers`

**Seed file:** `suppliers_seed.json`  
**Via MongoDB Compass:** Add Data → Import JSON → select file → Import  
**Verify:** 40 documents imported

**Data model notes:**
- 40 suppliers across 18 countries and 4 geographic zones (Asia, LATAM, Europe, North America + Africa)
- Polymorphic document model — CN/TW suppliers carry `tariff_exposure_rating`, fresh produce/dairy suppliers carry `cold_chain_certified`, audited suppliers carry `sustainability_verified`
- Each document has an `auto_embed_text` field — a concatenated plain text string used as the source for Automated Embedding (Step 4). No `profile_embedding` field — Atlas generates and stores the vector automatically

**Example document:**
```json
{
  "_id": { "$oid": "6a2c19deaa8e334aa4699f53" },
  "supplier_id": "SUP-SHENZHEN-441",
  "supplier_name": "Shenzhen Advanced Materials Co.",
  "region": "CN",
  "country": "China",
  "product_categories": ["packaging_materials"],
  "status": "active",
  "location": { "type": "Point", "coordinates": [114.0579, 22.5431] },
  "has_active_orders": true,
  "committed_capacity_pct": 0.65,
  "avg_lead_time_days": 21,
  "certifications": [
    { "type": "ISO 9001", "valid_until": "2027-06-30", "status": "active", "scope": "packaging materials" },
    { "type": "IATF 16949", "valid_until": "2027-06-30", "status": "active", "scope": "automotive and industrial packaging" }
  ],
  "tariff_exposure_rating": "high",
  "erp_last_synced_at": "2026-06-10T06:00:00Z",
  "auto_embed_text": "Packaging materials supplier · Shenzhen, China · ISO 9001 scope packaging materials · IATF 16949 scope automotive and industrial packaging · tariff exposure high · CN region"
}
```

---

## Step 3 — Create standard indexes on `suppliers`

Both indexes created from the **Indexes** tab in MongoDB Compass.

**Index 1 — 2dsphere on `location`**
```json
{ "location": "2dsphere" }
```
Powers all geospatial queries. risk_evaluator uses `$geoWithin $centerSphere` to check if a supplier's plant is inside a risk signal's `impact_radius_km`. alternative_finder uses `$geoNear` to calculate `proximity_km` between each candidate supplier and the distribution center. Without this index, geospatial queries fail or run as full collection scans.

**Index 2 — Compound on `region`, `product_categories`, `status`**
```json
{ "region": 1, "product_categories": 1, "status": 1 }
```
Supports the pre-filter alternative_finder runs before Hybrid Search — filtering by `status: "active"`, excluding CN/TW regions, and matching `product_categories`. Atlas Vector Search pre-filters rely on standard indexes, so this must exist before the Vector Search index is used.

---

## Step 4 — Create Vector Search index on `suppliers` (autoEmbed)

**Index name:** `suppliers_autoembed_index`  
**Requires:** Auto-Scaling enabled on the cluster (see Cluster requirements above)

**Via Atlas UI:**
1. Navigate to cluster → **Search & Vector Search** tab
2. Click **Create Search Index** → **Vector Search**
3. Select **Automated Embedding** → **JSON Editor**
4. Index name: `suppliers_autoembed_index`
5. Database and Collection: `retail-supply-chain-risk` → `suppliers`
6. Paste the definition below → **Next** → **Create Vector Search Index**
7. Monitor status: **Building** → **Ready** (a few minutes for 40 documents)

```json
{
  "fields": [
    { "type": "autoEmbed", "modality": "text", "path": "auto_embed_text", "model": "voyage-4" },
    { "type": "filter", "path": "region" },
    { "type": "filter", "path": "product_categories" },
    { "type": "filter", "path": "status" }
  ]
}
```

**What this does:** Atlas scans all 40 supplier documents, sends each `auto_embed_text` to Voyage AI (voyage-4), generates vectors, and stores them in `__mdb_internal_search`. No external embedding pipeline needed. The filter fields (`region`, `product_categories`, `status`) are the exact fields used in alternative_finder's pre-filter before vector search runs.

**Why autoEmbed and not a manual embedding pipeline:** autoEmbed keeps vectors in sync automatically — when a supplier document is updated, Atlas regenerates the vector. No ETL job, no drift between document content and vector representation.

---

## Step 5 — Ingest `risk_catalog`

**Seed file:** `risk_catalog_seed.json` — 10 documents

**Example document:**
```json
{
  "_id": { "$oid": "6a2c29d6aa8e334aa4699f7f" },
  "risk_id": "RISK-GEO-001",
  "risk_type": "geopolitical_tariff",
  "name": "US-CN trade tariff escalation",
  "description": "US import tariffs imposed on goods from China, affecting cost and lead times for CN-region suppliers.",
  "applies_to_regions": ["CN", "TW"],
  "severity": 8,
  "occurrence_base": 5,
  "detection": 4,
  "rpn_base": 160,
  "alert_threshold_rpn": 260,
  "signal_source": "GDELT",
  "has_physical_location": false
}
```

**Index:** `{ "risk_type": 1, "applies_to_regions": 1 }`

---

## Step 6 — Ingest `purchase_orders`

**Seed file:** `purchase_orders_seed.json` — 620 documents

**Data notes:**
- 620 orders across all 40 suppliers, distributed 0–30 orders per supplier
- $198M total order value
- Distribution: 204 high / 298 medium / 118 low criticality
- 5 key demo orders with fixed IDs preserved: `ORD-2026-0441`, `0443`, `0471` (SUP-SHENZHEN-441) and `ORD-2026-0388`, `0389` (SUP-VALLE-MX)
- `days_until_due` is hardcoded relative to June 12, 2026 — a daily Atlas Scheduled Trigger needs to recalculate this field to keep the demo coherent over time (see Triggers section)

**Example document:**
```json
{
  "_id": { "$oid": "6a2c2b1faa8e334aa4699f8c" },
  "order_id": "ORD-2026-0441",
  "supplier_id": "SUP-SHENZHEN-441",
  "product_category": "packaging_materials",
  "product_description": "Holiday gift packaging — rigid boxes and decorative sleeves",
  "value_usd": 980000,
  "delivery_due_date": "2026-07-10",
  "days_until_due": 28,
  "status": "active",
  "criticality": "high",
  "promotional_window": true,
  "promotional_note": "Q3 holiday gifting campaign — fixed launch date",
  "erp_last_synced_at": "2026-06-10T06:00:00Z"
}
```

**Index:** `{ "supplier_id": 1, "status": 1, "delivery_due_date": 1 }`

---

## Step 7 — Ingest `supplier_documents`

**Seed file:** `supplier_documents_seed.json` — 146 chunks  
**Via MongoDB Compass:** Add Data → Import JSON → Import  
**Verify:** 146 documents imported

**Data model notes:**
- 146 chunks across all 40 suppliers — 5 doc types: `certificate`, `contract`, `audit_report`, `sustainability_report`, `email`
- Each chunk carries `supplier_ref` (ObjectId of the corresponding supplier document) alongside `supplier_id` (stable string identifier) — following MongoDB best practices for cross-collection references
- `valid_until` on certificate chunks matches `certifications[].valid_until` in `suppliers` exactly — kept in sync by design
- `auto_embed_text` = `chunk_text` on every chunk — same convention as `suppliers` and `agent_memory`, making all three autoEmbed index definitions structurally identical
- Mock chunks approach — no real files needed. Each chunk contains enough metadata (filename, page reference, chunk index, extracted text) to produce a fully convincing agent citation

**Example document:**
```json
{
  "_id": { "$oid": "6a311d26aa8e334aa469a290" },
  "chunk_id": "CHUNK-SDOC-SHZ441-CERT-01-01",
  "doc_id": "SDOC-SHZ441-CERT-01",
  "supplier_id": "SUP-SHENZHEN-441",
  "supplier_ref": { "$oid": "6a2c19deaa8e334aa4699f53" },
  "filename": "iso_cert_SHZ441_2024.pdf",
  "page_ref": 1,
  "chunk_index": 1,
  "chunk_total": 2,
  "doc_type": "certificate",
  "chunk_text": "This is to certify that Shenzhen Advanced Materials Co. has established and maintains a Quality Management System conforming to ISO 9001:2015. Scope: packaging materials. Certificate number: CN-QMS-2024-18874. Valid from 2024-07-01 to 2027-06-30.",
  "auto_embed_text": "This is to certify that Shenzhen Advanced Materials Co. has established and maintains a Quality Management System conforming to ISO 9001:2015. Scope: packaging materials. Certificate number: CN-QMS-2024-18874. Valid from 2024-07-01 to 2027-06-30.",
  "valid_until": "2027-06-30T00:00:00Z"
}
```

**Indexes to create:**

Index 1 — Compound:
```json
{ "supplier_id": 1, "doc_type": 1 }
```
Powers alternative_finder pre-filter before Hybrid Search. Must exist before search indexes are used.

Index 2 — Vector Search (autoEmbed):
```json
{
  "fields": [
    { "type": "autoEmbed", "modality": "text", "path": "auto_embed_text", "model": "voyage-4" },
    { "type": "filter", "path": "supplier_id" },
    { "type": "filter", "path": "doc_type" }
  ]
}
```
Index name: `supplier_documents_vector_index`

Index 3 — Atlas Search (Lucene fulltext):
```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "chunk_text": { "type": "string", "analyzer": "lucene.standard" }
    }
  }
}
```
Index name: `supplier_documents_fulltext_index`

**How the three indexes power Hybrid Search:**
```
$vectorSearch (vector index)  → top 50 by semantic similarity
$search (fulltext index)      → top 50 by keyword match
$rankFusion                   → merges both result sets
Voyage Rerank (Atlas native)  → re-ranks fused set → returns precise top 5
```

---

## Step 8 — Ingest `external_conditions`

**Seed file:** `external_conditions_seed.json` — 20 base documents  
**Via MongoDB Compass:** Add Data → Import JSON → Import  
**Verify:** 20 documents imported

**Data model notes:**
- 20 base signals across all supplier regions — every signal references a valid `risk_catalog_ref`
- Distribution: 9 logistics_disruption (45%), 6 geopolitical_tariff (30%), 5 climate_disruption (25%)
- All `condition_score` values between 0.18–0.38 — safely below all `alert_threshold_rpn` values in `risk_catalog`. No supplier breaches alert or critical from base data alone. Dashboard starts green for every new session.
- All `is_base: true`, `is_demo_trigger: false`, `session_id: null`
- Base signals have `valid_until: null` — never auto-deleted by the TTL index

**Base signal example (with physical location):**
```json
{
  "_id": { "$oid": "6a315cc0aa8e334aa469a354" },
  "condition_id": "COND-BASE-LOG-001",
  "risk_catalog_ref": "RISK-LOG-001",
  "risk_type_triggered": "logistics_disruption",
  "source": "MarineTraffic",
  "raw_headline": "Moderate vessel queuing reported at Yantian terminal — minor scheduling impact",
  "affected_regions": ["CN", "HK"],
  "condition_score": 0.38,
  "has_physical_location": true,
  "epicentre": { "type": "Point", "coordinates": [114.1095, 22.5229] },
  "impact_radius_km": 40,
  "detected_at": "2026-06-15T06:00:00Z",
  "valid_until": null,
  "is_base": true,
  "is_demo_trigger": false,
  "session_id": null
}
```

**Demo trigger signal example (generated at runtime, not part of seed):**
```json
{
  "condition_id": "COND-20260616-0941",
  "risk_catalog_ref": "RISK-LOG-001",
  "risk_type_triggered": "logistics_disruption",
  "source": "MarineTraffic",
  "raw_headline": "Severe port congestion at Yantian/Shenzhen — vessel queuing 48–72h delays",
  "affected_regions": ["CN", "HK"],
  "condition_score": 0.87,
  "has_physical_location": true,
  "epicentre": { "type": "Point", "coordinates": [114.1095, 22.5229] },
  "impact_radius_km": 80,
  "detected_at": "2026-06-16T09:41:00Z",
  "valid_until": "2026-06-18T09:41:00Z",
  "is_base": false,
  "is_demo_trigger": true,
  "session_id": "sess-abc123"
}
```

**Indexes to create after ingestion:**

Index 1 — TTL on `valid_until`:
```json
{ "valid_until": 1 }
```
Index name: `valid_until_ttl` · Type: TTL · Expire after seconds: `0`

The TTL index fires only on documents where `valid_until` is a valid date. Base signals (`is_base: true`) have `valid_until: null` — the TTL index ignores them silently, they are never auto-deleted. Demo trigger signals carry a real date and are auto-deleted on expiry.

Index 2 — 2dsphere on `epicentre`:
```json
{ "epicentre": "2dsphere" }
```
Index name: `epicentre_2dsphere`

Powers `$geoWithin $centerSphere` queries in risk_evaluator — checks whether a supplier's `location` falls within a signal's `impact_radius_km` from the `epicentre` coordinates. Documents with `has_physical_location: false` have no `epicentre` field — the 2dsphere index ignores them silently, no errors.

---

## Step 9 — Create indexes on `supplier_risk_evaluations`

This collection is written by risk_evaluator at runtime — no seed ingestion needed. Create the indexes before running the demo for the first time.

**Index 1 — Compound `{ rpn_status, requires_action }`:**
```json
{ "rpn_status": 1, "requires_action": 1 }
```
Powers dashboard queries — for example, fetching all suppliers where `requires_action: true` for the alert panel.

**Index 2 — Compound `{ supplier_id, evaluated_at }`:**
```json
{ "supplier_id": 1, "evaluated_at": -1 }
```
Powers retrieval of the most recent evaluation per supplier (`evaluated_at: -1` sorts descending).

**Base document example:**
```json
{
  "evaluation_id": "EVAL-BASE-SHZ441-001",
  "supplier_id": "SUP-SHENZHEN-441",
  "evaluated_at": "2026-06-16T08:00:00Z",
  "is_base": true,
  "is_demo_trigger": false,
  "session_id": null,
  "operational_context": {
    "active_orders": 3,
    "total_value_usd": 2400000,
    "earliest_delivery_due": "2026-07-10",
    "days_until_due": 24,
    "criticality": "high"
  },
  "risk_scores": [
    {
      "risk_id": "RISK-GEO-001",
      "condition_id": "COND-BASE-GEO-001",
      "severity": 8,
      "occurrence_base": 5,
      "occurrence_adjusted": 1.75,
      "detection": 4,
      "rpn_base": 160,
      "rpn_dynamic": 56,
      "rpn_status": "OK",
      "triggered_by": { "source": "GDELT", "condition_score": 0.35, "historical_weight": 1.00 }
    }
  ],
  "supplier_risk_level": "OK",
  "natural_language_summary": "SUP-SHENZHEN-441 is within normal operating parameters. No action required.",
  "requires_action": false
}
```

---

## Step 10 — Create index on `supplier_alternatives`

**Index — Compound `{ evaluation_id_ref, session_id }`:**
```json
{ "evaluation_id_ref": 1, "session_id": 1 }
```
Links each shortlist back to its originating evaluation and session. alternative_finder uses this to retrieve the correct shortlist. Demo reset uses `session_id` to scope the `deleteMany`.

---

## Step 11 — Create indexes on `agent_memory`

**Index 1 — Compound `{ supplier_id, risk_type }`:**
```json
{ "supplier_id": 1, "risk_type": 1 }
```
Pre-filter index for Vector Search — risk_evaluator filters by `supplier_id` and `risk_type` before running semantic similarity search. Must exist before the autoEmbed index is used.

**Index 2 — Vector Search (autoEmbed):**
```json
{
  "fields": [
    { "type": "autoEmbed", "modality": "text", "path": "auto_embed_text", "model": "voyage-4" },
    { "type": "filter", "path": "supplier_id" },
    { "type": "filter", "path": "risk_type" }
  ]
}
```
Index name: `agent_memory_autoembed_index`

Powers semantic retrieval of historical episodes. risk_evaluator queries with a natural language description of the current risk situation and retrieves the most semantically similar past episodes — including analogous situations from other suppliers.

**Base episode example:**
```json
{
  "memory_id": "MEM-20250315-SHZ441",
  "supplier_id": "SUP-SHENZHEN-441",
  "risk_type": "geopolitical_tariff",
  "is_base": true,
  "is_demo_trigger": false,
  "session_id": null,
  "episode": {
    "condition_summary": "US-CN trade war escalation Q1 2025 — 25% tariffs on packaging imports announced",
    "rpn_at_trigger": 245,
    "actual_impact": { "occurred": true, "delay_days": 18, "cost_overrun_usd": 340000 },
    "resolution": { "action_taken": "alternative_sourcing", "alt_supplier_id": "SUP-GUADALAJARA-MX", "outcome": "successful" }
  },
  "evaluation_quality": "accurate",
  "auto_embed_text": "US-CN trade tariff escalation Q1 2025 packaging materials supplier Shenzhen China 18-day delay cost overrun 340000 resolved via alternative sourcing SUP-GUADALAJARA-MX successful",
  "recorded_at": "2025-03-15T00:00:00Z"
}
```

---

## Pending — Triggers

These Atlas Scheduled Triggers are not yet configured. They keep the demo coherent over time and must be set up before the demo goes live in production.

| # | Trigger | Frequency | Description |
|---|---|---|---|
| 1 | Recalculate `days_until_due` | Daily | Updates `days_until_due` on all active `purchase_orders` relative to the current date. Currently hardcoded to June 12, 2026. |
| 2 | Refresh base signals | Weekly | Regenerates `external_conditions` base signals with slightly varied `condition_score` values before the TTL deletes them. Insert new — never update (Change Streams fire on insert). |
| 3 | Sync certificate `valid_until` | Monthly (nice to have) | Walks all certificate chunks in `supplier_documents` and syncs `valid_until` against `certifications[].valid_until` in `suppliers`. |
| 4 | Expiring cert alert | Daily (nice to have) | Detects certifications expiring within 90 days and inserts an alert signal into `external_conditions`. |

---

## Pending — JSON Schema validation

MongoDB collection-level JSON Schema validation is not yet configured. Each collection should have a validator that enforces required fields and basic type constraints — for example, `condition_score` must be a `double` between 0 and 1, `epicentre` when present must be a valid GeoJSON Point, `is_base` and `is_demo_trigger` must be booleans.

Schema definitions to be added here once finalized.

---

## Session data and demo reset

Collections written during a demo session (`external_conditions` demo triggers, `supplier_risk_evaluations`, `supplier_alternatives`, `agent_memory` session episodes) all carry `is_base: false` and `session_id`.

**Demo reset** (run from Atlas UI or trigger manually before a live demo):
```javascript
db.external_conditions.deleteMany({ is_base: false, session_id: "<session_id>" })
db.supplier_risk_evaluations.deleteMany({ is_base: false, session_id: "<session_id>" })
db.supplier_alternatives.deleteMany({ is_base: false, session_id: "<session_id>" })
db.agent_memory.deleteMany({ is_base: false, session_id: "<session_id>" })
```

**TTL fallback:** session-scoped documents auto-expire after 2 hours via TTL indexes — no manual cleanup needed for abandoned sessions.

Base data (`suppliers`, `risk_catalog`, `purchase_orders`, `supplier_documents`, and all `is_base: true` documents) is **never touched** by demo reset.
