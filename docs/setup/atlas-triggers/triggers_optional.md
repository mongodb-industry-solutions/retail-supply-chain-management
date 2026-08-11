# Atlas Scheduled Triggers — Demo Maintenance (Optional)

> **Scope note:** these 4 triggers are demo housekeeping, not part of the
> product design. They exist so this Atlas cluster keeps feeling "alive"
> (recent dates, no test-run buildup) without manual upkeep between demos.
> None of the three backend modules (`ingestion_engine`, `risk_evaluator`,
> `alternative_finder`) depend on them to function — **skip this entire
> doc for local development or a fresh test cluster.** They do not alter
> how the demo behaves for any given test run; they only keep the
> underlying data from looking stale over time between runs.

## Why these exist

A demo cluster accumulates two kinds of staleness over time:
1. **Test-run buildup** — every demo run writes session-scoped documents
   that pile up if nobody cleans them.
2. **Date drift** — seed data has fixed dates (order due-dates, memory
   precedent dates, ERP sync timestamps, certificate validity) that look
   increasingly stale as real time passes, even though nothing about the
   underlying scenario changed.

Rather than remembering to fix this by hand before every demo, four
Atlas Scheduled Triggers handle it automatically, once a week.

## Before you set these up — replace the placeholder

Every function below uses `context.services.get("<YOUR_ATLAS_DATA_SOURCE_NAME>")`
to connect to your cluster. **This is a placeholder, not a real value** —
it must be replaced with your own Atlas **Linked Data Source** name before
the function will work. Find it under your Atlas project's
**Triggers → Linked Data Sources** (or **Data Access**, depending on the UI
version). It is *not* your database name (that part, `retail-supply-chain-risk`,
is just the demo's DB name and can stay as-is if you're using the same seed).

Do this replacement in your own Atlas UI when you paste the code in — don't
commit your real data source name to a public repo if it reveals anything
about your infrastructure you'd rather not share.

## The 4 triggers — overview

All scheduled for early Sunday/Saturday mornings (low-traffic), so they
don't overlap with real usage. Full function code for each is below.

| # | Trigger name | Schedule | Touches | What it does |
|---|---|---|---|---|
| 1 | `cleanup_session_data` | `0 4 * * 0` (Sun) | `external_conditions` (is_base:false only), `supplier_risk_evaluations`, `supplier_alternatives` | Deletes session-generated documents from past demo/test runs. Never touches `is_base:true` reference data. |
| 2 | `refresh_agent_memory_dates` | `0 3 * * 0` (Sun) | `agent_memory.recorded_at` | Each curated episode has a fixed *relative* age in days (hardcoded mapping in the function). Recomputes `recorded_at = today - age_days` so precedent always feels equally "recent" instead of drifting into the past. |
| 3 | `refresh_fixed_collection_dates` | `0 5 * * 0` (Sun) | `purchase_orders.delivery_due_date` / `.status`, `suppliers.erp_last_synced_at` | Recomputes each order's due date from its (unchanged) `days_until_due`; applies light forward-only status progression (pending→active ~20%, active→in_transit ~15%, never backward); resets each supplier's ERP sync timestamp to 1–48h ago. |
| 4 | `renew_expiring_supplier_documents` | `0 6 * * 0` (Sun) | `supplier_documents.valid_until` / `.chunk_text` / `.auto_embed_text` | For certificates expired or expiring within 60 days, extends `valid_until` by 1 year and updates the matching date string inside the document text — only when that exact date appears literally in the text. One document is permanently excluded on purpose (see code comment) so the demo always keeps at least one legitimately "expired certificate" case to show off `alternative_finder`'s honest non-compliance detection. |

## Setup (Atlas UI)

1. Atlas → your project → **Triggers** → **Add Trigger**.
2. Type: `Scheduled`. Name + schedule from the table above (Basic mode:
   pick "Weekly" + day + hour; or Advanced mode with the cron expressions
   shown).
3. Function: **New Function** → paste the matching code block below,
   replacing `<YOUR_ATLAS_DATA_SOURCE_NAME>` with your real Linked Data
   Source name first.
