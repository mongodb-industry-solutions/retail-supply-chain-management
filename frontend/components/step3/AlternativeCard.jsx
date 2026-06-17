"use client";

import Accordion from "react-bootstrap/Accordion";
import Card from "@leafygreen-ui/card";
import Button from "@leafygreen-ui/button";
import { Badge } from "@leafygreen-ui/badge";
import { Body, Overline } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import { palette } from "@leafygreen-ui/palette";
import { spacing } from "@leafygreen-ui/tokens";
import SupplierTitle from "../shared/SupplierTitle";

function RRFBar({ textScore, vectorScore }) {
  const total = textScore + vectorScore;
  const textPct = Math.round((textScore / total) * 100);
  const vecPct = 100 - textPct;
  return (
    <div style={{ minWidth: 170 }}>
      <div className="d-flex justify-content-between mb-1">
        <span style={{ fontSize: 10, fontWeight: 600, color: "#0284c7" }}>Text {textPct}%</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: palette.green.dark2 }}>Vector {vecPct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", background: palette.gray.light2 }}>
        <div style={{ width: `${textPct}%`, background: "#0284c7", transition: "width 0.6s ease" }} />
        <div style={{ width: `${vecPct}%`, background: palette.green.dark1, transition: "width 0.6s ease" }} />
      </div>
      <div className="d-flex justify-content-between mt-1">
        <span style={{ fontSize: 10, color: palette.gray.base, fontFamily: "monospace" }}>{textScore.toFixed(4)}</span>
        <span style={{ fontSize: 10, color: palette.gray.base, fontFamily: "monospace" }}>{vectorScore.toFixed(4)}</span>
      </div>
    </div>
  );
}

const EXT_COLOR = {
  PDF: { variant: "red" },
  TXT: { variant: "blue" },
  IMG: { variant: "yellow" },
  PNG: { variant: "yellow" },
  JSON: { variant: "darkgray" },
};

function ExtBadge({ ext }) {
  const cfg = EXT_COLOR[ext] ?? { variant: "lightgray" };
  return <Badge  className="d-flex me-2" variant={cfg.variant}>{ext}</Badge>;
}

function EvidenceHeader({ passed, title, exts }) {
  return (
    <div className="d-flex align-items-center gap-2" style={{  minWidth: 0 }}>
      <Icon
        glyph={passed ? "CheckmarkWithCircle" : "XWithCircle"}
        style={{ color: passed ? palette.green.base : palette.red.base, flexShrink: 0 }}
      />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{title}</span>
      <div className="d-flex me-2">
        {exts.map((ext) => <ExtBadge key={ext} ext={ext} />)}
      </div>
    </div>
  );
}

const STATS = (s) => [
  { label: "Reliability", value: `${s.reliabilityScore}%` },
  { label: "Lead Time",   value: s.leadTime },
  { label: "Capacity",    value: s.capacityMatch },
  { label: "Price",       value: s.priceComparison, good: s.priceComparison.startsWith("-") },
];

export default function AlternativeCard({ supplier, isFirst, onOpenCert, onEscalate }) {
  return (
    <Card className="AlternativeCard" style={{ marginBottom: spacing[400] }}>
      {/* ── Header ── */}
      <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
        <div className="d-flex flex-column">
          <div className="d-flex align-items-center gap-2">
            <SupplierTitle name={supplier.name} />
            {isFirst && <Badge variant="green">Top Match</Badge>}
          </div>
          <Body style={{ fontSize: 12, color: palette.gray.dark1, margin: 0 }}>
            📍 {supplier.location} · {supplier.category}
          </Body>
        </div>

        <div className="d-flex flex-column align-items-end gap-2" style={{ flexShrink: 0 }}>
          <div
            className="d-flex align-items-center gap-1"
            style={{ background: palette.gray.light3, borderRadius: 20, padding: "4px 12px" }}
          >
            <span>⭐</span>
            <code style={{ fontSize: 13, fontWeight: 700 }}>{supplier.rrfScore.toFixed(4)}</code>
          </div>
          <RRFBar textScore={supplier.textScore} vectorScore={supplier.vectorScore} />
        </div>
      </div>

      {/* ── Stats ── */}
      <div
        className="row g-0 mb-3 text-center"
        style={{ background: palette.gray.light3, borderRadius: 10, padding: `${spacing[300]}px 0` }}
      >
        {STATS(supplier).map((stat) => (
          <div key={stat.label} className="col-3">
            <Overline style={{ color: palette.gray.base, display: "block", marginBottom: 2 }}>{stat.label}</Overline>
            <Body weight="medium" style={{ color: stat.good ? palette.green.dark2 : palette.gray.dark3, margin: 0 }}>
              {stat.value}
            </Body>
          </div>
        ))}
      </div>

      {/* ── Why this match ── */}
      <div style={{ marginBottom: spacing[300] }}>
        <Overline style={{ color: palette.gray.dark1, display: "block", marginBottom: spacing[100] }}>
          Instead of manually cross-referencing PDFs, spreadsheets and emails, multimodal search allows users to query unstructured data directly.
        </Overline>
      </div>

      {/* ── Evidence checks ── */}
      <Accordion className="mb-3">
        <Accordion.Item eventKey="0">
          <Accordion.Header>
            <EvidenceHeader passed={true} title="ISO 9001 Certified" exts={["PDF"]} />
          </Accordion.Header>
          <Accordion.Body>
            <Body style={{ fontSize: 12, fontStyle: "italic", color: palette.gray.dark2, marginBottom: spacing[200], lineHeight: 1.6 }}>
              {supplier.cert.chunk}
            </Body>
            <Button
              size="small"
              variant="primaryOutline"
              leftGlyph={<Icon glyph="CurlyBraces" />}
              onClick={() => onOpenCert(supplier.cert)}
            >
              View document model
            </Button>
          </Accordion.Body>
        </Accordion.Item>

        <Accordion.Item eventKey="1">
          <Accordion.Header>
            <EvidenceHeader passed={true} title="Lead time validated" exts={["TXT"]} />
          </Accordion.Header>
          <Accordion.Body>
            <Body style={{ fontSize: 13, color: palette.gray.dark2 }}>
              ...
            </Body>
          </Accordion.Body>
        </Accordion.Item>

        <Accordion.Item eventKey="2">
          <Accordion.Header>
            <EvidenceHeader
              passed={isFirst}
              title={isFirst ? "Sustainability audit passed" : "Sustainability audit pending"}
              exts={["PDF"]}
            />
          </Accordion.Header>
          <Accordion.Body>
            <Body style={{ fontSize: 13, color: palette.gray.dark2 }}>
              {isFirst
                ? "...."
                : "...."}
            </Body>
          </Accordion.Body>
        </Accordion.Item>

        <Accordion.Item eventKey="3">
          <Accordion.Header>
            <EvidenceHeader passed={true} title="Multimodal evidence verified" exts={["PDF", "IMG"]} />
          </Accordion.Header>
          <Accordion.Body>
            <Body style={{ fontSize: 13, color: palette.gray.dark2 }}>
              ...
            </Body>
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>

      {/* ── Footer ── */}
      <div className="d-flex justify-content-end pt-3" style={{ borderTop: `1px solid ${palette.gray.light2}` }}>
        <Button variant="primary" onClick={onEscalate}>
          Escalate
        </Button>
      </div>
    </Card>
  );
}
