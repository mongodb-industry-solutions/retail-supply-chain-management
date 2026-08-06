// agent_memory — Vector Search index with Automated Embedding (autoEmbed)
// Semantic search over past episodes ("has something like this happened to
// this supplier before?"), filtered by supplier and risk type. Both
// risk_evaluator (historical_weight) and alternative_finder (precedent for
// a proposal) read through this index.
//
// Requires a Voyage AI Model API key at project level:
//   Atlas → Project Settings → AI Models → Model API Keys
//
// Run with:
//   mongosh "<your-connection-string>" --file agent_memory_autoembed_index.js
//
// Check build status with:
//   db.agent_memory.getSearchIndexes()

db = db.getSiblingDB("retail-supply-chain-risk");

db.agent_memory.createSearchIndex(
  "agent_memory_autoembed_index",
  "vectorSearch",
  {
    fields: [
      {
        type: "autoEmbed",
        modality: "text",
        path: "auto_embed_text",
        model: "voyage-4"
      },
      { type: "filter", path: "supplier_id" },
      { type: "filter", path: "risk_type" }
    ]
  }
);