4. Enable **Skip Events On Re-enable** in Trigger Configuration for all 4
   — every function here is idempotent (always recomputes from "now",
   never from a queued past date), so catching up on missed runs would
   just repeat the same result redundantly.
5. After creating all 4: **Review Draft & Deploy**.
6. Test each one manually (open the function → **Run**) before trusting
   the schedule — check the returned summary object in the logs.

## Known limitations (intentional, not bugs)

- Trigger 4 skips documents where the expiry date isn't written in a
  literal, safely-replaceable format inside the chunk text — updating the
  structured field without updating the visible text would create a worse
  inconsistency than leaving it alone.
- Trigger 4 also has one field-type gotcha worth knowing if you adapt this
  for your own data: `valid_until` here is stored as an **ISO-8601 string**,
  not a BSON `Date`. The query and the write both handle it as a string on
  purpose — if your own schema uses a real `Date` type, adjust accordingly.
- None of these triggers touch structural/reference fields like
  `has_active_orders`, `risk_catalog` entries, regions, or product
  categories — only dates, statuses, and session cleanup.
- These are maintenance conveniences calibrated for a low-volume demo (a
  handful of runs a week). They are not designed or sized for a production
  workload.

---

## Trigger 1 — `cleanup_session_data`

```javascript
/**
 * Atlas Scheduled Trigger — cleanup_session_data
 * ------------------------------------------------------------------
 * Project: retail-supply-chain-risk-management demo (MongoDB Atlas)
 *
 * Context:
 * Every time the demo is run, three modules generate session-scoped
 * documents that are NOT meant to persist long-term:
 *   - ingestion_engine writes new documents to `external_conditions`
 *     with is_base:false (copies of a fixed is_base:true template,
 *     tagged with the session's session_id). These accumulate with
 *     every demo run.
 *   - risk_evaluator writes ALL of its output to `supplier_risk_evaluations`
 *     (100% session-generated, no base/reference documents exist there).
 *   - alternative_finder writes ALL of its output to `supplier_alternatives`
 *     (same as above — 100% session-generated).
 *
 * Without periodic cleanup, these three collections grow indefinitely
 * with test/demo run data, which makes it harder to tell "real" demo
 * runs apart from old test noise when inspecting the database.
 *
 * What this function does:
 * On each scheduled run, it deletes:
 *   1. `external_conditions` documents where is_base is false
 *      (leaves all is_base:true reference templates untouched).
 *   2. All documents in `supplier_risk_evaluations` (fully session-scoped).
 *   3. All documents in `supplier_alternatives` (fully session-scoped).
 *
 * This trigger NEVER touches: suppliers, purchase_orders, risk_catalog,
 * supplier_documents, or agent_memory — those are reference/curated data,
 * not session output.
 *
 * Schedule: once a week (Advanced cron: 0 4 * * 0 — every Sunday). This is
 * a low-volume demo (only ~3 new documents per run), so weekly maintenance
 * is more than enough — no need for a tighter schedule.
 * ------------------------------------------------------------------
 */
exports = async function () {
  const db = context.services.get("<YOUR_ATLAS_DATA_SOURCE_NAME>").db("retail-supply-chain-risk");

  const extRes = await db.collection("external_conditions")
    .deleteMany({ is_base: false });

  const evalRes = await db.collection("supplier_risk_evaluations")
    .deleteMany({});

  const altRes = await db.collection("supplier_alternatives")
    .deleteMany({});

  const summary = {
    external_conditions_deleted: extRes.deletedCount,
    supplier_risk_evaluations_deleted: evalRes.deletedCount,
    supplier_alternatives_deleted: altRes.deletedCount,
    ran_at: new Date().toISOString()
  };

  console.log(JSON.stringify(summary));
  return summary;
};

```

---

## Trigger 2 — `refresh_agent_memory_dates`

