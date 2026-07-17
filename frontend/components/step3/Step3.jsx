"use client";

import { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Modal } from "react-bootstrap";
import Card from "@leafygreen-ui/card";
import Button from "@leafygreen-ui/button";
import { Badge } from "@leafygreen-ui/badge";
import { Body, Subtitle } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";

import SectionHeader from "../shared/SectionHeader";
import SupplierTitle from "../shared/SupplierTitle";
import ReadMore from "../shared/ReadMore";
import ReActAgent from "../shared/ReActAgent";
import LogDrawer from "../shared/LogDrawer";
import WhyMongoDB from "../shared/WhyMongoDB";
import AlternativeCard from "./AlternativeCard";
import CertModal from "./CertModal";
import { conditionConfig, RISK_TYPE_MAP } from "../../data/externalConditions";
import BehindTheScenes from "./BehindTheScenes";
import {
  appendAlternativeSuppliersAgentReasoning,
  setAlternativeSuppliers,
} from "@/redux/slices/GlobalSlice";
import DocModelModal from "../modals/DocModelModal";

export default function Step3() {
  const dispatch = useDispatch();
  const sessionId = useSelector((s) => s.Global.sessionId);
  const selectedSupplier = useSelector((s) => s.Global.selectedSupplier);
  const selectedSupplierAlertTypes = useSelector(
    (s) => s.Global.selectedSupplierAlertTypes,
  );
  const alternativeSuppliersAgentReasoning = useSelector(
    (s) => s.Global.alternativeSuppliersAgentReasoning,
  );
  const alternativeSuppliersAgentCurrentThought = useSelector(
    (s) => s.Global.alternativeSuppliersAgentCurrentThought,
  );
  const alternativeSuppliers = useSelector(
    (s) => s.Global.alternativeSuppliers,
  );
  const agentDone = useSelector((s) => s.Global.alternativeSuppliersAgentDone);
  const [logsOpen, setLogsOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [modalCondition, setModalCondition] = useState(null);

  // Guards against React Strict Mode's intentional double-invoke of mount effects
  // in development. Redux state alone can't guard here because it's only populated
  // AFTER the fetch resolves — both Strict Mode passes run before that, so they'd
  // both pass a state-only check. This ref flips synchronously, before the first
  // await, so the second pass is blocked immediately.
  const startedRef = useRef(false);

  //const cfg = conditionConfig[selectedSupplierAlertTypes] ?? conditionConfig.logistical;

  useEffect(() => {
    if (alternativeSuppliers.length > 0) return; // skip if data already loaded (e.g. real remount)
    if (startedRef.current) return;              // skip if a run has already started (Strict Mode's 2nd pass)
    startedRef.current = true;                   // set BEFORE any await — must stay synchronous

    async function runFindAlternatives() {
      try {
        const response = await fetch("/api/alternative-finder/find", {
          method: "POST",
          headers: {
            "X-Session-ID": sessionId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ evaluationId: selectedSupplier.evaluation_id }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Evaluate failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          const frames = buffer.split("\n\n");
          buffer = frames.pop();
          for (const frame of frames) {
            const line = frame.trim();
            if (line.startsWith("data:")) {
              const event = JSON.parse(line.slice(5).trim());
              console.log("[evaluate]", event.event);
              if (
                event.event === "shortlist_ready" ||
                event.type === "shortlist_ready"
              ) {
                dispatch(setAlternativeSuppliers(event.candidates || []));
              }
              console.log("[atlas_operation]", event);
              dispatch(appendAlternativeSuppliersAgentReasoning(event));
            }
          }
        }
      } catch (err) {
        console.error("[evaluate] stream error", err);
      } finally {
      }
    }

    runFindAlternatives();
  }, []);

  if (!selectedSupplier) {
    return (
      <div className="text-center py-5" style={{ color: palette.gray.base }}>
        <Icon glyph="Warning" size="xlarge" />
        <Body style={{ marginTop: spacing[200] }}>
          No supplier selected. Go back to Step 2 and click{" "}
          <strong>Find alternative suppliers</strong> on a critical supplier.
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
              <SupplierTitle name={selectedSupplier.supplier_name} />
              <Badge variant="red">High Risk</Badge>
            </div>
            <Body style={{ color: palette.gray.dark1, margin: "0 0 4px 0" }}>
              📍 {selectedSupplier.country}
            </Body>
            {selectedSupplier?.product_categories?.map((category) => (
              <Badge key={category} variant="lightgray" className="mt-2 mb-2">
                {category.replace(/_/g, " ").toUpperCase()}
              </Badge>
            ))}
            <ReadMore text={selectedSupplier.natural_language_summary} />
          </div>
          {selectedSupplierAlertTypes.map((alertType) => {
            const cfg =
              conditionConfig[RISK_TYPE_MAP[alertType]] ??
              conditionConfig.logistical;
            return (
              <Badge key={alertType} variant={cfg.variant ?? "yellow"}>
                {cfg.icon} {cfg.label}
              </Badge>
            );
          })}
        </div>
      </Card>

      {/* ── ReAct Agent ── */}
      <ReActAgent
        title="Identifying alternative suppliers"
        subtitle={`The ReAct agent runs a two-stage retrieval pipeline — Hybrid Search + Voyage Rerank — to find the best alternative suppliers for ${selectedSupplier.supplier_name}.`}
        phases={alternativeSuppliersAgentReasoning || []}
        agentCurrentThought={alternativeSuppliersAgentCurrentThought}
        done={agentDone}
        onViewLogs={() => setLogsOpen(true)}
      />

      <LogDrawer
        show={logsOpen}
        onHide={() => setLogsOpen(false)}
        title="Agent Execution Logs"
        subtitle="Hybrid Search + Voyage Rerank — execution trace"
        phases={alternativeSuppliersAgentReasoning.flatMap(phase => phase.steps)}
      />

      {/* ── Alternatives ── */}
      {agentDone && (
        <>
          <SectionHeader
            title="Recommended Alternative Suppliers"
            subtitle="Pre-qualified alternatives ranked from most to least recommended."
          />

          {alternativeSuppliers.map((alt, idx) => (
            <AlternativeCard
              key={alt.supplier_id}
              supplier={alt}
              isFirst={idx === 0}
              onEscalate={() => setEscalateOpen(true)}
              onDocModelClick={(condition) => setModalCondition(condition)}
            />
          ))}
        </>
      )}

      <BehindTheScenes />

      {/* ── Cert Modal ── */}
      <CertModal />

      {/* ── Escalate Modal ── */}
      <Modal show={escalateOpen} onHide={() => setEscalateOpen(false)} centered>
        <Modal.Header
          closeButton
          style={{ background: palette.green.dark1, borderBottom: "none" }}
        >
          <Subtitle style={{ color: "#fff", margin: 0 }}>
            🎉 Congratulations!
          </Subtitle>
        </Modal.Header>
        <Modal.Body style={{ padding: spacing[500] }}>
          <Body style={{ lineHeight: 1.7, marginBottom: spacing[300] }}>
            You just ensured the{" "}
            <strong>business remains operationally agile</strong> in the face of
            external conditions — identifying alternative suppliers through
            semantic discovery and multimodal search.
          </Body>

          <Body
            weight="medium"
            style={{ display: "block", marginBottom: spacing[100] }}
          >
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
            collection as a new embedded episode, completely closing the
            learning loop.
          </Body>

          <WhyMongoDB>
            Because the system uses <strong>Voyage AI embeddings</strong>, the
            next time a similar external condition strikes the agent will
            retrieve this exact episode via <strong>Vector Search</strong> and
            automatically adjust the{" "}
            <code style={{ fontFamily: "monospace" }}>historical_weight</code>{" "}
            during real-time risk calculations. Every human approval enriches
            the system&apos;s memory.
          </WhyMongoDB>

          <div className="d-flex justify-content-end mt-3">
            <Button variant="primary" onClick={() => setEscalateOpen(false)}>
              Got it 👍
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      <DocModelModal
        show={!!modalCondition}
        onHide={() => setModalCondition(null)}
        title={"my title"}
        docModel={modalCondition}
      />
    </div>
  );
}
