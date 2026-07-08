# Risk Evaluator

## 1. Overview

The risk evaluator is a LangGraph-powered agent pipeline that detects active supply chain risk signals for a session, identifies which suppliers are geographically or regionally exposed, calculates a dynamic Risk Priority Number (RPN) for each supplier–signal pair (with haversine distance decay for physical events), and runs a ReAct reasoning loop that queries Atlas Vector Search to surface historical precedent before amplifying or attenuating scores. A final LLM call produces a natural-language risk summary per supplier. The entire pipeline streams progress to the frontend as Server-Sent Events so the procurement manager sees each reasoning step in real time rather than waiting for a single large payload.

---

## 2. How to Run the Backend Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Required environment variables

Create a `.env` file in the `backend/` directory with the following variables (no defaults — all are required unless noted):

| Variable | Notes |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `DATABASE_NAME` | Optional — defaults to `retail-supply-chain-risk` |
| `LLM_API_KEY` | API key forwarded as `api-key` header to the LLM proxy |
| `LLM_BASE_URL` | Base URL of the LLM proxy (e.g. Amazon Bedrock gateway) |
| `ANTHROPIC_MODEL` | Model identifier (e.g. `claude-sonnet-4-6`) |
| `VOYAGE_API_KEY` | Voyage AI key used by Atlas autoembedding |
| `CORS_ORIGINS` | Optional — defaults to `["*"]` |

### MongoDB Atlas requirements

**Cluster:** any M0 or higher (M10+ recommended for production).

**Database name:** `retail-supply-chain-risk` (matches `DATABASE_NAME`).

**Collections that must exist before starting the server:**

| Collection | Purpose |
|---|---|
| `suppliers` | Supplier master data with `location` (GeoJSON Point) and `region` fields |
| `risk_catalog` | Risk rules: `risk_type`, `severity`, `occurrence_base`, `detection`, `alert_threshold_rpn` |
| `purchase_orders` | Active orders per supplier |
| `external_conditions` | Base condition documents seeded with `is_base: true` |
| `agent_memory` | Historical risk episodes used by Vector Search |
| `supplier_risk_evaluations` | Created automatically; stores one document per evaluated supplier per session |

**Atlas Search indexes that must exist:**

| Index name | Collection | Type | Field |
|---|---|---|---|
| `agent_memory_autoembed_index` | `agent_memory` | Vector Search | `auto_embed_text` |

The `suppliers` collection also requires a `2dsphere` index on the `location` field for `$geoWithin` queries.

---

## 3. API Endpoints

Both endpoints require the `X-Session-ID` request header. The value is a free-form string that scopes all database reads and writes to a single simulation run.

### a. `POST /api/simulation/start`

**Purpose:** Seeds the session with demo risk signals. Selects up to three `(supplier, risk_type)` pairs from live database data, generates a condition document for each, inserts them into `external_conditions` with `is_demo_trigger: true`, and returns the inserted documents. This endpoint must be called before `/evaluate` — without seeded signals the evaluator finds nothing to process.

**Request headers:**

```
X-Session-ID: <your-session-id>
```

**Request body:** none.

**Response:**

```json
{
  "session_id": "string",
  "signals": [
    {
      "condition_id": "COND-ABCD1234-EAR-F3A9B2",
      "session_id": "string",
      "is_demo_trigger": true,
      "is_base": false,
      "risk_catalog_ref": "string",
      "risk_type_triggered": "string",
      "condition_score": 1.15,
      "source": "string",
      "raw_headline": "string",
      "has_physical_location": true,
      "epicentre": { "type": "Point", "coordinates": [longitude, latitude] },
      "impact_radius_km": 300,
      "affected_regions": ["string"],
      "detected_at": "2026-06-26T10:00:00Z",
      "valid_until": null
    }
  ]
}
```

`signals` is empty if no suitable `(supplier, risk_catalog)` pairs exist in the database.

---

### b. `POST /api/simulation/evaluate`

**Purpose:** Runs the five-node LangGraph pipeline for the session and streams every progress event and the final result as Server-Sent Events. Each SSE frame carries a single JSON object in its `data` field.

**Request headers:**

```
X-Session-ID: <your-session-id>
```

**Request body:** none.

**Response:** `Content-Type: text/event-stream`

Each frame has the shape:

```
data: <JSON string>\n\n
```

#### SSE event types

##### `tool_start`

Emitted at the beginning of each pipeline node. Use this to show a "running" indicator in the UI.

```json
{
  "type": "tool_start",
  "message": "Detecting active risk signals..."
}
```

