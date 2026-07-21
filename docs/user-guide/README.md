# Intelligen Supplier Hub – User Guide

This guide walks you through the Intelligent Supplier Hub demo step by step. It covers every section of the UI, what each element does, and what MongoDB capability it demonstrates — so you can navigate the demo confidently and understand what is happening at each stage.

---

## Overview

The **Intelligent Supplier Hub** is an AI-powered supplier management portal built for a large grocery superstore retailer. The primary user is a **Supply Chain Manager** — responsible for maintaining supplier continuity and product availability across the retailer's distribution network.
 
The demo walks through a realistic disruption scenario: external conditions arrive simultaneously (a geopolitical instability, a logistical challenge and a climate disruption), an AI agent identifies which suppliers are at risk, and the manager finds and approves a qualified alternative — all from a single interface.
 
When you open the demo you will see a single-page application with three main areas:
 
- A **navbar** at the top
- A **stepper** below the navbar showing the three phases of the demo
- A **content area** that changes depending on which step you are on

The demo follows a linear narrative across three steps. Each step unlocks automatically as you progress — you cannot jump ahead to a step you have not reached yet, but you can always navigate back to a previous step by clicking it in the stepper.
 
[screenshot — full page overview on load]

---

## Navigation

### Navbar

The navbar is always visible at the top of the page. It shows the name of the application on the left and a **Session ID** on the right for the current demo session.

### Stepper

The stepper sits below the navbar and shows your position across the three steps:

| Step | Name |
|---|---|
| 1 | External Conditions |
| 2 | Identify Affected Suppliers |
| 3 | Search for Alternative Suppliers |

Steps are grouped into two phases shown by a brace below the step labels:
- **Phase 1** — covers Steps 1 and 2
- **Phase 2** — covers Step 3

Completed steps show a green tick. The active step is highlighted in green. Future steps that have not been reached yet are greyed out and are not clickable.

[screenshot — stepper with step 1 active]

---

## Step 1 · External Conditions

This is the starting point of the demo. It contains three sections: the **External Conditions simulation**, the **Dashboard**, and the **How Alerts Are Generated** card.

[screenshot — Step 1 full view]

---

### External Conditions

This section simulates the arrival of real-time external risk signals into the system.

**How to use it:**

1. Click the **▶ Start Simulation** button in the top right of the section.
2. Three external condition cards appear simultaneously — one for each risk type.

[screenshot — three condition cards visible after simulation]

**The three condition types are:**

| Type |
|---|
| 🚢 Logistical Challenges |
| 🛡️ Geopolitical Tensions | 
| ⛈️ Climate Disruption | 

Each card shows the condition title, a short description, and the affected region.

Once all three conditions are visible, a **"Go to supplier impact analysis →"** button appears at the bottom right. Clicking it advances you to Step 2.

> **Demo note:** In this demo, advancing to Step 2 is a manual action to make the workflow easy to follow. In a real production system, the Impact Analyst agent would trigger automatically the moment new external conditions arrive — continuously running in the background without any manual intervention required. The step-by-step structure here is purely for demonstration purposes.

[screenshot — Go to supplier impact analysis button]

---

### Dashboard

The Dashboard section sits below the External Conditions simulation and displays 4 embedded **Atlas Charts** charts — each pulling live data from the `external_conditions` collection in MongoDB Atlas.

[screenshot — Dashboard section with three charts]

**Clicking Learn More** opens a modal with information about Atlas Charts and links to real customer stories.

[screenshot — Learn More modal]

> **MongoDB capability:** All three charts are embedded directly in the application. There is no separate BI tool and no data export — the operational data and the analytics live in the same MongoDB Atlas platform.

---

## Step 2 · Identify Affected Suppliers

You arrive at Step 2 after clicking **"Go to supplier impact analysis →"** at the bottom of Step 1. The content area updates to show the supplier impact analysis workflow.

[screenshot — Step 2 full view on arrival]

