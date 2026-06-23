"use client";

import { useState } from "react";
import { useSelector } from "react-redux";
import { Modal } from "react-bootstrap";
import Card from "@leafygreen-ui/card";
import Button from "@leafygreen-ui/button";
import { Badge } from "@leafygreen-ui/badge";
import { Body, Subtitle, Overline } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import { Code } from "@leafygreen-ui/code";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

import SectionHeader from "../shared/SectionHeader";
import SupplierTitle from "../shared/SupplierTitle";
import ReActAgent from "../shared/ReActAgent";
import LogDrawer from "../shared/LogDrawer";
import WhyMongoDB from "../shared/WhyMongoDB";
import AlternativeCard from "./AlternativeCard";
import { generateAlternatives } from "../../data/alternatives";
import { conditionConfig } from "../../data/externalConditions";
import BehindTheScenes from "./BehindTheScenes";

const AGENT_PHASES = [
  {
    name: "Hybrid Search + Voyage Reranking",
    steps: [
      "Hybrid Search: retrieving top 13 candidates",
      "Voyage Rerank: refine top 5",
    ],
  },
  {
    name: "Reflect & Critique (per supplier)",
    steps: [
      "Validating certifications",
      "Validating correct scope",
      "Validating lead time",
      "Validating capacity",
    ],
  },
];

const AGENT_LOG_PHASES = [
  {
    name: "Hybrid Search + Voyage Reranking",
    steps: [
      {
        name: "Hybrid Search: retrieving top 13 candidates",
        logs: [
          "Generating query embedding via Voyage AI (1536-dim)...",
          "Running $vectorSearch on supplier_capabilities index...",
          "Merging with full-text BM25 scores via Reciprocal Rank Fusion...",
          "Top 13 candidates retrieved (RRF scores: 0.031–0.018)",
        ],
      },
      {
        name: "Voyage Rerank: refine top 5",
        logs: [
          "Sending 13 candidates to Voyage Rerank API...",
          "Reranking by semantic relevance to affected supplier profile...",
          "Top 5 suppliers selected for deep validation",
        ],
      },
    ],
  },
  {
    name: "Reflect & Critique (per supplier)",
    steps: [
      {
        name: "Validating certifications",
        logs: [
          "Querying certification documents via multimodal search...",
          "ISO 9001:2015 verified for 4/5 candidates",
          "1 candidate flagged: certification expired",
        ],
      },
      {
        name: "Validating correct scope",
        logs: [
          "Comparing supplier scope against affected supplier profile...",
          "Scope match ≥ 85% for 4/5 remaining candidates",
        ],
      },
      {
        name: "Validating lead time",
        logs: [
          "Checking contract terms and latest data sheets...",
          "All 4 remaining suppliers within acceptable lead time window",
        ],
      },
      {
        name: "Validating capacity",
        logs: [
          "Checking capacity match against required volume...",
          "3/4 suppliers meet ≥ 70% capacity threshold",
          "Final ranking complete — 3 alternatives approved",
        ],
      },
    ],
  },
];

