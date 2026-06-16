export const simulatedExternalConditions = [
  {
    type: "logistical",
    title: "Red Sea Corridor Disruption Detected",
    description:
      "Expected logistics delays for suppliers dependent on the Red Sea supply corridor. Estimated 7-14 day delays for shipments rerouting via Cape of Good Hope.",
    severity: "high",
    region: "Middle East / Suez Canal",
  },
  {
    type: "geopolitical",
    title: "Eastern European Trade Route Instability",
    description:
      "Escalating sanctions and border restrictions affecting cross-border freight. Alternative routing through Baltic states recommended for affected suppliers.",
    severity: "high",
    region: "Eastern Europe",
  },
  {
    type: "climate",
    title: "Category 4 Hurricane Approaching Gulf Coast",
    description:
      "Hurricane Maria projected to make landfall near Houston ports within 72 hours. Port operations expected to halt. Pre-position inventory from Gulf Coast warehouses.",
    severity: "high",
    region: "Gulf of Mexico",
  },
];

export const conditionConfig = {
  logistical: {
    label: "Logistical Challenges",
    borderColor: "#d97706",
    bgColor: "#fef3c7",
    color: "#92400e",
    icon: "🚢",
    variant: "yellow",
  },
  geopolitical: {
    label: "Geopolitical Tensions",
    borderColor: "#e11d48",
    bgColor: "#ffe4e6",
    color: "#9f1239",
    icon: "🛡️",
    variant: "red",
  },
  climate: {
    label: "Climate Disruption",
    borderColor: "#0284c7",
    bgColor: "#e0f2fe",
    color: "#075985",
    icon: "⛈️",
    variant: "blue",
  },
};
