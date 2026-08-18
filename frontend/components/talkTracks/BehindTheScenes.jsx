"use client";

import Image from "next/image";
import { Body, H3, Link } from "@leafygreen-ui/typography";
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
        Store raw unstructured business documentation, such as PDFs, emails,
        contracts, and audit reports, from cloud storage directly into MongoDB
        Atlas. The{" "}
        <Link
          href="https://www.mongodb.com/docs/voyageai/models/"
          target="_blank"
        >
          Voyage AI multimodal embedding model auto-embeds chunked documents
        </Link>{" "}
        in any language to enable secure, in-database multimodal and
        multilingual search.
      </Body>
    ),
  },
  {
    title: "Decouple from the ERP",
    description: (
      <Body style={bodyStyle}>
        An ERP enforces business rules and owns transactional workflows.
        Leave it there. Stream its supplier and order data into Atlas through
        CDC, and let agents read from that copy instead of the ERP directly.
        This decoupling is the point: new capabilities evolve above the ERP,
        on their own timeline.
      </Body>
    ),
  },
  {
    title: "External Risk Signal Ingestion",
    description: (
      <Body style={bodyStyle}>
        Pull real-world logistics, geopolitical, and climate data into the
        operational data layer. This external risk data originates from
        sources like Marine Traffic, the National Oceanic and Atmospheric
        Administration (NOAA), and global news feeds. In this solution, the
        ingestion engine generates three demo trigger signals per session to
        initialize the flow.
        <br />
        <br />
        Process raw external signals through the{" "}
        <Link
          href="https://github.com/mongodb-industry-solutions/retail-supply-chain-management/blob/main/backend/ingestion_engine/README.md"
          target="_blank"
        >
          Ingestion Engine
        </Link>
        . The engine translates external disruption events into normalized
        internal business language and writes structured signals to MongoDB
        Atlas.
      </Body>
    ),
  },
  {
    title: "Supplier Risk Evaluation (Risk Evaluator Agent)",
    description: (
      <Body style={bodyStyle}>
        Trigger the{" "}
        <Link
          href="https://github.com/mongodb-industry-solutions/retail-supply-chain-management/tree/main/backend/risk_evaluator#readme"
          target="_blank"
        >
          Risk Evaluator Agent
        </Link>{" "}
        when normalized signals land in MongoDB Atlas. The agent reads
        operational data and agent memory, performs{" "}
        <Link
          href="https://www.mongodb.com/docs/drivers/java/sync/current/crud/query-documents/geo/"
          target="_blank"
        >
          geospatial matching
        </Link>{" "}
        (<Mono>$geoWithin</Mono>), calculates dynamic RPN, and writes
        evaluations back to the database.
      </Body>
    ),
  },
  {
    title: "Alternative Supplier Discovery (Alternative Supplier Finder Agent)",
    description: (
      <Body style={bodyStyle}>
        Activate the Alternative Supplier{" "}
        <Link
          href="https://github.com/mongodb-industry-solutions/retail-supply-chain-management/blob/main/backend/alternative_finder/README.md"
          target="_blank"
        >
          Finder Agent
        </Link>{" "}
        when a manager selects an affected supplier. The agent queries
        document chunks using multimodal{" "}
        <Link href="https://www.mongodb.com/docs/vector-search/" target="_blank">
          vector search
        </Link>
        ,{" "}
        <Link
          href="https://www.mongodb.com/docs/vector-search/hybrid-search/hybrid-search-overview/"
          target="_blank"
        >
          hybrid search
        </Link>{" "}
        (<Mono>$rankFusion</Mono>), and{" "}
        <Link
          href="https://www.mongodb.com/company/blog/product-release-announcements/improving-agent-retrieval-native-reranking-hybrid-search"
          target="_blank"
        >
          native reranking
        </Link>{" "}
        (
        <Link
          href="https://www.mongodb.com/docs/vector-search/query/aggregation-stages/rerank/"
          target="_blank"
        >
          <Mono>$rerank</Mono>
        </Link>
        ) to find compliant alternative suppliers, writing candidate options
        to MongoDB Atlas.
      </Body>
    ),
  },
  {
    title: "Memory Enrichment",
    description: (
      <Body style={bodyStyle}>
        <Mono>risk_evaluator</Mono> scores each disruption with a dynamic Risk
        Priority Number (RPN). Memory feeds directly into that score, before
        the agent finalizes it.
        <br />
        <br />
        It queries <Mono>agent_memory</Mono> twice per assessment: once for
        the supplier&apos;s own history, once for cross-supplier precedent by
        risk type. <Mono>alternative_finder</Mono> follows the same logic on
        the sourcing side. It checks a candidate&apos;s track record and pulls
        semantic precedent from similar suppliers, before it ranks anyone.
        <br />
        <br />
        This is where MongoDB does the real work. Memory has two shapes:
        structured fact (&quot;this exact thing happened&quot;) and semantic
        similarity (&quot;something like this happened&quot;). Most stacks
        split these across two systems: one database for facts; one vector
        store for similarity. Here, one collection holds both. An exact{" "}
        <Mono>find</Mono> and a <Mono>$vectorSearch</Mono> query hit the same
        documents, because structured fields and embedded text live side by
        side.
      </Body>
    ),
  },
];