export default function Step3() {
  const selectedSupplier = useSelector((s) => s.Global.selectedSupplier);
  const selectedAlertType = useSelector((s) => s.Global.selectedAlertType);

  const [agentDone, setAgentDone] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [certModal, setCertModal] = useState(null);
  const [escalateOpen, setEscalateOpen] = useState(false);

  const cfg = conditionConfig[selectedAlertType] ?? conditionConfig.logistical;
  const alternatives = agentDone ? generateAlternatives(selectedAlertType) : [];

  if (!selectedSupplier) {
    return (
      <div className="text-center py-5" style={{ color: palette.gray.base }}>
        <Icon glyph="Warning" size="xlarge" />
        <Body style={{ marginTop: spacing[200] }}>
          No supplier selected. Go back to Step 2 and click <strong>Find alternative suppliers</strong> on a
          critical supplier.
        </Body>
      </div>
    );
  }

  return (
    <div>
      {/* ── Affected Supplier ── */}
      <SectionHeader
        title="Affected Supplier"
        subtitle="The agent will search for alternative suppliers to replace this critical supplier."
      />
      <Card style={{ marginBottom: spacing[400] }}>
        <div className="d-flex align-items-start justify-content-between gap-3">
          <div style={{ flex: 1 }}>
            <div className="d-flex align-items-center gap-2 mb-1">
              <SupplierTitle name={selectedSupplier.name} />
              <Badge variant="red">High Risk</Badge>
            </div>
            <Body style={{ color: palette.gray.dark1, margin: "0 0 4px" }}>
              📍 {selectedSupplier.location} · {selectedSupplier.category}
            </Body>
            {selectedSupplier.impactReason && (
              <Body style={{ color: palette.gray.dark2, margin: 0 }}>
                {selectedSupplier.impactReason}
              </Body>
            )}
          </div>
          <Badge variant={cfg.variant ?? "yellow"}>
            {cfg.icon} {cfg.label}
          </Badge>
        </div>
      </Card>

      {/* ── ReAct Agent ── */}
      <ReActAgent
        title="Identifying alternative suppliers"
        subtitle={`The ReAct agent runs a two-stage retrieval pipeline — Hybrid Search + Voyage Rerank — to find the best alternative suppliers for ${selectedSupplier.name}.`}
        phases={AGENT_PHASES}
        onComplete={() => setAgentDone(true)}
        onViewLogs={() => setLogsOpen(true)}
      />

      <LogDrawer
        show={logsOpen}
        onHide={() => setLogsOpen(false)}
        title="Agent Execution Logs"
        subtitle="Hybrid Search + Voyage Rerank — execution trace"
        phases={AGENT_LOG_PHASES}
      />

      {/* ── Alternatives ── */}
      {agentDone && (
        <>
          <SectionHeader
            title="Recommended Alternative Suppliers"
            subtitle="Pre-qualified alternatives ranked from most to least recommended."
          />

          {alternatives.map((alt, idx) => (
            <AlternativeCard
              key={alt.id}
              supplier={alt}
              isFirst={idx === 0}
              onOpenCert={(cert) => setCertModal(cert)}
              onEscalate={() => setEscalateOpen(true)}
            />
          ))}
        </>
      )}

      <BehindTheScenes/>

      {/* ── Cert Modal ── */}
      <Modal show={!!certModal} onHide={() => setCertModal(null)} centered size="lg">
        <Modal.Header closeButton>
          <div className="d-flex align-items-center gap-2">
            <Icon glyph="CurlyBraces" />
            <span style={{ fontWeight: 700 }}>{certModal?.name} — Document Model</span>
          </div>
        </Modal.Header>
        <Modal.Body>
          <WhyMongoDB>
            By converting unstructured data types into high-dimensional vectors,{" "}
            <strong>multimodal search</strong> allows users to find information based on semantic
            meaning and intent — not just keyword matches.
          </WhyMongoDB>

          <div
            className="d-flex align-items-center gap-2 mt-3 mb-3"
            style={{
              background: palette.gray.light3,
              borderRadius: 8,
              padding: `${spacing[200]}px ${spacing[300]}px`,
            }}
          >
            <Icon glyph="File" size="small" style={{ color: palette.gray.dark1 }} />
            <Overline style={{ margin: 0, color: palette.gray.dark1 }}>
              {certModal?.sourceType?.toUpperCase()} · {certModal?.sourceFile}
            </Overline>
          </div>

          <Body
            style={{
              fontStyle: "italic",
              color: palette.gray.dark1,
              marginBottom: spacing[300],
              lineHeight: 1.6,
            }}
          >
            {certModal?.chunk}
          </Body>

          <Code language="json" showLineNumbers darkMode copyButtonAppearance="persist">
            {JSON.stringify(certModal?.documentModel ?? {}, null, 2)}
          </Code>
        </Modal.Body>
      </Modal>

      {/* ── Escalate Modal ── */}
      <Modal show={escalateOpen} onHide={() => setEscalateOpen(false)} centered>
        <Modal.Header
          closeButton
          style={{ background: palette.green.dark1, borderBottom: "none" }}
        >
          <Subtitle style={{ color: "#fff", margin: 0 }}>🎉 Congratulations!</Subtitle>
        </Modal.Header>
        <Modal.Body style={{ padding: spacing[500] }}>
          <Body style={{ lineHeight: 1.7, marginBottom: spacing[300] }}>
            You just ensured the <strong>business remains operationally agile</strong> in the face of
            external conditions — identifying alternative suppliers through semantic discovery and
            multimodal search.
          </Body>

          <Body weight="medium" style={{ display: "block", marginBottom: spacing[100] }}>
            Closing the Loop: Enriching the System&apos;s Memory
          </Body>
          <Body style={{ lineHeight: 1.7, marginBottom: spacing[300] }}>
            Your decision is written back into the{" "}
            <code
              style={{
                background: palette.gray.light3,
                padding: "1px 5px",
                borderRadius: 3,
                fontFamily: "monospace",
              }}
            >
              agent_memory
            </code>{" "}
            collection as a new embedded episode, completely closing the learning loop.
          </Body>

          <WhyMongoDB>
            Because the system uses <strong>Voyage AI embeddings</strong>, the next time a similar
            external condition strikes the agent will retrieve this exact episode via{" "}
            <strong>Vector Search</strong> and automatically adjust the{" "}
            <code style={{ fontFamily: "monospace" }}>historical_weight</code> during real-time risk
            calculations. Every human approval enriches the system&apos;s memory.
          </WhyMongoDB>

          <div className="d-flex justify-content-end mt-3">
            <Button variant="primary" onClick={() => setEscalateOpen(false)}>
              Got it 👍
            </Button>
          </div>
        </Modal.Body>
      </Modal>

    </div>
  );
}
