export const RISK_TYPE_MAP = {
  logistics_disruption: "logistical",
  geopolitical_tariff: "geopolitical",
  climate_disruption: "climate",
};

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