```javascript
/**
 * Atlas Scheduled Trigger — refresh_agent_memory_dates
 * ------------------------------------------------------------------
 * Project: retail-supply-chain-risk-management demo (MongoDB Atlas)
 *
 * Context:
 * `agent_memory` holds a small, hand-curated set of episodes (currently
 * 25) used as historical precedent by risk_evaluator and alternative_finder.
 * Each episode originally had a fixed, absolute `recorded_at` date. As real
 * time passes, those fixed dates would look increasingly stale (e.g. a
 * "recent" precedent from months ago starts looking like ancient history),
 * which hurts the demo's narrative believability.
 *
 * Design decision: instead of a fixed date, each episode has a fixed
 * RELATIVE age in days. This function recomputes recorded_at =
 * today - age_days for every mapped memory_id, so every episode keeps
 * a constant relative age and slides forward with real time instead of
 * staying pinned to a stale date.
 *
 * This mirrors the standalone script backend/refresh_agent_memory_dates.py
 * (same AGE_DAYS mapping, same logic) — this trigger exists so the refresh
 * happens automatically without anyone needing to remember to run the
 * script manually before a demo.
 *
 * What this function does:
 * For each memory_id in AGE_DAYS, sets recorded_at = (today - age_days),
 * touching ONLY that field. Idempotent — safe to run any number of times,
 * any day; it always recomputes from the fixed age, so there is no drift.
 * Any memory_id in the mapping that no longer matches a live document is
 * reported back in `missing` rather than silently ignored.
 *
 * Schedule: once a week (Advanced cron: 0 3 * * 0 — every Sunday)
 * ------------------------------------------------------------------
 */
exports = async function () {
  const db = context.services.get("<YOUR_ATLAS_DATA_SOURCE_NAME>").db("retail-supply-chain-risk");
  const coll = db.collection("agent_memory");

  // memory_id -> fixed relative age in days (same table as
  // backend/refresh_agent_memory_dates.py)
  const AGE_DAYS = {
    "MEM-20250620-VALLE-MX-B": 396,
    "MEM-20250915-SHZ441-A": 309,
    "MEM-20251203-SINALOA-MX-D": 230,
    "MEM-20260110-JP033-C": 192,
    "MEM-20260128-NAIROBI-KE-I": 174,
    "MEM-20260218-TW204-E": 153,
    "MEM-20260220-CORK-IE-H": 151,
    "MEM-20260312-CAPETOWN-ZA-F": 131,
    "MEM-20260405-VN204-G": 107,
    "MEM-20260514-CAIRO-EG-J": 68,
    "MEM-20260427-TH055-K": 85,
    "MEM-20260402-IN077-L": 110,
    "MEM-20260606-MILANIT-M": 45,
    "MEM-20251014-GZ112-N": 280,
    "MEM-20250815-SH087-O": 340,
    "MEM-20260211-BERLINDE-P": 160,
    "MEM-20260522-ROTTNL-Q": 60,
    "MEM-20250616-LAUS-R": 400,
    "MEM-20260616-FRESNOUS-S": 35,
    "MEM-20250427-VALLEMX-T": 450,
    "MEM-20250924-SAOPAULOBR-U": 300,
    "MEM-20260303-LIMAPE-V": 140,
    "MEM-20260412-TORONTOCA-W": 100,
    "MEM-20260601-BCNES-X": 50,
    "MEM-20260611-WARSAWPL-Y": 40
  };

  const today = new Date();
  let matched = 0, modified = 0;
  const missing = [];

  for (const [memoryId, ageDays] of Object.entries(AGE_DAYS)) {
    const target = new Date(today.getTime() - ageDays * 24 * 60 * 60 * 1000);
    target.setUTCHours(0, 0, 0, 0);
    const recordedAt = target.toISOString();

    const res = await coll.updateOne(
      { memory_id: memoryId },
      { $set: { recorded_at: recordedAt } }
    );
    if (res.matchedCount === 0) {
      missing.push(memoryId);
    } else {
      matched += res.matchedCount;
      modified += res.modifiedCount;
    }
  }

  const summary = { matched, modified, missing, ran_at: today.toISOString() };
  console.log(JSON.stringify(summary));
  return summary;
};

```

