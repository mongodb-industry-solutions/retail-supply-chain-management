// external_conditions — 2dsphere index on `epicentre`
// Enables geospatial queries against the physical epicentre of a risk
// condition (storm, port congestion) — e.g. matching suppliers that fall
// inside `impact_radius_km` of an active condition. MongoDB refuses
// $near / $geoNear queries on a field with no 2dsphere index, so this one
// is required whenever a condition carries a location.
//
// Run with:
//   mongosh "<your-connection-string>" --file external_conditions-epicentre-2dsphere.js

db = db.getSiblingDB("retail-supply-chain-risk");

db.external_conditions.createIndex(
  { epicentre: "2dsphere" },
  { name: "epicentre_2dsphere" }
);