`message` values match one of the five node labels:
- `"Detecting active risk signals..."`
- `"Matching exposed suppliers..."`
- `"Calculating dynamic RPN scores..."`
- `"Reasoning and retrieving memory..."`
- `"Generating risk summary..."`

---

##### `tool_end`

Emitted when a node finishes. The `message` value is identical to the corresponding `tool_start` message, allowing you to match start/end pairs.

```json
{
  "type": "tool_end",
  "message": "Detecting active risk signals..."
}
```

---

##### `atlas_operation`

Emitted each time a node issues a MongoDB query. Use this to render the "Atlas features in use" panel. The `feature` field maps to a specific MongoDB capability.

```json
{
  "type": "atlas_operation",
  "feature": "Query",
  "collection": "external_conditions",
  "detail": "3 active conditions found for session abc123"
}
```

Possible `feature` values:

| Value | MongoDB capability | Typical collections |
|---|---|---|
| `"Query"` | `find` / `find_one` equality or range filter | `external_conditions`, `risk_catalog` |
| `"Geospatial"` | `$geoWithin $centerSphere` | `suppliers` |
| `"Vector Search"` | `$vectorSearch` with `queryText` autoembedding | `agent_memory` |
| `"Aggregation"` | `$match` + `$project` + `$limit` aggregation pipeline | `purchase_orders`, `agent_memory` |

---

##### `agent_thought`

Emitted inside the `reason_and_retrieve` ReAct loop each time the LLM produces a `Thought:` line. Use this to show the agent's reasoning in a collapsible panel.

```json
{
  "type": "agent_thought",
  "message": "Supplier SUP-042 has an active ALERT status and two orders due in 8 days. I should search for past earthquake episodes in this region."
}
```

---

##### `agent_response`

Emitted exactly once, after `generate_summary` completes. This is the final structured result. The `data` field is the serialized `EvaluationResult`.

```json
{
  "type": "agent_response",
  "data": {
    "session_id": "string",
    "conditions": [
      {
        "_id": "string — Mongo ObjectId, serialized to string",
        "condition_id": "COND-ABCD1234-EAR-F3A9B2",
        "risk_catalog_ref": "string",
        "risk_type_triggered": "string",
        "source": "string",
        "raw_headline": "string",
        "affected_regions": ["string"],
        "condition_score": 1.38,
        "has_physical_location": true,
        "epicentre": { "type": "Point", "coordinates": [longitude, latitude] },
        "impact_radius_km": 100,
        "detected_at": "string",
        "valid_until": null,
        "is_base": false,
        "is_demo_trigger": true,
        "session_id": "string"
      }
    ],
    "suppliers": [
      {
        "supplier_id": "SUP-042",
        "supplier_name": "string",
        "region": "string",
        "country": "string",
        "product_categories": ["string"],
        "location": { "type": "Point", "coordinates": [longitude, latitude] },
        "supplier_risk_level": "CRITICAL",
        "requires_action": true,
        "operational_context": {
          "active_orders": 3,
          "total_value_usd": 120000.0,
          "earliest_delivery_due": "2026-07-04",
          "days_until_due": 8,
          "criticality": "high"
        },
        "risk_scores": [
          {
            "risk_id": "RISK-EQ-001",
            "condition_id": "COND-ABCD1234-EAR-F3A9B2",
            "rpn_base": 200.0,
            "rpn_dynamic": 246.5,
            "rpn_status": "CRITICAL",
            "triggered_by": {
              "source": "USGS",
              "condition_score": 1.38,
              "historical_weight": 1.2,
              "distance_decay": 0.85,
              "risk_type_triggered": "climate_disruption"
            }
          }
        ],
        "natural_language_summary": "string — 3-5 sentence narrative written by the LLM",
        "session_id": "string"
      }
    ]
  }
}
```

`rpn_status` is one of `"CRITICAL"`, `"ALERT"`, `"WATCH"`, `"OK"`.  
`supplier_risk_level` is the highest `rpn_status` across all scores for that supplier.  
`requires_action` is `true` when at least one score is `CRITICAL` or `ALERT`.  
`distance_decay` is `null` for region-based (non-physical) conditions.  
`operational_context.criticality` is constrained to exactly `"high"`, `"medium"`, or `"low"`.  
`location` is copied as-is from the supplier's `location` field in the `suppliers` collection (GeoJSON Point).  
`risk_scores[].triggered_by.risk_type_triggered` comes from the **`risk_catalog`** document's own `risk_type` field for that `risk_id` (e.g. `"geopolitical_tariff"`, `"climate_disruption"`, `"logistics_disruption"`) — it is a different value from the `risk_type_triggered` field on the `external_conditions` document shown under `conditions` above.