const BehindTheScenes = () => {
  return (
    <Container>
      <H3 style={{ marginBottom: spacing[300] }}>Architecture overview</H3>

      <Body style={bodyStyle}>
        An agent reasons with whatever reaches its context window, not with
        everything it knows. Every agent decision depends on prior data
        filtering. The data layer surfaces, filters, and ranks information
        first. Treat MongoDB Atlas as this{" "}
        <Link
          href="https://www.mongodb.com/company/blog/innovation/production-ready-agents-need-production-ready-data-platform"
          target="_blank"
        >
          context layer.
        </Link>{" "}
        Atlas decides what evidence deserves tokens before agents reason.
      </Body>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        An agent reasoning through live disruptions runs geospatial matching,
        vector search, and full-text search. The agent also executes
        reranking and memory lookups. Round-trips between separate databases,
        vector stores, and search engines slow down agents. Run all queries
        inside MongoDB Atlas aggregation pipelines. One API replaces the
        entire stack.
      </Body>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        Context control is also cost control.{" "}
        <Link
          href="https://www.mongodb.com/company/blog/technical/why-multi-agent-systems-need-memory-engineering"
          target="_blank"
        >
          Multi-agent systems consume up to 15x more tokens
        </Link>{" "}
        than single chats. Redundant retrieval increases costs. Control model
        context to control your budget.
      </Body>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        Suppliers, disruption signals, and compliance evidence change
        constantly. Use MongoDB&apos;s flexible document model to store this
        variation in one collection.
      </Body>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        Global supply chains generate evidence in many languages.{" "}
        <Link
          href="https://www.mongodb.com/docs/voyageai/models/text-embeddings/?client=python"
          target="_blank"
        >
          Voyage AI maps multilingual evidence
        </Link>{" "}
        into one shared vector space.{" "}
        <Link
          href="https://www.mongodb.com/company/blog/product-release-announcements/ai-search-for-agents-announcing-automated-embedding-atlas"
          target="_blank"
        >
          Atlas Auto-Embedding synchronizes these vectors
        </Link>
        . Multilingual retrieval becomes a native database property instead
        of an external service.
      </Body>

      <Body style={{ ...bodyStyle, marginTop: spacing[200] }}>
        The diagram below shows this end-to-end architecture. The following
        steps outline this workflow. Trace signals from raw external feeds to
        approved alternative suppliers. Each step explains these database
        capabilities in detail.
      </Body>

      <Image
        src="/images/behindTheScenes/ArchitectureOverview.svg"
        alt="Architecture overview: MongoDB Atlas as a unified operational data layer connecting document ingestion, external risk signals, the risk evaluator and alternative supplier finder agents, and the ERP source system"
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