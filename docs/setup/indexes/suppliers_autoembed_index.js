// suppliers — Vector Search index with Automated Embedding (autoEmbed)
// Semantic search over `auto_embed_text` (the natural-language summary of
// each supplier), filtered by region / product category / status. This is
// how alternative_finder shortlists candidate suppliers by capability
// description rather than by exact field match.
//
// Requires a Voyage AI Model API key configured at project level:
//   Atlas → Project Settings → AI Models → Model API Keys
// With autoEmbed, Atlas calls Voyage on your behalf at index- and
// query-time; you never store vectors yourself.
//
// Run with:
//   mongosh "<your-connection-string>" --file suppliers_autoembed_index.js
//
// Index build is asynchronous — check status with:
//   db.suppliers.getSearchIndexes()

db = db.getSiblingDB("retail-supply-chain-risk");

db.suppliers.createSearchIndex(
  "suppliers_autoembed_index",
  "vectorSearch",
  {
    fields: [
      {
        type: "autoEmbed",
        modality: "text",
        path: "auto_embed_text",
        model: "voyage-4"
      },
      { type: "filter", path: "region" },
      { type: "filter", path: "product_categories" },
      { type: "filter", path: "status" }
    ]
  }
);
