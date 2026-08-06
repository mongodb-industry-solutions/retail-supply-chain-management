# Index Reference — Retail Supply Chain Risk Management Demo

Everything in this folder creates indexes on the
`retail-supply-chain-risk` database. Each `.js` file is a self-contained
[mongosh](https://www.mongodb.com/docs/mongodb-shell/) script that creates
exactly one index and explains, in its header comment, what that index is
for.

Atlas creates the `_id_` index on every collection automatically — it is
not listed here and you never need to create it. Everything below you do
have to create yourself.

This list covers only the indexes the three demo modules
(`ingestion_engine`, `risk_evaluator`, `alternative_finder`) need in order
to run. Additional indexes that only improve query performance at larger
data volumes are noted at the end as optional.

---

## Prerequisites

1. The database `retail-supply-chain-risk` exists and the collections are
   imported — see [../collections/README.md](../collections/README.md).
2. An Atlas cluster on a version that supports Atlas Search, Vector Search
   and Native Reranking (clusters on the Latest Version with Auto-Upgrades
   track).
3. A **Voyage AI Model API key configured at project level** — Atlas →
   **Project Settings → AI Models → Model API Keys**. The three Vector
   Search indexes below use Automated Embedding (`autoEmbed`), meaning
   Atlas calls Voyage on your behalf at index- and query-time. Without the
   key those indexes will fail to build.
4. `mongosh` installed and your cluster's connection string at hand
   (Atlas → **Connect → Shell**).

---

## Required indexes

### `suppliers`

| Index | Type | What it's for |
|---|---|---|
| `location_2dsphere` | 2dsphere | Geospatial index on `location`. Powers `$geoNear` proximity search — "which alternative suppliers are closest to the affected distribution point?". MongoDB rejects `$geoNear` on an unindexed field, so this is a hard requirement. |
| `suppliers_autoembed_index` | Vector Search (autoEmbed) | Semantic search over `auto_embed_text`, the natural-language summary of each supplier, with filters on `region`, `product_categories` and `status`. Lets `alternative_finder` shortlist candidates by what they can actually do, not by exact field match. |

### `external_conditions`

| Index | Type | What it's for |
|---|---|---|
| `epicentre_2dsphere` | 2dsphere | Geospatial index on `epicentre`, the physical centre of a risk condition (storm, port congestion). Needed to relate a condition's `impact_radius_km` to supplier locations. Same hard requirement as above: no 2dsphere index, no geo query. |

### `supplier_documents`

| Index | Type | What it's for |
|---|---|---|
| `supplier_documents_vector_index` | Vector Search (autoEmbed) | The **semantic half** of hybrid search over supplier paperwork chunks, filtered by `supplier_id` and `doc_type`. |
| `supplier_documents_fulltext_index` | Atlas Search (full-text) | The **lexical half**: static mapping on `chunk_text` with `lucene.standard`. Catches exact terms semantic search misses — certificate numbers, standard names (`ISO 14001`), specific clause wording. |

> Both `supplier_documents` indexes are required. `alternative_finder`
> merges them with `$rankFusion` and then reorders the result with
> `$rerank`; with only one of the two, the pipeline returns half the
> evidence it should.

### `agent_memory`

| Index | Type | What it's for |
|---|---|---|
| `agent_memory_autoembed_index` | Vector Search (autoEmbed) | Semantic search over past episodes — "has something like this happened to this supplier before?" — filtered by `supplier_id` and `risk_type`. Read by `risk_evaluator` (to derive `historical_weight`) and by `alternative_finder` (precedent for a proposal). |

---

## How to create them

Each file runs on its own. From this folder:

```bash
mongosh "<your-connection-string>" --file suppliers-location-2dsphere.js
mongosh "<your-connection-string>" --file external_conditions-epicentre-2dsphere.js
mongosh "<your-connection-string>" --file suppliers_autoembed_index.js
mongosh "<your-connection-string>" --file agent_memory_autoembed_index.js
mongosh "<your-connection-string>" --file supplier_documents_vector_index.js
mongosh "<your-connection-string>" --file supplier_documents_fulltext_index.js
```

Or all six in one go:

```bash
for f in *.js; do mongosh "<your-connection-string>" --file "$f"; done
```

Each script calls `db.getSiblingDB("retail-supply-chain-risk")` itself, so
the database in your connection string doesn't matter.

`createIndex` is idempotent — re-running a script with an unchanged
definition is a no-op. `createSearchIndex` is **not**: re-running it for a
name that already exists returns an `IndexAlreadyExists` error. Drop first
if you need to change a definition:

```js
db.suppliers.dropSearchIndex("suppliers_autoembed_index");
```

### Verifying

Standard indexes are ready the moment the command returns:

```js
db.suppliers.getIndexes();
db.external_conditions.getIndexes();
```

Search and Vector Search indexes build **asynchronously** — expect a
minute or two on demo-sized data. Poll until `status` is `READY` and
`queryable` is `true`:

```js
db.suppliers.getSearchIndexes();
db.supplier_documents.getSearchIndexes();
db.agent_memory.getSearchIndexes();
```

A vector index stuck in `FAILED` almost always means the Voyage AI Model
API key from step 3 is missing or invalid at project level.

### Creating them in the Atlas UI instead

Same definitions work verbatim in the browser:

- **Standard indexes:** Data Explorer → collection → **Indexes** →
  **Create Index**, paste the key pattern (e.g. `{ "location": "2dsphere" }`).
- **Search / Vector Search indexes:** Data Explorer → collection →
  **Search Indexes** → **Create Search Index** → choose *Vector Search* or
  *Atlas Search* → **JSON Editor**, and paste the object passed as the
  third argument in the corresponding `.js` file.

---

## Optional indexes

Not needed for the demo to work — the seeded collections are small enough
that collection scans are instant. Add them if you load realistic data
volumes on top of this dataset.

```js
db = db.getSiblingDB("retail-supply-chain-risk");

// Faster supplier lookups by category/region/availability.
db.suppliers.createIndex({ region: 1, product_categories: 1, status: 1 });

// Faster "what's on order with this supplier, and when is it due".
db.purchase_orders.createIndex({ supplier_id: 1, status: 1, delivery_due_date: 1 });

// Faster precedent and evidence lookups by supplier.
db.agent_memory.createIndex({ supplier_id: 1, risk_type: 1 });
db.supplier_documents.createIndex({ supplier_id: 1, doc_type: 1 });
db.risk_catalog.createIndex({ risk_type: 1, applies_to_regions: 1 });

// Faster reads of module output (latest evaluation per supplier; open actions).
db.supplier_risk_evaluations.createIndex({ supplier_id: 1, evaluated_at: -1 });
db.supplier_risk_evaluations.createIndex({ "risk_scores.rpn_status": 1, requires_action: 1 });
```

One more, worth calling out separately because it changes behaviour rather
than just speed — a **TTL index** that lets Atlas expire session-generated
conditions automatically instead of leaving them to accumulate between
demo runs:

```js
// Deletes each external_conditions document once its `valid_until` passes.
// Note: `valid_until` must be a BSON date for TTL to act on it.
db.external_conditions.createIndex({ valid_until: 1 }, { expireAfterSeconds: 0 });
```

Skip it if you'd rather keep every generated condition around for
inspection, or clear them manually between runs.

---

## References

- Automated Embedding: https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/
- Vector Search index definitions: https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-type/
- Atlas Search index definitions: https://www.mongodb.com/docs/atlas/atlas-search/index-definitions/
- Hybrid search / `$rankFusion`: https://www.mongodb.com/docs/atlas/atlas-vector-search/hybrid-search/
- Native Reranking / `$rerank`: https://www.mongodb.com/docs/vector-search/hybrid-search/vector-search-with-full-text-search/
- Geospatial indexes: https://www.mongodb.com/docs/manual/core/indexes/index-types/geospatial/
- TTL indexes: https://www.mongodb.com/docs/manual/core/index-ttl/
