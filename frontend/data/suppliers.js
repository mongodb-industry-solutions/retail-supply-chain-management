const ALL_SUPPLIERS = [
  {
    id: "sup-001",
    name: "Al Rashid Maritime LLC",
    location: "Jeddah, Saudi Arabia",
    country: "Saudi Arabia",
    region: "Middle East / Suez Canal",
    lat: 21.54,
    lng: 39.17,
    category: "Logistics",
    riskLevel: "high",
    severity: "critical",
    riskScore: 92,
    conditionTypes: ["logistical"],
    rpnByCondition: { logistical: { base: 45, updated: 168 } },
    activeOrders: { count: 3, value: "$1.2M" },
    impactReason: "Primary Red Sea shipping route blocked",
    impactDescription:
      "Ships rerouting via Cape of Good Hope — 7–14 day additional delay on all inbound shipments.",
    contractValue: "$2.4M",
    annualShipments: 48,
    leadTime: "14–21 days",
  },
  {
    id: "sup-002",
    name: "EastEuro Components GmbH",
    location: "Warsaw, Poland",
    country: "Poland",
    region: "Eastern Europe",
    lat: 52.23,
    lng: 21.01,
    category: "Manufacturing",
    riskLevel: "high",
    severity: "critical",
    riskScore: 87,
    conditionTypes: ["geopolitical"],
    rpnByCondition: { geopolitical: { base: 42, updated: 154 } },
    activeOrders: { count: 2, value: "$890K" },
    impactReason: "Cross-border freight halted by new sanctions",
    impactDescription:
      "Baltic rerouting required, adding 3–5 days and ~15% cost increase on all components.",
    contractValue: "$1.8M",
    annualShipments: 24,
    leadTime: "21–28 days",
  },
  {
    id: "sup-003",
    name: "Gulf Coast Warehousing Co.",
    location: "Houston, United States",
    country: "United States",
    region: "Gulf Coast",
    lat: 29.76,
    lng: -95.37,
    category: "Warehousing",
    riskLevel: "high",
    severity: "critical",
    riskScore: 94,
    conditionTypes: ["climate"],
    rpnByCondition: { climate: { base: 50, updated: 180 } },
    activeOrders: { count: 5, value: "$340K" },
    impactReason: "Hurricane landfall expected within 72h",
    impactDescription:
      "Port operations suspended. Pre-positioning inventory from Gulf Coast facilities recommended immediately.",
    contractValue: "$890K",
    annualShipments: 120,
    leadTime: "3–5 days",
  },
  
];

export function generateAffectedSuppliers(loadedConditions) {
  if (!loadedConditions?.length) return [];
  const activeTypes = new Set(loadedConditions.map((c) => c.type));

  return ALL_SUPPLIERS.filter((s) => s.conditionTypes.some((t) => activeTypes.has(t)))
    .map((s) => ({
      ...s,
      affectedConditions: s.conditionTypes.filter((t) => activeTypes.has(t)),
    }))
    .sort((a, b) => {
      if (a.severity === "critical" && b.severity !== "critical") return -1;
      if (a.severity !== "critical" && b.severity === "critical") return 1;
      return b.riskScore - a.riskScore;
    });
}

export const simulatedAffectedSuppliers = ALL_SUPPLIERS.map((s) => ({
  ...s,
  affectedConditions: s.conditionTypes,
}));

export const riskConfig = {
  high: { variant: "red", label: "High Risk" },
  medium: { variant: "yellow", label: "Medium Risk" },
  low: { variant: "green", label: "Low Risk" },
};

export const categoryConfig = {
  Logistics: { variant: "blue" },
  Manufacturing: { variant: "purple" },
  Warehousing: { variant: "darkgray" },
};
