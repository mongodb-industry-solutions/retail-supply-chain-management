// supplier_documents — Atlas Search (full-text) index on `chunk_text`
// The lexical half of the hybrid search: catches exact terms a semantic
// search can miss — certificate numbers, standard names ("ISO 14001"),
// clause wording. Static mapping (`dynamic: false`) so only `chunk_text`
// is indexed; nothing else in the document needs full-text search.
//
// Pairs with supplier_documents_vector_index.js under $rankFusion.
// No Voyage API key needed for this one — it's plain Lucene.
//
// Run with:
//   mongosh "<your-connection-string>" --file supplier_documents_fulltext_index.js
//
// Check build status with:
//   db.supplier_documents.getSearchIndexes()

db = db.getSiblingDB("retail-supply-chain-risk");

db.supplier_documents.createSearchIndex(
  "supplier_documents_fulltext_index",
  "search",
  {
    mappings: {
      dynamic: false,
      fields: {
        chunk_text: {
          type: "string",
          analyzer: "lucene.standard"
        }
      }
    }
  }
);
