"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { conditionConfig } from "../../data/externalConditions";

const BUILDING_SVG = `<svg height="16" width="16" viewBox="0 0 16 16" style="fill:white;display:block;"><path fill-rule="evenodd" clip-rule="evenodd" d="M1 2C1 1.44772 1.44772 1 2 1H7C7.55228 1 8 1.44772 8 2V7.5V10.5V15H6V13H4V15H1V11H5.5C5.77614 11 6 10.7761 6 10.5C6 10.2239 5.77614 10 5.5 10H1V8H5.5C5.77614 8 6 7.77614 6 7.5C6 7.22386 5.77614 7 5.5 7H1V5H5.5C5.77614 5 6 4.77614 6 4.5C6 4.22386 5.77614 4 5.5 4H1V2ZM9 11H13.5C13.7761 11 14 10.7761 14 10.5C14 10.2239 13.7761 10 13.5 10H9V8H13.5C13.7761 8 14 7.77614 14 7.5C14 7.22386 13.7761 7 13.5 7H9V5C9 4.44772 9.44772 4 10 4H15C15.5523 4 16 4.44772 16 5V15H14V13H12V15H9V11Z"/></svg>`;

function supplierIcon() {
  return L.divIcon({
    html: `<div style="width:32px;height:32px;border-radius:50%;background:#89979b;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,0.4);">${BUILDING_SVG}</div>`,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function FitBounds({ conditions, suppliers }) {
  const map = useMap();

  useEffect(() => {
    const points = [
      ...conditions.map((c) => [c.lat, c.lng]),
      ...suppliers.map((s) => [s.lat, s.lng]),
    ].filter((p) => p[0] != null && p[1] != null);

    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function LeafletMap({ conditions = [], suppliers = [] }) {
  return (
    <MapContainer
      center={[20, 10]}
      zoom={2}
      style={{ height: 320, width: "100%", borderRadius: 8 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds conditions={conditions} suppliers={suppliers} />

      {conditions.map((c) => (
        <Circle
          key={c.type}
          center={[c.lat, c.lng]}
          radius={c.radiusKm * 1000}
          pathOptions={{
            color: conditionConfig[c.type]?.borderColor ?? "#6b7280",
            fillColor: conditionConfig[c.type]?.borderColor ?? "#6b7280",
            fillOpacity: 0.18,
            weight: 2,
          }}
        />
      ))}

      {suppliers.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={supplierIcon()}
        >
          <Popup>
            <strong style={{ fontSize: 13 }}>{s.name}</strong>
            <br />
            <span style={{ fontSize: 12, color: "#555" }}>{s.location}</span>
            <br />
            <span style={{ fontSize: 12, color: "#dc2626" }}>{s.impactReason}</span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
