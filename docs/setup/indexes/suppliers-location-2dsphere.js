// suppliers — 2dsphere index on `location`
// Enables $geoNear proximity search over supplier coordinates
// (alternative_finder: "which alternative suppliers are closest to the
// affected distribution point?").
//
// Run with:
//   mongosh "<your-connection-string>" --file suppliers-location-2dsphere.js

db = db.getSiblingDB("retail-supply-chain-risk");

db.suppliers.createIndex(
  { location: "2dsphere" },
  { name: "location_2dsphere" }
);
