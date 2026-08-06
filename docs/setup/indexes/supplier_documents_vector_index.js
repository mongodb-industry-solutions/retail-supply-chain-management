// supplier_documents — Vector Search index with Automated Embedding (autoEmbed)
// The semantic half of the hybrid search alternative_finder runs over
// supplier paperwork chunks (certificates, contracts, audit reports).
// Filters let it scope retrieval to one supplier and/or one document type.
//
// Pairs with supplier_documents_fulltext_index.js — both are needed for the
// $rankFusion pipeline; either one alone gives you half the recall.
//
// Requires a Voyage AI Model API key at project level:
//   Atlas → Project Settings → AI Models → Model API Keys
//
// Run with:
//   mongosh "<your-connection-string>" --file supplier_documents_vector_index.js
//
// Check build status with:
//   db.supplier_documents.getSearchIndexes()

db = db.getSiblingDB("retail-supply-chain-risk");

db.supplier_documents.createSearchIndex(
  "supplier_documents_vector_index",
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
      { type: "filter", path: "doc_type" }
    ]
  }
);