Step 2 contains three sections: **Supplier Impact Analysis**, **Identifying Affected Suppliers** (the ReAct Agent) and **Affected Suppliers** (the results).

---

### Supplier Impact Analysis

At the top of Step 2 you will see a compact list of the three external conditions that were loaded in Step 1.

[screenshot — External Conditions compact list]

**Clicking the `{}` button** on any condition row opens a modal showing the **MongoDB document model** for that condition. This is the actual document structure stored in the `external_conditions` collection.

[screenshot — document model modal open]

---

### Identifying Affected Suppliers — ReAct Agent

This is where the AI agent reasons across all active conditions and determines which suppliers are at risk.

**Agent status:**

| Status | What It Means |
|---|---|
| 🟢 Active (pulsing) | The agent is currently processing |
| ⚫ Idle | The agent has finished and results are ready |

The log steps appear one by one. Each step shows a spinning loader while it is running, which turns into a **green tick** once complete.

[screenshot — all four logs complete with green ticks, agent Idle]

Once the agent is finished identifying affected suppliers and is in Idle state, the **"See full logs →"** button becomes active. Clicking it opens the **Agent Full Logs drawer** from the right side of the screen.

The drawer shows a **log stream** on the right showing the agent's reasoning steps in real time

[screenshot — full logs drawer open]

> **MongoDB capability:** The ReAct agent is orchestrated by LangGraph and uses MongoDB as both its retrieval layer (Vector Search) and its memory backend (`langgraph-checkpoint-mongodb` for short-term state, `langgraph-store-mongodb` for long-term episodic memory).

---

### Affected Suppliers

After the agent finishes, a two-column layout appears below the agent section showing the **supplier list** on the left and the **Impact Zone Map** on the right.

[screenshot — two column layout with suppliers and map]

#### Supplier List

The list always shows **affected suppliers**, sorted from most to least critical. 

Each supplier card shows:

- The supplier name, location, and category
- A severity tag (CRITICAL or HIGH) in the top right corner of the card
- **Reason:** a description of why this supplier is affected by the current conditions
- **Affected by:** the specific external condition(s) impacting this supplier, shown as colour-coded badges. Each badge displays the actual condition title (e.g. "Red Sea Corridor Disruption Detected") with the condition type icon. Hovering over a badge shows the condition category name (e.g. "Logistical Challenges").
- Next to each condition badge, the **dynamic RPN** (Risk Priority Number) shows the baseline score and the updated elevated score — for example `RPN: 45 → 168`. This shows how much the agent has adjusted the risk score in the context of the current disruption.

[screenshot — supplier card detail showing Reason, Affected by, and RPN]

> **Note:** If a supplier is affected by more than one external condition (for example both a logistical and a geopolitical disruption), you will see multiple condition badges with individual RPN values, one per condition.

**CRITICAL affected suppliers** have a **"Find alternative suppliers →"** button at the bottom right of their card. Clicking this advances you to Step 3. **HIGH severity suppliers** do not show this button.

#### Impact Zone Map

The map on the right of the screen shows the geographic context of the disruptions.

[screenshot — map with geofence zones and supplier pins]

**Geofence zones:** each active external condition is represented by a colour-coded dashed polygon on the map, labelled with the affected zone name (e.g. "Red Sea Corridor", "Eastern Europe", "Gulf Coast"). The zones pulse gently to indicate they are live conditions.

**Supplier pins:** each affected supplier is shown as a teardrop pin on the map. Red pins indicate CRITICAL suppliers and amber pins indicate HIGH severity suppliers.

**Interaction:** clicking over a supplier card in the list highlights the corresponding pin on the map — the pin enlarges, pulses, and shows a tooltip with the supplier name. This also works in reverse: hovering a pin on the map highlights the corresponding card.

[screenshot — hovered supplier with highlighted pin]

**Viewing the aggregation pipeline:** above the two-column layout there is a **"View geospatial aggregation pipeline"** link. Clicking it expands a code block showing the MongoDB `$geoWithin` / `$centerSphere` query used to identify suppliers within the impact radius.