> **Note on Insomnia vs. browser:** Insomnia displays the full raw SSE stream including all intermediate events. A browser `EventSource` object receives the same bytes but fires separate `onmessage` callbacks per frame — you will not see a single combined response body.

---

## 4. SSE Event Sequence

A normal run produces events in this order:

```
tool_start  ("Detecting active risk signals...")
atlas_operation  [Query on external_conditions]
tool_end    ("Detecting active risk signals...")

tool_start  ("Matching exposed suppliers...")
atlas_operation  [Geospatial on suppliers]  ← only for physical conditions
tool_end    ("Matching exposed suppliers...")

tool_start  ("Calculating dynamic RPN scores...")
atlas_operation  [Query on risk_catalog]   ← one per supplier–signal pair
tool_end    ("Calculating dynamic RPN scores...")

tool_start  ("Reasoning and retrieving memory...")
agent_thought   ← one or more, interleaved with tool calls
atlas_operation [Vector Search on agent_memory]   ← per ReAct tool call
atlas_operation [Aggregation on purchase_orders]  ← if get_order_detail called
agent_thought   ← after each Observation, until Final Answer
tool_end    ("Reasoning and retrieving memory...")

tool_start  ("Generating risk summary...")
tool_end    ("Generating risk summary...")
agent_response  ← final structured payload
```

The stream closes after `agent_response`. If the pipeline fails, an `{"type": "error", "message": "..."}` frame is emitted before the stream closes.

---

## 5. Frontend Integration Notes

### Consuming SSE in JavaScript

**Option A — `EventSource` (simplest, GET only):**

```js
// EventSource only supports GET; use fetch for POST
```

**Option B — `fetch` with `ReadableStream` (required here because the endpoint is POST):**

```js
const response = await fetch('/api/simulation/evaluate', {
  method: 'POST',
  headers: { 'X-Session-ID': sessionId },
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split('\n\n');
  buffer = frames.pop(); // keep incomplete frame
  for (const frame of frames) {
    const line = frame.trim();
    if (line.startsWith('data:')) {
      const event = JSON.parse(line.slice(5).trim());
      handleEvent(event);
    }
  }
}
```

### Mapping event types to UI elements

| Event type | Suggested UI action |
|---|---|
| `tool_start` | Show step as "running" (spinner, highlighted row) |
| `tool_end` | Mark step as "complete" (check mark, dim row) |
| `atlas_operation` | Append an entry to the "Atlas features" side panel |
| `agent_thought` | Append text to a collapsible "Agent reasoning" log |
| `agent_response` | Render supplier cards with risk badges, hide progress panel |

**Mapping `atlas_operation.feature` to icons/colors:**

| `feature` | Suggested icon | Suggested color |
|---|---|---|
| `"Query"` | magnifying glass | blue |
| `"Geospatial"` | map pin / globe | green |
| `"Vector Search"` | sparkle / neural net | purple |
| `"Aggregation"` | bar chart / funnel | orange |

### What `historical_weight` means and when it is 1.0

`triggered_by.historical_weight` reflects how past episodes for this supplier influence the current RPN:

- `> 1.0` (e.g. `1.2`) — historical episodes confirmed impact occurred; risk is amplified.
- `< 1.0` (e.g. `0.9`) — episodes were found but no actual impact occurred; risk is attenuated.
- `= 1.0` — no relevant historical episodes were found in Atlas Vector Search, or the supplier was not searched because all its scores were `OK`. The weight is neutral and does not change `rpn_dynamic`.

---

## 6. Data Notes

### Read-only collections

The risk evaluator only reads from these collections — it never inserts or updates them:

- `suppliers`
- `risk_catalog`
- `purchase_orders`
- `external_conditions`
- `agent_memory`

### Written per session

One collection receives writes during an evaluation run:

- `supplier_risk_evaluations` — one document inserted per supplier that has at least one `WATCH`, `ALERT`, or `CRITICAL` score. Documents include `evaluation_id`, `session_id`, `evaluated_at`, all risk scores, and the LLM-generated summary. The `historical_weight` derived by `reason_and_retrieve` is applied to each score's `rpn_dynamic`/`rpn_status` and persisted on `risk_scores[].triggered_by.historical_weight`; the `memory_id`s of the episodes actually surfaced for that supplier are persisted in `memory_episodes_used`. Both were previously computed and discarded — they are now genuinely applied and stored.

### Session isolation

Every document written to `supplier_risk_evaluations` carries a `session_id` field matching the `X-Session-ID` header. Reads in `detect_conditions` filter `external_conditions` by `session_id` as well. Each session is therefore fully isolated: concurrent simulation runs do not interfere with each other.
