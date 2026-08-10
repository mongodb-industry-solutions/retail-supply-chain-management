"use client";

import Image from "next/image";
import { Body, H3 } from "@leafygreen-ui/typography";
import { OrderedList, OrderedListItem } from "@leafygreen-ui/ordered-list";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import { Container } from "react-bootstrap";

const bodyStyle = { color: palette.gray.dark2, fontSize: 15 };

function Mono({ children }) {
  return (
    <code
      style={{
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: "0.9em",
        color: palette.green.dark2,
      }}
    >
      {children}
    </code>
  );
}

function Lead({ children }) {
  return (
    <strong style={{ color: palette.gray.dark3, fontWeight: 700 }}>
      {children}
    </strong>
  );
}

const steps = [
  {
    title: "Unstructured Document Ingestion",
    description: (
      <Body style={bodyStyle}>
        Store raw unstructured business documentation—including PDFs, emails,
        contracts, and audit reports—from cloud storage directly into MongoDB
        Atlas. The Voyage AI multimodal embedding model auto-embeds chunked
        documents in any language to enable secure, in-database multimodal and
        multilingual search.
      </Body>
    ),
  },
  {
    title: "External Risk Signal Streaming",
    description: (
      <Body style={bodyStyle}>
        Stream real-world logistics, geopolitical, and climate data into the
        operational data layer. This external risk data originates from sources
        like Marine Traffic, NOAA, and global news feeds; in this solution, the
        ingestion engine generates three demo trigger signals per session to
        initialize the flow.
      </Body>
    ),
  },
  {
    title: "Disruption Normalization (Ingestion Engine)",
    description: (
      <Body style={bodyStyle}>
        Process raw external signals through the Ingestion Engine. The engine
        translates external disruption events into normalized internal business
        language and writes structured signals to MongoDB Atlas.
      </Body>
    ),
  },
  {
    title: "Supplier Risk Evaluation (Risk Evaluator Agent)",
    description: (
      <Body style={bodyStyle}>
        Trigger the Risk Evaluator Agent when normalized signals land in Atlas.
        The agent reads operational data and agent memory, performs geospatial
        matching (<Mono>$geoWithin</Mono>), calculates dynamic Risk Priority
        Numbers (RPN) via a ReAct loop, and writes evaluations back to the
        database.
      </Body>
    ),
  },
  {
    title: "Alternative Supplier Discovery (Alternative Sup. Finder Agent)",
    description: (
      <Body style={bodyStyle}>
        Activate the Alternative Sup. Finder Agent when a manager selects an
        affected supplier. The agent queries document chunks using multimodal
        vector search, hybrid search (<Mono>$rankFusion</Mono>), and native
        reranking (<Mono>$rerank</Mono>) to find compliant alternative
        suppliers, writing candidate options to MongoDB Atlas.
      </Body>
    ),
  },
  {
    title: "Memory Enrichment & Decision Loop",
    description: (
      <Body style={bodyStyle}>
        Final approval always comes from a human, such as a procurement manager
        reviewing candidate shortlists in the UI. Upon human approval, the
        system writes the selection back into MongoDB Atlas, enriching agent
        memory so future evaluations learn from real human decisions.
      </Body>
    ),
  },
  {
    title: "Downstream Enterprise Synchronization",
    description: (
      <Body style={bodyStyle}>
        Synchronize approved purchase orders and operational updates downstream
        from MongoDB Atlas to any internal system that requires this data. For
        example, use Change Data Capture (CDC) via Change Streams to update
        legacy ERP and procurement software in real time.
      </Body>
    ),
  },
];

const BehindTheScenes = () => {
  return (
    <Container>
      <H3 style={{ marginBottom: spacing[300] }}>Architecture overview</H3>

      <Body style={bodyStyle}>
        At the core of this architecture sits{" "}
        <Lead>MongoDB Atlas as a unified Operational Data Layer (ODL).</Lead>{" "}
        Rather than stitching together separate operational databases, vector
        stores, and search engines, Atlas serves as the single source of truth.
        It stores operational business entities, manages short- and long-term
        agent memory, and natively executes multimodal vector search, hybrid
        search (<Mono>$rankFusion</Mono>), geospatial queries (
        <Mono>$geoNear</Mono>), and in-pipeline reranking (<Mono>$rerank</Mono>)
        without sending data to external systems.
      </Body>

      <Image
        src="/images/behindTheScenes/ArchitectureOverview.svg"
        alt="Architecture overview: MongoDB Atlas as a unified operational data layer connecting document ingestion, external risk signals, the risk evaluator and alternative supplier finder agents, and downstream enterprise systems"
        width={960}
        height={540}
        style={{
          width: "100%",
          height: "auto",
          borderRadius: 10,
          border: `1px solid ${palette.gray.light2}`,
          margin: `${spacing[400]}px 0`,
        }}
      />

      <OrderedList>
        {steps.map((step) => (
          <OrderedListItem
            key={step.title}
            title={step.title}
            description={step.description}
          />
        ))}
      </OrderedList>
    </Container>
  );
};

export default BehindTheScenes;
