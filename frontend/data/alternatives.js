export const alternativeLayers = [
  "Plan",
  "Funnel",
  "Reflect and Critique",
  "Close"
]

const CERT_BASE = {
  name: "ISO 9001",
  documentModel: {
    cert_type: "ISO 9001:2015",
    multimodal_embedding: "[1536-dim vector]",
  },
};

const ALTERNATIVES = {
  logistical: [
    {
      id: "a1",
      name: "Tijuana Tech Assembly",
      location: "Tijuana, Mexico",
      category: "Electronic Components",
      reliabilityScore: 94,
      rrfScore: 0.0312,
      textScore: 0.0184,
      vectorScore: 0.0128,
      leadTime: "5 days",
      capacityMatch: "85% of required volume",
      priceComparison: "+3% vs current",
      vectorMatchReasons: [
        "Product catalog similarity: 94% match on SKU specifications",
        "Quality certifications overlap: ISO 9001, IATF 16949",
        "No Red Sea route dependency — uses Pacific shipping",
      ],
      cert: {
        ...CERT_BASE,
        sourceType: "pdf",
        sourceFile: "ISO_9001_Certificate_2024.pdf",
        chunk:
          "…certifies that Tijuana Tech Assembly S.A. de C.V. has implemented and maintains a Quality Management System in accordance with ISO 9001:2015 for the scope of: Electronic component assembly and distribution…",
        documentModel: {
          _id: "cert_001",
          supplier_id: "a1",
          cert_type: "ISO 9001:2015",
          issuing_body: "TÜV SÜD",
          valid_from: "2024-01-15",
          valid_to: "2027-01-14",
          scope: "Electronic component assembly",
          multimodal_embedding: "[1536-dim vector]",
        },
      },
    },
    {
      id: "a2",
      name: "Vietnam Precision Co.",
      location: "Ho Chi Minh City, Vietnam",
      category: "Precision Manufacturing",
      reliabilityScore: 89,
      rrfScore: 0.0287,
      textScore: 0.0143,
      vectorScore: 0.0144,
      leadTime: "8 days",
      capacityMatch: "70% of required volume",
      priceComparison: "-8% vs current",
      vectorMatchReasons: [
        "Manufacturing capabilities match: CNC, injection molding",
        "Alternative routing: Pacific → Panama Canal",
        "Previous relationship: 2 successful pilot orders",
      ],
      cert: {
        ...CERT_BASE,
        sourceType: "pdf",
        sourceFile: "VPC_ISO9001_2023.pdf",
        chunk:
          "…Vietnam Precision Co., Ltd. is certified to ISO 9001:2015 Quality Management System standards for precision machining, CNC operations, and injection molding services…",
        documentModel: {
          _id: "cert_003",
          supplier_id: "a2",
          cert_type: "ISO 9001:2015",
          issuing_body: "Bureau Veritas",
          valid_from: "2023-06-01",
          valid_to: "2026-05-31",
          multimodal_embedding: "[1536-dim vector]",
        },
      },
    },
    {
      id: "a3",
      name: "Guadalajara Electronics",
      location: "Guadalajara, Mexico",
      category: "Electronic Assembly",
      reliabilityScore: 91,
      rrfScore: 0.0261,
      textScore: 0.0156,
      vectorScore: 0.0105,
      leadTime: "4 days",
      capacityMatch: "60% of required volume",
      priceComparison: "+5% vs current",
      vectorMatchReasons: [
        "USMCA compliant — no tariff exposure",
        "Trucking distance: 3 days to US distribution centers",
        "Documentation shows similar component specs",
      ],
      cert: {
        ...CERT_BASE,
        sourceType: "pdf",
        sourceFile: "GE_QMS_Certificate.pdf",
        chunk:
          "…Guadalajara Electronics has demonstrated conformity to ISO 9001:2015 requirements for electronic assembly, PCB manufacturing, and quality control processes…",
        documentModel: {
          _id: "cert_005",
          supplier_id: "a3",
          cert_type: "ISO 9001:2015",
          issuing_body: "DNV GL",
          valid_to: "2025-09-30",
          multimodal_embedding: "[1536-dim vector]",
        },
      },
    },
  ],

  geopolitical: [
    {
      id: "a4",
      name: "Czech Industrial Group",
      location: "Prague, Czech Republic",
      category: "Industrial Components",
      reliabilityScore: 96,
      rrfScore: 0.0341,
      textScore: 0.0198,
      vectorScore: 0.0143,
      leadTime: "4 days",
      capacityMatch: "90% of required volume",
      priceComparison: "+12% vs current",
      vectorMatchReasons: [
        "EU-based: No sanctions exposure",
        "Existing EU logistics network",
        "Product specifications 94% match",
      ],
      cert: {
        ...CERT_BASE,
        sourceType: "pdf",
        sourceFile: "CIG_ISO9001_Certificate.pdf",
        chunk:
          "…Czech Industrial Group a.s. maintains a Quality Management System certified to ISO 9001:2015 for industrial component manufacturing and precision engineering…",
        documentModel: {
          _id: "cert_007",
          supplier_id: "a4",
          cert_type: "ISO 9001:2015",
          issuing_body: "TÜV Rheinland",
          valid_to: "2026-03-15",
          multimodal_embedding: "[1536-dim vector]",
        },
      },
    },
    {
      id: "a5",
      name: "Austrian Steel AG",
      location: "Vienna, Austria",
      category: "Raw Materials",
      reliabilityScore: 92,
      rrfScore: 0.0308,
      textScore: 0.0172,
      vectorScore: 0.0136,
      leadTime: "3 days",
      capacityMatch: "100% of required volume",
      priceComparison: "+18% vs current",
      vectorMatchReasons: [
        "Material grade specifications match",
        "Stable supply chain — Western Europe sourcing",
        "REACH compliant for EU market requirements",
      ],
      cert: {
        ...CERT_BASE,
        sourceType: "pdf",
        sourceFile: "ASAG_QMS_2024.pdf",
        chunk:
          "…Austrian Steel AG has been assessed and certified as meeting the requirements of ISO 9001:2015 for steel production and processing…",
        documentModel: {
          _id: "cert_009",
          supplier_id: "a5",
          cert_type: "ISO 9001:2015",
          issuing_body: "Quality Austria",
          valid_to: "2027-01-31",
          multimodal_embedding: "[1536-dim vector]",
        },
      },
    },
  ],

  climate: [
    {
      id: "a6",
      name: "Phoenix Chemical Supply",
      location: "Phoenix, AZ",
      category: "Chemical Supplies",
      reliabilityScore: 91,
      rrfScore: 0.0329,
      textScore: 0.0201,
      vectorScore: 0.0128,
      leadTime: "3 days",
      capacityMatch: "100% of required volume",
      priceComparison: "+7% vs current",
      vectorMatchReasons: [
        "Inland location: Zero hurricane exposure",
        "Chemical formulations match 95% of current specs",
        "Rail connection to major distribution hubs",
      ],
      cert: {
        ...CERT_BASE,
        sourceType: "pdf",
        sourceFile: "Phoenix_Chem_ISO9001.pdf",
        chunk:
          "…Phoenix Chemical Supply Inc. is certified to ISO 9001:2015 for chemical manufacturing, blending, and distribution services…",
        documentModel: {
          _id: "cert_011",
          supplier_id: "a6",
          cert_type: "ISO 9001:2015",
          issuing_body: "NSF International",
          valid_to: "2025-08-31",
          multimodal_embedding: "[1536-dim vector]",
        },
      },
    },
    {
      id: "a7",
      name: "Denver Packaging Solutions",
      location: "Denver, CO",
      category: "Packaging Materials",
      reliabilityScore: 93,
      rrfScore: 0.0294,
      textScore: 0.0165,
      vectorScore: 0.0129,
      leadTime: "4 days",
      capacityMatch: "80% of required volume",
      priceComparison: "+4% vs current",
      vectorMatchReasons: [
        "Mountain West location — climate stable",
        "Packaging specs compatible with current lines",
        "Intermodal shipping options available",
      ],
      cert: {
        ...CERT_BASE,
        sourceType: "pdf",
        sourceFile: "DPS_Quality_Cert.pdf",
        chunk:
          "…Denver Packaging Solutions LLC maintains ISO 9001:2015 certification for packaging design, manufacturing, and fulfillment services…",
        documentModel: {
          _id: "cert_013",
          supplier_id: "a7",
          cert_type: "ISO 9001:2015",
          issuing_body: "Intertek",
          valid_to: "2026-02-28",
          multimodal_embedding: "[1536-dim vector]",
        },
      },
    },
    {
      id: "a13",
      name: "Salt Lake Chemical Co.",
      location: "Salt Lake City, UT",
      category: "Chemical Supplies",
      reliabilityScore: 88,
      rrfScore: 0.0258,
      textScore: 0.0142,
      vectorScore: 0.0116,
      leadTime: "4 days",
      capacityMatch: "85% of required volume",
      priceComparison: "+9% vs current",
      vectorMatchReasons: [
        "High-altitude inland: zero storm surge risk",
        "Chemical formulation 86% overlap with current supplier",
        "Western corridor trucking routes stable",
      ],
      cert: {
        ...CERT_BASE,
        sourceType: "pdf",
        sourceFile: "SLC_Chem_ISO9001.pdf",
        chunk:
          "…Salt Lake Chemical Co. is certified to ISO 9001:2015 and ISO 14001:2015 for chemical manufacturing and environmentally responsible operations…",
        documentModel: {
          _id: "cert_015",
          supplier_id: "a13",
          cert_type: "ISO 9001:2015",
          issuing_body: "SGS",
          valid_to: "2026-08-31",
          multimodal_embedding: "[1536-dim vector]",
        },
      },
    },
  ],
};

export function generateAlternatives(alertType) {
  return ALTERNATIVES[alertType] ?? [];
}