---

## Trigger 3 — `refresh_fixed_collection_dates`

```javascript
/**
 * Atlas Scheduled Trigger — refresh_fixed_collection_dates
 * ------------------------------------------------------------------
 * Project: retail-supply-chain-risk-management demo (MongoDB Atlas)
 *
 * Context:
 * `purchase_orders` and `suppliers` are reference/master data — they are
 * NOT session-generated, they're loaded once and read by all three modules.
 * But two fields on them carry real dates that go stale simply because
 * real time keeps passing, independent of any demo run:
 *
 *   1. purchase_orders.delivery_due_date / days_until_due
 *      These two fields are meant to be consistent with each other
 *      (delivery_due_date = the day, days_until_due = how many days from
 *      "today" that is). Since risk_evaluator uses days_until_due to judge
 *      urgency, an order that was "due in 12 days" when the seed was
 *      written eventually becomes due in the past, which breaks the
 *      urgency narrative. This function keeps days_until_due as the
 *      source of truth (unchanged) and recomputes delivery_due_date from
 *      it: delivery_due_date = today + days_until_due. No hardcoded
 *      per-order mapping needed — it just reads each document's existing
 *      days_until_due and reprojects the date from "today".
 *
 *   2. suppliers.erp_last_synced_at
 *      A timestamp meant to look like "we just synced with the ERP".
 *      Reset to a random point 1-48h before the run, varied per supplier
 *      so it doesn't look artificially identical across all 40 suppliers.
 *
 * In addition, this function applies a light, intentional (not random-for-
 * randomness'-sake) forward progression to purchase_orders.status, to
 * simulate orders naturally advancing through the fulfillment pipeline
 * over time:
 *   - pending  -> active:      ~20% chance per matching document
 *   - active   -> in_transit:  ~15% chance per matching document
 *   - in_transit is left untouched (treated as a terminal state here —
 *     there is no "delivered" status modeled in this collection).
 *   - Movement is always forward-only (pending -> active -> in_transit),
 *     never backward, and never skips a step.
 *
 * This trigger only touches: purchase_orders (delivery_due_date, status)
 * and suppliers (erp_last_synced_at). It never touches has_active_orders,
 * product_categories, region, or any other structural field.
 *
 * Schedule: once a week, low-traffic time (Advanced cron: 0 5 * * 0 —
 * every Sunday)
 * ------------------------------------------------------------------
 */
exports = async function () {
  const db = context.services.get("<YOUR_ATLAS_DATA_SOURCE_NAME>").db("retail-supply-chain-risk");
  const poColl = db.collection("purchase_orders");
  const supColl = db.collection("suppliers");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // --- 1. Recompute purchase_orders.delivery_due_date from days_until_due ---
  let dateUpdates = 0;
  const orders = await poColl.find(
    {},
    { _id: 1, days_until_due: 1 }
  ).toArray();

  for (const order of orders) {
    if (typeof order.days_until_due !== "number") continue;
    const newDueDate = new Date(today.getTime() + order.days_until_due * 24 * 60 * 60 * 1000);
    await poColl.updateOne(
      { _id: order._id },
      { $set: { delivery_due_date: newDueDate.toISOString().slice(0, 10) } }
    );
    dateUpdates++;
  }

  // --- 2. Light forward-only status progression ---
  let pendingToActive = 0;
  let activeToInTransit = 0;

  const pendingOrders = await poColl.find({ status: "pending" }, { _id: 1 }).toArray();
  for (const order of pendingOrders) {
    if (Math.random() < 0.20) {
      await poColl.updateOne({ _id: order._id }, { $set: { status: "active" } });
      pendingToActive++;
    }
  }

  const activeOrders = await poColl.find({ status: "active" }, { _id: 1 }).toArray();
  for (const order of activeOrders) {
    if (Math.random() < 0.15) {
      await poColl.updateOne({ _id: order._id }, { $set: { status: "in_transit" } });
      activeToInTransit++;
    }
  }

  // --- 3. Refresh suppliers.erp_last_synced_at (1-48h before now, varied) ---
  let supplierUpdates = 0;
  const suppliers = await supColl.find({}, { _id: 1 }).toArray();
  for (const supplier of suppliers) {
    const hoursAgo = 1 + Math.random() * 47; // random between 1 and 48
    const syncedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    await supColl.updateOne(
      { _id: supplier._id },
      { $set: { erp_last_synced_at: syncedAt.toISOString() } }
    );
    supplierUpdates++;
  }

  const summary = {
    purchase_orders_dates_refreshed: dateUpdates,
    purchase_orders_pending_to_active: pendingToActive,
    purchase_orders_active_to_in_transit: activeToInTransit,
    suppliers_erp_sync_refreshed: supplierUpdates,
    ran_at: new Date().toISOString()
  };

  console.log(JSON.stringify(summary));
  return summary;
};

```