[screenshot — geospatial query expanded]

Below the query is a **🍃 Why MongoDB?** callout explaining how MongoDB handles both GeoJSON objects and legacy coordinate pairs natively, without any external GIS tooling.

---

## Step 3 · Search for Alternative Suppliers

You arrive at Step 3 after clicking **"Find alternative suppliers →"** on any CRITICAL supplier card in Step 2. The content area updates to show the alternative sourcing workflow.

Step 3 contains three sections: **Affected Supplier**, **Identifying Alternative Suppliers** (the ReAct Agent) and **Recommended Alternative Suppliers**.

---

### Affected Supplier

At the top of Step 3 you will see a header:

- Title: **"Affected Supplier"**
- Subtitle: **"This is the affected supplier for which the agent will search for alternative suppliers."**

Below the header is a card showing the supplier you selected in Step 2 — their name, location, category, and the external condition type that triggered the search.

[screenshot — Affected Supplier card]

---

### Identifying Alternative Suppliers — ReAct Agent

This section mirrors the agent section from Step 2 but runs a more complex **two-phase retrieval pipeline**.

[screenshot — Step 3 ReAct agent with two-column logs]

- Title: **"Identifying alternative suppliers"**
- Subtitle: explains that the ReAct agent runs a two-stage retrieval pipeline over supplier documents to find the best alternatives for the selected supplier (the supplier name is shown in **bold**)

The agent logs are displayed in **two columns**, running sequentially — the left column completes first, then the right column begins.

**Left column — Hybrid Search + Voyage Reranking:**

1. Hybrid Search: retrieving top 13 candidates
2. Voyage Rerank: refine top 5

**Right column — Reflect & Critique (per supplier):**

1. Validating certifications
2. Validating correct scope
3. Validating lead time
4. Validating capacity

Each log step shows a spinner while running and a green tick when complete. The agent avatar transitions from **Active** (pulsing green) to **Idle** (grey) when all steps finish.

[screenshot — both columns complete, agent Idle]

Once the agent is Idle, the **"See full logs →"** button becomes active.

#### See Full Logs Drawer

The drawer for Step 3 groups the logs under their two phase titles.

[screenshot — Step 3 full logs drawer]

**Hybrid Search + Voyage Reranking** group:
- **Hybrid Search: retrieving top 13 candidates** — when expanded, shows the actual query sent to MongoDB: `$vectorSearch + $search (Full-Text) + RRF` with the operational pre-filter applied (`region $nin ["CN","TW"]`, `committed_capacity_pct $lt 0.75`). Two tags show the collection accessed (`supplier_documents READ`) and the search method (`Hybrid Search · Vector + Full-Text + RRF`).
- **Voyage Rerank: refine top 5** — when expanded, shows the POST request sent to `https://ai.mongodb.com/v1/rerank` with the `rerank-2` model, and the reranking results showing which suppliers were promoted or demoted and why.

**Reflect & Critique (per supplier)** group:
- Four collapsible cards for certification validation, scope validation, lead time validation, and capacity validation. Each contains placeholder content to be filled in.

#### Why MongoDB Callout

At the bottom of the agent section, before the supplier results, is a **🍃 Why MongoDB?** callout. It explains how MongoDB natively combines **advanced AI retrieval mechanisms**, operational database filtering, geospatial awareness, and **multimodal document processing** into a single platform — handling the entire Advanced RAG pipeline for this ReAct agent.

A **✨ Learn More** button in the callout opens a modal titled **"True Hybrid Search with Operational Pre-Filtering in a Single Query"** with additional technical context.

[screenshot — Why MongoDB callout with Learn More button]

---

### Recommended Alternative Suppliers

After the agent finishes, a list of **5 alternative suppliers** appears, ordered from most to least recommended.

[screenshot — alternative supplier list]