---

## Trigger 4 — `renew_expiring_supplier_documents`

```javascript
/**
 * Atlas Scheduled Trigger — renew_expiring_supplier_documents
 * ------------------------------------------------------------------
 * Project: retail-supply-chain-risk-management demo (MongoDB Atlas)
 *
 * Context:
 * 42 of 146 supplier_documents carry a structured `valid_until` date
 * (certificates mostly). alternative_finder cites both the structured
 * field AND the matching date written in plain text inside chunk_text /
 * auto_embed_text (e.g. "...Valid: 2025-01-01 to 2026-09-30..."). As real
 * time passes, these certificates would eventually show as expired,
 * which would flip alternative_finder's compliance_certification
 * criterion from "compliant" to "expired" for no real reason other than
 * the demo aging.
 *
 * IMPORTANT LIMITATION (by design, not an oversight):
 * Only 34 of the 42 documents have the valid_until date written in
 * chunk_text in the exact same ISO format (YYYY-MM-DD) as the structured
 * field — for those, this function can safely find-and-replace just that
 * date substring, without touching anything else in the surrounding
 * prose. The other 8 documents write the date in a different text format
 * (e.g. prose-style), so a safe exact-match replace isn't possible without
 * risking a wrong substitution. This function deliberately SKIPS those 8
 * rather than guessing — updating the field but not the visible text
 * would create a worse inconsistency than doing nothing. Skipped doc_ids
 * are reported in the summary for manual follow-up if needed.
 *
 * NOTE — one of those 8 is skipped for a language reason:
 * CHUNK-SDOC-GZH112-CERT-01-01 (doc_id SDOC-GZH112-CERT-01, zh-Hans)
 * writes its validity dates in Chinese date format inside chunk_text
 * (e.g. "2027年9月15日") while its structured valid_until stays ISO
 * ("2027-09-15T00:00:00Z"). The ISO substring therefore never appears
 * literally in the prose, so this function skips the document with
 * reason "date not found literally in chunk_text". That is the intended
 * behaviour of the exact-match guard, NOT a bug — but the practical
 * consequence is that this certificate is not renewed and will age
 * toward showing as expired. Documented here so the skip is expected
 * rather than surprising. The same applies to any future document whose
 * translation localises the date format; localising dates is a legitimate
 * translation choice, and the guard is what keeps the trigger from
 * corrupting text it cannot safely rewrite.
 *
 * DELIBERATE EXCEPTION — narrative diversity:
 * If this function renewed every single near-expiring document forever,
 * NOTHING in supplier_documents would ever be expired long-term — quietly
 * removing a legitimate demo scenario: alternative_finder correctly
 * flagging a candidate's certificate as expired (an honest "not
 * compliant" result, same spirit as its honest "unknown" for
 * undocumented sustainability practices). To keep that scenario always
 * available, EXCLUDED_DOC_IDS below are permanently skipped by this
 * function — they stay expired (or keep aging toward expiry) forever.
 * Currently: SDOC-VN088-CERT-01 (SUP-VN-088's certificate, already
 * expired as of 2025-11-30). SUP-VN-088 is not one of the 24 active
 * suppliers, so leaving it permanently expired doesn't skew typical demo
 * runs — it's simply always there as the "this one is expired" case.
 *
 * What this function does, for each supplier_documents doc with a
 * valid_until date that is already in the past OR within 60 days of
 * expiring:
 *   1. Computes a renewed date = same valid_until, +1 year.
 *   2. If the old date (YYYY-MM-DD) appears literally in chunk_text,
 *      replaces that exact substring with the new date in both
 *      chunk_text and auto_embed_text, and updates the valid_until field.
 *   3. If the old date does NOT appear literally in the text, skips the
 *      document entirely (field is not touched either, to avoid drift
 *      between field and text) and records it as skipped.
 *
 * This trigger only touches: supplier_documents (valid_until, chunk_text,
 * auto_embed_text) — and only on the subset of documents that are
 * expired or near-expiring. Documents with plenty of remaining validity
 * are left untouched on each run.
 *
 * DATA SHAPE NOTE (confirmed live, not assumed): valid_until is stored as
 * an ISO-8601 STRING (e.g. "2026-07-31T00:00:00Z"), not a BSON Date. This
 * matters because {$lte: <JS Date>} would silently match nothing against
 * a string field. The query below compares against a string in the same
 * format instead — safe because ISO-8601 strings sort lexicographically
 * in the same order as chronologically, as long as every value uses this
 * exact format (confirmed true for all 42 dated documents).
 *
 * Schedule: once a day is overkill for this one — a certificate doesn't
 * need daily renewal checks. Recommended: once a week
 * (Advanced cron: 0 6 * * 0 — every Sunday)
 * ------------------------------------------------------------------
 */
exports = async function () {
  const db = context.services.get("<YOUR_ATLAS_DATA_SOURCE_NAME>").db("retail-supply-chain-risk");
  const coll = db.collection("supplier_documents");

  // Permanently excluded from renewal — kept expired on purpose, see
  // "DELIBERATE EXCEPTION" note above.
  const EXCLUDED_DOC_IDS = ["SDOC-VN088-CERT-01"];

  const now = new Date();
  const soonThresholdStr = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10) + "T00:00:00Z"; // +60 days, same string format as stored

  const candidates = await coll.find(
    { valid_until: { $lte: soonThresholdStr }, doc_id: { $nin: EXCLUDED_DOC_IDS } },
    { _id: 1, supplier_id: 1, doc_id: 1, valid_until: 1, chunk_text: 1, auto_embed_text: 1 }
  ).toArray();

  let renewed = 0;
  const skipped = [];
  const excluded = EXCLUDED_DOC_IDS.length;

  for (const doc of candidates) {
    const oldDate = new Date(doc.valid_until);
    const oldDateStr = oldDate.toISOString().slice(0, 10); // YYYY-MM-DD

    if (!doc.chunk_text || !doc.chunk_text.includes(oldDateStr)) {
      skipped.push({ supplier_id: doc.supplier_id, doc_id: doc.doc_id, reason: "date not found literally in chunk_text" });
      continue;
    }

    const newDate = new Date(oldDate);
    newDate.setUTCFullYear(newDate.getUTCFullYear() + 1);
    const newDateStr = newDate.toISOString().slice(0, 10);
    const newValidUntilStr = newDateStr + "T00:00:00Z"; // keep the same string type/format as the original field

    const newChunkText = doc.chunk_text.split(oldDateStr).join(newDateStr);
    const newAutoEmbedText = doc.auto_embed_text
      ? doc.auto_embed_text.split(oldDateStr).join(newDateStr)
      : doc.auto_embed_text;

    await coll.updateOne(
      { _id: doc._id },
      {
        $set: {
          valid_until: newValidUntilStr,
          chunk_text: newChunkText,
          auto_embed_text: newAutoEmbedText
        }
      }
    );
    renewed++;
  }

  const summary = {
    checked: candidates.length,
    renewed,
    skipped_count: skipped.length,
    skipped,
    permanently_excluded: EXCLUDED_DOC_IDS,
    ran_at: now.toISOString()
  };

  console.log(JSON.stringify(summary));
  return summary;
};

```