The section header shows:
- Title: **"Recommended Alternative Suppliers"**
- Subtitle: **"Pre-qualified alternative suppliers from the most to the least recommended."**

Above the collapsible validation rows inside each card, there is a note explaining why multimodal search matters: *"Instead of manually cross-referencing PDFs, spreadsheets and emails, multimodal search allows users to query unstructured data directly."*

#### Reading an Alternative Supplier Card

Each card contains:

**Header row**
- 🏭 factory icon
- Supplier name, location, and category
- An **RRF score** badge (e.g. ⭐ 0.0312) in the top right — this is the combined Reciprocal Rank Fusion score from the Hybrid Search. Hovering the ⓘ icon next to the score shows the tooltip **"Combined RRF (Vector + text contributions)"**.

[screenshot — RRF score badge with tooltip visible]

**RRF contribution bar**
Directly below the score badge is a segmented bar showing how much of the score came from **Text search** (blue) versus **Vector search** (green), with the raw sub-scores shown in monospace below each end. This varies per supplier, reflecting genuine differences in how they were retrieved.

[screenshot — RRF contribution bar]

**Stats row**
A four-column grid showing Reliability %, Lead Time, Capacity, and Price comparison against the current supplier.

**Collapsible validation rows**
Four rows that can be expanded individually:

| Row | Status | Document Types |
|---|---|---|
| Compliant with ISO 9001 | ✅ Green tick | PDF |
| Lead time | ✅ Green tick | TXT, PDF |
| Sustainability audit | ✅ or ❌ (top supplier passes, others fail) | PDF, JPG |
| Multimodal evidence | ✅ Green tick | JPG, PNG, PDF, TXT |

Document type tags (PDF, JPG, TXT, etc.) are shown inline in the row header next to the title — these indicate what types of documents the agent searched to validate that criterion.

[screenshot — collapsible rows with tags visible]

**Expanding the ISO 9001 row**

When you expand **Compliant with ISO 9001**, you will see:
- The source file badge (PDF), filename, page number, and MongoDB document `_id`
- An **Extracted Content** label above a preview of the text chunk extracted from the certificate
- A **📄 View document model** button

[screenshot — ISO 9001 row expanded]

Clicking **📄 View document model** opens a full-page modal showing:
- A **🍃 Why MongoDB?** callout explaining how multimodal search converts different unstructured data types into high-dimensional vectors, allowing retrieval by semantic meaning rather than keyword matching
- The full MongoDB document JSON for that certification, including the `multimodal_embedding: [...]` field showing that the document has been vectorised by Voyage AI

[screenshot — document model modal with Why MongoDB callout]

**Escalate button**

At the bottom right of each alternative supplier card is an **Escalate** button.

Clicking Escalate opens a full-page modal with a green header and the title **"Congratulations!"**

[screenshot — Escalate modal]

The modal contains:
- A confirmation that the **business remains operationally agile in the face of external conditions** by identifying alternative suppliers through semantic discovery and multimodal search
- A **Closing the Loop: Enriching the System's Memory** section explaining that by approving this supplier, the decision is written directly to the `agent_memory` collection as a new embedded episode
- A **🍃 What happens next time?** green callout explaining how Voyage AI embeddings and Vector Search enable the agent to retrieve this exact episode in future disruptions — automatically adjusting risk calculations based on your team's proven decisions

[screenshot — modal body with Closing the Loop and What happens next time sections]

Click **"Got it 👍"** to close the modal.

---

## Summary

| Step | What You Do | What It Shows |
|---|---|---|
| **Step 1** | Start Simulation, explore the Dashboard | External condition ingestion, Atlas Charts embedding |
| **Step 2** | Review the ReAct agent logs, explore the impact map and supplier cards | Geospatial search, Vector Search, dynamic RPN, LangGraph + MongoDB memory |
| **Step 3** | Review alternative suppliers, expand validation rows, click Escalate | Hybrid Search, Voyage AI reranking, multimodal document search, agent memory write-back |